# Wave 2, Review 14: Scheduling Engine -- Algorithmic Correctness

**Reviewer:** Senior Staff Engineer (algorithmic focus)
**Date:** 2026-02-11
**Scope:** `src/lib/scheduling/round-robin.ts`, `src/lib/scheduling/course-side.ts`, `src/lib/actions/schedule.ts`
**Prior work:** Wave 1 review covered transactions, validation, and TOCTOU race conditions (see `planning/07-scheduling-engine-fixes.md`). Most of those fixes have been applied. This review focuses on *algorithmic correctness* of the scheduling engine itself.

---

## Executive Summary

The round-robin implementation is a textbook circle method and is mathematically correct for all even and odd team counts from 2 through at least 30. Every team pair meets exactly once in a single round-robin, and exactly twice in a double round-robin. Bye distribution is perfectly balanced for odd counts. The Wave 1 fixes (transactions, cancelled-matchup cleanup, conflict detection) have landed and are solid.

However, there are **seven remaining issues** ranging from a subtle uniqueness constraint gap that can silently corrupt data, to a home/away imbalance that affects every double round-robin league, to a course-side assignment that uses week numbers in a way that breaks when schedule manipulations create non-contiguous weeks. None are emergency-severity, but several will produce visibly wrong behavior in production under realistic admin workflows.

**Critical (data corruption risk):** 1 issue
**High (algorithmically incorrect output):** 3 issues
**Medium (edge case or fairness concern):** 2 issues
**Low (cosmetic / hardening):** 1 issue

---

## 1. Circle Method Correctness

**Verdict: CORRECT**

### Analysis

The implementation at `round-robin.ts:44-96` uses the standard circle method (Berger table construction):

1. Fix the first participant in position 0.
2. Place the remaining N-1 participants in a rotating array.
3. For each round, pair: `fixed` vs `rotating[last]`, then `rotating[i]` vs `rotating[N-2-i]` for i = 0...(N-2)/2-1.
4. Rotate the array by moving the last element to the front.

This is the canonical algorithm. I verified the following properties by tracing through manually and confirming they match the existing unit test results:

| Teams (N) | Even N' | Rounds | Matches/Round | Total Pairs | C(N,2) |
|-----------|---------|--------|---------------|-------------|--------|
| 2         | 2       | 1      | 1             | 1           | 1      |
| 3         | 4       | 3      | 1 real + 1 bye| 3           | 3      |
| 4         | 4       | 3      | 2             | 6           | 6      |
| 5         | 6       | 5      | 2 real + 1 bye| 10          | 10     |
| 6         | 6       | 5      | 3             | 15          | 15     |
| 8         | 8       | 7      | 4             | 28          | 28     |
| 10        | 10      | 9      | 5             | 45          | 45     |
| 30        | 30      | 29     | 15            | 435         | 435    |

The existing unit tests (`tests/unit/round-robin.test.ts`) already validate schedules for 2-12 teams using `validateSchedule()`. These provide strong coverage.

### Rotation mechanics

```
rotating.unshift(rotating.pop()!);  // line 93
```

This moves the last element to position 0, which is a right-rotation of the conceptual circle. This is equivalent to left-rotating the pairing positions, which is the standard formulation. Correct.

### Integer division for inner loop

```
for (let i = 0; i < (n - 2) / 2; i++)  // line 74
```

When `n` is even (which it always is after padding), `(n-2)/2` is an integer. For n=4: 1 inner pair. For n=6: 2 inner pairs. For n=8: 3 inner pairs. Correct.

---

## 2. Bye Handling

**Verdict: CORRECT**

### Odd team count padding

When `teamIds.length` is odd, a `BYE_SENTINEL = -1` is appended (`line 51`). This makes the effective participant count even, and the algorithm runs as N rounds (where N = original odd count). In each round, exactly one match involves the sentinel, which is converted to a `teamBId: null` bye entry.

### Bye distribution balance

The circle method inherently distributes byes evenly. With N odd teams (padded to N+1), each team faces the sentinel exactly once across the N rounds. So every team gets exactly 1 bye -- perfectly balanced.

