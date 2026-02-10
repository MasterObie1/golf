"use server";

import { prisma } from "../db";
import {
  calculateHandicap,
  leagueToHandicapSettings,
  type HandicapSettings,
} from "../handicap";
import { getTeamPreviousScores, getTeamPreviousScoresForScoring } from "./teams";

export async function getHandicapSettings(leagueId: number): Promise<HandicapSettings> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: {
      handicapBaseScore: true,
      handicapMultiplier: true,
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
    },
  });

  return leagueToHandicapSettings(league);
}

export async function getTeamHandicap(leagueId: number, teamId: number, weekNumber?: number, scoringType?: string): Promise<number> {
  const [scores, handicapSettings] = await Promise.all([
    scoringType && scoringType !== "match_play"
      ? getTeamPreviousScoresForScoring(leagueId, teamId, scoringType)
      : getTeamPreviousScores(leagueId, teamId),
    getHandicapSettings(leagueId),
  ]);
  return calculateHandicap(scores, handicapSettings, weekNumber);
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
  teamAHandicap: number;
  teamBHandicap: number;
  teamAIsSub: boolean;
  teamBIsSub: boolean;
};

/**
 * Core logic shared by getHandicapHistory and getHandicapHistoryForSeason.
 * Takes pre-fetched teams and matchups, computes weekly handicap progression.
 */
function buildHandicapHistory(
  teams: TeamForHistory[],
  matchups: MatchupForHistory[]
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
    const allHandicaps: number[] = [];

    for (const week of weekNumbers) {
      const weekMatchup = matchups.find(
        (m) => m.weekNumber === week && (m.teamAId === team.id || m.teamBId === team.id)
      );

      if (weekMatchup) {
        let handicap: number;
        let isSub: boolean;

        if (weekMatchup.teamAId === team.id) {
          handicap = weekMatchup.teamAHandicap;
          isSub = weekMatchup.teamAIsSub;
        } else {
          handicap = weekMatchup.teamBHandicap;
          isSub = weekMatchup.teamBIsSub;
        }

        weeklyHandicaps.push({ week, handicap });

        if (!isSub) {
          allHandicaps.push(handicap);
        }
      }
    }

    const currentHandicap = allHandicaps.length > 0
      ? allHandicaps[allHandicaps.length - 1]
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
  const teams = await prisma.team.findMany({
    where: { leagueId, status: "approved" },
    orderBy: { name: "asc" },
  });

  const matchups = await prisma.matchup.findMany({
    where: { leagueId },
    orderBy: { weekNumber: "asc" },
  });

  return buildHandicapHistory(teams, matchups);
}

export async function getHandicapHistoryForSeason(seasonId: number): Promise<HandicapHistoryEntry[]> {
  // Determine scoring type from the season's league
  const season = await prisma.season.findUniqueOrThrow({
    where: { id: seasonId },
    select: { leagueId: true },
  });
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: season.leagueId },
    select: { scoringType: true },
  });

  const teams = await prisma.team.findMany({
    where: { seasonId, status: "approved" },
    orderBy: { name: "asc" },
  });

  if (league.scoringType === "stroke_play") {
    return buildHandicapHistoryFromWeeklyScores(teams, { seasonId });
  }

  if (league.scoringType === "hybrid") {
    // Use both sources, preferring weekly scores for handicap data
    const matchupHistory = await buildHandicapHistoryFromMatchups(teams, { seasonId });
    const weeklyHistory = await buildHandicapHistoryFromWeeklyScores(teams, { seasonId });

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
  return buildHandicapHistoryFromMatchups(teams, { seasonId });
}

async function buildHandicapHistoryFromMatchups(
  teams: TeamForHistory[],
  where: { seasonId?: number; leagueId?: number }
): Promise<HandicapHistoryEntry[]> {
  const matchups = await prisma.matchup.findMany({
    where,
    orderBy: { weekNumber: "asc" },
  });
  return buildHandicapHistory(teams, matchups);
}

async function buildHandicapHistoryFromWeeklyScores(
  teams: TeamForHistory[],
  where: { seasonId?: number; leagueId?: number }
): Promise<HandicapHistoryEntry[]> {
  const weeklyScores = await prisma.weeklyScore.findMany({
    where,
    orderBy: { weekNumber: "asc" },
    select: {
      teamId: true,
      weekNumber: true,
      handicap: true,
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
    const allHandicaps: number[] = [];

    for (const week of weekNumbers) {
      const score = weeklyScores.find(
        (s) => s.weekNumber === week && s.teamId === team.id && !s.isDnp
      );

      if (score) {
        weeklyHandicaps.push({ week, handicap: score.handicap });
        if (!score.isSub) {
          allHandicaps.push(score.handicap);
        }
      }
    }

    const currentHandicap = allHandicaps.length > 0
      ? allHandicaps[allHandicaps.length - 1]
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
