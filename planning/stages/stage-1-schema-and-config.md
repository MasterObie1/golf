# Stage 1: Combined Schema Migration & Configuration Foundation

**Features:** F1 Phase 1 + F2 Phase 1
**Estimated scope:** Schema migration, 2 new server action files, settings UI additions, league creation UI update
**Prerequisites:** None — this is the starting point

---

## What This Stage Accomplishes

After this stage:
- The database has all new models and fields for both features
- Admin can select scoring type (match play / stroke play / hybrid) at league creation
- Admin can configure stroke play point settings and schedule settings in the Settings tab
- All existing leagues default to match_play and continue working unchanged
- The round-robin algorithm exists as a pure function library (no UI yet)

---

## Task 1: Prisma Schema Changes

**File:** `prisma/schema.prisma`

### 1a. Add scoring & schedule fields to League model

Add these fields to the `League` model, after the `handicapRequireApproval` field (line 72) and before the "About the League" comment (line 74):

```prisma
  // ============================================
  // SCORING CONFIGURATION
  // ============================================
  scoringType             String    @default("match_play") // "match_play" | "stroke_play" | "hybrid"

  // Stroke play settings
  strokePlayPointScale    String?   // JSON array e.g. "[10,8,6,5,4,3,2,1]" — null = use preset
  strokePlayPointPreset   String    @default("linear") // "linear" | "weighted" | "pga_style" | "custom"
  strokePlayBonusShow     Float     @default(0)       // Bonus points for showing up (0 = disabled)
  strokePlayBonusBeat     Float     @default(0)       // Bonus for beating handicap (0 = disabled)
  strokePlayDnpPoints     Float     @default(0)       // Points for "did not play" weeks
  strokePlayTieMode       String    @default("split") // "split" | "same"
  strokePlayDnpPenalty    Float     @default(0)       // Penalty for no-shows (0 = disabled)
  strokePlayMaxDnp        Int?                        // Max DNPs before excluded (null = unlimited)
  strokePlayProRate       Boolean   @default(false)   // Use points-per-round for standings

  // Hybrid mode settings
  hybridFieldWeight       Float     @default(0.5)     // Weight of field points (0-1)
  hybridFieldPointScale   String?                     // JSON point scale for field component

  // ============================================
  // SCHEDULE CONFIGURATION
  // ============================================
  scheduleType            String?                     // "single_round_robin" | "double_round_robin" | "custom" | null
  scheduleVisibility      String    @default("full")  // "full" | "current_week" | "hidden"
  byePointsMode           String    @default("flat")  // "zero" | "flat" | "league_average" | "team_average"
  byePointsFlat           Float     @default(10)      // Flat bye points amount
  scheduleExtraWeeks      String    @default("flex")  // "flex" | "continue_round"
  midSeasonAddDefault     String    @default("start_from_here") // "start_from_here" | "fill_byes" | "pro_rate" | "catch_up"
  midSeasonRemoveAction   String    @default("bye_opponents") // "bye_opponents" | "regenerate"
  playoffWeeks            Int       @default(0)       // Weeks reserved for playoffs (0 = disabled)
  playoffTeams            Int       @default(4)       // Teams qualifying for playoffs
  playoffFormat           String    @default("single_elimination") // "single_elimination" | "double_elimination" | "round_robin"
```

### 1b. Add new League relations

Add to the League relations block (after line 100, alongside existing relations):

```prisma
  weeklyScores      WeeklyScore[]
  scheduledMatchups ScheduledMatchup[]
```

### 1c. Add new Season relations

Add to the Season relations block (after line 122):

```prisma
  weeklyScores      WeeklyScore[]
  scheduledMatchups ScheduledMatchup[]
```

### 1d. Add new Team relations

Add to the Team relations block (after line 159):

```prisma
  weeklyScores      WeeklyScore[]
  scheduledAsTeamA  ScheduledMatchup[] @relation("ScheduledTeamA")
  scheduledAsTeamB  ScheduledMatchup[] @relation("ScheduledTeamB")
```

### 1e. Add back-link on Matchup

