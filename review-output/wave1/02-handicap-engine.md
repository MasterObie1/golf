# Code Review: Handicap Calculation Engine

**File:** `/Users/alexoberlander/Documents/Claude/golf/src/lib/handicap.ts`
**Reviewer:** Senior Staff Engineer
**Date:** 2026-02-11
**Lines:** 889
**Test file:** `/Users/alexoberlander/Documents/Claude/golf/tests/unit/handicap.test.ts` (1098 lines, 70+ test cases)

---

## 1. Executive Summary

**Is this really the best code in the project?** Yes, by a wide margin.

The handicap engine is a well-structured, thoroughly documented, pure-functional calculation module. It demonstrates several qualities that are rare in the rest of the codebase:

- **Pure functions throughout** -- no database calls, no side effects beyond `console.warn` for diagnostics
- **Defensive guards** at every boundary -- NaN, Infinity, empty arrays, zero-length results after filtering
- **Chronological order contract** clearly documented in the JSDoc
- **Preset system** that cleanly separates configuration from computation
- **Zod validation** at the database-to-settings boundary
- **`describeCalculation` parity** -- an explanation function that mirrors the calculation pipeline step-by-step

That said, "best in the project" is a relative bar. The engine still has several issues worth addressing, ranging from a subtle mathematical edge case to a few missing input validations. The prior review (in `planning/handicap-engine-fixes.md`) already identified and fixed the most severe bugs (freeze week ordering, floating-point tie detection, Zod validation). What remains are secondary issues.

**Overall grade: B+.** Strong design fundamentals with a handful of remaining edge cases and one real bug.

---

## 2. Findings Table

| # | Severity | Category | Summary | Lines |
|---|----------|----------|---------|-------|
| F1 | HIGH | Mathematical | `weightRecent=0` or `weightDecay=0` causes division by zero or all-zero weights | 326-337 |
| F2 | HIGH | Edge Case | `getTeamPreviousScores` can return gross score 0 for unplayed matchups (no `where` filter on submitted status) | External (teams.ts:81-96) |
| F3 | MEDIUM | Logic | Freeze week assumes 1:1 mapping of array positions to calendar weeks, but `getTeamPreviousScores` filters out sub games, breaking the positional guarantee | 445-454 |
| F4 | MEDIUM | Type Safety | `calculateNetScore` rounds to 1 decimal but JSDoc says "net score", implying integer -- inconsistent with `suggestPoints` epsilon of 0.05 | 522-529 |
| F5 | MEDIUM | Edge Case | `selectScores` with `best_of_last` and duplicate values -- `bestIndices.includes(idx)` can select wrong duplicates when tiebreaking | 236-241 |
| F6 | MEDIUM | Validation | `leagueToHandicapSettings` validates only 5 of 21 fields via Zod -- remaining 16 use `??` fallback with no type checking | 689-695 |
| F7 | LOW | Performance | `best_of_last` selection uses `Array.filter` with `Array.includes` -- O(n*m) where a `Set` would be O(n) | 241 |
| F8 | LOW | Design | `console.warn` used for diagnostics is a side effect in otherwise pure functions -- breaks testability without spy mocking | 188, 227, 402, 525-526 |
| F9 | LOW | Preset Design | `strict` preset sets `maxHandicap: 18` but defaults `baseScore: 35` (from DEFAULT) -- these are 9-hole settings but 18 is a full-round cap, mixed metaphor | 159-169 |
| F10 | LOW | API Design | `applyPreset` silently uses `DEFAULT_HANDICAP_SETTINGS` as the base even for non-custom presets, meaning applying "usga_style" to a league with `baseScore: 40` resets it to 35 | 193 |

---

## 3. Detailed Analysis

### F1 -- `weightRecent=0` or `weightDecay=0` causes degenerate behavior

**Severity:** HIGH
**Lines:** 326-337

```typescript
for (let i = 0; i < scores.length; i++) {
  const recencyIndex = scores.length - 1 - i;
  const weight = settings.weightRecent * Math.pow(settings.weightDecay, recencyIndex);
  weightedSum += scores[i] * weight;
  totalWeight += weight;
}

if (totalWeight === 0) return scores.reduce((sum, s) => sum + s, 0) / scores.length;
```

**Problem:** The upstream Zod schema in `league-settings.ts:121-122` allows `weightRecent: z.number().min(0)` and `weightDecay: z.number().min(0)`. This means:

