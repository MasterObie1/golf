"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { calculateHandicap, calculateNetScore, suggestPoints, type HandicapSettings } from "./handicap";
import { requireAdmin, requireLeagueAdmin, getAdminSession } from "./auth";

// ==========================================
// LEAGUE MANAGEMENT
// ==========================================

/**
 * Generate a URL-friendly slug from a league name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Create a new league with admin credentials
 */
export async function createLeague(
  name: string,
  adminPassword: string = "pass@word1"
) {
  // Validate name
  if (!name || name.trim().length < 3) {
    throw new Error("League name must be at least 3 characters");
  }

  const trimmedName = name.trim();
  const slug = generateSlug(trimmedName);

  // Check if slug already exists
  const existing = await prisma.league.findUnique({
    where: { slug },
  });
  if (existing) {
    throw new Error(`A league with a similar name already exists`);
  }

  // Generate admin username: admin@LeagueName (no spaces)
  const adminUsername = `admin@${trimmedName.replace(/\s+/g, "")}`;

  // Hash the password
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  // Create the league
  return prisma.league.create({
    data: {
      name: trimmedName,
      slug,
      adminUsername,
      adminPassword: hashedPassword,
    },
  });
}

/**
 * Search for leagues by name
 */
export async function searchLeagues(query: string) {
  if (!query || query.trim().length < 2) {
    return [];
  }

  return prisma.league.findMany({
    where: {
      name: {
        contains: query.trim(),
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      courseName: true,
      courseLocation: true,
      playDay: true,
    },
    take: 20,
  });
}

/**
 * Get all leagues (for browse page)
 */
export async function getAllLeagues() {
  return prisma.league.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      courseName: true,
      courseLocation: true,
      playDay: true,
      _count: {
        select: { teams: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Get a league by slug
 */
export async function getLeagueBySlug(slug: string) {
  return prisma.league.findUnique({
    where: { slug },
  });
}

/**
 * Get league public info (for league home page)
 */
export async function getLeaguePublicInfo(slug: string) {
  const league = await prisma.league.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      registrationOpen: true,
      maxTeams: true,
      startDate: true,
      endDate: true,
      numberOfWeeks: true,
      courseName: true,
      courseLocation: true,
      playDay: true,
      playTime: true,
      entryFee: true,
      prizeInfo: true,
      description: true,
      contactEmail: true,
      contactPhone: true,
      _count: {
        select: { teams: { where: { status: "approved" } } },
      },
    },
  });

  if (!league) {
    throw new Error("League not found");
  }

  return league;
}

// ==========================================
// TEAM MANAGEMENT (League-scoped)
// ==========================================

export async function getTeams(leagueId: number) {
  return prisma.team.findMany({
    where: { leagueId, status: "approved" },
    orderBy: { name: "asc" },
  });
}

export async function createTeam(leagueId: number, name: string) {
  const session = await requireAdmin();
  if (session.leagueId !== leagueId) {
    throw new Error("Unauthorized: Cannot create team in another league");
  }

  const existing = await prisma.team.findUnique({
    where: { leagueId_name: { leagueId, name } },
  });
  if (existing) {
    throw new Error(`Team "${name}" already exists in this league`);
  }

  return prisma.team.create({
    data: { name, leagueId },
  });
}

export async function getTeamPreviousScores(leagueId: number, teamId: number): Promise<number[]> {
  const matchups = await prisma.matchup.findMany({
    where: {
      leagueId,
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
    orderBy: { weekNumber: "asc" },
  });

  return matchups
    .filter((m) => {
      if (m.teamAId === teamId) return !m.teamAIsSub;
      return !m.teamBIsSub;
    })
    .map((m) => (m.teamAId === teamId ? m.teamAGross : m.teamBGross));
}

export async function getCurrentWeekNumber(leagueId: number): Promise<number> {
  const lastMatchup = await prisma.matchup.findFirst({
    where: { leagueId },
    orderBy: { weekNumber: "desc" },
  });
  return lastMatchup ? lastMatchup.weekNumber + 1 : 1;
}

// ==========================================
// HANDICAP SETTINGS (League-scoped)
// ==========================================

export async function getHandicapSettings(leagueId: number): Promise<HandicapSettings> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
  });

  return {
    baseScore: league.handicapBaseScore,
    multiplier: league.handicapMultiplier,
    rounding: league.handicapRounding as "floor" | "round" | "ceil",
    defaultHandicap: league.handicapDefault,
    maxHandicap: league.handicapMax,
  };
}

