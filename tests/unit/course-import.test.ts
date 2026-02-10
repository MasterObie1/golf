import { describe, it, expect } from "vitest";
import { searchCourses, importCourse } from "@/lib/actions/course-import";

describe("searchCourses", () => {
  it("returns not-yet-available error", async () => {
    const result = await searchCourses("Pine Valley");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not yet available");
  });
});

describe("importCourse", () => {
  it("returns not-yet-available error", async () => {
    const result = await importCourse("test-league", "ext-123");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not yet available");
  });
});
