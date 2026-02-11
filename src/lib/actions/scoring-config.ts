"use server";

import { z } from "zod";
import { prisma } from "../db";
import { requireLeagueAdmin } from "../auth";
import { requireActiveLeague } from "./leagues";
import { type ActionResult } from "./shared";

// --- Types ---

export interface ScoringConfig {
  scoringType: string;
  strokePlayPointScale: number[] | null;
  strokePlayPointPreset: string;
  strokePlayBonusShow: number;
  strokePlayBonusBeat: number;
  strokePlayDnpPoints: number;
  strokePlayTieMode: string;
  strokePlayDnpPenalty: number;
  strokePlayMaxDnp: number | null;
  strokePlayProRate: boolean;
  hybridFieldWeight: number;
  hybridFieldPointScale: number[] | null;
}

export interface ScheduleConfig {
  scheduleType: string | null;
  scheduleVisibility: string;
  byePointsMode: string;
  byePointsFlat: number;
  scheduleExtraWeeks: string;
  midSeasonAddDefault: string;
  midSeasonRemoveAction: string;
  playoffWeeks: number;
  playoffTeams: number;
  playoffFormat: string;
  playMode: string;
  playModeFirstWeekSide: string;
}

// Point scale utilities are in @/lib/scoring-utils (shared client/server)

// --- Getters ---

export async function getScoringConfig(leagueSlug: string): Promise<ScoringConfig> {
  const session = await requireLeagueAdmin(leagueSlug);
  const leagueId = session.leagueId;

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: {
      scoringType: true,
      strokePlayPointScale: true,
      strokePlayPointPreset: true,
      strokePlayBonusShow: true,
      strokePlayBonusBeat: true,
      strokePlayDnpPoints: true,
      strokePlayTieMode: true,
      strokePlayDnpPenalty: true,
      strokePlayMaxDnp: true,
      strokePlayProRate: true,
      hybridFieldWeight: true,
      hybridFieldPointScale: true,
    },
  });

  const pointScaleSchema = z.array(z.number());

  let strokePlayPointScale: number[] | null = null;
  if (league.strokePlayPointScale) {
    try {
      const parsed = JSON.parse(league.strokePlayPointScale);
      const result = pointScaleSchema.safeParse(parsed);
      strokePlayPointScale = result.success ? result.data : null;
    } catch {
      // Invalid JSON — fall back to null
    }
  }

  let hybridFieldPointScale: number[] | null = null;
  if (league.hybridFieldPointScale) {
    try {
      const parsed = JSON.parse(league.hybridFieldPointScale);
      const result = pointScaleSchema.safeParse(parsed);
      hybridFieldPointScale = result.success ? result.data : null;
    } catch {
      // Invalid JSON — fall back to null
    }
  }

  return {
    ...league,
    strokePlayPointScale,
    hybridFieldPointScale,
  };
}

export async function getScheduleConfig(leagueId: number): Promise<ScheduleConfig> {
  return prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: {
      scheduleType: true,
      scheduleVisibility: true,
      byePointsMode: true,
      byePointsFlat: true,
      scheduleExtraWeeks: true,
      midSeasonAddDefault: true,
      midSeasonRemoveAction: true,
      playoffWeeks: true,
      playoffTeams: true,
      playoffFormat: true,
      playMode: true,
      playModeFirstWeekSide: true,
    },
  });
}

// --- Updaters ---

const descendingOrder = (arr: number[] | null) => {
  if (!arr || arr.length <= 1) return true;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[i - 1]) return false;
  }
  return true;
};

const descendingOrderMessage = { message: "Point scale must be in descending order (highest points first)" };

const scoringConfigSchema = z.object({
  scoringType: z.enum(["match_play", "stroke_play", "hybrid"]),
  strokePlayPointPreset: z.enum(["linear", "weighted", "pga_style", "custom"]),
  strokePlayPointScale: z.array(z.number().min(0)).nullable().refine(descendingOrder, descendingOrderMessage),
  strokePlayBonusShow: z.number().min(0),
  strokePlayBonusBeat: z.number().min(0),
  strokePlayDnpPoints: z.number().min(0),
  strokePlayTieMode: z.enum(["split", "same"]),
  strokePlayDnpPenalty: z.number().max(0),
  strokePlayMaxDnp: z.number().int().min(1).nullable(),
  strokePlayProRate: z.boolean(),
  hybridFieldWeight: z.number().min(0).max(1),
  hybridFieldPointScale: z.array(z.number().min(0)).nullable().refine(descendingOrder, descendingOrderMessage),
});

export type ScoringConfigInput = z.infer<typeof scoringConfigSchema>;

export async function updateScoringConfig(
  leagueSlug: string,
  config: ScoringConfigInput
): Promise<ActionResult> {
  try {
    const validated = scoringConfigSchema.parse(config);
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    await prisma.league.update({
      where: { id: session.leagueId },
      data: {
        scoringType: validated.scoringType,
        strokePlayPointPreset: validated.strokePlayPointPreset,
        strokePlayPointScale: validated.strokePlayPointScale
          ? JSON.stringify(validated.strokePlayPointScale)
          : null,
        strokePlayBonusShow: validated.strokePlayBonusShow,
        strokePlayBonusBeat: validated.strokePlayBonusBeat,
        strokePlayDnpPoints: validated.strokePlayDnpPoints,
        strokePlayTieMode: validated.strokePlayTieMode,
        strokePlayDnpPenalty: validated.strokePlayDnpPenalty,
        strokePlayMaxDnp: validated.strokePlayMaxDnp,
        strokePlayProRate: validated.strokePlayProRate,
        hybridFieldWeight: validated.hybridFieldWeight,
        hybridFieldPointScale: validated.hybridFieldPointScale
          ? JSON.stringify(validated.hybridFieldPointScale)
          : null,
      },
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid scoring config" };
    }
    return { success: false, error: "Failed to update scoring configuration." };
  }
}

const scheduleConfigSchema = z.object({
  scheduleVisibility: z.enum(["full", "current_week", "hidden"]),
  byePointsMode: z.enum(["zero", "flat", "league_average", "team_average"]),
  byePointsFlat: z.number().min(0),
  scheduleExtraWeeks: z.enum(["flex", "continue_round"]),
  midSeasonAddDefault: z.enum(["start_from_here", "fill_byes", "pro_rate", "catch_up"]),
  midSeasonRemoveAction: z.enum(["bye_opponents", "regenerate"]),
  playoffWeeks: z.number().int().min(0).max(4),
  playoffTeams: z.number().int().min(2).max(8),
  playoffFormat: z.enum(["single_elimination", "double_elimination", "round_robin"]),
  playMode: z.enum(["full_18", "nine_hole_alternating", "nine_hole_front", "nine_hole_back"]),
  playModeFirstWeekSide: z.enum(["front", "back"]),
});

export type ScheduleConfigInput = z.infer<typeof scheduleConfigSchema>;

export async function updateScheduleConfig(
  leagueSlug: string,
  config: ScheduleConfigInput
): Promise<ActionResult> {
  try {
    const validated = scheduleConfigSchema.parse(config);
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    await prisma.league.update({
      where: { id: session.leagueId },
      data: validated,
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid schedule config" };
    }
    return { success: false, error: "Failed to update schedule configuration." };
  }
}
