# Task Plan: Leaderboard Movement & Handicap History

## Goal
Add week-over-week movement indicators to the leaderboard and create a league-wide handicap history page.

## Features Requested
1. **Leaderboard rank movement** - Green up arrow / red down arrow showing position change from previous week
2. **Leaderboard handicap movement** - Green/red arrows showing handicap change from previous week
3. **League handicap history page** - Shows handicap progression for all teams week by week

## Current Phase
Phase 1 - Requirements & Design

## Phases

### Phase 1: Requirements & Design
- [ ] Understand how to calculate historical rankings per week
- [ ] Design data structure for tracking week-over-week changes
- [ ] Plan UI for movement indicators
- [ ] Plan handicap history page layout
- **Status:** in_progress

### Phase 2: Server-side Logic
- [ ] Create function to calculate rankings at each week point
- [ ] Create function to get handicap history for all teams
- [ ] Calculate movement deltas (rank change, handicap change)
- **Status:** pending

### Phase 3: Leaderboard UI Updates
- [ ] Add rank movement column/indicator
- [ ] Add handicap movement indicator
- [ ] Style up/down arrows appropriately
- **Status:** pending

### Phase 4: Handicap History Page
- [ ] Create `/league/[slug]/handicap-history` page
- [ ] Design table/chart showing handicap by week for each team
- [ ] Add navigation link from league home
- **Status:** pending

### Phase 5: Testing & Build
- [ ] Test movement calculations
- [ ] Verify edge cases (new teams, ties, etc.)
- [ ] Run build
- **Status:** pending

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| TBD | TBD |

## Technical Considerations

### Calculating Historical Rankings
Need to determine standings at end of each week by:
1. Summing points up to that week
2. Applying same tiebreaker logic (points → wins → head-to-head → net differential)

### Movement Indicators
- Green up arrow (↑) with number = improved position
- Red down arrow (↓) with number = dropped position
- Dash or nothing = no change
- "NEW" badge for teams with no previous week data

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