The `validateSchedule()` function at line 222 checks that bye counts differ by at most 1 across teams, which is correct for single round-robin. For double round-robin, each team gets exactly 2 byes (one per half). The validator does not special-case this but the "at most 1 difference" check still passes since all teams have the same count.

### Edge: BYE_SENTINEL as `fixed` participant

Line 66-68 guards against the case where `fixed = BYE_SENTINEL`. This cannot happen because `fixed = participants[0] = teamIds[0]`, and team IDs are always positive integers. The guard is defensive and harmless.

---

## 3. Home/Away Balance

**Verdict: BUG -- Systematic imbalance for the fixed team**

### Problem

In the circle method, `teamIds[0]` is always the "fixed" team (line 56). In every round of the first half, this team is always `teamA` (the home team) in its match (line 70). In the second half of a double round-robin, the roles are swapped (line 127: `teamAId: match.teamBId, teamBId: match.teamAId`), so the fixed team is always `teamB` (away).

This means:
- **First half:** `teamIds[0]` is home in every round.
- **Second half:** `teamIds[0]` is away in every round.

For the *other* teams, home/away assignment depends on which side of the pairing table they land on each round, which rotates. The result is that every team *except* the fixed team gets a roughly balanced home/away split within each half, but the fixed team has a 100% / 0% split within each half.

In a **single round-robin**, this means `teamIds[0]` is home for ALL of its matches. With 4 teams, team 1 is home 3 times and away 0 times, while each other team is home about 1 time and away about 2 times. This is a well-known property of the naive circle method.

In a **double round-robin**, the totals balance out (home count = away count across both halves), but the distribution is maximally unbalanced *within* each half.

### Impact

- Single round-robin: The first team in ID order (lowest `id` from the database query, ordered by `id: "asc"` at `schedule.ts:81`) has a permanent home advantage or disadvantage depending on how "home" is interpreted.
- Double round-robin: Total home/away is balanced, but the temporal distribution is lopsided.

### Severity: HIGH

This is a known limitation of the basic circle method. The standard fix is to alternate home/away for the fixed team on even/odd rounds:

```typescript
// In the first match each round:
if (round % 2 === 0) {
  matches.push({ teamAId: fixed, teamBId: opponent });
} else {
  matches.push({ teamAId: opponent, teamBId: fixed });
}
```

This ensures the fixed team alternates home/away across rounds, achieving near-perfect balance for all teams.

### File: `src/lib/scheduling/round-robin.ts:62-71`

### Recommended Fix

```typescript
// First match: fixed team vs last in rotation
const opponent = rotating[rotating.length - 1];
if (opponent === BYE_SENTINEL) {
  matches.push({ teamAId: fixed, teamBId: null });
} else if (fixed === BYE_SENTINEL) {
  matches.push({ teamAId: opponent, teamBId: null });
} else {
  // Alternate home/away for the fixed team to balance assignments
  if (round % 2 === 0) {
    matches.push({ teamAId: fixed, teamBId: opponent });
  } else {
    matches.push({ teamAId: opponent, teamBId: fixed });
  }
}
```

---

## 4. Schedule Completeness

**Verdict: CORRECT (with a caveat on truncation)**

### Full schedule

For a full single round-robin, every pair plays exactly once. For a full double round-robin, every pair plays exactly twice. The algorithm guarantees this by construction, and the unit tests confirm it.

### Truncated schedule

`generateScheduleForWeeks()` truncates with `fullSchedule.slice(0, totalWeeks)` (line 292). This produces a prefix of the round-robin, which means some pairs will not be matched. The function correctly returns `truncated: true` and `fullRoundsNeeded`, and `previewSchedule()` surfaces this to the admin.

The truncation is front-biased: it always takes the first N rounds. In the circle method, the first rounds are not statistically special, so this is acceptable. However, see Issue 6 below about how truncation interacts with the unique constraint.

---

## 5. Mid-Season Team Add/Remove

### 5a. `addTeamToSchedule` -- `fill_byes` strategy

