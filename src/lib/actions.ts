"use server";

import { prisma } from "./db";
import { calculateHandicap, calculateNetScore, suggestPoints } from "./handicap";

export async function getTeams() {
  return prisma.team.findMany({
    orderBy: { name: "asc" },
  });
}

export async function createTeam(name: string) {
  // Check if team already exists
  const existing = await prisma.team.findUnique({
    where: { name },
  });
  if (existing) {
    throw new Error(`Team "${name}" already exists`);
  }
  return prisma.team.create({
    data: { name },
  });
}

export async function getTeamPreviousScores(teamId: number): Promise<number[]> {
  const matchups = await prisma.matchup.findMany({
    where: {
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
    orderBy: { weekNumber: "asc" },
  });

  // Exclude games where a substitute played (sub scores don't affect handicap)
  return matchups
    .filter((m) => {
      if (m.teamAId === teamId) return !m.teamAIsSub;
      return !m.teamBIsSub;
    })
    .map((m) => (m.teamAId === teamId ? m.teamAGross : m.teamBGross));
}

export async function getCurrentWeekNumber(): Promise<number> {
  const lastMatchup = await prisma.matchup.findFirst({
    orderBy: { weekNumber: "desc" },
  });
  return lastMatchup ? lastMatchup.weekNumber + 1 : 1;
}

export async function getTeamHandicap(teamId: number): Promise<number> {
  const scores = await getTeamPreviousScores(teamId);
  return calculateHandicap(scores);
}

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

  const [teamA, teamB] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: teamAId } }),
    prisma.team.findUniqueOrThrow({ where: { id: teamBId } }),
  ]);

  const isWeekOne = weekNumber === 1;

  // Week 1: use manual handicaps
  // Week 2+: calculate from history, BUT if a sub is playing, use manual handicap for that team
  let teamAHandicap: number;
  let teamBHandicap: number;

  if (isWeekOne) {
    teamAHandicap = teamAHandicapManual ?? 0;
    teamBHandicap = teamBHandicapManual ?? 0;
  } else {
    // For subs, use manual handicap; for regular players, calculate from history
    if (teamAIsSub && teamAHandicapManual !== null) {
      teamAHandicap = teamAHandicapManual;
    } else {
      const teamAScores = await getTeamPreviousScores(teamAId);
      teamAHandicap = calculateHandicap(teamAScores);
    }

    if (teamBIsSub && teamBHandicapManual !== null) {
      teamBHandicap = teamBHandicapManual;
    } else {
      const teamBScores = await getTeamPreviousScores(teamBId);
      teamBHandicap = calculateHandicap(teamBScores);
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
  // Create the matchup
  const matchup = await prisma.matchup.create({
    data: {
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

  // Determine win/loss/tie for each team
  let teamAWin = 0,
    teamALoss = 0,
    teamATie = 0;
  let teamBWin = 0,
    teamBLoss = 0,
    teamBTie = 0;

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

  // Update team stats
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

export async function getLeaderboard() {
  // Get all teams
  const teams = await prisma.team.findMany();

  // Get all matchups for head-to-head and net differential calculations
  const matchups = await prisma.matchup.findMany();

  // Calculate average handicap for all teams (average of official handicaps, excluding subs, floored)
  const handicaps: Record<number, number> = {};
  for (const team of teams) {
    // Get all handicaps from matchups where this team played (not as a sub)
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
      handicaps[team.id] = Math.floor(avgHandicap); // Always round down
    }
  }

  // Calculate net score differential for each team
  const netDifferential: Record<number, number> = {};
  for (const team of teams) {
    netDifferential[team.id] = 0;
  }

  for (const m of matchups) {
    // Net differential: how much better your net score was vs opponent
    // Lower net is better in golf, so positive differential = you beat them
    netDifferential[m.teamAId] += m.teamBNet - m.teamANet;
    netDifferential[m.teamBId] += m.teamANet - m.teamBNet;
  }

  // Build head-to-head record: headToHead[teamA][teamB] = points teamA scored vs teamB
  const headToHead: Record<number, Record<number, number>> = {};
  for (const team of teams) {
    headToHead[team.id] = {};
  }

  for (const m of matchups) {
    headToHead[m.teamAId][m.teamBId] =
      (headToHead[m.teamAId][m.teamBId] || 0) + m.teamAPoints;
    headToHead[m.teamBId][m.teamAId] =
      (headToHead[m.teamBId][m.teamAId] || 0) + m.teamBPoints;
  }

  // Sort teams with comprehensive tie-breakers:
  // 1. Total Points (desc)
  // 2. Wins (desc)
  // 3. Head-to-Head (if they've played each other)
  // 4. Net Score Differential (desc - higher is better)
  const sortedTeams = [...teams].sort((a, b) => {
    // 1. Total Points
    if (a.totalPoints !== b.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }

    // 2. Wins
    if (a.wins !== b.wins) {
      return b.wins - a.wins;
    }

    // 3. Head-to-Head (only if they've played each other)
    const aVsB = headToHead[a.id]?.[b.id] || 0;
    const bVsA = headToHead[b.id]?.[a.id] || 0;
    if (aVsB !== 0 || bVsA !== 0) {
      if (aVsB !== bVsA) {
        return bVsA - aVsB; // More points in H2H wins
      }
    }

    // 4. Net Score Differential (higher is better - means you beat opponents by more)
    const aDiff = netDifferential[a.id] || 0;
    const bDiff = netDifferential[b.id] || 0;
    return bDiff - aDiff;
  });

  // Return sorted teams with handicaps
  return sortedTeams.map((team) => ({
    ...team,
    handicap: handicaps[team.id],
  }));
}

export async function getMatchupHistory() {
  return prisma.matchup.findMany({
    include: {
      teamA: true,
      teamB: true,
    },
    orderBy: [{ weekNumber: "desc" }, { playedAt: "desc" }],
  });
}

export async function deleteMatchup(matchupId: number) {
  // Get the matchup to reverse the stats
  const matchup = await prisma.matchup.findUniqueOrThrow({
    where: { id: matchupId },
  });

  // Determine what win/loss/tie to reverse
  let teamAWin = 0,
    teamALoss = 0,
    teamATie = 0;
  let teamBWin = 0,
    teamBLoss = 0,
    teamBTie = 0;

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

  // Reverse team stats and delete matchup in a transaction
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
  weekNumber: number,
  winningTeamId: number,
  forfeitingTeamId: number
) {
  // Check if either team already played this week
  const existingMatchups = await prisma.matchup.findMany({
    where: {
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

  // Create forfeit matchup: winning team gets 20 points, forfeiting team gets 0
  // Use placeholder scores for gross/handicap/net since no match was actually played
  const matchup = await prisma.matchup.create({
    data: {
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

  // Update team stats: winning team gets win + 20 points, forfeiting team gets loss + 0 points
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
// TEAM REGISTRATION & SETTINGS
// ==========================================

export async function getLeagueSettings() {
  // Get or create default settings
  let settings = await prisma.leagueSettings.findFirst();
  if (!settings) {
    settings = await prisma.leagueSettings.create({
      data: {
        maxTeams: 16,
        registrationOpen: true,
      },
    });
  }
  return settings;
}

export async function updateLeagueSettings(maxTeams: number, registrationOpen: boolean) {
  const settings = await getLeagueSettings();
  return prisma.leagueSettings.update({
    where: { id: settings.id },
    data: { maxTeams, registrationOpen },
  });
}

export async function registerTeam(
  name: string,
  captainName: string,
  email: string,
  phone: string
) {
  // Check if registration is open
  const settings = await getLeagueSettings();
  if (!settings.registrationOpen) {
    throw new Error("Registration is currently closed");
  }

  // Check if max teams reached (count only approved teams)
  const approvedTeamsCount = await prisma.team.count({
    where: { status: "approved" },
  });

  if (approvedTeamsCount >= settings.maxTeams) {
    throw new Error(`League is full (${settings.maxTeams} teams maximum)`);
  }

  // Check if team name already exists
  const existing = await prisma.team.findUnique({
    where: { name },
  });
  if (existing) {
    throw new Error(`Team "${name}" already exists`);
  }

  // Create team with pending status
  return prisma.team.create({
    data: {
      name,
      captainName,
      email,
      phone,
      status: "pending",
    },
  });
}

export async function getPendingTeams() {
  return prisma.team.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });
}

export async function getApprovedTeams() {
  return prisma.team.findMany({
    where: { status: "approved" },
    orderBy: { name: "asc" },
  });
}

export async function getAllTeamsWithStatus() {
  return prisma.team.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function approveTeam(teamId: number) {
  const settings = await getLeagueSettings();
  const approvedCount = await prisma.team.count({
    where: { status: "approved" },
  });

  if (approvedCount >= settings.maxTeams) {
    throw new Error(`Cannot approve: League is full (${settings.maxTeams} teams maximum)`);
  }

  return prisma.team.update({
    where: { id: teamId },
    data: { status: "approved" },
  });
}

export async function rejectTeam(teamId: number) {
  return prisma.team.update({
    where: { id: teamId },
    data: { status: "rejected" },
  });
}

export async function deleteTeam(teamId: number) {
  // Check if team has any matchups
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
