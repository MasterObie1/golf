# LeagueLinks Comprehensive Code Review

**Date:** 2026-02-10
**Reviewer:** Senior Engineering Review (12-agent automated audit)
**Branch:** `feature/scorecards` (full repo scope including `main` baseline)
**Verdict:** This codebase is functional but has serious structural, security, and correctness issues that must be addressed before scaling. The bones are there, but the flesh needs work.

---

## Executive Summary

LeagueLinks is a golf league management app built on Next.js 16, React 19, Prisma 7, and Tailwind CSS 4. The codebase has undergone meaningful improvements (action decomposition, security fixes, tab-level admin refactoring), but fundamental problems persist across every layer.

**The good:** The handicap engine is excellent. Server action decomposition into domain modules was the right call. Transactions exist where they matter most. Cookie security flags are correct. No SQL injection vectors exist. The `registerTeam` action is a gold standard for input validation.

**The bad:** Password hashes leak through multiple API endpoints and server actions. 17+ read-only server actions have zero authorization. The head-to-head tiebreaker has been sorting backwards since day one. Seed scripts can wipe production databases. The rate limiter is effectively non-functional on Vercel. Three entire public pages are client-rendered with zero SEO value.

**The ugly:** The League model has 65+ columns. SettingsTab.tsx has 38 `useState` calls across 1,038 lines. `recalculateLeagueStats` makes ~216 individual database queries without a transaction. The freeze week feature is a no-op. Interface definitions are duplicated in 7+ files.

### Findings Summary

| Severity | Count (Deduplicated) |
|----------|---------------------|
| CRITICAL | 14 |
| HIGH | 34 |
| MEDIUM | 72 |
| LOW | 42 |
| INFO | 20 |
| **Total** | **182** |

*(463 raw findings across 12 review agents, deduplicated to 182 unique issues)*

---

## CRITICAL Findings

These must be fixed before any production deployment or feature merge.

---

### C1. Super-Admin API Leaks Password Hashes

**Files:**
- `src/app/api/sudo/leagues/[id]/route.ts:20-31` (GET returns full League)
- `src/app/api/sudo/leagues/[id]/status/route.ts:28-31` (PATCH returns full League)

**Description:** The sudo league endpoints use `prisma.league.findUnique()` with `include` instead of `select`, returning the full League model including the `adminPassword` bcrypt hash in the JSON response. This is especially ironic given that CLAUDE.md documents this exact class of bug as "FIXED."

**Impact:** Any compromised super-admin session exposes bcrypt hashes for every league. Enables offline brute-force attacks against weak passwords (the app only enforces 8 characters, no complexity).

**Fix:** Add `select` clause excluding `adminPassword` and `adminUsername`. Return only the fields the UI actually needs.

---

### C2. Multiple Server Actions Return Password Hash to Client

**Files:**
- `src/lib/actions/league-settings.ts:28` (`updateLeagueSettings`)
- `src/lib/actions/league-settings.ts:41` (`updateScorecardSettings`)
- `src/lib/actions/league-settings.ts:161` (`updateHandicapSettings`)
- `src/lib/actions/league-about.ts:77` (`updateLeagueAbout`)

**Description:** These server actions use `prisma.league.update()` or `prisma.league.findUnique()` without a `select` clause. Prisma returns the full record by default, including `adminPassword` hash. These values are serialized across the network to the client.

**Fix:** Add `select` or `omit` clauses to every Prisma query that returns League data.

---

### C3. Systematic Lack of Authorization on 30+ Read Actions

**Affected functions across:**
- `src/lib/actions/scorecards.ts` (5 functions)
- `src/lib/actions/schedule.ts` (5 functions)
- `src/lib/actions/weekly-scores.ts` (5 functions)
- `src/lib/actions/scoring-config.ts` (2 functions)
- `src/lib/actions/courses.ts` (1 function)
- `src/lib/actions/matchups.ts` (4 functions)
- `src/lib/actions/teams.ts` (6 functions)
- `src/lib/actions/standings.ts` (4 functions)
- `src/lib/actions/handicap-settings.ts` (3 functions)
- `src/lib/actions/seasons.ts` (5+ functions)

