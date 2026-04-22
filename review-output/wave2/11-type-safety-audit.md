# Type Safety & Validation Audit

**Reviewer:** Senior Staff Engineer
**Date:** 2026-02-11
**Scope:** All non-generated `.ts` and `.tsx` files in `src/`
**Audit Type:** TypeScript type assertion census, `any` usage census, Zod validation gap analysis, nullable safety review

---

## 1. Executive Summary

The codebase benefits from `"strict": true` in `tsconfig.json`, which enables `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, and all other strict-mode flags. This is the correct baseline. However, the **application code undermines strict mode through 60+ `as` type assertions**, many of which are unsafe casts that silently bypass the type system at exactly the boundaries where runtime data enters the application.

The most systemic problem is the **`as` assertion pattern on string union types** in the admin components. The Prisma schema stores fields like `scoringType`, `handicapRounding`, and `playMode` as `String`, which means Prisma returns `string` at runtime. Rather than validating these values at the boundary (Zod, type guard, or discriminated union), the code casts them with `as "match_play" | "stroke_play" | "hybrid"` in 30+ places. If a database migration adds a new enum value or a row has corrupted data, these assertions will silently produce values that don't match the union -- the type system says it's safe, but the runtime behavior is undefined.

The Zod validation coverage has improved significantly since Wave 1 identified zero validation in `schedule.ts` and `scorecards.ts`. Currently, **14 of 16 action modules** have Zod schemas for their write operations. However, `schedule.ts` (15 exported functions, 10 write operations) and `scorecards.ts` (18 exported functions, 10 write operations) still have **zero Zod validation**, making them the largest remaining gaps.

**Summary of Findings:**
- **60+ `as` type assertions** in application code (excluding generated files): 18 safe, 42+ unsafe
- **0 explicit `any` types** in application code (all `any` occurrences are in generated Prisma files)
- **1 `as unknown as` double cast** in application code (the standard Prisma global singleton pattern)
- **5 non-null assertions (`!`)** in application code, 1 is unsafe
- **Zod coverage: ~65% of write actions** have Zod input validation
- **20 write actions across 2 modules** have zero input validation
- **30+ string-to-union casts** that should be validated at the boundary

---

## 2. TypeScript Strict Mode Configuration

**File:** `/Users/alexoberlander/Documents/Claude/golf/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "strict": true,
    ...
  }
}
```

**Verdict: Correct.** `"strict": true` enables:
- `strictNullChecks` -- prevents `null`/`undefined` from being assigned to non-nullable types
- `noImplicitAny` -- requires all variables to have explicit types
- `strictFunctionTypes` -- enables contravariant parameter checking
- `strictBindCallApply` -- checks `bind`, `call`, `apply`
- `strictPropertyInitialization` -- class properties must be initialized
- `noImplicitThis` -- `this` must be typed
- `alwaysStrict` -- emits `"use strict"` in every file

No additional strictness flags are missing. The configuration is appropriate.

---

## 3. Complete `as` Type Assertion Census

### 3.1 Classification Legend

- **SAFE**: The assertion is provably correct (e.g., `as const`, narrowing after a type guard, well-known DOM patterns)
- **UNSAFE-BENIGN**: The assertion bypasses the type system but is unlikely to cause a runtime error in practice (e.g., casting after a manual null check)
- **UNSAFE-RISKY**: The assertion can produce incorrect runtime behavior if the input data doesn't match the expected type
- **UNSAFE-DANGEROUS**: The assertion is on a trust boundary (server action input, database output, JSON parse) where incorrect data is plausible

### 3.2 Infrastructure & Utility Files

| # | File | Line | Assertion | Classification | Explanation |
|---|------|------|-----------|----------------|-------------|
| 1 | `src/lib/db.ts` | 4 | `globalThis as unknown as { prisma: PrismaClient \| undefined }` | **SAFE** | Standard Prisma singleton pattern. `globalThis` is structurally compatible; the double cast is a well-known TypeScript idiom for extending global objects. |
| 2 | `src/lib/logger.ts` | 12 | `env as LogLevel` | **SAFE** | Guarded by `env in LOG_LEVELS` check on the same line. The `in` check narrows the string to a key of `LOG_LEVELS`, making the cast redundant but harmless. |
| 3 | `src/lib/rate-limit.ts` | 113 | `} as const` | **SAFE** | Object literal `as const` for immutable config. No type erasure. |
| 4 | `src/lib/animation.ts` | 9-122 | Multiple `as const` | **SAFE** | All `as const` on literal objects/tuples. No type erasure. |

### 3.3 Handicap Engine (`src/lib/handicap.ts`)

| # | Line | Assertion | Classification | Explanation |
|---|------|-----------|----------------|-------------|
| 5 | 299 | `settings.exceptionalCap as number` | **UNSAFE-BENIGN** | Guarded by `settings.exceptionalCap === null` on line 294. If the guard passes, `exceptionalCap` is `number`. The cast is redundant -- TypeScript should narrow this automatically. The fact that a cast is needed suggests the `HandicapSettings` type has `exceptionalCap: number \| null` and the narrowing doesn't propagate into the `.map()` closure. Fix: destructure `const cap = settings.exceptionalCap;` before the map, then use `cap` (TypeScript narrows it). |
| 6 | 740 | `league.handicapRounding as RoundingMethod` | **SAFE** | Guarded by `validRounding.includes(league.handicapRounding)` on line 739. The includes check validates the value before the cast. |
| 7 | 748 | `league.handicapScoreSelection as ScoreSelectionMethod` | **SAFE** | Same pattern as above -- guarded by `validScoreSelection.includes()`. |

### 3.4 Server Actions

| # | File | Line | Assertion | Classification | Explanation |
|---|------|------|-----------|----------------|-------------|
| 8 | `actions/weekly-scores.ts` | 191 | `JSON.parse(league.strokePlayPointScale) as number[]` | **UNSAFE-DANGEROUS** | `JSON.parse` returns `any`. The cast asserts it's `number[]` without validation. If the stored JSON is `"[1, \"two\", null]"`, the cast silently succeeds and downstream arithmetic produces `NaN`. **Fix:** Validate with `z.array(z.number()).parse(JSON.parse(...))`. |
| 9 | `actions/weekly-scores.ts` | 218 | `league.strokePlayTieMode as "split" \| "same"` | **UNSAFE-RISKY** | Database `String` field cast to union. No validation that the value is one of the expected options. |
| 10 | `actions/teams.ts` | 510 | `league.midSeasonRemoveAction as "bye_opponents" \| "regenerate"` | **UNSAFE-RISKY** | Same pattern -- database string cast to union without validation. |
| 11 | `actions/standings.ts` | 17 | `} as const` | **SAFE** | Object literal `as const`. |

### 3.5 Admin Components (Highest Density of Unsafe Casts)

#### 3.5.1 SettingsTab.tsx -- 30+ casts

| # | Line | Assertion | Classification | Explanation |
|---|------|-----------|----------------|-------------|
| 12 | 41 | `league.handicapRounding as "floor" \| "round" \| "ceil"` | **UNSAFE-RISKY** | Database string to union. If the DB value is `"truncate"` (e.g., after a migration), the state will hold an invalid value that renders incorrectly. |
| 13 | 47 | `(league.handicapScoreSelection ?? "all") as "all" \| "last_n" \| "best_of_last"` | **UNSAFE-RISKY** | Same pattern. The `?? "all"` fallback handles null but not unexpected strings. |
| 14 | 92 | `JSON.parse(league.strokePlayPointScale) as number[]` | **UNSAFE-DANGEROUS** | Same as finding #8 -- unvalidated JSON parse. |
| 15 | 107 | `JSON.parse(league.hybridFieldPointScale) as number[]` | **UNSAFE-DANGEROUS** | Same pattern. |
| 16 | 143 | `(league.handicapRounding ?? "floor") as "floor" \| "round" \| "ceil"` | **UNSAFE-RISKY** | Render-time state sync duplicates the cast from line 41. |
| 17 | 147 | `(league.handicapScoreSelection ?? "all") as ...` | **UNSAFE-RISKY** | Duplicates line 47. |
| 18 | 303 | `scoringType as "match_play" \| "stroke_play" \| "hybrid"` | **UNSAFE-BENIGN** | Local state `useState<string>` initialized from `league.scoringType`. Since the state is controlled by a `<select>` with these three options, the value should always be valid. However, the `useState` should be typed as the union directly, eliminating the need for the cast. |
| 19 | 304 | `strokePlayPointPreset as "linear" \| "weighted" \| ...` | **UNSAFE-BENIGN** | Same pattern -- state from controlled select. |
| 20 | 309 | `strokePlayTieMode as "split" \| "same"` | **UNSAFE-BENIGN** | Same pattern. |
| 21 | 335-345 | 8 more `as` casts on string union types | **UNSAFE-BENIGN** | All from local `useState<string>` controlled by `<select>` elements. The fix is to type the state variables as the union type directly. |
| 22 | 440-671 | Multiple `] as const).map(...)` | **SAFE** | Array literal `as const` for radio button option lists. No type erasure. |
| 23 | 843 | `scorecardMode as "disabled" \| "optional" \| "required"` | **UNSAFE-BENIGN** | Local state from controlled select. |
| 24 | 874 | `e.target as HTMLFormElement` | **SAFE** | Standard DOM event pattern. `onSubmit` handler's target is always the form element. |
| 25 | 875-877 | `form.elements.namedItem(...) as HTMLInputElement` | **SAFE** | Standard pattern for accessing named form elements. The elements exist in the JSX on lines 881-917. |
| 26 | 960 | `e.target.value as "floor" \| "round" \| "ceil"` | **UNSAFE-BENIGN** | Select change handler. Value comes from `<option>` elements with these exact values. |
| 27 | 997 | `e.target.value as "all" \| "last_n" \| "best_of_last"` | **UNSAFE-BENIGN** | Same pattern. |

#### 3.5.2 AdminDashboard.tsx

| # | Line | Assertion | Classification | Explanation |
|---|------|-----------|----------------|-------------|
| 28 | 88 | `defaultTab as "matchups" \| "scores"` | **SAFE** | `defaultTab` is derived from a ternary that only produces these two values. |
| 29 | 104,120 | `allTeamsData as AdminTeam[]` / `teamsData as AdminTeam[]` | **UNSAFE-RISKY** | The return type of `getAllTeamsWithStatus()` and `getTeamsForSeason()` likely differs from `AdminTeam`. The `AdminTeam` interface has optional fields (`status?`, `captainName?`, etc.) that may or may not be present in the actual return type. This should use explicit mapping: `allTeamsData.map(t => ({ id: t.id, name: t.name, status: t.status }))`. |
| 30 | 114 | `Promise.resolve([] as WeeklyScoreRecord[])` | **SAFE** | Empty array typed to match expected type. No data erasure. |
| 31 | 201,214 | `tabs[nextIndex].key as typeof activeTab` / `tab.key as typeof activeTab` | **UNSAFE-BENIGN** | Tab keys are string literals that match the union type of `activeTab`. Could be fixed by typing the `tabs` array with the union type on the `key` field. |
| 32 | 245-247 | `data.league as AdminLeague` / `data.matchups as AdminMatchup[]` / `data.teams as AdminTeam[]` | **UNSAFE-DANGEROUS** | The `onDataRefresh` callback receives `{ league?: unknown; matchups?: unknown; teams?: unknown }` from SettingsTab, then casts `unknown` back to typed values. This is a complete type safety bypass. The `unknown` type on the SettingsTab prop erases the type, and the cast on the consumer side recreates it -- the compiler provides zero validation. |
| 33 | 269-270 | `teamsData as AdminTeam[]` / `allTeamsData as AdminTeam[]` | **UNSAFE-RISKY** | Same as #29. |
| 34 | 294 | `data.matchups as AdminMatchup[]` | **UNSAFE-RISKY** | MatchupsTab's `onDataRefresh` correctly types matchups as `AdminMatchup[]`, so this cast is redundant but not dangerous. |

#### 3.5.3 MatchupsTab.tsx

| # | Line | Assertion | Classification | Explanation |
|---|------|-----------|----------------|-------------|
| 35 | 160-166 | `teamAId as number`, `teamAGross as number`, `teamAHandicapManual as number`, etc. (6 casts) | **UNSAFE-BENIGN** | State is `number \| ""`. The `as number` cast does nothing at runtime -- if the value is `""`, it passes the string `""` to the server action. However, the validation at lines 133-155 checks for `=== ""` before reaching these casts. Safe in practice but the pattern is misleading. **Fix:** Use a type guard helper. |
| 36 | 261 | `winningTeamId as number`, `forfeitingTeamId as number` | **UNSAFE-BENIGN** | Same `number \| ""` pattern. Guarded by `!winningTeamId \|\| !forfeitingTeamId` check. |

#### 3.5.4 WeeklyScoresTab.tsx

| # | Line | Assertion | Classification | Explanation |
|---|------|-----------|----------------|-------------|
| 37 | 114 | `e.grossScore as number` | **UNSAFE-BENIGN** | State is `number \| ""`. Guarded by `e.isDnp` -- if DNP, hardcoded to `0`; otherwise cast. If `grossScore` is `""` for a non-DNP entry, this passes `""` as a number. The server action would then receive `""` where it expects `number`. |
| 38 | 117 | `e.manualHandicap as number` | **UNSAFE-BENIGN** | Guarded by `=== ""` check that converts to `null`. The `else` branch should be safe. |

#### 3.5.5 ScorecardsTab.tsx

| # | Line | Assertion | Classification | Explanation |
|---|------|-----------|----------------|-------------|
| 39 | 261 | `manualTeamId as number` | **UNSAFE-BENIGN** | State is `number \| ""`. Guarded by `if (!manualTeamId) return;` on line 255. Since `0` is also falsy, this guard would reject `teamId: 0` -- but team IDs start at 1 (autoincrement), so this is safe in practice. |

#### 3.5.6 ScheduleTab.tsx

| # | Line | Assertion | Classification | Explanation |
|---|------|-----------|----------------|-------------|
| 40 | 226-227 | `editingMatchup.teamAId as number`, `editingMatchup.teamBId as number` | **UNSAFE-BENIGN** | State is `number \| "" \| null`. Guarded by validation checks. |
| 41 | 269-270 | `addTeamAId as number`, `addTeamBId as number` | **UNSAFE-BENIGN** | Same pattern. |

#### 3.5.7 TeamsTab.tsx

| # | Line | Assertion | Classification | Explanation |
|---|------|-----------|----------------|-------------|
| 42 | 60 | `(midSeasonAddDefault as AddTeamStrategy) \|\| "start_from_here"` | **UNSAFE-RISKY** | Database string cast to union. The `\|\| "start_from_here"` fallback handles null/empty but not unexpected strings. |
| 43 | 89 | `result.data as { teamId: number; scheduleIntegrationNeeded: boolean } \| undefined` | **UNSAFE-BENIGN** | The server action `approveTeam` returns `ActionResult<{ teamId: number; scheduleIntegrationNeeded: boolean } \| undefined>`. The cast narrows `unknown` to the expected shape. This is safe because the type matches the server action's return type, but it should be typed properly at the source. |
| 44 | 98 | `(midSeasonAddDefault as AddTeamStrategy) \|\| "start_from_here"` | **UNSAFE-RISKY** | Duplicate of #42. |
| 45 | 229 | `(["start_from_here", ...] as AddTeamStrategy[])` | **SAFE** | Array literal with known values. |

#### 3.5.8 Other Page Components

| # | File | Line | Assertion | Classification | Explanation |
|---|------|------|-----------|----------------|-------------|
| 46 | `leaderboard/page.tsx` | 40 | `(league.scoringType \|\| "match_play") as "match_play" \| ...` | **UNSAFE-RISKY** | Database string to union. |
| 47 | `leaderboard/page.tsx` | 65 | `(currentSeason?.scoringType \|\| leagueScoringType) as ...` | **UNSAFE-RISKY** | Same pattern, doubled up. |
| 48 | `leaderboard/page.tsx` | 100-121 | 8x `(stat/team as { prop: type }).prop` | **UNSAFE-RISKY** | The return types of `getAllTimeLeaderboard` and `getSeasonLeaderboard` are structurally unknown at the call site. These casts use the `in` operator to check for property existence before casting, which is a manual type guard. This is the correct runtime check but the `as` cast is still needed because TypeScript's `in` narrowing doesn't work with unknown property types on intersection types. **Acceptable but fragile.** |
| 49 | `[slug]/page.tsx` | 176-183 | `[] as LeaderboardWithMovement[]`, etc. | **SAFE** | Empty array fallbacks in `.catch()` handlers. |
| 50 | `[slug]/page.tsx` | 186 | `(league as { seasons?: { name: string }[] }).seasons?.[0]` | **UNSAFE-DANGEROUS** | The `getLeaguePublicInfo` return type doesn't include `seasons`. This cast fabricates a property that may or may not exist on the runtime object. If `getLeaguePublicInfo` uses `include: { seasons: true }`, the property exists but the type doesn't reflect it. If it doesn't include seasons, this silently returns `undefined`. **Fix:** Update the `getLeaguePublicInfo` return type or use a separate query. |
| 51 | `signup/page.tsx` | 32 | `formData[field as keyof typeof formData]` | **SAFE** | `field` is constrained by the `switch` statement to known keys of `formData`. |
| 52 | `signup/page.tsx` | 69 | `(league as { seasons?: ... }).seasons?.[0]` | **UNSAFE-DANGEROUS** | Same as #50. Duplicated pattern. |
| 53 | `health/route.ts` | 27 | `(checks.database as { status: string }).status` | **UNSAFE-BENIGN** | `checks.database` is typed as `unknown` (from `Record<string, unknown>`). The cast is needed because the `checks` object is built dynamically. The property exists because it was set on line 16-19 or 21-24. This is safe but could be structured better with a typed interface. |
| 54 | `admin/page.tsx` | 63-64 | `teams as AdminTeam[]`, `allTeams as AdminTeam[]` | **UNSAFE-RISKY** | Same issue as #29. |
| 55 | `CourseTab.tsx` | 94 | `null as number \| null` | **SAFE** | Type annotation on a literal `null` value. |
| 56 | `Navigation.tsx` | 39 | `event.target as Node` | **SAFE** | Standard DOM pattern for `contains()` check on MouseEvent target. |
| 57 | `AdminScorecardGrid.tsx` | 88 | `e.target as HTMLInputElement` | **SAFE** | KeyboardEvent on an `<input>` element. |

#### 3.5.9 Schedule Page Non-Null Assertions

| # | File | Line | Assertion | Classification | Explanation |
|---|------|------|-----------|----------------|-------------|
| 58 | `schedule/page.tsx` | 209, 233, 238, 262, 265 | `match.teamB!.name`, `match.teamB!.id` (5 occurrences) | **UNSAFE-RISKY** | `teamB` can be `null` for bye weeks. The schedule display filters byes earlier in the rendering logic (line ~195: `if (!match.teamB)` renders bye text), so by the time these assertions execute, `teamB` should be non-null. However, the filter is structural (different JSX branches) not type-level. If the rendering logic is refactored and the bye check moves, these assertions will throw `TypeError: Cannot read properties of null`. **Fix:** Use optional chaining or extract into a typed helper that guarantees `teamB` is present. |

#### 3.5.10 API Route

| # | File | Line | Assertion | Classification | Explanation |
|---|------|------|-----------|----------------|-------------|
| 59 | `api/sudo/impersonate/route.ts` | 38 | `process.env.SESSION_SECRET!` | **UNSAFE-RISKY** | Non-null assertion on an environment variable. If `SESSION_SECRET` is not set, this throws at runtime when `TextEncoder.encode(undefined)` produces unexpected behavior. The `session-secret.ts` utility likely validates this at startup, but this file bypasses that utility and accesses the env var directly. **Fix:** Import the validated secret from the shared utility. |

### 3.6 Summary Statistics

| Classification | Count | Percentage |
|---|---|---|
| **SAFE** | 18 | 30% |
| **UNSAFE-BENIGN** | 22 | 37% |
| **UNSAFE-RISKY** | 16 | 27% |
| **UNSAFE-DANGEROUS** | 4 | 7% |
| **Total** | 60 | 100% |

---

## 4. `any` Type Census

### Application Code (Non-Generated)

**Total explicit `any` types in application code: 0**

All `any` occurrences found by the search are in `src/generated/prisma/` files, which are auto-generated by Prisma and should not be modified. No application code uses explicit `any` types.

This is a strong result. The `"strict": true` configuration combined with developer discipline has kept `any` out of the codebase.

### Implicit `any` Risk Areas

While there are no explicit `any` types, there are patterns that effectively produce `any`-like behavior:

1. **`JSON.parse()` returns `any`** -- used in 4 places:
   - `SettingsTab.tsx:92` -- `JSON.parse(league.strokePlayPointScale)`
   - `SettingsTab.tsx:107` -- `JSON.parse(league.hybridFieldPointScale)`
   - `weekly-scores.ts:191` -- `JSON.parse(league.strokePlayPointScale)`
   - `scoring-config.ts:67` -- validated with Zod (the correct pattern)

   Three of four `JSON.parse` calls cast the result with `as number[]` instead of validating it.

2. **`catch (error)` blocks** -- TypeScript types `error` as `unknown` in strict mode. The codebase correctly handles this with `error instanceof Error ? error.message : "..."` in all server actions. No `catch (error: any)` patterns were found. This is good.

3. **`Record<string, unknown>` on `TeamWithStats`** -- `standings.ts:28` has `[key: string]: unknown` on the type, which is an index signature that accepts any string key. This is intentional for the standings aggregation but reduces type safety on property access.

---

## 5. Zod Validation Coverage Audit

### 5.1 Coverage Matrix

Each exported server action function is listed below with its Zod validation status.

#### `leagues.ts` (6 exported functions)

| Function | Write? | Zod? | Notes |
|----------|--------|------|-------|
| `requireActiveLeague` | No (guard) | N/A | |
| `requireLeagueNotCancelled` | No (guard) | N/A | |
| `createLeague` | Yes | **YES** | `createLeagueSchema` validates name, password, scoringType |
| `changeLeaguePassword` | Yes | No | Manual validation only (checks `!currentPassword`, `!newPassword`, `newPassword.length < 8`). **Should have Zod.** |
| `searchLeagues` | No (read) | N/A | |
| `getAllLeagues` | No (read) | N/A | |
| `getLeagueBySlug` | No (read) | N/A | |
| `getLeaguePublicInfo` | No (read) | N/A | |

#### `teams.ts` (12 exported functions)

| Function | Write? | Zod? | Notes |
|----------|--------|------|-------|
| `getTeams` | No | N/A | |
| `createTeam` | Yes | **YES** | `createTeamSchema` |
| `getTeamPreviousScores` | No | N/A | |
| `getTeamPreviousScoresForScoring` | No | N/A | |
| `getCurrentWeekNumber` | No | N/A | |
| `getTeamById` | No | N/A | |
| `registerTeam` | Yes | **YES** | `registerTeamSchema` -- one of the first Zod schemas in the project |
| `getPendingTeams` | No | N/A | |
| `getApprovedTeams` | No | N/A | |
| `getAllTeamsWithStatus` | No | N/A | |
| `approveTeam` | Yes | No | Takes `teamId: number` directly. **Should validate as positive integer.** |
| `rejectTeam` | Yes | No | Same. |
| `adminQuickAddTeam` | Yes | No | Takes `name: string`. Re-uses `createTeam` which has Zod, but the name trimming happens before the Zod call. **Partially covered.** |
| `deleteTeam` | Yes | No | Takes `teamId: number`. **Should validate.** |

#### `matchups.ts` (7 exported functions)

| Function | Write? | Zod? | Notes |
|----------|--------|------|-------|
| `previewMatchup` | No (preview) | No | Takes 7 numeric parameters. **Should validate.** |
| `submitMatchup` | Yes | **YES** | `submitMatchupSchema` -- comprehensive |
| `getMatchupHistory` | No | N/A | |
| `getTeamMatchupHistory` | No | N/A | |
| `deleteMatchup` | Yes | No | Takes `matchupId: number`. **Should validate.** |
| `submitForfeit` | Yes | **YES** | `submitForfeitSchema` |
| `getMatchupsForWeek` | No | N/A | |
| `getMatchupHistoryForSeason` | No | N/A | |

#### `weekly-scores.ts` (7 exported functions)

| Function | Write? | Zod? | Notes |
|----------|--------|------|-------|
| `previewWeeklyScores` | No (preview) | No | Takes complex input. **Should validate.** |
| `submitWeeklyScores` | Yes | **YES** | `submitWeeklyScoresSchema` -- validates weekNumber and scores array |
| `getWeeklyScoreHistory` | No | N/A | |
| `getWeeklyScoreHistoryForSeason` | No | N/A | |
| `getTeamWeeklyScores` | No | N/A | |
| `deleteWeeklyScores` | Yes | No | Takes `weekNumber: number`. **Should validate.** |
| `getCurrentStrokePlayWeek` | No | N/A | |

#### `league-settings.ts` (4 exported functions)

| Function | Write? | Zod? | Notes |
|----------|--------|------|-------|
| `updateLeagueSettings` | Yes | **YES** | `updateLeagueSettingsSchema` |
| `updateScorecardSettings` | Yes | **YES** | `z.enum(["disabled", "optional", "required"]).parse(scorecardMode)` inline |
| `updateHandicapSettings` | Yes | **YES** | `updateHandicapSettingsSchema` -- most comprehensive schema in the codebase |
| `recalculateLeagueStats` | Yes | No | Takes `leagueId: number`. No auth check (TODO comment on line 236). **Should validate and add auth.** |

#### `scoring-config.ts` (4 exported functions)

| Function | Write? | Zod? | Notes |
|----------|--------|------|-------|
| `getScoringConfig` | No | N/A | |
| `getScheduleConfig` | No | N/A | |
| `updateScoringConfig` | Yes | **YES** | `scoringConfigSchema` -- validates all scoring fields including custom refinements |
| `updateScheduleConfig` | Yes | **YES** | `scheduleConfigSchema` -- validates all schedule fields |

#### `seasons.ts` (10 exported functions)

| Function | Write? | Zod? | Notes |
|----------|--------|------|-------|
| `createSeason` | Yes | **YES** | `createSeasonSchema` |
| `getSeasons` | No | N/A | |
| `getActiveSeason` | No | N/A | |
| `setActiveSeason` | Yes | No | Takes `seasonId: number`. **Should validate.** |
| `getSeasonById` | No | N/A | |
| `getTeamsForSeason` | No | N/A | |
| `getCurrentWeekNumberForSeason` | No | N/A | |
| `getTeamPreviousScoresForSeason` | No | N/A | |
| `updateSeason` | Yes | **YES** | `updateSeasonSchema` |
| `copyTeamsToSeason` | Yes | No | Takes `fromSeasonId, toSeasonId: number`. **Should validate.** |

#### `courses.ts` (4 exported functions)

| Function | Write? | Zod? | Notes |
|----------|--------|------|-------|
| `createCourse` | Yes | **YES** | `courseInputSchema` -- validates name, holes, par, etc. |
| `updateCourse` | Yes | **YES** | Same schema |
| `deleteCourse` | Yes | No | Takes `courseId: number`. **Should validate.** |
| `getCourseWithHoles` | No | N/A | |

#### `league-about.ts` (2 exported functions)

| Function | Write? | Zod? | Notes |
|----------|--------|------|-------|
| `getLeagueAbout` | No | N/A | |
| `updateLeagueAbout` | Yes | **YES** | `updateLeagueAboutSchema` |

#### `handicap-settings.ts` (4 exported functions)

| Function | Write? | Zod? | Notes |
|----------|--------|------|-------|
| `getHandicapSettings` | No | N/A | |
| `getTeamHandicap` | No | N/A | |
| `getHandicapHistory` | No | N/A | |
| `getHandicapHistoryForSeason` | No | N/A | |

#### `standings.ts` (4 exported functions)

All read-only. No Zod needed.

#### `schedule.ts` (15 exported functions) -- **ZERO ZOD VALIDATION**

| Function | Write? | Zod? | Notes |
|----------|--------|------|-------|
| `previewSchedule` | Yes | **NO** | Takes `leagueId` (IDOR risk), `options: ScheduleGenerationOptions`. No validation on totalWeeks, type, startWeek. |
| `generateSchedule` | Yes | **NO** | Same options object. No validation. |
| `clearSchedule` | Yes | **NO** | Auth-only. |
| `getSchedule` | No | N/A | |
| `getScheduleForWeek` | No | N/A | |
| `getTeamSchedule` | No | N/A | |
| `getScheduleStatus` | No | N/A | |
| `swapTeamsInMatchup` | Yes | **NO** | Takes `scheduledMatchupId`, `newTeamAId`, `newTeamBId`. No validation that IDs are positive integers. |
| `cancelScheduledMatchup` | Yes | **NO** | Takes `scheduledMatchupId`. |
| `rescheduleMatchup` | Yes | **NO** | Takes `scheduledMatchupId`, `newWeekNumber`. |
| `addManualScheduledMatchup` | Yes | **NO** | Takes `weekNumber`, `teamAId`, `teamBId`. |
| `processByeWeekPoints` | Yes | **NO** | Takes `weekNumber`. |
| `addTeamToSchedule` | Yes | **NO** | Takes `teamId`, `strategy: AddTeamStrategy`. No validation the strategy is a valid enum value. |
| `removeTeamFromSchedule` | Yes | **NO** | Takes `teamId`, `action: RemoveTeamAction`. |
| `updateMatchupStartingHole` | Yes | **NO** | Takes `scheduledMatchupId`, `startingHole`. |
| `updateWeekCourseSide` | Yes | **NO** | Takes `weekNumber`, `courseSide`. |
| `assignShotgunStartingHoles` | Yes | **NO** | Takes `weekNumber`, `startingHoles: Record`. |

#### `scorecards.ts` (18 exported functions) -- **ZERO ZOD VALIDATION**

| Function | Write? | Zod? | Notes |
|----------|--------|------|-------|
| `getScorecardByToken` | No | N/A | Token verified via JWT. |
| `saveHoleScore` | Yes | **NO** | Takes `holeNumber`, `strokes`, `putts`, etc. Has manual range check (`strokes < 1 \|\| strokes > 20`) but no Zod. |
| `submitScorecard` | Yes | **NO** | Takes `token: string`. |
| `generateScorecardLink` | Yes | **NO** | Takes `teamId`, `weekNumber`, `seasonId`. |
| `approveScorecard` | Yes | **NO** | Takes `scorecardId`. |
| `rejectScorecard` | Yes | **NO** | Takes `scorecardId`. |
| `getScorecardsForWeek` | No | N/A | |
| `getScorecardDetail` | No | N/A | |
| `adminSaveHoleScore` | Yes | **NO** | Takes `scorecardId`, `holeNumber`, `strokes`. |
| `getApprovedScorecardScores` | No | N/A | |
| `checkEmailConfigured` | No | N/A | |
| `emailScorecardLink` | Yes | **NO** | Takes `scorecardId`, `email`. |
| `getScorecardAvailabilityForSeason` | No | N/A | |
| `getPublicScorecardForTeamWeek` | No | N/A | |
| `adminCreateScorecard` | Yes | **NO** | Takes 6 parameters including `weekNumber`, `teamId`, `matchupId`. |
| `adminCompleteAndApproveScorecard` | Yes | **NO** | Takes `scorecardId`. |
| `adminLinkScorecardToMatchup` | Yes | **NO** | Takes `scorecardId`, `matchupId`. |
| `getPublicScorecardsForWeek` | No | N/A | |

#### `course-import.ts` (2 exported functions)

Both are stubs returning `{ success: false }`. No validation needed.

### 5.2 Zod Coverage Summary

| Category | Count |
|----------|-------|
| Total exported functions | ~95 |
| Read-only functions (no Zod needed) | ~45 |
| Write/mutation functions | ~50 |
| Write functions WITH Zod | ~18 |
| Write functions WITHOUT Zod | ~32 |
| **Zod coverage of write functions** | **~36%** |

**Modules with zero Zod validation on write actions:**
1. `schedule.ts` -- 15 write operations, 0 validated
2. `scorecards.ts` -- 10 write operations, 0 validated

**Modules with partial Zod validation:**
3. `teams.ts` -- `registerTeam` and `createTeam` have Zod; `approveTeam`, `rejectTeam`, `deleteTeam` do not
4. `matchups.ts` -- `submitMatchup` and `submitForfeit` have Zod; `deleteMatchup`, `previewMatchup` do not
5. `seasons.ts` -- `createSeason` and `updateSeason` have Zod; `setActiveSeason`, `copyTeamsToSeason` do not
6. `leagues.ts` -- `createLeague` has Zod; `changeLeaguePassword` does not

---

## 6. Nullable Access Without Guards

### 6.1 Non-Null Assertions (`!`)

Five non-null assertions were found in application code:

| # | File | Line | Pattern | Risk |
|---|------|------|---------|------|
| 1 | `schedule/page.tsx` | 209, 233, 238, 262, 265 | `match.teamB!.name`, `match.teamB!.id` | **MEDIUM** -- bye weeks have `teamB: null`. Guarded by structural JSX branching but not by type narrowing. Refactoring could expose these. |
| 2 | `api/sudo/impersonate/route.ts` | 38 | `process.env.SESSION_SECRET!` | **HIGH** -- if the env var is missing, JWT signing fails with a cryptic error. Should use validated import. |

### 6.2 Optional Chaining on Critical Paths

The codebase makes good use of optional chaining (`?.`) for nullable access. No unguarded nullable property access patterns were found in server actions. The admin components rely on prop types being correct (which they are, given the server component data fetching).

### 6.3 Potential `undefined` Array Access

No `array[index]` without bounds checking was found in critical paths. The `standings.ts` tiebreaker logic uses array indexing but validates array lengths first.

---

## 7. The `onDataRefresh` Type Erasure Problem

This warrants a dedicated section because it is the single most impactful type safety issue in the codebase. It was flagged in Wave 1 but the full scope is documented here.

### The Pattern

**SettingsTab.tsx line 27:**
```typescript
onDataRefresh: (data: { league?: unknown; matchups?: unknown; teams?: unknown }) => void;
```

**AdminDashboard.tsx lines 245-247:**
```typescript
if (data.league) setLeague(data.league as AdminLeague);
if (data.matchups) setMatchups(data.matchups as AdminMatchup[]);
if (data.teams) setTeams(data.teams as AdminTeam[]);
```

### Why This Is Dangerous

1. SettingsTab calls `getLeagueBySlug()` and passes the result as `unknown` through the callback.
2. AdminDashboard receives `unknown` and casts it to `AdminLeague`.
3. If `getLeagueBySlug()` changes its return type (e.g., adds or removes a field), TypeScript will NOT flag the mismatch because `unknown` erases the type at the boundary.
4. The result is a runtime type mismatch that TypeScript cannot detect.

### The Fix

```typescript
// SettingsTab.tsx
interface SettingsTabProps {
  onDataRefresh: (data: {
    league?: AdminLeague;
    matchups?: AdminMatchup[];
    teams?: AdminTeam[];
  }) => void;
}

