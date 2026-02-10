"use server";

import { z } from "zod";
import { prisma } from "../db";
import {
  calculateHandicap,
  calculateNetScore,
  suggestPoints,
  leagueToHandicapSettings,
  type ScoreSelectionMethod,
  type RoundingMethod,
} from "../handicap";
import { requireLeagueAdmin } from "../auth";
import { logger } from "../logger";
import { requireActiveLeague } from "./leagues";
import type { ActionResult } from "./shared";

const updateLeagueSettingsSchema = z.object({
  maxTeams: z.number().int().min(1, "Must have at least 1 team slot").max(256, "Maximum 256 teams"),
  registrationOpen: z.boolean(),
});

export async function updateLeagueSettings(
  leagueSlug: string,
  maxTeams: number,
  registrationOpen: boolean
): Promise<ActionResult<{ maxTeams: number; registrationOpen: boolean }>> {
  try {
    const validated = updateLeagueSettingsSchema.parse({ maxTeams, registrationOpen });
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    await prisma.league.update({
      where: { id: session.leagueId },
      data: { maxTeams: validated.maxTeams, registrationOpen: validated.registrationOpen },
    });

    return { success: true, data: { maxTeams: validated.maxTeams, registrationOpen: validated.registrationOpen } };
  } catch (error) {
    logger.error("updateLeagueSettings failed", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid input" };
    }
    return { success: false, error: error instanceof Error ? error.message : "Failed to update league settings" };
  }
}

