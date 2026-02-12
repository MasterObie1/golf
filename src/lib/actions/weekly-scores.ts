"use server";

import { z } from "zod";
import { prisma } from "../db";
import {
  calculateHandicap,
  calculateNetScore,
  calculateStrokePlayPoints,
  type StrokePlayEntry,
} from "../handicap";
import { generatePointScale } from "../scoring-utils";
import { requireLeagueAdmin } from "../auth";
import { logger } from "../logger";
import { getTeamPreviousScoresForScoring } from "./teams";
import { getHandicapSettings } from "./handicap-settings";
import { requireActiveLeague } from "./leagues";
import { type ActionResult } from "./shared";

// --- Types ---

export interface WeeklyScoreInput {
  teamId: number;
  grossScore: number;
  isSub: boolean;
  isDnp: boolean;
  manualHandicap?: number | null;
}

export interface WeeklyScorePreviewEntry {
  teamId: number;
  teamName: string;
  grossScore: number;
  handicap: number;
  netScore: number;
  position: number;
  points: number;
  bonusPoints: number;
  totalPoints: number;
  isSub: boolean;
  isDnp: boolean;
}

export interface WeeklyScorePreview {
  weekNumber: number;
  isWeekOne: boolean;
  scores: WeeklyScorePreviewEntry[];
}

export interface WeeklyScoreRecord {
  id: number;
  weekNumber: number;
  team: { id: number; name: string };
  grossScore: number;
  handicap: number;
  netScore: number;
  position: number;
  points: number;
  isSub: boolean;
  isDnp: boolean;
}

// --- Zod Schemas ---

const submitWeeklyScoresSchema = z.object({
  weekNumber: z.number().int().min(1),
  scores: z.array(
    z.object({
      teamId: z.number().int().positive(),
      grossScore: z.number().min(0),
      handicap: z.number(),
      netScore: z.number(),
      points: z.number(),
      bonusPoints: z.number(),
      isSub: z.boolean(),
      isDnp: z.boolean(),
      position: z.number().int().min(0),
    })
  ),
});

// --- Preview ---

