# Feature 2: Automatic Schedule Generation

## Overview

Currently, LeagueLinks has **no scheduling system at all**. Admins manually select which two teams to pair every time they enter a matchup. There's no way to:
- See who should play whom this week
- Generate a round-robin schedule
- Ensure balanced play (every team plays every other team)
- View upcoming matches
- Handle bye weeks

This feature adds automatic schedule generation with a visual schedule view, and handles the tricky problem of adding teams mid-season.

---

## Golf Domain Knowledge: League Scheduling

### How Golf Leagues Actually Schedule

**Typical Recreational League (8-16 teams, 16-20 week season):**
- Double round-robin is the gold standard (play each team twice — "home and away")
- For 8 teams: single round-robin = 7 weeks, double = 14 weeks → fits a 16-week season perfectly with 2 flex/playoff weeks
- For 10 teams: single = 9 weeks, double = 18 weeks
- For 12 teams: single = 11 weeks, double = 22 weeks → may only do single + partial second round

**Bye Weeks (Odd Number of Teams):**
- If 7 teams: each round has 3 matches + 1 team on bye
- Bye teams typically receive a fixed number of points (e.g., average of their season points, or a flat "bye award" like 10 points)
- Some leagues give 0 points for bye weeks
- Professional approach: award bye teams the average points per match for the league that week

**Scheduling Constraints:**
- Every team should play exactly once per week (no double-headers)
- Schedule should be "balanced" — no team has significantly more byes than others
- Some leagues want to avoid back-to-back matchups against same opponent
- Playoff weeks at end of season are typically unscheduled (determined by standings)

**The Circle Method (Standard Round-Robin Algorithm):**
```
For N teams (N even):
- Fix Team 1 in position
- Rotate teams 2 through N around a circle
- Each round, pair: top-bottom, 2nd-from-top with 2nd-from-bottom, etc.

Round 1: (1,6) (2,5) (3,4)
Round 2: (1,5) (6,4) (2,3)
Round 3: (1,4) (5,3) (6,2)
Round 4: (1,3) (4,2) (5,6)
Round 5: (1,2) (3,6) (4,5)
```

For odd N: add a "phantom" team → whoever is paired with phantom gets a bye.

### Mid-Season Team Addition Strategies

This is the most complex part. In real golf leagues, this happens regularly (a team joins week 4 of a 16-week season). Common approaches:

**Strategy 1: "Start From Here" (Simplest)**
- New team is added to the schedule from next week forward
- Previous weeks: 0 points (or configurable default)
- Remaining schedule regenerated to include new team
- Completed matchups are preserved unchanged
- **Pro:** Simple, no disruption to existing results
- **Con:** New team is at a points disadvantage, schedule may be unbalanced

**Strategy 2: "Fill The Byes" (Best for odd-team leagues)**
- If league had odd teams (bye weeks), new team fills the bye slot
- Goes from 7 teams (one bye/week) to 8 teams (no byes)
- Previous bye weeks retroactively removed (teams that had byes keep their bye points)
- New matchups added for remaining weeks
- **Pro:** Natural fit, minimal disruption
- **Con:** Only works when going from odd to even

**Strategy 3: "Pro-Rated Points"**
- New team starts from next week with 0 points
- At season end, standings use **points per match** instead of total points
- This normalizes for different number of matches played
- **Pro:** Fairest comparison
- **Con:** Changes how everyone's standings are calculated

**Strategy 4: "Catch-Up Matches"**
- Schedule extra matches for the new team to "catch up"
- May play twice in some weeks to make up missed rounds
- **Pro:** Everyone plays the same number of matches
- **Con:** Logistically complex, extra burden on existing teams

**All four strategies are admin-configurable.** Admin sets a default strategy in league settings, and can override per-team when adding mid-season. Strategy 2 (Fill Byes) is automatically suggested when going from odd to even teams. Default: "Start From Here."

---

## Architecture Decisions

### Decision 1: Schedule Model

**Option A: Separate `ScheduledMatchup` Model** (Recommended)
- Clean separation between "planned" and "completed"
- Existing Matchup model untouched
- Schedule can exist before any scores are submitted
- Easy to track status: scheduled → completed → cancelled