**Description:** All write actions properly call `requireLeagueAdmin()`, but virtually every read action accepts a raw integer `leagueId` parameter with zero authentication. Since these are `"use server"` functions, they are directly callable from any client. An attacker can enumerate league IDs (auto-incrementing integers starting from 1) and extract team PII (email, phone, captain name), scoring data, handicap configurations, and internal league settings.

**Impact:** Complete data enumeration of the entire platform by any unauthenticated user.

**Fix:** Add authorization to admin-only reads. For genuinely public data (leaderboards, approved scorecards), use `select` to strip PII. For internal data (scoring config, all scorecards including drafts), require `requireLeagueAdmin()`.

---

### C4. `recalculateLeagueStats` Has No Transaction

**File:** `src/lib/actions/league-settings.ts:168-293`

**Description:** This function updates every matchup individually (`prisma.matchup.update()` in a for-loop) and then every team individually (`prisma.team.update()` in another for-loop). For a league with 100 matchups and 16 teams, that is ~216 individual sequential queries with no `$transaction`. If it fails at matchup #50, half have new handicap values and half have old ones. Team aggregates will be inconsistent.

Additionally, it is exported as a public server action with **no authentication**, making it a denial-of-service vector.

**Impact:** Data corruption on partial failure. Unauthenticated DoS via expensive computation.

**Fix:** Wrap in `$transaction`. Add `requireLeagueAdmin()`. Batch updates. Reuse already-fetched data instead of N+1 re-queries.

---

### C5. Seed Scripts Can Wipe Production Database

**Files:**
- `scripts/seed-smoke-test.ts:585-597` (deletes ALL data including SuperAdmin)
- `scripts/seed-sample-data.ts:305-308` (deletes all matchups, teams, leagues)

**Description:** These scripts call `deleteMany()` with no `where` clause on every table. There is zero environment guard -- no check for `NODE_ENV`, no check for `TURSO_DATABASE_URL`, no confirmation prompt. If a developer has `TURSO_DATABASE_URL` set in their shell (e.g., from a `.env` file), running these scripts obliterates the production database.

**Fix:** Add environment guard at the top of every destructive script:
```typescript
if (process.env.TURSO_DATABASE_URL || process.env.NODE_ENV === "production") {
  console.error("REFUSING to run against production database.");
  process.exit(1);
}
```

---

### C6. `fast-xml-parser` Has Known HIGH Severity CVE

**File:** `package.json:20`

**Description:** `fast-xml-parser@^5.3.3` has advisory GHSA-37qj-frw5-hhjh (RangeError DoS via Numeric Entities Bug, CVSS 7.5). This is a production dependency used for golf course API imports.

**Fix:** Upgrade to patched version. Add input size limits and try/catch around all XML parsing.

---

### C7. Three Public Pages Are Entirely Client-Rendered (Zero SEO)

**Files:**
- `src/app/leagues/page.tsx` (Find a League)
- `src/app/leagues/new/page.tsx` (Create League)
- `src/app/league/[slug]/signup/page.tsx` (Team Signup)

**Description:** All three pages are `"use client"` components that fetch data via `useEffect`. They have zero server-rendered HTML, no `generateMetadata` export, and no page titles. Google sees empty divs. The leagues page loads ALL leagues into memory with no pagination.

**Fix:** Convert to server components. Extract interactive forms into client child components. Add `generateMetadata`.

---

### C8. Admin Page Fetches All Data Client-Side in 4-5 Serial Waterfalls

**File:** `src/app/league/[slug]/admin/page.tsx:150-218`

**Description:** The entire admin page is `"use client"`. On mount, `loadInitialData()` fires 8-12 sequential server action calls. The page shows "Loading..." while the client makes 4-5 serial round trips. On a 100ms network, that is 400-500ms of blank screen minimum.

**Fix:** Convert to a server component that fetches data server-side with `Promise.all` and passes it to client tab components.

---

### C9. Barrel Re-Export Defeats Tree Shaking

**File:** `src/lib/actions/index.ts` (170 lines)

**Description:** This file re-exports every function from every action module. Every consumer that imports from `@/lib/actions` causes the bundler to process all 100+ server actions, even if only 2 are used. This defeats the purpose of the domain-split architecture.

**Fix:** Delete the barrel file. Import directly from specific modules (e.g., `import { getTeams } from "@/lib/actions/teams"`).

---