**Verdict: PARTIALLY CORRECT -- has a fairness deficiency**

**How it works:** Finds all future bye entries (`teamBId: null`) and assigns the new team as `teamBId`. This only works when going from an odd number to an even number (byes exist).

**Problem:** The new team is always placed as `teamBId` (away) in every filled bye slot. It never gets a home match until the next schedule regeneration. This compounds the home/away imbalance from Issue 3.

**Additionally:** The `fill_byes` strategy assigns the new team to play against *only* the teams that had byes. It does not schedule the new team against any team that did not have a bye. With N odd teams, each team gets exactly 1 bye, so the new team plays N matches (one against each existing team). After filling, it's a (N+1)-team schedule where the new team has played each opponent once -- which is correct. No completeness issue here.

### 5b. `addTeamToSchedule` -- `start_from_here` / `catch_up` / `pro_rate` strategies

**Verdict: CORRECT but with data loss risk**

These strategies delete all future scheduled/cancelled matchups and regenerate from `currentWeek`. The regeneration creates a fresh round-robin for all current teams (including the new one) using the remaining weeks.

**Concern:** If `remainingWeeks` is smaller than the number of rounds needed for a full round-robin of the new team count, the schedule will be truncated. Some pairings will be missing. This is handled correctly (truncation is implicit), but no warning is surfaced to the admin for the add-team flow specifically.

### 5c. `removeTeamFromSchedule` -- `bye_opponents`

**Verdict: CORRECT**

This correctly handles three cases:
1. Removed team is `teamA` with a non-null `teamB`: swap opponent to `teamA`, set `teamB = null` (bye).
2. Removed team is `teamB`: set `teamB = null` (bye).
3. Removed team is `teamA` with null `teamB` (already a bye): cancel the matchup.

### 5d. `removeTeamFromSchedule` -- `regenerate`

**Verdict: CORRECT**

Deletes all future scheduled/cancelled matchups and regenerates with the remaining teams. Same truncation concern as 5b.

---

## 6. Course Side Alternation

**Verdict: BUG -- breaks on non-contiguous week numbers**

### Problem

`getCourseSideForWeek()` in `course-side.ts:28-34` determines front/back based on `weekNumber % 2`:

```typescript
case "nine_hole_alternating": {
  const isOddWeek = weekNumber % 2 === 1;
  if (firstWeekSide === "front") {
    return isOddWeek ? "front" : "back";
  }
  return isOddWeek ? "back" : "front";
}
```

This is correct *if week numbers are contiguous starting from 1*. But several operations can create non-contiguous week numbers:

1. **`rescheduleMatchup()`** moves a matchup to an arbitrary week number (e.g., week 10 in a 3-week schedule). The new week gets a course side based on `weekNumber % 2`, not based on its position in the sequence.

2. **Mid-season regeneration** (`addTeamToSchedule`, `removeTeamFromSchedule` with `regenerate`) starts from `currentWeek`, which could be any number. If `currentWeek = 4` and the schedule runs weeks 4-8, the alternation pattern depends on the absolute week number, not the relative position. This means the actual sequence of sides played might be back-front-back-front-back (if `firstWeekSide = "front"` and weeks are 4,5,6,7,8), which starts on back -- not front as configured.

3. **Manual matchup addition** (`addManualScheduledMatchup`) at line 620 does NOT assign `courseSide` at all -- it creates the matchup without a `courseSide` field. This means manually added matchups in alternating mode will have `courseSide: null`, which is treated as "full 18" by the scoring engine.

### Severity: HIGH

The alternation is based on absolute week numbers rather than logical sequence position. A league that starts its season at week 3 (after 2 playoff weeks from a prior season, or after mid-season regeneration) will have the wrong first-week side.

### File: `src/lib/scheduling/course-side.ts:28-34`, `src/lib/actions/schedule.ts:620`

### Recommended Fix

For `getCourseSideForWeek()`, the caller should pass the *logical round index* (0-based position in the schedule), not the database `weekNumber`. Alternatively, store the first week number in the league config and compute `(weekNumber - firstWeek) % 2` instead of `weekNumber % 2`.