1. **`weightRecent = 0`**: All weights become 0. The `totalWeight === 0` guard catches this and falls back to simple average. This is correct but surprising -- the user enabled weighting and set a weight, but gets unweighted results with no feedback.

2. **`weightDecay = 0`**: `Math.pow(0, 0) = 1` for the newest score, but `Math.pow(0, n) = 0` for all older scores. Only the newest score has a non-zero weight. The function returns just the newest score, ignoring all history. This is mathematically correct but almost certainly not what the user intended.

3. **`weightDecay = 0` AND `weightRecent = 0`**: `0 * Math.pow(0, 0) = 0 * 1 = 0` for newest, `0 * 0 = 0` for all others. Falls back to simple average via the guard. Correct but confusing.

**Risk:** The Zod validation allows these values. A league admin could set `weightDecay: 0` thinking "no decay" (constant weights) but instead get "only newest score matters."

**Recommendation:** Either:
- Change the Zod schema to `min(0.01)` for both fields (prevent degenerate values), or
- Add explicit guards in `calculateWeightedAverage` that warn and fall back to simple average when `weightRecent <= 0` or `weightDecay <= 0`

---

### F2 -- `getTeamPreviousScores` returns unsubmitted matchup scores

**Severity:** HIGH
**Lines:** External -- `src/lib/actions/teams.ts:81-96`

```typescript
export async function getTeamPreviousScores(leagueId: number, teamId: number): Promise<number[]> {
  const matchups = await prisma.matchup.findMany({
    where: {
      leagueId,
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
    orderBy: { weekNumber: "asc" },
  });
  // ...
}
```

**Problem:** This query has no filter on matchup status (submitted, finalized, etc.). If the system pre-creates matchups for a schedule with default `teamAGross: 0`, those zeroes will be included in the handicap calculation.

The handicap engine filters `s >= 0 && isFinite(s)` (line 457), and `0 >= 0` is true, so a gross score of 0 passes validation. This would catastrophically drag down the average. A 9-hole score of 0 is not a valid golf score.

**Impact on engine:** The engine itself is not at fault -- it correctly processes what it receives. But the engine's invalid-score filter only catches negative and non-finite values. Zero is a valid mathematical input that is an invalid golf score.

**Recommendation:** Either:
- Add a `minValidScore` threshold to `HandicapSettings` (e.g., default 15 for 9-hole), or
- Change the filter in `calculateHandicap` from `s >= 0` to `s > 0`, or
- Fix the data layer to only return submitted matchups (add `where: { teamAPoints: { gt: 0 } }` or a status field)

---

### F3 -- Freeze week positional mapping breaks when sub games are filtered

**Severity:** MEDIUM
**Lines:** 445-454

```typescript
if (weekNumber !== undefined && settings.freezeWeek !== null && settings.freezeWeek > 0 && weekNumber > settings.freezeWeek) {
  workingScores = workingScores.slice(0, settings.freezeWeek);
}
```

The CLAUDE.md acknowledges the freeze week semantic issue, and the prior fix (swapping truncation before filtering) was correct. However, there is a deeper problem.

**The contract says:** "Each array position corresponds to a calendar week." But `getTeamPreviousScores` filters out sub games:

```typescript
.filter((m) => {
  if (m.teamAId === teamId) return !m.teamAIsSub;
  return !m.teamBIsSub;
})
```

If a team had a sub in week 2, the array becomes `[week1Score, week3Score, week4Score, ...]`. Now `slice(0, freezeWeek=3)` takes the first 3 elements, which correspond to weeks 1, 3, and 4 -- not weeks 1, 2, and 3.

**Impact:** Freeze week enforcement is inaccurate for any team that has ever had a substitute player. The engine cannot detect this because it only receives an array of numbers with no week metadata.

**Recommendation:** Change the input contract to accept `{ weekNumber: number; score: number }[]` instead of `number[]`, allowing the engine to properly truncate by week number rather than array position. This is a larger refactor but is the only correct solution.

---

### F4 -- `calculateNetScore` rounding inconsistency

**Severity:** MEDIUM
**Lines:** 522-529

```typescript
export function calculateNetScore(grossScore: number, handicap: number): number {
  const result = Math.round((grossScore - handicap) * 10) / 10;
  // ...
}
```

The function rounds to 1 decimal place. But:

1. **Gross scores are integers** (database schema: `teamAGross Int`), and handicaps are floored integers (line 500). Integer minus integer is always integer -- the rounding is a no-op for the primary use case.