### C10. Head-to-Head Tiebreaker Sorts Backwards

**Files:**
- `src/lib/actions/standings.ts:91` (in `rankTeams`)
- `src/lib/actions/standings.ts:351` (in `calculateStandingsAtWeek`)

**Description:** `return aVsB - bVsA` is inverted. When team A beat team B (`aVsB > bVsA`), the positive return value puts A **after** B in the sort. The team that **lost** head-to-head is ranked higher. This bug is documented in CLAUDE.md as known but unfixed, and is duplicated in two separate ranking functions.

**Impact:** Incorrect playoff seedings, incorrect standings for every league using match play.

**Fix:** Change both occurrences to `return bVsA - aVsB`.

---

### C11. `copyTeamsToSeason` Creates Teams Without Transaction

**File:** `src/lib/actions/seasons.ts:225-243`

**Description:** Creates teams one-by-one in a `for` loop with no `$transaction`. If it fails at team 5 of 16, you have a partial copy with no rollback.

**Fix:** Wrap in `prisma.$transaction`.

---

### C12. `previewMatchup` Has No Auth and No Validation

**File:** `src/lib/actions/matchups.ts:34-139`

**Description:** Takes 10 raw parameters including `leagueId` (integer) with zero authentication and zero Zod validation. Any unauthenticated caller can query any league's team data, handicaps, and scoring calculations. Unlike `submitMatchup` which has both auth and Zod, the preview function has neither.

**Fix:** Add `requireLeagueAdmin()` and Zod schema matching `submitMatchupSchema`.

---

### C13. `submitMatchup` Does Not Verify Teams Belong to League

**File:** `src/lib/actions/matchups.ts:200-263`

**Description:** The transaction creates a matchup with `session.leagueId` but the `teamAId` and `teamBId` values are never verified to belong to that league. An admin of league X could submit a matchup referencing teams from league Y.

**Fix:** Verify team ownership inside the transaction.

---

### C14. Read-Only Server Actions Throw Instead of Returning ActionResult

**Files:** `seasons.ts` (createSeason, setActiveSeason, updateSeason, copyTeamsToSeason), `teams.ts` (createTeam), `leagues.ts` (getLeaguePublicInfo)

**Description:** These server actions throw raw `Error` objects or let Zod errors escape. In Next.js production, thrown errors from server actions are sanitized to generic "An error occurred" messages. Users never see the actual validation error.

**Fix:** Wrap in try/catch and return `ActionResult<T>` consistently.

---

## HIGH Findings

---

### H1. No Security Headers in next.config.ts

**File:** `next.config.ts`

No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, or `Referrer-Policy`. Any page can be embedded in an iframe (clickjacking). HSTS is not enforced.

**Fix:** Add `headers()` function with standard security headers.

---

### H2. Middleware Bypasses All API Routes

**File:** `src/middleware.ts:91-94`

```typescript
if (pathname.startsWith("/api/")) {
  return NextResponse.next();
}
```

All `/api/` routes bypass middleware auth, including `/api/sudo/*`. API routes rely solely on per-handler auth checks. If any new endpoint forgets `requireSuperAdmin()`, it is publicly accessible.

**Fix:** Remove the blanket bypass. Let the matcher handle which API routes need protection.

---

### H3. In-Memory Rate Limiter Is Ineffective on Serverless

**File:** `src/lib/rate-limit.ts`

The rate limiter uses a module-scoped `Map`. On Vercel serverless, each invocation may get a fresh instance. The 5-attempt login limit is trivially bypassable.

**Fix:** Use distributed rate limiting (Upstash, Vercel KV, or Turso).

---

### H4. N+1 Query Patterns Throughout

**Key locations:**
- `league-settings.ts:260-292` -- Per-team matchup re-fetch (16 extra queries for 16 teams)
- `matchups.ts:62-80` -- Redundant team lookups (already included in relation)
- `weekly-scores.ts:134-171` -- Per-team handicap calculation (16 sequential queries)
- `schedule.ts:530-629` -- Per-bye-entry league average queries

**Fix:** Pre-fetch data and compute in memory. Use `Promise.all` for independent queries.

---

### H5. Over-Fetching: Full Team Objects With PII Returned to Clients