export async function getTeamHandicap(leagueId: number, teamId: number): Promise<number> {
  const [scores, handicapSettings] = await Promise.all([
    getTeamPreviousScores(leagueId, teamId),
    getHandicapSettings(leagueId),
  ]);
  return calculateHandicap(scores, handicapSettings);
}

// ==========================================
// MATCHUP MANAGEMENT (League-scoped)
// ==========================================

export interface MatchupPreview {
  weekNumber: number;
  teamAId: number;
  teamAName: string;
  teamAGross: number;
  teamAHandicap: number;
  teamANet: number;
  teamAPoints: number;
  teamAIsSub: boolean;
  teamBId: number;
  teamBName: string;
  teamBGross: number;
  teamBHandicap: number;
  teamBNet: number;
  teamBPoints: number;
  teamBIsSub: boolean;
  isWeekOne: boolean;
}

export async function previewMatchup(
  leagueId: number,
  weekNumber: number,
  teamAId: number,
  teamAGross: number,
  teamAHandicapManual: number | null,
  teamAIsSub: boolean,
  teamBId: number,
  teamBGross: number,
  teamBHandicapManual: number | null,
  teamBIsSub: boolean
): Promise<MatchupPreview> {
  // Check if either team already played this week
  const existingMatchups = await prisma.matchup.findMany({
    where: {
      leagueId,
      weekNumber,
      OR: [
        { teamAId: teamAId },
        { teamBId: teamAId },
        { teamAId: teamBId },
        { teamBId: teamBId },
      ],
    },
    include: { teamA: true, teamB: true },
  });

  if (existingMatchups.length > 0) {
    const teamsAlreadyPlayed: string[] = [];
    for (const m of existingMatchups) {
      if (m.teamAId === teamAId || m.teamBId === teamAId) {
        const team = await prisma.team.findUnique({ where: { id: teamAId } });
        if (team && !teamsAlreadyPlayed.includes(team.name)) {
          teamsAlreadyPlayed.push(team.name);
        }
      }
      if (m.teamAId === teamBId || m.teamBId === teamBId) {
        const team = await prisma.team.findUnique({ where: { id: teamBId } });
        if (team && !teamsAlreadyPlayed.includes(team.name)) {
          teamsAlreadyPlayed.push(team.name);
        }
      }
    }
    if (teamsAlreadyPlayed.length > 0) {
      throw new Error(`Team(s) already played in Week ${weekNumber}: ${teamsAlreadyPlayed.join(", ")}`);
    }
  }

  const [teamA, teamB, handicapSettings] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: teamAId } }),
    prisma.team.findUniqueOrThrow({ where: { id: teamBId } }),
    getHandicapSettings(leagueId),
  ]);

  const isWeekOne = weekNumber === 1;

  let teamAHandicap: number;
  let teamBHandicap: number;

  if (isWeekOne) {
    teamAHandicap = teamAHandicapManual ?? handicapSettings.defaultHandicap;
    teamBHandicap = teamBHandicapManual ?? handicapSettings.defaultHandicap;
  } else {
    if (teamAIsSub && teamAHandicapManual !== null) {
      teamAHandicap = teamAHandicapManual;
    } else {
      const teamAScores = await getTeamPreviousScores(leagueId, teamAId);
      teamAHandicap = calculateHandicap(teamAScores, handicapSettings);
    }

    if (teamBIsSub && teamBHandicapManual !== null) {
      teamBHandicap = teamBHandicapManual;
    } else {
      const teamBScores = await getTeamPreviousScores(leagueId, teamBId);
      teamBHandicap = calculateHandicap(teamBScores, handicapSettings);
    }
  }

  const teamANet = calculateNetScore(teamAGross, teamAHandicap);
  const teamBNet = calculateNetScore(teamBGross, teamBHandicap);
  const { teamAPoints, teamBPoints } = suggestPoints(teamANet, teamBNet);

  return {
    weekNumber,
    teamAId,
    teamAName: teamA.name,
    teamAGross,
    teamAHandicap,
    teamANet,
    teamAPoints,
    teamAIsSub,
    teamBId,
    teamBName: teamB.name,
    teamBGross,
    teamBHandicap,
    teamBNet,
    teamBPoints,
    teamBIsSub,
    isWeekOne,
  };
}

