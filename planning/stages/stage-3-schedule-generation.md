# Stage 3: Schedule Generation & Admin Management

**Feature:** F2 Phase 2
**Prerequisites:** Stage 1 complete (ScheduledMatchup model exists, round-robin algorithm exists, schedule config actions exist)
**Estimated scope:** 1 new server action file, 1 new admin tab component

---

## What This Stage Accomplishes

After this stage:
- Admin can generate a round-robin schedule from the Schedule tab
- Schedule previews before saving
- Full schedule view shows all weeks with status (completed/pending/upcoming)
- Admin can manually swap teams in unplayed matchups
- Admin can cancel or reschedule individual matchups
- Admin can clear the schedule and regenerate
- Bye weeks are clearly displayed
- Schedule tab only appears for match play and hybrid leagues

---

## Task 1: Create Schedule Server Actions

**New file:** `src/lib/actions/schedule.ts`

### Functions to implement:

#### Generation

##### `generateSchedule(leagueSlug, type, totalWeeks, startWeek?)`
- Require league admin auth
- Get all approved teams for active season
- Validate: at least 2 teams, totalWeeks >= 1
- Call the pure round-robin function from `src/lib/scheduling/round-robin.ts`
- If `playoffWeeks > 0`, reserve that many weeks at end (reduce schedulable weeks)
- If `scheduleExtraWeeks === "continue_round"` and totalWeeks > round-robin needs, generate additional rounds
- In a `$transaction`:
  - Delete any existing scheduled matchups for this season with status "scheduled"
  - Create all new ScheduledMatchup records
  - Update league's `scheduleType` field
- Return the generated schedule

##### `previewSchedule(leagueId, type, totalWeeks)`
- Same calculation as generate but does NOT save to database
- Returns the rounds for display in the preview modal
- No auth required (read-only calculation)

##### `clearSchedule(leagueSlug, seasonId)`
- Delete all ScheduledMatchups with status "scheduled" for the season
- Do NOT delete completed ones (they link to actual matchups)
- Reset league's `scheduleType` to null
- Admin auth required

#### Retrieval

##### `getSchedule(leagueId, seasonId?)`
- Fetch all ScheduledMatchups for the league/season
- Include team names via join
- Include linked matchup data (scores) for completed ones
- Group by weekNumber
- Return structured data:

```typescript
export interface ScheduleWeek {
  weekNumber: number;
  matches: Array<{
    id: number;
    teamA: { id: number; name: string };
    teamB: { id: number; name: string } | null; // null = bye
    status: "scheduled" | "completed" | "cancelled";
    matchup?: { // present when completed
      teamAPoints: number;
      teamBPoints: number;
      teamANet: number;
      teamBNet: number;
    };
  }>;
}
```

##### `getScheduleForWeek(leagueId, weekNumber)`
- Single week's scheduled matchups
- Used by MatchupsTab to show "This week's schedule"

##### `getTeamSchedule(leagueId, teamId)`
- Single team's full schedule across all weeks
- Used for team detail page and public team schedule

##### `getScheduleStatus(leagueId, seasonId?)`
- Summary stats: total weeks, completed weeks, remaining weeks, schedule type
- Used for Schedule tab header

#### Modification

##### `swapTeamsInMatchup(leagueSlug, scheduledMatchupId, newTeamAId, newTeamBId)`
- Only allowed on "scheduled" status matchups
- Validate both teams exist and are approved
- Update the ScheduledMatchup record

##### `cancelScheduledMatchup(leagueSlug, scheduledMatchupId)`
- Set status to "cancelled"
- Only allowed on "scheduled" status

##### `rescheduleMatchup(leagueSlug, scheduledMatchupId, newWeekNumber)`
- Move a scheduled matchup to a different week
- Validate no conflicts (team already playing that week)
- Only allowed on "scheduled" status

##### `addManualScheduledMatchup(leagueSlug, weekNumber, teamAId, teamBId?)`
- Add a one-off matchup to the schedule
- teamBId null = bye week
- Validate no conflicts

### Key types:

```typescript
export interface ScheduleGenerationOptions {
  type: "single_round_robin" | "double_round_robin";
  totalWeeks: number;
  startWeek?: number;
}
```

---

## Task 2: Create Schedule Admin Tab

**New file:** `src/app/league/[slug]/admin/components/ScheduleTab.tsx`

### Three states:

#### State 1: No Schedule (schedule not generated yet)

Show a generation form:
- Schedule type radio: Single Round-Robin / Double Round-Robin
  - Show explanation: "8 teams, single = 7 weeks. 8 teams, double = 14 weeks."
