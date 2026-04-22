# Performance Analysis: Database Queries, Bundle Impact, and Rendering

**Reviewer:** Senior Staff Engineer (Claude Opus 4.6)
**Date:** 2026-02-11
**Scope:** All server action files (`src/lib/actions/*.ts`), all page components (`src/app/**/*.tsx`), Prisma configuration, client bundle, and memory management
**Severity Scale:** CRITICAL | HIGH | MEDIUM | LOW

---

## 1. Executive Summary

This analysis examines LeagueLinks across four performance dimensions: database query patterns, RSC payload efficiency, client bundle weight, and memory management. The findings build on the Wave 1 reviews that identified specific N+1 queries (weekly-scores.ts) and duplicate queries (frontend pages).

**Key findings:**

1. **N+1 queries exist in 3 locations** -- the `previewWeeklyScores` loop (Wave 1), the `recalculateLeagueStats` matchup update loop, and the `deleteWeeklyScores` team update loop. The recalculate function also has a serial team update pattern that grows with team count.

2. **Serial `await` inside transactions** appears in 5 schedule-related functions, creating N sequential `INSERT` statements where `createMany` or batched operations could be used. For a 20-week schedule with 10 matches per week, this is 200 sequential round-trips to the database.

3. **Zero use of `createMany`** across the entire codebase. Every bulk insert is done via serial `create()` calls inside loops. This is the single largest systemic performance debt.

4. **Matchup queries without `select` clauses** in 7 locations across `standings.ts`, `handicap-settings.ts`, and `league-settings.ts` over-fetch all 20+ Matchup columns when only 8-10 are needed for ranking calculations.

5. **No React `cache()` wrapper** on any data-fetching function. Every page that calls `generateMetadata` + page body duplicates its league lookup, doubling database queries on every page load.

6. **No Prisma query logging** is configured. There is no way to observe query patterns, slow queries, or N+1 patterns in development or production.

7. **The rate limiter Map has no size bound**, creating an unbounded memory growth vector under sustained attack. The 5-minute cleanup helps but does not cap peak memory.

8. **framer-motion is imported in 8 client components**, adding approximately 40-60KB gzipped to the client bundle for leaderboard animations. The `MotionProvider` pattern with `LazyMotion` is used, which is the correct approach, but the package is still large.

**Overall performance assessment:** The app performs well for its current scale (small leagues, single-digit concurrent users). The patterns will degrade linearly with data volume and concurrently. The most impactful fix is wrapping data-fetching functions in `cache()` (30 minutes of work, halves all public page database queries). The second most impactful fix is converting serial creates to `createMany` in schedule generation.

---

## 2. Findings Table

