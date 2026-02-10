# 05 — Data Integrity & Schema Fixes

Based on cross-cutting concerns identified across all four review domains.

**Files in scope:**
- `prisma/schema.prisma`
- Various query sites in `src/lib/actions/*.ts`
- Various query sites in `src/app/api/**`

---

## Priority 1: Critical

### 1.1 Cascade policy inconsistencies will cause delete failures
**File:** `prisma/schema.prisma`
**Problem:** `League` → `Team` is `Cascade`, but `Team` → `WeeklyScore` is `Restrict` and `Team` → `ScheduledMatchup` (both `teamA` and `teamB`) is `Restrict`. Deleting a league cascades to delete teams, but those team deletes are blocked by `Restrict` on downstream relations. This makes league deletion fail unpredictably depending on whether the league has weekly scores or scheduled matchups.

Similarly, `Team` → `Scorecard` may have cascade issues depending on whether `HoleScore` has `Cascade` from `Scorecard`.

**Fix:** Audit every relation in the schema and decide on a consistent policy:

| Parent | Child | Current | Recommended | Reason |
|--------|-------|---------|-------------|--------|
| League → Team | Cascade | **Keep** | Teams belong to a league |
| League → Season | Cascade | **Keep** | Seasons belong to a league |
| League → Matchup | Cascade | **Keep** | Matchups belong to a league |
| League → Course | Cascade | **Keep** | Courses belong to a league |
| League → WeeklyScore | Cascade | **Keep** | Scores belong to a league |
| League → ScheduledMatchup | Cascade | **Keep** | Schedule belongs to a league |
| Team → WeeklyScore | **Restrict** | **SetNull** | Don't orphan scores, but don't block team deletion |
| Team → ScheduledMatchup (teamA) | **Restrict** | **SetNull** | Don't orphan matchups, but don't block team deletion |
| Team → ScheduledMatchup (teamB) | **Restrict** | **SetNull** | Same |
| Team → Matchup (teamA) | Cascade | **SetNull** | Preserve matchup history even if team is deleted |
| Team → Matchup (teamB) | Cascade | **SetNull** | Same |
| Team → Scorecard | Restrict | **SetNull** | Preserve scorecard data |
| Season → Matchup | SetNull | **Keep** | Matchups can exist without a season |
| Scorecard → HoleScore | Cascade | **Keep** | Hole scores are meaningless without scorecard |
| Course → Hole | Cascade | **Keep** | Holes are meaningless without course |

**Note:** Changing `Restrict` to `SetNull` requires the foreign key columns to be nullable. Check schema and adjust accordingly. Some of these columns may already be nullable (e.g., `seasonId` on Matchup).

**Migration required:** Yes — change `onDelete` policies and potentially add nullable FK columns.

---

## Priority 2: High

### 2.1 No database indexes on foreign keys
**File:** `prisma/schema.prisma`
**Problem:** Documented in CLAUDE.md: "No database indexes exist on foreign keys." Every query that filters by `leagueId`, `seasonId`, `teamAId`, `teamBId`, `teamId`, or `courseId` does a full table scan on SQLite.
**Fix:** Add `@@index` declarations to all models with foreign keys:

```prisma
model Team {
  // ... existing fields ...
  @@index([leagueId])
  @@index([seasonId])
}

model Matchup {
  // ... existing fields ...
  @@index([leagueId])
  @@index([seasonId])
  @@index([teamAId])
  @@index([teamBId])
  @@index([leagueId, weekNumber])
}

model WeeklyScore {
  // ... existing fields ...
  @@index([leagueId])
  @@index([seasonId])
  @@index([teamId])
  @@index([leagueId, weekNumber])
}

model ScheduledMatchup {
  // ... existing fields ...
  @@index([leagueId])
  @@index([seasonId])
  @@index([teamAId])
  @@index([teamBId])
  @@index([leagueId, weekNumber])
}

model Scorecard {
  // ... existing fields ...
  @@index([leagueId])
  @@index([teamId])
  @@index([courseId])
  @@index([matchupId])
  @@index([leagueId, weekNumber])
}

model HoleScore {
  // ... existing fields ...
  @@index([scorecardId])
}

model Season {
  // ... existing fields ...
  @@index([leagueId])
}

model Course {
  // ... existing fields ...
  @@index([leagueId])
}

model Hole {
  // ... existing fields ...
  @@index([courseId])
}
```

**Note:** Check if some of these already exist from `prisma/migrations/20260210152545_add_performance_indexes/`. If so, skip duplicates.

**Migration required:** Yes.

### 2.2 PII leaked via full model fetches in leaderboard/standings
**File:** `src/lib/actions/standings.ts:476-478, 514-516, 829-831, 877-879`
**Problem:** `prisma.team.findMany` with no `select` clause returns `email`, `phone`, `captainName`. These are public-facing leaderboard functions.
**Fix:** Add `select` clauses that include only display-safe fields:
```typescript
const safeTeamSelect = {
  id: true,
  name: true,
  totalPoints: true,
  wins: true,
  losses: true,
  ties: true,
  averageScore: true,
  netDifferential: true,
  status: true,
} as const;
```
Use this in all leaderboard/standings queries. Also applies to:
- `seasons.ts:127` (full season object)
- `matchups.ts:64` (full team objects via include)
- `schedule.ts:380-382, 410-412, 441-443` (full scheduled matchup objects)
- `teams.ts:287` (full team objects in getTeams)

