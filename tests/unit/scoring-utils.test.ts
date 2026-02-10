import { describe, it, expect } from "vitest";
import { generatePointScale, getPointScalePresets } from "@/lib/scoring-utils";

describe("generatePointScale", () => {
  describe("linear preset", () => {
    it("returns descending array [n, n-1, ...1]", () => {
      expect(generatePointScale("linear", 5)).toEqual([5, 4, 3, 2, 1]);
    });

    it("returns empty array for 0 teams", () => {
      expect(generatePointScale("linear", 0)).toEqual([]);
    });

    it("returns [1] for 1 team", () => {
      expect(generatePointScale("linear", 1)).toEqual([1]);
    });

    it("handles large team count", () => {
      const result = generatePointScale("linear", 20);
      expect(result).toHaveLength(20);
      expect(result[0]).toBe(20);
      expect(result[19]).toBe(1);
    });
  });

  describe("weighted preset", () => {
    it("returns base scale for 10 teams", () => {
      expect(generatePointScale("weighted", 10)).toEqual([15, 12, 10, 8, 6, 5, 4, 3, 2, 1]);
    });

    it("truncates for fewer than 10 teams", () => {
      expect(generatePointScale("weighted", 4)).toEqual([15, 12, 10, 8]);
    });

    it("pads with 1s for more than 10 teams", () => {
      const result = generatePointScale("weighted", 12);
      expect(result).toHaveLength(12);
      expect(result[10]).toBe(1);
      expect(result[11]).toBe(1);
    });
  });

  describe("pga_style preset", () => {
    it("returns base scale for 11 teams", () => {
      expect(generatePointScale("pga_style", 11)).toEqual([25, 20, 16, 13, 10, 8, 6, 4, 3, 2, 1]);
    });

    it("truncates for fewer teams", () => {
      expect(generatePointScale("pga_style", 3)).toEqual([25, 20, 16]);
    });

    it("pads with 1s for more than 11 teams", () => {
      const result = generatePointScale("pga_style", 13);
      expect(result).toHaveLength(13);
      expect(result[11]).toBe(1);
      expect(result[12]).toBe(1);
    });
  });

  describe("unknown preset", () => {
    it("falls back to linear for unknown preset name", () => {
      expect(generatePointScale("custom", 4)).toEqual([4, 3, 2, 1]);
    });

    it("falls back to linear for empty string", () => {
      expect(generatePointScale("", 3)).toEqual([3, 2, 1]);
    });
  });

  it("returns empty array for negative team count", () => {
    expect(generatePointScale("linear", -1)).toEqual([]);
  });
});

describe("getPointScalePresets", () => {
  it("returns 4 presets", () => {
    const presets = getPointScalePresets();
    expect(presets).toHaveLength(4);
  });

  it("has correct IDs", () => {
    const presets = getPointScalePresets();
    const ids = presets.map((p) => p.id);
    expect(ids).toEqual(["linear", "weighted", "pga_style", "custom"]);
  });

  it("each preset has name and description", () => {
    const presets = getPointScalePresets();
    for (const preset of presets) {
      expect(preset.name).toBeTruthy();
      expect(preset.description).toBeTruthy();
    }
  });
});
