# Stage 6: Polish, Public Schedule, & Edge Cases

**Features:** F1 Phase 4 + F2 Phase 5
**Prerequisites:** Stages 1-5 complete
**Estimated scope:** Public schedule page, navigation updates, edge case handling, cross-feature polish

---

## What This Stage Accomplishes

After this stage:
- Public schedule page exists at `/league/[slug]/schedule`
- Schedule link appears in league navigation (respects visibility setting)
- All edge cases are handled (season switching, scoring type changes, all-time stats)
- Super-admin views show scoring type and schedule info
- Scoring type change warnings are in place
- DNP handling is complete and consistent
- Point scale auto-resizes correctly
- The entire feature set is production-ready

---

## Task 1: Public Schedule Page

**New file:** `src/app/league/[slug]/schedule/page.tsx`

Server component that displays the league's schedule publicly.

### Behavior based on `scheduleVisibility` setting:

#### `"full"` — Show everything
- All past weeks with scores
- Current week highlighted
- All future weeks with pairings
- Bye weeks clearly marked

#### `"current_week"` — Show current + past only
- All past weeks with scores
- Current week highlighted
- Future weeks hidden — show "Schedule for upcoming weeks will be revealed each week"

#### `"hidden"` — No public schedule
- Redirect to league home page, or show "This league's schedule is not publicly available"

### Layout:

```
League Schedule — [Season Name]

[Season Selector dropdown]

Week 1 (Jan 15) ✅ Completed
├── Alpha vs Bravo — 12-8 (Alpha)
├── Charlie vs Delta — 10-10 (Tie)
├── Echo vs Foxtrot — 14-6 (Echo)
└── Golf — BYE (10 pts)

Week 2 (Jan 22) ✅ Completed
├── ...

➤ Week 5 (Feb 12) — This Week
├── Alpha vs Delta — Pending
├── Bravo vs Echo — Pending
├── Charlie vs Golf — Pending
└── Foxtrot — BYE

Week 6 (Feb 19) — Upcoming
├── Alpha vs Echo
├── ...

[Playoff Weeks section if configured]
Week 15 — Playoffs (TBD based on standings)
Week 16 — Championship
```

### Features:
- Current week auto-scrolled to view
- Completed matches show point spread and winner
- Team names are clickable links to team detail pages
- Bye weeks show point award amount
- Playoff weeks show as "TBD" until bracket is determined
- Season selector switches between historical schedules
- Responsive design (card layout on mobile)

### Data fetching:
```typescript
const league = await getLeaguePublicInfo(slug);
const schedule = await getSchedule(league.id, seasonId);
const seasons = await getSeasons(league.id);
```

---

## Task 2: Team-Specific Schedule View

**File:** `src/app/league/[slug]/team/[teamId]/page.tsx`

Add a "Schedule" section to the team detail page:

- Show this team's upcoming and past matchups from the schedule
- Completed matches show scores
- Upcoming matches show opponent name
- Bye weeks shown

Fetch via `getTeamSchedule(leagueId, teamId)`.

Only show if schedule exists for the league.

---

## Task 3: Add Schedule to Navigation

**File:** `src/components/Navigation.tsx`

Add "Schedule" link to the league-specific navigation, between "History" and "Sign Up":

```
Home | Leaderboard | History | Schedule | Sign Up | Admin
```

### Conditional display:
- Only show if `scheduleVisibility !== "hidden"`
- Only show if `scoringType !== "stroke_play"` (stroke play has no schedule to show)
- Fetch league's schedule visibility and scoring type to determine display

This requires passing schedule info to the navigation. Since `Navigation` is rendered in the layout, and league data is fetched per-page, consider:
- Option A: Fetch basic league config in the layout and pass to nav
- Option B: Use a lightweight API call to check schedule visibility
- Option C: Always render the link and have the schedule page handle the "hidden" case

**Recommended: Option C** — simpler, no layout changes. The schedule page itself shows "not available" when hidden.

But still hide the nav link when `scoringType === "stroke_play"` since there's no schedule at all. This can be done by checking the pathname and fetching minimal league data.

---

## Task 4: Scoring Type Change Safeguards

**File:** `src/app/league/[slug]/admin/components/SettingsTab.tsx`

### Warning when changing scoring type:

When admin changes the scoring type selector:

1. Check if current season has any submitted data (matchups for match play, weekly scores for stroke play)
2. If data exists:
   - Show red warning: "The current season has existing [matchups/scores]. Changing the scoring type will not convert this data. Create a new season after changing to start fresh."
   - Block the save (require season change first)
3. If no data exists:
   - Show yellow info: "Scoring type will be changed. This affects how scores are entered and standings are calculated."
   - Allow save

### Read-only display after data exists:

If the current season has data, show the scoring type as a badge/label instead of a selector, with a note: "To change scoring type, create a new season first."

---

## Task 5: Season Switching with Mixed Types

**File:** `src/app/league/[slug]/leaderboard/page.tsx` (and history, handicap-history)

When viewing historical seasons that used a different scoring type:

- Detect the scoring type from the season's matchup/weekly score data (or store it on Season)
- Render the appropriate leaderboard/history format
- Show a note: "This season used [Match Play/Stroke Play] scoring"

### Schema consideration:

Add `scoringType` to the Season model to preserve what type was active during that season:

**File:** `prisma/schema.prisma` — Add to Season model:
```prisma
  scoringType   String?   // Preserved from league at season creation time
```

**File:** `src/lib/actions/seasons.ts` — Modify `createSeason()`:
```typescript
// When creating a season, snapshot the league's current scoringType
const league = await prisma.league.findUniqueOrThrow({
  where: { id: session.leagueId },
  select: { scoringType: true },
});

// Include in season creation data:
scoringType: league.scoringType,
```

