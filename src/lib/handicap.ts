/**
 * Comprehensive Handicap Calculation System
 * Supports multiple calculation methods, score selection, weighting, and application rules
 */

// ============================================
// TYPES & INTERFACES
// ============================================

export type RoundingMethod = "floor" | "round" | "ceil";
export type ScoreSelectionMethod = "all" | "last_n" | "best_of_last";
export type AllowanceType = "full" | "percentage" | "difference";

/**
 * Complete handicap settings interface with all customization options
 */
export interface HandicapSettings {
  // Basic Formula
  baseScore: number;                    // Subtracted from average (default: 35)
  multiplier: number;                   // Multiplied by difference (default: 0.9)
  rounding: RoundingMethod;             // Rounding method (default: floor)
  defaultHandicap: number;              // When no scores available (default: 0)
  maxHandicap: number | null;           // Maximum handicap cap (null = no limit)
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

  // Application Rules
  percentage: number;                   // Apply X% of handicap (default: 100)
  maxStrokes: number | null;            // Max strokes between competitors (null = no limit)
  allowanceType: AllowanceType;         // How to apply handicap (default: full)

  // Time-Based Rules
  provWeeks: number;                    // Provisional period in weeks (default: 0 = disabled)
  provMultiplier: number;               // Multiplier during provisional (default: 1.0)
  freezeWeek: number | null;            // Freeze after week N (null = never)
  useTrend: boolean;                    // Enable trend adjustment (default: false)
  trendWeight: number;                  // Trend weight factor (default: 0.1)

  // Administrative
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
  maxHandicap: null,
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

  // Application Rules
  percentage: 100,
  maxStrokes: null,
  allowanceType: "full",

  // Time-Based Rules
  provWeeks: 0,
  provMultiplier: 1.0,
  freezeWeek: null,
  useTrend: false,
  trendWeight: 0.1,

