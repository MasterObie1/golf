/**
 * Comprehensive Handicap Calculation System
 * Supports multiple calculation methods, score selection, weighting, and application rules
 */

import { z } from "zod";

// ============================================
// TYPES & INTERFACES
// ============================================

export type RoundingMethod = "floor" | "round" | "ceil";
export type ScoreSelectionMethod = "all" | "last_n" | "best_of_last";

/**
 * Complete handicap settings interface with all customization options
 */
export interface HandicapSettings {
  // Basic Formula
  baseScore: number;                    // Subtracted from average (default: 35)
  multiplier: number;                   // Multiplied by difference (default: 0.9)
  rounding: RoundingMethod;             // Rounding method (default: floor)
  defaultHandicap: number;              // When no scores available (default: 0)
  maxHandicap: number | null;           // Maximum handicap cap (9 = default, null = no limit)
  minHandicap: number | null;           // Minimum handicap cap (null = no limit)

  // Score Selection
  scoreSelection: ScoreSelectionMethod; // Which scores to use (default: all)
  scoreCount: number | null;            // For last_n: how many scores
  bestOf: number | null;                // For best_of_last: use best X
  lastOf: number | null;                // For best_of_last: from last Y
  dropHighest: number;                  // Drop N highest before averaging (default: 0)
  dropLowest: number;                   // Drop N lowest before averaging (default: 0)

  // Score Weighting
  useWeighting: boolean;                // Enable recency weighting (default: false)
  weightRecent: number;                 // Weight for most recent score (default: 1.5)
  weightDecay: number;                  // Decay factor per older score (default: 0.9)

  // Exceptional Score Handling
  capExceptional: boolean;              // Cap exceptional scores (default: false)
  exceptionalCap: number | null;        // Maximum score value (null = no cap)

  // Time-Based Rules
  provWeeks: number;                    // Provisional period in weeks (default: 0 = disabled)
  provMultiplier: number;               // Multiplier during provisional (default: 1.0)
  freezeWeek: number | null;            // Freeze after week N (null = never)
  useTrend: boolean;                    // Enable trend adjustment (default: false)
  trendWeight: number;                  // Trend weight factor (default: 0.1)

  // Administrative — checked in action layer, not in calculation engine
  requireApproval: boolean;             // Require approval for changes (default: false)
}

/**
 * Default handicap settings matching original simple formula
 */
export const DEFAULT_HANDICAP_SETTINGS: HandicapSettings = {
  // Basic Formula
  baseScore: 35,
  multiplier: 0.9,
  rounding: "floor",
  defaultHandicap: 0,
  maxHandicap: 9,                    // Maximum handicap cap (9 = default, null = no limit)
  minHandicap: null,

  // Score Selection
  scoreSelection: "all",
  scoreCount: null,
  bestOf: null,
  lastOf: null,
  dropHighest: 0,
  dropLowest: 0,

  // Score Weighting
  useWeighting: false,
  weightRecent: 1.5,
  weightDecay: 0.9,

  // Exceptional Score Handling
  capExceptional: false,
  exceptionalCap: null,

  // Time-Based Rules
  provWeeks: 0,
  provMultiplier: 1.0,
  freezeWeek: null,
  useTrend: false,
  trendWeight: 0.1,

  // Administrative — checked in action layer, not in calculation engine
  requireApproval: false,
};

// ============================================
// PRESET TEMPLATES
// ============================================

export type PresetName = "simple" | "usga_style" | "forgiving" | "competitive" | "strict" | "custom";

export interface PresetTemplate {
  name: PresetName;
  label: string;
  description: string;
  settings: Partial<HandicapSettings>;
}

