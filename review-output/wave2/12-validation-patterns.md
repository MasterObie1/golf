# Input Validation & Data Sanitization Audit

**Auditor:** Senior Staff Engineer
**Date:** 2026-02-11
**Scope:** All server actions (`src/lib/actions/`), all API routes (`src/app/api/`), signup form, league creation form
**Severity Scale:** CRITICAL / HIGH / MEDIUM / LOW / INFO

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Input Validation Inventory](#2-input-validation-inventory)
3. [XSS Risk Assessment](#3-xss-risk-assessment)
4. [SQL Injection Assessment](#4-sql-injection-assessment)
5. [Integer Overflow/Underflow](#5-integer-overflowunderflow)
6. [String Length Limits](#6-string-length-limits)
7. [File Upload Assessment](#7-file-upload-assessment)
8. [Enum Validation](#8-enum-validation)
9. [Missing Validation Gap Matrix](#9-missing-validation-gap-matrix)
10. [Specific Findings](#10-specific-findings)
11. [Recommendations](#11-recommendations)

---

## 1. Executive Summary

The codebase demonstrates a solid validation foundation with Zod schemas used across most write actions. However, several gaps exist:

- **3 CRITICAL findings** related to bcrypt DoS vectors and unvalidated fields passing through to the database
- **5 HIGH findings** involving missing validation on numeric inputs, schema/data mismatches, and unvalidated enum-like string fields
- **8 MEDIUM findings** related to missing length limits, incomplete Zod schemas, and unconstrained numeric ranges
- **6 LOW findings** on defensive improvements and client-server validation parity

**Positive findings:**
- Zero `dangerouslySetInnerHTML` usage -- all rendering goes through React's auto-escaping JSX
- Zero raw SQL -- every query goes through Prisma's parameterized query builder
- Zero file upload endpoints
- Strong Zod schemas on the highest-risk endpoints (matchup submission, league creation, team registration)
- Rate limiting on all public-facing write endpoints
- CSRF origin checking on API login routes

---

## 2. Input Validation Inventory

### Server Actions (`src/lib/actions/`)

| Module | Action | Auth Required | Zod Schema | Manual Validation | Verdict |
|--------|--------|:---:|:---:|:---:|---------|
| **leagues.ts** | `createLeague` | No (public) | `createLeagueSchema` | Rate limit, slug uniqueness | GOOD |
| | `changeLeaguePassword` | Admin | None | Manual length check (>=8) | **GAP: no max length** |
| | `searchLeagues` | No | None | Manual trim/length check | ADEQUATE |
| | `getAllLeagues` | No | None | N/A (read-only, `take: 100`) | OK |
| | `getLeagueBySlug` | No | None | N/A (read-only) | OK |
| | `getLeaguePublicInfo` | No | None | N/A (read-only) | OK |
| **teams.ts** | `createTeam` | Admin | `createTeamSchema` | League ownership check | GOOD |
| | `registerTeam` | No (public) | `registerTeamSchema` | Rate limit, capacity, uniqueness | GOOD |
| | `adminQuickAddTeam` | Admin | None | Manual trim/length check | ADEQUATE |
| | `approveTeam` | Admin | None | League ownership check | OK (ID-only) |
| | `rejectTeam` | Admin | None | League ownership check | OK (ID-only) |
| | `deleteTeam` | Admin | None | League ownership, matchup check | OK (ID-only) |
| **matchups.ts** | `previewMatchup` | Admin | None | isFinite checks | **GAP: no input range checks** |
| | `submitMatchup` | Admin | `submitMatchupSchema` | Ownership, duplicate, recalc | GOOD |
| | `submitForfeit` | Admin | `submitForfeitSchema` | Ownership, duplicate check | GOOD |
| | `deleteMatchup` | Admin | None | Ownership check | OK (ID-only) |
| **weekly-scores.ts** | `previewWeeklyScores` | Admin | None | isFinite checks | **GAP: no input validation** |
| | `submitWeeklyScores` | Admin | `submitWeeklyScoresSchema` | Ownership, duplicate check | GOOD |
| | `deleteWeeklyScores` | Admin | None | N/A (week number only) | OK |
| **seasons.ts** | `createSeason` | Admin | `createSeasonSchema` | Uniqueness check | GOOD |
| | `setActiveSeason` | Admin | None | League ownership check | OK (ID-only) |
| | `updateSeason` | Admin | `updateSeasonSchema` (partial) | League ownership | **GAP: schema misses fields** |
| | `copyTeamsToSeason` | Admin | None | Ownership, uniqueness | ADEQUATE |
| **league-settings.ts** | `updateLeagueSettings` | Admin | `updateLeagueSettingsSchema` | N/A | GOOD |
| | `updateScorecardSettings` | Admin | `z.enum()` (inline) | N/A | GOOD |
| | `updateHandicapSettings` | Admin | `updateHandicapSettingsSchema` | Cross-field refinements | EXCELLENT |
| **league-about.ts** | `updateLeagueAbout` | Admin | `updateLeagueAboutSchema` | N/A | GOOD |
| **courses.ts** | `createCourse` | Admin | `courseInputSchema` | Hole count/uniqueness | GOOD |
| | `updateCourse` | Admin | `courseInputSchema` | Hole count/uniqueness | GOOD |
| | `deleteCourse` | Admin | None | Scorecard check | OK |
| **scoring-config.ts** | `updateScoringConfig` | Admin | `scoringConfigSchema` | Descending order refine | GOOD |
| | `updateScheduleConfig` | Admin | `scheduleConfigSchema` | N/A | GOOD |
| **schedule.ts** | `previewSchedule` | Admin | None | Team count check | **GAP: no options validation** |
| | `generateSchedule` | Admin | None | Team count check | **GAP: no options validation** |
| | `swapTeamsInMatchup` | Admin | None | Ownership, conflict check | ADEQUATE |
| | `cancelScheduledMatchup` | Admin | None | Ownership, status check | OK |
| | `rescheduleMatchup` | Admin | None | Ownership, conflict check | **GAP: no week range check** |
| | `addManualScheduledMatchup` | Admin | None | Ownership, conflict check | ADEQUATE |
| | `processByeWeekPoints` | Admin | None | N/A (uses config) | OK |
| | `addTeamToSchedule` | Admin | None | N/A | **GAP: strategy not validated** |
| | `removeTeamFromSchedule` | Admin | None | Manual enum check | OK |
| | `updateMatchupStartingHole` | Admin | None | Manual range check | GOOD |
| | `updateWeekCourseSide` | Admin | None | Manual enum check | OK |
| | `assignShotgunStartingHoles` | Admin | None | Manual range check | GOOD |
| **scorecards.ts** | `saveHoleScore` | Token | None | Manual range (1-20), rate limit | ADEQUATE |
| | `submitScorecard` | Token | None | Completeness check | OK |
| | `adminSaveHoleScore` | Admin | None | Manual range (1-20) | ADEQUATE |
| | `adminCreateScorecard` | Admin | None | Ownership checks | **GAP: no input validation on playerName** |
| | `adminCompleteAndApproveScorecard` | Admin | None | Completeness check | OK |
| | `adminLinkScorecardToMatchup` | Admin | None | Ownership checks | OK |
| | `emailScorecardLink` | Admin | None | Team email check | OK |
| **course-import.ts** | `searchCourses` | None | None | Stub (returns error) | N/A |
| | `importCourse` | None | None | Stub (returns error) | N/A |

### API Routes (`src/app/api/`)

| Route | Method | Auth | Validation | Verdict |
|-------|--------|------|-----------|---------|
| `/api/admin/login` | POST | None (login) | Manual null check, rate limit, CSRF | **GAP: no type/length validation on password** |
| `/api/admin/logout` | POST | None | N/A | OK |
| `/api/sudo/login` | POST | None (login) | Manual null check, rate limit, CSRF | **GAP: no type/length validation** |
| `/api/sudo/logout` | POST | None | N/A | OK |
| `/api/sudo/impersonate` | POST | SuperAdmin | Zod (`impersonateSchema`) | GOOD |
| `/api/sudo/leagues/[id]` | GET | SuperAdmin | `parseInt` + `isNaN` check | ADEQUATE |
| `/api/sudo/leagues/[id]` | DELETE | SuperAdmin | `parseInt` + `isNaN` check | ADEQUATE |
| `/api/sudo/leagues/[id]/status` | PATCH | SuperAdmin | Manual enum check | ADEQUATE |
| `/api/golf-news` | GET | None | N/A (read-only) | OK |
| `/api/health` | GET | None | N/A (read-only) | OK |

---

## 3. XSS Risk Assessment

### Verdict: LOW RISK

**No `dangerouslySetInnerHTML` usage found anywhere in the codebase.** All user-provided strings are rendered through React's JSX, which auto-escapes HTML entities.

**User-provided text that reaches the browser:**

| Data Field | Source | Rendered Where | Escaped? |
|-----------|--------|---------------|---------|
| `league.name` | `createLeague`, `updateLeagueAbout` | Leaderboard, signup, admin pages | Yes (React JSX) |
| `league.description` | `updateLeagueAbout` | League public page | Yes (React JSX) |
| `league.prizeInfo` | `updateLeagueAbout` | League public page | Yes (React JSX) |
| `team.name` | `registerTeam`, `createTeam`, `adminQuickAddTeam` | Leaderboard, matchup history | Yes (React JSX) |
| `team.captainName` | `registerTeam` | Admin team list only | Yes (React JSX) |
| `team.email` | `registerTeam` | Admin team list only | Yes (React JSX) |
| `team.phone` | `registerTeam` | Admin team list only | Yes (React JSX) |
| `season.name` | `createSeason`, `updateSeason` | Season selector dropdown | Yes (React JSX) |
| `course.name` | `createCourse` | Scorecard pages | Yes (React JSX) |
| `scorecard.playerName` | `adminCreateScorecard` | Scorecard detail views | Yes (React JSX) |

**Stored XSS vectors:** While React's auto-escaping prevents rendering, malicious content could still be stored in the database (e.g., a team name of `<script>alert(1)</script>`). If any future code path renders these without React (email templates, PDF generation, raw HTML), it would be vulnerable. The current email template in `sendScorecardEmail` should be checked if it uses HTML templates.

**Recommendation:** Even though React escapes output, add server-side sanitization to reject HTML-like content in user-facing text fields (team names, league names, descriptions) as defense-in-depth.

---

## 4. SQL Injection Assessment

### Verdict: NO RISK (in current code)

**Zero raw SQL queries found.** All database access goes through Prisma's query builder, which uses parameterized queries. The only `$queryRaw` / `$executeRaw` references are in Prisma's generated internal code, not application code.

Every `prisma.*.findMany`, `prisma.*.create`, `prisma.*.update`, etc. call uses structured objects, not string interpolation.

**One thing to watch:** The `searchLeagues` action uses `contains` for free-text search:
```typescript
// src/lib/actions/leagues.ts:176-179
prisma.league.findMany({
  where: { name: { contains: query.trim() } },
  ...
})
```
This is safe because Prisma parameterizes `contains` queries. However, it could return unintended results with special characters depending on the underlying SQLite collation.

---

## 5. Integer Overflow/Underflow

### Finding V-INT-01: Unbounded Week Numbers [MEDIUM]

**File:** `src/lib/actions/matchups.ts` (line 169)
**Schema:** `submitMatchupSchema` validates `weekNumber: z.number().int().min(1)` -- no maximum.

A malicious admin could submit `weekNumber: 2147483647` (JavaScript safe integer limit). While SQLite handles this gracefully, it could produce nonsensical data. Same issue in `submitForfeitSchema` and `submitWeeklyScoresSchema`.

**Affected actions:**
- `submitMatchup` -- `weekNumber` has no max (only `min(1)`)
- `submitForfeit` -- same
- `submitWeeklyScores` -- same
- `rescheduleMatchup` -- `newWeekNumber` has no validation at all
- `previewMatchup` -- `weekNumber` is completely unvalidated

**Recommendation:** Add `.max(200)` or similar realistic upper bound to all week number fields.

### Finding V-INT-02: Unbounded Points [MEDIUM]

**File:** `src/lib/actions/matchups.ts` (line 174)
```typescript
teamAPoints: z.number().min(0, "Points cannot be negative"),
```
No maximum on points values. An admin could submit `teamAPoints: 999999999`. While the match_play check validates that points sum to 20, stroke_play and hybrid modes have no such constraint.

**File:** `src/lib/actions/weekly-scores.ts` (line 69-77)
```typescript
grossScore: z.number().min(0),  // no max
handicap: z.number(),            // no min or max
netScore: z.number(),            // no min or max
points: z.number(),              // no min or max
bonusPoints: z.number(),         // no min or max
```

**Recommendation:** Add reasonable maximums: `grossScore.max(300)`, `points.max(100)`, etc.

### Finding V-INT-03: Handicap Values Unconstrained in Matchup Submission [LOW]

**File:** `src/lib/actions/matchups.ts` (line 172)
```typescript
teamAHandicap: z.number(),  // no bounds at all
```

While handicap settings have bounds (`-50` to `100` for the config), the submitted matchup handicap values have no bounds. An admin could submit `teamAHandicap: -99999`.

---

## 6. String Length Limits

### Finding V-STR-01: No Password Maximum Length -- bcrypt DoS [CRITICAL]

**File:** `src/lib/actions/leagues.ts` (line 58)
```typescript
const createLeagueSchema = z.object({
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
  // NO .max() constraint
});
```

**File:** `src/lib/actions/leagues.ts` (line 137)
```typescript
if (newPassword.length < 8) { ... }
// NO maximum length check
```

**File:** `src/app/api/admin/login/route.ts` (line 26)
```typescript
const { password, leagueSlug } = await request.json();
// No length validation on password before bcrypt.compare()
```

**File:** `src/app/api/sudo/login/route.ts` (line 27)
```typescript
const { username, password } = await request.json();
// No length validation on either field
```

bcrypt has an effective maximum input length of 72 bytes, but calling `bcrypt.hash()` or `bcrypt.compare()` with a very large string (e.g., 10MB) can cause CPU-intensive hashing that blocks the event loop for seconds per request. This is a well-known Denial of Service vector.

**Impact:** An attacker can POST a multi-megabyte password string to `/api/admin/login` or `/api/sudo/login` and tie up server resources. Rate limiting mitigates this somewhat (5 attempts per 15 min for admin, 3 for sudo) but each individual request can still cause significant latency.

**Recommendation:** Add `.max(128)` to all password fields in Zod schemas, and add length checks before `bcrypt.compare()` in API routes:
```typescript
if (typeof password !== 'string' || password.length > 128) {
  return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
}
```

### Finding V-STR-02: No Length Limits on Several Text Fields [MEDIUM]

Fields that accept user text without maximum length constraints:

| Action | Field | Current Limit | Risk |
|--------|-------|:---:|------|
| `adminQuickAddTeam` | `captainName` | None (manual trim only) | Could store arbitrarily long strings |
| `changeLeaguePassword` | `newPassword` | `min(8)` only | bcrypt DoS (see V-STR-01) |
| `adminCreateScorecard` | `playerName` | None | Could store arbitrarily long strings |
| `previewMatchup` | All numeric params | None | Not strings, but no type assertion |
| `/api/admin/login` | `password`, `leagueSlug` | None | String type not validated |
| `/api/sudo/login` | `username`, `password` | None | String type not validated |
| `/api/sudo/leagues/[id]/status` | `status` | None (enum check only) | String type not validated |

### Finding V-STR-03: Good Length Limits Present

These fields have proper length limits -- noted for completeness:

| Schema | Field | Limit |
|--------|-------|-------|
| `createLeagueSchema` | `name` | 3-100 chars |
| `registerTeamSchema` | `name` | 2-50 chars |
| `registerTeamSchema` | `captainName` | 2-100 chars |
| `registerTeamSchema` | `email` | max 255 chars |
| `registerTeamSchema` | `phone` | 10-20 chars |
| `courseInputSchema` | `name` | 1-200 chars |
| `updateLeagueAboutSchema` | `description` | max 2000 chars |
| `updateLeagueAboutSchema` | `prizeInfo` | max 1000 chars |
| `createSeasonSchema` | `name` | 2-100 chars |
| `createTeamSchema` | `name` | 2-50 chars |
| `adminQuickAddTeam` | `name` (manual) | 2-50 chars |

---

## 7. File Upload Assessment

### Verdict: NO FILE UPLOAD FUNCTIONALITY

No file upload endpoints, no multipart form handling, no `multer`/`formidable`/`busboy` imports, no `FormData` processing on the server side. The only `FormData`-like interactions are standard JSON `request.json()` calls.

The `course-import.ts` module is a stub that returns errors -- no actual external data processing.

---

## 8. Enum Validation

### Finding V-ENUM-01: Schedule Options Type Not Validated [HIGH]

**File:** `src/lib/actions/schedule.ts` (line 18-22)
```typescript
export interface ScheduleGenerationOptions {
  type: "single_round_robin" | "double_round_robin";
  totalWeeks: number;
  startWeek?: number;
}
```

The `previewSchedule` and `generateSchedule` functions accept these options without any Zod validation. The `type` field is only checked via TypeScript types, which are erased at runtime. A malicious caller could pass `type: "arbitrary_string"`.

The `totalWeeks` and `startWeek` values are also unvalidated -- negative, zero, or extremely large values would pass through.

**Recommendation:** Add a Zod schema:
```typescript
const scheduleOptionsSchema = z.object({
  type: z.enum(["single_round_robin", "double_round_robin"]),
  totalWeeks: z.number().int().min(1).max(200),
  startWeek: z.number().int().min(1).max(200).optional(),
});
```

### Finding V-ENUM-02: `addTeamToSchedule` Strategy Not Validated [HIGH]

**File:** `src/lib/actions/schedule.ts` (line 763-766)
```typescript
export async function addTeamToSchedule(
  leagueSlug: string,
  teamId: number,
  strategy: AddTeamStrategy  // TypeScript-only, erased at runtime
)
```

The `strategy` parameter (expected: `"start_from_here" | "fill_byes" | "pro_rate" | "catch_up"`) has no runtime validation. If an unexpected value is passed, the function falls through to the "start_from_here"/"pro_rate"/"catch_up" branch without matching, silently executing the regeneration path regardless of intent.

Contrast with `removeTeamFromSchedule` which has an explicit check:
```typescript
if (action !== "bye_opponents" && action !== "regenerate") {
  return { success: false, error: `Invalid action: ${action}...` };
}
```

### Finding V-ENUM-03: Partially Validated Enum Fields [MEDIUM]

These string fields in the Prisma schema function as enums but have varying levels of validation:

| Field | Valid Values | Validated On Write? | Location |
|-------|-------------|:---:|---------|
| `League.scoringType` | `match_play`, `stroke_play`, `hybrid` | Yes (Zod enum) | `createLeagueSchema`, `scoringConfigSchema` |
| `League.handicapRounding` | `floor`, `round`, `ceil` | Yes (Zod enum) | `updateHandicapSettingsSchema` |
| `League.scorecardMode` | `disabled`, `optional`, `required` | Yes (Zod enum) | `updateScorecardSettings` |
| `League.status` | `active`, `suspended`, `cancelled` | Yes (manual) | `/api/sudo/leagues/[id]/status` |
| `League.scheduleType` | `single_round_robin`, `double_round_robin`, `custom`, null | **Partial** | Set by `generateSchedule` (no validation on user input) |
| `Team.status` | `pending`, `approved`, `rejected` | **No** | Hardcoded in code paths (safe) |
| `Scorecard.status` | `in_progress`, `completed`, `approved`, `rejected` | **No** | Hardcoded in code paths (safe) |
| `ScheduledMatchup.status` | `scheduled`, `completed`, `cancelled` | **No** | Hardcoded in code paths (safe) |
| `Scorecard.teamSide` | `A`, `B`, null | **No** | Passed from client in `adminCreateScorecard` |
| `Scorecard.courseSide` | `front`, `back`, null | **Partial** | Validated in `updateWeekCourseSide` but not in scorecard creation |

### Finding V-ENUM-04: Login API Routes Accept Arbitrary JSON Types [MEDIUM]

**File:** `src/app/api/admin/login/route.ts` (line 26)
```typescript
const { password, leagueSlug } = await request.json();
```

No type validation on the destructured values. If the client sends `{ password: 123, leagueSlug: true }`, the code would pass these non-string values to `bcrypt.compare()` and `prisma.league.findUnique()`. While Prisma would likely coerce or reject the query, `bcrypt.compare()` with a non-string argument would throw an unhandled error.

Same issue in `/api/sudo/login/route.ts` with `username` and `password`.

**Recommendation:** Add explicit type checks:
```typescript
if (typeof password !== 'string' || typeof leagueSlug !== 'string') {
  return NextResponse.json({ error: "Invalid input" }, { status: 400 });
}
```

---

## 9. Missing Validation Gap Matrix

### Server Actions Needing Validation Added

| Priority | Action | Missing Validation | Recommended Fix |
|:---:|--------|-------------------|----------------|
| **P0** | `changeLeaguePassword` | No max length on `newPassword` (bcrypt DoS) | Add Zod schema: `z.string().min(8).max(128)` |
| **P0** | `/api/admin/login` | No type/length checks on `password` or `leagueSlug` | Add type checks + `max(128)` on password |
| **P0** | `/api/sudo/login` | No type/length checks on `username` or `password` | Add type checks + `max(128)` on password |
| **P1** | `previewMatchup` | No input validation on any parameter | Add Zod schema mirroring `submitMatchupSchema` (without net/points) |
| **P1** | `previewWeeklyScores` | No input validation on `inputs` array | Add Zod schema for `WeeklyScoreInput[]` |
| **P1** | `generateSchedule` / `previewSchedule` | No validation on `options` object | Add Zod schema for `ScheduleGenerationOptions` |
| **P1** | `addTeamToSchedule` | Strategy parameter not validated | Add `z.enum()` or manual check like `removeTeamFromSchedule` |
| **P2** | `updateSeason` | Zod schema only validates `name` and `isActive` -- ignores `year`, `startDate`, `endDate`, `numberOfWeeks` | Expand schema to cover all accepted fields |
| **P2** | `adminCreateScorecard` | No validation on `playerName`, `teamSide` | Add length limits and enum validation |
| **P2** | `submitMatchup` / `submitWeeklyScores` | Week numbers unbounded (`min(1)`, no max) | Add `.max(200)` |
| **P2** | `submitWeeklyScores` | `grossScore`, `handicap`, `netScore`, `points` have weak/no bounds | Add realistic max/min bounds |
| **P3** | `rescheduleMatchup` | `newWeekNumber` not validated | Add `z.number().int().min(1).max(200)` |
| **P3** | `adminQuickAddTeam` | `captainName` has no max length | Add `.max(100)` check |
| **P3** | `saveHoleScore` (player) | `putts` has no range check | Add `min(0).max(10)` if provided |

### Client-Server Validation Parity

| Form | Client Validation | Server Validation | Gap |
|------|------------------|------------------|-----|
| Signup (`signup/page.tsx`) | `minLength={2,50}` on team name, basic regex on email/phone | Full Zod schema with `registerTeamSchema` | None (server is stricter) |
| League Creation (`leagues/new/page.tsx`) | `minLength={3}` on name, `minLength={8}` on password, password match | `createLeagueSchema` with `.min(3).max(100)` + `.min(8)` | **Client missing: `maxLength` on league name input** |
| Login form | (not audited) | Manual null checks only | **Server missing Zod validation** |

---

## 10. Specific Findings

### Finding V-CRIT-01: `updateSeason` Schema/Data Mismatch [CRITICAL]

**File:** `src/lib/actions/seasons.ts` (lines 191-229)

The function signature accepts `year`, `startDate`, `endDate`, and `numberOfWeeks`:
```typescript
export async function updateSeason(
  leagueSlug: string,
  seasonId: number,
  data: {
    name?: string;
    year?: number;           // <-- NOT IN SCHEMA
    startDate?: Date | null; // <-- NOT IN SCHEMA
    endDate?: Date | null;   // <-- NOT IN SCHEMA
    numberOfWeeks?: number | null; // <-- NOT IN SCHEMA
  }
)
```

But the Zod schema only validates `name` and `isActive`:
```typescript
const updateSeasonSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  isActive: z.boolean().optional(),
});
```

The call to `prisma.season.update({ data: validated })` only persists the validated fields (`name`, `isActive`), so `year`, `startDate`, `endDate`, and `numberOfWeeks` are silently dropped. This is a data loss bug rather than a security issue, but it also means a caller who intends to set `isActive: false` through the data parameter can do so without the function's design explicitly supporting that -- the schema includes `isActive` but the function signature does not.

**Recommendation:** Either expand the Zod schema to include all fields:
```typescript
const updateSeasonSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  startDate: z.date().nullable().optional(),
  endDate: z.date().nullable().optional(),
  numberOfWeeks: z.number().int().min(1).max(52).nullable().optional(),
});
```
Or remove the unused fields from the function signature to avoid confusion.

### Finding V-CRIT-02: `previewMatchup` Accepts Unvalidated Input [CRITICAL]

**File:** `src/lib/actions/matchups.ts` (lines 36-166)

`previewMatchup` accepts 10 parameters directly from the client with zero validation:
```typescript
export async function previewMatchup(
  leagueSlug: string,
  weekNumber: number,       // unvalidated
  teamAId: number,          // unvalidated
  teamAGross: number,       // unvalidated
  teamAHandicapManual: number | null, // unvalidated
  teamAIsSub: boolean,      // unvalidated
  teamBId: number,          // unvalidated
  teamBGross: number,       // unvalidated
  teamBHandicapManual: number | null, // unvalidated
  teamBIsSub: boolean       // unvalidated
)
```

While `previewMatchup` doesn't write to the database (it's a preview), it does:
1. Execute multiple database reads with unvalidated IDs (e.g., `teamAId: -1` or `teamAId: 99999999`)
2. Perform calculations with unvalidated gross scores (e.g., `teamAGross: -500` or `Infinity`)
3. Return preview data that the admin UI uses to populate the matchup submission form

If a preview returns manipulated handicap/net/point values and the admin clicks "submit" using those values, the submit action validates them -- but the trust boundary starts at the preview.

**Recommendation:** Add a Zod schema for preview inputs that validates:
- `weekNumber >= 1`
- `teamAId > 0`, `teamBId > 0`, `teamAId !== teamBId`
- `teamAGross >= 0 && teamAGross <= 200`
- `teamAHandicapManual` in a reasonable range when not null

### Finding V-HIGH-01: Admin Login Route Missing Type Validation [HIGH]

**File:** `src/app/api/admin/login/route.ts` (line 26-34)

```typescript
const { password, leagueSlug } = await request.json();

if (!password || !leagueSlug) {
  return NextResponse.json({ error: "..." }, { status: 400 });
}
```

The check `!password` is falsy-check only. If `password` is `0`, `false`, or an empty string, it would be caught, but if `password` is an object like `{}` or an array, it would pass and be sent to `bcrypt.compare()`. The `bcryptjs` library internally calls `toString()` on its input, so `bcrypt.compare({}, hash)` would compare the string `"[object Object]"` against the hash, which is unlikely to match but is still unexpected behavior.

More critically, no maximum length check means a multi-megabyte password string reaches `bcrypt.compare()`.

### Finding V-HIGH-02: `previewWeeklyScores` Missing Input Validation [HIGH]

**File:** `src/lib/actions/weekly-scores.ts` (lines 83-263)

```typescript
export async function previewWeeklyScores(
  leagueSlug: string,
  leagueId: number,          // unvalidated - could be any league
  weekNumber: number,        // unvalidated
  inputs: WeeklyScoreInput[] // unvalidated array of objects
)
```

The `leagueId` parameter is particularly concerning: the function calls `requireLeagueAdmin(leagueSlug)` but then uses the raw `leagueId` parameter for database queries instead of `session.leagueId`. If a caller passes a different `leagueId` than the one associated with `leagueSlug`, they could preview data from another league.

**Lines 94, 113:**
```typescript
const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } }); // uses raw param
const existingScores = await prisma.weeklyScore.findMany({ where: { leagueId, weekNumber } }); // uses raw param
```

**Recommendation:** Use `session.leagueId` instead of the raw `leagueId` parameter, and add Zod validation for the inputs array.

### Finding V-HIGH-03: `courseInputSchema` Misses `location` and `teeColor` [MEDIUM]

**File:** `src/lib/actions/courses.ts` (lines 9-20, 97-98, 184-185)

The Zod schema validates `name`, `holeCount`, `courseRating`, `slopeRating`, and `holes`, but `location` and `teeColor` from the `CourseInput` interface bypass validation and are passed directly to Prisma:

```typescript
// These bypass the Zod schema:
location: data.location?.trim() || null,  // no length limit
teeColor: data.teeColor?.trim() || null,  // no length limit
```

**Recommendation:** Add `location` and `teeColor` to the Zod schema:
```typescript
location: z.string().max(200).nullable().optional(),
teeColor: z.string().max(50).nullable().optional(),
```

---

## 11. Recommendations

### Immediate (P0 -- Fix Before Next Deploy)

1. **Add password max length everywhere:** Add `.max(128)` to all password fields in Zod schemas and add `typeof password !== 'string' || password.length > 128` checks in API login routes to prevent bcrypt DoS.

2. **Fix `previewWeeklyScores` league ID bypass:** Replace the raw `leagueId` parameter with `session.leagueId` from the auth check.

3. **Add type checks to API login routes:** Validate that `password`, `leagueSlug`, `username` are strings before processing.

### Short-Term (P1 -- Fix Within 1 Week)

4. **Add Zod schemas for all preview actions:** `previewMatchup`, `previewWeeklyScores`, and `previewSchedule`/`generateSchedule` should validate inputs even though they don't write data.

5. **Add runtime validation for schedule strategy/options:** The `addTeamToSchedule` strategy and `ScheduleGenerationOptions` need Zod schemas or manual enum checks.

6. **Fix `updateSeason` schema to cover all fields:** Either expand the schema or remove unused parameters from the function signature.

### Medium-Term (P2 -- Fix Within 2 Weeks)

7. **Add upper bounds to all numeric fields:** Week numbers (`.max(200)`), gross scores (`.max(300)`), points (`.max(100)`), handicaps (`.min(-50).max(100)`).

8. **Add length limits to unconstrained string fields:** `adminCreateScorecard.playerName` (`.max(100)`), `adminQuickAddTeam.captainName` (`.max(100)`), course `location` (`.max(200)`), `teeColor` (`.max(50)`).

9. **Add `maxLength` to client-side form inputs:** The league creation form's name input has `minLength={3}` but no `maxLength` attribute.

### Long-Term (P3 -- Backlog)

10. **Server-side HTML sanitization on user-facing text:** While React escapes output, add a sanitization pass (strip HTML tags) on team names, league names, and description fields as defense-in-depth for future non-React rendering contexts (emails, PDFs, API consumers).

11. **Convert string-enum Prisma fields to true enums:** Fields like `League.status`, `League.scoringType`, `Team.status`, `Scorecard.status` should use Prisma `enum` types instead of `String` to get database-level enforcement. (Note: SQLite does not support `enum` natively, but migrating to PostgreSQL in the future would benefit from this.)

12. **Standardize validation pattern:** Create a validation middleware/wrapper that consistently applies Zod parsing to all server action inputs. The current codebase mixes Zod validation, manual checks, and no validation across different actions. A consistent pattern would look like:
```typescript
export const validated = <T>(schema: ZodSchema<T>, fn: (data: T) => Promise<ActionResult>) =>
  async (data: unknown) => {
    const result = schema.safeParse(data);
    if (!result.success) return { success: false, error: result.error.issues[0]?.message };
    return fn(result.data);
  };
```

---

## Appendix: Files Reviewed

### Server Actions
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/shared.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/leagues.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/teams.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/matchups.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/weekly-scores.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/seasons.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/league-settings.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/league-about.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/courses.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/course-import.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/handicap-settings.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/scoring-config.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/schedule.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/scorecards.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/standings.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/index.ts`

### API Routes
- `/Users/alexoberlander/Documents/Claude/golf/src/app/api/admin/login/route.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/app/api/admin/logout/route.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/app/api/sudo/login/route.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/app/api/sudo/logout/route.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/app/api/sudo/impersonate/route.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/app/api/sudo/leagues/[id]/route.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/app/api/sudo/leagues/[id]/status/route.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/app/api/golf-news/route.ts`
- `/Users/alexoberlander/Documents/Claude/golf/src/app/api/health/route.ts`

### Client Forms
- `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/signup/page.tsx`
- `/Users/alexoberlander/Documents/Claude/golf/src/app/leagues/new/page.tsx`

### Schema
- `/Users/alexoberlander/Documents/Claude/golf/prisma/schema.prisma`