export async function updateScorecardSettings(
  leagueSlug: string,
  scorecardMode: "disabled" | "optional" | "required",
  scorecardRequireApproval: boolean
): Promise<ActionResult> {
  try {
    z.enum(["disabled", "optional", "required"]).parse(scorecardMode);
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    await prisma.league.update({
      where: { id: session.leagueId },
      data: { scorecardMode, scorecardRequireApproval },
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("updateScorecardSettings failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update scorecard settings" };
  }
}

export interface HandicapSettingsInput {
  // Basic Formula
  baseScore: number;
  multiplier: number;
  rounding: RoundingMethod;
  defaultHandicap: number;
  maxHandicap: number | null;
  minHandicap: number | null;

  // Score Selection
  scoreSelection: ScoreSelectionMethod;
  scoreCount: number | null;
  bestOf: number | null;
  lastOf: number | null;
  dropHighest: number;
  dropLowest: number;

  // Score Weighting
  useWeighting: boolean;
  weightRecent: number;
  weightDecay: number;

  // Exceptional Score Handling
  capExceptional: boolean;
  exceptionalCap: number | null;

  // Time-Based Rules
  provWeeks: number;
  provMultiplier: number;
  freezeWeek: number | null;
  useTrend: boolean;
  trendWeight: number;

  // Administrative
  requireApproval: boolean;
}

const updateHandicapSettingsSchema = z.object({
  baseScore: z.number().min(0).max(200),
  multiplier: z.number().min(0).max(5),
  rounding: z.enum(["floor", "round", "ceil"]),
  defaultHandicap: z.number().min(-50).max(100),
  maxHandicap: z.number().min(0).max(200).nullable(),
  minHandicap: z.number().min(-50).max(100).nullable(),
  scoreSelection: z.enum(["all", "last_n", "best_of_last"]),
  scoreCount: z.number().int().min(1).max(100).nullable(),
  bestOf: z.number().int().min(1).max(100).nullable(),
  lastOf: z.number().int().min(1).max(100).nullable(),
  dropHighest: z.number().int().min(0).max(50),
  dropLowest: z.number().int().min(0).max(50),
  useWeighting: z.boolean(),
  weightRecent: z.number().min(0).max(10),
  weightDecay: z.number().min(0).max(2),
  capExceptional: z.boolean(),
  exceptionalCap: z.number().min(0).max(200).nullable(),
  provWeeks: z.number().int().min(0).max(52),
  provMultiplier: z.number().min(0).max(5),
  freezeWeek: z.number().int().min(1).max(52).nullable(),
  useTrend: z.boolean(),
  trendWeight: z.number().min(0).max(1),
  requireApproval: z.boolean(),
}).refine(
  (data) => (data.dropHighest ?? 0) + (data.dropLowest ?? 0) <= 20,
  { message: "Combined drop count cannot exceed 20" }
).refine(
  (data) => {
    if (data.maxHandicap != null && data.minHandicap != null) {
      return data.maxHandicap >= data.minHandicap;
    }
    return true;
  },
  { message: "Maximum handicap must be greater than or equal to minimum handicap" }
).refine(
  (data) => {
    if (data.scoreSelection === "best_of_last") {
      return data.bestOf != null && data.lastOf != null;
    }
    return true;
  },
  { message: "Best-of and last-of counts are required when using best-of-last selection" }
).refine(
  (data) => {
    if (data.scoreSelection === "last_n") {
      return data.scoreCount != null;
    }
    return true;
  },
  { message: "Score count is required when using last-N selection" }
).refine(
  (data) => {
    if (data.scoreSelection === "best_of_last" && data.bestOf != null && data.lastOf != null) {
      return data.bestOf <= data.lastOf;
    }
    return true;
  },
  { message: "Best-of count must be less than or equal to last-of count" }
);

export async function updateHandicapSettings(
  leagueSlug: string,
  settings: HandicapSettingsInput
): Promise<ActionResult> {
  try {
    const validated = updateHandicapSettingsSchema.parse(settings);
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    // Update the settings
    await prisma.league.update({
      where: { id: session.leagueId },
      data: {
        // Basic Formula
        handicapBaseScore: validated.baseScore,
        handicapMultiplier: validated.multiplier,
        handicapRounding: validated.rounding,
        handicapDefault: validated.defaultHandicap,
        handicapMax: validated.maxHandicap,
        handicapMin: validated.minHandicap,

        // Score Selection
        handicapScoreSelection: validated.scoreSelection,
        handicapScoreCount: validated.scoreCount,
        handicapBestOf: validated.bestOf,
        handicapLastOf: validated.lastOf,
        handicapDropHighest: validated.dropHighest,
        handicapDropLowest: validated.dropLowest,

        // Score Weighting
        handicapUseWeighting: validated.useWeighting,
        handicapWeightRecent: validated.weightRecent,
        handicapWeightDecay: validated.weightDecay,

        // Exceptional Score Handling
        handicapCapExceptional: validated.capExceptional,
        handicapExceptionalCap: validated.exceptionalCap,

        // Time-Based Rules
        handicapProvWeeks: validated.provWeeks,
        handicapProvMultiplier: validated.provMultiplier,
        handicapFreezeWeek: validated.freezeWeek,
        handicapUseTrend: validated.useTrend,
        handicapTrendWeight: validated.trendWeight,

        // Administrative
        handicapRequireApproval: validated.requireApproval,
      },
    });

    // Recalculate all matchups and team stats with new settings
    await recalculateLeagueStats(session.leagueId);

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("updateHandicapSettings failed", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid input" };
    }
    return { success: false, error: error instanceof Error ? error.message : "Failed to update handicap settings" };
  }
}

/**
 * Recalculate all matchup handicaps, net scores, points, and team stats
 * Used when handicap settings change.
 * Wrapped in a transaction for atomicity — all updates succeed or none do.
 */
// TODO: Add auth check if exposed as a server action
export async function recalculateLeagueStats(leagueId: number) {
  await prisma.$transaction(async (tx) => {
    // Read handicap settings inside the transaction for consistency
    const league = await tx.league.findUniqueOrThrow({
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
    const handicapSettings = leagueToHandicapSettings(league);
    // Get all matchups ordered by week across all seasons (intentional — handicap settings
    // are league-wide and recalculation must cover all historical data for consistency)
    const matchups = await tx.matchup.findMany({
      where: { leagueId },
      orderBy: [{ weekNumber: "asc" }, { id: "asc" }],
    });

    // If no matchups, just ensure team stats are zeroed and return.
    // This is expected for stroke_play leagues that have no matchups.
    // NOTE: Weekly score recalculation for stroke_play/hybrid is not yet
    // implemented here — this function only processes matchup-based handicaps
    // and team W/L/T stats. Stroke play field points are managed via
    // the weekly-scores module.
    if (matchups.length === 0) {
      await tx.team.updateMany({
        where: { leagueId },
        data: { totalPoints: 0, wins: 0, losses: 0, ties: 0 },
      });
      return;
    }

    // Initialize score arrays for ALL teams up-front so that teams with only
    // forfeits (or no matchups at all) still have an entry when calculateHandicap
    // is called during the aggregation phase.
    const allTeams = await tx.team.findMany({ where: { leagueId }, select: { id: true } });
    const teamScores: Record<number, number[]> = {};
    for (const team of allTeams) {
      teamScores[team.id] = [];
    }

    // Track updated points for aggregation (avoids N+1 re-queries)
    const matchupResults: Array<{
      teamAId: number;
      teamBId: number;
      teamAPoints: number;
      teamBPoints: number;
    }> = [];

    // Process each matchup in order
    for (const matchup of matchups) {
      // Forfeits keep fixed points — include in aggregation but skip handicap recalc
      if (matchup.isForfeit) {
        matchupResults.push({
          teamAId: matchup.teamAId,
          teamBId: matchup.teamBId,
          teamAPoints: matchup.teamAPoints,
          teamBPoints: matchup.teamBPoints,
        });
        continue;
      }

      // Calculate handicaps
      let teamAHandicap: number;
      let teamBHandicap: number;

      if (matchup.weekNumber === 1) {
        // Week 1: Keep original manual handicaps
        teamAHandicap = matchup.teamAHandicap;
        teamBHandicap = matchup.teamBHandicap;
      } else {
        // For subs, keep original handicap; otherwise recalculate
        teamAHandicap = matchup.teamAIsSub
          ? matchup.teamAHandicap
          : calculateHandicap(teamScores[matchup.teamAId], handicapSettings, matchup.weekNumber);
        teamBHandicap = matchup.teamBIsSub
          ? matchup.teamBHandicap
          : calculateHandicap(teamScores[matchup.teamBId], handicapSettings, matchup.weekNumber);
      }

      if (!isFinite(teamAHandicap) || !isFinite(teamBHandicap)) {
        throw new Error(`Invalid handicap calculation for matchup ${matchup.id}`);
      }

      // Calculate new net scores
      const teamANet = calculateNetScore(matchup.teamAGross, teamAHandicap);
      const teamBNet = calculateNetScore(matchup.teamBGross, teamBHandicap);

      if (!isFinite(teamANet) || !isFinite(teamBNet)) {
        throw new Error(`Invalid net score calculation for matchup ${matchup.id}`);
      }

      // Calculate new points based on net scores
      const { teamAPoints, teamBPoints } = suggestPoints(teamANet, teamBNet);

      if (!isFinite(teamAPoints) || !isFinite(teamBPoints)) {
        throw new Error(`Invalid points calculation for matchup ${matchup.id}`);
      }

      // Update the matchup
      await tx.matchup.update({
        where: { id: matchup.id },
        data: { teamAHandicap, teamBHandicap, teamANet, teamBNet, teamAPoints, teamBPoints },
      });

      // Track for team stat aggregation
      matchupResults.push({
        teamAId: matchup.teamAId,
        teamBId: matchup.teamBId,
        teamAPoints,
        teamBPoints,
      });

      // Add scores to history for future handicap calculations (non-subs only)
      if (!matchup.teamAIsSub) {
        teamScores[matchup.teamAId].push(matchup.teamAGross);
      }
      if (!matchup.teamBIsSub) {
        teamScores[matchup.teamBId].push(matchup.teamBGross);
      }
    }

    // Recalculate team aggregate stats from in-memory matchup results (no N+1 queries)
    // Reuse allTeams fetched at the start of the transaction
    for (const team of allTeams) {
      let totalPoints = 0;
      let wins = 0;
      let losses = 0;
      let ties = 0;

      for (const m of matchupResults) {
        if (m.teamAId === team.id) {
          totalPoints += m.teamAPoints;
          if (m.teamAPoints > m.teamBPoints) wins++;
          else if (m.teamAPoints < m.teamBPoints) losses++;
          else ties++;
        } else if (m.teamBId === team.id) {
          totalPoints += m.teamBPoints;
          if (m.teamBPoints > m.teamAPoints) wins++;
          else if (m.teamBPoints < m.teamAPoints) losses++;
          else ties++;
        }
      }

      await tx.team.update({
        where: { id: team.id },
        data: { totalPoints, wins, losses, ties },
      });
    }
  });
}