2. **`suggestPoints` uses `areScoresTied` with epsilon 0.05** (line 552). If net scores can have 1 decimal of precision, then a difference of 0.1 would not be a tie (0.1 > 0.05). This is correct. But if the handicap were a float (e.g., from `provMultiplier`), net could be fractional. The `calculateHandicap` function floors before returning (line 500), so handicaps are always integers. The 1-decimal rounding in `calculateNetScore` is therefore purely defensive, not actively needed.

**Risk:** Low. The rounding is harmless. But the epsilon of 0.05 in `areScoresTied` is arbitrary and undocumented -- it should be justified or derived from the maximum possible floating-point error in `calculateNetScore`.

---

### F5 -- `best_of_last` with duplicate scores can select wrong indices

**Severity:** MEDIUM
**Lines:** 236-241

```typescript
const bestIndices = [...lastWithIndices]
  .sort((a, b) => a.val - b.val)
  .slice(0, effectiveBestOf)
  .map(item => item.origIdx);
selected = selected.filter((_, idx) => bestIndices.includes(idx));
```

This code tracks original indices correctly, which avoids the duplicate-value problem. The sort is stable in V8 (TimSort), and since we track `origIdx`, two identical values will get different indices. This is actually correct.

**However,** there is a subtle issue: when the sort encounters equal values at the boundary of the `slice(0, effectiveBestOf)` cut, the selection is deterministic but arbitrary -- it picks the earlier index among tied values. This is fine for calculation but could surprise users. A tie at the inclusion boundary means one identical score is included and another is excluded based solely on which week it occurred.

**Risk:** Low. The behavior is deterministic and consistent. No fix needed, but a comment explaining boundary tie behavior would be helpful.

---

### F6 -- Partial Zod validation in `leagueToHandicapSettings`

**Severity:** MEDIUM
**Lines:** 689-695

```typescript
const leagueHandicapSchema = z.object({
  handicapBaseScore: z.number(),
  handicapMultiplier: z.number(),
  handicapRounding: z.string(),
  handicapDefault: z.number(),
  handicapMax: z.number().nullable(),
});
```

Only 5 of the 21 fields are validated. The remaining 16 use `??` fallback:

```typescript
scoreCount: league.handicapScoreCount ?? null,
dropHighest: league.handicapDropHighest ?? 0,
useWeighting: league.handicapUseWeighting ?? false,
```

**Problem:** If `league.handicapDropHighest` is a string `"2"` due to database corruption, the `??` operator passes it through (strings are truthy). The engine would then use `"2"` in numeric comparisons, which could produce incorrect results via type coercion (e.g., `"2" + 0 = "20"` in concatenation contexts).

**Risk:** Moderate. Prisma's type system provides some protection at runtime, but direct database modifications or schema migrations could introduce type mismatches.

**Recommendation:** Extend the Zod schema to validate all 21 fields, matching the complete `updateHandicapSettingsSchema` in `league-settings.ts`.

---

### F7 -- O(n*m) in `best_of_last` selection

**Severity:** LOW
**Lines:** 241

```typescript
selected = selected.filter((_, idx) => bestIndices.includes(idx));
```

`bestIndices` is an array, so `.includes()` is O(m) per element. The total operation is O(n * m) where n = selected.length and m = bestOf. Since both are bounded by ~100 (Zod schema max), this is at most 10,000 operations -- negligible.

**Recommendation:** Replace with `new Set(bestIndices)` and `.has()` for O(1) lookup. Not urgent but is a good practice change.

---

### F8 -- `console.warn` as diagnostic output

**Severity:** LOW
**Lines:** 188, 227, 402, 525-526

The engine uses `console.warn` for several diagnostic messages:
- Unknown preset name (line 188)
- bestOf > lastOf clamping (line 227)
- Contradictory handicap caps (line 402)
- Non-finite `calculateNetScore` result (line 525)

**Problem:** These are the only side effects in otherwise pure functions. They force test code to mock `console.warn` to prevent noisy output and to assert warnings were emitted. The existing test file has 8 instances of `vi.spyOn(console, "warn")`.

**Recommendation:** Consider a callback-based or return-value-based warning system. For example, `calculateHandicap` could return `{ handicap: number; warnings: string[] }`. This would make the functions truly pure and simplify testing. This is a non-trivial API change and should be considered for a future version.

---

