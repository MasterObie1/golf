# Cross-Cutting Error Handling Audit

**Reviewer:** Senior Staff Engineer (Claude Opus 4.6)
**Date:** 2026-02-11
**Scope:** All action modules (`src/lib/actions/*.ts`), utility modules (`db.ts`, `email.ts`, `auth.ts`, `logger.ts`, `scorecard-auth.ts`), error boundaries, API routes, client components
**Builds on:** Wave 1 findings from `04-schedule-scorecards-actions.md` and `05-matchups-standings-teams.md`

---

## 1. Executive Summary

The codebase has a **split personality** on error handling. Mutation server actions (write operations) are generally well-guarded with try/catch blocks that return `ActionResult` discriminated unions. Read-only server actions and data-fetching functions, however, universally lack try/catch, relying on Next.js error boundaries to catch failures. This design is intentional and defensible for server component data fetching -- but it creates a fragile dependency on error boundaries that only partially exist.

**Key findings:**

1. **33 functions across 6 modules have no try/catch** -- all are read-only data fetchers. This is an intentional pattern, not a gap, but requires complete error boundary coverage to work safely. Error boundary coverage is incomplete.
2. **7 scorecard mutation functions lack try/catch** (confirmed from Wave 1) -- these remain unfixed and are the highest-priority gap.
3. **4 course mutation functions lack try/catch** -- `createCourse`, `updateCourse`, `deleteCourse`, and `getCourseWithHoles` all let Prisma errors propagate unhandled.
4. **Error boundaries exist only at 2 levels** (`/` root and `/league/[slug]`). Sub-routes like `/league/[slug]/admin`, `/league/[slug]/scorecard/[token]`, and `/sudo/*` have no error boundaries.
5. **3 `.then()` calls lack `.catch()`** in client-side code, creating uncaught promise rejections.
6. **The logger is not used in 4 of 16 action modules** -- `scoring-config.ts`, `courses.ts`, `handicap-settings.ts`, and `standings.ts` have no logger import. Errors in these modules are invisible in production logs.
7. **Client components inconsistently surface server action errors** -- some swallow errors with `console.error`, some show them via `setError`, and some use `alert()`. There is no unified toast/notification system.

**Overall assessment:** The error handling architecture is **70% complete**. The `ActionResult` pattern is well-designed and consistently applied to mutations. The gaps are in: (a) scorecard/course mutations missing the pattern, (b) incomplete error boundary coverage, (c) missing logger usage, and (d) inconsistent client-side error surfacing.

---

## 2. Complete Error Handling Pattern Inventory

### 2.1 Pattern A: ActionResult with try/catch (Mutations)

The canonical pattern for write operations. Returns `{ success: true, data }` or `{ success: false, error: string }`. Catches Zod validation errors separately from general errors.

**Modules using this pattern consistently:**
- `leagues.ts` -- `createLeague`, `changeLeaguePassword`
- `teams.ts` -- `createTeam`, `registerTeam`, `approveTeam`, `rejectTeam`, `deleteTeam`, `adminQuickAddTeam`
- `matchups.ts` -- `previewMatchup`, `submitMatchup`, `deleteMatchup`, `submitForfeit`
- `weekly-scores.ts` -- `previewWeeklyScores`, `submitWeeklyScores`, `deleteWeeklyScores`
- `seasons.ts` -- `createSeason`, `setActiveSeason`, `updateSeason`, `copyTeamsToSeason`
- `league-settings.ts` -- `updateLeagueSettings`, `updateScorecardSettings`, `updateHandicapSettings`
- `league-about.ts` -- `updateLeagueAbout`
- `schedule.ts` -- All 13 mutation functions
- `scoring-config.ts` -- `updateScoringConfig`, `updateScheduleConfig`

**Modules partially using this pattern:**
- `scorecards.ts` -- Player-facing actions (`saveHoleScore`, `submitScorecard`) return `ActionResult` but 7 admin actions lack try/catch
- `courses.ts` -- Returns `ActionResult` but has **zero** try/catch blocks

### 2.2 Pattern B: Bare Prisma Calls (Read-Only Data Fetching)

Read-only functions that serve server components call Prisma directly without try/catch, relying on Next.js error boundaries for error display.

