# Code Review: Matchups, Standings, Teams, Weekly Scores & Leagues

**Reviewer:** Senior Staff Engineer (Claude Opus 4.6)
**Date:** 2026-02-11
**Scope:** `src/lib/actions/matchups.ts`, `standings.ts`, `teams.ts`, `weekly-scores.ts`, `leagues.ts`
**Severity Scale:** CRITICAL | HIGH | MEDIUM | LOW

---

## 1. Executive Summary

The codebase has undergone significant improvement since the original CLAUDE.md was written. **Two of the three known bugs have been fixed.** The `submitMatchup` transaction bug is fully resolved -- all multi-table mutations now use `$transaction`. The points override `""` as `number` bug is also fixed via proper `typeof` guards in the client component. However, the **head-to-head tiebreaker sort direction bug persists in 3 locations** and will rank teams incorrectly when tied on points and wins.

Beyond the known bugs, this review surfaces several new issues: an N+1 query pattern in `previewWeeklyScores`, over-fetching in standings queries, a subtle race condition in `deleteTeam`, and inconsistent validation depth across related modules.

**Overall assessment:** The code quality is above average for a production Next.js app. Transaction safety is now solid. The primary risk areas are the tiebreaker logic bug (affecting visible standings) and the N+1 query pattern (affecting admin latency at scale).

---

## 2. Known Bug Status

### Bug 1: `submitMatchup` has no transaction -- FIXED

**Status: FIXED**

The `submitMatchup` function (matchups.ts:259-338) now wraps the matchup creation and both team stat increments in a `prisma.$transaction()`. The duplicate check is also performed inside the transaction (line 261-275), which prevents TOCTOU race conditions from concurrent submissions. The `deleteMatchup` function (lines 421-463) similarly uses a transaction for stat reversal with zero-clamping. The `submitForfeit` function (lines 497-572) also uses a transaction. All three mutation paths are properly guarded.

### Bug 2: Head-to-head tiebreaker sorts backwards -- STILL PRESENT

**Status: STILL PRESENT -- 3 locations**

The CLAUDE.md states `bVsA - aVsB` should be `aVsB - bVsA`. Let me clarify the actual semantics:

In `standings.ts`, the `headToHead` record stores how many points team X earned against team Y. So `aVsB` = points team A earned vs team B, and `bVsA` = points team B earned vs team A. In a descending sort (higher is better), a team with more h2h points should rank higher. The comparator `return aVsB - bVsA` returns **negative** when A has fewer h2h points than B, which sorts **A before B** (i.e., ranks A higher). This is **backwards** -- A should rank lower when A has fewer h2h points.

The correct comparator for "higher h2h points ranks higher" (descending sort) is: `return bVsA - aVsB`.

Wait -- let me re-examine. The `sort()` comparator convention: negative means `a` comes first. Since this is a descending sort (highest points first), if `a` should rank higher (come first), we want negative when `a > b`. For h2h: if `aVsB > bVsA` (A earned more points against B than B earned against A), then A should rank higher (come first), so we want negative. `bVsA - aVsB` would be negative when `aVsB > bVsA`. So `bVsA - aVsB` is correct.

But the current code uses `aVsB - bVsA`, which returns negative when `aVsB < bVsA` -- that means A ranks higher when A has *fewer* h2h points against B. **This is indeed backwards.**

The fix should be: `return bVsA - aVsB` (i.e., flip the operands).

**Affected locations:**
1. `standings.ts:113` -- `rankTeams()` (match play)
2. `standings.ts:314` -- `rankTeamsHybrid()` sort (hybrid)
3. `standings.ts:403` -- `calculateStandingsAtWeek()` (movement tracking)

### Bug 3: Points override passes `""` as number -- FIXED

**Status: FIXED**

The MatchupsTab component (MatchupsTab.tsx:212,218) now uses `typeof teamAPointsOverride === "number" ? teamAPointsOverride : preview.teamAPoints`. This correctly handles the `number | ""` union type by falling back to the preview value when the override is empty string. The server-side `submitMatchupSchema` (matchups.ts:168-182) also validates with `z.number()` which would reject a string.

---

## 3. Findings Table