Add to the Matchup model (after line 203, before `createdAt`):

```prisma
  scheduledMatchup  ScheduledMatchup?
```

### 1f. Create WeeklyScore model

Add after the Matchup model (after line 212):

```prisma
model WeeklyScore {
  id          Int       @id @default(autoincrement())
  weekNumber  Int
  leagueId    Int
  seasonId    Int?
  teamId      Int
  grossScore  Int
  handicap    Float
  netScore    Float
  points      Float     // Points awarded based on weekly finish position
  position    Int       // Finish position for this week (1st, 2nd, etc.)
  isSub       Boolean   @default(false)
  isDnp       Boolean   @default(false) // Did Not Play
  playedAt    DateTime  @default(now())
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  league  League   @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  season  Season?  @relation(fields: [seasonId], references: [id], onDelete: SetNull)
  team    Team     @relation(fields: [teamId], references: [id], onDelete: Restrict)

  @@unique([leagueId, weekNumber, teamId])
  @@index([leagueId])
  @@index([seasonId])
  @@index([teamId])
  @@index([leagueId, weekNumber])
}
```

### 1g. Create ScheduledMatchup model

Add after the WeeklyScore model:

```prisma
model ScheduledMatchup {
  id          Int       @id @default(autoincrement())
  leagueId    Int
  seasonId    Int?
  weekNumber  Int
  teamAId     Int
  teamBId     Int?      // Null = bye week for teamA
  status      String    @default("scheduled") // "scheduled" | "completed" | "cancelled"
  matchupId   Int?      @unique // Links to actual Matchup when completed
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  league  League   @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  season  Season?  @relation(fields: [seasonId], references: [id], onDelete: SetNull)
  teamA   Team     @relation("ScheduledTeamA", fields: [teamAId], references: [id], onDelete: Restrict)
  teamB   Team?    @relation("ScheduledTeamB", fields: [teamBId], references: [id], onDelete: Restrict)
  matchup Matchup? @relation(fields: [matchupId], references: [id], onDelete: SetNull)

  @@unique([leagueId, weekNumber, teamAId])
  @@index([leagueId])
  @@index([seasonId])
  @@index([leagueId, weekNumber])
  @@index([matchupId])
}
```

### 1h. Run migration

```bash
npx prisma migrate dev --name add_scoring_types_and_scheduling
```

Verify with `npx prisma generate` that the client compiles.

---

## Task 2: Create Scoring Config Server Actions

**New file:** `src/lib/actions/scoring-config.ts`