**Option B: Add status field to existing Matchup**
- Fewer models
- But Matchup currently requires scores (gross, net, handicap) — all would need to become nullable
- Breaks the clean data contract of "a Matchup has results"

**Decision: Option A — Separate `ScheduledMatchup` model with optional link to completed Matchup**

### Decision 2: Schedule Generation Timing

- Schedule is generated when admin clicks "Generate Schedule"
- Can be regenerated at any time (with warning about existing matchups)
- Schedule is NOT auto-generated on season creation (admin may want to set up teams first)
- Schedule persists across sessions (stored in DB, not ephemeral)

### Decision 3: Stroke Play Scheduling

- For stroke play leagues (Feature 1), schedule generation is simpler:
  - No matchups to pair
  - Schedule just defines which weeks are active and which teams are expected to play
  - Could just be a list of active weeks
  - Or could define "playing groups" for tee time management (future feature)
- **For now:** Schedule generation is primarily for match play leagues
- Stroke play leagues get a simpler "Week Management" UI instead

### Decision 4: Where Schedule Lives

- Schedule tab in admin, between Matchups and Teams
- Or integrated into the Matchups tab as a sub-view
- **Decision:** New "Schedule" tab in admin — it's a distinct enough concept

---

## Data Model Changes

### Schema Changes (`prisma/schema.prisma`)

```prisma
model ScheduledMatchup {
  id          Int       @id @default(autoincrement())
  leagueId    Int
  seasonId    Int?
  weekNumber  Int
  teamAId     Int
  teamBId     Int?      // Null = bye week for teamA
  status      String    @default("scheduled") // "scheduled" | "completed" | "cancelled"
  matchupId   Int?      // Links to actual Matchup when completed (optional FK)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  league  League   @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  season  Season?  @relation(fields: [seasonId], references: [id], onDelete: SetNull)
  teamA   Team     @relation("ScheduledTeamA", fields: [teamAId], references: [id], onDelete: Restrict)
  teamB   Team?    @relation("ScheduledTeamB", fields: [teamBId], references: [id], onDelete: Restrict)
  matchup Matchup? @relation(fields: [matchupId], references: [id], onDelete: SetNull)

  @@unique([leagueId, weekNumber, teamAId])  // One scheduled match per team per week
  @@index([leagueId])
  @@index([seasonId])
  @@index([leagueId, weekNumber])
  @@index([matchupId])
}

// Add schedule config to League model
model League {
  // ... existing fields ...

  // Schedule configuration
  scheduleType          String?   // "single_round_robin" | "double_round_robin" | "custom" | null
  scheduleVisibility    String    @default("full") // "full" | "current_week" | "hidden"
  byePointsMode         String    @default("flat") // "zero" | "flat" | "league_average" | "team_average"
  byePointsFlat         Float     @default(10)     // Points when byePointsMode = "flat"
  scheduleExtraWeeks    String    @default("flex") // "flex" | "continue_round" — what to do with extra weeks
  midSeasonAddDefault   String    @default("start_from_here") // "start_from_here" | "fill_byes" | "pro_rate"
  midSeasonRemoveAction String    @default("bye_opponents") // "bye_opponents" | "regenerate"
  playoffWeeks          Int       @default(0)      // Number of weeks reserved for playoffs at end (0 = disabled)
  playoffTeams          Int       @default(4)      // Number of teams that qualify for playoffs
  playoffFormat         String    @default("single_elimination") // "single_elimination" | "double_elimination" | "round_robin"

  // Relations
  scheduledMatchups   ScheduledMatchup[]
}

// Add relations to other models
model Season {
  // ... existing fields ...
  scheduledMatchups   ScheduledMatchup[]
}

model Team {
  // ... existing fields ...
  scheduledAsTeamA    ScheduledMatchup[]  @relation("ScheduledTeamA")
  scheduledAsTeamB    ScheduledMatchup[]  @relation("ScheduledTeamB")
}

model Matchup {
  // ... existing fields ...
  scheduledMatchup    ScheduledMatchup?   // Optional back-link
}
```

### Migration Notes
- `ScheduledMatchup` is entirely new — no existing data affected
- `teamBId` is nullable to support bye weeks
- `matchupId` links to the actual result when the scheduled matchup is completed
- Schedule config fields on League default to null/safe values

