"use server";

import { z } from "zod";
import { prisma } from "../db";
import {
  calculateHandicap,
  calculateNetScore,
  suggestPoints,
} from "../handicap";
import { revalidatePath } from "next/cache";
import { requireLeagueAdmin } from "../auth";
import { logger } from "../logger";
import { getTeamPreviousScores, getTeamPreviousScoresForScoring } from "./teams";
import { getHandicapSettings } from "./handicap-settings";
import { requireActiveLeague } from "./leagues";
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
  leagueSlug: string,
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
  const session = await requireLeagueAdmin(leagueSlug);
  await requireActiveLeague(session.leagueId);
  const leagueId = session.leagueId;

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
    include: {
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
    },
  });

  if (existingMatchups.length > 0) {
    const teamsAlreadyPlayed: string[] = [];
    for (const m of existingMatchups) {
      if (m.teamAId === teamAId || m.teamBId === teamAId) {
        // Use the already-included team data instead of a redundant query
        const teamName = m.teamAId === teamAId ? m.teamA.name : m.teamB.name;
        if (!teamsAlreadyPlayed.includes(teamName)) {
          teamsAlreadyPlayed.push(teamName);
        }
      }
      if (m.teamAId === teamBId || m.teamBId === teamBId) {
        // Use the already-included team data instead of a redundant query
        const teamName = m.teamAId === teamBId ? m.teamA.name : m.teamB.name;
        if (!teamsAlreadyPlayed.includes(teamName)) {
          teamsAlreadyPlayed.push(teamName);
        }
      }
    }
    if (teamsAlreadyPlayed.length > 0) {
      return { success: false, error: `Team(s) already played in Week ${weekNumber}: ${teamsAlreadyPlayed.join(", ")}` };
    }
  }

  const [teamA, teamB, handicapSettings, league] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: teamAId }, select: { id: true, name: true } }),
    prisma.team.findUniqueOrThrow({ where: { id: teamBId }, select: { id: true, name: true } }),
    getHandicapSettings(leagueId),
    prisma.league.findUniqueOrThrow({ where: { id: leagueId }, select: { scoringType: true } }),
  ]);

  const isWeekOne = weekNumber === 1;

  let teamAHandicap: number;
  let teamBHandicap: number;

  // Helper to clamp manual handicap entries within league min/max caps
  function capManualHandicap(value: number): number {
    let result = value;
    if (handicapSettings.maxHandicap !== null && result > handicapSettings.maxHandicap) {
      result = handicapSettings.maxHandicap;
    }
    if (handicapSettings.minHandicap !== null && result < handicapSettings.minHandicap) {
      result = handicapSettings.minHandicap;
    }
    return result;
  }

  if (isWeekOne) {
    teamAHandicap = capManualHandicap(teamAHandicapManual ?? handicapSettings.defaultHandicap);
    teamBHandicap = capManualHandicap(teamBHandicapManual ?? handicapSettings.defaultHandicap);
  } else {
    if (teamAIsSub && teamAHandicapManual !== null) {
      teamAHandicap = capManualHandicap(teamAHandicapManual);
    } else {
      // Only use scores from weeks before the current week
      const teamAScores = league.scoringType === "hybrid"
        ? await getTeamPreviousScoresForScoring(leagueId, teamAId, league.scoringType, weekNumber)
        : await getTeamPreviousScores(leagueId, teamAId, weekNumber);
      teamAHandicap = calculateHandicap(teamAScores, handicapSettings, weekNumber);
    }

    if (teamBIsSub && teamBHandicapManual !== null) {
      teamBHandicap = capManualHandicap(teamBHandicapManual);
    } else {
      // Only use scores from weeks before the current week
      const teamBScores = league.scoringType === "hybrid"
        ? await getTeamPreviousScoresForScoring(leagueId, teamBId, league.scoringType, weekNumber)
        : await getTeamPreviousScores(leagueId, teamBId, weekNumber);
      teamBHandicap = calculateHandicap(teamBScores, handicapSettings, weekNumber);
    }
  }

  const teamANet = calculateNetScore(teamAGross, teamAHandicap);
  const teamBNet = calculateNetScore(teamBGross, teamBHandicap);

  if (!isFinite(teamANet) || !isFinite(teamBNet)) {
    return { success: false, error: "Invalid score calculation result" };
  }

  const { teamAPoints, teamBPoints } = suggestPoints(teamANet, teamBNet);

  if (!isFinite(teamAPoints) || !isFinite(teamBPoints)) {
    return { success: false, error: "Invalid points calculation result" };
  }

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
    logger.error("previewMatchup failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to generate preview." };
  }
}

