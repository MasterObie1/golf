# Fixes.md — Full Code Review Report

**Project:** LeagueLinks Golf League Management App
**Date:** 2026-02-05
**Reviewers:** 5 independent senior engineers (Architecture, Security, Code Quality, Performance, UX/DevOps)

---

## Executive Summary

LeagueLinks has a solid domain concept and a well-designed handicap calculation engine. The URL structure is clean, the dependency tree is lean, and the Prisma schema captures the domain well (if over-broadly). However, the application has **critical security vulnerabilities** that render all authentication meaningless, **data-corrupting bugs** in core write paths, **zero test coverage**, **zero accessibility support**, and **significant performance anti-patterns** that will degrade under any real load.

**Overall Grade: D**

This is a prototype that needs substantial hardening before production use.

---

## Table of Contents

1. [Critical Issues (Fix Immediately)](#1-critical-issues)
2. [Security Findings](#2-security-findings)
3. [Data Integrity Bugs](#3-data-integrity-bugs)
4. [Architecture Problems](#4-architecture-problems)
5. [Performance Issues](#5-performance-issues)
6. [Code Quality Issues](#6-code-quality-issues)
7. [UX & Accessibility](#7-ux--accessibility)
8. [Testing & DevOps](#8-testing--devops)
9. [Minor & Nitpick Issues](#9-minor--nitpick-issues)

---

## 1. Critical Issues

These must be fixed before any real user touches the application.

### 1.1 Session Tokens Are Forgeable (CRITICAL — Auth Bypass)

**Files:** `src/lib/auth.ts:88-90`, `src/lib/superadmin-auth.ts:67-69`

Session tokens are `Buffer.from(JSON.stringify(session)).toString("base64")`. No HMAC, no signature, no encryption. Any user can decode a token, modify the `leagueId`/`leagueSlug`, re-encode it, and gain admin access to any league. The super-admin token is equally forgeable.

**Impact:** Complete authentication bypass. Every league and the super-admin panel are fully compromisable by any anonymous user.

**Fix:** Replace with signed JWTs using a server-side secret (e.g., `jose` library), or implement server-side sessions stored in the database with opaque session IDs.

---

### 1.2 Hardcoded Super-Admin Credentials (CRITICAL — Permanent Exposure)

**File:** `src/lib/superadmin-auth.ts:9-10`

```
const SUPER_ADMIN_USERNAME = "alex";
const SUPER_ADMIN_PASSWORD = "sudo123!";
```

Plaintext credentials in source code, committed to git history. The `SuperAdmin` Prisma model with bcrypt support exists but is completely unused.

**Impact:** Anyone with repo access has super-admin access. Credentials persist in git history even after removal.

**Fix:** Migrate to the existing `SuperAdmin` database model with bcrypt-hashed passwords and a proper login flow. Remove hardcoded credentials. Consider `git filter-branch` or BFG Repo-Cleaner to purge from history.

---

### 1.3 Admin Password Hash Leaked to All Visitors (CRITICAL — Information Disclosure)

**File:** `src/lib/actions.ts:132-136`

`getLeagueBySlug()` returns the full League record with no `select` clause, including `adminPassword` (bcrypt hash) and `adminUsername`. This function is called on public pages (leaderboard, history, team detail). The hash is serialized to the browser in the RSC payload.

**Impact:** Offline brute-force attacks on admin passwords become feasible. Combined with the weak default password (`pass@word1`), most leagues are trivially crackable.

**Fix:** Add a `select` clause excluding `adminPassword` and `adminUsername`, or create a dedicated `getLeaguePublicData()` function.

---

### 1.4 Default Password for All Leagues, No Change Mechanism (CRITICAL)

**Files:** `src/lib/actions.ts:36`, `src/app/leagues/new/page.tsx:68`

Every league is created with password `pass@word1`. The password is displayed in plaintext on the success page. No `changePassword` or `updatePassword` action exists anywhere.

**Impact:** Every league in the system uses a well-known credential.

**Fix:** Require password input during league creation. Add a password change feature to the admin panel. Enforce minimum password strength.

---

### 1.5 `submitMatchup` Has No Transaction (CRITICAL — Data Corruption)

**File:** `src/lib/actions.ts:406-462`

The matchup creation and two team stat updates are separate operations with no `$transaction`. If the matchup is created but a team update fails, stats are permanently corrupted.

**Impact:** Silent data corruption of team standings.

**Fix:** Wrap the matchup create + team updates in `prisma.$transaction()`. The `deleteMatchup` function (line 898) already does this correctly — follow that pattern.

---

### 1.6 Zero Tests (CRITICAL — No Safety Net)

No test files, no test runner, no test script. Playwright is a devDependency but unconfigured. The handicap calculation engine (605 lines of complex math) has zero test coverage.

**Impact:** Any change can introduce regressions with no detection.

**Fix:** Set up Vitest for unit/integration tests. Add tests for `handicap.ts` first (pure functions, highest ROI). Set up Playwright for E2E. Add a `test` script to `package.json`.

---

### 1.7 Zero Accessibility (CRITICAL — Potential Legal Liability)

Zero `aria-*` attributes. Zero `role` attributes. Form labels not associated with inputs. Navigation dropdown is mouse-only. No skip-nav link. No keyboard support on interactive elements.

**Impact:** App is unusable for screen reader users and keyboard-only users. Potential ADA/WCAG compliance issues.

**Fix:** Add ARIA attributes to all interactive elements. Associate labels with inputs via `htmlFor`/`id`. Add keyboard handlers to the navigation dropdown. Add `eslint-plugin-jsx-a11y`.

---

### 1.8 No Error Boundaries or Loading States (CRITICAL — Broken UX)

Zero `error.tsx`, `loading.tsx`, or `not-found.tsx` files in the entire route tree. Database failures show white screens. Slow queries show nothing.

**Fix:** Add `error.tsx` and `loading.tsx` at `src/app/` (root) and `src/app/league/[slug]/` levels. Add a custom `not-found.tsx`.

---

## 2. Security Findings

| # | Finding | Severity | File |
|---|---------|----------|------|
| S1 | Forgeable base64 session tokens | **CRITICAL** | `auth.ts:88-90`, `superadmin-auth.ts:67-69` |
| S2 | Hardcoded super-admin credentials in source | **CRITICAL** | `superadmin-auth.ts:9-10` |
| S3 | Production secrets on disk (`.env.production.local`) | **CRITICAL** | `.env.production.local` |
| S4 | Admin password hash leaked to client via `getLeagueBySlug` | **HIGH** | `actions.ts:132-136` |
| S5 | Default password `pass@word1` for all leagues | **HIGH** | `actions.ts:36` |
| S6 | No rate limiting on login endpoints | **HIGH** | `api/admin/login/route.ts`, `api/sudo/login/route.ts` |
| S7 | No password change mechanism | **HIGH** | Entire codebase |
| S8 | No rate limiting on league/team creation | **MEDIUM** | `actions.ts:34`, `actions.ts:1333` |
| S9 | `createLeague` is unauthenticated (spam vector) | **MEDIUM** | `actions.ts:34-81` |
| S10 | Sudo dashboard page has no server-side auth check | **MEDIUM** | `src/app/sudo/page.tsx` |
| S11 | 7-day sessions with no server-side invalidation | **MEDIUM** | `api/admin/login/route.ts:65` |
| S12 | Inconsistent input validation (Zod used in 2 of ~20 actions) | **MEDIUM** | `actions.ts` throughout |
| S13 | String-typed enums with no DB-level validation | **MEDIUM** | `schema.prisma` |
| S14 | Health endpoint leaks env variable presence | **LOW** | `api/health/route.ts` |
| S15 | Bcrypt cost factor of 10 (minimum recommended) | **LOW** | `actions.ts:59` |

**Positive findings:** No XSS vulnerabilities (React auto-escaping). No SQL injection (Prisma parameterized queries). CSRF protection adequate via Next.js server actions and `sameSite: "strict"` cookies.

---

## 3. Data Integrity Bugs

| # | Bug | Severity | File:Line |
|---|-----|----------|-----------|
| B1 | `submitMatchup` — no transaction on create + team stat updates | **CRITICAL** | `actions.ts:406-462` |
| B2 | `submitForfeit` — same no-transaction problem | **CRITICAL** | `actions.ts:950-988` |
| B3 | `createSeason` — deactivates all seasons then creates, no transaction | **CRITICAL** | `actions.ts:1530-1548` |
| B4 | `setActiveSeason` — same no-transaction problem | **CRITICAL** | `actions.ts:1603-1613` |
| B5 | Head-to-head tiebreaker sorts backwards (`bVsA - aVsA` should be `aVsB - bVsA`) | **MAJOR** | `actions.ts:520-524`, `actions.ts:1728`, `actions.ts:664` |
| B6 | Points override passes `""` as number via `as number` cast | **MAJOR** | `admin/page.tsx:381-396` |
| B7 | `netDifferential` crashes if matchup references non-approved team | **MAJOR** | `actions.ts:499-502` |
| B8 | Freeze week feature is a no-op (commented out) | **MAJOR** | `handicap.ts:387-392` |
| B9 | `parseInt(seasonId)` with no NaN check on 3 pages | **MAJOR** | `leaderboard/page.tsx:36`, `history/page.tsx:32`, `handicap-history/page.tsx:32` |
| B10 | `playedCurrentWeek` variable computed but never used | **MINOR** | `actions.ts:763-765` |

---

## 4. Architecture Problems

| # | Problem | Severity | Location |
|---|---------|----------|----------|
| A1 | `actions.ts` is 1,951-line monolith mixing reads and writes | **MAJOR** | `src/lib/actions.ts` |
| A2 | Admin page is 2,068-line component with 40+ `useState` calls | **MAJOR** | `admin/page.tsx` |
| A3 | League model is a god object with 40+ columns | **MAJOR** | `schema.prisma:22-101` |
| A4 | Server actions misused as data access layer (reads as `"use server"`) | **MAJOR** | `actions.ts` |
| A5 | Leaderboard logic duplicated 3 times with same bug | **MAJOR** | `actions.ts:464-535`, `1669-1740`, `570-682` |
| A6 | Handicap history logic duplicated | **MAJOR** | `actions.ts:802-869`, `1806-1872` |
| A7 | Client components where server components would suffice | **MAJOR** | `leagues/page.tsx`, `signup/page.tsx` |
| A8 | No shared layout for `/league/[slug]/` routes | **MINOR** | `src/app/league/[slug]/` |
| A9 | Inconsistent auth enforcement patterns across actions | **MINOR** | `actions.ts` |
| A10 | Flat component directory with no organization | **MINOR** | `src/components/` |

---

## 5. Performance Issues

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| P1 | No database indexes on ANY foreign keys (full table scans) | **CRITICAL** | `schema.prisma` |
| P2 | `recalculateLeagueStats` fires 150+ sequential DB queries | **CRITICAL** | `actions.ts:1101-1226` |
| P3 | Homepage `force-dynamic` for data that changes weekly | **CRITICAL** | `page.tsx:6` |
| P4 | Serial waterfall on every public page (could be `Promise.all`) | **CRITICAL** | `leaderboard/page.tsx`, `history/page.tsx`, `handicap-history/page.tsx` |
| P5 | Zero caching anywhere (no ISR, no `revalidate`, no `revalidatePath`) | **MAJOR** | All pages |
| P6 | Leagues page fully client-rendered (no SSR, no SEO) | **MAJOR** | `leagues/page.tsx` |
| P7 | N+1 team lookups in `previewMatchup` | **MAJOR** | `actions.ts:316-327` |
| P8 | `getLeagueBySlug` fetches all 40+ fields when only 3-4 needed | **MAJOR** | `actions.ts:132-136` |
| P9 | Admin page is 2,068-line single chunk (no code splitting) | **MAJOR** | `admin/page.tsx` |
| P10 | `copyTeamsToSeason` does sequential inserts in a loop | **MINOR** | `actions.ts:1930-1948` |
| P11 | O(T*W*M) algorithm in handicap history | **MINOR** | `actions.ts:826-869` |
| P12 | 3 Google Fonts with 12 total weights | **MINOR** | `layout.tsx:6-22` |
| P13 | In-memory RSS cache useless on serverless (resets on cold start) | **MINOR** | `rss.ts:15-26` |
| P14 | No pagination on data-heavy pages (all matchups loaded) | **MAJOR** | `actions.ts:537` |

---

## 6. Code Quality Issues

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| Q1 | Unsafe `as number` casts on `number \| ""` union types | **MAJOR** | `admin/page.tsx:358-396` |
| Q2 | Unsafe type assertions on league data with `!` operator | **MAJOR** | `league/[slug]/page.tsx:44-47` |
| Q3 | Error details thrown away in catch blocks (generic messages) | **MAJOR** | `admin/page.tsx:413-414`, `449-451`, `470-472` |
| Q4 | Silent error swallowing in admin data loading | **MAJOR** | `admin/page.tsx:312-316` |
| Q5 | Hand-rolled interfaces instead of Prisma-generated types | **MINOR** | `admin/page.tsx:40-103` |
| Q6 | Score-to-matchup grouping logic duplicated | **MINOR** | `history/page.tsx:45-84`, `team/[teamId]/page.tsx:31-70` |
| Q7 | No custom error classes or error codes | **MINOR** | `actions.ts` |
| Q8 | `searchLeagues` and many functions have no error handling | **MINOR** | `actions.ts:86-107` |
| Q9 | Unused caught `error` variables in multiple catch blocks | **NITPICK** | `admin/page.tsx:413, 449, 470, 483` |

---

## 7. UX & Accessibility

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| U1 | Zero ARIA attributes in entire codebase | **CRITICAL** | Everywhere |
| U2 | Navigation dropdown mouse-only (no keyboard support) | **CRITICAL** | `Navigation.tsx:57-108` |
| U3 | Form labels not associated with inputs | **MAJOR** | `signup/page.tsx:173-236`, `admin/page.tsx` throughout |
| U4 | No error boundaries / loading states / custom 404 | **CRITICAL** | Entire app |
| U5 | No mobile hamburger menu (nav overflows on small screens) | **CRITICAL** | `Navigation.tsx` |
| U6 | No skip-navigation link | **MAJOR** | `layout.tsx` |
| U7 | Color-only information for registration status | **MAJOR** | `league/[slug]/page.tsx:111-116` |
| U8 | Admin page unusable on mobile | **MAJOR** | `admin/page.tsx` |
| U9 | ScoreCard compresses poorly on small screens | **MAJOR** | `ScoreCard.tsx:70-101` |
| U10 | No breadcrumbs for deep navigation | **MINOR** | All league sub-pages |
| U11 | Decorative SVGs not hidden from screen readers | **MINOR** | `page.tsx` and others |
| U12 | GolfNews external links lack new-tab indication | **MINOR** | `GolfNews.tsx:70-84` |
| U13 | Single `<title>` for all pages (no per-page metadata) | **MAJOR** | `layout.tsx:24-27` |
| U14 | No Open Graph / Twitter card meta tags | **MAJOR** | `layout.tsx` |
| U15 | No structured data (JSON-LD) for search engines | **MINOR** | Entire app |
| U16 | Leaderboard table has no `<caption>` | **MINOR** | `LeaderboardTable.tsx:65` |

---

## 8. Testing & DevOps

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| D1 | Zero test files / no test runner configured | **CRITICAL** | Entire project |
| D2 | No CI/CD pipeline (no GitHub Actions, no pre-commit hooks) | **CRITICAL** | Project root |
| D3 | README is default create-next-app boilerplate | **CRITICAL** | `README.md` |
| D4 | No `npm test` script | **MAJOR** | `package.json` |
| D5 | ESLint config is minimal (no a11y plugin, no import rules) | **MAJOR** | `eslint.config.mjs` |
| D6 | Build does not run migrations (removed in commit 886fd8b) | **MAJOR** | `package.json:7` |
| D7 | No backup strategy for production database | **MAJOR** | N/A |
| D8 | `test-live-site.mjs` is a prod data seeder in the repo root | **MINOR** | `test-live-site.mjs` |
| D9 | Orphaned planning files in repo root | **MINOR** | `about_league_*.md`, `BRAND_GUIDE.md` |
| D10 | `dev.db` exists in multiple locations | **NITPICK** | Root and `prisma/` |

---

## 9. Minor & Nitpick Issues

- `@prisma/client` in `devDependencies` rather than `dependencies` — verify this works in production build
- Playwright devDependency is unused (no config, no tests)
- `Matchup.seasonId` is nullable — orphaned matchups possible if code forgets to set it
- No soft-delete pattern for matchups or teams (hard deletes are irreversible)
- `getLeaderboardWithMovement` mixes denormalized team stats with recomputed rankings — data can be internally inconsistent
- Inconsistent use of Prisma `include` vs. separate queries + manual joining
- `.env.example` has unused `ADMIN_USERNAME`/`ADMIN_PASSWORD` vars (misleading)
- Three planning MD files not in `.gitignore` (`about_league_*.md`, `BRAND_GUIDE.md`)

---

## Summary Scorecard

| Domain | Grade | Critical | Major | Minor |
|--------|-------|----------|-------|-------|
| Security | **F** | 3 | 4 | 6 |
| Data Integrity | **D** | 4 | 5 | 1 |
| Architecture | **D+** | 0 | 7 | 3 |
| Performance | **D+** | 4 | 6 | 4 |
| Code Quality | **C-** | 0 | 4 | 5 |
| UX & Accessibility | **F** | 4 | 6 | 6 |
| Testing & DevOps | **F** | 3 | 4 | 3 |
| **Overall** | **D** | **18** | **36** | **28** |

---

## What's Actually Good

To be fair, these things are done well:

1. **`src/lib/handicap.ts`** — 605 lines of clean, well-structured pure functions with configurable presets. This is genuinely good code.
2. **Dependency tree** — Lean and appropriate. No bloat, no unnecessary libraries.
3. **URL structure** — Clean, RESTful, slug-based routing that's human-readable.
4. **Prisma usage** — No raw SQL, parameterized queries throughout, no injection risk.
5. **Domain modeling** — The concept of leagues, seasons, teams, and matchups is well-captured.
6. **Visual design** — The golf club aesthetic is cohesive and well-executed with CSS custom properties.
7. **Form loading states** — Buttons show loading text and disable during submission consistently.