**Key locations:**
- `matchups.ts:276-285` (`getMatchupHistory` uses `include: { teamA: true, teamB: true }`)
- `teams.ts:211-216` (`getApprovedTeams` returns full model)
- `handicap-settings.ts:11-17` (`getHandicapSettings` fetches entire League)
- `standings.ts` (all leaderboard functions return full team objects)

Team model includes `email`, `phone`, `captainName` (PII). These are sent to unauthenticated clients.

**Fix:** Use `select` to whitelist only needed fields. Never return full Prisma models to clients.

---

### H6. Unbounded Queries With No Pagination

**Key locations:**
- `matchups.ts:276-285` (`getMatchupHistory` -- all matchups, no limit)
- `leagues.ts:136-151` (`getAllLeagues` -- every league in the system)
- `weekly-scores.ts:325-346` (`getWeeklyScoreHistory` -- all scores, no limit)
- `standings.ts:436-462` (`getLeaderboardWithMovement` -- all matchups into memory)

**Fix:** Add `take`/`skip` parameters or cursor-based pagination.

---

### H7. HTML Injection in Email Template

**File:** `src/lib/email.ts:36-55`

User-provided values (`captainName`, `teamName`, `leagueName`) are interpolated directly into HTML without escaping. A league name like `<img src=x onerror=alert(1)>` would be injected.

**Fix:** HTML-escape all interpolated values.

---

### H8. `processByeWeekPoints` Is Not Idempotent

**File:** `src/lib/actions/schedule.ts:530-629`

The filter uses `status: { not: "cancelled" }` which also matches `"completed"`. Calling the function twice doubles the bye points.

**Fix:** Change filter to `status: "scheduled"`.

---

### H9. Non-Atomic Delete + Insert in Schedule Operations

**Files:**
- `schedule.ts:728-756` (`addTeamToSchedule` deletes then inserts in separate operations)
- `schedule.ts:831-868` (`removeTeamFromSchedule` same issue)

If the insert transaction fails, the old schedule is already deleted.

**Fix:** Include the delete inside the same `$transaction` as the inserts.

---

### H10. Freeze Week Is a Complete No-Op

**File:** `src/lib/handicap.ts:387-392`

The freeze week check exists but the code block is empty with a comment "For now, just calculate normally." The settings UI lets admins configure it, giving a false sense of control.

**Fix:** Implement it or remove it from the UI.

---

### H11. `updateCourse` Deletes and Recreates Holes, Breaking HoleScore Foreign Keys

**File:** `src/lib/actions/courses.ts:175-205`

`tx.hole.deleteMany({ where: { courseId } })` destroys all holes. If `HoleScore` records reference those hole IDs, the FK constraint fails (or worse, creates dangling references in SQLite).

**Fix:** Update existing holes in-place by hole number, or refuse to modify hole structure when scorecards exist.

---

### H12. SettingsTab.tsx Is a 1,038-Line Monolith With 38 useState Calls

**File:** `src/app/league/[slug]/admin/components/SettingsTab.tsx`

Contains 6 conceptually separate forms with a single shared `loading` and `message` state. Saving any form disables all other forms. Success/error messages from different forms overwrite each other.

**Fix:** Split into 6 section components, each with independent state.

---

### H13. Admin Page Silently Swallows Load Errors

**File:** `src/app/league/[slug]/admin/page.tsx:213-214`

The catch block does `console.error` and nothing else. Users see an empty dashboard with no error indication.

**Fix:** Display error banner with retry button.

---

### H14. Serial Data Fetch Waterfalls on 4+ Public Pages

**Files:** `leaderboard/page.tsx`, `history/page.tsx`, `handicap-history/page.tsx`, `schedule/page.tsx`

`getSeasons()` and `getActiveSeason()` are independent but run sequentially. Each page also calls `getLeagueBySlug()` twice (once for metadata, once for the page).

**Fix:** `Promise.all` for independent queries. Use React `cache()` for `getLeagueBySlug`.

---

### H15. `deleteMatchup`/`deleteWeeklyScores` Can Drive Team Stats Negative

**Files:** `matchups.ts:301-372`, `weekly-scores.ts:396-439`

Prisma `{ decrement: ... }` can push values below zero if denormalized stats are already out of sync.

**Fix:** Use `Math.max(0, ...)` or recalculate from source data.

---

### H16. No Session Revocation Mechanism

