# plan.md — Implementation Plan for LeagueLinks Fixes

## Overview

This plan organizes the 82 findings from the code review into 6 phases, ordered by risk and dependency. Each phase builds on the previous one. Estimated effort assumes a single developer.

---

## Phase 1: Security Emergency (Do First)

**Goal:** Make authentication non-bypassable and stop leaking secrets.

### 1.1 Replace Session Token System
- [ ] Install `jose` for JWT signing/verification
- [ ] Generate a `SESSION_SECRET` env var (add to `.env.example`)
- [ ] Rewrite `createSessionToken()` in `src/lib/auth.ts` to sign JWTs with HS256
- [ ] Rewrite `parseSession()` to verify JWT signature
- [ ] Do the same for `src/lib/superadmin-auth.ts`
- [ ] Update `src/middleware.ts` to verify signed tokens
- [ ] Update both login API routes to issue signed tokens

### 1.2 Fix Super-Admin Authentication
- [ ] Remove hardcoded credentials from `superadmin-auth.ts:9-10`
- [ ] Create a seed script that inserts a `SuperAdmin` record with bcrypt-hashed password
- [ ] Update `superAdminLogin()` to query the `SuperAdmin` table instead of comparing plaintext
- [ ] Add `SUPER_ADMIN_INITIAL_PASSWORD` to `.env.example` for seeding
- [ ] Document the super-admin setup process

### 1.3 Stop Leaking Password Hashes
- [ ] Add `select` clause to `getLeagueBySlug()` excluding `adminPassword` and `adminUsername`
- [ ] Create a separate `getLeagueForAdmin()` that includes credentials (only used in login flow)
- [ ] Audit all callers of `getLeagueBySlug()` to ensure they don't need password fields
- [ ] Add `select` clauses to `getLeaguePublicInfo()` if not already present

### 1.4 Fix Password Management
- [ ] Remove default password from `createLeague()` — require it as mandatory parameter
- [ ] Update `leagues/new/page.tsx` to include a password input field with confirmation
- [ ] Add `changeLeaguePassword` server action with old-password verification
- [ ] Add password change UI to the admin settings tab
- [ ] Enforce minimum password length (8+ characters)

### 1.5 Add Rate Limiting
- [ ] Add rate limiting middleware or use Vercel's built-in rate limiting for:
  - `/api/admin/login` — 5 attempts per 15 minutes per IP
  - `/api/sudo/login` — 3 attempts per 15 minutes per IP
  - `createLeague` action — 3 per hour per IP
  - `registerTeam` action — 10 per hour per IP

---

## Phase 2: Data Integrity (Do Second)

**Goal:** Stop data corruption bugs.

### 2.1 Add Transactions to Write Operations
- [ ] Wrap `submitMatchup` (actions.ts:406-462) in `prisma.$transaction()`
- [ ] Wrap `submitForfeit` (actions.ts:950-988) in `prisma.$transaction()`
- [ ] Wrap `createSeason` (actions.ts:1530-1548) in `prisma.$transaction()`
- [ ] Wrap `setActiveSeason` (actions.ts:1603-1613) in `prisma.$transaction()`
- [ ] Audit all other multi-table write operations for missing transactions

### 2.2 Fix the Head-to-Head Tiebreaker Bug
- [ ] Fix sort in `getLeaderboard()` — change `bVsA - aVsB` to `aVsB - bVsA` at line 524
- [ ] Fix same bug in `getSeasonLeaderboard()` at line 1728
- [ ] Fix same bug in `calculateStandingsAtWeek()` at line 664
- [ ] (Phase 4 will consolidate these into one shared function)

### 2.3 Fix Points Override Bug
- [ ] In `admin/page.tsx`, replace `teamAPointsOverride as number` with proper conversion
- [ ] Use `typeof teamAPointsOverride === 'number' ? teamAPointsOverride : preview.teamAPoints`
- [ ] Same fix for `teamBPointsOverride`

### 2.4 Fix parseInt NaN Issues
- [ ] Add `isNaN` check after `parseInt(seasonId)` in `leaderboard/page.tsx:36`
- [ ] Same fix in `history/page.tsx:32`
- [ ] Same fix in `handicap-history/page.tsx:32`
- [ ] Fall back to active season ID when NaN

### 2.5 Add Database Indexes
- [ ] Add to `schema.prisma`:
  ```prisma
  // On Team model:
  @@index([leagueId])
  @@index([seasonId])

  // On Matchup model:
  @@index([leagueId])
  @@index([seasonId])
  @@index([teamAId])
  @@index([teamBId])
  @@index([leagueId, weekNumber])

  // On Season model:
  @@index([leagueId])
  ```
- [ ] Run `prisma migrate dev` to create migration

### 2.6 Add Input Validation
- [ ] Create Zod schemas for all server actions:
  - `createLeagueSchema` (name length, password strength)
  - `submitMatchupSchema` (positive integers for scores, valid team IDs)
  - `updateLeagueSettingsSchema` (positive maxTeams)
  - `updateHandicapSettingsSchema` (valid ranges for all fields)
  - `createSeasonSchema` (name, year validation)