export const HANDICAP_PRESETS: PresetTemplate[] = [
  {
    name: "simple",
    label: "Simple Average",
    description: "Basic formula using all scores. Good for casual leagues.",
    settings: {
      scoreSelection: "all",
      dropHighest: 0,
      dropLowest: 0,
      useWeighting: false,
    },
  },
  {
    name: "usga_style",
    label: "Best of Recent",
    description: "Best scores from recent rounds. Uses a best-of-last selection method.",
    settings: {
      scoreSelection: "best_of_last",
      bestOf: 4,
      lastOf: 8,
      multiplier: 0.96,
      useWeighting: false,
    },
  },
  {
    name: "forgiving",
    label: "Forgiving",
    description: "Drops worst scores and uses best recent rounds. Great for beginners.",
    settings: {
      scoreSelection: "last_n",
      scoreCount: 5,
      dropHighest: 1,
      dropLowest: 0,
      useWeighting: false,
    },
  },
  {
    name: "competitive",
    label: "Competitive",
    description: "Weights recent scores more heavily for active players.",
    settings: {
      scoreSelection: "all",
      dropHighest: 0,
      dropLowest: 0,
      useWeighting: true,
      weightRecent: 1.3,
      weightDecay: 0.95,
    },
  },
  {
    name: "strict",
    label: "Strict",
    description: "Tight caps and trend adjustment to prevent sandbagging.",
    settings: {
      scoreSelection: "all",
      maxHandicap: 18,
      capExceptional: true,
      exceptionalCap: 50,
      useTrend: true,
      trendWeight: 0.15,
    },
  },
  {
    name: "custom",
    label: "Custom",
    description: "Full control over all settings.",
    settings: {},
  },
];

/**
 * Apply a preset template to current settings
 */
export function applyPreset(
  preset: PresetName,
  current: HandicapSettings = DEFAULT_HANDICAP_SETTINGS
): HandicapSettings {
  const presetTemplate = HANDICAP_PRESETS.find((p) => p.name === preset);
  if (!presetTemplate) {
    console.warn(`Unknown preset name: "${preset}". Returning current settings.`);
    return current;
  }
  if (preset === "custom") {
    return current;
  }
  return { ...DEFAULT_HANDICAP_SETTINGS, ...presetTemplate.settings };
}

// ============================================
// SCORE SELECTION FUNCTIONS
// ============================================

/**
 * Select scores based on the configured selection method
 */
export function selectScores(
  scores: number[],
  settings: HandicapSettings
): number[] {
  if (scores.length === 0) return [];

  let selected = [...scores];

  // Apply selection method
  switch (settings.scoreSelection) {
    case "last_n":
      if (settings.scoreCount != null) {
        if (settings.scoreCount <= 0) {
          selected = [];
          break;
        }
        selected = selected.slice(-settings.scoreCount);
      }
      break;

    case "best_of_last":
      if (settings.bestOf != null && settings.lastOf != null) {
        let effectiveBestOf = settings.bestOf;
        if (effectiveBestOf > settings.lastOf) {
          console.warn(`bestOf (${effectiveBestOf}) > lastOf (${settings.lastOf}). Clamping bestOf to lastOf.`);
          effectiveBestOf = settings.lastOf;
        }
        // Take last N scores with their original indices
        const lastWithIndices = selected.slice(-settings.lastOf).map((val, idx, arr) => ({
          val,
          origIdx: selected.length - arr.length + idx
        }));
        // Sort by value ascending (best = lowest in golf) and take best M
        const bestIndices = [...lastWithIndices]
          .sort((a, b) => a.val - b.val)
          .slice(0, effectiveBestOf)
          .map(item => item.origIdx);
        // Filter selected to only keep those indices, preserving chronological order
        selected = selected.filter((_, idx) => bestIndices.includes(idx));
      }
      break;

    case "all":
    default:
      // Use all scores
      break;
  }

  // Drop highest/lowest scores while preserving chronological order
  if (settings.dropHighest > 0 || settings.dropLowest > 0) {
    const totalDrops = settings.dropHighest + settings.dropLowest;
    if (totalDrops >= selected.length) {
      // Dropping all or more scores than available — return empty
      selected = [];
    } else {
      // Track original indices alongside values
      const indexed = selected.map((val, idx) => ({ val, idx }));
      const dropIndices = new Set<number>();

      if (settings.dropHighest > 0) {
        // Sort descending to find highest values
        const sorted = [...indexed].sort((a, b) => b.val - a.val);
        for (let k = 0; k < settings.dropHighest; k++) {
          dropIndices.add(sorted[k].idx);
        }
      }

      if (settings.dropLowest > 0) {
        // Sort ascending to find lowest values (excluding already-dropped)
        const remaining = indexed.filter(item => !dropIndices.has(item.idx));
        const sorted = [...remaining].sort((a, b) => a.val - b.val);
        for (let k = 0; k < settings.dropLowest && k < sorted.length; k++) {
          dropIndices.add(sorted[k].idx);
        }
      }

      // Filter original array, preserving chronological order
      selected = selected.filter((_, idx) => !dropIndices.has(idx));
    }
  }

  return selected;
}