**Files:** `src/lib/auth.ts`, `src/lib/superadmin-auth.ts`

JWT tokens are stateless. Changing a password does not invalidate existing sessions (valid for up to 7 days). No way to revoke a compromised session.

**Fix:** Add a lightweight session store with `jti` claims.

---

### H17. `submitWeeklyScores` Trusts Client-Computed Points

**File:** `src/lib/actions/weekly-scores.ts:243-321`

The Zod schema validates types/ranges but the actual values for `handicap`, `netScore`, `points`, and `bonusPoints` come from the client. A compromised client could submit arbitrary point values.

**Fix:** Server-side recomputation of points before persisting.

---

### H18. Scorecard Token Shared Secret Vulnerability

**File:** `src/lib/scorecard-auth.ts:10-18`

Admin sessions, super-admin sessions, and scorecard tokens all use the same `SESSION_SECRET`. The admin token parser does NOT check for `type: "scorecard"`, meaning a scorecard token with the right fields could theoretically pass admin validation.

**Fix:** Add `type`/`aud` claims to all token types and verify them.

---

### H19. `@prisma/client` Is in devDependencies

**File:** `package.json:31`

The runtime dependency on `@prisma/client` is in `devDependencies`. Works on Vercel today but could break on any deployment that runs `npm install --production`.

**Fix:** Move to `dependencies`.

---

### H20. Hardcoded Passwords in Seed Scripts

**Files:** `seed-smoke-test.ts:600,606`, `seed-sample-data.ts:167,421`, `seed-test-league.ts:8`

Passwords like `sudo123!`, `admin123`, and `pass@word1` are committed to the repo.

**Fix:** Use environment variables for all seed passwords.

---

### H21. Concurrent Matchup Submission Race Condition

**File:** `src/lib/actions/matchups.ts:48-81, 201-263`

The duplicate check is performed before the transaction starts (TOCTOU). Two admins could simultaneously submit for the same teams/week.

**Fix:** Move duplicate check inside the transaction. Add unique constraint at DB level.

---

### H22. Navigation useEffect Runs on Every Render

**File:** `src/components/Navigation.tsx:33`

`useEffect` has no dependency array -- runs after every single render. Should have `[pathname]`.

---

### H23. BallIntoCup Global Mousemove With No Accessibility

**File:** `src/components/BallIntoCup.tsx`

Global `window` mousemove listener on every pixel. No keyboard alternative. No `prefers-reduced-motion` check. No `aria-hidden`.

---

### H24. `updateSeason` Passes Raw Data Object to Prisma

**File:** `src/lib/actions/seasons.ts:196-199`

No Zod validation. The caller-supplied `data` object is passed directly to `prisma.season.update()`. A crafted call could inject `leagueId`, `isActive`, or `seasonNumber`.

**Fix:** Add Zod schema. Whitelist allowed fields.

---

### H25. `searchLeagues` Has No Rate Limiting

**File:** `src/lib/actions/leagues.ts:113-134`

Unauthenticated, no rate limiting. Enables automated enumeration of all league names and slugs.

---

### H26. All-Time Leaderboard Aggregates by Team Name, Not ID

**File:** `src/lib/actions/standings.ts:734-841`

Teams across seasons grouped by `team.name`. If two different teams have the same name across seasons, their stats merge incorrectly.

---

### H27. Duplicated Interface Definitions (Team in 7 Files, League in 3, Matchup in 3)

**Files:** `admin/page.tsx`, `MatchupsTab.tsx`, `TeamsTab.tsx`, `WeeklyScoresTab.tsx`, `ScorecardsTab.tsx`, `ScheduleTab.tsx`, `SettingsTab.tsx`, `TournamentBoard.tsx`, `MatchupWithScorecards.tsx`

Each file independently defines `Team`, `League`, or `Matchup` interfaces that can silently drift.

**Fix:** Create shared type files and import from a single source.

---

### H28. JWT Payload Casts Without Runtime Validation (7 Locations)

**Files:** `auth.ts:41-43`, `superadmin-auth.ts:42-43`, `scorecard-auth.ts:55-58`, `middleware.ts:40-42`

JWT `payload` fields are cast with `as number` / `as string` without `typeof` checks. A malformed token that passes signature validation could propagate wrong types.

