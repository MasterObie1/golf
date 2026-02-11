/**
 * Pure helper functions for 9-hole play mode and course side determination.
 */

export type CourseSide = "front" | "back" | null;
export type PlayMode = "full_18" | "nine_hole_alternating" | "nine_hole_front" | "nine_hole_back";

/**
 * Determine which course side (front/back) is in play for a given week.
 *
 * - full_18: always null (all holes)
 * - nine_hole_front: always "front"
 * - nine_hole_back: always "back"
 * - nine_hole_alternating: alternates based on week number and firstWeekSide
 */
export function getCourseSideForWeek(
  weekNumber: number,
  playMode: string,
  firstWeekSide: string
): CourseSide {
  switch (playMode) {
    case "full_18":
      return null;
    case "nine_hole_front":
      return "front";
    case "nine_hole_back":
      return "back";
    case "nine_hole_alternating": {
      const isOddWeek = weekNumber % 2 === 1;
      if (firstWeekSide === "front") {
        return isOddWeek ? "front" : "back";
      }
      return isOddWeek ? "back" : "front";
    }
    default:
      return null;
  }
}

/**
 * Filter holes array to only those in play for the given course side.
 * Returns all holes if courseSide is null.
 */
export function filterHolesByCourseSide<T extends { holeNumber: number }>(
  holes: T[],
  courseSide: string | null
): T[] {
  if (!courseSide) return holes;
  if (courseSide === "front") return holes.filter((h) => h.holeNumber >= 1 && h.holeNumber <= 9);
  if (courseSide === "back") return holes.filter((h) => h.holeNumber >= 10 && h.holeNumber <= 18);
  return holes;
}

/**
 * Check whether a specific hole number is in play for the given course side.
 */
export function isHoleInPlay(holeNumber: number, courseSide: string | null): boolean {
  if (!courseSide) return true;
  if (courseSide === "front") return holeNumber >= 1 && holeNumber <= 9;
  if (courseSide === "back") return holeNumber >= 10 && holeNumber <= 18;
  return true;
}

/**
 * Get the expected number of holes for a given course side.
 * Returns 9 for front/back, full course hole count for null.
 */
export function getExpectedHoleCount(
  courseNumberOfHoles: number,
  courseSide: string | null
): number {
  if (courseSide === "front" || courseSide === "back") return 9;
  return courseNumberOfHoles;
}
