"use server";

import { prisma } from "../db";

// Shared type for the team objects coming from Prisma
type TeamWithStats = {
  id: number;
  name: string;
  totalPoints: number;
  wins: number;
  losses: number;
  ties: number;
  [key: string]: unknown;
};

type MatchupForRanking = {
  teamAId: number;
  teamBId: number;
  teamAPoints: number;
  teamBPoints: number;
  teamANet: number;
  teamBNet: number;
  teamAHandicap: number;
  teamBHandicap: number;
  teamAIsSub: boolean;
  teamBIsSub: boolean;
};

/**
 * Core ranking logic shared by getLeaderboard and getSeasonLeaderboard.
 * Takes pre-fetched teams and matchups, computes handicaps, tiebreakers,
 * and returns the sorted leaderboard.
 */
function rankTeams<T extends TeamWithStats>(teams: T[], matchups: MatchupForRanking[]) {
  // Calculate average handicap
  const handicaps: Record<number, number> = {};
  for (const team of teams) {
    const teamHandicaps: number[] = [];
    for (const m of matchups) {
      if (m.teamAId === team.id && !m.teamAIsSub) {
        teamHandicaps.push(m.teamAHandicap);
      } else if (m.teamBId === team.id && !m.teamBIsSub) {
        teamHandicaps.push(m.teamBHandicap);
      }
    }

    if (teamHandicaps.length === 0) {
      handicaps[team.id] = 0;
    } else {
      const avgHandicap = teamHandicaps.reduce((sum, h) => sum + h, 0) / teamHandicaps.length;
      handicaps[team.id] = Math.floor(avgHandicap);
    }
  }

  // Calculate net differential
  const netDifferential: Record<number, number> = {};
  for (const team of teams) {
    netDifferential[team.id] = 0;
  }

  for (const m of matchups) {
    netDifferential[m.teamAId] += m.teamBNet - m.teamANet;
    netDifferential[m.teamBId] += m.teamANet - m.teamBNet;
  }

  // Build head-to-head record
  const headToHead: Record<number, Record<number, number>> = {};
  for (const team of teams) {
    headToHead[team.id] = {};
  }

  for (const m of matchups) {
    headToHead[m.teamAId][m.teamBId] = (headToHead[m.teamAId][m.teamBId] || 0) + m.teamAPoints;
    headToHead[m.teamBId][m.teamAId] = (headToHead[m.teamBId][m.teamAId] || 0) + m.teamBPoints;
  }

  // Sort teams
  const sortedTeams = [...teams].sort((a, b) => {
    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
    if (a.wins !== b.wins) return b.wins - a.wins;

    const aVsB = headToHead[a.id]?.[b.id] || 0;
    const bVsA = headToHead[b.id]?.[a.id] || 0;
    if (aVsB !== 0 || bVsA !== 0) {
      if (aVsB !== bVsA) return aVsB - bVsA;
    }

    const aDiff = netDifferential[a.id] || 0;
    const bDiff = netDifferential[b.id] || 0;
    return bDiff - aDiff;
  });

  return sortedTeams.map((team) => ({
    ...team,
    handicap: handicaps[team.id],
  }));
}

export async function getLeaderboard(leagueId: number) {
  const teams = await prisma.team.findMany({
    where: { leagueId, status: "approved" },
  });

  const matchups = await prisma.matchup.findMany({
    where: { leagueId },
  });

  return rankTeams(teams, matchups);
}