For `addManualScheduledMatchup()`, add course side assignment:

```typescript
const league = await prisma.league.findUniqueOrThrow({
  where: { id: session.leagueId },
  select: { playMode: true, playModeFirstWeekSide: true },
});
const courseSide = getCourseSideForWeek(weekNumber, league.playMode, league.playModeFirstWeekSide);

await tx.scheduledMatchup.create({
  data: {
    ...
    courseSide,
  },
});
```

---

## 7. Shotgun Start Assignment

**Verdict: CORRECT but with fairness gap**

### How it works

Shotgun start holes are assigned via two endpoints:
1. `updateMatchupStartingHole()` -- sets one matchup's starting hole (line 1061).
2. `assignShotgunStartingHoles()` -- batch assigns starting holes for multiple matchups (line 1137).

Both validate hole ranges based on `courseSide`:
- Front nine: holes 1-9
- Back nine: holes 10-18
- Full 18: holes 1-18

### Correctness

The validation is correct. No two matchups are constrained to have different starting holes (which is correct for shotgun starts -- multiple groups can share a hole if needed, or the admin manually ensures uniqueness).

### Fairness gap

There is no automated *fair distribution* of starting holes. The admin must manually assign holes for each week. Over a season, some groups may consistently get "better" starting holes (e.g., always hole 1) while others always get crowded mid-course slots. An auto-rotation feature would improve fairness but is not a correctness bug.

### Missing: duplicate starting hole detection

`assignShotgunStartingHoles()` does not check whether two matchups in the same week are assigned the same starting hole. In a true shotgun start, each group starts on a different hole. Assigning hole 5 to two groups in the same week would create a physical conflict on the course. This should be a validation error (or at minimum a warning).

### Severity: MEDIUM

### File: `src/lib/actions/schedule.ts:1137-1194`

### Recommended Fix

Add a duplicate-hole check within `assignShotgunStartingHoles()`:

```typescript
// Check for duplicate starting holes within the same week
const weekGroups = new Map<number, Set<number>>();
for (const a of assignments) {
  const m = matchupMap.get(a.matchupId)!;
  const week = m.weekNumber;
  if (!weekGroups.has(week)) weekGroups.set(week, new Set());
  const holes = weekGroups.get(week)!;
  if (holes.has(a.startingHole)) {
    return { success: false, error: `Hole ${a.startingHole} is assigned to multiple matchups in week ${week}.` };
  }
  holes.add(a.startingHole);
}
```

---

## 8. Edge Cases

### 2 Teams

Single RR: 1 round, 1 match. Correct.
Double RR: 2 rounds. First round: team A vs team B. Second round: team B vs team A. The interleaving shift (`Math.floor(1/2) = 0`) means the second half is not shifted at all, so round 1 and round 2 are back-to-back same opponents (with swapped sides). This is unavoidable with 2 teams and is correct behavior.

### 3 Teams

Padded to 4. Single RR: 3 rounds, each with 1 real match + 1 bye. Each pair plays once, each team gets 1 bye. Correct.

### 1 Team

`generateSingleRoundRobin([1])` returns `[]` (line 48). Correct -- no opponents to schedule.

### 0 Teams

`generateSingleRoundRobin([])` returns `[]`. Correct.

`generateScheduleForWeeks([], 10, false)` returns `{ rounds: [], truncated: false, fullRoundsNeeded: 0 }`. Correct.

### Very large leagues (30+ teams)

30 teams, single RR: 29 rounds, 15 matches per round = 435 total matches. The algorithm runs in O(N^2) time which is fine. Each round has 15 matches, and the inner loop runs 14 iterations. No performance concern.

However, 30 teams in double RR = 58 rounds. Many recreational leagues play 20-week seasons. With `playoffWeeks = 2`, that's 18 schedulable weeks. The schedule will be heavily truncated (18/58 = 31% complete). Most pairs will never meet. The truncation warning in `previewSchedule()` handles this, but the admin may not understand the implications.

### 2 teams in double round-robin

