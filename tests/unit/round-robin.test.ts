import { describe, it, expect } from "vitest";
import {
  generateSingleRoundRobin,
  generateDoubleRoundRobin,
  validateSchedule,
  calculateByeDistribution,
  generateScheduleForWeeks,
  type Round,
} from "@/lib/scheduling/round-robin";

// Helper to get all matchup pairs from a schedule
function getAllPairs(rounds: Round[]): string[] {
  const pairs: string[] = [];
  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.teamBId !== null) {
        const a = Math.min(match.teamAId, match.teamBId);
        const b = Math.max(match.teamAId, match.teamBId);
        pairs.push(`${a}-${b}`);
      }
    }
  }
  return pairs;
}

describe("generateSingleRoundRobin", () => {
  it("returns empty array for fewer than 2 teams", () => {
    expect(generateSingleRoundRobin([])).toEqual([]);
    expect(generateSingleRoundRobin([1])).toEqual([]);
  });

  it("generates N-1 rounds for even team count", () => {
    const rounds = generateSingleRoundRobin([1, 2, 3, 4]);
    expect(rounds).toHaveLength(3); // 4-1 = 3
  });

  it("generates N rounds for odd team count", () => {
    const rounds = generateSingleRoundRobin([1, 2, 3]);
    expect(rounds).toHaveLength(3); // 3+1-1 = 3 (padded to 4, then N-1)
  });

  it("ensures every pair plays exactly once (4 teams)", () => {
    const rounds = generateSingleRoundRobin([1, 2, 3, 4]);
    const pairs = getAllPairs(rounds);
    const uniquePairs = new Set(pairs);
    // C(4,2) = 6 unique pairs
    expect(uniquePairs.size).toBe(6);
    expect(pairs.length).toBe(6); // no duplicates
  });

  it("ensures every pair plays exactly once (6 teams)", () => {
    const rounds = generateSingleRoundRobin([1, 2, 3, 4, 5, 6]);
    const pairs = getAllPairs(rounds);
    const uniquePairs = new Set(pairs);
    // C(6,2) = 15
    expect(uniquePairs.size).toBe(15);
    expect(pairs.length).toBe(15);
  });

  it("has one bye per round for odd team count", () => {
    const rounds = generateSingleRoundRobin([1, 2, 3, 4, 5]);
    for (const round of rounds) {
      const byes = round.matches.filter((m) => m.teamBId === null);
      expect(byes).toHaveLength(1);
    }
  });

  it("has no byes for even team count", () => {
    const rounds = generateSingleRoundRobin([1, 2, 3, 4]);
    for (const round of rounds) {
      const byes = round.matches.filter((m) => m.teamBId === null);
      expect(byes).toHaveLength(0);
    }
  });

  it("uses correct starting week number", () => {
    const rounds = generateSingleRoundRobin([1, 2, 3, 4], 5);
    expect(rounds[0].weekNumber).toBe(5);
    expect(rounds[1].weekNumber).toBe(6);
    expect(rounds[2].weekNumber).toBe(7);
  });

  it("each team appears exactly once per round (8 teams)", () => {
    const teamIds = [1, 2, 3, 4, 5, 6, 7, 8];
    const rounds = generateSingleRoundRobin(teamIds);
    for (const round of rounds) {
      const teamsInRound = new Set<number>();
      for (const match of round.matches) {
        teamsInRound.add(match.teamAId);
        if (match.teamBId !== null) teamsInRound.add(match.teamBId);
      }
      expect(teamsInRound.size).toBe(8);
    }
  });
});

describe("generateDoubleRoundRobin", () => {
  it("returns empty array for fewer than 2 teams", () => {
    expect(generateDoubleRoundRobin([])).toEqual([]);
    expect(generateDoubleRoundRobin([1])).toEqual([]);
  });

  it("produces 2*(N-1) rounds for even teams", () => {
    const rounds = generateDoubleRoundRobin([1, 2, 3, 4]);
    expect(rounds).toHaveLength(6); // 2 * (4-1) = 6
  });

  it("every pair plays exactly twice", () => {
    const rounds = generateDoubleRoundRobin([1, 2, 3, 4]);
    const pairs = getAllPairs(rounds);
    const pairCounts = new Map<string, number>();
    for (const pair of pairs) {
      pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
    }
    for (const [, count] of pairCounts) {
      expect(count).toBe(2);
    }
  });

  it("second half has swapped home/away", () => {
    const rounds = generateDoubleRoundRobin([1, 2, 3, 4]);
    const firstHalf = rounds.slice(0, 3);
    const secondHalf = rounds.slice(3);

    // Collect directed pairs from each half
    const firstDirected = new Set<string>();
    const secondDirected = new Set<string>();

    for (const round of firstHalf) {
      for (const match of round.matches) {
        if (match.teamBId !== null) {
          firstDirected.add(`${match.teamAId}-${match.teamBId}`);
        }
      }
    }
    for (const round of secondHalf) {
      for (const match of round.matches) {
        if (match.teamBId !== null) {
          secondDirected.add(`${match.teamAId}-${match.teamBId}`);
        }
      }
    }

    // For each first-half pair A-B, the second half should have B-A
    for (const pair of firstDirected) {
      const [a, b] = pair.split("-");
      expect(secondDirected.has(`${b}-${a}`)).toBe(true);
    }
  });

  it("week numbers are sequential", () => {
    const rounds = generateDoubleRoundRobin([1, 2, 3, 4]);
    for (let i = 0; i < rounds.length; i++) {
      expect(rounds[i].weekNumber).toBe(i + 1);
    }
  });
});