**Fix:** Use Zod schemas to validate JWT payloads.

---

### H29. `best_of_last` + `useWeighting` Interaction Bug

**File:** `src/lib/handicap.ts:214-228`

`best_of_last` sorts by score value (ascending), destroying chronological order. `calculateWeightedAverage()` assumes chronological order for recency weighting. When both settings are enabled, weighting is applied to value-sorted scores instead of time-sorted scores.

**Fix:** Re-sort selected scores by original chronological position before weighting.

---

### H30. Super-Admin Status Change Has No Confirmation for Destructive Actions

**File:** `src/app/sudo/leagues/[id]/page.tsx:297-325`

"Suspended" and "cancelled" happen with one click, no dialog. While delete requires typing the name, these significant status changes have zero safeguards.

---

### H31. Impersonation Has No Audit Trail and Produces Indistinguishable Tokens

**File:** `src/app/api/sudo/impersonate/route.ts`

No logging of who impersonated which league. The generated JWT is identical to a real admin session. No `impersonatedBy` field.

---

### H32. League Model Is a God Object With 65+ Columns

**File:** `prisma/schema.prisma:22-143`

Spans admin credentials, handicap config (20+ fields), scoring config (12+ fields), schedule config (12+ fields), about/metadata, platform management, and scorecard config. Every query touches this massive row.

**Fix:** Extract `HandicapConfig`, `ScoringConfig`, `ScheduleConfig` into separate 1:1 models.

---

### H33. `dropHighest` + `dropLowest` Applied Sequentially With No Bounds Validation

**File:** `src/lib/handicap.ts:230-244`

If `dropHighest + dropLowest >= scores.length`, the guards silently skip dropping rather than warning. No validation prevents invalid configuration.

---

### H34. Suspended Leagues Remain Fully Functional

The `status` field on League (`active`/`suspended`/`cancelled`) is purely cosmetic. No enforcement anywhere. Suspended leagues can still register teams, submit matchups, etc.

---

## MEDIUM Findings (Summary)

72 medium-severity findings across the following categories:

### State Management (12 findings)
- 13-18 `useState` calls per admin tab component
- Props copied to state without sync (SeasonsTab, WeeklyScoresTab)
- Tab content unmounts/remounts on every tab switch (loses form state)
- No dirty state tracking or unsaved changes warning
- `initialAbout.entryFee || ""` evaluates falsy `0` as empty (should use `??`)

### Missing Validation (11 findings)
- `updateScorecardSettings` no Zod validation
- `previewWeeklyScores` no auth or validation
- Course input validation is manual, missing numeric ranges
- Schedule options (`totalWeeks`) unvalidated
- `swapTeamsInMatchup` doesn't verify teams belong to league
- `createLeague` doesn't validate `scoringType` at runtime
- No maximum score validation on gross scores
- `putts` parameter never validated in `saveHoleScore`
- No max length on league name or password
- Points not validated to sum to 20 on server side
- `parseInt` without `NaN` check on scorecards page

### Missing Transactions (5 findings)
- `saveHoleScore` status reset is separate from upsert
- `adminSaveHoleScore` upsert + recalc + update are three operations
- `generateScorecardLink` check+create is TOCTOU race
- `deleteTeam` schedule removal and delete are separate operations
- `createSeason` seasonNumber read is outside transaction (race condition)

### Error Handling (8 findings)
- Error boundaries don't log errors or report to any service
- Leagues page `getAllLeagues()` has no `.catch()` handler (infinite spinner)
- `searchLeagues` in search effect has no error handling
- `generateMetadata` on league pages doesn't handle missing league
- `JSON.parse` on `strokePlayPointScale` without try/catch (2 locations)
- Empty catch blocks throughout admin components (54+ occurrences)
- No loading timeout on admin page
- Stale closures in ScheduleTab confirm dialogs

### Performance (7 findings)
- `force-dynamic` on homepage (should use `revalidate`)
- framer-motion wraps entire application (30-40KB on every page)
- Three font families with 12 weights (180-300KB)
- No caching strategy anywhere (no `revalidate`, no `cache()`)
- Standings loads ALL matchups into memory on every view
- TimeProvider is client component at root layout for imperceptible effect
- Double `getLeagueBySlug` calls on every league page