**By design, this pattern is used in:**
- `leagues.ts` -- `searchLeagues`, `getAllLeagues`, `getLeagueBySlug`, `getLeaguePublicInfo`
- `teams.ts` -- `getTeams`, `getTeamPreviousScores`, `getTeamPreviousScoresForScoring`, `getCurrentWeekNumber`, `getTeamById`, `getPendingTeams`, `getApprovedTeams`, `getAllTeamsWithStatus`
- `matchups.ts` -- `getMatchupHistory`, `getTeamMatchupHistory`, `getMatchupsForWeek`, `getMatchupHistoryForSeason`
- `standings.ts` -- `getLeaderboard`, `getLeaderboardWithMovement`, `getSeasonLeaderboard`, `getAllTimeLeaderboard`
- `schedule.ts` -- `getSchedule`, `getScheduleForWeek`, `getTeamSchedule`, `getScheduleStatus`
- `seasons.ts` -- `getSeasons`, `getActiveSeason`, `getSeasonById`, `getTeamsForSeason`, `getCurrentWeekNumberForSeason`, `getTeamPreviousScoresForSeason`
- `handicap-settings.ts` -- `getHandicapSettings`, `getTeamHandicap`, `getHandicapHistory`, `getHandicapHistoryForSeason`
- `weekly-scores.ts` -- `getWeeklyScoreHistory`, `getWeeklyScoreHistoryForSeason`, `getTeamWeeklyScores`, `getCurrentStrokePlayWeek`
- `scorecards.ts` -- `getScorecardsForWeek`, `getScorecardDetail`, `getApprovedScorecardScores`, `getScorecardAvailabilityForSeason`, `getPublicScorecardForTeamWeek`, `getPublicScorecardsForWeek`
- `scoring-config.ts` -- `getScoringConfig`, `getScheduleConfig`
- `league-about.ts` -- `getLeagueAbout`

### 2.3 Pattern C: API Route try/catch

API routes wrap all logic in try/catch and return `NextResponse.json` with appropriate HTTP status codes.

**All API routes follow this pattern:**
- `POST /api/admin/login` -- try/catch, returns 400/401/403/429/500
- `POST /api/admin/logout` -- No try/catch needed (just clears a cookie, cannot fail)
- `POST /api/sudo/login` -- try/catch, returns 400/401/429/500
- `POST /api/sudo/logout` -- Same as admin logout
- `GET /api/health` -- try/catch, returns 200/500
- `GET /api/golf-news` -- try/catch, returns 500
- `GET /api/sudo/leagues/[id]` -- try/catch, returns 403/404/500
- `PATCH /api/sudo/leagues/[id]` -- try/catch, returns 403/404/500
- `PATCH /api/sudo/leagues/[id]/status` -- try/catch, returns 400/403/404/500
- `POST /api/sudo/impersonate` -- try/catch, returns 400/403/404/500

### 2.4 Pattern D: Graceful Degradation in Server Components

The league page (`/league/[slug]/page.tsx`) uses `.catch(() => [])` to degrade gracefully when data fetching fails:

```typescript
const [leaderboard, schedule, matchupResult, weeklyScores] = await Promise.all([
  getLeaderboardWithMovement(league.id).catch(() => []),
  getSchedule(league.id).catch(() => []),
  hasMatchPlay
    ? getMatchupHistory(league.id).then(r => r.matchups).catch(() => [])
    : Promise.resolve([]),
  hasStrokePlay
    ? getWeeklyScoreHistory(league.id).catch(() => [])
    : Promise.resolve([]),
]);
```

This is a **good pattern** -- partial failures don't break the entire page.

---

## 3. Functions Missing try/catch (Complete Inventory)

### 3.1 Mutation Functions Missing try/catch (MUST FIX)

These are server actions that modify data but let exceptions propagate. In Next.js production, errors are sanitized -- users get "An error occurred" with no actionable feedback.

| # | File | Function | Line | Impact |
|---|------|----------|------|--------|
| 1 | `scorecards.ts` | `generateScorecardLink` | 304 | Admin gets opaque error when generating scorecard links |
| 2 | `scorecards.ts` | `approveScorecard` | 395 | Admin gets opaque error on approval |
| 3 | `scorecards.ts` | `rejectScorecard` | 430 | Admin gets opaque error on rejection |
| 4 | `scorecards.ts` | `emailScorecardLink` | 655 | Admin gets opaque error on email send |
| 5 | `scorecards.ts` | `adminCreateScorecard` | 788 | Outer function unprotected; inner create has P2002 catch |
| 6 | `scorecards.ts` | `adminCompleteAndApproveScorecard` | 879 | Admin gets opaque error |
| 7 | `scorecards.ts` | `adminLinkScorecardToMatchup` | 936 | Admin gets opaque error |
| 8 | `courses.ts` | `createCourse` | 60 | Zod parse throws, Prisma errors propagate |
| 9 | `courses.ts` | `updateCourse` | 142 | Zod parse throws, Prisma errors propagate |
| 10 | `courses.ts` | `deleteCourse` | 228 | Prisma errors propagate |
| 11 | `courses.ts` | `getCourseWithHoles` | 250 | Admin-only read, auth error propagates |