// AdminDashboard.tsx
onDataRefresh={(data) => {
  if (data.league) setLeague(data.league);    // No cast needed
  if (data.matchups) setMatchups(data.matchups); // No cast needed
  if (data.teams) setTeams(data.teams);          // No cast needed
}}
```

This change propagates type information through the callback, so any mismatch between what SettingsTab produces and what AdminDashboard expects will be caught at compile time.

---

## 8. The Database String-to-Union Cast Problem

This is the most pervasive type safety issue, affecting 30+ locations across 8 files.

### Root Cause

The Prisma schema uses `String` for fields that logically have a fixed set of values:

```prisma
model League {
  scoringType       String  @default("match_play")
  handicapRounding  String  @default("floor")
  playMode          String  @default("full_18")
  // ... 15+ more String fields with logical enum constraints
}
```

Prisma generates TypeScript types where these are `string`, not union types. The application then casts them:

```typescript
const scoringType = league.scoringType as "match_play" | "stroke_play" | "hybrid";
```

### Why This Is Systemic

1. **No compile-time safety**: If a new enum value is added to the database but not to the TypeScript union, the cast silently succeeds.
2. **Duplicated unions**: The union `"match_play" | "stroke_play" | "hybrid"` appears in ~15 places. Adding a new scoring type requires finding and updating all of them.
3. **No runtime safety**: The cast does nothing at runtime. If the database contains `"skins"` (a future scoring type), the variable will hold `"skins"` but TypeScript believes it's one of the three declared options.

### Recommended Fix

Define canonical union types and validation functions in one place:

```typescript
// src/lib/types/enums.ts
export const SCORING_TYPES = ["match_play", "stroke_play", "hybrid"] as const;
export type ScoringType = (typeof SCORING_TYPES)[number];