const submitMatchupSchema = z.object({
  weekNumber: z.number().int().min(1, "Week number must be at least 1"),
  teamAId: z.number().int().positive(),
  teamAGross: z.number().int().min(0, "Gross score cannot be negative").max(200, "Gross score cannot exceed 200"),
  teamAHandicap: z.number(),
  teamANet: z.number(),
  teamAPoints: z.number().min(0, "Points cannot be negative"),
  teamAIsSub: z.boolean(),
  teamBId: z.number().int().positive(),
  teamBGross: z.number().int().min(0, "Gross score cannot be negative").max(200, "Gross score cannot exceed 200"),
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
    await requireActiveLeague(session.leagueId);

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

    // Verify both teams belong to this league
    const [teamAExists, teamBExists] = await Promise.all([
      prisma.team.findFirst({ where: { id: validated.teamAId, leagueId: session.leagueId }, select: { id: true } }),
      prisma.team.findFirst({ where: { id: validated.teamBId, leagueId: session.leagueId }, select: { id: true } }),
    ]);
    if (!teamAExists || !teamBExists) {
      return { success: false, error: "One or both teams do not belong to this league." };
    }

    // Re-validate net scores server-side to prevent stale/manipulated values
    const recalcTeamANet = calculateNetScore(validated.teamAGross, validated.teamAHandicap);
    const recalcTeamBNet = calculateNetScore(validated.teamBGross, validated.teamBHandicap);

    if (!isFinite(validated.teamAHandicap) || !isFinite(validated.teamBHandicap)) {
      return { success: false, error: "Invalid handicap values" };
    }

    if (!isFinite(recalcTeamANet) || !isFinite(recalcTeamBNet)) {
      return { success: false, error: "Invalid score calculation result" };
    }

    // Validate points sum to 20 (match_play only; stroke_play/hybrid use variable point totals)
    const league = await prisma.league.findUniqueOrThrow({
      where: { id: session.leagueId },
      select: { scoringType: true },
    });
    if (league.scoringType === "match_play" && validated.teamAPoints + validated.teamBPoints !== 20) {
      return { success: false, error: "Team points must sum to 20." };
    }

    // Create matchup and update stats in a transaction
    const newMatchup = await prisma.$transaction(async (tx) => {
      // Duplicate check inside transaction to prevent concurrent submissions
      const existing = await tx.matchup.findFirst({
        where: {
          leagueId: session.leagueId,
          weekNumber: validated.weekNumber,
          OR: [
            { teamAId: validated.teamAId },
            { teamBId: validated.teamAId },
            { teamAId: validated.teamBId },
            { teamBId: validated.teamBId },
          ],
        },
      });
      if (existing) {
        throw new Error("One or both teams already have a matchup this week.");
      }

      const matchup = await tx.matchup.create({
        data: {
          leagueId: session.leagueId,
          seasonId: activeSeason?.id ?? null,
          weekNumber: validated.weekNumber,
          teamAId: validated.teamAId,
          teamAGross: validated.teamAGross,
          teamAHandicap: validated.teamAHandicap,
          teamANet: recalcTeamANet,
          teamAPoints: validated.teamAPoints,
          teamAIsSub: validated.teamAIsSub,
          teamBId: validated.teamBId,
          teamBGross: validated.teamBGross,
          teamBHandicap: validated.teamBHandicap,
          teamBNet: recalcTeamBNet,
          teamBPoints: validated.teamBPoints,
          teamBIsSub: validated.teamBIsSub,
        },
      });

      await tx.team.update({
        where: { id: validated.teamAId },
        data: {
          totalPoints: { increment: validated.teamAPoints },
          wins: { increment: teamAWin },
          losses: { increment: teamALoss },
          ties: { increment: teamATie },
        },
      });

      await tx.team.update({
        where: { id: validated.teamBId },
        data: {
          totalPoints: { increment: validated.teamBPoints },
          wins: { increment: teamBWin },
          losses: { increment: teamBLoss },
          ties: { increment: teamBTie },
        },
      });

      // Link to scheduled matchup if one exists (check both team orderings)
      const scheduledMatch = await tx.scheduledMatchup.findFirst({
        where: {
          leagueId: session.leagueId,
          weekNumber: validated.weekNumber,
          status: "scheduled",
          OR: [
            { teamAId: validated.teamAId, teamBId: validated.teamBId },
            { teamAId: validated.teamBId, teamBId: validated.teamAId },
          ],
        },
      });

      if (scheduledMatch) {
        await tx.scheduledMatchup.update({
          where: { id: scheduledMatch.id },
          data: { status: "completed", matchupId: matchup.id },
        });
      }

      return matchup;
    });

    // Auto-link approved scorecards for these teams on this week
    const unlinkedScorecards = await prisma.scorecard.findMany({
      where: {
        leagueId: session.leagueId,
        weekNumber: validated.weekNumber,
        matchupId: null,
        status: "approved",
        teamId: { in: [validated.teamAId, validated.teamBId] },
      },
      select: { id: true, teamId: true },
    });
    if (unlinkedScorecards.length > 0) {
      await Promise.all(
        unlinkedScorecards.map((sc) =>
          prisma.scorecard.update({
            where: { id: sc.id },
            data: {
              matchupId: newMatchup.id,
              teamSide: sc.teamId === validated.teamAId ? "A" : "B",
            },
          })
        )
      );
    }

    revalidatePath(`/league/${leagueSlug}/history`);
    return { success: true, data: undefined };
  } catch (error) {
    logger.error("submitMatchup failed", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid matchup data" };
    }
    return { success: false, error: error instanceof Error ? error.message : "Failed to submit matchup. Please try again." };
  }
}