### 3.2 Read-Only Functions Without try/catch (BY DESIGN)

These 33 functions intentionally lack try/catch. They are called from server components and rely on error boundaries. This is acceptable **if and only if** error boundaries exist at all relevant route segments.

| Module | Functions | Count |
|--------|-----------|-------|
| `leagues.ts` | `searchLeagues`, `getAllLeagues`, `getLeagueBySlug`, `getLeaguePublicInfo` | 4 |
| `teams.ts` | `getTeams`, `getTeamPreviousScores`, `getTeamPreviousScoresForScoring`, `getCurrentWeekNumber`, `getTeamById`, `getPendingTeams`, `getApprovedTeams`, `getAllTeamsWithStatus` | 8 |
| `matchups.ts` | `getMatchupHistory`, `getTeamMatchupHistory`, `getMatchupsForWeek`, `getMatchupHistoryForSeason` | 4 |
| `standings.ts` | `getLeaderboard`, `getLeaderboardWithMovement`, `getSeasonLeaderboard`, `getAllTimeLeaderboard` | 4 |
| `schedule.ts` | `getSchedule`, `getScheduleForWeek`, `getTeamSchedule`, `getScheduleStatus` | 4 |
| `seasons.ts` | `getSeasons`, `getActiveSeason`, `getSeasonById`, `getTeamsForSeason`, `getCurrentWeekNumberForSeason`, `getTeamPreviousScoresForSeason` | 6 |
| `handicap-settings.ts` | `getHandicapSettings`, `getTeamHandicap`, `getHandicapHistory`, `getHandicapHistoryForSeason` | 4 |
| `weekly-scores.ts` | `getWeeklyScoreHistory`, `getWeeklyScoreHistoryForSeason`, `getTeamWeeklyScores`, `getCurrentStrokePlayWeek` | 4 |
| `scoring-config.ts` | `getScoringConfig`, `getScheduleConfig` | 2 |
| `league-about.ts` | `getLeagueAbout` | 1 |
| `scorecards.ts` | 6 public/admin read functions | 6 |
| **Total** | | **47** |

### 3.3 Special Cases

**`requireActiveLeague` and `requireLeagueNotCancelled`** (leagues.ts:21-53): These throw errors intentionally. They are called inside try/catch blocks of mutation functions, so the throw is caught by the caller. However, if a read-only function calls them (none currently do), the throw would propagate to the error boundary.

**`recalculateLeagueStats`** (league-settings.ts:237): No try/catch. This is called from within `updateHandicapSettings` which does have try/catch. But the TODO comment says "Add auth check if exposed as a server action" -- if someone exports this directly, errors would be unhandled.

**`getScoringConfig`** (scoring-config.ts:45): Admin-only read function. Calls `requireLeagueAdmin` which throws on auth failure. No try/catch means the auth error becomes an unhandled exception. Since this is called from a client component (admin dashboard), the error bubbles to the nearest error boundary. **This is acceptable** because there's an error boundary at `/league/[slug]/error.tsx`.

---

## 4. Error Boundaries Analysis

### 4.1 Existing Error Boundaries

| Level | File | Coverage | Quality |
|-------|------|----------|---------|
| Root (`/`) | `src/app/error.tsx` | All routes | Good: Shows error digest, "Try Again" button, "Back to Clubhouse" link. Uses design system. |
| League (`/league/[slug]`) | `src/app/league/[slug]/error.tsx` | All league sub-routes | Good: Shows error digest, "Try Again" button, "Back to Leagues" link. |

### 4.2 Missing Error Boundaries

| Route Segment | Why It Matters |
|---------------|----------------|
| `/league/[slug]/admin` | Admin operations are the most error-prone part of the app. A database error in one admin tab crashes the entire admin page with a generic league-level error. A dedicated admin error boundary could offer "Retry" and "Switch Tab" options. |
| `/league/[slug]/scorecard/[token]` | Player-facing scorecard entry. If the token verification fails at the component level (not the action level), the player sees the generic league error boundary. Should have a dedicated error page with "Request New Link" guidance. |
| `/sudo` | Super-admin area has no error boundary at all -- falls through to root. Should have its own error boundary with "Back to Dashboard" navigation. |
| `/league/[slug]/admin/login` | Login page errors fall to the league error boundary. If the error boundary itself fails to render (e.g., due to a CSS import issue), the user is stuck. |

### 4.3 Loading States

| Level | File | Coverage |
|-------|------|----------|
| Root (`/`) | `src/app/loading.tsx` | All routes -- BallRollLoader |
| League (`/league/[slug]`) | `src/app/league/[slug]/loading.tsx` | League sub-routes -- BallRollLoader with "Loading league..." |

