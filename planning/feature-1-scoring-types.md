# Feature 1: League Scoring Type Selection

## Overview

Currently, LeagueLinks only supports **match play scoring** — two teams are paired head-to-head each week, net scores are compared, and a 20-point split is awarded based on margin of victory. Many recreational golf leagues instead use **stroke play scoring**, where all teams compete against the entire field each week and points are awarded by weekly finish position.

This feature adds the ability for a league admin to choose their scoring format at league creation or in settings.

---

## Golf Domain Knowledge: Scoring Formats

### Match Play (Current — "Head-to-Head")
- Two teams face off each week
- Net scores compared, points split on a 20-point scale
- W/L/T tracked per team
- Season standings = accumulated points
- Tiebreakers: total points → wins → head-to-head → net differential
- **Best for:** Small leagues (4-8 teams) where rivalries and weekly drama matter

### Stroke Play (New — "Field Play")
- ALL teams compete against the entire field each week
- Every team posts a score; no explicit opponent
- Net scores are ranked within the week (1st, 2nd, 3rd, etc.)
- Points awarded by finish position using a configurable scale
- Season standings = sum of weekly position points
- **No W/L/T** — those concepts don't exist in stroke play
- Tiebreakers: total points → counting method (most 1st-place finishes, then 2nds, etc.) → average net score
- **Best for:** Larger leagues (8-16+ teams), leagues wanting simplicity, leagues where not every team can make it every week

### Common Stroke Play Point Scales
| Finish | Linear (8 teams) | Weighted | PGA-Style |
|--------|-------------------|----------|-----------|
| 1st    | 8                 | 15       | 25        |
| 2nd    | 7                 | 12       | 20        |
| 3rd    | 6                 | 10       | 16        |
| 4th    | 5                 | 8        | 13        |
| 5th    | 4                 | 6        | 10        |
| 6th    | 3                 | 5        | 8         |
| 7th    | 2                 | 4        | 6         |
| 8th    | 1                 | 3        | 4         |

Some leagues also award bonus points (e.g., +2 for showing up/not being a no-show, +1 for beating your own handicap).

---

## Architecture Decisions

### Decision 1: New Model vs Reuse Matchup Model

**Option A: New `WeeklyScore` Model** (Recommended)
- Clean separation of concerns
- Stroke play scores are fundamentally different (no opponent)
- Existing matchup logic untouched
- Easier to query and reason about

**Option B: Reuse Matchup Model with mode flag**
- Avoid schema proliferation
- But shoehorning single-team scores into a two-team model is awkward
- `teamBId` would need to be nullable, breaking existing constraints
- Every matchup query needs mode-awareness

**Decision: Option A — New `WeeklyScore` model**

### Decision 2: Three Scoring Modes (All Admin-Configurable)

Admins choose one of three modes:

1. **Match Play** (default) — Head-to-head, 20-point split, W/L/T
2. **Stroke Play** — Field play, position-based points, no W/L/T
3. **Hybrid** — Head-to-head matchups exist AND field position points are awarded. Admin configures the weight split between match points and field points (e.g., 50/50, 70/30 match-heavy, etc.)

- Scoring type lives on the **League** model (not Season)
- Admin CAN change it between seasons, but will see a warning that historical data may not be comparable
- If the current season has submitted scores/matchups, changing type is blocked (must create new season first)

### Decision 3: Point Scale Configuration

- Use a configurable point scale stored as JSON on the League model
- Provide presets (linear, weighted, PGA-style) that auto-generate the scale
- Admin can customize individual positions
- Scale auto-extends/shrinks based on number of approved teams

### Decision 4: Everything Is Admin-Configurable

Every scoring behavior has an admin setting with a sensible default:

| Setting | Default | Options | Where |
|---------|---------|---------|-------|
| Scoring type | match_play | match_play / stroke_play / hybrid | League creation + Settings |
| Point scale preset | linear | linear / weighted / pga_style / custom | Settings (stroke play section) |
| Custom point scale | null (use preset) | JSON array | Settings |
| Tie handling | split | split (average) / same (higher position) | Settings |
| Show-up bonus | 0 | Any float >= 0 | Settings |
| Beat-handicap bonus | 0 | Any float >= 0 | Settings |
| DNP points | 0 | Any float >= 0 | Settings |
| DNP penalty | 0 | Any float <= 0 | Settings |
| Max DNPs | null (unlimited) | Any int or null | Settings |
| Pro-rate standings | false | true/false | Settings |
| Hybrid field weight | 0.5 | 0.0-1.0 slider | Settings (hybrid section) |

---

## Data Model Changes

### Schema Changes (`prisma/schema.prisma`)

```prisma
// Add to League model
model League {
  // ... existing fields ...

  // Scoring configuration
  scoringType           String    @default("match_play") // "match_play" | "stroke_play" | "hybrid"

  // Stroke play point configuration
  strokePlayPointScale  String?   // JSON array e.g. "[10,8,6,5,4,3,2,1]"
  strokePlayPointPreset String    @default("linear") // "linear" | "weighted" | "pga_style" | "custom"
  strokePlayBonusShow   Float     @default(0) // Bonus points for showing up (0 = disabled)
  strokePlayBonusBeat   Float     @default(0) // Bonus for beating own handicap (0 = disabled)
  strokePlayDnpPoints   Float     @default(0) // Points for "did not play" weeks (0 = no points)
  strokePlayTieMode     String    @default("split") // "split" (avg of tied positions) | "same" (all get higher position pts)
  strokePlayDnpPenalty  Float     @default(0) // Penalty points for no-shows (0 = disabled, negative value = penalty)
  strokePlayMaxDnp      Int?      // Max DNPs before auto-excluded from standings (null = no limit)
  strokePlayProRate     Boolean   @default(false) // Use points-per-round instead of total for standings

  // Hybrid mode configuration (match play + field points)
  hybridFieldWeight     Float     @default(0.5) // Weight of field points vs match points (0-1, 0.5 = equal)
  hybridFieldPointScale String?   // JSON array for field position points in hybrid mode

  // Relations
  weeklyScores  WeeklyScore[]
}

// New model for stroke play scores
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
  isDnp       Boolean   @default(false) // Did Not Play (admin marked absent)
  playedAt    DateTime  @default(now())
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  league  League   @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  season  Season?  @relation(fields: [seasonId], references: [id], onDelete: SetNull)
  team    Team     @relation(fields: [teamId], references: [id], onDelete: Restrict)

  @@unique([leagueId, weekNumber, teamId]) // One score per team per week
  @@index([leagueId])
  @@index([seasonId])
  @@index([teamId])
  @@index([leagueId, weekNumber])
}

// Add relation to Season model
model Season {
  // ... existing fields ...
  weeklyScores  WeeklyScore[]
}

// Add relation to Team model
model Team {
  // ... existing fields ...
  weeklyScores  WeeklyScore[]
}
```

### Migration Notes
- `scoringType` defaults to `"match_play"` so all existing leagues continue working unchanged
- `strokePlayPointScale` is nullable — null means "use preset" which auto-generates
- `WeeklyScore` is a new table, no existing data affected

---

## Server Action Changes

### New File: `src/lib/actions/weekly-scores.ts`

```
Functions needed:
- submitWeeklyScores(leagueSlug, weekNumber, scores[]) — Bulk submit all team scores for a week
- previewWeeklyScores(leagueId, weekNumber, scores[]) — Calculate handicaps, net, ranking, points before submission
- getWeeklyScoreHistory(leagueId) — All weekly scores grouped by week
- getWeeklyScoreHistoryForSeason(seasonId) — Season-specific
- getTeamWeeklyScores(leagueId, teamId) — Single team's weekly history
- deleteWeeklyScores(leagueSlug, weekNumber) — Delete entire week of scores
- deleteTeamWeeklyScore(leagueSlug, scoreId) — Delete single team's score for a week
- markTeamDnp(leagueSlug, weekNumber, teamId) — Mark team as "Did Not Play"
```