| # | Severity | File:Line | Description | Recommendation |
|---|----------|-----------|-------------|----------------|
| 1 | CRITICAL | standings.ts:113,314,403 | H2H tiebreaker sorts backwards (known bug, still present) | Change `aVsB - bVsA` to `bVsA - aVsB` in all 3 locations |
| 2 | HIGH | weekly-scores.ts:140-164 | N+1 query: `getTeamPreviousScoresForScoring` called per team in a loop | Batch-fetch all previous scores in one query, then distribute |
| 3 | HIGH | standings.ts:496-500 | `getLeaderboard` fetches all matchup columns (no `select`) | Add `select` clause to fetch only columns used by `rankTeams()` |
| 4 | HIGH | standings.ts:558,734,869,885 | Multiple standings queries fetch full matchup rows without `select` | Add targeted `select` clauses |
| 5 | MEDIUM | teams.ts:470-543 | `deleteTeam` calls `removeTeamFromSchedule` outside of main transaction | Wrap schedule removal + team deletion in a single transaction, or at least make the sequence idempotent |
| 6 | MEDIUM | matchups.ts:54-91 | `previewMatchup` duplicate check outside transaction (preview vs submit) | Acceptable for preview (not a mutation), but note the TOCTOU between preview and submit is handled by the submit transaction |
| 7 | MEDIUM | standings.ts:79-125 | `rankTeams` builds handicaps, netDifferential, and headToHead maps with O(teams * matchups) complexity | Acceptable for small leagues; add comment noting scaling limit |
| 8 | MEDIUM | teams.ts:340-341 | `approveTeam` fetches entire league with `findUniqueOrThrow` (no select) | Add `select: { maxTeams: true }` |
| 9 | MEDIUM | teams.ts:332-333 | `approveTeam` fetches entire team with `findUniqueOrThrow` (no select) | Add `select: { leagueId: true }` |
| 10 | MEDIUM | weekly-scores.ts:326-349 | `submitWeeklyScores` creates scores serially inside transaction | Use `createMany` for bulk insert performance |
| 11 | MEDIUM | matchups.ts:250-256 | Points sum validation is only for `match_play`; stroke_play/hybrid have no points constraint | Document that this is intentional, or add appropriate constraints |
| 12 | LOW | standings.ts:191-202 | `compareCountingMethod` spreads all keys to find max -- edge case: empty maps produce `Math.max(0)` = 0, loop doesn't execute, returns 0 | Correct behavior but fragile; add defensive comment |
| 13 | LOW | matchups.ts:209-212 | `activeSeason` may be null, stored as `seasonId: null` in matchup | This is intentional (legacy leagues without seasons), but should log a warning |
| 14 | LOW | teams.ts:81-96 | `getTeamPreviousScores` fetches full matchup rows, only uses gross scores | Add `select` clause |
| 15 | LOW | standings.ts:625 | `getLeaderboardWithMovement` for match play uses `team.totalPoints` from Team model (denormalized) instead of computing from matchups | Potential drift if stats get out of sync; standings movement uses computed stats correctly |
| 16 | LOW | leagues.ts:171-192 | `searchLeagues` does case-sensitive `contains` on SQLite | Use mode: 'insensitive' or note SQLite limitation |
| 17 | LOW | matchups.ts:352-368 | `getMatchupHistory` returns team stats (`totalPoints`, `wins`, etc.) from related Team model -- potential info leak in public endpoint | Consider removing team stats from history response |
| 18 | LOW | weekly-scores.ts:366-386 | `getWeeklyScoreHistory` has no pagination/limit | Add limit parameter like `getMatchupHistory` |

---

## 4. Detailed Analysis

### 4.1 Transaction Safety (CRITICAL -> resolved, except deleteTeam)

All primary mutation paths now use transactions:

- **submitMatchup** (matchups.ts:259-338): Transaction wraps create + two team updates + scheduled matchup link. Duplicate check inside transaction prevents TOCTOU.
- **deleteMatchup** (matchups.ts:421-463): Transaction wraps scheduled matchup revert + stat reversal (with zero-clamping) + delete.
- **submitForfeit** (matchups.ts:497-572): Full transaction coverage.
- **submitWeeklyScores** (weekly-scores.ts:318-350): Transaction wraps duplicate check + creates + team point increments.
- **deleteWeeklyScores** (weekly-scores.ts:456-473): Transaction wraps stat reversal + delete.