### 2.3 `Team.totalPoints`, `wins`, `losses`, `ties` drift from reality
**File:** `prisma/schema.prisma` (Team model), `src/lib/actions/matchups.ts`, `src/lib/actions/weekly-scores.ts`
**Problem:** Documented in CLAUDE.md: "denormalized aggregates that are manually incremented. They can drift from reality." Every matchup submission increments. Every deletion decrements. Every scoring recalculation resets. Race conditions, failed transactions, and partial updates can cause drift.
**Fix:** Two approaches:

**Option A (recommended short-term):** Add a `recalculateTeamStats` function that recomputes from source-of-truth (matchup records) and run it:
- After every matchup deletion
- After every weekly score deletion
- As a daily cron job
- As a manual admin action

This already partially exists as `recalculateLeagueStats` in `league-settings.ts`. Verify it covers all aggregate fields and is called in all the right places.

**Option B (long-term):** Remove denormalized fields entirely. Compute standings on-the-fly from matchup/score records. Add database-level views or materialized views. This is a larger architectural change.

---

## Priority 3: Medium

### 3.1 `League` model is a god object
**File:** `prisma/schema.prisma`
**Problem:** Documented in CLAUDE.md: "40+ columns. The 20+ handicap config fields should be extracted to a separate `HandicapConfig` model."
**Fix:** This is a significant refactor. Create:
```prisma
model HandicapConfig {
  id                    Int     @id @default(autoincrement())
  leagueId              Int     @unique
  league                League  @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  baseScore             Int     @default(36)
  multiplier            Float   @default(0.8)
  rounding              String  @default("round")
  defaultHandicap       Int     @default(0)
  maxHandicap           Int?    @default(9)
  minHandicap           Int?    @default(0)
  scoreSelection        String  @default("all")
  dropWorst             Int     @default(0)
  dropBest              Int     @default(0)
  lastOf                Int?
  bestOf                Int?
  freezeWeek            Int?
  requireApproval       Boolean @default(false)
  provisionalRounds     Int     @default(0)
  provisionalMultiplier Float   @default(1.0)
  trendWeight           Float   @default(0)
  @@index([leagueId])
}
```
Then remove the 20+ `handicap*` columns from `League`. Update `leagueToHandicapSettings` to read from the relation. Update all queries that read handicap config.

**This is a large migration.** Consider doing it in a future dedicated PR, not as part of the bug-fix effort.

### 3.2 No `createdAt`/`updatedAt` on several models
**File:** `prisma/schema.prisma`
**Problem:** Some models lack audit timestamps. Without `updatedAt`, you cannot tell when a record was last modified.
**Fix:** Audit all models. Add `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt` to any models missing them. This is a non-breaking schema change.

### 3.3 Scorecard `accessToken` should be hashed
**File:** `prisma/schema.prisma` (Scorecard model), `src/lib/actions/scorecards.ts`
**Problem:** Bearer token stored as plaintext in DB (covered in `02-server-actions.md` item 2.10).
**Fix:** This is the schema side of that fix. The `accessToken` column should store a SHA-256 hash. Add a comment in the schema: `// SHA-256 hash of the JWT access token — never store tokens in plaintext`.

### 3.4 `WeeklyScore` missing `bonusPoints` column
**File:** `prisma/schema.prisma`, `src/lib/actions/weekly-scores.ts:300`
**Problem:** `submitWeeklyScores` stores `totalPoints = score.points + score.bonusPoints` in the `points` column. The original breakdown between base points and bonus points is lost. This makes it impossible to audit or recalculate bonuses later.
**Fix:** Add a `bonusPoints Int @default(0)` column to `WeeklyScore`. Store base points in `points` and bonus in `bonusPoints`. Update queries that read total points to sum both.

### 3.5 No unique constraint on (leagueId, weekNumber, teamId) for WeeklyScore
**File:** `prisma/schema.prisma`
**Problem:** The duplicate check in `submitWeeklyScores` is a TOCTOU race (covered in `02-server-actions.md` item 3.5). A database-level unique constraint would prevent duplicates regardless of application-level race conditions.
**Fix:** Add `@@unique([leagueId, weekNumber, teamId])` to the `WeeklyScore` model. Handle the unique constraint error in the catch block of `submitWeeklyScores`.

---

## Execution Order

1. **2.1** (indexes — pure additive, no risk, immediate performance benefit)
2. **2.2** (PII select clauses — security-adjacent, do early)
3. **1.1** (cascade policies — requires careful analysis, test thoroughly)
4. **3.5** (unique constraint — prevents data corruption, low risk)
5. **3.3** (token hashing — coordinate with `02-server-actions.md` item 2.10)
6. **3.4** (bonusPoints column — additive, backward compatible)
7. **3.2** (timestamps — additive, no risk)
8. **2.3** (aggregate drift — verify existing reconciliation, add missing call sites)
9. **3.1** (HandicapConfig extraction — large refactor, do as a separate PR)

**Migration batch:** Items 2.1, 1.1, 3.4, 3.5, and 3.2 can be bundled into a single migration if done together. Item 3.1 should be its own migration due to scope.

**Coordinate with `03-sudo-subsystem.md`:** That document also requires schema changes (`AuditLog`, `deletedAt`, `passwordVersion`). All schema changes should be planned as a single migration to minimize churn.
