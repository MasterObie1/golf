# Stage 4: Stroke Play Standings & Public Display

**Feature:** F1 Phase 3
**Prerequisites:** Stage 2 complete (stroke play scores can be entered and saved)
**Estimated scope:** Standings logic, leaderboard component branching, new score display component, 5+ page updates

---

## What This Stage Accomplishes

After this stage:
- Stroke play leaderboard shows correct rankings with appropriate columns
- Hybrid leaderboard shows weighted combination of match + field points
- Match history page displays weekly field results instead of head-to-head matchups
- Team detail pages show stroke play stats
- Handicap history works for stroke play leagues
- Movement tracking (rank/handicap changes) works for stroke play
- All public-facing pages adapt based on the league's scoring type

---

## Task 1: Stroke Play Ranking Logic

**File:** `src/lib/actions/standings.ts`

### New function: `rankTeamsStrokePlay(teams, weeklyScores, config)`

Ranking algorithm for stroke play:
1. **Primary: Total Points** — sum of all weekly position points (descending)
2. **Tiebreaker 1: Counting Method** — most 1st-place finishes, then most 2nds, then 3rds, etc.
3. **Tiebreaker 2: Average Net Score** — lower average net wins
4. **Tiebreaker 3: Best Single Week** — lowest single-week net score

```typescript
function rankTeamsStrokePlay(
  teams: TeamWithStats[],
  weeklyScores: WeeklyScoreForRanking[],
  config: { proRate: boolean; maxDnp: number | null }
) {
  // Calculate stats per team
  for (const team of teams) {
    const teamScores = weeklyScores.filter(s => s.teamId === team.id);
    const playedScores = teamScores.filter(s => !s.isDnp);

    // Check max DNP exclusion
    const dnpCount = teamScores.filter(s => s.isDnp).length;
    if (config.maxDnp !== null && dnpCount > config.maxDnp) {
      // Mark as excluded
    }

    // Position counts for counting method tiebreaker
    const positionCounts = new Map<number, number>();
    for (const s of playedScores) {
      positionCounts.set(s.position, (positionCounts.get(s.position) || 0) + 1);
    }

    // Average net
    const avgNet = playedScores.length > 0
      ? playedScores.reduce((sum, s) => sum + s.netScore, 0) / playedScores.length
      : 0;

    // Best finish
    const bestFinish = playedScores.length > 0
      ? Math.min(...playedScores.map(s => s.position))
      : Infinity;

    // Points: total or per-round depending on proRate
    const points = config.proRate && playedScores.length > 0
      ? team.totalPoints / playedScores.length
      : team.totalPoints;
  }

  // Sort using cascade
  // 1. Points desc
  // 2. Counting method (compare position counts from 1st down)
  // 3. Avg net asc
  // 4. Best single week asc
}
```

### New function: `rankTeamsHybrid(teams, matchups, weeklyScores, config)`

For hybrid mode:
1. Calculate match play points from Matchup records
2. Calculate field points from WeeklyScore records
3. Weighted combination: `finalPoints = matchPoints * (1 - fieldWeight) + fieldPoints * fieldWeight`
4. Sort by finalPoints descending
5. Tiebreakers: match play W/L → counting method → net differential

### Modify existing functions:

#### `getSeasonLeaderboard(seasonId)`
- Fetch league's `scoringType`
- Branch: match_play → existing `rankTeams()`, stroke_play → `rankTeamsStrokePlay()`, hybrid → `rankTeamsHybrid()`

#### `getLeaderboardWithMovement(leagueId)`
- Same branching
- For stroke play, `calculateStandingsAtWeek` needs a stroke play variant that uses WeeklyScore data

#### `getAllTimeLeaderboard(leagueId)`
- For stroke play: aggregate by team name across seasons
- Show: total points, rounds played, avg points/round, avg net
- No W/L/T columns

### New function: `calculateStandingsAtWeekStrokePlay(teams, weeklyScores, upToWeek)`
- Filters weekly scores up to given week
- Calculates cumulative stats
- Returns ranked standings
- Used for movement tracking

---

## Task 2: Update Leaderboard Component

**File:** `src/components/LeaderboardTable.tsx`

Add a `scoringType` prop to control which columns display:

### Match Play columns (existing, unchanged):
| Rank | Team | Handicap | Rounds | Points | W | L | T |

### Stroke Play columns:
| Rank | Team | Handicap | Rounds | Points | Avg Net | Best Finish |

### Hybrid columns:
| Rank | Team | Handicap | Rounds | Total Pts | Match Pts | Field Pts | W | L | T |

### Additional changes:
- Movement indicators (rank/handicap arrows) work for all modes
- If `proRate` is enabled, show "Pts/Rd" instead of "Points" header
- Teams excluded by max DNP show greyed out at bottom with "Inactive" badge
- Counting method tiebreaker info shown as tooltip on tied ranks

### Props update:
```typescript
interface LeaderboardTableProps {
  teams: LeaderboardEntry[];
  leagueSlug: string;
  scoringType: "match_play" | "stroke_play" | "hybrid";
  proRate?: boolean;
}
```

---