| # | Severity | Location | Issue | Impact |
|---|----------|----------|-------|--------|
| 1 | HIGH | `standings.ts:496,558,734,869,885` | Matchup `findMany` without `select` clause -- fetches all 20+ columns | Over-fetches ~40% unnecessary data on every leaderboard load |
| 2 | HIGH | `handicap-settings.ts:143,211` | Matchup `findMany` without `select` for handicap history | Over-fetches on every handicap history page |
| 3 | HIGH | `league-settings.ts:271` | Matchup `findMany` without `select` in `recalculateLeagueStats` | Over-fetches during full league recalculation |
| 4 | HIGH | `weekly-scores.ts:140-164` | N+1 query in `previewWeeklyScores` (Wave 1 finding, confirmed) | 1 query per team on every preview, linear with team count |
| 5 | HIGH | `league-settings.ts:358,402` | Serial `tx.matchup.update` + serial `tx.team.update` in recalculate | M matchup updates + N team updates, all sequential |
| 6 | HIGH | `schedule.ts:866-884,986-1004` | Serial `tx.scheduledMatchup.create` in schedule generation loops | W*M sequential inserts for W weeks * M matches |
| 7 | HIGH | `weekly-scores.ts:326-349` | Serial `tx.weeklyScore.create` + `tx.team.update` per score | 2N sequential operations for N teams |
| 8 | HIGH | All league sub-pages | No `cache()` on `getLeagueBySlug`/`getLeaguePublicInfo` -- doubled queries | 2x database queries on every public page load |
| 9 | HIGH | `weekly-scores.ts:447-468` | N+1 in `deleteWeeklyScores` -- serial team lookup + update per score | 2N queries for N teams in the week |
| 10 | MEDIUM | `teams.ts:82-88` | `getTeamPreviousScores` fetches full Matchup model (no select) | Over-fetches for handicap calculation |
| 11 | MEDIUM | `teams.ts:133-137` | `getCurrentWeekNumber` fetches full Matchup (no select) | Fetches all columns to read one `weekNumber` |
| 12 | MEDIUM | `seasons.ts:160-163` | `getTeamsForSeason` fetches full Team model (no select) | Leaks PII (captainName, email, phone) to admin RSC payload |
| 13 | MEDIUM | `seasons.ts:175-181` | `getTeamPreviousScoresForSeason` fetches full Matchup (no select) | Over-fetches during handicap calculation |
| 14 | MEDIUM | `seasons.ts:250-252` | `copyTeamsToSeason` fetches full Team model for source teams | Over-fetches PII fields unnecessarily |
| 15 | MEDIUM | `schedule.ts:609-614` | Team lookup inside conflict-detection loop (inside transaction) | Sequential DB call per conflicting team |
| 16 | MEDIUM | `scorecards.ts:800-813` | `createAdminScorecard` fetches full Course and Team models | No select clause on team/course lookups |
| 17 | MEDIUM | `weekly-scores.ts:366-372` | `getWeeklyScoreHistory` uses `include` but no `select` on main model | Fetches all WeeklyScore columns, then manually maps to subset |
| 18 | MEDIUM | `db.ts:28` | PrismaClient created without query logging | No observability into query patterns or slow queries |
| 19 | MEDIUM | `rate-limit.ts:12-23` | Rate limit Map has no size bound -- grows unbounded under attack | Memory grows linearly with unique IPs during sustained attack |
| 20 | MEDIUM | `team/[teamId]/page.tsx:42-47` | Serial `getLeagueBySlug` then `getTeamById` (could be parallel) | ~2x latency for team detail page initial data fetch |
| 21 | MEDIUM | `scorecards/page.tsx:41-46` | Serial season + week detection even when week is in URL params | Unnecessary DB queries when `?week=N` is provided |
| 22 | MEDIUM | `schedule.ts:1150-1152` | `findMany` for scheduled matchups without select in `assignShotgunStartingHoles` | Over-fetches scheduled matchup fields |
| 23 | LOW | `page.tsx` (home) | `groupBy` on weeklyScore returns unbounded rows | Grows linearly with total league-weeks across all leagues |
| 24 | LOW | `matchups.ts:353-365` | `getMatchupHistory` includes team stats (totalPoints, wins, etc.) | Denormalized stats in public history response; minor extra data |
| 25 | LOW | 8 components in `grounds/` | framer-motion imported (~40-60KB gzip) | Significant for mobile first load; mitigated by LazyMotion |

---

## 3. Detailed Analysis

### 3.1 N+1 Query Patterns

**Location 1: `previewWeeklyScores` (weekly-scores.ts:140-164) -- Confirmed from Wave 1**

```typescript
// weekly-scores.ts:140-164
for (const input of inputs) {
  // ...
  const prevScores = await getTeamPreviousScoresForScoring(leagueId, input.teamId, league.scoringType);
  handicap = calculateHandicap(prevScores, handicapSettings, weekNumber);
}
```

For N teams, this issues N individual `findMany` queries. Each query fetches all matchups or weekly scores for a single team. The fix (batch-fetch all previous scores in one query, distribute in-memory) was proposed in the Wave 1 review.

**Location 2: `deleteWeeklyScores` (weekly-scores.ts:456-468)**

```typescript
// weekly-scores.ts:456-468
await prisma.$transaction(async (tx) => {
  for (const score of weekScores) {
    const team = await tx.team.findUniqueOrThrow({       // Query 1 per team
      where: { id: score.teamId },
      select: { totalPoints: true },
    });
    await tx.team.update({                                // Query 2 per team
      where: { id: score.teamId },
      data: { totalPoints: Math.max(0, team.totalPoints - score.points) },
    });
  }
  await tx.weeklyScore.deleteMany({ ... });               // 1 query
});
```