### Accessibility (9 findings)
- Labels not associated with inputs via `htmlFor`/`id` (AboutTab, MatchupsTab, CourseTab)
- Schedule integration dialog is a hand-rolled modal (no focus trap, no ARIA)
- No ARIA tablist pattern on admin tabs
- Missing `scope` attributes on `<th>` cells (handicap-history, WeeklyScoreCard)
- ScoreCard component has no mobile-responsive layout
- ScorecardGrid table not responsive on mobile
- No keyboard shortcuts for admin actions
- ConfirmDialog doesn't trap focus

### Data Integrity (8 findings)
- Scorecard `grossTotal`/`frontNine`/`backNine` are denormalized without triggers
- Scorecard `tokenExpiresAt` is never enforced (dead data)
- `forfeitTeamId` is not a foreign key
- Team `seasonId` nullable with `onDelete: SetNull` creates orphans
- Matchup `seasonId` nullable allows orphaned matchups
- No soft delete anywhere (all deletes are permanent)
- Scorecard token stored in plaintext
- Trend adjustment uses original scores, not selected scores

### Configuration (6 findings)
- `NEXT_PUBLIC_BASE_URL` not documented in `.env.example`
- `SESSION_SECRET` example value not rejected at runtime
- `SUPER_ADMIN_PASSWORD` not documented in `.env.example`
- Font references in CLAUDE.md are wrong (says Plus Jakarta/Inter/Playfair, actually Oswald/IBM Plex/Source Sans)
- `Playwright` and `@playwright/test` version mismatch
- Extremely low test coverage thresholds (40%/35%)

### Code Duplication (6 findings)
- Scorecard-to-detail mapping copied 4 times in `scorecards.ts`
- `formatPosition` duplicated in 3 files
- `scoreColor`/`scoreBg` duplicated between ScorecardGrid and AdminScorecardGrid
- Matchup-to-week grouping logic duplicated in history and team pages
- Message banner pattern copy-pasted 11 times across admin components
- `getSessionSecret()` duplicated between `auth.ts` and `scorecard-auth.ts`

---

## LOW Findings (Summary)

42 low-severity findings including:

- Inconsistent bcrypt salt rounds (10 in `createLeague`, 12 in `changeLeaguePassword`)
- Predictable admin username (`admin@leaguename`)
- Timing attack on admin login (different response for "league not found" vs "wrong password")
- No password complexity requirements
- CSS variables defined with 4 different naming conventions
- Inline SVG icons repeated across components (120+ lines of boilerplate)
- `console.error` used throughout production code (40+ locations, should use structured logging)
- Unused `leagueSlug` prop in SeasonSelector with eslint-disable comment
- BallRollLoader announces text twice to screen readers
- ScorecardEntry auto-saves on every stroke change with no debounce
- `autoSave` silently swallows errors with no retry mechanism
- Home page "All Systems Operational" is hardcoded with no health check
- Several unused CSS utility classes
- GolfNews uses array index as React key
- E2E tests use dev server instead of production build
- No `.nvmrc` or `engines` field for Node version pinning
- No custom ESLint rules for project-specific patterns
- `describeCalculation` always says "improving" regardless of trend direction
- DNP points can go negative

---

## INFO / Positive Observations

Things done well that should be preserved:

1. **Handicap engine is excellent** -- 731 lines of clean, well-documented pure functions. The `describeCalculation` feature is thoughtful. Best code in the codebase.
2. **Round-robin scheduler is clean** -- Proper circle method, pure functions, `validateSchedule` defense.
3. **Cookie security is correct** -- `httpOnly: true`, `secure` in production, `sameSite: "strict"` everywhere.
4. **JWT verification specifies algorithms** -- `algorithms: ["HS256"]` prevents algorithm confusion attacks.
5. **Super-admin timing attack mitigation** -- Dummy bcrypt compare when user not found.
6. **Zod validation on key mutations** -- `registerTeam`, `submitMatchup`, `updateHandicapSettings`, `updateLeagueAbout` all properly validated.
7. **All queries use Prisma** -- No raw SQL anywhere. SQL injection is not possible.
8. **No `dangerouslySetInnerHTML`** -- Primary XSS vector eliminated.
9. **Transaction usage on critical mutations** -- `submitMatchup`, `deleteMatchup`, `submitForfeit`, `createSeason`, schedule generation.
10. **`.env` properly gitignored** with `.env.example` preserved.
11. **Skip-to-content link** in layout for accessibility.
12. **`prefers-reduced-motion` respected** in CSS and MotionProvider.
13. **League home page data fetching** uses `Promise.all` with `.catch()` fallbacks -- the model for all other pages.
14. **`registerTeam`** is the gold standard: Zod schema, rate limiting, league existence check, registration status check, capacity check, duplicate check. Every other action should aspire to this level.

