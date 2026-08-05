"use server";

import { prisma } from "../db";
import {
  calculateHandicapFromEntries,
  leagueToHandicapSettings,
  type HandicapSettings,
  type WeeklyGrossEntry,
} from "../handicap";
import { getTeamPreviousScoreEntries, getTeamPreviousScoreEntriesForScoring } from "./teams";

export async function getHandicapSettings(leagueId: number): Promise<HandicapSettings> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: {
      handicapBaseScore: true,
      handicapMultiplier: true,
      handicapUnderParMultiplier: true,
      handicapUnderParCap: true,
      handicapRounding: true,
      handicapDefault: true,
      handicapMax: true,
      handicapMin: true,
      handicapScoreSelection: true,
      handicapScoreCount: true,
      handicapBestOf: true,
      handicapLastOf: true,
      handicapDropHighest: true,
      handicapDropLowest: true,
      handicapUseWeighting: true,
      handicapWeightRecent: true,
      handicapWeightDecay: true,
      handicapCapExceptional: true,
      handicapExceptionalCap: true,
      handicapProvWeeks: true,
      handicapProvMultiplier: true,
      handicapFreezeWeek: true,
      handicapUseTrend: true,
      handicapTrendWeight: true,
      handicapRequireApproval: true,
      handicapPerRound: true,
      handicapSubMultiplier: true,
      handicapPreserveRecorded: true,
    },
  });

  return leagueToHandicapSettings(league);
}

export async function getTeamHandicap(leagueId: number, teamId: number, weekNumber?: number, scoringType?: string): Promise<number> {
  const [scores, handicapSettings] = await Promise.all([
    scoringType && scoringType !== "match_play"
      ? getTeamPreviousScoreEntriesForScoring(leagueId, teamId, scoringType, weekNumber)
      : getTeamPreviousScoreEntries(leagueId, teamId, weekNumber),
    getHandicapSettings(leagueId),
  ]);
  return calculateHandicapFromEntries(scores, handicapSettings, weekNumber);
}

export interface HandicapHistoryEntry {
  teamId: number;
  teamName: string;
  weeklyHandicaps: { week: number; handicap: number }[];
  currentHandicap: number | null;
}

type TeamForHistory = { id: number; name: string };
type MatchupForHistory = {
  weekNumber: number;
  teamAId: number;
  teamBId: number;
  teamAGross: number;
  teamBGross: number;
  teamAHandicap: number;
  teamBHandicap: number;
  teamAIsSub: boolean;
  teamBIsSub: boolean;
  isForfeit: boolean;
};

/**
 * Core logic shared by getHandicapHistory and getHandicapHistoryForSeason.
 * Takes pre-fetched teams and matchups, computes weekly handicap progression.
 */
function buildHandicapHistory(
  teams: TeamForHistory[],
  matchups: MatchupForHistory[],
  settings: HandicapSettings
): HandicapHistoryEntry[] {
  if (matchups.length === 0) {
    return teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      weeklyHandicaps: [],
      currentHandicap: null,
    }));
  }

  const weekNumbers = [...new Set(matchups.map((m) => m.weekNumber))].sort((a, b) => a - b);

  const result: HandicapHistoryEntry[] = [];

  for (const team of teams) {
    const weeklyHandicaps: { week: number; handicap: number }[] = [];
    const grossEntries: WeeklyGrossEntry[] = [];

    for (const week of weekNumbers) {
      const weekMatchup = matchups.find(
        (m) => m.weekNumber === week && (m.teamAId === team.id || m.teamBId === team.id)
      );

      if (weekMatchup) {
        // Skip forfeits — gross scores of 0 would corrupt handicap calculations
        if (weekMatchup.isForfeit) continue;

        let gross: number;
        let isSub: boolean;
        let recordedHandicap: number;

        if (weekMatchup.teamAId === team.id) {
          gross = weekMatchup.teamAGross;
          isSub = weekMatchup.teamAIsSub;
          recordedHandicap = weekMatchup.teamAHandicap;
        } else {
          gross = weekMatchup.teamBGross;
          isSub = weekMatchup.teamBIsSub;
          recordedHandicap = weekMatchup.teamBHandicap;
        }

        // Skip sub weeks — sub handicaps are manually entered, not recalculated
        if (!isSub) {
          // Record the handicap the team actually played with that week
          weeklyHandicaps.push({ week, handicap: recordedHandicap });
          grossEntries.push({ week, gross });
        }
      }
    }

    // Current handicap: what they'd have for the next upcoming week
    const nextWeek = weekNumbers[weekNumbers.length - 1] + 1;
    const currentHandicap = grossEntries.length > 0
      ? calculateHandicapFromEntries(grossEntries, settings, nextWeek)
      : null;

    result.push({
      teamId: team.id,
      teamName: team.name,
      weeklyHandicaps,
      currentHandicap,
    });
  }

  return result;
}