**Remaining gap:** `deleteTeam` (teams.ts:470-543) calls `removeTeamFromSchedule` (via dynamic import, line 509-510) *before* the main transaction that deletes related records and the team. If the schedule removal succeeds but the subsequent transaction fails, the schedule is modified but the team still exists, leaving the system in an inconsistent state. This is mitigated by the fact that the schedule operation is unlikely to fail independently, but it is not atomic.

### 4.2 Head-to-Head Tiebreaker Bug (CRITICAL)

This is the most impactful remaining bug because it affects the **public-facing leaderboard** -- the most visible feature of the app.

**Root cause analysis:**

The `buildHeadToHead` function correctly accumulates points: `h2h[teamA.id][teamB.id]` = total points teamA earned in matchups against teamB.

In the sort comparator, `aVsB` = points A earned against B, `bVsA` = points B earned against A.

For descending sort (higher is better), we want the team with MORE h2h points to sort first (return negative for "a comes first"). If A beat B (aVsB > bVsA), A should come first, so we need a negative value. The expression `bVsA - aVsB` produces a negative when `aVsB > bVsA`. So the correct expression is `bVsA - aVsB`.

The current code uses `aVsB - bVsA`, which is the opposite -- it ranks the team with FEWER h2h points higher. This is a consistent error in all three sort functions.

**Impact:** Any two teams tied on total points and wins, where one team has a better head-to-head record, will be ranked in reverse order. In a match-play league where close standings are common, this directly affects playoff seeding and final standings.

### 4.3 N+1 Query in previewWeeklyScores (HIGH)

In `weekly-scores.ts:140-164`, the preview function iterates over all team inputs and calls `getTeamPreviousScoresForScoring()` individually for each team that isn't week-one and doesn't have a manual handicap. Each call executes a separate Prisma query.

For a league with 20 teams, this generates 20 sequential database queries during a single preview operation. The admin user experiences this as latency every time they preview weekly scores.

**Fix:** Batch-fetch all previous scores for all relevant teams in a single query, then distribute them in-memory.

### 4.4 Over-Fetching in Standings Queries (HIGH)

Multiple functions in `standings.ts` fetch matchup records without `select` clauses:

- Line 496-498: `getLeaderboard` -- fetches all matchup columns
- Line 558-559: `getMatchPlayMovement` -- fetches all matchup columns
- Line 734: `getHybridMovement` -- fetches all matchup columns
- Line 869: `getSeasonLeaderboard` (hybrid branch) -- fetches all matchup columns
- Line 885: `getSeasonLeaderboard` (match play branch) -- fetches all matchup columns

The `MatchupForRanking` type only needs: `teamAId`, `teamBId`, `teamAPoints`, `teamBPoints`, `teamANet`, `teamBNet`, `teamAHandicap`, `teamBHandicap`, `teamAIsSub`, `teamBIsSub`. The full `Matchup` model also includes `id`, `leagueId`, `seasonId`, `teamAGross`, `teamBGross`, `playedAt`, `isForfeit`, `forfeitTeamId`, `createdAt`, `updatedAt`.

For a league with hundreds of matchups, fetching unnecessary columns adds measurable overhead, especially with SQLite over the wire (Turso).

### 4.5 Denormalized Stats Drift Risk (MEDIUM)

The `Team` model stores `totalPoints`, `wins`, `losses`, `ties` as denormalized aggregates. These are incremented/decremented during matchup operations. The standings module has two modes:

1. **Match play `getLeaderboardWithMovement`** (line 625): Uses `team.totalPoints` from the Team model for the returned `totalPoints` field. This relies on denormalized data.
2. **Standings computation** (`calculateStandingsAtWeek`, `rankTeams`): Computes stats from matchup records directly, independent of Team model.

This creates a subtle inconsistency: the leaderboard shows denormalized `totalPoints` from the Team model, but the ranking order is determined by computed stats from matchups. If they drift (e.g., due to a partial failure in a pre-transaction era matchup), the displayed points could be inconsistent with the ranking.

