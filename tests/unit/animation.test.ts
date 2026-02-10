import { describe, it, expect } from "vitest";
import {
  easing,
  duration,
  stagger,
  fadeIn,
  fadeInUp,
  slideInRight,
  slideInLeft,
  boardRow,
  staggerContainer,
  scaleIn,
  flagFlutter,
  parallax,
  numberTransition,
} from "@/lib/animation";

describe("easing", () => {
  it("has expected keys with correct types", () => {
    expect(easing.swing).toHaveLength(4);
    expect(easing.roll).toHaveLength(4);
    expect(easing.flutter).toHaveProperty("type", "spring");
    expect(easing.flutter).toHaveProperty("stiffness");
    expect(easing.flutter).toHaveProperty("damping");
    expect(easing.gentle).toHaveProperty("type", "spring");
    expect(easing.snappy).toHaveProperty("type", "spring");
  });
});

describe("duration", () => {
  it("has expected keys with positive values", () => {
    expect(duration.instant).toBeGreaterThan(0);
    expect(duration.fast).toBeGreaterThan(0);
    expect(duration.normal).toBeGreaterThan(0);
    expect(duration.slow).toBeGreaterThan(0);
    expect(duration.dramatic).toBeGreaterThan(0);
    expect(duration.stately).toBeGreaterThan(0);
  });

  it("values are in ascending order", () => {
    expect(duration.instant).toBeLessThan(duration.fast);
    expect(duration.fast).toBeLessThan(duration.normal);
    expect(duration.normal).toBeLessThan(duration.slow);
    expect(duration.slow).toBeLessThan(duration.dramatic);
    expect(duration.dramatic).toBeLessThan(duration.stately);
  });
});

describe("stagger", () => {
  it("has expected keys with positive values", () => {
    expect(stagger.list).toBeGreaterThan(0);
    expect(stagger.cards).toBeGreaterThan(0);
    expect(stagger.dramatic).toBeGreaterThan(0);
  });
});

describe("animation variants", () => {
  it("fadeIn has hidden and visible", () => {
    expect(fadeIn.hidden).toHaveProperty("opacity", 0);
    expect(fadeIn.visible).toHaveProperty("opacity", 1);
  });

  it("fadeInUp has hidden and visible with y offset", () => {
    expect(fadeInUp.hidden).toHaveProperty("opacity", 0);
    expect(fadeInUp.hidden).toHaveProperty("y");
    expect(fadeInUp.visible).toHaveProperty("opacity", 1);
    expect(fadeInUp.visible).toHaveProperty("y", 0);
  });

  it("slideInRight has hidden and visible with x offset", () => {
    expect(slideInRight.hidden).toHaveProperty("opacity", 0);
    expect(slideInRight.hidden.x).toBeGreaterThan(0);
    expect(slideInRight.visible).toHaveProperty("x", 0);
  });

  it("slideInLeft has hidden and visible with negative x offset", () => {
    expect(slideInLeft.hidden).toHaveProperty("opacity", 0);
    expect(slideInLeft.hidden.x).toBeLessThan(0);
    expect(slideInLeft.visible).toHaveProperty("x", 0);
  });

  it("scaleIn has hidden and visible with scale", () => {
    expect(scaleIn.hidden).toHaveProperty("scale");
    expect(scaleIn.hidden.scale).toBeLessThan(1);
    expect(scaleIn.visible).toHaveProperty("scale", 1);
  });
});

describe("boardRow", () => {
  it("visible is a function that accepts index", () => {
    expect(typeof boardRow.visible).toBe("function");
    const result = boardRow.visible(0);
    expect(result).toHaveProperty("opacity", 1);
    expect(result).toHaveProperty("x", 0);
  });

  it("delay increases with index", () => {
    const r0 = boardRow.visible(0);
    const r5 = boardRow.visible(5);
    expect(r5.transition.delay).toBeGreaterThan(r0.transition.delay);
  });
});

describe("staggerContainer", () => {
  it("returns object with default stagger", () => {
    const container = staggerContainer();
    expect(container.hidden).toBeDefined();
    expect(container.visible.transition.staggerChildren).toBe(stagger.list);
  });

  it("accepts custom stagger amount", () => {
    const container = staggerContainer(0.2);
    expect(container.visible.transition.staggerChildren).toBe(0.2);
  });
});

describe("flagFlutter", () => {
  it("has hover variant with rotation", () => {
    expect(flagFlutter.hover).toHaveProperty("rotateZ");
    expect(Array.isArray(flagFlutter.hover.rotateZ)).toBe(true);
  });
});

describe("parallax", () => {
  it("has expected multiplier keys", () => {
    expect(parallax.subtle).toBeGreaterThan(0);
    expect(parallax.medium).toBeGreaterThan(parallax.subtle);
    expect(parallax.strong).toBeGreaterThan(parallax.medium);
  });
});

describe("numberTransition", () => {
  it("has duration and ease", () => {
    expect(numberTransition.duration).toBe(duration.dramatic);
    expect(numberTransition.ease).toBe(easing.roll);
  });
});