export async function submitMatchup(
  leagueSlug: string,
  weekNumber: number,
  teamAId: number,
  teamAGross: number,
  teamAHandicap: number,
  teamANet: number,
  teamAPoints: number,
  teamAIsSub: boolean,
  teamBId: number,
  teamBGross: number,
  teamBHandicap: number,
  teamBNet: number,
  teamBPoints: number,
  teamBIsSub: boolean
) {
  const session = await requireLeagueAdmin(leagueSlug);

  const matchup = await prisma.matchup.create({
    data: {
      leagueId: session.leagueId,
      weekNumber,
      teamAId,
      teamAGross,
      teamAHandicap,
      teamANet,
      teamAPoints,
      teamAIsSub,
      teamBId,
      teamBGross,
      teamBHandicap,
      teamBNet,
      teamBPoints,
      teamBIsSub,
    },
  });

  // Update team stats
  let teamAWin = 0, teamALoss = 0, teamATie = 0;
  let teamBWin = 0, teamBLoss = 0, teamBTie = 0;

  if (teamAPoints > teamBPoints) {
    teamAWin = 1;
    teamBLoss = 1;
  } else if (teamBPoints > teamAPoints) {
    teamBWin = 1;
    teamALoss = 1;
  } else {
    teamATie = 1;
    teamBTie = 1;
  }

  await Promise.all([
    prisma.team.update({
      where: { id: teamAId },
      data: {
        totalPoints: { increment: teamAPoints },
        wins: { increment: teamAWin },
        losses: { increment: teamALoss },
        ties: { increment: teamATie },
      },
    }),
    prisma.team.update({
      where: { id: teamBId },
      data: {
        totalPoints: { increment: teamBPoints },
        wins: { increment: teamBWin },
        losses: { increment: teamBLoss },
        ties: { increment: teamBTie },
      },
    }),
  ]);

  return matchup;
}

