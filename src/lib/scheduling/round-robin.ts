/**
 * Round-robin scheduling algorithms for golf league matchups.
 *
 * Uses the circle method (Berger tables) to generate balanced schedules
 * where every team plays every other team exactly once per round.
 *
 * Pure functions — no database access.
 */

export interface ScheduledMatch {
  teamAId: number;
  teamBId: number | null; // null = bye week for teamA
}

export interface Round {
  weekNumber: number;
  matches: ScheduledMatch[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  byeDistribution: Map<number, number>;
  matchesPerTeam: Map<number, number>;
}

export interface ScheduleResult {
  rounds: Round[];
  truncated: boolean;
  fullRoundsNeeded: number;
}

const BYE_SENTINEL = -1;

/**
 * Generate a single round-robin schedule using the circle method.
 *
 * For N teams (even): produces N-1 rounds, each team plays once per round.
 * For N teams (odd): produces N rounds with one bye per round.
 *
 * @param teamIds - Array of team IDs to schedule
 * @param startWeek - Starting week number (default 1)
 */
export function generateSingleRoundRobin(
  teamIds: number[],
  startWeek: number = 1
): Round[] {
  if (teamIds.length < 2) return [];

  const isOdd = teamIds.length % 2 !== 0;
  const participants = isOdd ? [...teamIds, BYE_SENTINEL] : [...teamIds];
  const n = participants.length;
  const rounds: Round[] = [];

  // Fix the first participant, rotate the rest
  const fixed = participants[0];
  const rotating = participants.slice(1);

  for (let round = 0; round < n - 1; round++) {
    const matches: ScheduledMatch[] = [];

    // First match: fixed team vs last in rotation
    const opponent = rotating[rotating.length - 1];
    if (opponent === BYE_SENTINEL) {
      matches.push({ teamAId: fixed, teamBId: null });
    } else if (fixed === BYE_SENTINEL) {
      // Shouldn't happen since fixed is always teamIds[0], but guard
      matches.push({ teamAId: opponent, teamBId: null });
    } else {
      matches.push({ teamAId: fixed, teamBId: opponent });
    }

    // Remaining matches: pair from outside in
    for (let i = 0; i < (n - 2) / 2; i++) {
      const a = rotating[i];
      const b = rotating[rotating.length - 2 - i];

      if (a === BYE_SENTINEL) {
        matches.push({ teamAId: b, teamBId: null });
      } else if (b === BYE_SENTINEL) {
        matches.push({ teamAId: a, teamBId: null });
      } else {
        matches.push({ teamAId: a, teamBId: b });
      }
    }

    rounds.push({
      weekNumber: startWeek + round,
      matches,
    });

    // Rotate: move last element to front
    rotating.unshift(rotating.pop()!);
  }

  return rounds;
}

/**
 * Generate a double round-robin schedule.
 *
 * First half: standard single round-robin.
 * Second half: same pairings but with home/away swapped.
 * Second half rounds are shuffled to avoid back-to-back same-opponent matchups.
 *
 * @param teamIds - Array of team IDs to schedule
 * @param startWeek - Starting week number (default 1)
 */
export function generateDoubleRoundRobin(
  teamIds: number[],
  startWeek: number = 1
): Round[] {
  const firstHalf = generateSingleRoundRobin(teamIds, startWeek);
  if (firstHalf.length === 0) return [];

  const secondHalfStart = startWeek + firstHalf.length;

  // Create second half with swapped home/away
  const secondHalfRounds: Round[] = firstHalf.map((round, index) => ({
    weekNumber: secondHalfStart + index,
    matches: round.matches.map((match) => {
      if (match.teamBId === null) {
        // Bye stays the same
        return { teamAId: match.teamAId, teamBId: null };
      }
      // Swap home/away
      return { teamAId: match.teamBId, teamBId: match.teamAId };
    }),
  }));

  // Interleave second half to maximize gap between same-opponent matchups.
  // Circular shift by half the length ensures the boundary rounds are maximally separated.
  const halfLen = secondHalfRounds.length;
  const shift = Math.floor(halfLen / 2);
  const interleaved = secondHalfRounds.map((_, i) => {
    const sourceIndex = (i + shift) % halfLen;
    return { ...secondHalfRounds[sourceIndex], weekNumber: secondHalfStart + i };
  });

  return [...firstHalf, ...interleaved];
}

/**
 * Validate a generated schedule for correctness and balance.
 */
export function validateSchedule(
  rounds: Round[],
  teamIds: number[]
): ValidationResult {
  const errors: string[] = [];
  const matchesPerTeam = new Map<number, number>();
  const byeDistribution = new Map<number, number>();
  const matchupCounts = new Map<string, number>();

  // Init counters
  for (const id of teamIds) {
    matchesPerTeam.set(id, 0);
    byeDistribution.set(id, 0);
  }

  for (const round of rounds) {
    const teamsThisRound = new Set<number>();

    for (const match of round.matches) {
      // Check teamA is a valid team
      if (!teamIds.includes(match.teamAId)) {
        errors.push(`Week ${round.weekNumber}: Unknown team ${match.teamAId}`);
        continue;
      }

      // Check for duplicate appearance in same round
      if (teamsThisRound.has(match.teamAId)) {
        errors.push(`Week ${round.weekNumber}: Team ${match.teamAId} appears twice`);
      }
      teamsThisRound.add(match.teamAId);

      if (match.teamBId === null) {
        // Bye week
        byeDistribution.set(
          match.teamAId,
          (byeDistribution.get(match.teamAId) || 0) + 1
        );
      } else {
        // Real match
        if (!teamIds.includes(match.teamBId)) {
          errors.push(`Week ${round.weekNumber}: Unknown team ${match.teamBId}`);
          continue;
        }

        if (teamsThisRound.has(match.teamBId)) {
          errors.push(`Week ${round.weekNumber}: Team ${match.teamBId} appears twice`);
        }
        teamsThisRound.add(match.teamBId);

        matchesPerTeam.set(
          match.teamAId,
          (matchesPerTeam.get(match.teamAId) || 0) + 1
        );
        matchesPerTeam.set(
          match.teamBId,
          (matchesPerTeam.get(match.teamBId) || 0) + 1
        );

        // Track matchup pair (ordered to avoid double-counting)
        const pairKey =
          match.teamAId < match.teamBId
            ? `${match.teamAId}-${match.teamBId}`
            : `${match.teamBId}-${match.teamAId}`;
        matchupCounts.set(pairKey, (matchupCounts.get(pairKey) || 0) + 1);
      }
    }

    // Check every team appears exactly once per round
    for (const id of teamIds) {
      if (!teamsThisRound.has(id)) {
        errors.push(`Week ${round.weekNumber}: Team ${id} has no match or bye`);
      }
    }
  }

  // Check bye balance (should differ by at most 1)
  if (teamIds.length % 2 !== 0) {
    const byeCounts = [...byeDistribution.values()];
    const maxByes = Math.max(...byeCounts);
    const minByes = Math.min(...byeCounts);
    if (maxByes - minByes > 1) {
      errors.push(
        `Unbalanced byes: range is ${minByes}-${maxByes} (should differ by at most 1)`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    byeDistribution,
    matchesPerTeam,
  };
}

/**
 * Get the bye distribution for a schedule.
 */
export function calculateByeDistribution(
  rounds: Round[]
): Map<number, number> {
  const byes = new Map<number, number>();

  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.teamBId === null) {
        byes.set(match.teamAId, (byes.get(match.teamAId) || 0) + 1);
      }
    }
  }

