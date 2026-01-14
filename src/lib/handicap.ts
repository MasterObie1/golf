/**
 * Calculate handicap using the formula: (Average_Score - 35) * 0.9
 * Always rounds DOWN to a whole number (e.g., 1.9 becomes 1)
 *
 * @param scores - Array of gross scores from previous rounds
 * @returns Calculated handicap as whole number, or 0 if no scores available
 */
export function calculateHandicap(scores: number[]): number {
  if (scores.length === 0) {
    return 0;
  }

  const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const handicap = (averageScore - 35) * 0.9;

  // Always round down to whole number
  return Math.floor(handicap);
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