---

## Schedule Generation Algorithm

### Core Algorithm: Circle Method (Berger Tables)

```typescript
function generateRoundRobin(teams: number[]): [number, number | null][][] {
  const n = teams.length;
  const isOdd = n % 2 !== 0;

  // If odd, add a "bye" placeholder
  const participants = isOdd ? [...teams, -1] : [...teams];
  const count = participants.length;
  const rounds: [number, number | null][][] = [];

  // Fix first participant, rotate the rest
  const fixed = participants[0];
  const rotating = participants.slice(1);

  for (let round = 0; round < count - 1; round++) {
    const pairs: [number, number | null][] = [];

    // First match: fixed vs last in rotation
    const opponent = rotating[rotating.length - 1];
    pairs.push([
      fixed,
      opponent === -1 ? null : opponent
    ]);

    // Remaining matches: pair from outside in
    for (let i = 0; i < (count - 2) / 2; i++) {
      const a = rotating[i];
      const b = rotating[rotating.length - 2 - i];
      if (a === -1) {
        pairs.push([b, null]); // b has bye
      } else if (b === -1) {
        pairs.push([a, null]); // a has bye
      } else {
        pairs.push([a, b]);
      }
    }

    rounds.push(pairs);

    // Rotate: move last to front
    rotating.unshift(rotating.pop()!);
  }

  return rounds;
}
```

### Double Round-Robin
- Run the circle method once for first half
- Swap home/away (teamA ↔ teamB) for second half
- Optional: shuffle the second-half week order to avoid playing same opponent in consecutive weeks

### Schedule Validation Rules
1. Every team plays exactly once per week (or has exactly one bye)
2. Over the full schedule, every team plays every other team an equal number of times (±1 for incomplete rounds)
3. Bye distribution is as even as possible (max 1 bye difference between any two teams)
4. No team plays the same opponent in consecutive weeks (when possible)

---

## Mid-Season Team Addition

### Flow

```
Admin clicks "Add Team Mid-Season" (or approves a new team registration)
  → System detects schedule exists
  → Shows integration options:
    Option 1: "Start From Here" (default)
      - Team joins from week N+1 forward
      - Schedule regenerated for remaining weeks only
      - Completed weeks preserved
    Option 2: "Fill Bye Slots" (if odd→even transition)
      - Team automatically fills bye positions
      - Some retroactive matchups may be suggested
    Option 3: "Pro-Rate Standings"
      - Same as Start From Here
      - But enable "Points Per Match" ranking mode for this season
  → Preview shows new schedule
  → Admin confirms
```

### Algorithm for "Start From Here"

```
1. Get list of ALL teams (including new one)
2. Get current week number
3. Get list of already-completed weeks
4. Calculate remaining weeks = totalWeeks - currentWeek + 1
5. Generate fresh round-robin for ALL teams
6. Take only the rounds that include the new team AND haven't been played
7. For rounds that were already played (without new team):
   - Keep existing matchups unchanged
   - New team gets a "bye" or "DNP" for those weeks
8. For remaining rounds:
   - Use the new full schedule
   - Completed matchups are NOT moved/changed
   - Only future weeks get the new pairings
```

### Algorithm for "Fill Bye Slots"

```
1. Current schedule has N teams (odd) → bye each week
2. New team joins → N+1 teams (even) → no more byes
3. For future weeks: new team takes the bye slot
4. For past weeks: new team was absent (0 points / DNP points)
5. Remaining schedule uses new team instead of bye
```

### Handling Removed Teams (Dropped/Suspended)

- Team drops mid-season → their future scheduled matchups become byes for opponents
- Or: admin can choose to regenerate remaining schedule without that team
- Historical matchups preserved
- Team's scores remain in standings (or admin can exclude)

---

## Server Actions

### New File: `src/lib/actions/schedule.ts`