- [ ] Apply validation at the top of each server action
- [ ] Return typed error responses instead of throwing raw Error

---

## Phase 3: Testing & CI Foundation (Do Third)

**Goal:** Establish a safety net before refactoring.

### 3.1 Set Up Test Infrastructure
- [ ] Install Vitest + `@testing-library/react`
- [ ] Create `vitest.config.ts`
- [ ] Add `"test": "vitest"` and `"test:ci": "vitest run"` to `package.json`
- [ ] Create `tests/` directory structure: `tests/unit/`, `tests/integration/`

### 3.2 Unit Tests for Handicap Engine (Highest ROI)
- [ ] Test `calculateHandicap()` with all score selection modes ("all", "last_n", "best_of_last")
- [ ] Test `selectScores()` with drop highest/lowest
- [ ] Test `calculateWeightedAverage()` with various decay factors
- [ ] Test `suggestPoints()` for all win/loss/tie scenarios
- [ ] Test `calculateTrendAdjustment()`
- [ ] Test edge cases: empty scores, single score, all same scores
- [ ] Test handicap presets match their documented behavior
- [ ] Target: 90%+ coverage on `src/lib/handicap.ts`

### 3.3 Unit Tests for Auth
- [ ] Test JWT creation and verification (after Phase 1 fix)
- [ ] Test session parsing with invalid/expired/tampered tokens
- [ ] Test `requireAdmin` and `requireLeagueAdmin` authorization functions

### 3.4 Integration Tests for Critical Server Actions
- [ ] Set up test database (SQLite in-memory or file)
- [ ] Test `createLeague` + `getLeagueBySlug` round-trip
- [ ] Test `submitMatchup` + verify team stats updated correctly
- [ ] Test `deleteMatchup` + verify stats rolled back
- [ ] Test `registerTeam` + `approveTeam` + `rejectTeam` flow
- [ ] Test `createSeason` + `setActiveSeason` + `copyTeamsToSeason`
- [ ] Test `recalculateLeagueStats` produces correct results
- [ ] Test leaderboard tiebreaker ordering

### 3.5 Set Up CI Pipeline
- [ ] Create `.github/workflows/ci.yml`:
  - Run `npm run lint`
  - Run `npx tsc --noEmit`
  - Run `npm test`
  - Run on all PRs and pushes to `main`
- [ ] Install `husky` + `lint-staged` for pre-commit hooks
- [ ] Pre-commit: lint + type check staged files

### 3.6 Set Up Playwright for E2E
- [ ] Create `playwright.config.ts`
- [ ] Add `"test:e2e": "playwright test"` to `package.json`
- [ ] Write E2E tests for: league creation, admin login, matchup submission, leaderboard display
- [ ] Move/replace `test-live-site.mjs` with proper Playwright tests

---

## Phase 4: Architecture Refactoring (Do Fourth)

**Goal:** Make the codebase maintainable.

### 4.1 Split `actions.ts` into Domain Modules
- [ ] Create `src/lib/actions/` directory
- [ ] Extract league CRUD to `src/lib/actions/leagues.ts`
- [ ] Extract team management to `src/lib/actions/teams.ts`
- [ ] Extract matchup operations to `src/lib/actions/matchups.ts`
- [ ] Extract leaderboard/standings to `src/lib/actions/standings.ts`
- [ ] Extract season management to `src/lib/actions/seasons.ts`
- [ ] Extract handicap settings to `src/lib/actions/handicap-settings.ts`
- [ ] Keep `src/lib/actions/index.ts` as re-export barrel (for backward compat)
- [ ] Separate read functions (no `"use server"`) from write functions (`"use server"`)

### 4.2 Decompose Admin Page
- [ ] Create `src/app/league/[slug]/admin/_components/` directory
- [ ] Extract `MatchupEntryForm` component (matchup tab)
- [ ] Extract `TeamManagement` component (teams tab)
- [ ] Extract `LeagueSettings` component (settings tab)
- [ ] Extract `HandicapSettings` component (handicap config)
- [ ] Extract `AboutEditor` component (about tab)
- [ ] Extract `SeasonManager` component (seasons tab)
- [ ] Main admin page becomes a thin shell with tab routing
- [ ] Consider `useReducer` or `react-hook-form` for form state

### 4.3 Consolidate Duplicated Leaderboard Logic
- [ ] Create `src/lib/standings.ts` with a single `calculateStandings()` function
- [ ] Parameterize it to work for league-level, season-level, and week-level standings
- [ ] Replace all 3 duplicated implementations
- [ ] Ensure the h2h tiebreaker fix (Phase 2) is in the single source

### 4.4 Consolidate Duplicated Handicap History Logic
- [ ] Merge `getHandicapHistory` and `getHandicapHistoryForSeason` into one function
- [ ] Accept optional `seasonId` parameter to switch between league-wide and season-scoped