### F9 -- Mixed 9-hole and 18-hole semantics in presets

**Severity:** LOW
**Lines:** 159-169

The `strict` preset sets `maxHandicap: 18`:

```typescript
{
  name: "strict",
  settings: {
    maxHandicap: 18,
    capExceptional: true,
    exceptionalCap: 50,
    // ...
  },
}
```

The default `baseScore` is 35, which is a typical 9-hole score. A `maxHandicap` of 18 is a full-round number. Similarly, `exceptionalCap: 50` is close to a 9-hole max but would be extremely low for 18 holes.

**Risk:** An admin selecting the "Strict" preset for an 18-hole league would get a `baseScore` of 35 (from defaults), which makes no sense for 18-hole play. The preset system has no concept of hole count.

**Recommendation:** Either document that presets are 9-hole only, or add a `holes: 9 | 18` field to `HandicapSettings` with preset variants for each.

---

### F10 -- `applyPreset` resets non-preset fields to defaults

**Severity:** LOW
**Lines:** 193

```typescript
return { ...DEFAULT_HANDICAP_SETTINGS, ...presetTemplate.settings };
```

When a preset is applied, ALL settings are reset to defaults first, then the preset's specific overrides are layered on. The `current` parameter is ignored for non-custom presets.

**Impact:** If a league has `baseScore: 40` and selects the "Competitive" preset, their `baseScore` is silently reset to 35. The comment in `applyPreset` does not explain this behavior.

The existing test on line 604-610 explicitly verifies this behavior, so it appears intentional. But it is surprising -- most users would expect a preset to only change the fields it defines, leaving other settings untouched.

**Recommendation:** Add a UI confirmation ("Applying this preset will reset all settings to defaults. Continue?") or change the behavior to `{ ...current, ...presetTemplate.settings }`.

---

## 4. Issues Previously Fixed (Confirmed)

The following issues from `planning/handicap-engine-fixes.md` have been verified as correctly resolved:

| Fix | Status | Verification |
|-----|--------|--------------|
| 1.1: `describeCalculation` false cap reporting | FIXED | Lines 867-885 now apply rounding before checking caps |
| 1.2: Inconsistent floating-point tie detection | FIXED | `areScoresTied` helper used in both `suggestPoints` (line 552) and `calculateStrokePlayPoints` (line 630) |
| 1.3: Freeze week temporal truncation order | FIXED | Lines 445-454 truncate before filtering |
| 2.1: `best_of_last` truthiness check | FIXED | Line 224 uses `!= null` |
| 2.2: `bestOf > lastOf` validation | FIXED | Lines 225-229 clamp with warning |
| 2.3: Zod validation in `leagueToHandicapSettings` | FIXED | Lines 689-695 (partial -- see F6) |
| 2.4: NaN guards in `calculateNetScore` and `suggestPoints` | FIXED | Lines 524-528 and 545-548 |
| 2.5: Trend calculation odd-array asymmetry | FIXED | Lines 359-362 exclude middle element |
| 3.1: `applyPreset` warns on unknown preset | FIXED | Lines 187-188 |
| 3.3: USGA-Inspired preset renamed | FIXED | Line 123: "Best of Recent" |

---

## 5. Mathematical Correctness Analysis

### Core Formula: `(average - baseScore) * multiplier`

Mathematically sound. The subtraction-then-multiplication pattern is a standard linear transformation. No division-by-zero risk in the formula itself.

### Weighted Average

The exponential decay model `weight = weightRecent * decay^recencyIndex` is a standard recency weighting scheme. It is mathematically correct for positive `weightRecent` and `weightDecay` in (0, 1].

**Edge cases:**
- `weightDecay > 1`: Weights grow exponentially for older scores (anti-recency). Mathematically valid but semantically backwards. The Zod schema allows up to 2.0.
- `weightDecay = 1`: All scores get equal weight `weightRecent`. Equivalent to simple average. Correct.
- `weightDecay = 0`: Only newest score counts. See F1.

### Trend Calculation

The split-halves comparison is a crude but effective trend detection method. For 3 scores, it compares 1 score against 1 score (middle excluded). This is statistically weak but sufficient for the use case.

**Potential issue:** The trend adjustment is subtracted from `rawHandicap` (line 488). A positive trend (improvement = older higher than newer) reduces the handicap, rewarding improvement. This is anti-sandbagging as documented. However, the trend magnitude scales with the absolute score difference, not relative -- a player averaging 50 who drops to 40 gets the same trend adjustment as a player averaging 35 who drops to 25, even though the former is a more dramatic relative improvement.