**Missing:** No loading state for admin dashboard, which fetches multiple datasets on mount. The admin page uses client-side loading (useState/useEffect), so this is handled manually. However, sub-routes like `/league/[slug]/leaderboard/page.tsx` and `/league/[slug]/history/page.tsx` that are server components would benefit from route-level loading states.

### 4.4 Not-Found Pages

| Level | File |
|-------|------|
| Root (`/`) | `src/app/not-found.tsx` -- Good: "Lost Ball" theme, links to home and leagues |

**Missing:** No `not-found.tsx` for `/league/[slug]`. If `getLeaguePublicInfo(slug)` returns null, the page should call `notFound()` to render a 404 page. Currently, the league page handles this inline with conditional rendering, but a dedicated not-found page would provide a better user experience for mistyped URLs.

---

## 5. Error Message Quality Assessment

### 5.1 Server-Side Error Messages (ActionResult.error)

**Good examples (specific, actionable):**
- `"No course configured. Set up a course first in the Course tab."` -- tells the user exactly what to do
- `"Cannot delete a course that has scorecards. Deactivate it instead."` -- explains the constraint and offers an alternative
- `"Team(s) already played in Week 5: Eagles, Falcons"` -- specific context
- `"Please enter scores for all 9 holes. You have 7 entered."` -- quantified gap
- `"Strokes must be between 1 and 20."` -- clear constraint
- `"This league has been cancelled and is no longer active."` -- explains the state

**Bad examples (generic, unhelpful):**
- `"Failed to update scoring configuration."` -- no indication of what went wrong
- `"Failed to update schedule configuration."` -- same pattern
- `"Failed to approve team. Please try again."` -- "try again" is meaningless if the cause is a business logic constraint
- `"Failed to delete team. Please try again."` -- swallows the actual error message
- `"Failed to delete matchup. Please try again."` -- same pattern
- `"Failed to create league. Please try again."` -- same pattern

**Pattern diagnosis:** The generic messages come from catch blocks that discard the error message:

```typescript
// BAD: Loses the specific error
return { success: false, error: "Failed to approve team. Please try again." };

// GOOD: Preserves the error
return { success: false, error: error instanceof Error ? error.message : "Failed to approve team." };
```

Some modules use the good pattern (leagues.ts `changeLeaguePassword`, seasons.ts, league-about.ts, league-settings.ts `updateHandicapSettings`), while others use the bad pattern (teams.ts `approveTeam`, `rejectTeam`, `deleteTeam`, `adminQuickAddTeam`; matchups.ts `deleteMatchup`).

### 5.2 Client-Side Error Display

**Inconsistent patterns across admin components:**

| Component | Error Display Method |
|-----------|---------------------|
| `MatchupsTab` | `alert(result.error)` -- native browser alert |
| `WeeklyScoresTab` | `setMessage({ type: "error", text: ... })` -- inline banner |
| `TeamsTab` | `setMessage(...)` -- inline banner |
| `ScheduleTab` | `setError(...)` / `alert(...)` -- mixed |
| `ScorecardsTab` | `setLinkError(...)` / `setLinkSuccess(...)` -- per-feature state |
| `SettingsTab` | `alert(...)` -- native browser alert |
| `CourseTab` | `setMessage(...)` -- inline banner |
| `AboutTab` | `setMessage(...)` -- inline banner |
| `SeasonsTab` | `setMessage(...)` -- inline banner |

**Recommendation:** Adopt a unified notification/toast system across all admin components. The `setMessage({ type, text })` pattern is the best of the existing options -- it provides visual feedback without blocking interaction.

---

## 6. Logging Patterns Assessment

### 6.1 Logger Infrastructure

The logger (`src/lib/logger.ts`) is well-designed:
- Structured JSON in production (Vercel-friendly)
- Pretty format in development
- Configurable log levels via `LOG_LEVEL` env var
- Includes error stack traces

### 6.2 Logger Usage by Module

| Module | Uses Logger | Logger Calls |
|--------|-------------|--------------|
| `leagues.ts` | Yes | `createLeague`, `changeLeaguePassword` |
| `teams.ts` | Yes | `createTeam`, `registerTeam`, `approveTeam`, `rejectTeam`, `deleteTeam`, `adminQuickAddTeam` |
| `matchups.ts` | Yes | `previewMatchup`, `submitMatchup`, `deleteMatchup`, `submitForfeit` |
| `weekly-scores.ts` | Yes | `previewWeeklyScores`, `submitWeeklyScores`, `deleteWeeklyScores` |
| `seasons.ts` | Yes | `createSeason`, `setActiveSeason`, `updateSeason`, `copyTeamsToSeason` |
| `league-settings.ts` | Yes | `updateLeagueSettings`, `updateScorecardSettings`, `updateHandicapSettings` |
| `league-about.ts` | Yes | `updateLeagueAbout` |
| `schedule.ts` | Yes | All mutation functions |
| `scorecards.ts` | Yes (imported) | Only `saveHoleScore` and `submitScorecard` actually use it (via inner logic). The 7 functions missing try/catch also miss logger calls. |
| **`scoring-config.ts`** | **NO** | Zero logger calls. Errors in `updateScoringConfig`/`updateScheduleConfig` are caught but not logged. |
| **`courses.ts`** | **NO** | Zero logger import. Errors propagate unlogged. |
| **`handicap-settings.ts`** | **NO** | Zero logger import. `getHandicapSettings`, `getTeamHandicap`, `getHandicapHistory` errors are invisible. |
| **`standings.ts`** | **NO** | Zero logger import. Standings computation failures are invisible in logs. |