---

## Top 20 Priority Fixes (Ordered by Impact)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | Add `select` clauses to all League queries to stop leaking `adminPassword` | Low | Closes security hole |
| 2 | Fix head-to-head tiebreaker (`bVsA - aVsB` in 2 locations) | Trivial | Fixes incorrect rankings |
| 3 | Add environment guards to all seed scripts | Low | Prevents production data loss |
| 4 | Add authorization to admin-only read actions | Medium | Closes IDOR vulnerability |
| 5 | Add `select` to team queries to strip PII from public responses | Low | Stops PII leakage |
| 6 | Wrap `recalculateLeagueStats` in a transaction + add auth | Medium | Prevents corruption & DoS |
| 7 | Add security headers to `next.config.ts` | Low | Standard hardening |
| 8 | Fix middleware API route bypass | Low | Defense in depth |
| 9 | Upgrade `fast-xml-parser` | Trivial | Closes CVE |
| 10 | Move `@prisma/client` to `dependencies` | Trivial | Prevents deployment failures |
| 11 | Add `revalidate` to public pages | Trivial | Massive DB load reduction |
| 12 | Parallelize independent queries on 4+ pages | Low | Reduces TTFB |
| 13 | Delete barrel re-export file, use direct imports | Low | Reduces bundle size |
| 14 | Convert 3 client-rendered public pages to server components | Medium | Restores SEO |
| 15 | Fix `processByeWeekPoints` idempotency (`status: "scheduled"`) | Trivial | Prevents double points |
| 16 | Add Zod validation to `updateSeason`, `updateScorecardSettings`, `previewMatchup` | Low | Closes validation gaps |
| 17 | Verify team ownership in `submitMatchup` | Low | Prevents cross-league corruption |
| 18 | Standardize all server actions on `ActionResult<T>` | Medium | Consistent error handling |
| 19 | Split SettingsTab into 6 section components | Medium | Maintainability |
| 20 | Implement or remove freeze week | Low | Stops misleading users |

---

## Missing Database Indexes

**Already present:** `Matchup(teamAId)`, `Matchup(teamBId)`, `Matchup(leagueId)`, `Matchup(seasonId)`, `Scorecard(leagueId, weekNumber)`, `Scorecard(teamId)`, `Scorecard(accessToken)` [redundant with unique]

**Should add:**
- `Scorecard(seasonId)` -- queried by `getScorecardAvailabilityForSeason`
- `Scorecard(courseId)` -- for course-scoped queries
- `ScheduledMatchup(teamAId)` -- queried by conflict checks and team filtering
- `ScheduledMatchup(teamBId)` -- same
- **Remove** redundant `@@index([accessToken])` on Scorecard (unique constraint already creates index)

---

## Architecture Recommendations (If Starting Fresh)

1. **Extract config models** from League (HandicapConfig, ScoringConfig, ScheduleConfig) -- this is the single highest-leverage schema change
2. **Compute standings on write** (materialized on matchup submission) rather than recomputing from scratch on every page view
3. **Use React `cache()`** around all data-fetching functions to deduplicate within request lifecycle
4. **Replace in-memory rate limiter** with Upstash or Vercel KV
5. **Add session store** for revocation support (even a simple Turso table with `jti` claims)
6. **Create shared type files** inferred from Prisma (e.g., `Prisma.TeamGetPayload<{ select: ... }>`)
7. **Add structured logging** (replace 40+ `console.error` calls)
8. **Add error reporting** (Sentry or equivalent)
9. **Add env validation** at startup (Zod schema for all env vars, reject known-bad defaults)

---

*This review was conducted by 12 specialized agents analyzing security, database, server actions, UI components, public pages, performance, type safety, error handling, validation, configuration, and domain logic. Each agent read every relevant file in the codebase.*