- Total weeks input (auto-calculated from team count, editable)
- Start week input (default 1)
- Team count display: "8 approved teams will be scheduled"
- Info about playoff weeks: "2 playoff weeks reserved (configured in Settings)" if applicable
- **[Preview Schedule]** button → shows full schedule in a modal/expandable section
- **[Generate & Save]** button → saves to database

#### State 2: Schedule Exists

Header bar:
- "Schedule · {type} · {totalWeeks} weeks · {teamCount} teams"
- **[Regenerate]** button (with confirmation warning)
- **[Clear Schedule]** button (with confirmation)

Week-by-week accordion view:
- Each week is collapsible
- **Completed weeks (green):** Show team names + scores from linked matchup
- **Current week (highlighted):** Show team pairings with "Enter Scores" button per matchup
- **Upcoming weeks:** Show team pairings only
- **Cancelled matchups:** Show with strikethrough

Per-matchup actions (only on "scheduled" status):
- **Swap** — Opens a dialog to select different teams
- **Move** — Opens a dialog to pick a different week number
- **Cancel** — Marks as cancelled with confirmation
- **Add Matchup** — Button at the bottom of each week to add a manual matchup

Bye weeks:
- Show team name with "BYE" badge
- Show bye point amount based on league config

#### State 3: Schedule Exists + Team Being Added Mid-Season
(Deferred to Stage 5 — for now, regeneration handles this)

### Props:
```typescript
interface ScheduleTabProps {
  slug: string;
  leagueId: number;
  teams: Team[];
  activeSeason: { id: number; name: string } | null;
  scheduleConfig: ScheduleConfig;
  onDataRefresh: () => void;
}
```

---

## Task 3: Add Schedule Tab to Admin Page

**File:** `src/app/league/[slug]/admin/page.tsx`

### Import:
```typescript
import ScheduleTab from "./components/ScheduleTab";
```

### Update tab list:
Add "schedule" tab — it appears for match_play and hybrid leagues, positioned after matchups/scores and before teams:

```typescript
const tabs = useMemo(() => {
  const t: string[] = [];
  if (league.scoringType !== "stroke_play") t.push("matchups");
  if (league.scoringType !== "match_play") t.push("scores");
  if (league.scoringType !== "stroke_play") t.push("schedule");
  t.push("teams", "settings", "about", "seasons");
  return t;
}, [league.scoringType]);
```

### Add tab content rendering:
```typescript
{activeTab === "schedule" && (
  <ScheduleTab
    slug={slug}
    leagueId={league.id}
    teams={teams}
    activeSeason={activeSeason}
    scheduleConfig={scheduleConfig}
    onDataRefresh={() => loadInitialData()}
  />
)}
```

### Load schedule config in `loadInitialData()`:
Fetch `getScheduleConfig(leagueData.id)` alongside other initial data.

### Update the `activeTab` state type to include `"schedule"`.

---

## Task 4: Update Barrel Exports

**File:** `src/lib/actions/index.ts`

```typescript
export {
  generateSchedule,
  previewSchedule,
  clearSchedule,
  getSchedule,
  getScheduleForWeek,
  getTeamSchedule,
  getScheduleStatus,
  swapTeamsInMatchup,
  cancelScheduledMatchup,
  rescheduleMatchup,
  addManualScheduledMatchup,
  type ScheduleWeek,
  type ScheduleGenerationOptions,
} from "./schedule";
```

---

## Acceptance Criteria

When this stage is complete, verify:

- [ ] Match play league admin sees "Schedule" tab
- [ ] Stroke play league admin does NOT see "Schedule" tab
- [ ] Can preview a single round-robin for 8 teams → 7 weeks displayed
- [ ] Can preview a double round-robin for 8 teams → 14 weeks displayed
- [ ] Preview shows balanced pairings (every team plays every other)
- [ ] Odd team count (7 teams) shows bye weeks, evenly distributed
- [ ] Generating saves ScheduledMatchup records to database
- [ ] Schedule view displays all weeks correctly
- [ ] Can swap teams in an unplayed matchup
- [ ] Can cancel an unplayed matchup
- [ ] Can move an unplayed matchup to a different week
- [ ] Can add a manual matchup to any week
- [ ] Cannot edit completed matchups
- [ ] Clearing schedule removes all "scheduled" records but keeps "completed" ones
- [ ] Regenerating warns about overwriting then replaces unplayed schedule
- [ ] Playoff weeks are excluded from round-robin generation
- [ ] Bye point amounts display based on league config
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