### 6.3 Logging Gaps

**Critical:** When `recalculateLeagueStats` throws (e.g., `Invalid handicap calculation for matchup 42`), the error is caught by `updateHandicapSettings` which does log it. But if `recalculateLeagueStats` is ever called directly (e.g., from a future admin tool), the error would be unlogged.

**Concerning:** `scoring-config.ts` catches errors in `updateScoringConfig` and `updateScheduleConfig` but does not log them. If a user reports "I can't save my scoring settings," there's no server-side evidence.

**API routes** use `console.error` instead of the structured logger:
- `api/admin/login/route.ts:91` -- `console.error("Login error:", ...)`
- `api/sudo/login/route.ts:68` -- `console.error("Super-admin login error:", ...)`
- `api/sudo/impersonate/route.ts:72` -- `console.error("Impersonate error:", ...)`
- `api/golf-news/route.ts:12` -- `console.error("Golf news API error:", ...)`

These should use the structured logger for consistency and to get JSON formatting in production.

### 6.4 Over-Logging Risk

The current logging is appropriately scoped. Only errors are logged (no verbose request/response logging). Each log entry includes the function name and the error object. The risk of logging sensitive data is low -- passwords are never included in error messages (bcrypt errors don't leak hashes).

**One caution:** The logger serializes the full error object including `error.stack`. In production, stack traces can reveal internal file paths. This is acceptable for Vercel's internal logging but should not be exposed to users (and it isn't -- the `ActionResult.error` field only includes `error.message`, not the stack).

---

## 7. Uncaught Promise Analysis

### 7.1 `.then()` Without `.catch()`

| File | Line | Code | Risk |
|------|------|------|------|
| `leagues/page.tsx` | 26 | `getAllLeagues().then((leagues) => { ... })` | If `getAllLeagues()` rejects (e.g., database down), the promise rejection is unhandled. The `loading` state remains `true` forever -- user sees an infinite spinner. |
| `ScorecardsTab.tsx` | 88 | `checkEmailConfigured().then(setEmailEnabled)` | If `checkEmailConfigured()` rejects, unhandled promise rejection. Non-critical: the email button just stays in its default state. |
| `team/[teamId]/page.tsx` | 60 | `getTeamMatchupHistory(league.id, teamIdNum).then(r => r.matchups)` | This is inside a `Promise.all` in a server component -- if it rejects, the entire `Promise.all` rejects, which propagates to the error boundary. **This is actually handled** by the error boundary. |

### 7.2 Unhandled Async Errors in useEffect

Several client components use `async` functions inside `useEffect` without proper error handling:

| File | Line | Pattern | Risk |
|------|------|---------|------|
| `leagues/page.tsx` | 26 | `.then()` without `.catch()` in useEffect | Infinite loading spinner on error |
| `ScorecardsTab.tsx` | 88 | `.then()` without `.catch()` in useEffect | Silent failure, default state |
| `ScorecardsTab.tsx` | 93-99 | `async () => { try { ... } catch { ... } }` | **Good** -- properly caught |
| `ScheduleTab.tsx` | 85-90 | `try { ... } catch { ... }` | **Good** -- properly caught |

### 7.3 Fire-and-Forget Patterns

```typescript
// AdminDashboard.tsx:131-137
async function handleLogout() {
  try {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push(`/league/${slug}`);
    router.refresh();
  } catch (error) {
    console.error("Logout failed:", error);
  }
}
```

This is acceptable -- logout failures are non-critical and the user is still redirected.

---

## 8. Graceful Degradation Patterns

### 8.1 Good Patterns

**League public page (`/league/[slug]/page.tsx`):** Uses `.catch(() => [])` for all non-critical data fetches. If the leaderboard fails to load, the rest of the page still renders.

**Email module (`src/lib/email.ts`):** Returns `{ success: false, error: "Email is not configured..." }` when `RESEND_API_KEY` is missing, rather than throwing. This allows the scorecard flow to work without email.