### Rounding

`Math.floor`, `Math.ceil`, and `Math.round` are correctly implemented. `Math.round` uses "round half to even" in some edge cases on some engines -- this could produce unexpected results for exactly `.5` values. In practice, this is unlikely to cause issues.

### Caps

The `applyCaps` function correctly handles:
- Only max set: caps above
- Only min set: caps below
- Both set and consistent: caps both
- Both set and contradictory: skips with warning

The contradictory-caps guard (line 401) is defensive but correct.

---

## 6. Pure Function Analysis

### Are the functions truly pure?

**Almost.** The only side effects are `console.warn` calls (see F8). All functions:
- Take inputs and return outputs
- Do not modify their inputs (arrays are copied with `[...scores]` on line 209, 443)
- Do not access global state
- Do not perform I/O (aside from `console.warn`)
- Are deterministic for the same inputs

The `console.warn` calls are diagnostics only and do not affect return values. In a strict FP sense, they are impure. In practice, they are acceptable.

### Input immutability

All array inputs are shallow-copied before modification:
- Line 209: `let selected = [...scores]`
- Line 443: `let workingScores = [...scores]`
- Line 615: `const sorted = [...playing].sort(...)`

This is correct. The original arrays are never mutated.

---

## 7. Freeze Week Semantic Analysis

The CLAUDE.md documents: "freeze means 'first N valid scores' not 'scores from weeks 1..N'."

**Post-fix status:** The code now truncates first, then filters. This means freeze IS "scores from positions 1..N" (which are intended to correspond to weeks 1..N), then invalid scores within that window are removed. This is the correct semantic.

**However,** as noted in F3, the positional assumption breaks when sub games are filtered upstream. The array received by `calculateHandicap` has gaps in week coverage that the engine cannot detect.

**Example:**
- Team plays weeks 1-5, with a sub in week 2
- `getTeamPreviousScores` returns `[w1, w3, w4, w5]` (4 scores)
- `freezeWeek = 3`: `slice(0, 3)` takes `[w1, w3, w4]`
- This includes week 4, which is beyond the freeze boundary

This is a data-layer problem, not an engine problem. The engine's contract is clear: "array positions = calendar weeks." The caller violates this contract.

---

## 8. Performance Analysis

All functions are O(n) or O(n log n) where n = number of scores:

| Function | Complexity | Notes |
|----------|-----------|-------|
| `selectScores` | O(n log n) | Due to sorting for drop/best-of |
| `capExceptionalScores` | O(n) | Single pass |
| `calculateWeightedAverage` | O(n) | Single pass |
| `calculateTrendAdjustment` | O(n) | Two half-passes |
| `calculateHandicap` | O(n log n) | Dominated by `selectScores` |
| `calculateStrokePlayPoints` | O(n log n) | Due to sorting |

With n bounded by ~100 (max scoreCount), performance is not a concern. No O(n^2) patterns exist (the `bestIndices.includes` in F7 is technically O(n*m) but bounded).

---

## 9. Suggested Test Cases

The existing test file has excellent coverage (70+ tests). Below are additional scenarios that are not currently tested:

### Mathematical Edge Cases

| # | Test Scenario | Expected Behavior | Priority |
|---|---------------|-------------------|----------|
| T1 | `weightRecent = 0, weightDecay = 0.9` with multiple scores | Falls back to simple average (totalWeight = 0 guard) | HIGH |
| T2 | `weightRecent = 1.0, weightDecay = 0` with `[30, 40, 50]` | Returns 50 (only newest score has weight) | HIGH |
| T3 | `weightDecay = 1.0` (no decay) with weighting enabled | Returns same as simple average | MEDIUM |
| T4 | `multiplier = 0` with any scores | Returns 0 handicap (after floor) | MEDIUM |
| T5 | `baseScore = 0` with typical scores | Returns `floor(avg * multiplier)` | LOW |

### Boundary Conditions

| # | Test Scenario | Expected Behavior | Priority |
|---|---------------|-------------------|----------|
| T6 | Single score exactly at `exceptionalCap` | Score is NOT capped (uses `Math.min`, equal value preserved) | MEDIUM |
| T7 | All scores identical, with `dropHighest=1, dropLowest=1` | Drops 2 copies of same value, averages remainder | MEDIUM |
| T8 | `scoreCount = 1` with `last_n` selection | Uses only the most recent score | MEDIUM |
| T9 | `bestOf = 1, lastOf = 1` with `best_of_last` | Uses only the most recent score | MEDIUM |
| T10 | `freezeWeek = 1` with 10 scores, `weekNumber = 2` | Uses only the first score | HIGH |