The `recalculateLeagueStats` function (in `league-settings.ts`) exists as a reconciliation tool but must be manually triggered.

### 4.6 Input Validation Coverage

**Well-validated:**
- `submitMatchup`: Full Zod schema (matchups.ts:168-182) with range constraints
- `submitForfeit`: Zod schema with refinement (matchups.ts:472-478)
- `registerTeam`: Zod schema with regex for phone (teams.ts:163-168)
- `createLeague`: Zod schema (leagues.ts:56-60)
- `submitWeeklyScores`: Zod schema (weekly-scores.ts:64-79)

**Under-validated:**
- `previewMatchup` (matchups.ts:36-166): No Zod schema; relies on TypeScript types. Since this is a read-only preview, the risk is lower, but malformed inputs could cause unexpected behavior.
- `previewWeeklyScores` (weekly-scores.ts:83-263): No Zod validation on the `inputs` array. The `WeeklyScoreInput` interface is TypeScript-only. Malformed gross scores (negative, NaN) could propagate into preview results.
- `deleteMatchup` (matchups.ts:392): `matchupId` is not validated as positive integer -- a negative or zero ID would just fail the `findUniqueOrThrow`.
- `searchLeagues` (leagues.ts:171-192): `query` is trimmed but not sanitized beyond length check. Since Prisma parameterizes queries, SQL injection is not a risk, but excessively long strings before the trim are accepted.

### 4.7 Error Handling Quality

Error handling is generally good:
- All server actions wrap in try/catch and return `ActionResult` discriminated unions
- Zod errors are caught and return the first issue's message
- Prisma errors (P2002 unique constraint) are caught in `createLeague`
- Logger is used consistently

**One gap:** `deleteMatchup` (matchups.ts:466-469) catches all errors and returns a generic message, losing the specific error. If the matchup doesn't belong to the league (line 402-404), the early return provides a specific error, but Prisma `findUniqueOrThrow` failures in the transaction get swallowed into a generic message.

### 4.8 Performance: Standings Computation Complexity

The `getLeaderboardWithMovement` function for match play computes standings twice (current week and previous week), each of which:
1. Filters all matchups by week
2. Iterates all matchups to build stats records
3. Builds head-to-head matrix (O(matchups))
4. Sorts teams (O(n log n) with O(matchups) per comparison in worst case due to h2h lookup)

For hybrid mode, it's computed three times (current ranked, previous ranked, and the main ranked list).

With the typical league size (8-20 teams, 100-300 matchups), this is fine. At scale (100+ teams, 1000+ matchups), the h2h matrix construction and repeated full-matchup scans would become a bottleneck. This is an acceptable tradeoff for now but should be noted for future optimization.

---

## 5. Refactored Code for Critical Issues

### Fix 1: Head-to-Head Tiebreaker (3 locations)

**File: `src/lib/actions/standings.ts`**

**Location 1: `rankTeams()` at line 113**
```typescript
// BEFORE (WRONG):
if (aVsB !== bVsA) return aVsB - bVsA;

// AFTER (CORRECT):
if (aVsB !== bVsA) return bVsA - aVsB;
```

**Location 2: `rankTeamsHybrid()` sort at line 314**
```typescript
// BEFORE (WRONG):
if (aVsB !== bVsA) return aVsB - bVsA;

// AFTER (CORRECT):
if (aVsB !== bVsA) return bVsA - aVsB;
```

**Location 3: `calculateStandingsAtWeek()` at line 403**
```typescript
// BEFORE (WRONG):
if (aVsB !== bVsA) return aVsB - bVsA;

// AFTER (CORRECT):
if (aVsB !== bVsA) return bVsA - aVsB;
```

**Rationale:** In a descending sort, `sort((a, b) => ...)` places `a` first when the comparator returns negative. If team A has more head-to-head points against B (`aVsB > bVsA`), A should rank higher (come first), so we need a negative result. `bVsA - aVsB` is negative when `aVsB > bVsA`.

### Fix 2: N+1 Query in previewWeeklyScores

**File: `src/lib/actions/weekly-scores.ts`, lines 129-184**

