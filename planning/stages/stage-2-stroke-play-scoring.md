# Stage 2: Stroke Play Score Entry (Core Logic)

**Feature:** F1 Phase 2
**Prerequisites:** Stage 1 complete (schema migrated, scoring config exists)
**Estimated scope:** 1 new server action file, 1 new admin tab component, handicap.ts modifications

---

## What This Stage Accomplishes

After this stage:
- Admin of a stroke play league can enter scores for all teams in a given week
- System calculates handicaps, net scores, rankings, and points automatically
- Admin sees a preview before submitting (like match play preview)
- Admin can override points before confirming
- Scores are saved to the WeeklyScore table with position-based points
- Team totalPoints are updated atomically
- Admin can delete a week's scores
- Handicap calculations pull from WeeklyScore when league is stroke play

---

## Task 1: Create Weekly Scores Server Actions

**New file:** `src/lib/actions/weekly-scores.ts`

### Functions to implement:

#### `previewWeeklyScores(leagueId, weekNumber, scores[])`
- Input: array of `{ teamId, grossScore, isSub, isDnp, manualHandicap? }`
- For each non-DNP team:
  - Calculate handicap from previous weekly scores (or use manual for week 1/subs)
  - Calculate net score = gross - handicap
- Rank all non-DNP teams by net score (lowest = 1st)
- Handle ties based on league's `strokePlayTieMode`:
  - **split**: tied teams share average of their positions' points
  - **same**: all tied teams get the higher position's points
- Apply point scale (from preset or custom)
- Add bonus points (show-up bonus, beat-handicap bonus)
- For DNP teams: award `strokePlayDnpPoints` and apply `strokePlayDnpPenalty`
- Return preview data with all calculations visible

#### `submitWeeklyScores(leagueSlug, weekNumber, scores[])`
- Validate with Zod schema
- Require league admin auth
- Get active season
- In a single `$transaction`:
  - Create all WeeklyScore records for the week
  - Update each team's `totalPoints` by incrementing their awarded points
- Return success/error

#### `getWeeklyScoreHistory(leagueId)`
- Fetch all WeeklyScores for a league, grouped by week
- Include team names via join
- Order by weekNumber desc, position asc

#### `getWeeklyScoreHistoryForSeason(seasonId)`
- Same as above but filtered by seasonId

#### `getTeamWeeklyScores(leagueId, teamId)`
- Single team's weekly history
- Used for team detail page

#### `deleteWeeklyScores(leagueSlug, weekNumber)`
- Delete all scores for a given week
- In a `$transaction`:
  - Decrement each team's totalPoints by their awarded points
  - Delete all WeeklyScore records for that week/season
- Admin auth required

#### `getCurrentStrokePlayWeek(leagueId, seasonId?)`
- Returns max weekNumber from WeeklyScore + 1 (or 1 if no scores)

### Key types:

```typescript
export interface WeeklyScoreInput {
  teamId: number;
  grossScore: number;
  isSub: boolean;
  isDnp: boolean;
  manualHandicap?: number | null;
}

export interface WeeklyScorePreview {
  weekNumber: number;
  isWeekOne: boolean;
  scores: Array<{
    teamId: number;
    teamName: string;
    grossScore: number;
    handicap: number;
    netScore: number;
    position: number;
    points: number;
    bonusPoints: number;
    totalPoints: number; // points + bonusPoints
    isSub: boolean;
    isDnp: boolean;
  }>;
}

export interface WeeklyScoreRecord {
  id: number;
  weekNumber: number;
  team: { id: number; name: string };
  grossScore: number;
  handicap: number;
  netScore: number;
  position: number;
  points: number;
  isSub: boolean;
  isDnp: boolean;
}
```

---

## Task 2: Point Calculation Logic

**New file or add to:** `src/lib/handicap.ts`

Add a new exported function:

#### `calculateStrokePlayPoints(netScores, pointScale, tieMode, bonusConfig)`

```typescript
export function calculateStrokePlayPoints(
  entries: Array<{ teamId: number; netScore: number; isDnp: boolean; grossScore: number }>,
  pointScale: number[],
  tieMode: "split" | "same",
  bonusConfig: { showUpBonus: number; beatHandicapBonus: number; baseScore: number; dnpPoints: number; dnpPenalty: number }
): Array<{ teamId: number; position: number; points: number; bonusPoints: number }> {
```

Algorithm:
1. Separate DNP teams from playing teams
2. Sort playing teams by netScore ascending (lower = better in golf)
3. Assign positions, handling ties:
   - **split**: Positions 3 & 4 tied → both get position 3, both get avg of scale[2] + scale[3], next team gets position 5
   - **same**: Positions 3 & 4 tied → both get position 3, both get scale[2], next team gets position 5
4. If more playing teams than scale length, extend scale with 0s (or 1)
5. Apply bonuses:
   - showUpBonus: +X for each non-DNP team
   - beatHandicapBonus: +X if netScore < baseScore
6. DNP teams: points = dnpPoints + dnpPenalty (penalty is negative or 0)

---

## Task 3: Modify Handicap Score Source

**File:** `src/lib/actions/handicap-settings.ts` and/or `src/lib/actions/teams.ts`

The existing `getTeamPreviousScores(leagueId, teamId)` pulls gross scores from the Matchup table. For stroke play leagues, it needs to pull from WeeklyScore instead.

Create a new function or modify existing:

```typescript
export async function getTeamPreviousScoresForScoring(
  leagueId: number,
  teamId: number,
  scoringType: string
): Promise<number[]> {
  if (scoringType === "match_play") {
    return getTeamPreviousScores(leagueId, teamId); // existing function
  }

  // Stroke play / hybrid: pull from WeeklyScore
  const scores = await prisma.weeklyScore.findMany({
    where: {
      leagueId,
      teamId,
      isDnp: false,
      isSub: false,
    },
    orderBy: { weekNumber: "asc" },
    select: { grossScore: true },
  });

  return scores.map(s => s.grossScore);
}
```

For hybrid mode, use both sources (matchup scores for match play handicap, weekly scores for field handicap — or just pick one). Decision: use the same gross scores regardless, since the handicap formula is the same. Prefer weekly scores if they exist, fall back to matchup scores.

---

## Task 4: Create WeeklyScores Admin Tab

**New file:** `src/app/league/[slug]/admin/components/WeeklyScoresTab.tsx`

This is the stroke play equivalent of MatchupsTab. It replaces MatchupsTab when `scoringType !== "match_play"`.

### UI Layout:

**Top section:**
- Week number selector (auto-advances like match play)
- "Week N of X" indicator

**Score entry table:**
| Team | Gross Score | Sub? | DNP? | Handicap | Net | Actions |
|------|------------|------|------|----------|-----|---------|
| Team Alpha | [input] | [ ] | [ ] | Auto/Manual | Auto | - |
| Team Bravo | [input] | [ ] | [ ] | Auto/Manual | Auto | - |
| ... | | | | | | |

- All approved teams listed automatically
- Manual handicap input shown for week 1 or when Sub is checked
- DNP checkbox greys out the score inputs
- "Preview" button below the table

**Preview section (shown after clicking Preview):**
| Pos | Team | Gross | Handicap | Net | Points | Bonus | Total |
|-----|------|-------|----------|-----|--------|-------|-------|
| 1st | Team Alpha | 34 | 3 | 31 | 8 | +2 | 10 |
| 2nd | Team Bravo | 38 | 5 | 33 | 7 | +2 | 9 |
| T3  | Team Charlie | 40 | 4 | 36 | 5.5 | +2 | 7.5 |
| T3  | Team Delta | 39 | 3 | 36 | 5.5 | +2 | 7.5 |
| DNP | Team Echo | - | - | - | 0 | 0 | 0 |

- Position column shows T3 for ties
- Bonus column shows show-up + beat-handicap bonuses
- Points can be manually overridden per team (like match play)
- "Submit Week N Scores" button

**Recent weeks section:**
- Collapsible list of recently submitted weeks
- Each shows team rankings for that week
- Delete button per week (with confirmation)

### Props:
```typescript
interface WeeklyScoresTabProps {
  slug: string;
  leagueId: number;
  teams: Team[];
  weekNumber: number;
  scoringConfig: ScoringConfig;
  onDataRefresh: (data: { weekNumber?: number }) => void;
}
```

---

## Task 5: Conditional Tab Rendering in Admin Page

**File:** `src/app/league/[slug]/admin/page.tsx`

The admin page needs to show different tabs based on scoring type:

- **Match Play:** Matchups | Teams | Schedule | Settings | About | Seasons
- **Stroke Play:** Weekly Scores | Teams | Settings | About | Seasons
- **Hybrid:** Matchups | Weekly Scores | Teams | Schedule | Settings | About | Seasons

Update the tab list to be dynamic:

```typescript
const tabs = useMemo(() => {
  const base: string[] = [];
  if (league.scoringType !== "stroke_play") base.push("matchups");
  if (league.scoringType !== "match_play") base.push("scores");
  base.push("teams", "settings", "about", "seasons");
  return base;
}, [league.scoringType]);
```

Update the `activeTab` state type and rendering logic to handle the new tab.

Import and render `WeeklyScoresTab` when `activeTab === "scores"`.

Pass `scoringType` down to MatchupsTab so it knows when in hybrid mode.

---

## Task 6: Update Barrel Exports

**File:** `src/lib/actions/index.ts`

Add exports from the new weekly-scores module:

```typescript
export {
  previewWeeklyScores,
  submitWeeklyScores,
  getWeeklyScoreHistory,
  getWeeklyScoreHistoryForSeason,
  getTeamWeeklyScores,
  deleteWeeklyScores,
  getCurrentStrokePlayWeek,
  type WeeklyScorePreview,
  type WeeklyScoreRecord,
} from "./weekly-scores";
```

---

## Acceptance Criteria

When this stage is complete, verify:

- [ ] Create a new league with "Stroke Play" scoring type
- [ ] Admin dashboard shows "Weekly Scores" tab instead of "Matchups"
- [ ] Can enter gross scores for all teams in a week
- [ ] Preview shows correct rankings, handicaps, net scores, and position-based points
- [ ] Points match the selected preset (linear/weighted/PGA)
- [ ] Ties are handled correctly based on tie mode setting
- [ ] DNP teams show with configured DNP points
- [ ] Show-up and beat-handicap bonuses apply correctly
- [ ] Submitting saves all WeeklyScore records to database
- [ ] Team totalPoints are updated correctly
- [ ] Week number auto-advances after submission
- [ ] Can delete a week's scores (totalPoints decremented correctly)
- [ ] Week 1 requires manual handicap entry
- [ ] Week 2+ auto-calculates handicaps from previous weekly scores
- [ ] Substitutes require manual handicap and are excluded from future handicap calc
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

### Hybrid mode (partial — full hybrid comes in Stage 4):
- [ ] Hybrid league shows both Matchups and Weekly Scores tabs
- [ ] Score entry works independently in each tab