describe("validateSchedule", () => {
  it("validates a correct schedule", () => {
    const teamIds = [1, 2, 3, 4];
    const rounds = generateSingleRoundRobin(teamIds);
    const result = validateSchedule(rounds, teamIds);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects unknown team IDs", () => {
    const rounds: Round[] = [{
      weekNumber: 1,
      matches: [{ teamAId: 999, teamBId: 1 }],
    }];
    const result = validateSchedule(rounds, [1, 2]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Unknown team 999"))).toBe(true);
  });

  it("detects duplicate team in same round", () => {
    const rounds: Round[] = [{
      weekNumber: 1,
      matches: [
        { teamAId: 1, teamBId: 2 },
        { teamAId: 1, teamBId: 3 },
      ],
    }];
    const result = validateSchedule(rounds, [1, 2, 3, 4]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("appears twice"))).toBe(true);
  });

  it("detects missing team in a round", () => {
    const rounds: Round[] = [{
      weekNumber: 1,
      matches: [{ teamAId: 1, teamBId: 2 }],
    }];
    const result = validateSchedule(rounds, [1, 2, 3, 4]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Team 3 has no match or bye"))).toBe(true);
  });

  it("reports correct matchesPerTeam", () => {
    const teamIds = [1, 2, 3, 4];
    const rounds = generateSingleRoundRobin(teamIds);
    const result = validateSchedule(rounds, teamIds);
    // Each team plays 3 matches in a 4-team single round robin
    for (const id of teamIds) {
      expect(result.matchesPerTeam.get(id)).toBe(3);
    }
  });

  it("validates odd-team schedule with balanced byes", () => {
    const teamIds = [1, 2, 3, 4, 5];
    const rounds = generateSingleRoundRobin(teamIds);
    const result = validateSchedule(rounds, teamIds);
    expect(result.valid).toBe(true);

    const byeCounts = [...result.byeDistribution.values()];
    const maxByes = Math.max(...byeCounts);
    const minByes = Math.min(...byeCounts);
    expect(maxByes - minByes).toBeLessThanOrEqual(1);
  });

  it("validates empty rounds list", () => {
    const result = validateSchedule([], [1, 2, 3]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("calculateByeDistribution", () => {
  it("counts byes per team", () => {
    const rounds: Round[] = [
      { weekNumber: 1, matches: [{ teamAId: 1, teamBId: null }, { teamAId: 2, teamBId: 3 }] },
      { weekNumber: 2, matches: [{ teamAId: 2, teamBId: null }, { teamAId: 1, teamBId: 3 }] },
    ];
    const byes = calculateByeDistribution(rounds);
    expect(byes.get(1)).toBe(1);
    expect(byes.get(2)).toBe(1);
    expect(byes.has(3)).toBe(false);
  });

  it("returns empty map for no byes", () => {
    const rounds: Round[] = [
      { weekNumber: 1, matches: [{ teamAId: 1, teamBId: 2 }] },
    ];
    const byes = calculateByeDistribution(rounds);
    expect(byes.size).toBe(0);
  });

  it("returns empty map for empty rounds", () => {
    const byes = calculateByeDistribution([]);
    expect(byes.size).toBe(0);
  });
});

describe("generateScheduleForWeeks", () => {
  it("returns full schedule when totalWeeks >= needed", () => {
    const rounds = generateScheduleForWeeks([1, 2, 3, 4], 10, false);
    expect(rounds).toHaveLength(3); // single RR for 4 teams = 3 rounds
  });

  it("truncates when fewer weeks than full schedule", () => {
    const rounds = generateScheduleForWeeks([1, 2, 3, 4], 2, false);
    expect(rounds).toHaveLength(2);
  });

  it("generates double round-robin when flag is set", () => {
    const rounds = generateScheduleForWeeks([1, 2, 3, 4], 20, true);
    expect(rounds).toHaveLength(6); // double RR for 4 teams = 6 rounds
  });

  it("returns empty for fewer than 2 teams", () => {
    expect(generateScheduleForWeeks([1], 10, false)).toEqual([]);
    expect(generateScheduleForWeeks([], 10, false)).toEqual([]);
  });

  it("returns empty for 0 weeks", () => {
    expect(generateScheduleForWeeks([1, 2, 3, 4], 0, false)).toEqual([]);
  });

  it("uses custom startWeek", () => {
    const rounds = generateScheduleForWeeks([1, 2, 3, 4], 10, false, 5);
    expect(rounds[0].weekNumber).toBe(5);
  });
});