```
Functions needed:

// Generation
- generateSchedule(leagueSlug, type, totalWeeks, startWeek?) — Generate full schedule
- previewSchedule(leagueId, type, totalWeeks) — Preview without saving
- clearSchedule(leagueSlug, seasonId) — Delete all scheduled matchups for a season

// Retrieval
- getSchedule(leagueId, seasonId?) — Full schedule for a season
- getScheduleForWeek(leagueId, weekNumber) — Single week's matchups
- getTeamSchedule(leagueId, teamId) — Single team's full schedule
- getScheduleStatus(leagueId) — Summary: weeks generated, weeks completed, weeks remaining

// Modification
- swapMatchup(leagueSlug, scheduledMatchupId, newTeamAId, newTeamBId) — Manual swap
- cancelScheduledMatchup(leagueSlug, scheduledMatchupId) — Cancel a specific matchup
- rescheduleMatchup(leagueSlug, scheduledMatchupId, newWeekNumber) — Move to different week

// Mid-season changes
- addTeamToSchedule(leagueSlug, teamId, strategy) — Add team with chosen strategy
- removeTeamFromSchedule(leagueSlug, teamId) — Remove team, handle their matchups
- regenerateRemainingSchedule(leagueSlug, fromWeek) — Redo future weeks only

// Integration with matchup submission
- getScheduledMatchupForTeams(leagueId, weekNumber, teamAId, teamBId) — Find matching scheduled matchup
- markScheduledMatchupCompleted(scheduledMatchupId, matchupId) — Link to actual result
```

### Modified File: `src/lib/actions/matchups.ts`

```
Changes needed:
- submitMatchup() — After creating matchup, auto-mark corresponding ScheduledMatchup as completed
- previewMatchup() — If schedule exists, suggest the scheduled opponent for this week
- deleteMatchup() — Revert corresponding ScheduledMatchup to "scheduled" status
```

### Modified File: `src/lib/actions/teams.ts`

```
Changes needed:
- approveTeam() — If schedule exists, prompt/trigger "add team to schedule" flow
- deleteTeam() — If schedule exists, handle their scheduled matchups
```

### New File: `src/lib/scheduling/round-robin.ts`

```
Pure functions (no database access):
- generateSingleRoundRobin(teamIds[]) → Round[]
- generateDoubleRoundRobin(teamIds[]) → Round[]
- addTeamToRoundRobin(existingSchedule, newTeamId, startWeek) → Round[]
- validateSchedule(schedule, teams) → ValidationResult
- shuffleRounds(rounds) → Round[] (randomize order while keeping balance)
- calculateByeDistribution(schedule) → Map<teamId, byeCount>
```

---

## UI Changes

### New Admin Tab: "Schedule" (`src/app/league/[slug]/admin/components/ScheduleTab.tsx`)

**State 1: No Schedule Generated**
```
┌─────────────────────────────────────────────────┐
│  Schedule                                        │
│                                                  │
│  No schedule has been generated yet.             │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  Generate Schedule                        │    │
│  │                                           │    │
│  │  Schedule Type:                           │    │
│  │  ○ Single Round-Robin (each team plays    │    │
│  │    every other team once)                 │    │
│  │  ● Double Round-Robin (each team plays    │    │
│  │    every other team twice) (Recommended)  │    │
│  │                                           │    │
│  │  Number of Weeks: [16]                    │    │
│  │  Start Week: [1]                          │    │
│  │                                           │    │
│  │  Teams: 8 approved teams                  │    │
│  │  Estimated: 14 match weeks + 2 flex       │    │
│  │                                           │    │
│  │  [Preview Schedule]  [Generate & Save]    │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

**State 2: Schedule Generated — Full View**
```
┌─────────────────────────────────────────────────┐
│  Schedule  ·  14 weeks  ·  8 teams              │
│  [Regenerate] [Clear Schedule]                   │
│                                                  │
│  Week 1 ✅ (completed)                           │
│  ┌─────────────────────────────────────────┐     │
│  │  Team Alpha  vs  Team Bravo    ✅ 12-8  │     │
│  │  Team Charlie vs Team Delta   ✅ 10-10  │     │
│  │  Team Echo  vs  Team Foxtrot   ✅ 14-6  │     │
│  │  Team Golf  vs  Team Hotel     ✅ 13-7  │     │
│  └─────────────────────────────────────────┘     │
│                                                  │
│  Week 2 ✅ (completed)                           │
│  ...                                             │
│                                                  │
│  Week 5 ◉ (current week)                        │
│  ┌─────────────────────────────────────────┐     │
│  │  Team Alpha  vs  Team Delta   ⏳ pending │     │
│  │  Team Bravo  vs  Team Echo    ⏳ pending │     │
│  │  Team Charlie vs Team Golf    ⏳ pending │     │
│  │  Team Foxtrot vs Team Hotel   ⏳ pending │     │
│  │                                          │     │
│  │  [Enter Scores for Week 5]               │     │
│  └─────────────────────────────────────────┘     │
│                                                  │
│  Week 6-14 (upcoming)                            │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

