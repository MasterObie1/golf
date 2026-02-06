"use server";

import { prisma } from "../db";
import {
  calculateHandicap,
  leagueToHandicapSettings,
  type HandicapSettings,
} from "../handicap";
import { getTeamPreviousScores } from "./teams";

export async function getHandicapSettings(leagueId: number): Promise<HandicapSettings> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
  });

  return leagueToHandicapSettings(league);
}

export async function getTeamHandicap(leagueId: number, teamId: number): Promise<number> {
  const [scores, handicapSettings] = await Promise.all([
    getTeamPreviousScores(leagueId, teamId),
    getHandicapSettings(leagueId),
  ]);
  return calculateHandicap(scores, handicapSettings);
}

export interface HandicapHistoryEntry {
  teamId: number;
  teamName: string;
  weeklyHandicaps: { week: number; handicap: number }[];
  currentHandicap: number;
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
      currentHandicap: 0,
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
      ? Math.floor(allHandicaps.reduce((sum, h) => sum + h, 0) / allHandicaps.length)
      : 0;

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
  const teams = await prisma.team.findMany({
    where: { seasonId, status: "approved" },
    orderBy: { name: "asc" },
  });

  const matchups = await prisma.matchup.findMany({
    where: { seasonId },
    orderBy: { weekNumber: "asc" },
  });

  return buildHandicapHistory(teams, matchups);
}