## Task 3: Create Weekly Score Display Component

**New file:** `src/components/WeeklyScoreCard.tsx`

This replaces `ScoreCard` on the history page for stroke play leagues.

Displays a single week's field results:

```
┌─────────────────────────────────────────────────────┐
│  Week 5                                    Feb 12   │
├─────┬──────────────┬───────┬─────┬─────┬───────────┤
│ Pos │ Team         │ Gross │ Hcp │ Net │ Points    │
├─────┼──────────────┼───────┼─────┼─────┼───────────┤
│ 1st │ Team Alpha   │  34   │  3  │ 31  │ 8 (+2)   │
│ 2nd │ Team Bravo   │  38   │  5  │ 33  │ 7 (+2)   │
│ T3  │ Team Charlie │  40   │  4  │ 36  │ 5.5 (+2) │
│ T3  │ Team Delta   │  39   │  3  │ 36  │ 5.5 (+2) │
│ 5th │ Team Echo    │  42   │  2  │ 40  │ 4 (+2)   │
│ DNP │ Team Foxtrot │   -   │  -  │  -  │ 0        │
└─────┴──────────────┴───────┴─────┴─────┴───────────┘
```

- Position column handles ties (T3, T5, etc.)
- Bonus points shown in parentheses
- DNP teams shown at bottom with dash scores
- SUB indicator shown next to team name when applicable
- Top 3 get medal styling (gold/silver/bronze) like existing LeaderboardTable

### Props:
```typescript
interface WeeklyScoreCardProps {
  weekNumber: number;
  scores: WeeklyScoreRecord[];
  playedAt?: Date;
}
```

---

## Task 4: Update History Page

**File:** `src/app/league/[slug]/history/page.tsx`

- Fetch league's `scoringType`
- **Match play:** Use existing `getMatchupHistoryForSeason()` + `ScoreCard` (no changes)
- **Stroke play:** Use `getWeeklyScoreHistoryForSeason()` + `WeeklyScoreCard`
- **Hybrid:** Show both sections — matchup results AND weekly field results, in separate tabs or sections

Group weekly scores by week number (same pattern as current matchup grouping).

---

## Task 5: Update Leaderboard Page

**File:** `src/app/league/[slug]/leaderboard/page.tsx`

- Fetch league's `scoringType` from `getLeaguePublicInfo()`
- Pass `scoringType` to `LeaderboardTable`
- Pass `proRate` flag if applicable
- The server-side data fetch already branches internally (Task 1), so the leaderboard data structure adapts automatically

---

## Task 6: Update Team Detail Page

**File:** `src/app/league/[slug]/team/[teamId]/page.tsx`

- Fetch league's `scoringType`
- **Match play:** No changes to existing display
- **Stroke play:** Replace matchup history with weekly score history
  - Summary card shows: Total Points, Rounds Played, Avg Net, Best Finish, Avg Pts/Round
  - History table shows weekly results: Week, Pos, Gross, Hcp, Net, Points
  - No W/L/T display
- **Hybrid:** Show both summary types

---

## Task 7: Update Handicap History Page

**File:** `src/app/league/[slug]/handicap-history/page.tsx`

- Fetch league's `scoringType`
- For stroke play: pull handicap data from WeeklyScore instead of Matchup
- Use `getHandicapHistoryForSeason()` — but this may need a stroke play variant that reads from WeeklyScore

Add to `src/lib/actions/handicap-settings.ts`:

```typescript
export async function getHandicapHistoryForStrokePlay(
  seasonId: number
): Promise<HandicapHistoryEntry[]> {
  // Build handicap history from WeeklyScore records
  // Group by team, sort by week, extract handicap per week
}
```

---

## Task 8: Update Season Selector Behavior

**File:** `src/components/SeasonSelector.tsx`

No changes needed — the season selector already manages season state via URL params. The data fetching in pages handles the branching.

---

## Acceptance Criteria

When this stage is complete, verify:

### Stroke Play League:
- [ ] Leaderboard shows: Rank, Team, Handicap, Rounds, Points, Avg Net, Best Finish
- [ ] No W/L/T columns visible
- [ ] Rankings correct: highest points first, counting method tiebreaker works
- [ ] Pro-rate toggle shows "Pts/Rd" column and uses per-round average
- [ ] Max DNP exclusion works (excluded teams greyed out)
- [ ] Movement indicators (rank arrows) work
- [ ] History page shows weekly field results (not head-to-head matchups)
- [ ] WeeklyScoreCard displays positions, ties, bonuses correctly
- [ ] Team page shows stroke play stats (avg net, best finish)
- [ ] Team page history shows weekly results
- [ ] Handicap history shows weekly handicaps from WeeklyScore data
- [ ] Season selector works for stroke play leagues
- [ ] All-time leaderboard aggregates across stroke play seasons

### Hybrid League:
- [ ] Leaderboard shows weighted points combining match + field
- [ ] History page shows both matchup results and weekly field results
- [ ] Team page shows combined stats

### Match Play League:
- [ ] No changes — all existing behavior preserved
- [ ] Leaderboard still shows W/L/T columns

### General:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] No regressions in existing match play functionality