// Helper function to calculate standings at a specific week
function calculateStandingsAtWeek(
  teams: { id: number; name: string }[],
  matchups: (MatchupForRanking & { weekNumber: number })[],
  upToWeek: number
) {
  const filteredMatchups = matchups.filter((m) => m.weekNumber <= upToWeek);

  // Calculate stats from matchups
  const stats: Record<number, { points: number; wins: number; losses: number; ties: number }> = {};
  const handicaps: Record<number, number[]> = {};
  const netDifferential: Record<number, number> = {};
  const headToHead: Record<number, Record<number, number>> = {};

  for (const team of teams) {
    stats[team.id] = { points: 0, wins: 0, losses: 0, ties: 0 };
    handicaps[team.id] = [];
    netDifferential[team.id] = 0;
    headToHead[team.id] = {};
  }

  for (const m of filteredMatchups) {
    // Points
    if (stats[m.teamAId]) stats[m.teamAId].points += m.teamAPoints;
    if (stats[m.teamBId]) stats[m.teamBId].points += m.teamBPoints;

    // Wins/Losses/Ties
    if (m.teamAPoints > m.teamBPoints) {
      if (stats[m.teamAId]) stats[m.teamAId].wins += 1;
      if (stats[m.teamBId]) stats[m.teamBId].losses += 1;
    } else if (m.teamBPoints > m.teamAPoints) {
      if (stats[m.teamBId]) stats[m.teamBId].wins += 1;
      if (stats[m.teamAId]) stats[m.teamAId].losses += 1;
    } else {
      if (stats[m.teamAId]) stats[m.teamAId].ties += 1;
      if (stats[m.teamBId]) stats[m.teamBId].ties += 1;
    }

    // Handicaps (non-sub only)
    if (!m.teamAIsSub && handicaps[m.teamAId]) {
      handicaps[m.teamAId].push(m.teamAHandicap);
    }
    if (!m.teamBIsSub && handicaps[m.teamBId]) {
      handicaps[m.teamBId].push(m.teamBHandicap);
    }

    // Net differential
    if (netDifferential[m.teamAId] !== undefined) {
      netDifferential[m.teamAId] += m.teamBNet - m.teamANet;
    }
    if (netDifferential[m.teamBId] !== undefined) {
      netDifferential[m.teamBId] += m.teamANet - m.teamBNet;
    }

    // Head-to-head
    if (headToHead[m.teamAId]) {
      headToHead[m.teamAId][m.teamBId] = (headToHead[m.teamAId][m.teamBId] || 0) + m.teamAPoints;
    }
    if (headToHead[m.teamBId]) {
      headToHead[m.teamBId][m.teamAId] = (headToHead[m.teamBId][m.teamAId] || 0) + m.teamBPoints;
    }
  }

  // Calculate average handicap for each team
  const avgHandicaps: Record<number, number> = {};
  for (const team of teams) {
    const hcps = handicaps[team.id];
    if (hcps.length === 0) {
      avgHandicaps[team.id] = 0;
    } else {
      avgHandicaps[team.id] = Math.floor(hcps.reduce((sum, h) => sum + h, 0) / hcps.length);
    }
  }

  // Sort teams using same logic as getLeaderboard
  const sortedTeams = [...teams].sort((a, b) => {
    const aStats = stats[a.id] || { points: 0, wins: 0 };
    const bStats = stats[b.id] || { points: 0, wins: 0 };

    if (aStats.points !== bStats.points) return bStats.points - aStats.points;
    if (aStats.wins !== bStats.wins) return bStats.wins - aStats.wins;

    const aVsB = headToHead[a.id]?.[b.id] || 0;
    const bVsA = headToHead[b.id]?.[a.id] || 0;
    if (aVsB !== 0 || bVsA !== 0) {
      if (aVsB !== bVsA) return aVsB - bVsA;
    }

    const aDiff = netDifferential[a.id] || 0;
    const bDiff = netDifferential[b.id] || 0;
    return bDiff - aDiff;
  });

  // Return rankings with handicaps
  return sortedTeams.map((team, index) => ({
    teamId: team.id,
    teamName: team.name,
    rank: index + 1,
    handicap: avgHandicaps[team.id],
    ...stats[team.id],
  }));
}

export interface LeaderboardWithMovement {
  id: number;
  name: string;
  totalPoints: number;
  wins: number;
  losses: number;
  ties: number;
  handicap: number;
  rankChange: number | null; // positive = moved up, negative = moved down, null = new/no previous
  handicapChange: number | null; // positive = handicap went up, negative = went down
  previousRank: number | null;
  previousHandicap: number | null;
}