```typescript
"use server";

import { z } from "zod";
import { prisma } from "../db";
import { requireLeagueAdmin } from "../auth";
import { type ActionResult } from "./shared";

// --- Types ---

export interface ScoringConfig {
  scoringType: string;
  strokePlayPointScale: number[] | null;
  strokePlayPointPreset: string;
  strokePlayBonusShow: number;
  strokePlayBonusBeat: number;
  strokePlayDnpPoints: number;
  strokePlayTieMode: string;
  strokePlayDnpPenalty: number;
  strokePlayMaxDnp: number | null;
  strokePlayProRate: boolean;
  hybridFieldWeight: number;
  hybridFieldPointScale: number[] | null;
}

export interface ScheduleConfig {
  scheduleType: string | null;
  scheduleVisibility: string;
  byePointsMode: string;
  byePointsFlat: number;
  scheduleExtraWeeks: string;
  midSeasonAddDefault: string;
  midSeasonRemoveAction: string;
  playoffWeeks: number;
  playoffTeams: number;
  playoffFormat: string;
}

// --- Point Scale Presets ---

export function generatePointScale(preset: string, teamCount: number): number[] {
  switch (preset) {
    case "weighted": {
      // Top-heavy: 1st gets big reward, drops off fast
      const base = [15, 12, 10, 8, 6, 5, 4, 3, 2, 1];
      return base.slice(0, teamCount);
    }
    case "pga_style": {
      // PGA-inspired: large gaps at top
      const base = [25, 20, 16, 13, 10, 8, 6, 4, 3, 2, 1];
      return base.slice(0, teamCount);
    }
    case "linear":
    default: {
      // Linear: 1st = N, 2nd = N-1, ..., last = 1
      return Array.from({ length: teamCount }, (_, i) => teamCount - i);
    }
  }
}

export function getPointScalePresets() {
  return [
    { id: "linear", name: "Linear", description: "Equal gaps between positions (8, 7, 6, 5...)" },
    { id: "weighted", name: "Weighted", description: "Rewards top finishes more (15, 12, 10, 8...)" },
    { id: "pga_style", name: "PGA-Style", description: "Large gaps at the top like pro tours (25, 20, 16...)" },
    { id: "custom", name: "Custom", description: "Define your own point values per position" },
  ];
}

// --- Getters ---

export async function getScoringConfig(leagueId: number): Promise<ScoringConfig> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: {
      scoringType: true,
      strokePlayPointScale: true,
      strokePlayPointPreset: true,
      strokePlayBonusShow: true,
      strokePlayBonusBeat: true,
      strokePlayDnpPoints: true,
      strokePlayTieMode: true,
      strokePlayDnpPenalty: true,
      strokePlayMaxDnp: true,
      strokePlayProRate: true,
      hybridFieldWeight: true,
      hybridFieldPointScale: true,
    },
  });

  return {
    ...league,
    strokePlayPointScale: league.strokePlayPointScale
      ? JSON.parse(league.strokePlayPointScale)
      : null,
    hybridFieldPointScale: league.hybridFieldPointScale
      ? JSON.parse(league.hybridFieldPointScale)
      : null,
  };
}

export async function getScheduleConfig(leagueId: number): Promise<ScheduleConfig> {
  return prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: {
      scheduleType: true,
      scheduleVisibility: true,
      byePointsMode: true,
      byePointsFlat: true,
      scheduleExtraWeeks: true,
      midSeasonAddDefault: true,
      midSeasonRemoveAction: true,
      playoffWeeks: true,
      playoffTeams: true,
      playoffFormat: true,
    },
  });
}

// --- Updaters ---

const scoringConfigSchema = z.object({
  scoringType: z.enum(["match_play", "stroke_play", "hybrid"]),
  strokePlayPointPreset: z.enum(["linear", "weighted", "pga_style", "custom"]),
  strokePlayPointScale: z.array(z.number().min(0)).nullable(),
  strokePlayBonusShow: z.number().min(0),
  strokePlayBonusBeat: z.number().min(0),
  strokePlayDnpPoints: z.number().min(0),
  strokePlayTieMode: z.enum(["split", "same"]),
  strokePlayDnpPenalty: z.number().max(0),
  strokePlayMaxDnp: z.number().int().min(1).nullable(),
  strokePlayProRate: z.boolean(),
  hybridFieldWeight: z.number().min(0).max(1),
  hybridFieldPointScale: z.array(z.number().min(0)).nullable(),
});

export async function updateScoringConfig(
  leagueSlug: string,
  config: z.infer<typeof scoringConfigSchema>
): Promise<ActionResult> {
  try {
    const validated = scoringConfigSchema.parse(config);
    const session = await requireLeagueAdmin(leagueSlug);

    await prisma.league.update({
      where: { id: session.leagueId },
      data: {
        scoringType: validated.scoringType,
        strokePlayPointPreset: validated.strokePlayPointPreset,
        strokePlayPointScale: validated.strokePlayPointScale
          ? JSON.stringify(validated.strokePlayPointScale)
          : null,
        strokePlayBonusShow: validated.strokePlayBonusShow,
        strokePlayBonusBeat: validated.strokePlayBonusBeat,
        strokePlayDnpPoints: validated.strokePlayDnpPoints,
        strokePlayTieMode: validated.strokePlayTieMode,
        strokePlayDnpPenalty: validated.strokePlayDnpPenalty,
        strokePlayMaxDnp: validated.strokePlayMaxDnp,
        strokePlayProRate: validated.strokePlayProRate,
        hybridFieldWeight: validated.hybridFieldWeight,
        hybridFieldPointScale: validated.hybridFieldPointScale
          ? JSON.stringify(validated.hybridFieldPointScale)
          : null,
      },
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid scoring config" };
    }
    return { success: false, error: "Failed to update scoring configuration." };
  }
}

const scheduleConfigSchema = z.object({
  scheduleVisibility: z.enum(["full", "current_week", "hidden"]),
  byePointsMode: z.enum(["zero", "flat", "league_average", "team_average"]),
  byePointsFlat: z.number().min(0),
  scheduleExtraWeeks: z.enum(["flex", "continue_round"]),
  midSeasonAddDefault: z.enum(["start_from_here", "fill_byes", "pro_rate", "catch_up"]),
  midSeasonRemoveAction: z.enum(["bye_opponents", "regenerate"]),
  playoffWeeks: z.number().int().min(0).max(4),
  playoffTeams: z.number().int().min(2).max(8),
  playoffFormat: z.enum(["single_elimination", "double_elimination", "round_robin"]),
});

export async function updateScheduleConfig(
  leagueSlug: string,
  config: z.infer<typeof scheduleConfigSchema>
): Promise<ActionResult> {
  try {
    const validated = scheduleConfigSchema.parse(config);
    const session = await requireLeagueAdmin(leagueSlug);

    await prisma.league.update({
      where: { id: session.leagueId },
      data: validated,
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid schedule config" };
    }
    return { success: false, error: "Failed to update schedule configuration." };
  }
}
```