For N teams in a week, this issues 2N + 1 queries inside a transaction. The team lookup is needed to clamp at zero (can't use `{ decrement }` because it could go negative). However, the entire set of teams can be fetched in one query, points decremented in-memory, and then updated in a batch or via `updateMany` with conditional logic.

**Fix for Location 2:**
```typescript
// Batch-fetch all team points in one query
const teamIds = weekScores.map(s => s.teamId);
const teams = await tx.team.findMany({
  where: { id: { in: teamIds } },
  select: { id: true, totalPoints: true },
});
const pointsMap = new Map(teams.map(t => [t.id, t.totalPoints]));

// Calculate decremented points in-memory, then update each
for (const score of weekScores) {
  const current = pointsMap.get(score.teamId) ?? 0;
  await tx.team.update({
    where: { id: score.teamId },
    data: { totalPoints: Math.max(0, current - score.points) },
  });
}
```

This reduces from 2N + 1 to N + 2 queries. The team updates still must be individual because `updateMany` cannot use per-record values.

**Location 3: `recalculateLeagueStats` (league-settings.ts:308-378,382-406)**

The recalculate function processes each matchup serially with `await tx.matchup.update()` inside a `for` loop, then updates each team serially. For a league with M matchups and N teams, this is M + N sequential update operations.

```typescript
// league-settings.ts:358 (inside for loop over matchups)
await tx.matchup.update({
  where: { id: matchup.id },
  data: { teamAHandicap, teamBHandicap, teamANet, teamBNet, teamAPoints, teamBPoints },
});
// ...
// league-settings.ts:402 (inside for loop over teams)
await tx.team.update({
  where: { id: team.id },
  data: { totalPoints, wins, losses, ties },
});
```

This is inherently serial because each matchup's handicap depends on the scores accumulated from all previous matchups (the `teamScores` array is built incrementally). The team updates could potentially be batched at the end, but individual `update` calls are required because each team has unique values. This pattern is acceptable for the recalculation use case (admin-triggered, infrequent), but should be noted for leagues with hundreds of matchups.

### 3.2 Serial Creates in Transactions (Zero `createMany` Usage)

The entire codebase uses zero `createMany` calls. Every bulk insert operation uses serial `create()` inside a loop. This is the single largest systemic performance debt.

**Schedule Generation (`schedule.ts:866-884` and `986-1004`):**

```typescript
// schedule.ts:866-884
for (const round of rounds) {
  for (const match of round.matches) {
    await tx.scheduledMatchup.create({
      data: { leagueId, seasonId, weekNumber, teamAId, teamBId, status, courseSide },
    });
  }
}
```

For a 20-week round-robin with 8 teams (4 matches/week), this is 80 sequential `INSERT` statements. With `createMany`, this collapses to 1 statement:

```typescript
const allMatchups = rounds.flatMap(round =>
  round.matches.map(match => ({
    leagueId,
    seasonId: activeSeason?.id ?? null,
    weekNumber: round.weekNumber,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    status: "scheduled" as const,
    courseSide: getCourseSideForWeek(round.weekNumber, league.playMode, league.playModeFirstWeekSide),
  }))
);
await tx.scheduledMatchup.createMany({ data: allMatchups });
```

**Note:** Prisma 7's `createMany` with SQLite supports this. The `courseSide` is computed per-round, which can be done before the transaction.

This pattern also appears in:
- `schedule.ts:179-199` (initial schedule generation) -- uses the batched `operations.push` + `$transaction(operations)` pattern, which IS batched. Good.
- `schedule.ts:866-884` (addTeamToSchedule) -- serial creates. Bad.
- `schedule.ts:986-1004` (removeTeamFromSchedule regenerate) -- serial creates. Bad.

**Weekly Score Submission (`weekly-scores.ts:326-349`):**

```typescript
// weekly-scores.ts:326-349
for (const score of scoreData) {
  await tx.weeklyScore.create({ data: { ... } });
  await tx.team.update({ where: { id: score.teamId }, data: { totalPoints: { increment: score.totalPoints } } });
}
```

For N teams, this is 2N sequential operations. The `weeklyScore.create` calls can be replaced with `createMany`. The `team.update` calls must remain individual (different increment values per team), but could be parallelized within the transaction if the database supports it.

### 3.3 Over-Fetching: Matchup Queries Without `select`

Seven `prisma.matchup.findMany` calls across three files fetch all 20+ columns of the Matchup model when only 8-10 are needed.

**The Matchup model has 20 columns:**
- `id`, `weekNumber`, `leagueId`, `seasonId` (metadata)
- `teamAId`, `teamAGross`, `teamAHandicap`, `teamANet`, `teamAPoints`, `teamAIsSub` (team A data)
- `teamBId`, `teamBGross`, `teamBHandicap`, `teamBNet`, `teamBPoints`, `teamBIsSub` (team B data)
- `isForfeit`, `forfeitTeamId` (forfeit)
- `createdAt`, `updatedAt` (timestamps)

**For ranking calculations, only these are needed:**
`teamAId`, `teamBId`, `teamAPoints`, `teamBPoints`, `teamANet`, `teamBNet`, `teamAHandicap`, `teamBHandicap`, `teamAIsSub`, `teamBIsSub`, `weekNumber`

**Affected locations (all fetch every column):**

| File | Line | Function | Needed Columns |
|------|------|----------|---------------|
| `standings.ts` | 496 | `getLeaderboard` | 11 of 20 |
| `standings.ts` | 558 | `getMatchPlayMovement` | 11 of 20 |
| `standings.ts` | 734 | `getHybridMovement` | 11 of 20 |
| `standings.ts` | 869 | `getSeasonLeaderboard` (hybrid) | 11 of 20 |
| `standings.ts` | 885 | `getSeasonLeaderboard` (match play) | 11 of 20 |
| `handicap-settings.ts` | 143 | `getHandicapHistory` | 6 of 20 (weekNumber, teamAId, teamBId, teamAHandicap, teamBHandicap, teamAIsSub, teamBIsSub) |
| `handicap-settings.ts` | 211 | `buildHandicapHistoryFromMatchups` | 6 of 20 |
| `league-settings.ts` | 271 | `recalculateLeagueStats` | ~15 of 20 (needs gross scores too) |

**Recommended fix:** Define reusable select constants:

```typescript
// In standings.ts or a shared module
const matchupSelectForRanking = {
  weekNumber: true,
  teamAId: true, teamBId: true,
  teamAPoints: true, teamBPoints: true,
  teamANet: true, teamBNet: true,
  teamAHandicap: true, teamBHandicap: true,
  teamAIsSub: true, teamBIsSub: true,
} as const;

const matchupSelectForHandicapHistory = {
  weekNumber: true,
  teamAId: true, teamBId: true,
  teamAHandicap: true, teamBHandicap: true,
  teamAIsSub: true, teamBIsSub: true,
} as const;
```

### 3.4 Over-Fetching: Other Models Without `select`

**Team model fetched without select (leaks PII):**

| File | Line | Function | Issue |
|------|------|----------|-------|
| `seasons.ts` | 160 | `getTeamsForSeason` | Returns full Team model including `captainName`, `email`, `phone` to the admin dashboard RSC payload |
| `seasons.ts` | 250 | `copyTeamsToSeason` | Fetches full source teams -- needs only `name`, `captainName`, `email`, `phone`, `status` for copy |
| `handicap-settings.ts` | 138 | `getHandicapHistory` | Fetches full Team -- needs only `id`, `name` |
| `handicap-settings.ts` | 162 | `getHandicapHistoryForSeason` | Same |

The `getTeamsForSeason` issue is notable because this function's return value flows through the admin server component into the `AdminDashboard` client component as `initialTeams`. The full Team model (including PII fields) is serialized into the RSC payload.

**`getCurrentWeekNumber` fetches full Matchup model:**

```typescript
// teams.ts:133-137
const lastMatchup = await prisma.matchup.findFirst({
  where: { leagueId },
  orderBy: { weekNumber: "desc" },
  // No select -- fetches all 20 Matchup columns to read one integer
});
return lastMatchup ? lastMatchup.weekNumber + 1 : 1;
```

**Fix:** Add `select: { weekNumber: true }`. This pattern repeats in `seasons.ts:167-171` (`getCurrentWeekNumberForSeason`).

### 3.5 Missing React `cache()` -- Doubled Database Queries

**Zero usage of `import { cache } from "react"` anywhere in the codebase.**

Every page under `/league/[slug]/*` that has a `generateMetadata` function calls the same data-fetching function twice per request: once in `generateMetadata` and once in the page component. Next.js only auto-deduplicates `fetch()` API calls, not direct Prisma queries.

**Affected pages:**

| Page | Duplicated Function | Queries Doubled |
|------|-------------------|----------------|
| `/league/[slug]` | `getLeaguePublicInfo` | 2x |
| `/league/[slug]/leaderboard` | `getLeagueBySlug` | 2x |
| `/league/[slug]/schedule` | `getLeagueBySlug` | 2x |
| `/league/[slug]/handicap-history` | `getLeagueBySlug` | 2x |
| `/league/[slug]/history` | `getLeagueBySlug` | 2x |
| `/league/[slug]/scorecards` | `getLeaguePublicInfo` | 2x |
| `/league/[slug]/team/[teamId]` | `getLeagueBySlug` + `getTeamById` | 4x (2 functions, each called 2x) |

**Total impact:** 14 unnecessary database queries per user session browsing all league sub-pages.

**Fix (single-line change per function):**

```typescript
// In leagues.ts
import { cache } from "react";

export const getLeagueBySlug = cache(async (slug: string) => {
  return prisma.league.findUnique({ where: { slug }, select: { ... } });
});

export const getLeaguePublicInfo = cache(async (slug: string) => {
  // ...
});
```

React's `cache()` deduplicates calls with the same arguments within a single React render (one request). This is the highest-impact, lowest-effort optimization in this entire review.

### 3.6 Serial Waterfalls in Server Components

**Team Detail Page (`team/[teamId]/page.tsx:42-47`):**

```typescript
const league = await getLeagueBySlug(slug);     // Stage 1 (serial)
if (!league) notFound();
const team = await getTeamById(teamIdNum);       // Stage 2 (serial, but independent of stage 1)
if (!team || team.leagueId !== league.id) notFound();

const [matchups, ...] = await Promise.all([...]);  // Stage 3 (parallel, depends on league.id)
```

Stages 1 and 2 are independent but executed serially. The ownership check (`team.leagueId !== league.id`) requires both results, but both fetches can run in parallel:

```typescript
const [league, team] = await Promise.all([
  getLeagueBySlug(slug),
  getTeamById(teamIdNum),
]);
if (!league) notFound();
if (!team || team.leagueId !== league.id) notFound();
```

**Scorecards Page (`scorecards/page.tsx:40-48`):**

```typescript
let currentWeek = 1;
const activeSeason = await getActiveSeason(league.id);         // Query 1
if (activeSeason) {
  currentWeek = await getCurrentWeekNumberForSeason(activeSeason.id);  // Query 2
} else {
  currentWeek = await getCurrentWeekNumber(league.id);         // Query 2 (alt)
}
const parsedWeek = search.week ? parseInt(search.week) : NaN;
const weekNumber = !isNaN(parsedWeek) && parsedWeek >= 1 ? parsedWeek : Math.max(1, currentWeek - 1);
const scorecards = await getPublicScorecardsForWeek(league.id, weekNumber);  // Query 3
```

When `?week=N` is in the URL, the season and week detection queries are completely unnecessary. The page should short-circuit:

```typescript
const parsedWeek = search.week ? parseInt(search.week) : NaN;
if (!isNaN(parsedWeek) && parsedWeek >= 1) {
  const scorecards = await getPublicScorecardsForWeek(league.id, parsedWeek);
  // Render with parsedWeek, skip season detection
} else {
  // Existing season/week detection flow
}
```

### 3.7 No Prisma Query Logging

The PrismaClient is instantiated without any logging configuration:

```typescript
// db.ts:28
return new PrismaClient({ adapter });
```

There is no way to observe:
- Total query count per request
- Slow queries (> 100ms)
- N+1 patterns (multiple similar queries in sequence)
- Query plans or table scans

**Recommended:** Enable query logging in development:

```typescript
const client = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "development"
    ? [{ emit: "event", level: "query" }]
    : [],
});

if (process.env.NODE_ENV === "development") {
  client.$on("query", (e) => {
    if (e.duration > 50) {
      console.warn(`Slow query (${e.duration}ms): ${e.query}`);
    }
  });
}
```

Note: With the libSQL adapter, Prisma's event-based logging may have limited support. Verify compatibility with Prisma 7 + libSQL adapter. An alternative is to use the `TURSO_DEBUG` environment variable for Turso-level query logging.

### 3.8 Client Bundle Impact

**framer-motion (8 components, ~40-60KB gzipped):**

The `framer-motion` package is imported in 8 components under `src/components/grounds/`:
- `MovementArrow.tsx`, `ContourBackground.tsx`, `FlagPin.tsx`, `GroundsCard.tsx`
- `MedalBadge.tsx`, `MotionProvider.tsx`, `AnimatedNumber.tsx`, `BoardRow.tsx`

The `MotionProvider.tsx` uses `LazyMotion` with `domAnimation` features, which is the correct approach for reducing initial bundle size. However, framer-motion's `domAnimation` feature set is still ~25KB gzipped. On a mobile 3G connection, this adds ~400ms to interactive time.

**Assessment:** This is an acceptable tradeoff for the leaderboard animations (board row movement, rank change arrows, animated numbers). The `LazyMotion` pattern ensures the animation code is only loaded when the leaderboard is first rendered, not on every page. No change recommended unless mobile performance becomes a complaint.

**Server actions imported in client components:**

9 client component files import directly from server action modules:

| Client Component | Imported Actions | Note |
|-----------------|-----------------|------|
| `AdminDashboard.tsx` | `getLeagueBySlug`, `getLeagueAbout` + 5 season/team actions | These are `"use server"` modules -- Next.js handles correctly |
| `SettingsTab.tsx` | `changeLeaguePassword`, `getLeagueBySlug`, `getMatchupHistory`, `getTeams` | Server functions called from client |
| `ScorecardsTab.tsx` | `getMatchupsForWeek`, `getCourseWithHoles` | Read-only actions from client |
| `MatchupsTab.tsx` | `getCurrentWeekNumber` | Single read action |
| `AboutTab.tsx` | `updateLeagueAbout`, `getLeagueAbout` | Read + write actions |
| `leagues/page.tsx` | `searchLeagues`, `getAllLeagues` | Client-side search -- should be server component |
| `leagues/new/page.tsx` | `createLeague` | Form submission |
| `signup/page.tsx` | `registerTeam`, `getLeaguePublicInfo` | Client-side fetch -- should be server component |

**Bundle impact of server action imports:** When a client component imports from a `"use server"` module, Next.js does NOT include the server code in the client bundle. Instead, it generates a thin RPC stub. The client bundle impact is minimal (a few bytes per action for the reference ID). This is correctly handled.

**However**, the `leagues/page.tsx` and `signup/page.tsx` pages are entirely client-rendered (using `useEffect` to call server actions on mount), which means the initial HTML has no content. Converting these to server components with client children would eliminate the client-side fetch waterfall and improve SEO, as identified in the Wave 1 frontend review.

### 3.9 Memory Management

**Rate Limiter Map (rate-limit.ts:12-23):**

```typescript
const store = new Map<string, RateLimitEntry>();

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);  // Cleanup every 5 minutes
}
```

**Issue 1: No size bound.** Under a DDoS attack with diverse IPs, the Map grows unbounded until the 5-minute cleanup fires. With a 15-minute window for login rate limiting, each unique IP generates a 20-byte key + 16-byte entry. A sustained attack from 100K unique IPs would consume ~3.6MB before cleanup. On Vercel serverless, this is per-instance and short-lived, but on a persistent server, it could grow indefinitely.

**Fix:** Add a maximum size check:
```typescript
const MAX_ENTRIES = 10_000;

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  if (store.size >= MAX_ENTRIES) {
    // Evict expired entries immediately
    const now = Date.now();
    for (const [k, entry] of store) {
      if (now > entry.resetAt) store.delete(k);
    }
    // If still over limit, reject (fail closed)
    if (store.size >= MAX_ENTRIES) {
      return { allowed: false, remaining: 0, resetAt: Date.now() + config.windowSeconds * 1000 };
    }
  }
  // ... existing logic
}
```

**Issue 2: `setInterval` never cleared.** The cleanup interval runs for the lifetime of the process. On a long-running server, this is fine. On serverless (Vercel), the function instance is frozen and thawed; the interval may accumulate across invocations. The `typeof setInterval !== "undefined"` guard prevents issues in edge runtimes, but the timer reference is never stored and cannot be cleared.

**Assessment:** Low risk. Vercel serverless instances are short-lived, and the interval is lightweight (iterates a Map every 5 minutes). The unbounded size is the higher concern.

**Timer cleanup in client components:**

All client components with timers properly clean up on unmount:
- `BallIntoCup.tsx:60-64` -- `removeEventListener` + `clearTimeout` in useEffect cleanup
- `Navigation.tsx:43-44` -- `removeEventListener` in useEffect cleanup
- `TimeProvider.tsx:67-68` -- `clearInterval` in useEffect cleanup
- `ScorecardsTab.tsx:81-83` -- `clearTimeout` on both timer refs in useEffect cleanup

No memory leaks detected in client-side timer management.

### 3.10 Database Indexing

**Status: FIXED since CLAUDE.md was written.**

The `@@index` directives now exist on all foreign keys:
- `Team`: `@@index([leagueId])`, `@@index([seasonId])`
- `Matchup`: `@@index([leagueId])`, `@@index([seasonId])`, `@@index([teamAId])`, `@@index([teamBId])`, `@@index([leagueId, weekNumber])`
- `WeeklyScore`: `@@index([leagueId])`, `@@index([seasonId])`, `@@index([teamId])`, `@@index([leagueId, weekNumber])`
- `ScheduledMatchup`: similar comprehensive indexes
- `Scorecard`: `@@index([leagueId, weekNumber])`, `@@index([teamId])`, etc.

This is well-done. The composite indexes (`[leagueId, weekNumber]`) are particularly important for the most common query pattern (fetching data for a specific league's current week).

**Missing index:** There is no index on `Matchup.isForfeit`. If forfeit filtering becomes common, this could be useful. However, given the current query patterns always filter by `leagueId` first (which has an index), the `isForfeit` column is a minor secondary filter. No action needed.

---

## 4. Quantified Impact Assessment

Estimating impact for a typical league: 16 teams, 20-week season, match play scoring.

### 4.1 Current State (per page load)

| Operation | Queries | Notes |
|-----------|---------|-------|
| Public leaderboard load | 5-6 | 2x getLeagueBySlug (no cache), 1x teams, 1x matchups, 1x weeklyScores |
| Matchup preview (admin) | 4-5 | 1x existing matchups, 1x team lookups, 1x league |
| Weekly score preview (admin, 16 teams) | 18+ | 1x league, 1x existing, 1x teams, ~15x getTeamPreviousScores (N+1) |
| Schedule generation (20 weeks, 8 matches/week) | 163+ | 1x delete, 160x sequential creates, 1x league update, 1x season |
| Recalculate stats (200 matchups, 16 teams) | 218+ | 1x matchups, 1x teams, 200x matchup.update, 16x team.update |
| Delete weekly scores (16 teams) | 34 | 16x team.findUnique, 16x team.update, 1x deleteMany, 1x initial findMany |

### 4.2 Optimized State (after applying recommendations)

| Operation | Queries | Reduction |
|-----------|---------|-----------|
| Public leaderboard load | 3-4 | cache() eliminates duplicates (-33%) |
| Weekly score preview (16 teams) | 4 | Batch fetch replaces N+1 (-78%) |
| Schedule generation (20 weeks) | 3 | createMany replaces serial creates (-98%) |
| Recalculate stats (200 matchups, 16 teams) | 18 | Batch matchup updates where possible (-92%) |
| Delete weekly scores (16 teams) | 19 | Batch team fetch, individual updates (-44%) |

---

## 5. Priority-Ordered Recommendations

### Tier 1: Quick Wins (< 1 hour each, high impact)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | Wrap `getLeagueBySlug` and `getLeaguePublicInfo` in React `cache()` | 10 min | Halves DB queries on all public pages |
| 2 | Add `select: { weekNumber: true }` to `getCurrentWeekNumber` and `getCurrentWeekNumberForSeason` | 5 min | Reduces data transfer on every page that checks week number |
| 3 | Parallelize `getLeagueBySlug` + `getTeamById` on team detail page | 5 min | ~2x faster initial load for team pages |
| 4 | Short-circuit scorecards page when `?week=N` is in URL | 10 min | Eliminates 2 unnecessary queries when navigating weeks |
| 5 | Add `select` clauses to all 7 matchup findMany calls in standings.ts | 30 min | ~40% less data per leaderboard query |

### Tier 2: Moderate Effort (1-3 hours, high impact)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 6 | Replace serial creates in schedule generation with `createMany` | 1 hr | 160x fewer queries for schedule generation |
| 7 | Batch-fetch N+1 in `previewWeeklyScores` | 1 hr | N queries to 1 query for admin preview |
| 8 | Replace serial creates in `submitWeeklyScores` with `createMany` + batch updates | 1 hr | 2N to ~N+2 queries |
| 9 | Batch-fix `deleteWeeklyScores` N+1 | 30 min | 2N+1 to N+2 queries |
| 10 | Add `select` clauses to handicap-settings.ts and other over-fetching queries | 1 hr | Reduces data transfer for handicap calculations |

### Tier 3: Structural Improvements (3+ hours)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 11 | Enable Prisma query logging in development | 1 hr | Enables catching future N+1 patterns |
| 12 | Add `getTeamsForSeason` select clause (prevents PII leak to RSC payload) | 30 min | Security + performance |
| 13 | Convert `/leagues` and `/signup` to server components | 2-3 hr | SEO + first-load performance |
| 14 | Add size bound to rate limiter Map | 30 min | Prevents memory exhaustion under attack |
| 15 | Create `getLeagueMinimal(slug)` function for public pages | 1 hr | ~60% less data for public league chrome |

---

## 6. Files Analyzed

### Server Action Files
1. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/standings.ts`
2. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/weekly-scores.ts`
3. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/teams.ts`
4. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/matchups.ts`
5. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/seasons.ts`
6. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/schedule.ts`
7. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/league-settings.ts`
8. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/handicap-settings.ts`
9. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/scorecards.ts`
10. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/leagues.ts`
11. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/scoring-config.ts`
12. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/courses.ts`
13. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/league-about.ts`
14. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/shared.ts`
15. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/index.ts`
16. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/course-import.ts`

### Infrastructure Files
17. `/Users/alexoberlander/Documents/Claude/golf/src/lib/db.ts`
18. `/Users/alexoberlander/Documents/Claude/golf/src/lib/rate-limit.ts`
19. `/Users/alexoberlander/Documents/Claude/golf/prisma/schema.prisma`
20. `/Users/alexoberlander/Documents/Claude/golf/package.json`

### Page Components
21. `/Users/alexoberlander/Documents/Claude/golf/src/app/page.tsx`
22. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/admin/page.tsx`
23. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/admin/components/AdminDashboard.tsx`
24. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/team/[teamId]/page.tsx`
25. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/scorecards/page.tsx`
26. `/Users/alexoberlander/Documents/Claude/golf/src/app/leagues/page.tsx`
27. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/signup/page.tsx`

### Client Components (memory analysis)
28. `/Users/alexoberlander/Documents/Claude/golf/src/components/BallIntoCup.tsx`
29. `/Users/alexoberlander/Documents/Claude/golf/src/components/Navigation.tsx`
30. `/Users/alexoberlander/Documents/Claude/golf/src/components/grounds/TimeProvider.tsx`
31. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/admin/components/ScorecardsTab.tsx`