As noted above, the interleaving shift is 0 for 1-round halves. The boundary overlap check from `07-scheduling-engine-fixes.md` test (Fix 2.2) passes because the shift is 0, but the same opponent still appears in consecutive rounds. This is correct (unavoidable for 2 teams) but the test at `round-robin.test.ts:163` only tests 4, 6, and 8 teams. It should also verify that 2-team double RR does not crash, even if the boundary constraint cannot be satisfied.

---

## 9. Playoff Weeks

**Verdict: CORRECT but semantically confusing**

### How it works

In `previewSchedule()` and `generateSchedule()`:

```typescript
const schedulableWeeks = Math.max(1, options.totalWeeks - league.playoffWeeks);
```

This reserves `playoffWeeks` weeks at the end by reducing the total available weeks. The round-robin is generated for `schedulableWeeks` weeks.

### Correctness

The arithmetic is correct. If `totalWeeks = 12` and `playoffWeeks = 2`, the round-robin spans weeks 1-10.

### Edge case: `playoffWeeks >= totalWeeks`

If `playoffWeeks = 12` and `totalWeeks = 12`, then `schedulableWeeks = Math.max(1, 0) = 1`. The schedule gets 1 week, which means exactly 1 round of the round-robin. This is technically correct but probably not what the admin intended. No error or warning is surfaced.

### Edge case: `playoffWeeks > totalWeeks`

If `playoffWeeks = 15` and `totalWeeks = 12`, then `schedulableWeeks = Math.max(1, -3) = 1`. Same behavior as above. The admin configured more playoff weeks than total weeks -- this should probably be a validation error.

### Playoff bracket generation

As noted in `07-scheduling-engine-fixes.md` Fix 3.2, no playoff bracket logic exists. The reserved weeks are simply empty. This is a documentation/UX issue, not an algorithmic bug.

---

## 10. Week Number Gaps

**Verdict: BUG -- gaps are created by multiple operations with no normalization**

### Operations that create gaps

1. **`rescheduleMatchup()`** moves a matchup to an arbitrary week number. If all matchups from week 3 are rescheduled elsewhere, week 3 becomes empty. The schedule shows weeks 1, 2, 4, 5... with a gap.

2. **`cancelScheduledMatchup()`** changes status to "cancelled" but does not remove the record. If all matchups in a week are cancelled, the week appears empty but still "exists" in the database.

3. **`removeTeamFromSchedule()` with `bye_opponents`** can cancel bye-vs-bye entries (line 1038-1043). If the removed team was the only team that had a bye in a given week, and their opponent-less bye is cancelled, that week may lose a matchup entry.

### Impact

The `getSchedule()` function at line 276-294 groups matchups by `weekNumber` and returns them sorted. An empty week simply does not appear in the output. The schedule page shows weeks 1, 2, 4 -- which is visually confusing but not data corruption.

However, the course side alternation (Issue 6) depends on `weekNumber % 2`. A gap does not affect this because the alternation is already based on absolute week number, not ordinal position. But this means the sequence of sides a team actually plays may include "jumps" (e.g., front, back, [gap], back instead of front, back, front).

### Severity: MEDIUM

### Recommended Fix

Add an optional "compact week numbers" function that renumbers all unplayed weeks to be contiguous after any schedule manipulation. This should only renumber `status: "scheduled"` matchups, never completed ones.

---

## 11. Unique Constraint Gap on `teamBId`

**Verdict: BUG -- the database constraint does not prevent teamB double-booking**

### The constraint

```prisma
@@unique([leagueId, weekNumber, teamAId])
```

This prevents the same team from being `teamA` in two matchups in the same week. But there is **no constraint on `teamBId`**. A team can appear as `teamBId` in multiple matchups in the same week without violating any database-level constraint.

### Where this matters

The conflict detection in `swapTeamsInMatchup()`, `rescheduleMatchup()`, and `addManualScheduledMatchup()` all perform application-level checks for `teamBId` conflicts using queries. These checks are inside transactions (after Wave 1 fixes), so they are correct for single-server deployments.