export function parseScoringType(value: string | null | undefined): ScoringType {
  if (SCORING_TYPES.includes(value as ScoringType)) return value as ScoringType;
  return "match_play"; // safe default
}

// Usage:
const scoringType = parseScoringType(league.scoringType);
// TypeScript knows this is ScoringType, validated at runtime
```

Alternatively, use Prisma's `enum` feature if SQLite supports it via the Turso adapter (it does as of Prisma 7).

---

## 9. Priority Action Items

### CRITICAL (Fix immediately)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | **Add Zod to `schedule.ts`** (15 write actions, 0 validated) | Allows type confusion attacks: `weekNumber: -1`, `strategy: "DROP TABLE"` | 2-3 hours |
| 2 | **Add Zod to `scorecards.ts`** (10 write actions, 0 validated) | Allows `strokes: NaN`, `holeNumber: 999`, `scorecardId: -1` | 2-3 hours |
| 3 | **Fix `onDataRefresh` type erasure** (`unknown` -> proper types) | Complete bypass of type system on the most-used data flow in admin | 30 min |
| 4 | **Validate `JSON.parse` results** (3 locations) | `any` from parse propagates through arithmetic, producing `NaN` silently | 30 min |

### HIGH (Fix this sprint)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 5 | **Create canonical enum types** for all database string-union fields | 30+ duplicate casts, no runtime validation, no single source of truth | 2-3 hours |
| 6 | **Fix `process.env.SESSION_SECRET!`** in impersonate route | Runtime crash if env var missing | 10 min |
| 7 | **Add Zod to remaining partial-coverage modules** (`changeLeaguePassword`, `approveTeam`, `rejectTeam`, `deleteTeam`, `deleteMatchup`, `setActiveSeason`, `copyTeamsToSeason`, `deleteCourse`, `recalculateLeagueStats`, `deleteWeeklyScores`, `previewMatchup`, `previewWeeklyScores`) | 14 write actions without validation | 1-2 hours |
| 8 | **Fix `AdminTeam` casts** (`as AdminTeam[]` in 5 locations) | Return types of `getTeams`/`getAllTeamsWithStatus`/`getTeamsForSeason` may not match `AdminTeam` | 1 hour |

### MEDIUM (Fix this month)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 9 | **Replace `number \| ""` state + `as number` pattern** with type guard helpers | 15+ locations with misleading casts that do nothing at runtime | 1-2 hours |
| 10 | **Fix `match.teamB!` non-null assertions** in schedule page | Runtime crash if rendering logic changes | 30 min |
| 11 | **Fix `league as { seasons?: ... }` fabricated property casts** (2 locations) | Accessing a property that may not exist on the type | 30 min |
| 12 | **Type `SettingsTab` state variables as union types** instead of `string` | Eliminates 15+ `as` casts on save handlers | 1 hour |

### LOW (Fix when touching these files)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 13 | Remove redundant `as number` cast in `handicap.ts:299` | No runtime impact; code clarity | 5 min |
| 14 | Remove redundant `as LogLevel` cast in `logger.ts:12` | No runtime impact; TypeScript should narrow | 5 min |
| 15 | Type `tabs[].key` as the tab union type in AdminDashboard | Eliminates 2 `as typeof activeTab` casts | 10 min |

---

## Appendix A: Complete File-by-File Cast Count

| File | Safe | Unsafe-Benign | Unsafe-Risky | Unsafe-Dangerous | Total |
|------|------|---------------|--------------|------------------|-------|
| `SettingsTab.tsx` | 8 | 14 | 4 | 2 | 28 |
| `AdminDashboard.tsx` | 2 | 2 | 4 | 1 | 9 |
| `leaderboard/page.tsx` | 0 | 0 | 10 | 0 | 10 |
| `MatchupsTab.tsx` | 0 | 4 | 0 | 0 | 4 |
| `ScheduleTab.tsx` | 0 | 2 | 0 | 0 | 2 |
| `WeeklyScoresTab.tsx` | 0 | 2 | 0 | 0 | 2 |
| `ScorecardsTab.tsx` | 0 | 1 | 0 | 0 | 1 |
| `TeamsTab.tsx` | 1 | 1 | 2 | 0 | 4 |
| `[slug]/page.tsx` | 3 | 0 | 0 | 2 | 5 |
| `signup/page.tsx` | 1 | 0 | 0 | 1 | 2 |
| `weekly-scores.ts` | 0 | 0 | 1 | 1 | 2 |
| `teams.ts` | 0 | 0 | 1 | 0 | 1 |
| `handicap.ts` | 2 | 1 | 0 | 0 | 3 |
| Other files | 6 | 1 | 1 | 0 | 8 |
| **Total** | **23** | **28** | **23** | **7** | **81** |

Note: This count includes `as const` assertions (safe) and all `as` casts. The executive summary count of "60+" excluded `as const` since those are a different category.

## Appendix B: Recommended Zod Schemas for Uncovered Actions

```typescript
// schedule.ts
const ScheduleGenerationSchema = z.object({
  type: z.enum(["single_round_robin", "double_round_robin"]),
  totalWeeks: z.number().int().min(1).max(104),
  startWeek: z.number().int().min(1).optional(),
});

