"use server";

import { z } from "zod";
import { prisma } from "../db";
import {
  calculateHandicap,
  calculateNetScore,
  suggestPoints,
} from "../handicap";
import { requireLeagueAdmin } from "../auth";
import { getTeamPreviousScores } from "./teams";
import { getHandicapSettings } from "./handicap-settings";
import { type ActionResult } from "./shared";

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
): Promise<ActionResult<MatchupPreview>> {
  try {
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
      return { success: false, error: `Team(s) already played in Week ${weekNumber}: ${teamsAlreadyPlayed.join(", ")}` };
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

  return { success: true, data: {
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
  } };
  } catch (error) {
    console.error("previewMatchup error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to generate preview." };
  }
}

const submitMatchupSchema = z.object({
  weekNumber: z.number().int().min(1, "Week number must be at least 1"),
  teamAId: z.number().int().positive(),
  teamAGross: z.number().int().min(0, "Gross score cannot be negative"),
  teamAHandicap: z.number(),
  teamANet: z.number(),
  teamAPoints: z.number().min(0, "Points cannot be negative"),
  teamAIsSub: z.boolean(),
  teamBId: z.number().int().positive(),
  teamBGross: z.number().int().min(0, "Gross score cannot be negative"),
  teamBHandicap: z.number(),
  teamBNet: z.number(),
  teamBPoints: z.number().min(0, "Points cannot be negative"),
  teamBIsSub: z.boolean(),
});

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
): Promise<ActionResult> {
  try {
    const validated = submitMatchupSchema.parse({
      weekNumber, teamAId, teamAGross, teamAHandicap, teamANet, teamAPoints, teamAIsSub,
      teamBId, teamBGross, teamBHandicap, teamBNet, teamBPoints, teamBIsSub,
    });
    const session = await requireLeagueAdmin(leagueSlug);

    // Get active season for this league
    const activeSeason = await prisma.season.findFirst({
      where: { leagueId: session.leagueId, isActive: true },
    });

    // Use transaction to ensure matchup + team stats stay consistent
    let teamAWin = 0, teamALoss = 0, teamATie = 0;
    let teamBWin = 0, teamBLoss = 0, teamBTie = 0;

    if (validated.teamAPoints > validated.teamBPoints) {
      teamAWin = 1;
      teamBLoss = 1;
    } else if (validated.teamBPoints > validated.teamAPoints) {
      teamBWin = 1;
      teamALoss = 1;
    } else {
      teamATie = 1;
      teamBTie = 1;
    }

    await prisma.$transaction([
      prisma.matchup.create({
        data: {
          leagueId: session.leagueId,
          seasonId: activeSeason?.id ?? null,
          weekNumber: validated.weekNumber,
          teamAId: validated.teamAId,
          teamAGross: validated.teamAGross,
          teamAHandicap: validated.teamAHandicap,
          teamANet: validated.teamANet,
          teamAPoints: validated.teamAPoints,
          teamAIsSub: validated.teamAIsSub,
          teamBId: validated.teamBId,
          teamBGross: validated.teamBGross,
          teamBHandicap: validated.teamBHandicap,
          teamBNet: validated.teamBNet,
          teamBPoints: validated.teamBPoints,
          teamBIsSub: validated.teamBIsSub,
        },
      }),
      prisma.team.update({
        where: { id: validated.teamAId },
        data: {
          totalPoints: { increment: validated.teamAPoints },
          wins: { increment: teamAWin },
          losses: { increment: teamALoss },
          ties: { increment: teamATie },
        },
      }),
      prisma.team.update({
        where: { id: validated.teamBId },
        data: {
          totalPoints: { increment: validated.teamBPoints },
          wins: { increment: teamBWin },
          losses: { increment: teamBLoss },
          ties: { increment: teamBTie },
        },
      }),
    ]);

    return { success: true, data: undefined };
  } catch (error) {
    console.error("submitMatchup error:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid matchup data" };
    }
    return { success: false, error: "Failed to submit matchup. Please try again." };
  }
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

export async function deleteMatchup(leagueSlug: string, matchupId: number): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);

    const matchup = await prisma.matchup.findUniqueOrThrow({
      where: { id: matchupId },
    });

    // Verify matchup belongs to this league
    if (matchup.leagueId !== session.leagueId) {
      return { success: false, error: "Unauthorized: Matchup does not belong to this league" };
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

    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteMatchup error:", error);
    return { success: false, error: "Failed to delete matchup. Please try again." };
  }
}

const submitForfeitSchema = z.object({
  weekNumber: z.number().int().min(1, "Week number must be at least 1"),
  winningTeamId: z.number().int().positive(),
  forfeitingTeamId: z.number().int().positive(),
}).refine(d => d.winningTeamId !== d.forfeitingTeamId, {
  message: "Winning team and forfeiting team must be different",
});

export async function submitForfeit(
  leagueSlug: string,
  weekNumber: number,
  winningTeamId: number,
  forfeitingTeamId: number
): Promise<ActionResult> {
  try {
    const validated = submitForfeitSchema.parse({ weekNumber, winningTeamId, forfeitingTeamId });
    const session = await requireLeagueAdmin(leagueSlug);

    // Get active season for this league
    const activeSeason = await prisma.season.findFirst({
      where: { leagueId: session.leagueId, isActive: true },
    });

    const existingMatchups = await prisma.matchup.findMany({
      where: {
        leagueId: session.leagueId,
        weekNumber: validated.weekNumber,
        OR: [
          { teamAId: validated.winningTeamId },
          { teamBId: validated.winningTeamId },
          { teamAId: validated.forfeitingTeamId },
          { teamBId: validated.forfeitingTeamId },
        ],
      },
    });

    if (existingMatchups.length > 0) {
      return { success: false, error: `One or both teams already played in Week ${validated.weekNumber}` };
    }

    // Use transaction to ensure matchup + team stats stay consistent
    await prisma.$transaction([
      prisma.matchup.create({
        data: {
          leagueId: session.leagueId,
          seasonId: activeSeason?.id ?? null,
          weekNumber: validated.weekNumber,
          teamAId: validated.winningTeamId,
          teamAGross: 0,
          teamAHandicap: 0,
          teamANet: 0,
          teamAPoints: 20,
          teamAIsSub: false,
          teamBId: validated.forfeitingTeamId,
          teamBGross: 0,
          teamBHandicap: 0,
          teamBNet: 0,
          teamBPoints: 0,
          teamBIsSub: false,
          isForfeit: true,
          forfeitTeamId: validated.forfeitingTeamId,
        },
      }),
      prisma.team.update({
        where: { id: validated.winningTeamId },
        data: {
          totalPoints: { increment: 20 },
          wins: { increment: 1 },
        },
      }),
      prisma.team.update({
        where: { id: validated.forfeitingTeamId },
        data: {
          losses: { increment: 1 },
        },
      }),
    ]);

    return { success: true, data: undefined };
  } catch (error) {
    console.error("submitForfeit error:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid forfeit data" };
    }
    return { success: false, error: "Failed to record forfeit. Please try again." };
  }
}

export async function getMatchupHistoryForSeason(seasonId: number) {
  return prisma.matchup.findMany({
    where: { seasonId },
    include: {
      teamA: true,
      teamB: true,
    },
    orderBy: [{ weekNumber: "desc" }, { playedAt: "desc" }],
  });
}