This ensures historical seasons display correctly even if the league later changes its scoring type.

---

## Task 6: All-Time Stats for Mixed Scoring Types

**File:** `src/lib/actions/standings.ts`

### Modify `getAllTimeLeaderboard(leagueId)`

When aggregating across seasons with different scoring types:
- Group by team name (existing behavior)
- Show total points, rounds played, avg points/round
- W/L/T only shown for match play seasons
- Note in UI: "All-time stats combine data from multiple scoring formats"

For the all-time view, use a unified display:
| Rank | Team | Seasons | Rounds | Total Points | Avg Pts/Rd |

This works for all scoring types since all accumulate totalPoints on the Team model.

---

## Task 7: Super-Admin Views

**File:** `src/app/sudo/page.tsx` and `src/app/sudo/leagues/[id]/page.tsx`

Add scoring type and schedule info to super-admin views:

### League list:
Add columns/badges: "Match Play", "Stroke Play", "Hybrid"

### League detail:
Show:
- Scoring type with description
- Schedule status (generated/not generated, weeks completed)
- Point scale configuration
- Bye point mode

---

## Task 8: DNP Handling Polish

Ensure consistent DNP behavior across all features:

### Stroke play:
- [ ] DNP teams get configured `strokePlayDnpPoints`
- [ ] DNP penalty applied (negative points)
- [ ] DNP teams excluded from handicap calculation
- [ ] Teams exceeding `strokePlayMaxDnp` shown as "Inactive" on leaderboard
- [ ] DNP count visible on team detail page

### Match play:
- [ ] Teams not in the schedule for a week are implicitly DNP (bye)
- [ ] Bye point mode handles this via the schedule system

### Hybrid:
- [ ] DNP for field points = team didn't submit a score that week
- [ ] DNP for match play = forfeit or bye
- [ ] Both tracked independently

---

## Task 9: Point Scale Auto-Resize

**File:** `src/lib/actions/weekly-scores.ts` (and scoring-config.ts)

When the number of teams changes (team joins or leaves):
- If using a preset: auto-regenerate the point scale for new team count
- If using custom: warn admin that custom scale may need updating
  - If custom scale has fewer positions than teams: extend with 1s (minimum points)
  - If custom scale has more positions than teams: truncate (safe)

### In `previewWeeklyScores()`:
```typescript
const approvedTeamCount = scores.filter(s => !s.isDnp).length;
const pointScale = config.strokePlayPointScale
  ?? generatePointScale(config.strokePlayPointPreset, approvedTeamCount);

// Ensure scale covers all playing teams
while (pointScale.length < approvedTeamCount) {
  pointScale.push(1);
}
```

---

## Task 10: Stroke Play League — Week Management (Simple Scheduling)

For stroke play leagues, the "Schedule" concept is simpler — no pairings needed. But admin may still want to:
- Define how many weeks in the season
- Mark which weeks are "active" (e.g., skip holiday weeks)
- See which weeks have scores submitted

Add a lightweight "Week Management" section to either the Settings tab or SeasonsTab for stroke play leagues. This could be a simple checklist of weeks with status indicators.

---

## Task 11: Error States & Empty States

Review all new pages and components for proper empty/error states:

### Schedule page:
- No schedule generated: "This league hasn't set up a schedule yet."
- Schedule hidden: "This league's schedule is not publicly available."
- No season: "No active season."

### Leaderboard (stroke play):
- No scores yet: "No scores have been submitted for this season yet."
- All teams DNP: Shouldn't happen, but handle gracefully

### History (stroke play):
- No weeks submitted: "No weekly scores have been entered yet."

### Team page:
- Team has no scores: "This team hasn't played any rounds yet."

---

## Acceptance Criteria

When this stage is complete, verify:

### Public Schedule Page:
- [ ] `/league/[slug]/schedule` renders correctly
- [ ] Full visibility shows all weeks (past, current, future)
- [ ] Current-week-only hides future matchups
- [ ] Hidden redirects or shows "not available" message
- [ ] Completed weeks show scores
- [ ] Current week highlighted visually
- [ ] Bye weeks show point amounts
- [ ] Season selector switches between historical schedules
- [ ] Responsive on mobile

### Navigation:
- [ ] "Schedule" link appears for match play / hybrid leagues with non-hidden schedules
- [ ] "Schedule" link does NOT appear for stroke play leagues
- [ ] Link correctly routes to `/league/[slug]/schedule`

### Team Detail:
- [ ] Team's schedule shows on their detail page
- [ ] Works for all scoring types

### Scoring Type Safeguards:
- [ ] Cannot change scoring type when current season has data
- [ ] Warning shown when changing type without data
- [ ] Historical seasons remember their scoring type
- [ ] Leaderboard displays correct format for each historical season

### All-Time Stats:
- [ ] All-time leaderboard works with mixed scoring types
- [ ] Shows unified columns (points, rounds, avg)

### Super-Admin:
- [ ] Scoring type badges visible in league list
- [ ] Schedule status visible in league detail

### Edge Cases:
- [ ] Point scale auto-resizes when team count changes
- [ ] DNP handling consistent across all scoring types
- [ ] Empty states render cleanly for all new pages/components
- [ ] Pro-rate mode works correctly for late joiners

### Final Integration:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] Full end-to-end flow: create stroke play league → enter scores → view leaderboard
- [ ] Full end-to-end flow: create match play league → generate schedule → enter scores → view schedule
- [ ] Full end-to-end flow: create hybrid league → both entry methods → combined leaderboard
- [ ] Mid-season team addition with all 4 strategies
- [ ] Season switching between different scoring types