**Database initialization (`src/lib/db.ts`):** Throws a descriptive error on connection failure that includes the original error message. The error is caught by the caller (whichever server action first uses `prisma`).

**Scorecard token verification:** Returns `null` instead of throwing when tokens are invalid/expired. Callers handle `null` gracefully with user-friendly error messages.

**Course import stub (`course-import.ts`):** Returns `{ success: false, error: "Course search is not yet available..." }` -- a proper placeholder that doesn't crash.

### 8.2 Missing Degradation

**Admin dashboard data loading:** If any of the parallel data fetches in `refreshData()` fails, the entire refresh fails and the user gets `console.error("Failed to refresh data:", error)` with no visible feedback. The admin dashboard remains in its previous state, which could be stale.

**`getScheduleConfig` / `getScoringConfig`:** These use `findUniqueOrThrow`. If the league doesn't exist (shouldn't happen, but defensive coding), the "OrThrow" variant throws an error that will crash the component tree up to the nearest error boundary. Using `findUnique` with a null check would be more graceful.

**Standings module:** All four public functions (`getLeaderboard`, etc.) have no error handling. If the database query fails, the entire leaderboard page crashes. The league-level error boundary catches this, but a more graceful approach would show a "Standings unavailable" message while keeping the rest of the page functional.

---

## 9. Findings Table (Prioritized)

### 9.1 CRITICAL (Must fix before next release)

| # | File | Function/Location | Issue | Recommendation |
|---|------|-------------------|-------|----------------|
| 1 | `scorecards.ts:304` | `generateScorecardLink` | No try/catch on mutation. Two separate DB writes are non-atomic. | Wrap in try/catch, use interactive transaction. |
| 2 | `scorecards.ts:395` | `approveScorecard` | No try/catch on mutation. | Add try/catch returning ActionResult. |
| 3 | `scorecards.ts:430` | `rejectScorecard` | No try/catch on mutation. | Add try/catch returning ActionResult. |
| 4 | `scorecards.ts:879` | `adminCompleteAndApproveScorecard` | No try/catch on mutation. | Add try/catch returning ActionResult. |
| 5 | `scorecards.ts:936` | `adminLinkScorecardToMatchup` | No try/catch on mutation. | Add try/catch returning ActionResult. |

### 9.2 HIGH (Fix soon)

| # | File | Function/Location | Issue | Recommendation |
|---|------|-------------------|-------|----------------|
| 6 | `courses.ts:60` | `createCourse` | No try/catch. Zod `.parse()` throws on validation failure. Prisma transaction errors propagate. | Add try/catch with Zod error handling. |
| 7 | `courses.ts:142` | `updateCourse` | Same as above. | Add try/catch with Zod error handling. |
| 8 | `courses.ts:228` | `deleteCourse` | No try/catch. Prisma delete error propagates. | Add try/catch. |
| 9 | `scorecards.ts:655` | `emailScorecardLink` | No try/catch. If `sendScorecardEmail` throws (not returns error), it propagates. | Add try/catch. |
| 10 | `scorecards.ts:788` | `adminCreateScorecard` | Outer function lacks try/catch. Inner create has P2002 catch, but `findFirst`, `findUnique`, `update` calls above are unprotected. | Wrap entire function in try/catch. |
| 11 | `scoring-config.ts:147,203` | `updateScoringConfig`, `updateScheduleConfig` | Catch blocks don't log errors. | Add `logger.error()` calls. |
| 12 | `leagues/page.tsx:26` | `getAllLeagues().then(...)` | No `.catch()` -- infinite spinner on database error. | Add `.catch(() => { setLoading(false); setError("...") })`. |

### 9.3 MEDIUM (Fix in next sprint)

| # | File | Function/Location | Issue | Recommendation |
|---|------|-------------------|-------|----------------|
| 13 | Multiple admin components | Error display inconsistency | Mix of `alert()`, `setMessage()`, `setError()`, `console.error()`. | Adopt unified toast/notification system. |
| 14 | `courses.ts`, `handicap-settings.ts`, `standings.ts`, `scoring-config.ts` | Missing logger import | Errors in these modules are invisible in production logs. | Add `import { logger } from "../logger"` and log errors. |
| 15 | 6 API routes | Using `console.error` instead of `logger` | Production logs lack structured format. | Replace with `logger.error()`. |
| 16 | Multiple modules | Generic error messages: "Failed to X. Please try again." | Error details are discarded in catch blocks. Users can't understand or report the issue. | Use `error instanceof Error ? error.message : "fallback"` pattern consistently. |
| 17 | Route segments | Missing error boundaries at `/league/[slug]/admin`, `/sudo` | Admin and super-admin areas fall through to parent error boundaries. | Add dedicated error boundaries. |
| 18 | `ScorecardsTab.tsx:88` | `checkEmailConfigured().then(setEmailEnabled)` | No `.catch()` -- uncaught promise rejection. | Add `.catch(() => {})` since email config is non-critical. |