export async function getLeaderboard(leagueId: number) {
  const teams = await prisma.team.findMany({
    where: { leagueId, status: "approved" },
  });

  const matchups = await prisma.matchup.findMany({
    where: { leagueId },
  });

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
      if (aVsB !== bVsA) return bVsA - aVsB;
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

export async function getMatchupHistory(leagueId: number) {
  return prisma.matchup.findMany({
    where: { leagueId },
    include: {
      teamA: true,
      teamB: true,
    },
    orderBy: [{ weekNumber: "desc" }, { playedAt: "desc" }],
  });
}

export async function getTeamMatchupHistory(leagueId: number, teamId: number) {
  return prisma.matchup.findMany({
    where: {
      leagueId,
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
    include: {
      teamA: true,
      teamB: true,
    },
    orderBy: [{ weekNumber: "desc" }, { playedAt: "desc" }],
  });
}

export async function getTeamById(teamId: number) {
  return prisma.team.findUnique({
    where: { id: teamId },
    include: { league: true },
  });
}

// Helper function to calculate standings at a specific week
function calculateStandingsAtWeek(
  teams: { id: number; name: string }[],
  matchups: {
    weekNumber: number;
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
  }[],
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
      if (aVsB !== bVsA) return bVsA - aVsB;
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
    const playedCurrentWeek = matchups.some(
      (m) => m.weekNumber === currentWeek && (m.teamAId === standing.teamId || m.teamBId === standing.teamId)
    );
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

export interface HandicapHistoryEntry {
  teamId: number;
  teamName: string;
  weeklyHandicaps: { week: number; handicap: number }[];
  currentHandicap: number;
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
      // Get handicap for this team in this week
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

export async function deleteMatchup(leagueSlug: string, matchupId: number) {
  const session = await requireLeagueAdmin(leagueSlug);

  const matchup = await prisma.matchup.findUniqueOrThrow({
    where: { id: matchupId },
  });

  // Verify matchup belongs to this league
  if (matchup.leagueId !== session.leagueId) {
    throw new Error("Unauthorized: Matchup does not belong to this league");
  }

  // Determine stats to reverse
  let teamAWin = 0, teamALoss = 0, teamATie = 0;
  let teamBWin = 0, teamBLoss = 0, teamBTie = 0;

  if (matchup.teamAPoints > matchup.teamBPoints) {
    teamAWin = 1;
    teamBLoss = 1;
  } else if (matchup.teamBPoints > matchup.teamAPoints) {
    teamBWin = 1;
    teamALoss = 1;
  } else {
    teamATie = 1;
    teamBTie = 1;
  }

  await prisma.$transaction([
    prisma.team.update({
      where: { id: matchup.teamAId },
      data: {
        totalPoints: { decrement: matchup.teamAPoints },
        wins: { decrement: teamAWin },
        losses: { decrement: teamALoss },
        ties: { decrement: teamATie },
      },
    }),
    prisma.team.update({
      where: { id: matchup.teamBId },
      data: {
        totalPoints: { decrement: matchup.teamBPoints },
        wins: { decrement: teamBWin },
        losses: { decrement: teamBLoss },
        ties: { decrement: teamBTie },
      },
    }),
    prisma.matchup.delete({
      where: { id: matchupId },
    }),
  ]);

  return { success: true };
}

export async function submitForfeit(
  leagueSlug: string,
  weekNumber: number,
  winningTeamId: number,
  forfeitingTeamId: number
) {
  const session = await requireLeagueAdmin(leagueSlug);

  const existingMatchups = await prisma.matchup.findMany({
    where: {
      leagueId: session.leagueId,
      weekNumber,
      OR: [
        { teamAId: winningTeamId },
        { teamBId: winningTeamId },
        { teamAId: forfeitingTeamId },
        { teamBId: forfeitingTeamId },
      ],
    },
  });

  if (existingMatchups.length > 0) {
    throw new Error(`One or both teams already played in Week ${weekNumber}`);
  }

  const matchup = await prisma.matchup.create({
    data: {
      leagueId: session.leagueId,
      weekNumber,
      teamAId: winningTeamId,
      teamAGross: 0,
      teamAHandicap: 0,
      teamANet: 0,
      teamAPoints: 20,
      teamAIsSub: false,
      teamBId: forfeitingTeamId,
      teamBGross: 0,
      teamBHandicap: 0,
      teamBNet: 0,
      teamBPoints: 0,
      teamBIsSub: false,
      isForfeit: true,
      forfeitTeamId: forfeitingTeamId,
    },
  });

  await Promise.all([
    prisma.team.update({
      where: { id: winningTeamId },
      data: {
        totalPoints: { increment: 20 },
        wins: { increment: 1 },
      },
    }),
    prisma.team.update({
      where: { id: forfeitingTeamId },
      data: {
        losses: { increment: 1 },
      },
    }),
  ]);

  return matchup;
}

// ==========================================
// LEAGUE SETTINGS (Admin only)
// ==========================================

export async function updateLeagueSettings(
  leagueSlug: string,
  maxTeams: number,
  registrationOpen: boolean
) {
  const session = await requireLeagueAdmin(leagueSlug);

  return prisma.league.update({
    where: { id: session.leagueId },
    data: { maxTeams, registrationOpen },
  });
}

export async function updateHandicapSettings(
  leagueSlug: string,
  baseScore: number,
  multiplier: number,
  rounding: "floor" | "round" | "ceil",
  defaultHandicap: number,
  maxHandicap: number | null
) {
  const session = await requireLeagueAdmin(leagueSlug);

  // Update the settings
  await prisma.league.update({
    where: { id: session.leagueId },
    data: {
      handicapBaseScore: baseScore,
      handicapMultiplier: multiplier,
      handicapRounding: rounding,
      handicapDefault: defaultHandicap,
      handicapMax: maxHandicap,
    },
  });

  // Recalculate all matchups and team stats with new settings
  await recalculateLeagueStats(session.leagueId);

  return prisma.league.findUnique({ where: { id: session.leagueId } });
}

/**
 * Recalculate all matchup handicaps, net scores, points, and team stats
 * Used when handicap settings change
 */
export async function recalculateLeagueStats(leagueId: number) {
  const handicapSettings = await getHandicapSettings(leagueId);

  // Get all matchups ordered by week (chronological for proper handicap calculation)
  const matchups = await prisma.matchup.findMany({
    where: { leagueId },
    orderBy: [{ weekNumber: "asc" }, { id: "asc" }],
  });

  // If no matchups, just ensure team stats are zeroed and return
  if (matchups.length === 0) {
    const teams = await prisma.team.findMany({ where: { leagueId } });
    for (const team of teams) {
      await prisma.team.update({
        where: { id: team.id },
        data: { totalPoints: 0, wins: 0, losses: 0, ties: 0 },
      });
    }
    return;
  }

  // Track scores for each team to calculate rolling handicaps
  const teamScores: Record<number, number[]> = {};

  // Process each matchup in order
  for (const matchup of matchups) {
    // Skip forfeits - they have fixed points and no real scores
    if (matchup.isForfeit) {
      continue;
    }

    // Initialize team score arrays if needed
    if (!teamScores[matchup.teamAId]) teamScores[matchup.teamAId] = [];
    if (!teamScores[matchup.teamBId]) teamScores[matchup.teamBId] = [];

    // Calculate handicaps
    let teamAHandicap: number;
    let teamBHandicap: number;

    if (matchup.weekNumber === 1) {
      // Week 1: Keep original manual handicaps
      teamAHandicap = matchup.teamAHandicap;
      teamBHandicap = matchup.teamBHandicap;
    } else {
      // For subs, keep original handicap; otherwise recalculate
      if (matchup.teamAIsSub) {
        teamAHandicap = matchup.teamAHandicap;
      } else {
        teamAHandicap = calculateHandicap(teamScores[matchup.teamAId], handicapSettings);
      }

      if (matchup.teamBIsSub) {
        teamBHandicap = matchup.teamBHandicap;
      } else {
        teamBHandicap = calculateHandicap(teamScores[matchup.teamBId], handicapSettings);
      }
    }

    // Calculate new net scores
    const teamANet = calculateNetScore(matchup.teamAGross, teamAHandicap);
    const teamBNet = calculateNetScore(matchup.teamBGross, teamBHandicap);

    // Calculate new points based on net scores
    const { teamAPoints, teamBPoints } = suggestPoints(teamANet, teamBNet);

    // Update the matchup
    await prisma.matchup.update({
      where: { id: matchup.id },
      data: {
        teamAHandicap,
        teamBHandicap,
        teamANet,
        teamBNet,
        teamAPoints,
        teamBPoints,
      },
    });

    // Add scores to history for future handicap calculations (non-subs only)
    if (!matchup.teamAIsSub) {
      teamScores[matchup.teamAId].push(matchup.teamAGross);
    }
    if (!matchup.teamBIsSub) {
      teamScores[matchup.teamBId].push(matchup.teamBGross);
    }
  }

  // Recalculate team aggregate stats
  const teams = await prisma.team.findMany({
    where: { leagueId },
  });

  for (const team of teams) {
    // Get all matchups for this team
    const teamMatchups = await prisma.matchup.findMany({
      where: {
        leagueId,
        OR: [{ teamAId: team.id }, { teamBId: team.id }],
      },
    });

    let totalPoints = 0;
    let wins = 0;
    let losses = 0;
    let ties = 0;

    for (const m of teamMatchups) {
      if (m.teamAId === team.id) {
        totalPoints += m.teamAPoints;
        if (m.teamAPoints > m.teamBPoints) wins++;
        else if (m.teamAPoints < m.teamBPoints) losses++;
        else ties++;
      } else {
        totalPoints += m.teamBPoints;
        if (m.teamBPoints > m.teamAPoints) wins++;
        else if (m.teamBPoints < m.teamAPoints) losses++;
        else ties++;
      }
    }

    await prisma.team.update({
      where: { id: team.id },
      data: { totalPoints, wins, losses, ties },
    });
  }
}

// ==========================================
// ABOUT THE LEAGUE
// ==========================================

export interface LeagueAbout {
  leagueName: string;
  startDate: Date | null;
  endDate: Date | null;
  numberOfWeeks: number | null;
  courseName: string | null;
  courseLocation: string | null;
  playDay: string | null;
  playTime: string | null;
  entryFee: number | null;
  prizeInfo: string | null;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  registrationOpen: boolean;
  maxTeams: number;
}

export async function getLeagueAbout(leagueId: number): Promise<LeagueAbout> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
  });

  return {
    leagueName: league.name,
    startDate: league.startDate,
    endDate: league.endDate,
    numberOfWeeks: league.numberOfWeeks,
    courseName: league.courseName,
    courseLocation: league.courseLocation,
    playDay: league.playDay,
    playTime: league.playTime,
    entryFee: league.entryFee,
    prizeInfo: league.prizeInfo,
    description: league.description,
    contactEmail: league.contactEmail,
    contactPhone: league.contactPhone,
    registrationOpen: league.registrationOpen,
    maxTeams: league.maxTeams,
  };
}

const updateLeagueAboutSchema = z.object({
  leagueName: z.string().min(1).max(100),
  startDate: z.date().nullable(),
  endDate: z.date().nullable(),
  numberOfWeeks: z.number().int().min(1).max(52).nullable(),
  courseName: z.string().max(100).nullable(),
  courseLocation: z.string().max(200).nullable(),
  playDay: z.string().max(20).nullable(),
  playTime: z.string().max(20).nullable(),
  entryFee: z.number().min(0).nullable(),
  prizeInfo: z.string().max(1000).nullable(),
  description: z.string().max(2000).nullable(),
  contactEmail: z.string().email().max(255).nullable().or(z.literal("")),
  contactPhone: z.string().max(20).nullable(),
});

export type UpdateLeagueAboutInput = z.infer<typeof updateLeagueAboutSchema>;

export async function updateLeagueAbout(leagueSlug: string, data: UpdateLeagueAboutInput) {
  const session = await requireLeagueAdmin(leagueSlug);

  const sanitizedData = {
    ...data,
    contactEmail: data.contactEmail === "" ? null : data.contactEmail,
  };

  const validated = updateLeagueAboutSchema.parse(sanitizedData);

  return prisma.league.update({
    where: { id: session.leagueId },
    data: {
      name: validated.leagueName,
      startDate: validated.startDate,
      endDate: validated.endDate,
      numberOfWeeks: validated.numberOfWeeks,
      courseName: validated.courseName,
      courseLocation: validated.courseLocation,
      playDay: validated.playDay,
      playTime: validated.playTime,
      entryFee: validated.entryFee,
      prizeInfo: validated.prizeInfo,
      description: validated.description,
      contactEmail: validated.contactEmail,
      contactPhone: validated.contactPhone,
    },
  });
}

// ==========================================
// TEAM REGISTRATION
// ==========================================

const registerTeamSchema = z.object({
  name: z.string().min(2).max(50).trim(),
  captainName: z.string().min(2).max(100).trim(),
  email: z.string().email().max(255),
  phone: z.string().min(10).max(20).regex(/^[\d\s()+-]+$/),
});

export async function registerTeam(
  leagueSlug: string,
  name: string,
  captainName: string,
  email: string,
  phone: string
) {
  const validated = registerTeamSchema.parse({ name, captainName, email, phone });

  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
  });

  if (!league) {
    throw new Error("League not found");
  }

  if (!league.registrationOpen) {
    throw new Error("Registration is currently closed");
  }

  const approvedTeamsCount = await prisma.team.count({
    where: { leagueId: league.id, status: "approved" },
  });

  if (approvedTeamsCount >= league.maxTeams) {
    throw new Error(`League is full (${league.maxTeams} teams maximum)`);
  }

  const existing = await prisma.team.findUnique({
    where: { leagueId_name: { leagueId: league.id, name: validated.name } },
  });

  if (existing) {
    throw new Error(`Team "${validated.name}" already exists in this league`);
  }

  return prisma.team.create({
    data: {
      leagueId: league.id,
      name: validated.name,
      captainName: validated.captainName,
      email: validated.email,
      phone: validated.phone,
      status: "pending",
    },
  });
}

