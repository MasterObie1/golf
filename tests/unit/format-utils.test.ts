import { describe, it, expect } from "vitest";
import { formatPosition, formatTiedPosition, scoreColor, scoreBg } from "@/lib/format-utils";

describe("formatPosition", () => {
  it("returns 1st for position 1", () => {
    expect(formatPosition(1)).toBe("1st");
  });

  it("returns 2nd for position 2", () => {
    expect(formatPosition(2)).toBe("2nd");
  });

  it("returns 3rd for position 3", () => {
    expect(formatPosition(3)).toBe("3rd");
  });

  it("returns 4th for position 4", () => {
    expect(formatPosition(4)).toBe("4th");
  });

  it("handles teens (11th, 12th, 13th)", () => {
    expect(formatPosition(11)).toBe("11th");
    expect(formatPosition(12)).toBe("12th");
    expect(formatPosition(13)).toBe("13th");
  });

  it("handles 21st, 22nd, 23rd", () => {
    expect(formatPosition(21)).toBe("21st");
    expect(formatPosition(22)).toBe("22nd");
    expect(formatPosition(23)).toBe("23rd");
  });

  it("returns em-dash for 0", () => {
    expect(formatPosition(0)).toBe("\u2014");
  });

  it("returns em-dash for negative numbers", () => {
    expect(formatPosition(-1)).toBe("\u2014");
    expect(formatPosition(-10)).toBe("\u2014");
  });

  it("handles large numbers", () => {
    expect(formatPosition(100)).toBe("100th");
    expect(formatPosition(101)).toBe("101st");
    expect(formatPosition(111)).toBe("111th");
    expect(formatPosition(112)).toBe("112th");
  });
});

describe("formatTiedPosition", () => {
  it('returns "T3" when position appears multiple times', () => {
    expect(formatTiedPosition(3, [1, 3, 3, 5])).toBe("T3");
  });

  it("returns ordinal when position is unique", () => {
    expect(formatTiedPosition(1, [1, 2, 3])).toBe("1st");
  });

  it("handles three-way tie", () => {
    expect(formatTiedPosition(2, [1, 2, 2, 2, 5])).toBe("T2");
  });

  it("handles empty positions array as unique (count=0 is not >1)", () => {
    expect(formatTiedPosition(1, [])).toBe("1st");
  });
});

describe("scoreColor", () => {
  it("returns eagle style for 2 under par", () => {
    expect(scoreColor(2, 4)).toBe("text-board-yellow font-bold");
  });

  it("returns eagle style for albatross (3 under)", () => {
    expect(scoreColor(1, 4)).toBe("text-board-yellow font-bold");
  });

  it("returns birdie style for 1 under par", () => {
    expect(scoreColor(3, 4)).toBe("text-info-text font-semibold");
  });

  it("returns par style for even", () => {
    expect(scoreColor(4, 4)).toBe("text-fairway");
  });

  it("returns bogey style for 1 over par", () => {
    expect(scoreColor(5, 4)).toBe("text-board-red");
  });

  it("returns double bogey+ style for 2+ over par", () => {
    expect(scoreColor(6, 4)).toBe("text-board-red font-bold");
    expect(scoreColor(7, 4)).toBe("text-board-red font-bold");
  });
});

describe("scoreBg", () => {
  it("returns eagle bg for 2+ under par", () => {
    expect(scoreBg(2, 4)).toBe("bg-board-yellow/20");
  });

  it("returns birdie bg for 1 under par", () => {
    expect(scoreBg(3, 4)).toBe("bg-info-bg");
  });

  it("returns empty string for par", () => {
    expect(scoreBg(4, 4)).toBe("");
  });

  it("returns bogey bg for 1 over par", () => {
    expect(scoreBg(5, 4)).toBe("bg-error-bg/50");
  });

  it("returns double bogey+ bg for 2+ over par", () => {
    expect(scoreBg(6, 4)).toBe("bg-error-bg");
    expect(scoreBg(8, 4)).toBe("bg-error-bg");
  });
});