### 4.5 Extract HandicapConfig from League Model
- [ ] Create `HandicapConfig` model in Prisma schema with 1:1 relationship to `League`
- [ ] Migrate data from League columns to new table
- [ ] Update all queries that read/write handicap config
- [ ] Remove the `leagueToHandicapSettings()` transformation function (no longer needed)

### 4.6 Convert Client Components to Server Components Where Possible
- [ ] Convert `leagues/page.tsx` to server component with client-side search child
- [ ] Convert `signup/page.tsx` to server component with client-side form child
- [ ] Add shared `layout.tsx` for `/league/[slug]/` that fetches league once

---

## Phase 5: Performance Optimization (Do Fifth)

**Goal:** Make the app fast.

### 5.1 Fix Data Loading Waterfalls
- [ ] On `leaderboard/page.tsx`: `Promise.all([getSeasons(), getActiveSeason()])`
- [ ] On `history/page.tsx`: same pattern
- [ ] On `handicap-history/page.tsx`: same pattern
- [ ] On `team/[teamId]/page.tsx`: parallelize independent fetches

### 5.2 Add Caching Strategy
- [ ] Replace `force-dynamic` on homepage with `export const revalidate = 60`
- [ ] Add `revalidate = 300` (5 min) to league public pages (leaderboard, history)
- [ ] Add `revalidatePath` calls in `submitMatchup`, `deleteMatchup`, `approveTeam` actions
- [ ] Consider `unstable_cache` for expensive computations (leaderboard calculation)

### 5.3 Optimize `recalculateLeagueStats`
- [ ] Batch matchup updates using `prisma.$transaction` with array of operations
- [ ] Fetch all team matchups in one query instead of N+1 per team
- [ ] Build a Map for O(1) team lookups instead of repeated `findMany`
- [ ] Target: reduce from 150+ queries to < 10

### 5.4 Fix N+1 in `previewMatchup`
- [ ] Pre-fetch team A and team B before the loop
- [ ] Use the pre-fetched data instead of querying inside the loop

### 5.5 Add Pagination
- [ ] Add `take`/`skip` pagination to `getMatchupHistory`
- [ ] Add pagination UI to history page
- [ ] Consider cursor-based pagination for the leagues browse page

### 5.6 Optimize Over-Fetching
- [ ] Add `select` clauses to all Prisma queries that return data to clients
- [ ] Specifically `getLeagueBySlug`, `getTeams`, `getMatchupHistory`

---

## Phase 6: UX, Accessibility & Polish (Do Sixth)

**Goal:** Make the app usable by everyone.

### 6.1 Accessibility Fundamentals
- [ ] Add `aria-expanded`, `aria-haspopup`, keyboard handlers to nav dropdown
- [ ] Associate all form labels with inputs via `htmlFor`/`id`
- [ ] Add skip-navigation link in `layout.tsx`
- [ ] Add `aria-hidden="true"` to decorative SVGs
- [ ] Add `<caption>` to leaderboard table
- [ ] Install and configure `eslint-plugin-jsx-a11y`

### 6.2 Error Handling UX
- [ ] Create `src/app/error.tsx` (root error boundary)
- [ ] Create `src/app/league/[slug]/error.tsx` (league-scoped error boundary)
- [ ] Create `src/app/not-found.tsx` (custom 404)
- [ ] Create `src/app/league/[slug]/loading.tsx` (loading skeleton)
- [ ] Create `src/app/loading.tsx` (root loading state)

### 6.3 Mobile Navigation
- [ ] Add hamburger menu toggle for mobile
- [ ] Implement slide-out or dropdown mobile nav
- [ ] Ensure all links are accessible on touch devices

### 6.4 SEO
- [ ] Add `generateMetadata()` to all league pages (dynamic title/description)
- [ ] Add Open Graph meta tags
- [ ] Add Twitter card meta tags
- [ ] Consider adding JSON-LD structured data for leagues

### 6.5 Form UX Improvements
- [ ] Add inline validation messages to signup form
- [ ] Show actual error messages from server (not generic) in admin catch blocks
- [ ] Add confirmation dialog for destructive actions (delete team, delete matchup)

### 6.6 Documentation
- [ ] Rewrite `README.md` with: project description, setup instructions, env vars, database setup, deployment guide
- [ ] Clean up orphaned planning files from repo root
- [ ] Add `.gitignore` entries for remaining planning files

---

## Phase Summary

| Phase | Focus | Estimated Effort | Risk if Skipped |
|-------|-------|-----------------|-----------------|
| 1 | Security | 2-3 days | **App is compromisable** |
| 2 | Data Integrity | 1-2 days | **Data corruption in production** |
| 3 | Testing & CI | 3-4 days | **No safety net for changes** |
| 4 | Architecture | 4-5 days | **Codebase becomes unmaintainable** |
| 5 | Performance | 2-3 days | **Slow pages, wasted resources** |
| 6 | UX & Polish | 3-4 days | **Inaccessible, poor user experience** |

**Total estimated effort: 15-21 days for a single developer.**

Phases 1 and 2 are blockers for production use. Phase 3 should precede Phase 4 (you need tests before refactoring). Phases 5 and 6 can be done in parallel.