/**
 * Cap exceptional scores before averaging
 */
export function capExceptionalScores(
  scores: number[],
  settings: HandicapSettings
): number[] {
  if (!settings.capExceptional || settings.exceptionalCap === null) {
    return scores;
  }

  return scores.map((score) =>
    Math.min(score, settings.exceptionalCap as number)
  );
}

// ============================================
// WEIGHTING FUNCTIONS
// ============================================

/**
 * Calculate weighted average with recency weighting
 * More recent scores get higher weight
 */
export function calculateWeightedAverage(
  scores: number[],
  settings: HandicapSettings
): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1 || !settings.useWeighting) {
    // Simple average for single score or when weighting disabled
    return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }

  // Scores are in chronological order (oldest first, newest last)
  // Apply exponential decay: most recent gets weightRecent, each older score multiplied by decay
  let totalWeight = 0;
  let weightedSum = 0;

  for (let i = 0; i < scores.length; i++) {
    // i=0 is oldest, i=length-1 is newest
    const recencyIndex = scores.length - 1 - i; // 0 for newest, higher for older
    const weight = settings.weightRecent * Math.pow(settings.weightDecay, recencyIndex);

    weightedSum += scores[i] * weight;
    totalWeight += weight;
  }

  // Defensive: unreachable with positive weightRecent and weightDecay, but guards against zero-config edge cases
  if (totalWeight === 0) return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  return weightedSum / totalWeight;
}

// ============================================
// TREND CALCULATION
// ============================================

/**
 * Calculate trend adjustment based on recent performance
 * Returns positive value if improving (scores going down), negative if declining
 */
export function calculateTrendAdjustment(
  scores: number[],
  settings: HandicapSettings
): number {
  if (!settings.useTrend || scores.length < 3) {
    return 0;
  }

  // Split scores into halves and compare averages.
  // For odd-length arrays, exclude the middle element for symmetric comparison.
  const midpoint = Math.floor(scores.length / 2);
  const olderScores = scores.slice(0, midpoint);
  const newerScores = scores.length % 2 === 1
    ? scores.slice(midpoint + 1)
    : scores.slice(midpoint);

  const olderAvg = olderScores.reduce((s, v) => s + v, 0) / olderScores.length;
  const newerAvg = newerScores.reduce((s, v) => s + v, 0) / newerScores.length;

  // Positive trend (improvement) = older avg higher than newer avg
  const trend = olderAvg - newerAvg;

  // Apply trend weight and return adjustment
  return trend * settings.trendWeight;
}

// ============================================
// MAIN CALCULATION FUNCTIONS
// ============================================

/**
 * Apply rounding method to a value
 */
function applyRounding(value: number, method: RoundingMethod): number {
  switch (method) {
    case "floor":
      return Math.floor(value);
    case "ceil":
      return Math.ceil(value);
    case "round":
      return Math.round(value);
    default:
      return Math.floor(value);
  }
}

/**
 * Apply min/max caps to handicap
 */
function applyCaps(handicap: number, settings: HandicapSettings): number {
  let result = handicap;

  // If both caps are set and contradictory, skip capping entirely
  if (settings.maxHandicap !== null && settings.minHandicap !== null && settings.maxHandicap < settings.minHandicap) {
    console.warn(`Contradictory handicap caps: max (${settings.maxHandicap}) < min (${settings.minHandicap}). Skipping cap application.`);
    return result;
  }

  if (settings.maxHandicap !== null && result > settings.maxHandicap) {
    result = settings.maxHandicap;
  }

  if (settings.minHandicap !== null && result < settings.minHandicap) {
    result = settings.minHandicap;
  }

  return result;
}