---

## Task 3: Create Round-Robin Algorithm Library

**New file:** `src/lib/scheduling/round-robin.ts`

This is a pure function library with no database access. It contains the core scheduling algorithms.

Functions to implement:
- `generateSingleRoundRobin(teamIds: number[]): Round[]` — Circle method algorithm
- `generateDoubleRoundRobin(teamIds: number[]): Round[]` — Double pass with home/away swap
- `validateSchedule(rounds: Round[], teamIds: number[]): ValidationResult` — Verify balance
- `calculateByeDistribution(rounds: Round[]): Map<number, number>` — Bye count per team

Types:
```typescript
export interface ScheduledMatch {
  teamAId: number;
  teamBId: number | null; // null = bye
}

export interface Round {
  weekNumber: number;
  matches: ScheduledMatch[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  byeDistribution: Map<number, number>;
  matchesPerTeam: Map<number, number>;
}
```

The circle method algorithm:
1. If odd number of teams, add a sentinel (-1) to make even
2. Fix first team in place, rotate remaining teams
3. Each rotation produces one round of pairings
4. Sentinel pairings become bye weeks

---

## Task 4: Update Barrel Exports

**File:** `src/lib/actions/index.ts`

Add these exports at the end:

```typescript
export {
  getScoringConfig,
  getScheduleConfig,
  updateScoringConfig,
  updateScheduleConfig,
  generatePointScale,
  getPointScalePresets,
  type ScoringConfig,
  type ScheduleConfig,
} from "./scoring-config";
```

---

## Task 5: Update `getLeagueBySlug` Select Clause

**File:** `src/lib/actions/leagues.ts`

Add the new scoring and schedule fields to the `select` clause in `getLeagueBySlug()` (after `handicapRequireApproval: true` on line 198):

```typescript
      // Scoring config
      scoringType: true,
      strokePlayPointPreset: true,
      strokePlayPointScale: true,
      strokePlayBonusShow: true,
      strokePlayBonusBeat: true,
      strokePlayDnpPoints: true,
      strokePlayTieMode: true,
      strokePlayDnpPenalty: true,
      strokePlayMaxDnp: true,
      strokePlayProRate: true,
      hybridFieldWeight: true,
      hybridFieldPointScale: true,
      // Schedule config
      scheduleType: true,
      scheduleVisibility: true,
      byePointsMode: true,
      byePointsFlat: true,
      scheduleExtraWeeks: true,
      midSeasonAddDefault: true,
      midSeasonRemoveAction: true,
      playoffWeeks: true,
      playoffTeams: true,
      playoffFormat: true,
```