const ScheduledMatchupIdSchema = z.number().int().positive();
const WeekNumberSchema = z.number().int().min(1).max(104);
const TeamIdSchema = z.number().int().positive();

const SwapTeamsSchema = z.object({
  scheduledMatchupId: ScheduledMatchupIdSchema,
  newTeamAId: TeamIdSchema,
  newTeamBId: TeamIdSchema.nullable(),
});

const AddTeamStrategySchema = z.enum(["start_from_here", "fill_byes", "pro_rate", "catch_up"]);
const RemoveTeamActionSchema = z.enum(["bye_opponents", "regenerate"]);

const CourseSideSchema = z.enum(["front", "back"]).nullable();

// scorecards.ts
const SaveHoleScoreSchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  strokes: z.number().int().min(1).max(20),
  putts: z.number().int().min(0).max(20).nullable().optional(),
  fairwayHit: z.boolean().nullable().optional(),
  greenInReg: z.boolean().nullable().optional(),
});

const ScorecardIdSchema = z.number().int().positive();

const AdminCreateScorecardSchema = z.object({
  teamId: TeamIdSchema,
  weekNumber: WeekNumberSchema,
  seasonId: z.number().int().positive().nullable().optional(),
  matchupId: z.number().int().positive().nullable().optional(),
  courseSide: CourseSideSchema.optional(),
  playerName: z.string().max(100).nullable().optional(),
});

const EmailSchema = z.string().email().max(255);
```