### 9.4 LOW (Fix when convenient)

| # | File | Function/Location | Issue | Recommendation |
|---|------|-------------------|-------|----------------|
| 19 | `courses.ts:250` | `getCourseWithHoles` | Admin-only read function calls `requireLeagueAdmin` which throws. No try/catch. | Acceptable since error boundary exists, but explicit try/catch would be more defensive. |
| 20 | All `findUniqueOrThrow` calls | Multiple locations | "OrThrow" variants produce unhelpful Prisma error messages like "No record found" instead of domain-specific messages. | Use `findUnique` + null check with domain-specific error. |
| 21 | `league-settings.ts:237` | `recalculateLeagueStats` | No auth check, no try/catch. TODO comment says to add auth if exposed directly. | Add try/catch and auth guard. |
| 22 | Route segments | No `not-found.tsx` for `/league/[slug]` | Mistyped league URLs show the root not-found page instead of a league-specific one. | Add `src/app/league/[slug]/not-found.tsx`. |

---

## 10. Module-by-Module Error Handling Audit

### 10.1 `src/lib/actions/seasons.ts`

**Rating: GOOD**

- All 4 mutations have try/catch with ActionResult returns
- `createSeason`: Zod validation, transaction, logger -- complete
- `setActiveSeason`: Authorization check, ownership verification, transaction
- `updateSeason`: Zod validation, ownership check
- `copyTeamsToSeason`: Ownership check for both seasons, transaction
- 6 read functions have no try/catch (by design)
- **Minor gap:** `updateSeasonSchema` validates `name` and `isActive` but the function accepts `year`, `startDate`, `endDate`, `numberOfWeeks` which are NOT in the schema. These extra fields are passed through `validated` to Prisma, but since Zod's `.parse()` strips unknown keys, they're silently dropped. The `updateSeason` function effectively only updates `name` -- the other fields in the `data` parameter are ignored.

### 10.2 `src/lib/actions/scoring-config.ts`

**Rating: FAIR**

- 2 mutations have try/catch with ActionResult returns
- Zod validation is thorough with custom refinements
- **Gap 1:** Logger is not imported or used. Errors are caught but not logged. In production, there's zero server-side evidence of failures.
- **Gap 2:** `getScoringConfig` has no try/catch. It calls `requireLeagueAdmin` which throws on auth failure. The JSON parsing of point scales has its own try/catch -- good.
- **Gap 3:** `getScheduleConfig` has no try/catch and uses `findUniqueOrThrow`.

### 10.3 `src/lib/actions/shared.ts`

**Rating: GOOD**

- Minimal file with well-defined types
- `ActionResult<T>` type is the foundation of the error handling pattern
- `getServerActionIp` handles missing headers gracefully with fallback to "unknown"
- `generateSlug` is a pure function with no error scenarios

### 10.4 `src/lib/email.ts`

**Rating: EXCELLENT**