// Public read — no auth required. Called from public leaderboard/history pages.
export async function getMatchupHistory(leagueId: number, limit = 200) {
  const results = await prisma.matchup.findMany({
    where: { leagueId },
    include: {
      teamA: {
        select: { id: true, name: true, totalPoints: true, wins: true, losses: true, ties: true },
      },
      teamB: {
        select: { id: true, name: true, totalPoints: true, wins: true, losses: true, ties: true },
      },
    },
    take: limit + 1,
    orderBy: [{ weekNumber: "desc" }, { playedAt: "desc" }],
  });
  const hasMore = results.length > limit;
  return { matchups: hasMore ? results.slice(0, limit) : results, hasMore };
}

// Public read — no auth required. Called from public leaderboard/history pages.
export async function getTeamMatchupHistory(leagueId: number, teamId: number, limit = 200) {
  const results = await prisma.matchup.findMany({
    where: {
      leagueId,
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
    include: {
      teamA: {
        select: { id: true, name: true, totalPoints: true, wins: true, losses: true, ties: true },
      },
      teamB: {
        select: { id: true, name: true, totalPoints: true, wins: true, losses: true, ties: true },
      },
    },
    take: limit + 1,
    orderBy: [{ weekNumber: "desc" }, { playedAt: "desc" }],
  });
  const hasMore = results.length > limit;
  return { matchups: hasMore ? results.slice(0, limit) : results, hasMore };
}

export async function deleteMatchup(leagueSlug: string, matchupId: number): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

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

    await prisma.$transaction(async (tx) => {
      // Revert any linked scheduled matchup back to "scheduled"
      const scheduledMatch = await tx.scheduledMatchup.findFirst({
        where: { matchupId: matchupId },
      });

      if (scheduledMatch) {
        await tx.scheduledMatchup.update({
          where: { id: scheduledMatch.id },
          data: { status: "scheduled", matchupId: null },
        });
      }

      // Fetch current stats to clamp at zero
      const [teamA, teamB] = await Promise.all([
        tx.team.findUniqueOrThrow({ where: { id: matchup.teamAId }, select: { totalPoints: true, wins: true, losses: true, ties: true } }),
        tx.team.findUniqueOrThrow({ where: { id: matchup.teamBId }, select: { totalPoints: true, wins: true, losses: true, ties: true } }),
      ]);

      await tx.team.update({
        where: { id: matchup.teamAId },
        data: {
          totalPoints: Math.max(0, teamA.totalPoints - matchup.teamAPoints),
          wins: Math.max(0, teamA.wins - teamAWin),
          losses: Math.max(0, teamA.losses - teamALoss),
          ties: Math.max(0, teamA.ties - teamATie),
        },
      });

      await tx.team.update({
        where: { id: matchup.teamBId },
        data: {
          totalPoints: Math.max(0, teamB.totalPoints - matchup.teamBPoints),
          wins: Math.max(0, teamB.wins - teamBWin),
          losses: Math.max(0, teamB.losses - teamBLoss),
          ties: Math.max(0, teamB.ties - teamBTie),
        },
      });

      await tx.matchup.delete({
        where: { id: matchupId },
      });
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("deleteMatchup failed", error);
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
    await requireActiveLeague(session.leagueId);

    // Get active season for this league
    const activeSeason = await prisma.season.findFirst({
      where: { leagueId: session.leagueId, isActive: true },
    });

    // Use transaction to ensure matchup + team stats stay consistent
    await prisma.$transaction(async (tx) => {
      // Duplicate check inside transaction to prevent concurrent submissions
      const existingMatchups = await tx.matchup.findMany({
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
        throw new Error(`One or both teams already played in Week ${validated.weekNumber}`);
      }

      const matchup = await tx.matchup.create({
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
      });

      await tx.team.update({
        where: { id: validated.winningTeamId },
        data: {
          totalPoints: { increment: 20 },
          wins: { increment: 1 },
        },
      });

      await tx.team.update({
        where: { id: validated.forfeitingTeamId },
        data: {
          losses: { increment: 1 },
        },
      });

      // Link to scheduled matchup if one exists (check both team orderings)
      const scheduledMatch = await tx.scheduledMatchup.findFirst({
        where: {
          leagueId: session.leagueId,
          weekNumber: validated.weekNumber,
          status: "scheduled",
          OR: [
            { teamAId: validated.winningTeamId, teamBId: validated.forfeitingTeamId },
            { teamAId: validated.forfeitingTeamId, teamBId: validated.winningTeamId },
          ],
        },
      });

      if (scheduledMatch) {
        await tx.scheduledMatchup.update({
          where: { id: scheduledMatch.id },
          data: { status: "completed", matchupId: matchup.id },
        });
      }
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("submitForfeit failed", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid forfeit data" };
    }
    return { success: false, error: error instanceof Error ? error.message : "Failed to record forfeit. Please try again." };
  }
}

export async function getMatchupsForWeek(
  leagueId: number,
  weekNumber: number
): Promise<{ id: number; teamAId: number; teamAName: string; teamBId: number; teamBName: string; teamAGross: number | null; teamBGross: number | null }[]> {
  const matchups = await prisma.matchup.findMany({
    where: { leagueId, weekNumber },
    include: {
      teamA: { select: { name: true } },
      teamB: { select: { name: true } },
    },
    orderBy: { id: "asc" },
  });

  return matchups.map((m) => ({
    id: m.id,
    teamAId: m.teamAId,
    teamAName: m.teamA.name,
    teamBId: m.teamBId,
    teamBName: m.teamB.name,
    teamAGross: m.teamAGross,
    teamBGross: m.teamBGross,
  }));
}

export async function getMatchupHistoryForSeason(seasonId: number, limit = 200) {
  const results = await prisma.matchup.findMany({
    where: { seasonId },
    include: {
      teamA: {
        select: { id: true, name: true, totalPoints: true, wins: true, losses: true, ties: true },
      },
      teamB: {
        select: { id: true, name: true, totalPoints: true, wins: true, losses: true, ties: true },
      },
    },
    take: limit + 1,
    orderBy: [{ weekNumber: "desc" }, { playedAt: "desc" }],
  });
  const hasMore = results.length > limit;
  return { matchups: hasMore ? results.slice(0, limit) : results, hasMore };
}
