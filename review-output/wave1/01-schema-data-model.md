# Schema & Data Model Review -- LeagueLinks

**Reviewer:** Senior Staff Engineer (Automated Review)
**Date:** 2026-02-11
**Files Reviewed:**
- `/Users/alexoberlander/Documents/Claude/golf/prisma/schema.prisma`
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/db.ts`

---

## 1. Executive Summary

The schema is functional for a small-scale single-tenant golf league app but carries significant structural debt that will compound as the product grows. The most pressing issues are:

1. **The `League` model is a god object** with 60+ columns, mixing authentication credentials, handicap configuration (20 fields), scoring configuration (12 fields), scheduling configuration (10 fields), play mode settings, about-page content, and platform billing metadata into a single table. Every query that touches `League` -- and almost every query in the app does -- pays the cost of this wide row.

2. **Matchup and Team have no cascading delete relationship**, meaning the app relies entirely on application-layer transaction logic to prevent orphaned matchups when teams are removed. The `Matchup.teamA` and `Matchup.teamB` relations have no `onDelete` directive at all, which in Prisma defaults to the database engine's behavior (error on SQLite, error on Turso).

3. **Denormalized stats on `Team`** (`totalPoints`, `wins`, `losses`, `ties`) are manually incremented in transactions, but multiple code paths exist that modify matchups without recalculating these aggregates, creating drift risk.

4. **String-encoded enums everywhere** -- team status, league status, scoring type, schedule type, schedule visibility, and a dozen more fields use plain `String` with no database-level constraint. Any typo in application code silently corrupts data.

5. **JSON stored in String columns** (`strokePlayPointScale`, `hybridFieldPointScale`) without any database-level validation, requiring manual `JSON.parse` with error handling at every read site.

Overall the schema works for the current scale (single leagues, small teams, SQLite). It will not survive horizontal scaling, multi-tenancy, or even a moderate growth in concurrent leagues without remediation.

---

## 2. Findings Table

| # | Severity | Location | Description | Recommendation |
|---|----------|----------|-------------|----------------|
| F01 | RED CRITICAL | `League` model (lines 22-149) | God object with 60+ columns mixing 7+ concerns | Extract `HandicapConfig`, `ScoringConfig`, `ScheduleConfig`, `PlayModeConfig`, `LeagueAbout` into separate 1:1 models |
| F02 | RED CRITICAL | `Matchup.teamA`, `Matchup.teamB` (lines 239, 248) | No `onDelete` specified -- default behavior varies by engine and Prisma version; can leave orphaned matchups or block league deletion | Add explicit `onDelete: Restrict` (preferred) or `onDelete: Cascade` with careful consideration |
| F03 | RED CRITICAL | `Scorecard.course`, `Scorecard.team`, `Scorecard.season` (lines 380-384) | No `onDelete` specified on three foreign key relations | Add explicit `onDelete` directives; `Restrict` for course/team, `SetNull` for season |
| F04 | RED CRITICAL | `HoleScore.hole` (line 418) | No `onDelete` specified -- if a Hole is deleted (via Course cascade), HoleScores become orphaned or block deletion | Add `onDelete: Cascade` to match the Scorecard->HoleScore cascade chain |
| F05 | YELLOW HIGH | `Team` model (lines 202-205) | Denormalized `totalPoints`, `wins`, `losses`, `ties` manually incremented; no DB triggers or materialized view to maintain consistency | Document invariants; add a periodic reconciliation job; consider computing on read for correctness |
| F06 | YELLOW HIGH | `Matchup` model (line 235) | `seasonId` is nullable (`Int?`) but every matchup should logically belong to a season. Allows orphaned matchups with no season context | Make `seasonId` required (`Int`) with a migration to backfill existing data |
| F07 | YELLOW HIGH | `Team.seasonId` (line 190) | Nullable FK means teams can exist outside any season, creating ambiguous ownership | Make required or add CHECK constraint; migrate existing data |
| F08 | YELLOW HIGH | All string enum fields | ~15 fields use `String` for enum-like values (`status`, `scoringType`, `handicapRounding`, `scheduleType`, etc.) with no DB constraint | Use Prisma `enum` types or add `@check` constraints when available; add Zod validation on every write path as a stopgap |
| F09 | YELLOW HIGH | `League.strokePlayPointScale`, `League.hybridFieldPointScale` (lines 80, 92) | JSON data stored as `String?` -- no schema validation, requires manual parse/serialize | Extract to a `PointScale` model or use JSON column type when migrating away from SQLite |
| F10 | YELLOW HIGH | `Season.isActive` (line 159) | Boolean flag for "which season is active" allows multiple active seasons per league; no DB-level uniqueness constraint | Add a partial unique index or use a `League.activeSeasonId` FK instead |
| F11 | GREEN MEDIUM | `Matchup` unique constraint (line 269) | `@@unique([leagueId, weekNumber, teamAId, teamBId])` is asymmetric -- Team A vs Team B and Team B vs Team A are different records | Add application-level normalization (always put lower ID first) or add a second unique constraint on reversed pair |
| F12 | GREEN MEDIUM | `SuperAdmin.id`, all models | Using `Int @id @default(autoincrement())` exposes sequential IDs in URLs and APIs; predictable enumeration attack surface | Consider UUIDs or CUIDs for user-facing identifiers; keep autoincrement for internal FKs if needed |
| F13 | GREEN MEDIUM | `League.adminUsername`, `League.adminPassword` (lines 28-29) | Auth credentials stored directly on the domain model; should be a separate `LeagueAdmin` model to support multiple admins | Extract to `LeagueAdmin` model with `leagueId` FK and support for multiple admins per league |
| F14 | GREEN MEDIUM | `Scorecard.accessToken` (line 397) | JWT tokens stored in the database with no index for lookup (only `@unique` which implies an index, but no expiry cleanup mechanism) | Add a scheduled cleanup for expired tokens; consider short-lived tokens that don't need DB storage |
| F15 | GREEN MEDIUM | `Course` model (lines 339-358) | No unique constraint on `(leagueId, name)` -- allows duplicate course names within a league | Add `@@unique([leagueId, name])` or `@@unique([leagueId, name, teeColor])` |
| F16 | GREEN MEDIUM | `Matchup.seasonId`, `ScheduledMatchup.seasonId` (lines 234, 309) | `onDelete` not specified for `Matchup.season` relation -- defaults to engine behavior | Add explicit `onDelete: SetNull` to match the `WeeklyScore.season` pattern |
| F17 | GREEN MEDIUM | `Team.season` relation (line 191) | No `onDelete` specified -- if a Season is deleted, teams referencing it will error or orphan | Add `onDelete: SetNull` or `onDelete: Restrict` |
| F18 | WHITE LOW | `Hole.handicapIndex` (line 367) | Name collision with JavaScript's built-in concept; confusing for developers | Rename to `difficultyRanking` or `strokeIndex` |
| F19 | WHITE LOW | `db.ts` adapter pattern (line 23) | LibSQL adapter is always instantiated even for local SQLite dev, adding unnecessary dependency | Conditionally use adapter only when Turso env vars are present |
| F20 | WHITE LOW | No `@@map` or `@@tableName` annotations | Table names default to PascalCase model names; non-standard for SQL conventions | Add `@@map("leagues")`, `@@map("teams")`, etc. for snake_case table names |

---

## 3. Detailed Analysis

### F01 -- RED CRITICAL: League God Object

**Location:** `prisma/schema.prisma` lines 22-149

The `League` model has approximately 65 columns spanning these distinct responsibilities:

| Concern | Column Count | Lines |
|---------|-------------|-------|
| Identity (name, slug) | 2 | 24-25 |
| Auth credentials | 2 | 28-29 |
| Registration settings | 2 | 32-33 |
| Handicap configuration | 20 | 40-72 |
| Scoring configuration | 12 | 77-88 |
| Hybrid scoring | 2 | 91-92 |
| Schedule configuration | 10 | 97-106 |
| Play mode | 2 | 111-112 |
| About/metadata | 12 | 115-126 |
| Platform/billing | 4 | 129-132 |
| Scorecard config | 2 | 138-139 |
| Timestamps | 2 | 134-135 |

**Why this matters:**

1. **Every single query that loads a League** -- and nearly every action in the app starts with `prisma.league.findUniqueOrThrow` -- fetches a row with 65+ columns. Even with `select` clauses, Prisma still parses the full row at the adapter level on SQLite.

2. **Migrations are risky.** Adding a column to a 65-column SQLite table requires rewriting the entire table (SQLite's `ALTER TABLE` limitations). The wider the table, the more expensive and dangerous this becomes.

3. **Configuration changes require updating the League row,** which means every admin settings save contends with every other write to League (matchup submissions that check `scoringType`, registration that checks `maxTeams`, etc.).

**Recommended extraction:**

```prisma
model League {
  id            Int      @id @default(autoincrement())
  name          String   @unique
  slug          String   @unique
  maxTeams      Int      @default(16)
  registrationOpen Boolean @default(true)
  status        String   @default("active")
  subscriptionTier String @default("free")
  billingEmail  String?
  expiresAt     DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // 1:1 relations
  auth              LeagueAuth?
  handicapConfig    HandicapConfig?
  scoringConfig     ScoringConfig?
  scheduleConfig    ScheduleConfig?
  scorecardConfig   ScorecardConfig?
  about             LeagueAbout?

  // 1:many relations
  teams             Team[]
  matchups          Matchup[]
  seasons           Season[]
  // ... etc
}

