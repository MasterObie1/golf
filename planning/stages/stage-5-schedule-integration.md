# Stage 5: Schedule Integration & Mid-Season Team Management

**Feature:** F2 Phases 3-4
**Prerequisites:** Stage 3 complete (schedule generation works, schedule tab exists)
**Estimated scope:** Matchup submission integration, mid-season team flows, team action modifications

---

## What This Stage Accomplishes

After this stage:
- Submitting a matchup automatically marks the corresponding scheduled matchup as completed
- Matchup entry form pre-populates from the schedule when available
- Schedule tab shows "Enter Scores" quick action for current week's matches
- Deleting a matchup reverts the scheduled matchup back to "scheduled" status
- Adding a team mid-season triggers a schedule integration flow with 4 strategy options
- Removing a team mid-season handles their future scheduled matchups
- Bye week points are calculated and awarded based on admin config
- MatchupsTab shows schedule context (who's supposed to play this week)

---

## Task 1: Link Matchup Submission to Schedule

**File:** `src/lib/actions/matchups.ts`

### Modify `submitMatchup()`

After creating the matchup record (inside the transaction), check if a corresponding ScheduledMatchup exists:

```typescript
// After the matchup.create in the transaction, add:
// Find matching scheduled matchup for this week and team pair
const scheduledMatch = await prisma.scheduledMatchup.findFirst({
  where: {
    leagueId: session.leagueId,
    weekNumber: validated.weekNumber,
    status: "scheduled",
    OR: [
      { teamAId: validated.teamAId, teamBId: validated.teamBId },
      { teamAId: validated.teamBId, teamBId: validated.teamAId }, // reversed pairing
    ],
  },
});

if (scheduledMatch) {
  await prisma.scheduledMatchup.update({
    where: { id: scheduledMatch.id },
    data: {
      status: "completed",
      matchupId: newMatchup.id, // link to the actual result
    },
  });
}
```

Note: The scheduled matchup search checks both orderings (A vs B and B vs A) since the admin might enter teams in either order.

### Modify `deleteMatchup()`

When deleting a matchup, revert the linked scheduled matchup:

```typescript
// Before deleting the matchup, find and revert the schedule link
const scheduledMatch = await prisma.scheduledMatchup.findFirst({
  where: { matchupId: matchupId },
});

if (scheduledMatch) {
  await prisma.scheduledMatchup.update({
    where: { id: scheduledMatch.id },
    data: {
      status: "scheduled",
      matchupId: null,
    },
  });
}
```

Add this to the transaction.

### Modify `submitForfeit()`

Same pattern — find and mark corresponding scheduled matchup as completed.

---

## Task 2: Schedule-Aware Matchup Entry

**File:** `src/app/league/[slug]/admin/components/MatchupsTab.tsx`

### Show schedule context

At the top of the matchup entry form, if a schedule exists:

```
┌─────────────────────────────────────────────────┐
│  This Week's Schedule (Week 5)                   │
│                                                  │
│  Alpha vs Delta     [Enter Scores]               │
│  Bravo vs Echo      [Enter Scores]               │
│  Charlie vs Golf    [Enter Scores]               │
│  Foxtrot — BYE                                   │
│                                                  │
│  2 of 3 matches entered                          │
└─────────────────────────────────────────────────┘
```

- Each "Enter Scores" button pre-fills the team dropdowns
- Completed matches show a green checkmark with their score
- Bye teams show their bye point award
- Progress indicator: "X of Y matches entered"

### Pre-populate from schedule

When clicking "Enter Scores" for a scheduled matchup:
- Auto-select Team A and Team B dropdowns
- Lock the team selection (or show a warning if admin changes it)
- Rest of the flow is unchanged (enter gross scores → preview → submit)

### Off-schedule matchup warning

If admin manually selects teams that don't match the schedule for this week:
- Show a yellow warning: "This matchup is not on this week's schedule. You can still submit it."
- Do not block — admin has full control

### Fetch schedule data

The MatchupsTab needs to fetch `getScheduleForWeek(leagueId, weekNumber)` to display the schedule context. Add this to the component's data loading.

---

## Task 3: Bye Week Point Handling

**New function in:** `src/lib/actions/schedule.ts`

#### `processByeWeekPoints(leagueSlug, weekNumber)`

When all scheduled matchups for a week are completed (or admin manually triggers it):

1. Find all bye entries for this week (ScheduledMatchup where teamBId is null)
2. For each bye team, calculate points based on `byePointsMode`:
   - **zero:** 0 points
   - **flat:** `byePointsFlat` amount
   - **league_average:** Average of all team points awarded this week
   - **team_average:** This team's season average points per match
3. Increment the bye team's `totalPoints`
4. Optionally create a special WeeklyScore or Matchup record to track the bye (for history/auditing)

#### When to trigger:
- After each matchup submission, check if all scheduled matchups for that week are completed
- If yes, automatically process bye points
- Or: add a "Finalize Week" button in the MatchupsTab that processes byes

---

## Task 4: Mid-Season Team Addition Flow

**File:** `src/lib/actions/schedule.ts`

### New function: `addTeamToSchedule(leagueSlug, teamId, strategy)`

Called when a team is approved and a schedule exists.

#### Strategy: `"start_from_here"`
1. Get current week number
2. Generate a fresh round-robin with all teams (including new one)
3. Delete all "scheduled" matchups from current week forward
4. Insert new matchups from the fresh schedule (only weeks >= current week)
5. Preserve all "completed" matchups unchanged
6. New team gets 0 points for past weeks

#### Strategy: `"fill_byes"`
Only available when going from odd to even team count:
1. Find all future bye slots in the schedule
2. Replace bye entries with matchups against the new team
3. New team plays the teams that would have had byes
4. Past weeks: new team was absent (0 points)

#### Strategy: `"pro_rate"`
Same as "start_from_here" but also:
1. Enable `strokePlayProRate = true` on the league (if not already set)
2. This switches standings to points-per-match mode for the season

#### Strategy: `"catch_up"`
1. Same as "start_from_here" for the base schedule
2. Additionally, identify teams the new team hasn't played yet
3. Schedule extra matchups in upcoming weeks where possible (double-headers)
4. Mark extra matchups with a "catch_up" flag for clarity

### New function: `previewTeamAddition(leagueId, teamId, strategy)`
- Preview what the new schedule would look like
- Show which weeks change, what new matchups are created
- No database changes

---

## Task 5: Mid-Season Team Removal Flow

**File:** `src/lib/actions/schedule.ts`

### New function: `removeTeamFromSchedule(leagueSlug, teamId, action)`

Called when a team is deleted or suspended and a schedule exists.

#### Action: `"bye_opponents"` (default)
1. Find all future scheduled matchups involving this team
2. For each: set teamBId (or teamAId) to null, making it a bye for the opponent
3. Cancelled matchups noted in UI

#### Action: `"regenerate"`
1. Remove the team from the active roster
2. Delete all "scheduled" matchups from current week forward
3. Regenerate remaining schedule without this team
4. Preserve completed matchups

---

## Task 6: Trigger Schedule Flows from Team Actions

**File:** `src/lib/actions/teams.ts`

### Modify `approveTeam()`

After approving, check if a schedule exists for the active season:

```typescript
const hasSchedule = await prisma.scheduledMatchup.count({
  where: { leagueId: session.leagueId, seasonId: activeSeason?.id },
});

if (hasSchedule > 0) {
  // Return a flag indicating schedule integration is needed
  return {
    success: true,
    data: { teamId: team.id, scheduleIntegrationNeeded: true }
  };
}
```

The frontend then shows the "Add Team to Schedule" dialog (from Stage 3's ScheduleTab wireframe).

### Modify `deleteTeam()`

After deleting, if schedule exists, handle their matchups:

```typescript
if (hasSchedule > 0) {
  // Use the league's midSeasonRemoveAction default
  await removeTeamFromSchedule(leagueSlug, teamId, league.midSeasonRemoveAction);
}
```

---

## Task 7: Schedule Integration Dialog in TeamsTab

**File:** `src/app/league/[slug]/admin/components/TeamsTab.tsx`

When `approveTeam()` returns `scheduleIntegrationNeeded: true`, show a modal:

```
┌──────────────────────────────────────────────────┐
│  Add "New Team" to Schedule                       │
│                                                   │
│  A schedule exists for this season. How should     │
│  this team be integrated?                         │
│                                                   │
│  ● Start From Here (League Default)               │
│  ○ Fill Bye Slots (only if odd→even)              │
│  ○ Pro-Rated Standings                            │
│  ○ Catch-Up Matches                               │
│                                                   │
│  [Preview Impact]  [Confirm & Add]                │
└──────────────────────────────────────────────────┘
```

- Default selection matches the league's `midSeasonAddDefault` setting
- "Fill Bye Slots" only enabled when team count goes from odd to even
- "Preview Impact" shows which weeks change
- "Confirm & Add" executes the chosen strategy

---

## Task 8: Update Barrel Exports

**File:** `src/lib/actions/index.ts`

Add any new exports from the modified files:

```typescript
// Add to schedule exports:
export {
  // ... existing ...
  addTeamToSchedule,
  removeTeamFromSchedule,
  previewTeamAddition,
  processByeWeekPoints,
} from "./schedule";
```

---

## Acceptance Criteria

When this stage is complete, verify:

### Schedule ↔ Matchup Integration:
- [ ] Submitting a matchup that matches a scheduled one auto-marks it "completed"
- [ ] Works regardless of team order (A vs B or B vs A)
- [ ] Deleting a matchup reverts the scheduled matchup to "scheduled"
- [ ] Forfeit submission also links to scheduled matchup
- [ ] Schedule tab shows green checkmarks on completed matchups with scores

### Schedule-Aware Matchup Entry:
- [ ] MatchupsTab shows "This Week's Schedule" section when schedule exists
- [ ] "Enter Scores" button pre-fills team dropdowns
- [ ] Off-schedule matchup shows warning but still submittable
- [ ] Progress indicator shows "X of Y matches entered"

### Bye Week Points:
- [ ] Bye teams receive configured points (zero / flat / league avg / team avg)
- [ ] Points are awarded when all week's matchups are completed (or manually triggered)
- [ ] Bye points show in standings correctly

### Mid-Season Team Addition:
- [ ] Approving a team when schedule exists shows integration dialog
- [ ] "Start From Here" regenerates future schedule including new team
- [ ] "Fill Bye Slots" replaces byes with new team matches (odd→even only)
- [ ] "Pro-Rate" enables points-per-round mode
- [ ] "Catch-Up" schedules extra matches
- [ ] Preview shows schedule impact before confirming
- [ ] Completed matchups are never modified

### Mid-Season Team Removal:
- [ ] Deleting a team converts their future matchups to byes for opponents
- [ ] Or regenerates remaining schedule (based on league config)
- [ ] Completed matchups preserved

### General:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] No regressions in matchup entry without schedule
