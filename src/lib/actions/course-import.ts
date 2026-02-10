"use server";

// Stub for future course API import functionality.
// Planned integrations:
//   - GolfCourseAPI.com (free, ~30,000 courses, 300 req/day)
//   - GolfAPI.io (42,000+ courses, pars + stroke indexes + tees + slope/course ratings)

export interface ExternalCourseResult {
  externalId: string;
  name: string;
  location: string;
  numberOfHoles: number;
  totalPar: number | null;
  teeColor: string | null;
  courseRating: number | null;
  slopeRating: number | null;
  dataSource: string;
  holes: {
    holeNumber: number;
    par: number;
    handicapIndex: number;
    yardage: number | null;
  }[];
}

export async function searchCourses(
  _query: string
): Promise<{ success: false; error: string }> {
  return {
    success: false,
    error: "Course search is not yet available. Configure your course manually in the Course tab.",
  };
}

export async function importCourse(
  _leagueSlug: string,
  _externalId: string
): Promise<{ success: false; error: string }> {
  return {
    success: false,
    error: "Course import is not yet available. Configure your course manually in the Course tab.",
  };
}
