"use server";

import { z } from "zod";
import { prisma } from "../db";
import {
  calculateHandicap,
  calculateNetScore,
  suggestPoints,
  type ScoreSelectionMethod,
  type RoundingMethod,
} from "../handicap";
import { requireLeagueAdmin } from "../auth";
import { getHandicapSettings } from "./handicap-settings";

const updateLeagueSettingsSchema = z.object({
  maxTeams: z.number().int().min(1, "Must have at least 1 team slot").max(256, "Maximum 256 teams"),
  registrationOpen: z.boolean(),
});

export async function updateLeagueSettings(
  leagueSlug: string,
  maxTeams: number,
  registrationOpen: boolean
) {
  const validated = updateLeagueSettingsSchema.parse({ maxTeams, registrationOpen });
  const session = await requireLeagueAdmin(leagueSlug);

  return prisma.league.update({
    where: { id: session.leagueId },
    data: { maxTeams: validated.maxTeams, registrationOpen: validated.registrationOpen },
  });
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
});

export async function updateHandicapSettings(
  leagueSlug: string,
  settings: HandicapSettingsInput
) {
  const validated = updateHandicapSettingsSchema.parse(settings);
  const session = await requireLeagueAdmin(leagueSlug);

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