export async function getHandicapHistory(leagueId: number): Promise<HandicapHistoryEntry[]> {
  const [teams, matchups, settings] = await Promise.all([
    prisma.team.findMany({
      where: { leagueId, status: "approved" },
      orderBy: { name: "asc" },
    }),
    prisma.matchup.findMany({
      where: { leagueId },
      orderBy: { weekNumber: "asc" },
      select: {
        weekNumber: true, teamAId: true, teamBId: true,
        teamAGross: true, teamBGross: true,
        teamAHandicap: true, teamBHandicap: true,
        teamAIsSub: true, teamBIsSub: true,
        isForfeit: true,
      },
    }),
    getHandicapSettings(leagueId),
  ]);

  return buildHandicapHistory(teams, matchups, settings);
}

export async function getHandicapHistoryForSeason(seasonId: number): Promise<HandicapHistoryEntry[]> {
  // Determine scoring type from the season's league
  const season = await prisma.season.findUniqueOrThrow({
    where: { id: seasonId },
    select: { leagueId: true },
  });
  const [league, settings] = await Promise.all([
    prisma.league.findUniqueOrThrow({
      where: { id: season.leagueId },
      select: { scoringType: true },
    }),
    getHandicapSettings(season.leagueId),
  ]);

  const teams = await prisma.team.findMany({
    where: { seasonId, status: "approved" },
    orderBy: { name: "asc" },
  });

  if (league.scoringType === "stroke_play") {
    return buildHandicapHistoryFromWeeklyScores(teams, { seasonId }, settings);
  }

  if (league.scoringType === "hybrid") {
    // Use both sources, preferring weekly scores for handicap data
    const matchupHistory = await buildHandicapHistoryFromMatchups(teams, { seasonId }, settings);
    const weeklyHistory = await buildHandicapHistoryFromWeeklyScores(teams, { seasonId }, settings);

    // Merge: use weekly score handicaps where available, fall back to matchup handicaps
    return teams.map((team) => {
      const fromMatchups = matchupHistory.find((h) => h.teamId === team.id);
      const fromWeekly = weeklyHistory.find((h) => h.teamId === team.id);

      // Combine weekly handicap entries from both sources
      const weekMap = new Map<number, number>();
      for (const entry of fromMatchups?.weeklyHandicaps || []) {
        weekMap.set(entry.week, entry.handicap);
      }
      for (const entry of fromWeekly?.weeklyHandicaps || []) {
        weekMap.set(entry.week, entry.handicap); // weekly scores override
      }

      const weeklyHandicaps = [...weekMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([week, handicap]) => ({ week, handicap }));

      return {
        teamId: team.id,
        teamName: team.name,
        weeklyHandicaps,
        currentHandicap: fromWeekly?.currentHandicap ?? fromMatchups?.currentHandicap ?? null,
      };
    });
  }

  // Match play
  return buildHandicapHistoryFromMatchups(teams, { seasonId }, settings);
}

async function buildHandicapHistoryFromMatchups(
  teams: TeamForHistory[],
  where: { seasonId?: number; leagueId?: number },
  settings: HandicapSettings
): Promise<HandicapHistoryEntry[]> {
  const matchups = await prisma.matchup.findMany({
    where,
    orderBy: { weekNumber: "asc" },
    select: {
      weekNumber: true, teamAId: true, teamBId: true,
      teamAGross: true, teamBGross: true,
      teamAHandicap: true, teamBHandicap: true,
      teamAIsSub: true, teamBIsSub: true,
      isForfeit: true,
    },
  });
  return buildHandicapHistory(teams, matchups, settings);
}

async function buildHandicapHistoryFromWeeklyScores(
  teams: TeamForHistory[],
  where: { seasonId?: number; leagueId?: number },
  settings: HandicapSettings
): Promise<HandicapHistoryEntry[]> {
  const weeklyScores = await prisma.weeklyScore.findMany({
    where,
    orderBy: { weekNumber: "asc" },
    select: {
      teamId: true,
      weekNumber: true,
      handicap: true,
      grossScore: true,
      isSub: true,
      isDnp: true,
    },
  });

  if (weeklyScores.length === 0) {
    return teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      weeklyHandicaps: [],
      currentHandicap: null,
    }));
  }

  const weekNumbers = [...new Set(weeklyScores.map((s) => s.weekNumber))].sort((a, b) => a - b);

  const result: HandicapHistoryEntry[] = [];

  for (const team of teams) {
    const weeklyHandicaps: { week: number; handicap: number }[] = [];
    const grossEntries: WeeklyGrossEntry[] = [];

    for (const week of weekNumbers) {
      const score = weeklyScores.find(
        (s) => s.weekNumber === week && s.teamId === team.id && !s.isDnp
      );

      if (score && !score.isSub) {
        // Record the handicap the team actually played with that week
        weeklyHandicaps.push({ week, handicap: score.handicap });
        grossEntries.push({ week, gross: score.grossScore });
      }
    }

    const nextWeek = weekNumbers[weekNumbers.length - 1] + 1;
    const currentHandicap = grossEntries.length > 0
      ? calculateHandicapFromEntries(grossEntries, settings, nextWeek)
      : null;

    result.push({
      teamId: team.id,
      teamName: team.name,
      weeklyHandicaps,
      currentHandicap,
    });
  }

  return result;
}