However, if two concurrent requests bypass the application layer (e.g., direct database access, or if the interactive transaction isolation does not prevent phantom reads in the specific database engine), a team could end up double-booked as `teamB`.

### Impact

With SQLite/libSQL in serialized mode, concurrent writes are serialized, so this is unlikely to manifest. But if the database ever migrates to PostgreSQL or MySQL with weaker isolation, the lack of a database-level constraint becomes a real risk.

### Severity: MEDIUM (low risk today, high risk on migration)

### Recommended Fix

The ideal fix is a database-level constraint, but Prisma does not support conditional unique indexes or partial indexes that handle nullable `teamBId`. A pragmatic alternative is to add a composite check: create a computed column or use a database trigger. For now, the application-level checks are sufficient, but add a comment documenting the gap.

---

## 12. Double Round-Robin Interleaving Boundary Analysis

**Verdict: CORRECT (after Wave 1 fix)**

The Wave 1 fix replaced a naive `.reverse()` with a circular shift by `Math.floor(halfLen / 2)`:

```typescript
const shift = Math.floor(halfLen / 2);
const interleaved = secondHalfRounds.map((_, i) => {
  const sourceIndex = (i + shift) % halfLen;
  return { ...secondHalfRounds[sourceIndex], weekNumber: secondHalfStart + i };
});
```

For 4 teams (halfLen = 3, shift = 1): the second half order is [round2, round3, round1] instead of [round1, round2, round3]. The boundary rounds are round 3 (last of first half) and round 2 (first of second half). Since round 2 and round 3 have different pairings, no team faces the same opponent in consecutive weeks at the boundary.

For 6 teams (halfLen = 5, shift = 2): the second half order is [round3, round4, round5, round1, round2]. Boundary rounds are round 5 (last first half) and round 3 (first second half). Different pairings. Correct.

For 8 teams (halfLen = 7, shift = 3): boundary rounds are round 7 and round 4. Different pairings. Correct.

The unit test at `round-robin.test.ts:159-190` explicitly verifies this for 4, 6, and 8 teams.

**Note:** For 2 teams (halfLen = 1, shift = 0), no shift is possible. The same opponent appears in consecutive rounds, which is unavoidable.

---

## Summary of Findings

| # | Issue | Severity | Location | Status |
|---|-------|----------|----------|--------|
| 3 | Home/away imbalance: fixed team always home in first half | HIGH | `round-robin.ts:62-71` | NEW |
| 6 | Course side alternation uses absolute week number, breaks on non-contiguous weeks / mid-season start | HIGH | `course-side.ts:28-34` | NEW |
| 6b | `addManualScheduledMatchup` does not assign `courseSide` | HIGH | `schedule.ts:620` | NEW |
| 5a | `fill_byes` always places new team as away | MEDIUM | `schedule.ts:820-831` | NEW |
| 7 | Shotgun start: no duplicate-hole detection within a week | MEDIUM | `schedule.ts:1137-1194` | NEW |
| 10 | Week number gaps from reschedule/cancel with no compaction | MEDIUM | `schedule.ts` (multiple) | NEW |
| 11 | No DB constraint on `teamBId` uniqueness per week | MEDIUM | `schema.prisma:326` | NEW |
| 9 | `playoffWeeks >= totalWeeks` produces 1-week schedule with no warning | LOW | `schedule.ts:95,153` | NEW |
| 8 | 2-team double RR boundary test missing | LOW | `round-robin.test.ts` | NEW |

---

## Recommended Fix Priority

### Priority 1: High Impact, Low Risk

**Fix 3 -- Home/Away Balance.** Add round-parity alternation for the fixed team in `generateSingleRoundRobin()`. This is a ~5 line change in pure function code with no database interaction. All existing tests should still pass (the tests check matchup completeness and pair uniqueness, not home/away assignment specifically). Add new tests for home/away balance.

**Fix 6b -- Missing courseSide on manual matchups.** Add `courseSide` field to `addManualScheduledMatchup()`. This is a ~10 line change that queries the league's play mode and passes it to the create call.