export async function getLeaderboardWithMovement(leagueId: number): Promise<LeaderboardWithMovement[]> {
  const teams = await prisma.team.findMany({
    where: { leagueId, status: "approved" },
  });

  const matchups = await prisma.matchup.findMany({
    where: { leagueId },
  });

  if (matchups.length === 0) {
    // No matchups yet, return teams with no movement data
    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      totalPoints: team.totalPoints,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      handicap: 0,
      rankChange: null,
      handicapChange: null,
      previousRank: null,
      previousHandicap: null,
    }));
  }

  // Find current and previous week numbers
  const weekNumbers = [...new Set(matchups.map((m) => m.weekNumber))].sort((a, b) => b - a);
  const currentWeek = weekNumbers[0];
  const previousWeek = weekNumbers.length > 1 ? weekNumbers[1] : null;

  // Get current standings
  const currentStandings = calculateStandingsAtWeek(
    teams.map((t) => ({ id: t.id, name: t.name })),
    matchups,
    currentWeek
  );

  // Get previous standings if there was a previous week
  let previousStandings: ReturnType<typeof calculateStandingsAtWeek> | null = null;
  if (previousWeek !== null) {
    previousStandings = calculateStandingsAtWeek(
      teams.map((t) => ({ id: t.id, name: t.name })),
      matchups,
      previousWeek
    );
  }

  // Build lookup for previous data
  const previousData: Record<number, { rank: number; handicap: number }> = {};
  if (previousStandings) {
    for (const standing of previousStandings) {
      previousData[standing.teamId] = {
        rank: standing.rank,
        handicap: standing.handicap,
      };
    }
  }

  // Combine current standings with movement data
  return currentStandings.map((standing) => {
    const prev = previousData[standing.teamId];
    const team = teams.find((t) => t.id === standing.teamId)!;

    // Check if team played in current week (to determine if they're "new" this week)
    const playedPreviousWeek = previousWeek !== null && matchups.some(
      (m) => m.weekNumber === previousWeek && (m.teamAId === standing.teamId || m.teamBId === standing.teamId)
    );

    let rankChange: number | null = null;
    let handicapChange: number | null = null;

    if (prev && playedPreviousWeek) {
      // Had previous data, calculate changes
      rankChange = prev.rank - standing.rank; // positive = moved up
      handicapChange = standing.handicap - prev.handicap; // positive = handicap increased
    }

    return {
      id: team.id,
      name: team.name,
      totalPoints: team.totalPoints,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      handicap: standing.handicap,
      rankChange,
      handicapChange,
      previousRank: prev?.rank ?? null,
      previousHandicap: prev?.handicap ?? null,
    };
  });
}

export async function getSeasonLeaderboard(seasonId: number) {
  const teams = await prisma.team.findMany({
    where: { seasonId, status: "approved" },
  });

  const matchups = await prisma.matchup.findMany({
    where: { seasonId },
  });

  return rankTeams(teams, matchups);
}

export async function getAllTimeLeaderboard(leagueId: number) {
  // Get all teams across all seasons
  const teams = await prisma.team.findMany({
    where: { leagueId, status: "approved" },
  });

  // Aggregate stats by team name (same team across seasons)
  const teamStats: Record<string, {
    name: string;
    totalPoints: number;
    wins: number;
    losses: number;
    ties: number;
    matchCount: number;
  }> = {};

  for (const team of teams) {
    if (!teamStats[team.name]) {
      teamStats[team.name] = {
        name: team.name,
        totalPoints: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        matchCount: 0,
      };
    }
    teamStats[team.name].totalPoints += team.totalPoints;
    teamStats[team.name].wins += team.wins;
    teamStats[team.name].losses += team.losses;
    teamStats[team.name].ties += team.ties;
    teamStats[team.name].matchCount += team.wins + team.losses + team.ties;
  }

  // Convert to array and sort
  const allTimeStats = Object.values(teamStats).sort((a, b) => {
    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
    if (a.wins !== b.wins) return b.wins - a.wins;
    return 0;
  });

  return allTimeStats;
}