model HandicapConfig {
  id        Int    @id @default(autoincrement())
  leagueId  Int    @unique
  league    League @relation(fields: [leagueId], references: [id], onDelete: Cascade)

  baseScore         Float   @default(35)
  multiplier        Float   @default(0.9)
  rounding          String  @default("floor")
  defaultValue      Float   @default(0)
  max               Float?  @default(9)
  min               Float?
  scoreSelection    String  @default("all")
  scoreCount        Int?
  bestOf            Int?
  lastOf            Int?
  dropHighest       Int     @default(0)
  dropLowest        Int     @default(0)
  useWeighting      Boolean @default(false)
  weightRecent      Float   @default(1.5)
  weightDecay       Float   @default(0.9)
  capExceptional    Boolean @default(false)
  exceptionalCap    Float?
  provWeeks         Int     @default(0)
  provMultiplier    Float   @default(1.0)
  freezeWeek        Int?
  useTrend          Boolean @default(false)
  trendWeight       Float   @default(0.1)
  requireApproval   Boolean @default(false)
}
```

This pattern gives you:
- Targeted queries: Load only the config you need
- Independent migrations: Add handicap fields without touching the League table
- Clear ownership: Each config module has a single responsibility
- Cache-friendly: Config tables are read-heavy, small, and rarely change

---

### F02 -- RED CRITICAL: Missing `onDelete` on Matchup Team Relations

**Location:** `prisma/schema.prisma` lines 239, 248

```prisma
teamA  Team @relation("TeamA", fields: [teamAId], references: [id])
teamB  Team @relation("TeamB", fields: [teamBId], references: [id])
```

Neither relation specifies `onDelete`. In Prisma 7 with SQLite, this defaults to the database engine's FK behavior, which is typically `RESTRICT` (block deletion). However:

1. The behavior is **implicit and engine-dependent** -- if the project ever migrates to Postgres or MySQL, the default may differ.
2. The application code in `deleteTeam()` (teams.ts:514) manually checks for matchups and refuses to delete if any exist, but this is a **race condition** -- between the count check and the transaction, another process could create a matchup.
3. The `League` has `onDelete: Cascade` to `Matchup`, but if the League is deleted, the cascade deletes Matchups first, then tries to delete Teams. If Team->Matchup has no cascade, this works because Matchups are already gone. But if another code path tries to delete a Team directly while Matchups exist, it silently fails or errors depending on the FK enforcement state.

**Recommendation:** Add explicit `onDelete: Restrict` to both relations and document that teams with matchups cannot be deleted (which matches the current application logic):

```prisma
teamA  Team @relation("TeamA", fields: [teamAId], references: [id], onDelete: Restrict)
teamB  Team @relation("TeamB", fields: [teamBId], references: [id], onDelete: Restrict)
```

---

### F03 -- RED CRITICAL: Missing `onDelete` on Scorecard Relations

**Location:** `prisma/schema.prisma` lines 380-384

```prisma
course  Course  @relation(fields: [courseId], references: [id])           // no onDelete
team    Team    @relation(fields: [teamId], references: [id])             // no onDelete
season  Season? @relation(fields: [seasonId], references: [id])           // no onDelete
```

Three FK relations on `Scorecard` have no `onDelete` directive:

- **`course`**: If a Course is deleted (which cascades from League deletion), Scorecards referencing that course will either block the deletion or become orphaned. Since `Course.isActive` exists as a soft-delete mechanism, `onDelete: Restrict` is appropriate -- prevent deletion of courses with scorecards.
- **`team`**: Same issue as Matchup. The `deleteTeam` transaction manually cleans up scorecards, but without `onDelete: Restrict`, there's no database-level safety net.
- **`season`**: Should be `onDelete: SetNull` to match the pattern used in `WeeklyScore.season`.

**Recommendation:**
```prisma
course  Course  @relation(fields: [courseId], references: [id], onDelete: Restrict)
team    Team    @relation(fields: [teamId], references: [id], onDelete: Restrict)
season  Season? @relation(fields: [seasonId], references: [id], onDelete: SetNull)
```

---

### F04 -- RED CRITICAL: Missing `onDelete` on HoleScore.hole

**Location:** `prisma/schema.prisma` line 418

```prisma
hole  Hole @relation(fields: [holeId], references: [id])  // no onDelete
```

The cascade chain is: `League -> Course (Cascade) -> Hole (Cascade) -> HoleScore (???)`. When a League is deleted, Courses cascade, Holes cascade from Courses, but HoleScores have no cascade directive from Holes. This means:

1. Deleting a League will cascade to Courses, cascade to Holes, then **block** on HoleScores (because the implicit default is Restrict on SQLite).
2. The parallel cascade chain `League -> Scorecard (Cascade) -> HoleScore (Cascade)` might or might not fire first, depending on execution order.

This is a ticking time bomb. If the Scorecard cascade runs first, the HoleScores are gone and the Hole cascade succeeds. If the Hole cascade runs first, it fails.

**Recommendation:**
```prisma
hole  Hole @relation(fields: [holeId], references: [id], onDelete: Cascade)
```

---

### F05 -- YELLOW HIGH: Denormalized Stats on Team

**Location:** `prisma/schema.prisma` lines 202-205

```prisma
totalPoints Float @default(0)
wins        Int   @default(0)
losses      Int   @default(0)
ties        Int   @default(0)
```

These fields are incremented inside `submitMatchup` transactions and decremented inside `deleteMatchup` transactions. However:

1. **`deleteWeeklyScores`** (weekly-scores.ts:447-471) modifies `totalPoints` on Teams but does not adjust `wins`/`losses`/`ties` -- if the deleted weekly scores were associated with matchups, the win/loss counts drift.
2. **Points overrides** in the admin UI can change `teamAPoints`/`teamBPoints` on a Matchup without updating `Team.totalPoints`.
3. The `recalculateLeagueStats()` function exists as a reconciliation tool, but it's never called automatically -- it requires manual admin intervention.

**Risk:** Over a season with many matchup edits and score corrections, these counters will drift. Leagues with 100+ matchups will accumulate errors that are invisible until someone checks standings against raw data.

**Recommendation:** Either:
- (A) **Compute on read:** Replace stored aggregates with a derived query (a `VIEW` or computed field). This is correct by construction but costs a query per standings load.
- (B) **Event-sourced reconciliation:** Run `recalculateLeagueStats()` after every mutation that touches matchups, weekly scores, or points. Use a database trigger if possible.
- (C) **Keep denormalized but add guardrails:** Add a nightly reconciliation job and an admin warning when computed and stored values diverge.

---

### F06 -- YELLOW HIGH: Nullable `seasonId` on Matchup

**Location:** `prisma/schema.prisma` line 234

```prisma
seasonId  Int?
season    Season?  @relation(fields: [seasonId], references: [id])
```

Every matchup logically belongs to a season. The nullable FK exists because the season feature was added after initial development. But in current code, `submitMatchup` always looks up the active season and associates it:

```typescript
const activeSeason = await prisma.season.findFirst({
  where: { leagueId: session.leagueId, isActive: true },
});
```

Allowing null means:
- Old matchups from before the season feature exist without season context
- Queries that filter by `seasonId` silently exclude these matchups
- Standings calculations must handle both `{ seasonId }` and `{ leagueId }` query variants

**Recommendation:** Create a migration to backfill `seasonId` for all existing matchups (assign them to a "Legacy" season), then make the column required.

---

### F07 -- YELLOW HIGH: Nullable `seasonId` on Team

**Location:** `prisma/schema.prisma` line 190

Same pattern as F06. Teams should belong to exactly one season. The nullable FK creates ambiguity about which teams are "current" and forces every query to filter by both `leagueId` and `seasonId` separately.

---

### F08 -- YELLOW HIGH: String Enums Without Constraints

**Location:** Throughout the schema

The following fields use `String` for enumerated values with no database-level constraint:

| Field | Valid Values | Model |
|-------|-------------|-------|
| `status` | "pending", "approved", "rejected" | Team |
| `status` | "active", "suspended", "cancelled" | League |
| `status` | "scheduled", "completed", "cancelled" | ScheduledMatchup |
| `status` | "in_progress", "completed", "approved", "rejected" | Scorecard |
| `scoringType` | "match_play", "stroke_play", "hybrid" | League, Season |
| `handicapRounding` | "floor", "round", "ceil" | League |
| `handicapScoreSelection` | "all", "last_n", "best_of_last" | League |
| `scheduleType` | "single_round_robin", "double_round_robin", "custom" | League |
| `scheduleVisibility` | "full", "current_week", "hidden" | League |
| `byePointsMode` | "zero", "flat", "league_average", "team_average" | League |
| `playMode` | "full_18", "nine_hole_alternating", "nine_hole_front", "nine_hole_back" | League |
| `scorecardMode` | "disabled", "optional", "required" | League |
| `dataSource` | "manual", "golfcourseapi" | Course |

SQLite does not support `CHECK` constraints enforced by Prisma, and Prisma's `enum` type only works with Postgres. This means the only enforcement is at the application layer.

**Recommendation:** Until you migrate to Postgres:
1. Define Zod enum schemas for each field and use them in every server action
2. Add a `validateLeagueEnums()` utility that can be called in tests
3. Document all valid values in the schema with comments (partially done)

---

### F09 -- YELLOW HIGH: JSON in String Columns

**Location:** `prisma/schema.prisma` lines 80, 92

```prisma
strokePlayPointScale  String?  // JSON array e.g. "[10,8,6,5,4,3,2,1]"
hybridFieldPointScale String?  // JSON point scale for field component
```

Every read of these fields requires `JSON.parse` with error handling:

```typescript
// From weekly-scores.ts:189-193
if (league.strokePlayPointScale) {
  try {
    pointScale = JSON.parse(league.strokePlayPointScale) as number[];
  } catch {
    logger.error("Failed to parse strokePlayPointScale", error);
  }
}
```

This pattern:
- Has no schema validation on write (any string can be stored)
- Requires defensive parsing on every read
- Cannot be queried or indexed by the database
- Fails silently if the stored JSON is malformed

**Recommendation:** Extract to a `PointScaleEntry` model:

```prisma
model PointScaleEntry {
  id        Int    @id @default(autoincrement())
  leagueId  Int
  league    League @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  scaleType String // "stroke_play" | "hybrid_field"
  position  Int    // 1st place, 2nd place, etc.
  points    Float

  @@unique([leagueId, scaleType, position])
  @@index([leagueId])
}
```

Or, if you migrate to Postgres, use a native `Json` column type.

---

### F10 -- YELLOW HIGH: `Season.isActive` Boolean Allows Multiple Active Seasons

**Location:** `prisma/schema.prisma` line 159

```prisma
isActive  Boolean @default(true)
```

The application code in `createSeason` (seasons.ts:51-65) deactivates all other seasons in a transaction before activating the new one:

```typescript
await prisma.$transaction([
  prisma.season.updateMany({
    where: { leagueId: session.leagueId },
    data: { isActive: false },
  }),
  prisma.season.update({
    where: { id: newSeason.id },
    data: { isActive: true },
  }),
]);
```

But there is no database-level constraint preventing two seasons from being active simultaneously. A race condition between two admin sessions or a failed transaction rollback could leave multiple active seasons, which would cause matchups to be associated with the wrong season.

**Recommendation:** Replace `isActive` with `League.activeSeasonId`:

```prisma
model League {
  activeSeasonId Int? @unique
  activeSeason   Season? @relation("ActiveSeason", fields: [activeSeasonId], references: [id])
}
```

This guarantees at most one active season per league at the database level.

---

### F11 -- GREEN MEDIUM: Asymmetric Matchup Unique Constraint

**Location:** `prisma/schema.prisma` line 269

```prisma
@@unique([leagueId, weekNumber, teamAId, teamBId])
```

This constraint allows both `(league=1, week=1, teamA=1, teamB=2)` AND `(league=1, week=1, teamA=2, teamB=1)` to exist. In a golf league, Team A vs Team B is the same matchup as Team B vs Team A.

The application code checks for this with an `OR` clause:
```typescript
const existingMatchups = await prisma.matchup.findMany({
  where: {
    leagueId, weekNumber,
    OR: [
      { teamAId: teamAId },
      { teamBId: teamAId },
      { teamAId: teamBId },
      { teamBId: teamBId },
    ],
  },
});
```

But this is application-level enforcement only. A direct database insert could bypass it.

**Recommendation:** Normalize by convention: always store the lower team ID as `teamAId`. Add a comment in the schema and a validation function used by all write paths.

---

### F12 -- GREEN MEDIUM: Sequential Integer IDs

**Location:** All models use `Int @id @default(autoincrement())`

Sequential IDs:
- Expose entity counts (team ID 47 means there are roughly 47 teams)
- Enable enumeration attacks (try IDs 1, 2, 3, ...)
- Leak information in URLs (`/league/1/team/5`)

For a golf league app this is low severity today, but if multi-tenancy or a public API is ever added, this becomes a real security concern.

**Recommendation:** Add a `publicId` field (CUID or ULID) for external-facing identifiers. Keep `autoincrement()` for internal FKs for join performance.

---

### F13 -- GREEN MEDIUM: Auth Credentials on League Model

**Location:** `prisma/schema.prisma` lines 28-29

```prisma
adminUsername String
adminPassword String  // bcrypt hashed
```

Storing credentials directly on the domain model:
- Limits to exactly one admin per league
- Requires `select` clause omissions on every League query to avoid leaking the hash
- Mixes authentication concerns with domain data

**Recommendation:** Extract to a `LeagueAdmin` model:

```prisma
model LeagueAdmin {
  id        Int    @id @default(autoincrement())
  leagueId  Int
  league    League @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  username  String
  password  String // bcrypt hashed
  role      String @default("admin") // "admin" | "scorer" | "viewer"
  createdAt DateTime @default(now())

  @@unique([leagueId, username])
  @@index([leagueId])
}
```

This enables multiple admins per league (co-commissioner pattern common in golf leagues) and eliminates the password leak risk entirely.

---

### F14 -- GREEN MEDIUM: Scorecard Access Tokens in Database

**Location:** `prisma/schema.prisma` lines 397-398

```prisma
accessToken    String?   @unique
tokenExpiresAt DateTime?
```

Tokens are created with a 48-hour expiry (scorecards.ts:385-386) but there's no cleanup mechanism for expired tokens. Over time, the unique index on `accessToken` will accumulate dead entries.

**Recommendation:** Add a scheduled cleanup job or use stateless JWTs that don't require database storage (the token can encode the scorecard ID and expiry, verified with the server's signing key).

---

### F15 -- GREEN MEDIUM: No Unique Constraint on Course Name per League

**Location:** `prisma/schema.prisma` lines 339-358

A league can have multiple courses with identical names, which would confuse users and make lookups ambiguous. The `Course.findFirst` queries in scorecards.ts rely on `{ leagueId, isActive: true }` which returns an arbitrary result when multiple active courses exist.

**Recommendation:**
```prisma
@@unique([leagueId, name, teeColor])
```

---

### F16 -- GREEN MEDIUM: Missing `onDelete` on Matchup.season

**Location:** `prisma/schema.prisma` line 235

```prisma
season  Season?  @relation(fields: [seasonId], references: [id])
```

The `WeeklyScore.season` relation has `onDelete: SetNull` but the `Matchup.season` relation has no directive. These should be consistent.

---

### F17 -- GREEN MEDIUM: Missing `onDelete` on Team.season

**Location:** `prisma/schema.prisma` line 191

```prisma
season  Season?  @relation(fields: [seasonId], references: [id])
```

No `onDelete` directive. If a Season is deleted, teams referencing it will either block the delete or be orphaned depending on the database engine.

---

### F18 -- WHITE LOW: Confusing `handicapIndex` Name

**Location:** `prisma/schema.prisma` line 367

```prisma
handicapIndex  Int  // 1-18 difficulty ranking (1 = hardest)
```

In golf, "handicap index" typically refers to a player's handicap. The hole-level concept is usually called "stroke index" or "difficulty ranking." This naming could confuse developers working on the handicap calculation engine.

---

### F19 -- WHITE LOW: LibSQL Adapter Always Instantiated

**Location:** `src/lib/db.ts` lines 23-28

```typescript
const adapter = new PrismaLibSql({
  url: dbUrl,
  authToken: useTurso ? tursoToken : undefined,
});
return new PrismaClient({ adapter });
```

Even in local development with plain SQLite, the LibSQL adapter is used. This adds an unnecessary dependency layer. In development, you could use a plain `PrismaClient()` without an adapter for simpler debugging.

---

### F20 -- WHITE LOW: PascalCase Table Names

Default Prisma behavior creates tables named `League`, `Team`, `Matchup`, etc. SQL convention is `snake_case` (`leagues`, `teams`, `matchups`). This is cosmetic but affects raw SQL queries, database administration, and migration scripts.

---

## 4. Annotated Schema Suggestions for Critical Issues

### Minimal Fix: Add Missing `onDelete` Directives

This is the highest-priority change because it prevents data corruption and cascade failures:

```prisma
model Matchup {
  // ... existing fields ...

  // FIX F02: Add explicit onDelete
  teamA  Team @relation("TeamA", fields: [teamAId], references: [id], onDelete: Restrict)
  teamB  Team @relation("TeamB", fields: [teamBId], references: [id], onDelete: Restrict)

  // FIX F16: Add explicit onDelete for season
  season Season? @relation(fields: [seasonId], references: [id], onDelete: SetNull)
}