Also add `scoringType: true` to `getLeaguePublicInfo()` select clause so public pages know the league format.

---

## Task 6: Update `createLeague` to Accept Scoring Type

**File:** `src/lib/actions/leagues.ts`

Update the `createLeague` function signature to accept an optional `scoringType` parameter:

```typescript
export async function createLeague(
  name: string,
  adminPassword: string,
  scoringType: "match_play" | "stroke_play" | "hybrid" = "match_play"
): Promise<ActionResult<{ id: number; slug: string; name: string; adminUsername: string }>> {
```

Add `scoringType` to the `prisma.league.create` data:

```typescript
    const league = await prisma.league.create({
      data: {
        name: trimmedName,
        slug,
        adminUsername,
        adminPassword: hashedPassword,
        scoringType,
      },
    });
```

---

## Task 7: Update League Creation UI

**File:** `src/app/leagues/new/page.tsx`

Add a scoring type selector between the league name field and the password field. This should be 3 visual cards the admin can click:

- **Match Play** (default, pre-selected) — "Head-to-Head" subtitle, description: "Teams compete in weekly matchups. Points awarded based on net score margin."
- **Stroke Play** — "Field Play" subtitle, description: "All teams compete against the field each week. Points awarded by weekly finish position."
- **Hybrid** — "Both" subtitle, description: "Head-to-head matchups plus field position points. Best of both worlds."

Add state: `const [scoringType, setScoringType] = useState<"match_play" | "stroke_play" | "hybrid">("match_play");`

Pass to `createLeague(name, password, scoringType)`.

---

## Task 8: Update Admin Page League Interface

**File:** `src/app/league/[slug]/admin/page.tsx`

Add scoring/schedule fields to the `League` interface (after `handicapRequireApproval`):

```typescript
  // Scoring
  scoringType: string;
  // Schedule
  scheduleType: string | null;
```

These get passed down to child tabs that need them.

---

## Task 9: Add Scoring Config Section to Settings Tab

**File:** `src/app/league/[slug]/admin/components/SettingsTab.tsx`

Add a new expandable "Scoring Format" section to the Settings tab. This section should:

1. Show the current scoring type with a description
2. Show a warning if changing type with existing data (recommend creating new season)
3. For stroke play / hybrid:
   - Point scale preset selector (linear / weighted / PGA-style / custom)
   - Custom point table editor (appears when "custom" selected)
   - Tie mode selector (split / same position)
   - Show-up bonus input
   - Beat-handicap bonus input
   - DNP points input
   - DNP penalty input
   - Max DNPs input
   - Pro-rate toggle
4. For hybrid only:
   - Field weight slider (0-100%)
5. Live preview: "With N teams: 1st = X pts, 2nd = Y pts, ..., last = Z pts"

Add a new expandable "Schedule Settings" section with:
1. Schedule visibility selector
2. Bye point mode selector + flat amount input
3. Extra weeks handling selector
4. Mid-season team addition default strategy selector
5. Mid-season team removal action selector
6. Playoff configuration (weeks, teams, format)

Both sections should have their own Save buttons.

Update the `League` interface in this file to include the new fields.

---

## Acceptance Criteria

When this stage is complete, verify:

- [ ] `npx prisma migrate dev` succeeds with no errors
- [ ] `npx prisma generate` succeeds
- [ ] `npm run build` succeeds (no type errors)
- [ ] Creating a new league lets you pick Match Play, Stroke Play, or Hybrid
- [ ] Existing leagues still load correctly in admin (default to match_play)
- [ ] Settings tab shows Scoring Format section with all options
- [ ] Settings tab shows Schedule Settings section with all options
- [ ] Saving scoring config persists to database
- [ ] Saving schedule config persists to database
- [ ] Point scale preview shows correct values for each preset
- [ ] `src/lib/scheduling/round-robin.ts` exists with pure algorithm functions
- [ ] Round-robin generates balanced schedules for 4, 6, 7, 8, 10, 12 teams
- [ ] All new exports are available from `@/lib/actions`
- [ ] `npm run lint` passes