```typescript
// BEFORE: N+1 sequential queries inside the loop
for (const input of inputs) {
  // ...
  if (/* needs calculated handicap */) {
    const prevScores = await getTeamPreviousScoresForScoring(leagueId, input.teamId, league.scoringType);
    handicap = calculateHandicap(prevScores, handicapSettings, weekNumber);
  }
}

// AFTER: Batch-fetch all previous scores, then distribute
const teamIdsNeedingHandicap = inputs
  .filter(i => !i.isDnp && !isWeekOne && !(i.isSub && i.manualHandicap != null) && i.manualHandicap == null)
  .map(i => i.teamId);

// Single batch query for all teams
const previousScoresMap = new Map<number, number[]>();
if (teamIdsNeedingHandicap.length > 0) {
  if (league.scoringType === "match_play") {
    const allMatchups = await prisma.matchup.findMany({
      where: {
        leagueId,
        OR: teamIdsNeedingHandicap.flatMap(id => [
          { teamAId: id },
          { teamBId: id },
        ]),
      },
      orderBy: { weekNumber: "asc" },
      select: { teamAId: true, teamBId: true, teamAGross: true, teamBGross: true, teamAIsSub: true, teamBIsSub: true },
    });

    for (const teamId of teamIdsNeedingHandicap) {
      const scores = allMatchups
        .filter(m => {
          if (m.teamAId === teamId) return !m.teamAIsSub;
          if (m.teamBId === teamId) return !m.teamBIsSub;
          return false;
        })
        .map(m => m.teamAId === teamId ? m.teamAGross : m.teamBGross);
      previousScoresMap.set(teamId, scores);
    }
  } else {
    // stroke_play / hybrid
    const allScores = await prisma.weeklyScore.findMany({
      where: {
        leagueId,
        teamId: { in: teamIdsNeedingHandicap },
        isDnp: false,
        isSub: false,
      },
      orderBy: { weekNumber: "asc" },
      select: { teamId: true, grossScore: true },
    });

    for (const teamId of teamIdsNeedingHandicap) {
      previousScoresMap.set(
        teamId,
        allScores.filter(s => s.teamId === teamId).map(s => s.grossScore)
      );
    }
  }
}

// Now iterate without additional queries
for (const input of inputs) {
  // ...
  if (/* needs calculated handicap */) {
    const prevScores = previousScoresMap.get(input.teamId) ?? [];
    handicap = calculateHandicap(prevScores, handicapSettings, weekNumber);
  }
}
```

This reduces N+1 queries to a single batch query regardless of team count.

### Fix 3: Add select clauses to standings matchup queries

**File: `src/lib/actions/standings.ts`**

```typescript
// Define a reusable select for ranking-relevant matchup fields
const matchupSelectForRanking = {
  teamAId: true,
  teamBId: true,
  teamAPoints: true,
  teamBPoints: true,
  teamANet: true,
  teamBNet: true,
  teamAHandicap: true,
  teamBHandicap: true,
  teamAIsSub: true,
  teamBIsSub: true,
  weekNumber: true,
} as const;

// Then use it in all standings queries:
const matchups = await prisma.matchup.findMany({
  where: { leagueId },
  select: matchupSelectForRanking,
});
```

---

## 6. Summary of Required Actions

### Must Fix (Before Next Release)
1. **H2H tiebreaker bug** -- 3-line fix across `standings.ts`, directly impacts visible standings
2. **N+1 in previewWeeklyScores** -- admin latency scales linearly with team count

### Should Fix (Next Sprint)
3. **Over-fetching in standings** -- add `select` clauses to all matchup queries
4. **deleteTeam atomicity** -- wrap schedule removal and team deletion together
5. **approveTeam over-fetching** -- add `select` to team and league fetches

### Nice to Have (Backlog)
6. **Pagination for weekly score history** -- no limit on `getWeeklyScoreHistory`
7. **Zod validation for preview functions** -- `previewMatchup`, `previewWeeklyScores`
8. **Batch create in submitWeeklyScores** -- use `createMany` instead of serial loop
9. **Case-insensitive league search** -- SQLite limitation with `contains`