**State 3: Add Team Mid-Season**
```
┌──────────────────────────────────────────────────┐
│  Add "Team India" to Schedule                     │
│                                                   │
│  Current week: 5 of 14                            │
│  Weeks remaining: 10                              │
│                                                   │
│  How should this team be integrated?              │
│                                                   │
│  ● Start From Here (League Default)               │
│    Team plays from Week 6 forward. Gets 0 points  │
│    for Weeks 1-5. Remaining schedule regenerated.  │
│                                                   │
│  ○ Fill Bye Slots ✨ (7→8 teams removes byes!)   │
│    New team takes over bye positions for remaining │
│    weeks. Cleanest transition for odd→even.        │
│                                                   │
│  ○ Pro-Rated Standings                            │
│    Same as Start From Here, but season standings   │
│    switch to "points per match" for all teams to   │
│    account for fewer matches played.               │
│                                                   │
│  ○ Catch-Up Matches                               │
│    Schedule extra matches in upcoming weeks so new │
│    team plays more frequently until caught up.     │
│                                                   │
│  [Preview New Schedule]  [Confirm]                │
└──────────────────────────────────────────────────┘
```

**Note:** "Fill Bye Slots" option only appears when going from odd to even team count. The league's default strategy is configurable in Settings, but admin can override per-team.

### Modified Admin Matchups Tab

When a schedule exists:
- Show "This Week's Scheduled Matchups" at the top
- Pre-populate team dropdowns based on schedule
- Quick "Enter Scores" button next to each scheduled matchup
- Highlight if an unscheduled matchup is being entered (warning, not blocking)

### New Public Page: Schedule View (`src/app/league/[slug]/schedule/page.tsx`)

