import { describe, it, expect } from "vitest";
import {
  getCourseSideForWeek,
  filterHolesByCourseSide,
  isHoleInPlay,
  getExpectedHoleCount,
} from "@/lib/scheduling/course-side";

describe("getCourseSideForWeek", () => {
  it("returns null for full_18 mode", () => {
    expect(getCourseSideForWeek(1, "full_18", "front")).toBeNull();
    expect(getCourseSideForWeek(2, "full_18", "back")).toBeNull();
    expect(getCourseSideForWeek(10, "full_18", "front")).toBeNull();
  });

  it("returns 'front' always for nine_hole_front", () => {
    expect(getCourseSideForWeek(1, "nine_hole_front", "front")).toBe("front");
    expect(getCourseSideForWeek(2, "nine_hole_front", "back")).toBe("front");
    expect(getCourseSideForWeek(99, "nine_hole_front", "front")).toBe("front");
  });

  it("returns 'back' always for nine_hole_back", () => {
    expect(getCourseSideForWeek(1, "nine_hole_back", "front")).toBe("back");
    expect(getCourseSideForWeek(2, "nine_hole_back", "back")).toBe("back");
    expect(getCourseSideForWeek(99, "nine_hole_back", "front")).toBe("back");
  });

  describe("nine_hole_alternating with firstWeekSide='front'", () => {
    it("returns 'front' for odd weeks", () => {
      expect(getCourseSideForWeek(1, "nine_hole_alternating", "front")).toBe("front");
      expect(getCourseSideForWeek(3, "nine_hole_alternating", "front")).toBe("front");
      expect(getCourseSideForWeek(5, "nine_hole_alternating", "front")).toBe("front");
    });

    it("returns 'back' for even weeks", () => {
      expect(getCourseSideForWeek(2, "nine_hole_alternating", "front")).toBe("back");
      expect(getCourseSideForWeek(4, "nine_hole_alternating", "front")).toBe("back");
      expect(getCourseSideForWeek(6, "nine_hole_alternating", "front")).toBe("back");
    });
  });

  describe("nine_hole_alternating with firstWeekSide='back'", () => {
    it("returns 'back' for odd weeks", () => {
      expect(getCourseSideForWeek(1, "nine_hole_alternating", "back")).toBe("back");
      expect(getCourseSideForWeek(3, "nine_hole_alternating", "back")).toBe("back");
    });

    it("returns 'front' for even weeks", () => {
      expect(getCourseSideForWeek(2, "nine_hole_alternating", "back")).toBe("front");
      expect(getCourseSideForWeek(4, "nine_hole_alternating", "back")).toBe("front");
    });
  });

  it("returns null for unknown play mode", () => {
    expect(getCourseSideForWeek(1, "unknown_mode", "front")).toBeNull();
  });
});

describe("filterHolesByCourseSide", () => {
  const allHoles = Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    par: i < 9 ? 4 : 5,
  }));

  it("returns all holes when courseSide is null", () => {
    expect(filterHolesByCourseSide(allHoles, null)).toHaveLength(18);
  });

  it("returns holes 1-9 for 'front'", () => {
    const result = filterHolesByCourseSide(allHoles, "front");
    expect(result).toHaveLength(9);
    expect(result[0].holeNumber).toBe(1);
    expect(result[8].holeNumber).toBe(9);
  });

  it("returns holes 10-18 for 'back'", () => {
    const result = filterHolesByCourseSide(allHoles, "back");
    expect(result).toHaveLength(9);
    expect(result[0].holeNumber).toBe(10);
    expect(result[8].holeNumber).toBe(18);
  });

  it("returns all holes for unknown side value", () => {
    expect(filterHolesByCourseSide(allHoles, "unknown")).toHaveLength(18);
  });

  it("handles a 9-hole course with front side (returns all 9)", () => {
    const nineHoles = allHoles.slice(0, 9);
    const result = filterHolesByCourseSide(nineHoles, "front");
    expect(result).toHaveLength(9);
  });

  it("handles a 9-hole course with back side (returns 0)", () => {
    const nineHoles = allHoles.slice(0, 9);
    const result = filterHolesByCourseSide(nineHoles, "back");
    expect(result).toHaveLength(0);
  });

  it("handles empty holes array", () => {
    expect(filterHolesByCourseSide([], "front")).toHaveLength(0);
    expect(filterHolesByCourseSide([], null)).toHaveLength(0);
  });
});

describe("isHoleInPlay", () => {
  it("returns true for any hole when courseSide is null", () => {
    expect(isHoleInPlay(1, null)).toBe(true);
    expect(isHoleInPlay(9, null)).toBe(true);
    expect(isHoleInPlay(10, null)).toBe(true);
    expect(isHoleInPlay(18, null)).toBe(true);
  });

  it("returns true for holes 1-9 on front side", () => {
    for (let i = 1; i <= 9; i++) {
      expect(isHoleInPlay(i, "front")).toBe(true);
    }
  });

  it("returns false for holes 10-18 on front side", () => {
    for (let i = 10; i <= 18; i++) {
      expect(isHoleInPlay(i, "front")).toBe(false);
    }
  });

  it("returns true for holes 10-18 on back side", () => {
    for (let i = 10; i <= 18; i++) {
      expect(isHoleInPlay(i, "back")).toBe(true);
    }
  });

  it("returns false for holes 1-9 on back side", () => {
    for (let i = 1; i <= 9; i++) {
      expect(isHoleInPlay(i, "back")).toBe(false);
    }
  });

  it("returns true for unknown side value", () => {
    expect(isHoleInPlay(5, "unknown")).toBe(true);
  });
});

describe("getExpectedHoleCount", () => {
  it("returns 9 for front side regardless of course size", () => {
    expect(getExpectedHoleCount(18, "front")).toBe(9);
    expect(getExpectedHoleCount(9, "front")).toBe(9);
  });

  it("returns 9 for back side regardless of course size", () => {
    expect(getExpectedHoleCount(18, "back")).toBe(9);
    expect(getExpectedHoleCount(9, "back")).toBe(9);
  });

  it("returns courseNumberOfHoles when courseSide is null", () => {
    expect(getExpectedHoleCount(18, null)).toBe(18);
    expect(getExpectedHoleCount(9, null)).toBe(9);
    expect(getExpectedHoleCount(27, null)).toBe(27);
  });
});