### New File: `src/lib/actions/scoring-config.ts`

```
Functions needed:
- getScoringConfig(leagueId) — Get scoring type and point scale
- updateScoringConfig(leagueSlug, config) — Update scoring settings
- generatePointScale(preset, teamCount) — Generate point scale from preset
- getPointScalePresets() — Return available presets with descriptions
```

### Modified File: `src/lib/actions/standings.ts`

```
Changes needed:
- getSeasonLeaderboard() — Branch on scoringType to use correct ranking logic
- getLeaderboardWithMovement() — Same branching
- getAllTimeLeaderboard() — Handle mixed scoring types across seasons
- New: rankTeamsStrokePlay() — Stroke play ranking with counting method tiebreaker
- New: calculateStandingsAtWeekStrokePlay() — Week-by-week stroke play standings
```

### Modified File: `src/lib/actions/teams.ts`

```
Changes needed:
- Team stat updates need to be aware of scoring type
- For stroke play: W/L/T fields are unused (always 0)
- totalPoints still accumulates weekly position points
- getTeamPreviousScores() works the same for handicap calculation
```

### Modified File: `src/lib/handicap.ts`

```
Changes needed:
- getTeamPreviousScores() needs to pull from WeeklyScore model when scoringType is stroke_play
- calculateHandicap() unchanged (works with gross scores regardless of source)
- suggestPoints() — only used for match play, no changes needed
- New: calculateStrokePlayPoints(netScores[], pointScale) — Rank and award points
```

---

## UI Changes

### League Creation (`src/app/leagues/new/page.tsx`)

Add a scoring type selector to the creation form:
- **Match Play** (default) — "Teams compete head-to-head each week. Best for smaller leagues with defined schedules."
- **Stroke Play** — "All teams compete against the field each week. Best for larger leagues or flexible attendance."
- Visual cards with icons showing the difference
- Selection persists to the League model

### Admin Settings Tab (`src/app/league/[slug]/admin/components/SettingsTab.tsx`)

Add a new "Scoring Format" section:
- Scoring type display (read-only after first matchup/score is submitted, or with big warning)
- For stroke play:
  - Point scale preset selector (linear, weighted, PGA-style, custom)
  - Custom point table editor (if custom selected)
  - Bonus points configuration (show up bonus, beat handicap bonus)
  - DNP points configuration
  - Live preview: "With 8 teams, 1st place gets X pts, last gets Y pts"

### Admin Matchups Tab (`src/app/league/[slug]/admin/components/MatchupsTab.tsx`)

**For Match Play:** No changes — current behavior preserved.

**For Stroke Play:** Complete UI replacement for this tab:
- Tab label changes to "Weekly Scores" (or "Scores")
- Week selector at top
- Table showing ALL approved teams with:
  - Team name
  - Gross score input
  - Sub checkbox
  - DNP checkbox (marks team as absent)
  - Manual handicap input (for week 1 or subs)
  - Calculated handicap (auto)
  - Calculated net score (auto)