/**
 * Calculate handicap using all configured settings.
 *
 * IMPORTANT: Scores MUST be in chronological order (oldest first, newest last).
 * Many features depend on this ordering, including:
 *   - Recency weighting (newer scores get higher weight)
 *   - "last_n" and "best_of_last" score selection (takes from the end of the array)
 *   - Trend calculation (compares older half vs newer half)
 *   - Freeze week truncation (takes first N entries as earliest weeks)
 * Passing scores in the wrong order will produce incorrect handicaps.
 *
 * @param scores - Array of gross scores in chronological order (oldest first, newest last)
 * @param settings - Complete handicap settings
 * @param weekNumber - Current week number (for provisional/freeze rules)
 * @returns Calculated handicap as whole number
 */
export function calculateHandicap(
  scores: number[],
  settings: HandicapSettings = DEFAULT_HANDICAP_SETTINGS,
  weekNumber?: number
): number {
  // No scores: return default
  if (scores.length === 0) {
    return settings.defaultHandicap;
  }

  let workingScores = [...scores];

  // Freeze week: truncate BEFORE filtering invalid scores to preserve temporal meaning.
  // Each array position corresponds to a calendar week. Truncating first ensures that
  // a score from week 4 can't sneak into a freezeWeek=3 window just because week 1
  // had an invalid score that was filtered out.
  if (weekNumber !== undefined && settings.freezeWeek !== null && settings.freezeWeek > 0 && weekNumber > settings.freezeWeek) {
    workingScores = workingScores.slice(0, settings.freezeWeek);
    if (workingScores.length === 0) {
      return settings.defaultHandicap;
    }
  }

  // Filter out invalid scores (negative or non-finite values) AFTER freeze truncation
  workingScores = workingScores.filter(s => s >= 0 && isFinite(s));
  if (workingScores.length === 0) {
    return settings.defaultHandicap;
  }

  const validScores = workingScores;

  // Step 1: Cap exceptional scores
  let processedScores = capExceptionalScores(validScores, settings);

  // Step 2: Select scores based on method
  processedScores = selectScores(processedScores, settings);

  // If no scores remain after selection, return default
  if (processedScores.length === 0) {
    return settings.defaultHandicap;
  }

  // Step 3: Calculate average (weighted or simple)
  const average = calculateWeightedAverage(processedScores, settings);

  // Step 4: Apply base formula
  let rawHandicap = (average - settings.baseScore) * settings.multiplier;

  // Guard against NaN/Infinity from degenerate inputs
  if (!isFinite(rawHandicap)) return settings.defaultHandicap;

  // Step 5: Apply trend adjustment
  // Positive trend = improving (newer scores lower than older)
  // Subtract to reward improvement with lower handicap (anti-sandbagging)
  const trendAdjustment = calculateTrendAdjustment(processedScores, settings);
  rawHandicap -= trendAdjustment;

  // Step 6: Apply provisional multiplier if applicable
  if (
    weekNumber !== undefined &&
    settings.provWeeks > 0 &&
    weekNumber <= settings.provWeeks
  ) {
    rawHandicap *= settings.provMultiplier;
  }

  // Step 7: Apply rounding
  let handicap = applyRounding(rawHandicap, settings.rounding);

  // Step 8: Apply min/max caps
  handicap = applyCaps(handicap, settings);

  // Final guard against NaN/Infinity
  if (!isFinite(handicap)) return settings.defaultHandicap;

  return handicap;
}

/**
 * Check if two scores are effectively tied, accounting for floating-point imprecision.
 * Uses an epsilon of 0.05 to handle net score rounding artifacts.
 */
export function areScoresTied(a: number, b: number, epsilon: number = 0.05): boolean {
  return Math.abs(a - b) <= epsilon;
}

/**
 * Calculate net score: Gross Score - Handicap
 */
export function calculateNetScore(grossScore: number, handicap: number): number {
  const result = Math.round((grossScore - handicap) * 10) / 10;
  if (!isFinite(result)) {
    console.warn(`calculateNetScore produced non-finite result from grossScore=${grossScore}, handicap=${handicap}`);
    return 0;
  }
  return result;
}

/**
 * Suggest points based on net score comparison (20-point system)
 * Points always sum to 20. Distribution based on net score margin:
 * - Tie: 10/10
 * - Win by 1: 12/8
 * - Win by 2: 13/7
 * - Win by 3: 14/6
 * - Win by 4: 15/5
 * - Win by 5+: 16/4 (max spread)
 */