export async function previewWeeklyScores(
  leagueSlug: string,
  leagueId: number,
  weekNumber: number,
  inputs: WeeklyScoreInput[]
): Promise<ActionResult<WeeklyScorePreview>> {
  try {
    await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(leagueId);

    // Load league config
    const league = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: {
        scoringType: true,
        strokePlayPointPreset: true,
        strokePlayPointScale: true,
        strokePlayBonusShow: true,
        strokePlayBonusBeat: true,
        strokePlayDnpPoints: true,
        strokePlayTieMode: true,
        strokePlayDnpPenalty: true,
        handicapBaseScore: true,
      },
    });

    const handicapSettings = await getHandicapSettings(leagueId);
    const isWeekOne = weekNumber === 1;

    // Check for existing scores this week
    const existingScores = await prisma.weeklyScore.findMany({
      where: { leagueId, weekNumber },
      select: { teamId: true },
    });
    if (existingScores.length > 0) {
      return { success: false, error: `Scores already submitted for Week ${weekNumber}. Delete them first to re-enter.` };
    }

    // Get team names
    const teamIds = inputs.map((i) => i.teamId);
    const teams = await prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, name: true },
    });
    const teamMap = new Map(teams.map((t) => [t.id, t.name]));

    // Calculate handicaps and net scores
    const previewEntries: Array<{
      teamId: number;
      teamName: string;
      grossScore: number;
      handicap: number;
      netScore: number;
      isSub: boolean;
      isDnp: boolean;
    }> = [];

    for (const input of inputs) {
      const teamName = teamMap.get(input.teamId) || `Team ${input.teamId}`;

      if (input.isDnp) {
        previewEntries.push({
          teamId: input.teamId,
          teamName,
          grossScore: 0,
          handicap: 0,
          netScore: 0,
          isSub: input.isSub,
          isDnp: true,
        });
        continue;
      }

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

      let handicap: number;
      if (isWeekOne || (input.isSub && input.manualHandicap != null)) {
        handicap = capManualHandicap(input.manualHandicap ?? handicapSettings.defaultHandicap);
      } else if (input.manualHandicap != null) {
        handicap = capManualHandicap(input.manualHandicap);
      } else {
        const prevScores = await getTeamPreviousScoresForScoring(leagueId, input.teamId, league.scoringType, weekNumber);
        handicap = calculateHandicap(prevScores, handicapSettings, weekNumber);
      }

      if (!isFinite(handicap)) {
        handicap = handicapSettings.defaultHandicap;
      }
      let netScore = calculateNetScore(input.grossScore, handicap);
      if (!isFinite(netScore)) {
        netScore = 0;
      }

      previewEntries.push({
        teamId: input.teamId,
        teamName,
        grossScore: input.grossScore,
        handicap,
        netScore,
        isSub: input.isSub,
        isDnp: false,
      });
    }

    // Calculate position-based points
    const playingCount = inputs.filter((i) => !i.isDnp).length;
    let pointScale: number[];
    if (league.strokePlayPointScale) {
      try {
        pointScale = JSON.parse(league.strokePlayPointScale) as number[];
      } catch (error) {
        logger.error("Failed to parse strokePlayPointScale", error);
        pointScale = generatePointScale(league.strokePlayPointPreset, playingCount);
      }
    } else {
      pointScale = generatePointScale(league.strokePlayPointPreset, playingCount);
    }

    // Ensure point scale covers all playing teams
    if (pointScale.length < playingCount) {
      console.warn(`Point scale has ${pointScale.length} entries but ${playingCount} teams are playing. Padding with zeros.`);
      while (pointScale.length < playingCount) {
        pointScale.push(0);
      }
    }

    const strokeEntries: StrokePlayEntry[] = previewEntries.map((e) => ({
      teamId: e.teamId,
      netScore: e.netScore,
      grossScore: e.grossScore,
      isDnp: e.isDnp,
    }));

    const pointResults = calculateStrokePlayPoints(
      strokeEntries,
      pointScale,
      league.strokePlayTieMode as "split" | "same",
      {
        showUpBonus: league.strokePlayBonusShow,
        beatHandicapBonus: league.strokePlayBonusBeat,
        baseScore: league.handicapBaseScore,
        dnpPoints: league.strokePlayDnpPoints,
        dnpPenalty: league.strokePlayDnpPenalty,
      }
    );

    // Merge into preview
    const pointsMap = new Map(pointResults.map((r) => [r.teamId, r]));

    const scores: WeeklyScorePreviewEntry[] = previewEntries.map((e) => {
      const pts = pointsMap.get(e.teamId);
      return {
        teamId: e.teamId,
        teamName: e.teamName,
        grossScore: e.grossScore,
        handicap: e.handicap,
        netScore: e.netScore,
        position: pts?.position ?? 0,
        points: pts?.points ?? 0,
        bonusPoints: pts?.bonusPoints ?? 0,
        totalPoints: (pts?.points ?? 0) + (pts?.bonusPoints ?? 0),
        isSub: e.isSub,
        isDnp: e.isDnp,
      };
    });

    // Sort: playing teams by position, DNP at bottom
    scores.sort((a, b) => {
      if (a.isDnp && !b.isDnp) return 1;
      if (!a.isDnp && b.isDnp) return -1;
      return a.position - b.position;
    });

    return {
      success: true,
      data: { weekNumber, isWeekOne, scores },
    };
  } catch (error) {
    logger.error("previewWeeklyScores failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to generate preview." };
  }
}

// --- Submit ---