  // Administrative
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
      percentage: 100,
    },
  },
  {
    name: "usga_style",
    label: "USGA-Inspired",
    description: "Best scores from recent rounds, similar to official handicap system.",
    settings: {
      scoreSelection: "best_of_last",
      bestOf: 4,
      lastOf: 8,
      multiplier: 0.96,
      useWeighting: false,
      percentage: 100,
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
      percentage: 100,
    },
  },
  {
    name: "competitive",
    label: "Competitive",
    description: "Uses 80% of handicap, giving slight edge to better players.",
    settings: {
      scoreSelection: "all",
      dropHighest: 0,
      dropLowest: 0,
      useWeighting: true,
      weightRecent: 1.3,
      weightDecay: 0.95,
      percentage: 80,
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
      percentage: 100,
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
  if (!presetTemplate || preset === "custom") {
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
      if (settings.scoreCount && settings.scoreCount > 0) {
        // Take only the last N scores (scores should be in chronological order)
        selected = selected.slice(-settings.scoreCount);
      }
      break;

    case "best_of_last":
      if (settings.bestOf && settings.lastOf) {
        // First, take the last Y scores
        const lastScores = selected.slice(-settings.lastOf);
        // Then, sort and take the best (lowest) X
        const sorted = [...lastScores].sort((a, b) => a - b);
        selected = sorted.slice(0, settings.bestOf);
      }
      break;

    case "all":
    default:
      // Use all scores
      break;
  }

  // Drop highest scores
  if (settings.dropHighest > 0 && selected.length > settings.dropHighest) {
    const sorted = [...selected].sort((a, b) => a - b);
    // Remove the highest N (last N when sorted ascending)
    selected = sorted.slice(0, -settings.dropHighest);
  }

  // Drop lowest scores
  if (settings.dropLowest > 0 && selected.length > settings.dropLowest) {
    const sorted = [...selected].sort((a, b) => a - b);
    // Remove the lowest N (first N when sorted ascending)
    selected = sorted.slice(settings.dropLowest);
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

  // Split scores into halves and compare averages
  const midpoint = Math.floor(scores.length / 2);
  const olderScores = scores.slice(0, midpoint);
  const newerScores = scores.slice(midpoint);

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
function applyCaps(
  handicap: number,
  settings: HandicapSettings
): number {
  let result = handicap;

  if (settings.maxHandicap !== null && result > settings.maxHandicap) {
    result = settings.maxHandicap;
  }

  if (settings.minHandicap !== null && result < settings.minHandicap) {
    result = settings.minHandicap;
  }

  return result;
}

/**
 * Calculate handicap using all configured settings
 *
 * @param scores - Array of gross scores in chronological order (oldest first)
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

  // Check freeze week
  if (weekNumber !== undefined && settings.freezeWeek !== null && weekNumber > settings.freezeWeek) {
    // When frozen, we should use the handicap from freeze week
    // This is handled at a higher level - caller should pass frozen handicap
    // For now, just calculate normally
  }

  // Step 1: Cap exceptional scores
  let processedScores = capExceptionalScores(scores, settings);

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

  // Step 5: Apply trend adjustment
  // Positive trend = improving (newer scores lower than older)
  // Subtract to reward improvement with lower handicap (anti-sandbagging)
  const trendAdjustment = calculateTrendAdjustment(scores, settings);
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

  return handicap;
}

/**
 * Calculate the applied handicap (after percentage adjustment)
 */
export function getAppliedHandicap(
  calculatedHandicap: number,
  settings: HandicapSettings
): number {
  const applied = calculatedHandicap * (settings.percentage / 100);
  return applyRounding(applied, settings.rounding);
}

/**
 * Calculate net score: Gross Score - Applied Handicap
 */
export function calculateNetScore(grossScore: number, handicap: number): number {
  return Math.round((grossScore - handicap) * 10) / 10;
}

/**
 * Calculate strokes given between two competitors based on allowance type
 */
export function calculateStrokesGiven(
  handicapA: number,
  handicapB: number,
  settings: HandicapSettings
): { strokesA: number; strokesB: number } {
  let strokesA = handicapA;
  let strokesB = handicapB;

  switch (settings.allowanceType) {
    case "difference":
      // Only lower handicap player gives strokes based on difference
      const diff = Math.abs(handicapA - handicapB);
      if (handicapA > handicapB) {
        strokesA = diff;
        strokesB = 0;
      } else if (handicapB > handicapA) {
        strokesA = 0;
        strokesB = diff;
      } else {
        strokesA = 0;
        strokesB = 0;
      }
      break;

    case "percentage":
      // Apply percentage (already calculated in getAppliedHandicap, but can apply here too)
      strokesA = getAppliedHandicap(handicapA, settings);
      strokesB = getAppliedHandicap(handicapB, settings);
      break;

    case "full":
    default:
      // Full handicap for each player
      break;
  }

  // Apply max strokes limit
  if (settings.maxStrokes !== null) {
    const strokeDiff = Math.abs(strokesA - strokesB);
    if (strokeDiff > settings.maxStrokes) {
      // Reduce the higher handicap to maintain max difference
      if (strokesA > strokesB) {
        strokesA = strokesB + settings.maxStrokes;
      } else {
        strokesB = strokesA + settings.maxStrokes;
      }
    }
  }

  return {
    strokesA: Math.max(0, applyRounding(strokesA, settings.rounding)),
    strokesB: Math.max(0, applyRounding(strokesB, settings.rounding)),
  };
}

/**
 * Suggest points based on net score comparison
 * Default: Winner gets 2 points, Loser gets 0, Tie gives 1 each
 */
export function suggestPoints(
  teamANet: number,
  teamBNet: number
): { teamAPoints: number; teamBPoints: number } {
  if (teamANet < teamBNet) {
    // Lower net score wins in golf
    return { teamAPoints: 2, teamBPoints: 0 };
  } else if (teamBNet < teamANet) {
    return { teamAPoints: 0, teamBPoints: 2 };
  } else {
    // Tie
    return { teamAPoints: 1, teamBPoints: 1 };
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

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
  handicapPercentage?: number;
  handicapMaxStrokes?: number | null;
  handicapAllowanceType?: string;
  handicapProvWeeks?: number;
  handicapProvMultiplier?: number;
  handicapFreezeWeek?: number | null;
  handicapUseTrend?: boolean;
  handicapTrendWeight?: number;
  handicapRequireApproval?: boolean;
}): HandicapSettings {
  return {
    // Basic Formula
    baseScore: league.handicapBaseScore,
    multiplier: league.handicapMultiplier,
    rounding: (league.handicapRounding as RoundingMethod) || "floor",
    defaultHandicap: league.handicapDefault,
    maxHandicap: league.handicapMax,
    minHandicap: league.handicapMin ?? null,

    // Score Selection
    scoreSelection: (league.handicapScoreSelection as ScoreSelectionMethod) || "all",
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

    // Application Rules
    percentage: league.handicapPercentage ?? 100,
    maxStrokes: league.handicapMaxStrokes ?? null,
    allowanceType: (league.handicapAllowanceType as AllowanceType) || "full",

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
  finalHandicap: number
): string[] {
  const steps: string[] = [];

  if (scores.length === 0) {
    steps.push(`No scores available, using default handicap: ${settings.defaultHandicap}`);
    return steps;
  }

  // Score selection
  let selectedScores = capExceptionalScores(scores, settings);
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

  // Trend
  if (settings.useTrend) {
    const trend = calculateTrendAdjustment(scores, settings);
    if (trend !== 0) {
      steps.push(`Trend adjustment: ${trend > 0 ? "-" : "+"}${Math.abs(trend).toFixed(2)} (improving)`);
    }
  }

  // Rounding
  steps.push(`Rounded (${settings.rounding}): ${finalHandicap}`);

  // Caps
  if (settings.maxHandicap !== null && finalHandicap >= settings.maxHandicap) {
    steps.push(`Capped at maximum: ${settings.maxHandicap}`);
  }
  if (settings.minHandicap !== null && finalHandicap <= settings.minHandicap) {
    steps.push(`Capped at minimum: ${settings.minHandicap}`);
  }

  // Application percentage
  if (settings.percentage !== 100) {
    const applied = getAppliedHandicap(finalHandicap, settings);
    steps.push(`Applied at ${settings.percentage}%: ${applied}`);
  }

  return steps;
}