export function suggestPoints(
  teamANet: number,
  teamBNet: number
): { teamAPoints: number; teamBPoints: number } {
  if (!isFinite(teamANet) || !isFinite(teamBNet)) {
    console.warn(`suggestPoints received non-finite input: teamANet=${teamANet}, teamBNet=${teamBNet}`);
    return { teamAPoints: 10, teamBPoints: 10 };
  }

  const diff = teamANet - teamBNet;

  if (areScoresTied(teamANet, teamBNet)) {
    return { teamAPoints: 10, teamBPoints: 10 };
  }

  // Use ceiling to ensure any fractional stroke advantage is reflected in point margin
  const margin = Math.ceil(Math.abs(diff));
  const winnerPoints = Math.min(11 + margin, 16);
  const loserPoints = 20 - winnerPoints;

  if (diff < 0) {
    // Team A wins (lower net in golf)
    return { teamAPoints: winnerPoints, teamBPoints: loserPoints };
  } else {
    // Team B wins
    return { teamAPoints: loserPoints, teamBPoints: winnerPoints };
  }
}

// ============================================
// STROKE PLAY POINT CALCULATION
// ============================================

export interface StrokePlayEntry {
  teamId: number;
  netScore: number;
  grossScore: number;
  isDnp: boolean;
}

export interface StrokePlayBonusConfig {
  showUpBonus: number;
  beatHandicapBonus: number;
  baseScore: number;
  dnpPoints: number;
  dnpPenalty: number;
}

export interface StrokePlayResult {
  teamId: number;
  position: number;
  points: number;
  bonusPoints: number;
}

/**
 * Calculate position-based points for stroke play scoring.
 *
 * 1. Separate DNP teams from playing teams
 * 2. Sort by netScore ascending (lower = better in golf)
 * 3. Assign positions, handle ties (split or same)
 * 4. Apply bonus points (show-up, beat-handicap)
 * 5. DNP teams get dnpPoints + dnpPenalty
 */
