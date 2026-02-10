/**
 * Pure utility functions for scoring configuration.
 * Shared between client and server — NOT a "use server" module.
 */

export function generatePointScale(preset: string, teamCount: number): number[] {
  if (teamCount <= 0) return [];
  switch (preset) {
    case "weighted": {
      const base = [15, 12, 10, 8, 6, 5, 4, 3, 2, 1];
      if (teamCount <= base.length) return base.slice(0, teamCount);
      return [...base, ...Array.from({ length: teamCount - base.length }, () => 1)];
    }
    case "pga_style": {
      const base = [25, 20, 16, 13, 10, 8, 6, 4, 3, 2, 1];
      if (teamCount <= base.length) return base.slice(0, teamCount);
      return [...base, ...Array.from({ length: teamCount - base.length }, () => 1)];
    }
    case "linear":
    default: {
      return Array.from({ length: teamCount }, (_, i) => teamCount - i);
    }
  }
}

export function getPointScalePresets() {
  return [
    { id: "linear", name: "Linear", description: "Equal gaps between positions (8, 7, 6, 5...)" },
    { id: "weighted", name: "Weighted", description: "Rewards top finishes more (15, 12, 10, 8...)" },
    { id: "pga_style", name: "PGA-Style", description: "Large gaps at the top like pro tours (25, 20, 16...)" },
    { id: "custom", name: "Custom", description: "Define your own point values per position" },
  ];
}