### Degenerate Inputs

| # | Test Scenario | Expected Behavior | Priority |
|---|---------------|-------------------|----------|
| T11 | Scores array with `NaN` values mixed in | NaN filtered by `isFinite` check, remaining scores used | HIGH |
| T12 | Scores array with `Infinity` values | Infinity filtered, remaining scores used | MEDIUM |
| T13 | Scores array with negative values (e.g., `[-5, 40, 42]`) | Negatives filtered, `[40, 42]` used | MEDIUM |
| T14 | All scores are `NaN` | Returns `defaultHandicap` | HIGH |
| T15 | All scores are 0 | `(0 - 35) * 0.9 = -31.5`, floor = -32 (or capped by min) | HIGH |

### Feature Interaction

| # | Test Scenario | Expected Behavior | Priority |
|---|---------------|-------------------|----------|
| T16 | `freezeWeek + best_of_last`: 10 scores, freeze at 5, best 3 of last 4 | Truncate to 5 scores first, then select best 3 of last 4 from those 5 | HIGH |
| T17 | `capExceptional + dropHighest`: scores `[40, 60, 55]`, cap at 50, drop 1 highest | Cap to `[40, 50, 50]`, then drop highest 50 -> `[40, 50]`, avg = 45 | MEDIUM |
| T18 | `provisional + trend + caps`: provWeeks=4, week=3, improving trend, maxCap=5 | All three modifiers applied in correct order | MEDIUM |
| T19 | `weighting + best_of_last`: ensures selected scores maintain chronological order for weighting | Weighted average uses correct recency indices after selection | HIGH |
| T20 | `dropHighest + dropLowest` with exactly `totalDrops + 1` scores | Returns single remaining score | MEDIUM |

### Stroke Play Points

| # | Test Scenario | Expected Behavior | Priority |
|---|---------------|-------------------|----------|
| T21 | All teams tied in stroke play with "split" mode | All get averaged points from all positions | MEDIUM |
| T22 | All teams tied in stroke play with "same" mode | All get position 1 points | MEDIUM |
| T23 | 3-way tie at position 2 in stroke play | Positions 2, 3, 4 merged; correct split/same handling | MEDIUM |
| T24 | Empty `entries` array to `calculateStrokePlayPoints` | Returns empty results array | LOW |
| T25 | All teams DNP | All get DNP points, no position assignments | LOW |

### `describeCalculation` Parity

| # | Test Scenario | Expected Behavior | Priority |
|---|---------------|-------------------|----------|
| T26 | `describeCalculation` output matches `calculateHandicap` result for every preset | Steps trace should produce the same number as the engine | HIGH |
| T27 | `describeCalculation` with trend adjustment active | Steps include trend description with correct sign | MEDIUM |
| T28 | `describeCalculation` with provisional period active | Steps include provisional multiplier description | MEDIUM |
| T29 | `describeCalculation` with all features enabled simultaneously | All steps present in correct order | MEDIUM |

### Regression Guards

| # | Test Scenario | Expected Behavior | Priority |
|---|---------------|-------------------|----------|
| T30 | `suggestPoints` with diff exactly 0.05 (epsilon boundary) | Treated as tie (10/10) | MEDIUM |
| T31 | `suggestPoints` with diff exactly 0.06 (just beyond epsilon) | Not a tie, winner gets 12 points | MEDIUM |
| T32 | `applyPreset` with invalid preset name (type-cast bypass) | Returns current settings with warning | LOW |

---

## 10. Refactored Code Examples

### F1 Fix: Guard against degenerate weighting parameters

```typescript
export function calculateWeightedAverage(
  scores: number[],
  settings: HandicapSettings
): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1 || !settings.useWeighting) {
    return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }

  // Guard against degenerate weighting parameters
  if (settings.weightRecent <= 0) {
    console.warn(
      `weightRecent (${settings.weightRecent}) is non-positive. Falling back to simple average.`
    );
    return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }

  if (settings.weightDecay <= 0) {
    console.warn(
      `weightDecay (${settings.weightDecay}) is non-positive. Only the most recent score will be used.`
    );
    return scores[scores.length - 1];
  }

  // ... rest of existing implementation
}
```

