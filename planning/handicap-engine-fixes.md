# Handicap Engine Fixes — Plan

Based on senior code review of `src/lib/handicap.ts` (840 lines).

**Excluded from scope:** Course rating/slope rating not wired into engine — intentional design (admin-controlled handicaps). Already documented in CLAUDE.md.

---

## Priority 1: Bugs

### 1.1 `describeCalculation` reports false cap application
**File:** `src/lib/handicap.ts:817-836`
**Problem:** The explanation function checks `uncappedBeforeRound > settings.maxHandicap` to decide whether to show "Capped at maximum." But `calculateHandicap` rounds *before* capping (line 486 then 489). If `rawHandicap = 9.1`, `maxHandicap = 9`, `rounding = "floor"` — real engine floors to 9, no cap needed. But `describeCalculation` sees 9.1 > 9 and falsely tells the user their handicap was capped.
**Fix:** In `describeCalculation`, apply rounding to `uncapped` first, *then* check if the rounded value exceeds the cap — matching the order of operations in `calculateHandicap`.

### 1.2 Inconsistent floating-point tie detection
**Files:** `src/lib/handicap.ts:522` and `src/lib/handicap.ts:600`
**Problem:** `suggestPoints` uses epsilon (0.05) for tie detection. `calculateStrokePlayPoints` uses exact `===` equality. Two functions in the same file handle ties differently.
**Fix:** Extract a shared `areScoresTied(a, b)` helper using the epsilon approach. Use it in both `suggestPoints` and `calculateStrokePlayPoints`.

### 1.3 Freeze week semantics — invalid score filtering order
**File:** `src/lib/handicap.ts:431-446`
**Problem:** Invalid scores filtered before freeze truncation. Scores `[-1, 40, 42, 38]` with `freezeWeek=3`: after filtering `[-1]`, array is `[40, 42, 38]`, then "first 3" keeps all — including week 4's score. Freeze should be temporal.
**Fix:** Swap the order — truncate to `freezeWeek` first (preserving positional/temporal meaning), then filter invalid scores. Update the comment accordingly. Also update `describeCalculation` to match.

---

## Priority 2: Design Issues (defensive improvements)

### 2.1 `best_of_last` uses truthiness instead of null check
**File:** `src/lib/handicap.ts:218`
**Problem:** `if (settings.bestOf && settings.lastOf)` — `bestOf = 0` is falsy, silently skipping selection.
**Fix:** Change to `if (settings.bestOf != null && settings.lastOf != null)`.

### 2.2 No validation that `bestOf <= lastOf`
**File:** `src/lib/handicap.ts:218-231`
**Problem:** `bestOf = 10`, `lastOf = 3` silently degrades to "all of last 3."
**Fix:** Add a guard: if `bestOf > lastOf`, log a warning and clamp `bestOf` to `lastOf`. Alternatively, throw. Prefer clamping with `console.warn` to match the existing `applyCaps` pattern (line 388).

### 2.3 `leagueToHandicapSettings` trusts database blindly
**File:** `src/lib/handicap.ts:658-726`
**Problem:** The four required fields (`handicapBaseScore`, `handicapMultiplier`, `handicapRounding`, `handicapDefault`) have no null/type validation. Database corruption → silent wrong handicaps.
**Fix:** Add Zod validation at the top of `leagueToHandicapSettings`. Parse the league object through a schema. On failure, return `DEFAULT_HANDICAP_SETTINGS` with a warning log. This aligns with the project's stated pattern of "Zod for all inputs."

### 2.4 `calculateNetScore` and `suggestPoints` don't guard NaN
**File:** `src/lib/handicap.ts:500-502, 514-538`
**Problem:** Both functions propagate NaN silently. Callers all check `isFinite` downstream, but the functions themselves are unsafe.
**Fix:** Add NaN/Infinity guards to both functions. Return 0 or a sensible default with a warning, matching the pattern in `calculateHandicap` (line 468).

### 2.5 Trend calculation asymmetry for odd-length arrays
**File:** `src/lib/handicap.ts:346-348`
**Problem:** Middle element always goes to "newer" half for odd-length arrays, slightly biasing trend detection.
**Fix:** Exclude the middle element for odd-length arrays: `scores.slice(0, midpoint)` vs `scores.slice(midpoint + 1)` when `scores.length` is odd. This makes the comparison symmetric.

---

## Priority 3: Cosmetic / Low-risk

### 3.1 `applyPreset` silently returns current settings for unknown preset names
**File:** `src/lib/handicap.ts:183-185`
**Fix:** Add `console.warn` for unrecognized preset names.

### 3.2 `requireApproval` is carried but never used
**File:** `src/lib/handicap.ts:50, 90`
**Fix:** Add a comment: `// Administrative flag — checked in action layer, not in calculation engine`

### 3.3 Rename "USGA-Inspired" preset
**File:** `src/lib/handicap.ts:119`
**Fix:** Rename to `"Best of Recent"` or `"Tournament Style"` to avoid implying WHS compliance. Update label and description.

### 3.4 Duplicate handicap function in e2e test
**File:** `e2e/seed-via-ui.spec.ts:69`
**Problem:** Local reimplementation of `calculateHandicap` that can drift from the real engine.
**Fix:** Import from `src/lib/handicap.ts` instead.

---

## Execution Order

1. **1.1 → 1.2 → 1.3** (bugs first, each is independent)
2. **2.1 → 2.2** (quick guard fixes, do together)
3. **2.3** (Zod schema addition — slightly more involved)
4. **2.4 → 2.5** (defensive fixes)
5. **3.1 → 3.4** (cosmetic, batch together)

Each fix should include a corresponding unit test in `tests/unit/handicap.test.ts` that demonstrates the bug existed and is now fixed.