- "Preview" button shows all teams ranked with point awards
- "Submit Week" button submits all scores at once
- Recent weeks list with ability to view/delete
- No forfeit mode (doesn't apply to stroke play)

### Leaderboard (`src/components/LeaderboardTable.tsx`)

**For Match Play:** No changes — current columns preserved.

**For Stroke Play:** Different column set:
| Rank | Team | Handicap | Rounds | Total Points | Avg Net | Best Finish |
- Remove W/L/T columns
- Add "Avg Net" and "Best Finish" columns
- Movement indicators still work the same way
- Counting method tiebreaker displayed on hover/tooltip

### Match History (`src/app/league/[slug]/history/page.tsx`)

**For Match Play:** No changes — ScoreCard component preserved.

**For Stroke Play:** Different display:
- Each week shows a ranked table of all teams
- Shows gross, handicap, net, position, points for each team
- Week-over-week comparison available
- New component: `WeeklyScoreCard.tsx`

### Team Page (`src/app/league/[slug]/team/[teamId]/page.tsx`)

**For Match Play:** No changes.

**For Stroke Play:**
- Summary shows: total points, avg net, best finish, rounds played
- History shows weekly finishes instead of matchup results
- Handicap progression chart still works

### Handicap History (`src/app/league/[slug]/handicap-history/page.tsx`)

- Works the same for both modes (handicaps calculated from gross scores regardless)
- Source data just comes from different model (Matchup vs WeeklyScore)

---

## Implementation Phases

### Phase 1: Data Model & Configuration (Foundation)
1. Add `scoringType` and stroke play config fields to League schema
2. Create `WeeklyScore` model
3. Run migration
4. Create `scoring-config.ts` server actions
5. Add scoring type selector to league creation form
6. Add scoring configuration section to Settings tab
7. **Tests:** Verify migration, test scoring config CRUD

### Phase 2: Stroke Play Score Entry (Core Logic)
1. Create `weekly-scores.ts` server actions
2. Implement handicap calculation for stroke play (pull scores from WeeklyScore)
3. Implement point calculation (rank teams, apply point scale)
4. Create stroke play score entry UI in admin
5. Preview flow for stroke play scores
6. Bulk submission with transaction
7. **Tests:** Score submission, point calculation, handicap from weekly scores

### Phase 3: Stroke Play Standings & Display (Public)
1. Implement stroke play ranking in `standings.ts`
2. Counting method tiebreaker
3. Leaderboard display branching by scoring type
4. New `WeeklyScoreCard` component for history page
5. Update team page for stroke play display
6. Update handicap history for stroke play
7. **Tests:** Ranking logic, tiebreakers, all public pages

### Phase 4: Polish & Edge Cases
1. Season switching with different scoring types
2. All-time stats across mixed scoring types
3. Super-admin views for stroke play leagues
4. Warning when changing scoring type with existing data
5. DNP handling (absent teams, makeup weeks)
6. Point scale auto-resize when teams join/leave
7. **Tests:** Edge cases, E2E flows

---

## Edge Cases & Special Handling

### 1. DNP (Did Not Play)
- Teams that don't show up for a week get configurable DNP points (default 0)
- DNP weeks are excluded from handicap calculation (like subs in match play)
- Admin can mark teams as DNP before or after entering scores

### 2. Late Joiners
- Team joins mid-season, missed weeks 1-3
- Those weeks get 0 points (or configurable DNP points)
- Handicap starts fresh (week 1 behavior — manual entry for first score)
- Standings show them ranked by total points (will be behind, as expected)

### 3. Ties in Weekly Finish (Admin-Configurable)
- Two teams have same net score for the week
- **Admin chooses tie mode in settings:**
  - **Split (default):** Tied teams share the average of tied positions' points. Example: 3rd & 4th tie → both get average of 3rd + 4th place points. Next team gets 5th.
  - **Same Position:** All tied teams get the higher position's points. Example: 3rd & 4th tie → both get 3rd-place points. Next team gets 5th.
- Both modes skip positions (2 teams tie for 3rd → next is 5th, not 4th). This is standard golf tournament scoring.

### 4. Substitutes
- Sub plays for a team → score counts for weekly ranking but excluded from handicap calc
- Same behavior as current match play sub handling

### 5. Changing Scoring Type
- Dangerous if matchups/scores already exist
- Show warning: "Changing scoring type will not convert existing data. Previous season data will remain in its original format."
- Recommend creating a new season after changing type
- Block change if current season has any submitted matchups/scores

### 6. Variable Team Count
- Point scale should be tied to preset + actual participants that week
- If 8 teams approved but only 6 play this week, scale adjusts for 6
- Admin sees preview before confirming

### 7. Bonus Points (Admin-Configurable)
- Show-up bonus: Awarded to any team that submits a score (not DNP). Admin sets amount (default 0 = off).
- Beat-handicap bonus: Awarded if net score < base score (played better than their handicap predicted). Admin sets amount (default 0 = off).
- Bonuses are added on top of position points

### 8. DNP Penalties (Admin-Configurable)
- **DNP Points** (default 0): Points a team receives for weeks they don't play. Admin can set this to a positive number to be generous (e.g., last-place equivalent) or leave at 0.
- **DNP Penalty** (default 0): Additional negative point penalty for no-shows. Some leagues want to discourage absences. Admin sets a value (e.g., -2 means lose 2 points per absence).
- **Max DNPs** (default: unlimited): If set, a team that exceeds this number of DNPs is automatically excluded from season standings. Shows as "inactive" on leaderboard.
- All three are independent and stackable.

### 9. Pro-Rated Standings (Admin-Configurable)
- **Pro-rate toggle** (default: off): When enabled, season standings use **points per round** instead of total points. This normalizes for teams that have played different numbers of rounds (late joiners, DNPs).
- Shown on leaderboard as "Avg Pts/Round" column when enabled.
- Admin can enable/disable at any point during the season (recalculates standings).

### 10. Hybrid Mode (Admin-Configurable)
- Admin selects "Hybrid" scoring type
- Matchups are entered like match play (head-to-head, 20-point split)
- Additionally, ALL teams that week are ranked by net score and awarded field position points
- Admin configures the **weight split** via a slider:
  - 50/50 (default): Half match points, half field points
  - 70/30: Emphasizes head-to-head
  - 30/70: Emphasizes field performance
  - 100/0: Effectively match play
  - 0/100: Effectively stroke play with unnecessary matchups
- Standings use the weighted combination
- Both W/L/T and weekly finish position are tracked and displayed

---

## Files to Create
- `src/lib/actions/weekly-scores.ts`
- `src/lib/actions/scoring-config.ts`
- `src/app/league/[slug]/admin/components/WeeklyScoresTab.tsx`
- `src/components/WeeklyScoreCard.tsx`

## Files to Modify
- `prisma/schema.prisma` — Add scoringType, WeeklyScore model, point config fields
- `src/lib/actions/standings.ts` — Branch ranking logic by scoring type
- `src/lib/actions/index.ts` — Re-export new modules
- `src/lib/actions/teams.ts` — Aware of scoring type for stats
- `src/lib/handicap.ts` — Pull scores from correct model
- `src/app/leagues/new/page.tsx` — Scoring type selector
- `src/app/league/[slug]/admin/page.tsx` — Conditional tab rendering
- `src/app/league/[slug]/admin/components/SettingsTab.tsx` — Scoring config section
- `src/app/league/[slug]/admin/components/MatchupsTab.tsx` — Conditionally render or swap
- `src/components/LeaderboardTable.tsx` — Branch columns by scoring type
- `src/components/ScoreCard.tsx` — May need stroke play variant
- `src/app/league/[slug]/leaderboard/page.tsx` — Pass scoring type to components
- `src/app/league/[slug]/history/page.tsx` — Branch display by scoring type
- `src/app/league/[slug]/team/[teamId]/page.tsx` — Branch stats display
- `src/app/league/[slug]/handicap-history/page.tsx` — Pull from correct model

---

## Open Questions — RESOLVED

All previously open questions are now resolved as **admin-configurable options**:

| Question | Resolution | Default |
|----------|-----------|---------|
| Hybrid mode? | Yes — third scoring type option | N/A (admin picks mode) |
| Tie handling? | Admin chooses: split avg or same position | Split (average) |
| No-show penalties? | Admin sets penalty amount | 0 (disabled) |
| Max DNPs? | Admin sets threshold or unlimited | Unlimited |
| Pro-rate for late joiners? | Admin toggles pro-rate for entire league | Off |

**Philosophy:** Every league is different. Rather than making opinionated platform decisions, we give admins full control with sensible defaults that match common casual league behavior. Advanced options are tucked into expandable sections so they don't overwhelm new admins.