export function calculateStrokePlayPoints(
  entries: StrokePlayEntry[],
  pointScale: number[],
  tieMode: "split" | "same",
  bonusConfig: StrokePlayBonusConfig
): StrokePlayResult[] {
  const playing = entries.filter((e) => !e.isDnp);
  const dnp = entries.filter((e) => e.isDnp);

  // Sort playing teams by net score ascending (lower is better)
  const sorted = [...playing].sort((a, b) => a.netScore - b.netScore);

  // Extend point scale if needed (pad with 0)
  const scale = [...pointScale];
  while (scale.length < sorted.length) {
    scale.push(0);
  }

  // Assign positions and points, handling ties
  const results: StrokePlayResult[] = [];
  let i = 0;
  while (i < sorted.length) {
    // Find all teams tied at this net score (using epsilon for floating-point safety)
    const tiedNetScore = sorted[i].netScore;
    let j = i;
    while (j < sorted.length && areScoresTied(sorted[j].netScore, tiedNetScore)) {
      j++;
    }
    const tiedCount = j - i;
    const position = i + 1; // 1-indexed

    let tiedPoints: number;
    if (tiedCount === 1) {
      tiedPoints = scale[i];
    } else if (tieMode === "split") {
      // Average the points across the tied positions
      let sum = 0;
      for (let k = i; k < j; k++) {
        sum += scale[k];
      }
      tiedPoints = sum / tiedCount;
    } else {
      // "same" — all tied teams get the higher position's points
      tiedPoints = scale[i];
    }

    for (let k = i; k < j; k++) {
      const entry = sorted[k];
      let bonus = bonusConfig.showUpBonus;
      if (entry.netScore < bonusConfig.baseScore) {
        bonus += bonusConfig.beatHandicapBonus;
      }
      results.push({
        teamId: entry.teamId,
        position,
        points: tiedPoints,
        bonusPoints: bonus,
      });
    }

    i = j;
  }

  // DNP teams
  for (const entry of dnp) {
    results.push({
      teamId: entry.teamId,
      position: 0,
      points: bonusConfig.dnpPoints + bonusConfig.dnpPenalty,
      bonusPoints: 0,
    });
  }

  return results;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Zod schema for validating the required league handicap fields from the database.
 * On validation failure, leagueToHandicapSettings falls back to DEFAULT_HANDICAP_SETTINGS.
 */
const leagueHandicapSchema = z.object({
  handicapBaseScore: z.number(),
  handicapMultiplier: z.number(),
  handicapRounding: z.string(),
  handicapDefault: z.number(),
  handicapMax: z.number().nullable(),
});

/**
 * Convert database League record to HandicapSettings
 */
export function leagueToHandicapSettings(league: {
  handicapBaseScore: number;
  handicapMultiplier: number;
  handicapRounding: string;
  handicapDefault: number;
  handicapMax: number | null;
  handicapMin?: number | null;
  handicapScoreSelection?: string;
  handicapScoreCount?: number | null;
  handicapBestOf?: number | null;
  handicapLastOf?: number | null;
  handicapDropHighest?: number;
  handicapDropLowest?: number;
  handicapUseWeighting?: boolean;
  handicapWeightRecent?: number;
  handicapWeightDecay?: number;
  handicapCapExceptional?: boolean;
  handicapExceptionalCap?: number | null;
  handicapProvWeeks?: number;
  handicapProvMultiplier?: number;
  handicapFreezeWeek?: number | null;
  handicapUseTrend?: boolean;
  handicapTrendWeight?: number;
  handicapRequireApproval?: boolean;
}): HandicapSettings {
  // Validate required fields — on failure, return safe defaults
  const parsed = leagueHandicapSchema.safeParse(league);
  if (!parsed.success) {
    console.warn("Invalid league handicap data, using defaults:", parsed.error.issues);
    return { ...DEFAULT_HANDICAP_SETTINGS };
  }

  const validRounding: string[] = ["floor", "round", "ceil"];
  const validScoreSelection: string[] = ["all", "last_n", "best_of_last"];

  return {
    // Basic Formula
    baseScore: league.handicapBaseScore,
    multiplier: league.handicapMultiplier,
    rounding: validRounding.includes(league.handicapRounding)
      ? (league.handicapRounding as RoundingMethod)
      : "floor",
    defaultHandicap: league.handicapDefault,
    maxHandicap: league.handicapMax,
    minHandicap: league.handicapMin ?? null,

    // Score Selection
    scoreSelection: league.handicapScoreSelection && validScoreSelection.includes(league.handicapScoreSelection)
      ? (league.handicapScoreSelection as ScoreSelectionMethod)
      : "all",
    scoreCount: league.handicapScoreCount ?? null,
    bestOf: league.handicapBestOf ?? null,
    lastOf: league.handicapLastOf ?? null,
    dropHighest: league.handicapDropHighest ?? 0,
    dropLowest: league.handicapDropLowest ?? 0,

    // Score Weighting
    useWeighting: league.handicapUseWeighting ?? false,
    weightRecent: league.handicapWeightRecent ?? 1.5,
    weightDecay: league.handicapWeightDecay ?? 0.9,

    // Exceptional Score Handling
    capExceptional: league.handicapCapExceptional ?? false,
    exceptionalCap: league.handicapExceptionalCap ?? null,

    // Time-Based Rules
    provWeeks: league.handicapProvWeeks ?? 0,
    provMultiplier: league.handicapProvMultiplier ?? 1.0,
    freezeWeek: league.handicapFreezeWeek ?? null,
    useTrend: league.handicapUseTrend ?? false,
    trendWeight: league.handicapTrendWeight ?? 0.1,

    // Administrative
    requireApproval: league.handicapRequireApproval ?? false,
  };
}

/**
 * Describe how a handicap was calculated (for UI explanation)
 */
export function describeCalculation(
  scores: number[],
  settings: HandicapSettings,
  finalHandicap: number,
  weekNumber?: number
): string[] {
  const steps: string[] = [];

  if (scores.length === 0) {
    steps.push(`No scores available, using default handicap: ${settings.defaultHandicap}`);
    return steps;
  }

  let workingScores = [...scores];

  // Apply freeze week truncation FIRST (matching calculateHandicap behavior)
  // This preserves temporal meaning: each position = a calendar week
  if (weekNumber !== undefined && settings.freezeWeek !== null && settings.freezeWeek > 0 && weekNumber > settings.freezeWeek) {
    workingScores = workingScores.slice(0, settings.freezeWeek);
    steps.push(`Freeze week ${settings.freezeWeek}: using only first ${workingScores.length} score(s)`);
    if (workingScores.length === 0) {
      steps.push(`No scores in freeze period, using default handicap: ${settings.defaultHandicap}`);
      return steps;
    }
  }

  // Filter out invalid scores (negative or non-finite values) AFTER freeze truncation
  const preFilterCount = workingScores.length;
  workingScores = workingScores.filter(s => s >= 0 && isFinite(s));
  if (workingScores.length < preFilterCount) {
    steps.push(`Filtered ${preFilterCount - workingScores.length} invalid score(s) (negative or non-finite)`);
  }
  if (workingScores.length === 0) {
    steps.push(`No valid scores remaining, using default handicap: ${settings.defaultHandicap}`);
    return steps;
  }

  // Score selection
  let selectedScores = capExceptionalScores(workingScores, settings);
  if (settings.capExceptional && settings.exceptionalCap !== null) {
    steps.push(`Capped exceptional scores at ${settings.exceptionalCap}`);
  }

  selectedScores = selectScores(selectedScores, settings);

  switch (settings.scoreSelection) {
    case "last_n":
      steps.push(`Using last ${settings.scoreCount} scores: [${selectedScores.join(", ")}]`);
      break;
    case "best_of_last":
      steps.push(`Using best ${settings.bestOf} of last ${settings.lastOf} scores: [${selectedScores.join(", ")}]`);
      break;
    default:
      steps.push(`Using all ${selectedScores.length} scores: [${selectedScores.join(", ")}]`);
  }

  if (settings.dropHighest > 0) {
    steps.push(`Dropped ${settings.dropHighest} highest score(s)`);
  }
  if (settings.dropLowest > 0) {
    steps.push(`Dropped ${settings.dropLowest} lowest score(s)`);
  }

  // Average calculation
  const average = calculateWeightedAverage(selectedScores, settings);
  if (settings.useWeighting) {
    steps.push(`Weighted average (recent: ${settings.weightRecent}x, decay: ${settings.weightDecay}): ${average.toFixed(2)}`);
  } else {
    steps.push(`Simple average: ${average.toFixed(2)}`);
  }

  // Formula
  const raw = (average - settings.baseScore) * settings.multiplier;
  steps.push(`Formula: (${average.toFixed(2)} - ${settings.baseScore}) × ${settings.multiplier} = ${raw.toFixed(2)}`);

  // Trend — computed on the final selected scores (after selection + drops), matching calculateHandicap
  const trendAdjustment = settings.useTrend ? calculateTrendAdjustment(selectedScores, settings) : 0;
  if (settings.useTrend && trendAdjustment !== 0) {
    steps.push(`Trend adjustment: ${trendAdjustment > 0 ? "-" : "+"}${Math.abs(trendAdjustment).toFixed(2)} (${trendAdjustment > 0 ? "improving" : "declining"})`);
  }

  // Provisional multiplier
  if (weekNumber !== undefined && settings.provWeeks > 0 && weekNumber <= settings.provWeeks) {
    steps.push(`Provisional period (week ${weekNumber}/${settings.provWeeks}): multiplied by ${settings.provMultiplier}`);
  }

  // Compute the uncapped handicap to determine if capping was actually applied
  let uncapped = raw;
  uncapped -= trendAdjustment;
  if (weekNumber !== undefined && settings.provWeeks > 0 && weekNumber <= settings.provWeeks) {
    uncapped *= settings.provMultiplier;
  }
  // Round first, then check caps — matching the order of operations in calculateHandicap
  // (which rounds at step 7, then caps at step 8)
  uncapped = applyRounding(uncapped, settings.rounding);

  // Rounding
  steps.push(`Rounded (${settings.rounding}): ${finalHandicap}`);

  // Caps — compare the rounded value to detect if capping was actually applied
  if (settings.maxHandicap !== null && uncapped > settings.maxHandicap) {
    steps.push(`Capped at maximum: ${settings.maxHandicap}`);
  }
  if (settings.minHandicap !== null && uncapped < settings.minHandicap) {
    steps.push(`Capped at minimum: ${settings.minHandicap}`);
  }

  return steps;
}