export async function getPendingTeams(leagueSlug: string) {
  const session = await requireLeagueAdmin(leagueSlug);

  return prisma.team.findMany({
    where: { leagueId: session.leagueId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
}

export async function getApprovedTeams(leagueId: number) {
  return prisma.team.findMany({
    where: { leagueId, status: "approved" },
    orderBy: { name: "asc" },
  });
}

export async function getAllTeamsWithStatus(leagueSlug: string) {
  const session = await requireLeagueAdmin(leagueSlug);

  return prisma.team.findMany({
    where: { leagueId: session.leagueId },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function approveTeam(leagueSlug: string, teamId: number) {
  const session = await requireLeagueAdmin(leagueSlug);

  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
  });

  if (team.leagueId !== session.leagueId) {
    throw new Error("Unauthorized: Team does not belong to this league");
  }

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: session.leagueId },
  });

  const approvedCount = await prisma.team.count({
    where: { leagueId: session.leagueId, status: "approved" },
  });

  if (approvedCount >= league.maxTeams) {
    throw new Error(`Cannot approve: League is full (${league.maxTeams} teams maximum)`);
  }

  return prisma.team.update({
    where: { id: teamId },
    data: { status: "approved" },
  });
}

export async function rejectTeam(leagueSlug: string, teamId: number) {
  const session = await requireLeagueAdmin(leagueSlug);

  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
  });

  if (team.leagueId !== session.leagueId) {
    throw new Error("Unauthorized: Team does not belong to this league");
  }

  return prisma.team.update({
    where: { id: teamId },
    data: { status: "rejected" },
  });
}

export async function deleteTeam(leagueSlug: string, teamId: number) {
  const session = await requireLeagueAdmin(leagueSlug);

  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
  });

  if (team.leagueId !== session.leagueId) {
    throw new Error("Unauthorized: Team does not belong to this league");
  }

  const matchupCount = await prisma.matchup.count({
    where: {
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
  });

  if (matchupCount > 0) {
    throw new Error(
      `Cannot delete team: Team has ${matchupCount} matchup(s) recorded. Delete the matchups first.`
    );
  }

  return prisma.team.delete({
    where: { id: teamId },
  });
}
