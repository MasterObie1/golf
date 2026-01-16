# Findings: Leaderboard Team Drill-Down

## Current Structure

### Leaderboard Component (`src/components/LeaderboardTable.tsx`)
- Receives `teams` array with: id, name, totalPoints, wins, losses, ties, handicap, roundsPlayed
- Pure presentation component - doesn't know about league slug
- Team names are currently plain text in `<td>` elements

### Leaderboard Page (`src/app/league/[slug]/leaderboard/page.tsx`)
- Fetches league by slug, gets leaderboard data
- Passes teams to LeaderboardTable
- Has access to league slug

### History Page (`src/app/league/[slug]/history/page.tsx`)
- Shows all matchups grouped by week
- Uses `ScoreCard` component for display
- Uses `getMatchupHistory(leagueId)` action

### Matchup Model
- Tracks: weekNumber, teamAId, teamBId, scores, handicaps, net scores, points, forfeit info
- Relations: teamA, teamB (both Team relations)

## Existing Actions Available
- `getMatchupHistory(leagueId)` - Gets all matchups for a league
- `getTeamPreviousScores(leagueId, teamId)` - Gets gross scores for handicap calc (limited data)

## Required Changes

1. **New Action**: `getTeamMatchupHistory(leagueId, teamId)` - Get all matchups for a specific team

2. **Component Update**: Add `leagueSlug` prop to LeaderboardTable, make team names into links

3. **New Page**: Team history page showing filtered matchups for one team