  return byes;
}

/**
 * Generate a partial schedule that fits within a maximum number of weeks.
 *
 * If totalWeeks >= full round-robin weeks, returns the full schedule.
 * If totalWeeks < full round-robin weeks, returns as many complete rounds as possible,
 * ensuring each team plays approximately the same number of matches.
 *
 * @param teamIds - Array of team IDs
 * @param totalWeeks - Maximum weeks available
 * @param doubleRoundRobin - Whether to attempt double round-robin
 * @param startWeek - Starting week number
 */
export function generateScheduleForWeeks(
  teamIds: number[],
  totalWeeks: number,
  doubleRoundRobin: boolean,
  startWeek: number = 1
): ScheduleResult {
  if (teamIds.length < 2 || totalWeeks < 1) {
    return { rounds: [], truncated: false, fullRoundsNeeded: 0 };
  }

  const fullSchedule = doubleRoundRobin
    ? generateDoubleRoundRobin(teamIds, startWeek)
    : generateSingleRoundRobin(teamIds, startWeek);

  if (fullSchedule.length <= totalWeeks) {
    return { rounds: fullSchedule, truncated: false, fullRoundsNeeded: fullSchedule.length };
  }

  // Truncate to fit
  return {
    rounds: fullSchedule.slice(0, totalWeeks),
    truncated: true,
    fullRoundsNeeded: fullSchedule.length,
  };
}
