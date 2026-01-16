/**
 * Handicap settings interface for configurable formula
 */
export interface HandicapSettings {
  baseScore: number;      // Subtracted from average (default: 35)
  multiplier: number;     // Multiplied by difference (default: 0.9)
  rounding: "floor" | "round" | "ceil";  // Rounding method (default: floor)
  defaultHandicap: number; // When no scores available (default: 0)
  maxHandicap: number | null; // Maximum handicap cap (null = no limit)
}

/**
 * Default handicap settings matching the original hardcoded formula
 */
export const DEFAULT_HANDICAP_SETTINGS: HandicapSettings = {
  baseScore: 35,
  multiplier: 0.9,
  rounding: "floor",
  defaultHandicap: 0,
  maxHandicap: null,
};

/**
 * Calculate handicap using configurable formula:
 * handicap = round((Average_Score - baseScore) * multiplier)
 *
 * @param scores - Array of gross scores from previous rounds
 * @param settings - Handicap formula settings (optional, uses defaults if not provided)
 * @returns Calculated handicap as whole number
 */
export function calculateHandicap(
  scores: number[],
  settings: HandicapSettings = DEFAULT_HANDICAP_SETTINGS
): number {
  if (scores.length === 0) {
    return settings.defaultHandicap;
  }

  const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const rawHandicap = (averageScore - settings.baseScore) * settings.multiplier;

  // Apply configured rounding method
  let handicap: number;
  switch (settings.rounding) {
    case "floor":
      handicap = Math.floor(rawHandicap);
      break;
    case "ceil":
      handicap = Math.ceil(rawHandicap);
      break;
    case "round":
      handicap = Math.round(rawHandicap);
      break;
    default:
      handicap = Math.floor(rawHandicap);
  }

  // Apply maximum handicap cap if set
  if (settings.maxHandicap !== null && handicap > settings.maxHandicap) {
    return settings.maxHandicap;
  }

  return handicap;
}

/**
 * Calculate net score: Gross Score - Handicap
 */
export function calculateNetScore(grossScore: number, handicap: number): number {
  return Math.round((grossScore - handicap) * 10) / 10;
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