### F3 Fix: Structured score input for freeze week correctness

```typescript
// New input type that preserves week metadata
export interface WeekScore {
  weekNumber: number;
  score: number;
}

export function calculateHandicapV2(
  weekScores: WeekScore[],
  settings: HandicapSettings = DEFAULT_HANDICAP_SETTINGS,
  currentWeekNumber?: number
): number {
  if (weekScores.length === 0) return settings.defaultHandicap;

  let working = [...weekScores];

  // Freeze week: filter by actual week number, not array position
  if (
    currentWeekNumber !== undefined &&
    settings.freezeWeek !== null &&
    settings.freezeWeek > 0 &&
    currentWeekNumber > settings.freezeWeek
  ) {
    working = working.filter((ws) => ws.weekNumber <= settings.freezeWeek!);
    if (working.length === 0) return settings.defaultHandicap;
  }

  // Extract scores in chronological order for the rest of the pipeline
  const scores = working
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((ws) => ws.score);

  // Filter invalid scores
  const validScores = scores.filter((s) => s >= 0 && isFinite(s));
  if (validScores.length === 0) return settings.defaultHandicap;

  // ... rest of pipeline unchanged
}
```

### F7 Fix: Use Set for O(1) lookup

```typescript
// In selectScores, best_of_last branch:
const bestIndicesSet = new Set(
  [...lastWithIndices]
    .sort((a, b) => a.val - b.val)
    .slice(0, effectiveBestOf)
    .map((item) => item.origIdx)
);
selected = selected.filter((_, idx) => bestIndicesSet.has(idx));
```

---

## 11. Architectural Observations

### Strengths

1. **Clear pipeline architecture**: The `calculateHandicap` function follows a numbered step sequence (Steps 1-8) that is easy to follow and debug.

2. **`describeCalculation` shadow pipeline**: Having an explanation function that mirrors the calculation is excellent for debugging and user trust. The prior bug fix (1.1) shows why keeping these in sync matters.

3. **Preset system**: Clean separation of configuration presets from the calculation engine. The `applyPreset` function is simple and predictable.

4. **Defensive programming**: NaN/Infinity guards at multiple levels, empty-array checks, fallback to defaults. The engine is resilient to bad inputs.

5. **Zod validation at the boundary**: The `leagueToHandicapSettings` function validates database inputs before they enter the calculation pipeline.

### Weaknesses

1. **No input validation on `calculateHandicap` itself**: The function trusts that `settings` is a valid `HandicapSettings` object. A caller could pass `{ multiplier: "oops" }` and TypeScript would not catch it at runtime. Runtime Zod validation happens only at the `leagueToHandicapSettings` boundary.

2. **`console.warn` coupling**: Pure functions should not have side effects. The warning system couples the engine to the console API and requires spy-based testing.

3. **No concept of hole count**: The engine operates on raw scores without knowing if they are 9-hole or 18-hole. This makes presets and caps context-dependent in ways that are not obvious to the user.

4. **Freeze week depends on external contract**: The engine cannot verify that array positions correspond to calendar weeks. This is a fundamental limitation of the `number[]` input type.

---

## 12. Conclusion

The handicap engine deserves its reputation as the best code in the project. It demonstrates thoughtful design, thorough edge-case handling, and a clear computational pipeline. The prior review cycle (documented in `planning/handicap-engine-fixes.md`) addressed the most critical bugs.

The remaining issues (F1-F10) are mostly MEDIUM or LOW severity. The two HIGH findings (F1: degenerate weighting parameters, F2: zero gross scores from unsubmitted matchups) are worth addressing before the next release, but neither represents a data corruption risk -- they produce mathematically valid but semantically incorrect handicaps.

The test suite is comprehensive at 70+ tests and covers the major fix regressions. The 32 additional test scenarios suggested above would bring coverage to near-complete for the engine's API surface.

**Recommended priority for remaining fixes:**
1. F1 -- Guard `weightRecent`/`weightDecay` against zero (quick fix)
2. F2 -- Fix upstream `getTeamPreviousScores` to filter unsubmitted matchups (data layer fix)
3. F3 -- Plan migration to `WeekScore[]` input type (design phase)
4. F6 -- Extend Zod schema in `leagueToHandicapSettings` (moderate effort)
5. F7-F10 -- Address in normal development cycle