model Team {
  // FIX F17: Add explicit onDelete for season
  season Season? @relation(fields: [seasonId], references: [id], onDelete: SetNull)
}

model Scorecard {
  // FIX F03: Add explicit onDelete for all relations
  course  Course  @relation(fields: [courseId], references: [id], onDelete: Restrict)
  team    Team    @relation(fields: [teamId], references: [id], onDelete: Restrict)
  season  Season? @relation(fields: [seasonId], references: [id], onDelete: SetNull)
}

model HoleScore {
  // FIX F04: Add cascade from Hole deletion
  hole Hole @relation(fields: [holeId], references: [id], onDelete: Cascade)
}
```

### Medium-Term: Extract God Object

See F01 for the full extraction pattern. The migration path:

1. Create new config tables with `1:1` relations to League
2. Write a data migration script that copies columns from League to the new tables
3. Update all server actions to load config from the new tables
4. Drop the columns from League in a subsequent migration

**Migration safety note:** Because SQLite does not support `DROP COLUMN` (before 3.35.0) or concurrent schema changes, this migration must be done in a maintenance window. Turso (libSQL) does support `DROP COLUMN`, so verify your Turso version before running.

---

## 5. Scalability Assessment

| Scenario | Current Behavior | At 100x Scale | At 1000x Scale |
|----------|-----------------|---------------|-----------------|
| **Leagues** (currently ~10) | Fine | 1000 leagues: `findMany` with no pagination is problematic | 10,000 leagues: Need cursor pagination, search indexes |
| **Teams per league** (~16) | Fine | 1600 teams: OK with current indexes | 16,000 teams: Need composite indexes on (leagueId, seasonId, status) |
| **Matchups per league** (~100) | Fine | 10,000 matchups: The `OR` queries for team matchup history become expensive | 100,000 matchups: Need partial indexes, query restructuring |
| **WeeklyScores** (~200) | Fine | 20,000: OK with current indexes | 200,000: Aggregate queries (standings) become slow; need materialized views or caching |
| **Scorecards + HoleScores** (~100 + ~900) | Fine | 10K + 90K: OK with indexes | 100K + 900K: HoleScore table becomes large; need partitioning or archival |
| **Concurrent writes** | Single-writer SQLite | Turso WAL helps but still limited | Need Postgres or similar for true concurrent writes |

**Key bottleneck:** SQLite/Turso is a single-writer database. At 100+ concurrent leagues submitting matchups, write contention will become the primary bottleneck. The schema design is not the issue here -- the database engine is.

---

## 6. Summary of Recommended Actions

### Immediate (before next deployment)
1. Add all missing `onDelete` directives (F02, F03, F04, F16, F17)
2. Test League deletion end-to-end to verify cascade chain works

### Short-term (next sprint)
3. Extract `HandicapConfig` from League (F01 -- start with the largest group)
4. Make `seasonId` required on Matchup and Team (F06, F07)
5. Add `onDelete: SetNull` for Matchup.season (F16)
6. Add `@@unique([leagueId, name, teeColor])` on Course (F15)

### Medium-term (next quarter)
7. Extract remaining config groups from League (F01)
8. Extract auth to `LeagueAdmin` model (F13)
9. Replace JSON string columns with proper models (F09)
10. Replace `isActive` boolean with `League.activeSeasonId` (F10)
11. Add Zod enum validation on all string-enum write paths (F08)

### Long-term (when scaling)
12. Migrate to Postgres for concurrent writes and native enum/JSON support
13. Add CUID `publicId` fields for external-facing identifiers (F12)
14. Implement materialized standings or cached aggregates (F05)
15. Add table name mappings for SQL conventions (F20)
