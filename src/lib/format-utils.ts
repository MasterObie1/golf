/**
 * Shared formatting and display utilities.
 * Pure functions used by both client and server components.
 */

/**
 * Format a numeric position with ordinal suffix (1st, 2nd, 3rd, 4th, etc.).
 * Returns an em-dash for positions <= 0.
 */
export function formatPosition(pos: number): string {
  if (pos <= 0) return "\u2014";
  const suffixes = ["th", "st", "nd", "rd"];
  const v = pos % 100;
  return pos + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/**
 * Format a position that may be tied with other positions.
 * Shows "T3" for tied positions, otherwise shows the ordinal (e.g. "3rd").
 */
export function formatTiedPosition(pos: number, allPositions: number[]): string {
  const count = allPositions.filter((p) => p === pos).length;
  const base = formatPosition(pos);
  return count > 1 ? `T${pos}` : base;
}

/**
 * Get text color/weight classes for a golf score relative to par.
 * Eagle or better = yellow bold, birdie = blue semibold, par = green,
 * bogey = red, double+ = red bold.
 */
export function scoreColor(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff <= -2) return "text-board-yellow font-bold"; // eagle or better
  if (diff === -1) return "text-info-text font-semibold"; // birdie
  if (diff === 0) return "text-fairway"; // par
  if (diff === 1) return "text-board-red"; // bogey
  return "text-board-red font-bold"; // double+
}

/**
 * Get background color class for a golf score relative to par.
 * Eagle = yellow tint, birdie = blue tint, par = none,
 * bogey = light red, double+ = red.
 */
export function scoreBg(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff <= -2) return "bg-board-yellow/20"; // eagle
  if (diff === -1) return "bg-info-bg"; // birdie
  if (diff === 0) return ""; // par
  if (diff === 1) return "bg-error-bg/50"; // bogey
  return "bg-error-bg"; // double+
}