```
┌─────────────────────────────────────────────────┐
│  League Schedule — Season 2026                   │
│                                                  │
│  Week 1 (Jan 15) ✅                             │
│  Alpha vs Bravo (12-8) · Charlie vs Delta (10-10)│
│                                                  │
│  Week 2 (Jan 22) ✅                             │
│  ...                                             │
│                                                  │
│  ➤ Week 5 (Feb 12) — This Week                  │
│  Alpha vs Delta · Bravo vs Echo                  │
│  Charlie vs Golf · Foxtrot vs Hotel              │
│                                                  │
│  Week 6 (Feb 19) — Upcoming                     │
│  Alpha vs Echo · Bravo vs Foxtrot                │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

Features:
- Current week highlighted
- Completed weeks show scores
- Upcoming weeks show pairings only
- Team can click their name to see their personal schedule
- Bye weeks clearly marked

### Navigation Update

Add "Schedule" link to league navigation (between History and Sign Up):
- Home | Leaderboard | History | **Schedule** | Sign Up | Admin

---

## Bye Week Point Handling

### Configurable Modes

**1. Zero Points (default)**
- Bye team gets 0 points for that week
- Simplest, most common in casual leagues

**2. Flat Points**
- Bye team gets a fixed number of points (configurable, default 10 = tie equivalent)
- Common in leagues that want byes to not be a disadvantage

**3. League Average**
- Bye team gets the average points scored by all teams that week
- Most fair — adjusts weekly based on actual scoring
- Calculated after all scores for the week are submitted

**4. Team Average**
- Bye team gets their own season average points per match
- Accounts for team strength
- Calculated dynamically as more matches are played

### Implementation

```typescript
async function calculateByePoints(
  leagueId: number,
  teamId: number,
  weekNumber: number,
  mode: "zero" | "flat" | "league_average" | "team_average",
  flatAmount: number
): Promise<number> {
  switch (mode) {
    case "zero": return 0;
    case "flat": return flatAmount;
    case "league_average":
      // Get all matchup points for this week, average them
      const weekMatchups = await getMatchupsForWeek(leagueId, weekNumber);
      const allPoints = weekMatchups.flatMap(m => [m.teamAPoints, m.teamBPoints]);
      return allPoints.length > 0
        ? allPoints.reduce((a, b) => a + b, 0) / allPoints.length
        : flatAmount; // fallback if no matches yet
    case "team_average":
      // Get team's average points across all matches this season
      const teamMatchups = await getTeamMatchupHistory(leagueId, teamId);
      const teamPoints = teamMatchups.map(m =>
        m.teamAId === teamId ? m.teamAPoints : m.teamBPoints
      );
      return teamPoints.length > 0
        ? teamPoints.reduce((a, b) => a + b, 0) / teamPoints.length
        : flatAmount; // fallback if no matches yet
  }
}
```

---

## Implementation Phases

### Phase 1: Data Model & Pure Algorithm (Foundation)
1. Create `ScheduledMatchup` model in schema
2. Add schedule config fields to League model
3. Run migration
4. Create `src/lib/scheduling/round-robin.ts` — pure algorithm functions
5. Unit tests for round-robin generation
6. Unit tests for validation (balanced schedule, all teams play, etc.)

### Phase 2: Schedule Generation & Management (Admin)
1. Create `src/lib/actions/schedule.ts` — server actions
2. Build Schedule tab in admin — generation flow
3. Preview before generating
4. Full schedule view with week grouping
5. Ability to clear/regenerate schedule
6. Manual swap/edit individual matchups
7. **Tests:** Generation with various team counts (even/odd, 4-16 teams)

### Phase 3: Integration with Matchup Entry
1. Modify matchup submission to auto-link to ScheduledMatchup
2. Pre-populate matchup form from schedule
3. "Enter Scores for Week X" quick action
4. Mark scheduled matchups as completed
5. Handle unscheduled matchups (warning, but allow)
6. **Tests:** Full flow from schedule → score entry → standings

### Phase 4: Mid-Season Team Management
1. "Add Team to Schedule" flow
2. "Start From Here" strategy implementation
3. "Pro-Rated Standings" mode
4. "Fill Bye Slots" for odd→even transitions
5. "Remove Team from Schedule" flow
6. Schedule regeneration for remaining weeks
7. **Tests:** Various mid-season scenarios

### Phase 5: Public Schedule View & Polish
1. Create `/league/[slug]/schedule` page
2. Add Schedule to navigation
3. Current week highlighting
4. Team-specific schedule view
5. Bye week point calculation and display
6. Season selector for historical schedules
7. **Tests:** E2E schedule viewing

---

## Edge Cases & Special Handling

### 1. Very Small Leagues (2-3 teams)
- 2 teams: play each other every week (no scheduling needed, but support it)
- 3 teams: single round-robin = 3 weeks, always 1 bye per week

### 2. Large Leagues (16+ teams)
- Single round-robin = 15 weeks → might be entire season
- Double round-robin = 30 weeks → likely too many
- Offer "partial round-robin" — play as many rounds as weeks allow
- Balance: ensure each team plays approximately the same number of matches

### 3. Schedule Already Exists When Regenerating
- Warn admin: "This will delete all unplayed scheduled matchups"
- Completed matchups are NEVER deleted
- Only "scheduled" status entries are cleared
- Admin must confirm

### 4. More Weeks Than Needed (Admin-Configurable)
- 8 teams, double round-robin = 14 weeks, but admin wants 18 weeks
- **Admin chooses in settings:**
  - **Flex weeks (default):** Extra weeks left unscheduled for makeup matches, events, or playoffs
  - **Continue round:** Start a third round-robin to fill remaining weeks
- If `playoffWeeks > 0`, that many weeks are automatically reserved at the end and excluded from round-robin generation

### 5. Fewer Weeks Than Needed
- 12 teams, double round-robin = 22 weeks, but only 16 weeks in season
- Generate partial: do complete single round-robin (11 weeks) + 5 more from second round
- Ensure balance: everyone has approximately equal matches

### 6. Team Approval Timing
- Schedule should only include approved teams
- If schedule is generated and then a new team is approved → trigger "add team" flow
- If schedule is generated and a team is removed → trigger "remove team" flow

### 7. Relationship with Stroke Play (Feature 1)
- Schedule generation is primarily for match play leagues
- Stroke play leagues don't need opponent pairing
- If scoringType = "stroke_play", Schedule tab shows simpler "Week Management" interface
  - Define active weeks
  - No pairings, just which weeks teams are expected to play

---

## Files to Create
- `src/lib/scheduling/round-robin.ts` — Pure scheduling algorithms
- `src/lib/actions/schedule.ts` — Schedule server actions
- `src/app/league/[slug]/admin/components/ScheduleTab.tsx` — Admin schedule management
- `src/app/league/[slug]/schedule/page.tsx` — Public schedule view

## Files to Modify
- `prisma/schema.prisma` — ScheduledMatchup model, League schedule config
- `src/lib/actions/index.ts` — Re-export schedule actions
- `src/lib/actions/matchups.ts` — Link submissions to scheduled matchups
- `src/lib/actions/teams.ts` — Trigger schedule updates on team changes
- `src/app/league/[slug]/admin/page.tsx` — Add Schedule tab
- `src/components/Navigation.tsx` — Add Schedule link to league nav

---

## All Admin-Configurable Settings (Summary)

Every previously-open question is now an admin setting:

| Setting | Default | Options | Where |
|---------|---------|---------|-------|
| Schedule type | null (none) | single_round_robin / double_round_robin / custom | Schedule tab |
| Schedule visibility | full | full / current_week_only / hidden | Settings |
| Bye point mode | flat | zero / flat / league_average / team_average | Settings |
| Bye flat amount | 10 | Any float >= 0 | Settings |
| Extra weeks handling | flex | flex / continue_round | Schedule generation |
| Mid-season add default | start_from_here | start_from_here / fill_byes / pro_rate / catch_up | Settings |
| Mid-season remove action | bye_opponents | bye_opponents / regenerate | Settings |
| Playoff weeks | 0 (disabled) | 0-4 | Settings |
| Playoff teams | 4 | 2-8 | Settings |
| Playoff format | single_elimination | single_elimination / double_elimination / round_robin | Settings |
| Custom schedule (manual) | N/A | Admin can manually swap/move any matchup after generation | Schedule tab |

### Schedule Visibility Options
- **Full (default):** Public schedule page shows all past and future matchups. Teams can plan ahead. This is what most leagues want.
- **Current Week Only:** Public page shows only the current week's pairings and past results. Future opponents hidden.
- **Hidden:** No public schedule page. Only admin can see the schedule. Teams only know their opponent when scores are entered.

### Playoff Configuration
- Admin sets how many weeks at the end of the season are reserved for playoffs
- Playoff brackets are auto-generated from regular season standings
- Three format options: single elimination, double elimination, or mini round-robin
- If `playoffWeeks = 0`, no playoffs — regular season determines final standings
- Playoff matchups appear in the schedule with a "Playoff" badge

### Custom Schedule Support
- Admin can always manually edit the generated schedule:
  - **Swap teams** in any unplayed matchup
  - **Move a matchup** to a different week
  - **Cancel** a scheduled matchup
  - **Add** an unscheduled matchup to any week
- This provides full drag-and-drop-level control without needing a visual drag-and-drop UI
- For fully custom schedules: admin generates an empty schedule (type = "custom") and builds it matchup-by-matchup

---

## Open Questions — RESOLVED

All questions resolved as admin-configurable options:

| Question | Resolution | Default |
|----------|-----------|---------|
| Show future opponents publicly? | `scheduleVisibility` setting: full / current_week / hidden | Full (show all) |
| Default bye point mode? | `byePointsMode` setting with 4 options | Flat 10 points |
| Custom schedule creation? | Generated + manual swap/move/cancel/add on any matchup | Algorithm + tweaks |
| Playoff brackets? | `playoffWeeks` / `playoffFormat` settings, 0 = disabled | Disabled (0 weeks) |
| Pro-rate for all absences? | Shared `strokePlayProRate` toggle from Feature 1 applies league-wide | Off |

**Philosophy:** Same as Feature 1 — give admins full control with sensible defaults. Advanced options (playoffs, custom schedules, visibility) are in expandable sections. A new admin can click "Generate Schedule" with defaults and get a working round-robin instantly.