- Handles missing API key gracefully (returns error result, doesn't throw)
- Wraps Resend API call in try/catch
- Returns discriminated union `{ success: true } | { success: false; error: string }`
- `isEmailConfigured()` is a simple boolean check
- **Only concern:** HTML template interpolates user-provided values (`captainName`, `teamName`, `leagueName`, `scorecardUrl`) without HTML escaping. If a team name contains `<script>`, it would be injected into the email HTML. Low risk since email clients typically sanitize HTML, but a defense-in-depth improvement would be to escape these values.

### 10.5 `src/lib/db.ts`

**Rating: GOOD**

- Validates environment variables (`TURSO_DATABASE_URL` set without `TURSO_AUTH_TOKEN`)
- Wraps PrismaClient creation in try/catch
- Provides descriptive error messages
- Uses singleton pattern to prevent connection leak in development
- **One concern:** Uses `console.error` instead of the structured logger. This is necessary because the logger module may itself depend on the database being initialized. Acceptable tradeoff.

### 10.6 `src/app/error.tsx` (Root Error Boundary)

**Rating: GOOD**

- Proper "use client" directive
- Displays error digest for support reference
- "Try Again" button calls `reset()`
- "Back to Clubhouse" link as fallback navigation
- Uses design system (ContourHills, golf-themed messaging)
- **Minor concern:** Does not log the error client-side. Adding a `useEffect(() => { console.error(error) }, [error])` would help during development.

### 10.7 `src/app/league/[slug]/error.tsx` (League Error Boundary)

**Rating: GOOD**

- Same structure as root error boundary
- "Back to Leagues" link is contextually appropriate
- Displays error digest
- **Inconsistency:** Uses inline CSS variables (`var(--green-primary)`) instead of the Tailwind design system tokens used by the root error boundary (`bg-fairway`, `text-scorecard-pencil`). This creates visual inconsistency between error boundaries.

### 10.8 `src/lib/actions/courses.ts`

**Rating: POOR**

- **Zero try/catch blocks** in any of the 4 exported functions
- `createCourse` and `updateCourse` call `courseInputSchema.parse()` which throws `ZodError` on invalid input. These errors propagate as uncaught exceptions.
- `deleteCourse` calls `prisma.course.delete()` which can throw on foreign key constraints.
- All functions call `requireLeagueAdmin` and `requireActiveLeague` which throw on auth/status failures.
- Logger is not imported.
- **This is the most underprotected mutation module in the codebase.**

### 10.9 `src/lib/actions/handicap-settings.ts`

**Rating: FAIR**

- `getHandicapSettings`, `getTeamHandicap`, `getHandicapHistory`, `getHandicapHistoryForSeason`: All read-only, no try/catch (by design)
- Logger is not imported
- `getHandicapHistoryForSeason` chains multiple Prisma queries. If any throws, the error propagates to the error boundary.
- `buildHandicapHistory` is a pure function with no error scenarios (handles empty arrays correctly)
- **The internal helper functions `buildHandicapHistoryFromMatchups` and `buildHandicapHistoryFromWeeklyScores` are not exported and are only called from `getHandicapHistoryForSeason`.** If Prisma queries fail inside these helpers, the error propagates correctly.

### 10.10 `src/lib/actions/standings.ts`

**Rating: FAIR (for its purpose)**

- All 4 exported functions are read-only data fetchers
- No try/catch, no logger (by design -- these serve server components)
- The computation-heavy ranking functions (`rankTeams`, `rankTeamsHybrid`) are pure functions that don't throw
- **Risk:** If Prisma queries fail (e.g., timeout on a large league), the entire leaderboard page crashes to the error boundary. No partial rendering is possible from this module alone.

---

## 11. Architectural Recommendations

### 11.1 Immediate Actions (1-2 days)

1. **Add try/catch to all 11 mutation functions identified in Section 3.1.** Use this template:

```typescript
export async function functionName(
  leagueSlug: string,
  ...params
): Promise<ActionResult<T>> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);
    // ... business logic ...
    return { success: true, data: result };
  } catch (error) {
    logger.error("functionName failed", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid input" };
    }
    return { success: false, error: error instanceof Error ? error.message : "Operation failed." };
  }
}
```

2. **Add logger imports to `courses.ts`, `scoring-config.ts`, `handicap-settings.ts`, `standings.ts`.**

3. **Add `.catch()` to the 2 uncaught `.then()` calls in client components.**

### 11.2 Short-Term Actions (1 sprint)

4. **Add error boundaries for `/league/[slug]/admin` and `/sudo`.**

5. **Standardize error display in admin components.** Replace `alert()` calls with the `setMessage({ type, text })` pattern, or better yet, introduce a shared `useNotification` hook.

6. **Replace `console.error` with `logger.error` in all API routes.**

7. **Fix the generic error messages** in `teams.ts` catch blocks to include `error.message`.

### 11.3 Long-Term Actions (backlog)

8. **Create a shared error handling wrapper** to reduce boilerplate:

```typescript
export function withErrorHandling<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<ActionResult<TResult>>,
  label: string
): (...args: TArgs) => Promise<ActionResult<TResult>> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logger.error(`${label} failed`, error);
      if (error instanceof z.ZodError) {
        return { success: false, error: error.issues[0]?.message || "Invalid input" };
      }
      return { success: false, error: error instanceof Error ? error.message : "Operation failed." };
    }
  };
}
```

9. **Add a global unhandled rejection handler** for development to catch missed `.catch()` calls.

10. **Consider adding error reporting** (Sentry, etc.) for production error visibility beyond Vercel logs.

---

## 12. Summary Statistics

| Metric | Count |
|--------|-------|
| Total exported async functions across all action modules | ~80 |
| Functions with try/catch (mutations) | ~36 |
| Functions without try/catch (read-only, by design) | ~33 |
| **Mutation functions missing try/catch (BUG)** | **11** |
| Error boundaries | 2 (root + league) |
| Route segments needing error boundaries | 3 (admin, scorecard, sudo) |
| Modules missing logger | 4 |
| API routes using `console.error` instead of logger | 6 |
| Client-side uncaught `.then()` calls | 2 (confirmed uncaught) |
| Admin components using `alert()` for errors | 2 (MatchupsTab, SettingsTab) |