export async function submitWeeklyScores(
  leagueSlug: string,
  weekNumber: number,
  scores: Array<{
    teamId: number;
    grossScore: number;
    handicap: number;
    netScore: number;
    points: number;
    bonusPoints: number;
    isSub: boolean;
    isDnp: boolean;
    position: number;
  }>
): Promise<ActionResult> {
  try {
    const validated = submitWeeklyScoresSchema.parse({ weekNumber, scores });
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    // Get active season
    const activeSeason = await prisma.season.findFirst({
      where: { leagueId: session.leagueId, isActive: true },
    });

    // Validate all team IDs belong to this league
    const teamIds = validated.scores.map((s) => s.teamId);
    const validTeams = await prisma.team.findMany({
      where: { id: { in: teamIds }, leagueId: session.leagueId },
      select: { id: true },
    });
    if (validTeams.length !== new Set(teamIds).size) {
      return { success: false, error: "One or more teams do not belong to this league." };
    }

    // Pre-validate all scores before entering transaction
    const scoreData = validated.scores.map((score) => {
      const totalPoints = score.points + score.bonusPoints;
      const recalcNetScore = score.isDnp ? 0 : calculateNetScore(score.grossScore, score.handicap);

      if (!score.isDnp && !isFinite(score.handicap)) {
        throw new Error("Invalid handicap value");
      }
      if (!score.isDnp && !isFinite(recalcNetScore)) {
        throw new Error("Invalid net score calculation");
      }

      return { ...score, totalPoints, recalcNetScore };
    });

    // Use interactive transaction with duplicate check inside to prevent TOCTOU race
    await prisma.$transaction(async (tx) => {
      const existing = await tx.weeklyScore.findFirst({
        where: { leagueId: session.leagueId, weekNumber: validated.weekNumber },
      });
      if (existing) {
        throw new Error(`Scores already submitted for Week ${validated.weekNumber}.`);
      }

      for (const score of scoreData) {
        await tx.weeklyScore.create({
          data: {
            weekNumber: validated.weekNumber,
            leagueId: session.leagueId,
            seasonId: activeSeason?.id ?? null,
            teamId: score.teamId,
            grossScore: score.grossScore,
            handicap: score.handicap,
            netScore: score.recalcNetScore,
            points: score.totalPoints,
            position: score.position,
            isSub: score.isSub,
            isDnp: score.isDnp,
          },
        });

        await tx.team.update({
          where: { id: score.teamId },
          data: {
            totalPoints: { increment: score.totalPoints },
          },
        });
      }
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("submitWeeklyScores failed", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid score data" };
    }
    return { success: false, error: error instanceof Error ? error.message : "Failed to submit scores." };
  }
}

// --- History ---

// Public read — no auth required.
export async function getWeeklyScoreHistory(leagueId: number): Promise<WeeklyScoreRecord[]> {
  const scores = await prisma.weeklyScore.findMany({
    where: { leagueId },
    include: {
      team: { select: { id: true, name: true } },
    },
    orderBy: [{ weekNumber: "desc" }, { position: "asc" }],
  });

  return scores.map((s) => ({
    id: s.id,
    weekNumber: s.weekNumber,
    team: s.team,
    grossScore: s.grossScore,
    handicap: s.handicap,
    netScore: s.netScore,
    position: s.position,
    points: s.points,
    isSub: s.isSub,
    isDnp: s.isDnp,
  }));
}

// Public read — no auth required.
export async function getWeeklyScoreHistoryForSeason(seasonId: number): Promise<WeeklyScoreRecord[]> {
  const scores = await prisma.weeklyScore.findMany({
    where: { seasonId },
    include: {
      team: { select: { id: true, name: true } },
    },
    orderBy: [{ weekNumber: "desc" }, { position: "asc" }],
  });

  return scores.map((s) => ({
    id: s.id,
    weekNumber: s.weekNumber,
    team: s.team,
    grossScore: s.grossScore,
    handicap: s.handicap,
    netScore: s.netScore,
    position: s.position,
    points: s.points,
    isSub: s.isSub,
    isDnp: s.isDnp,
  }));
}

// Public read — no auth required.
export async function getTeamWeeklyScores(leagueId: number, teamId: number): Promise<WeeklyScoreRecord[]> {
  const scores = await prisma.weeklyScore.findMany({
    where: { leagueId, teamId },
    include: {
      team: { select: { id: true, name: true } },
    },
    orderBy: { weekNumber: "asc" },
  });

  return scores.map((s) => ({
    id: s.id,
    weekNumber: s.weekNumber,
    team: s.team,
    grossScore: s.grossScore,
    handicap: s.handicap,
    netScore: s.netScore,
    position: s.position,
    points: s.points,
    isSub: s.isSub,
    isDnp: s.isDnp,
  }));
}

// --- Delete ---

export async function deleteWeeklyScores(
  leagueSlug: string,
  weekNumber: number
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    // Get all scores for this week to know how many points to decrement
    const weekScores = await prisma.weeklyScore.findMany({
      where: { leagueId: session.leagueId, weekNumber },
    });

    if (weekScores.length === 0) {
      return { success: false, error: `No scores found for Week ${weekNumber}.` };
    }

    // Use interactive transaction to clamp at zero, then delete
    await prisma.$transaction(async (tx) => {
      for (const score of weekScores) {
        const team = await tx.team.findUniqueOrThrow({
          where: { id: score.teamId },
          select: { totalPoints: true },
        });
        await tx.team.update({
          where: { id: score.teamId },
          data: {
            totalPoints: Math.max(0, team.totalPoints - score.points),
          },
        });
      }

      await tx.weeklyScore.deleteMany({
        where: { leagueId: session.leagueId, weekNumber },
      });
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("deleteWeeklyScores failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete scores." };
  }
}

// --- Current Week ---

// Public read — no auth required.
export async function getCurrentStrokePlayWeek(
  leagueId: number,
  seasonId?: number
): Promise<number> {
  const lastScore = await prisma.weeklyScore.findFirst({
    where: {
      leagueId,
      ...(seasonId ? { seasonId } : {}),
    },
    orderBy: { weekNumber: "desc" },
    select: { weekNumber: true },
  });

  return lastScore ? lastScore.weekNumber + 1 : 1;
}