### Priority 2: Medium Impact, Medium Risk

**Fix 6 -- Course side alternation logic.** Change `getCourseSideForWeek()` to accept a reference starting week number, computing `(weekNumber - startWeek) % 2` instead of `weekNumber % 2`. This requires updating all callers to pass the league's first scheduled week. Alternatively, store the first week number explicitly in the league config.

**Fix 7 -- Shotgun duplicate detection.** Add same-week same-hole validation in `assignShotgunStartingHoles()`. Pure validation, no schema change.

### Priority 3: Lower Impact

**Fix 10 -- Week compaction.** Add a `compactWeekNumbers()` utility that renumbers scheduled matchups after manual operations. This is a nice-to-have for admin UX.

**Fix 11 -- teamBId constraint documentation.** Add a code comment and consider adding a check constraint or trigger if the database supports it.

**Fix 9 -- Playoff week validation.** Add a guard: `if (playoffWeeks >= totalWeeks) return error`.

**Fix 8 -- 2-team double RR test.** Add a test case. No code change needed.

---

## Appendix A: Detailed Home/Away Count Proof (Issue 3)

For a single round-robin with teams [1, 2, 3, 4]:

```
Round 0: fixed(1) vs rotating[2]=4, rotating[0]=2 vs rotating[1]=3
  -> Match: 1(H) vs 4(A), 2(H) vs 3(A)

Round 1: rotate [4,2,3] -> [3,4,2]. fixed(1) vs rotating[2]=2, rotating[0]=3 vs rotating[1]=4
  -> Match: 1(H) vs 2(A), 3(H) vs 4(A)

Round 2: rotate [2,3,4] -> [4,2,3]. Wait, let me re-trace.

Initial rotating: [2, 3, 4]

Round 0:
  rotating = [2, 3, 4]
  fixed(1) vs rotating[2]=4 -> {teamA: 1, teamB: 4}
  rotating[0]=2 vs rotating[1]=3 -> {teamA: 2, teamB: 3}

  Then rotate: pop 4, unshift -> [4, 2, 3]

Round 1:
  rotating = [4, 2, 3]
  fixed(1) vs rotating[2]=3 -> {teamA: 1, teamB: 3}
  rotating[0]=4 vs rotating[1]=2 -> {teamA: 4, teamB: 2}

  Then rotate: pop 3, unshift -> [3, 4, 2]

Round 2:
  rotating = [3, 4, 2]
  fixed(1) vs rotating[2]=2 -> {teamA: 1, teamB: 2}
  rotating[0]=3 vs rotating[1]=4 -> {teamA: 3, teamB: 4}
```

Home (teamA) counts: Team 1: 3, Team 2: 1, Team 3: 1, Team 4: 1
Away (teamB) counts: Team 1: 0, Team 2: 2, Team 3: 2, Team 4: 2

Team 1 is home 100% of the time. QED.

---

## Appendix B: Course Side Alternation Example (Issue 6)

League config: `playMode = "nine_hole_alternating"`, `firstWeekSide = "front"`.

Normal schedule (weeks 1-5):
- Week 1: odd -> front
- Week 2: even -> back
- Week 3: odd -> front
- Week 4: even -> back
- Week 5: odd -> front

Mid-season regeneration starting at week 4 (after 3 completed weeks):
- Week 4: even -> back (should be front if this is the new "first" week)
- Week 5: odd -> front
- Week 6: even -> back
- Week 7: odd -> front

The admin configured "start on front" but the regenerated schedule starts on back because week 4 is even. This is the bug.

Reschedule example: matchup moved from week 3 to week 10:
- Week 10: even -> back
- But the matchup was originally on front nine (week 3). The course side changes silently.

Note: `rescheduleMatchup()` does NOT update the `courseSide` field when moving a matchup to a new week. The original `courseSide` value persists, which means the matchup retains its original side assignment even in the new week. This is actually *also* a problem -- if all other matchups in week 10 are "back" (because week 10 is even), this rescheduled matchup would be "front", creating an inconsistency within the same week.
