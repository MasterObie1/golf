# Task Plan: Comprehensive Handicap Customization Overhaul

## Goal
Completely overhaul the handicap system to give leagues maximum customization over how handicaps are calculated, applied, and managed. Transform the current 5-option formula-based system into a flexible, feature-rich handicap management system.

## Current State

### Existing Handicap Settings (5 options)
| Setting | Default | Purpose |
|---------|---------|---------|
| Base Score | 35 | Subtracted from average |
| Multiplier | 0.9 | Applied to difference |
| Rounding | floor | floor/round/ceil |
| Default Handicap | 0 | When no scores available |
| Max Handicap | null | Optional cap |

### Current Formula
```
handicap = rounding((average_score - baseScore) * multiplier)
```

---

## Proposed Feature Categories

### Category 1: Calculation Method
- [ ] Minimum handicap (floor for scratch golfers)
- [ ] Score selection method (all, last N, best of last N)
- [ ] Drop highest/lowest scores option
- [ ] Differential-based calculation (optional)

### Category 2: Score Weighting
- [ ] Recency weighting toggle
- [ ] Recency decay factor
- [ ] Exceptional score capping

### Category 3: Application Rules
- [ ] Handicap percentage (apply X% of handicap)
- [ ] Maximum strokes given between competitors
- [ ] Allowance type (full, percentage, difference)

### Category 4: Time-Based Rules
- [ ] Provisional period for new players
- [ ] Provisional multiplier
- [ ] Handicap freeze after week N
- [ ] Trend adjustment toggle

### Category 5: Administrative
- [ ] Manual override options
- [ ] Handicap change approval requirement
- [ ] Audit trail enable/disable

---

## Implementation Phases

### Phase 1: Database Schema `status: pending`
Add new fields to League model with backward-compatible defaults.

**New Fields:**
```prisma
// Score Selection
handicapScoreSelection   String    @default("all")      // "all", "last_n", "best_of_last"
handicapScoreCount       Int?                           // For last_n: how many
handicapBestOf           Int?                           // For best_of_last: use best X
handicapLastOf           Int?                           // For best_of_last: of last Y
handicapDropHighest      Int       @default(0)          // Drop N highest
handicapDropLowest       Int       @default(0)          // Drop N lowest
handicapMinimum          Float?                         // Minimum handicap

// Weighting
handicapUseWeighting     Boolean   @default(false)
handicapWeightRecent     Float     @default(1.5)        // Weight for most recent
handicapWeightDecay      Float     @default(0.9)        // Decay factor per round

// Application
handicapPercentage       Float     @default(100)        // Apply X% of handicap
handicapMaxStrokes       Float?                         // Max strokes between players
handicapAllowanceType    String    @default("full")     // "full", "percentage", "difference"

// Time-Based
handicapProvWeeks        Int       @default(0)          // Provisional period
handicapProvMultiplier   Float     @default(1.0)        // During provisional
handicapFreezeWeek       Int?                           // Freeze after week N
handicapUseTrend         Boolean   @default(false)      // Trend adjustment

// Admin
handicapRequireApproval  Boolean   @default(false)
```

### Phase 2: Core Logic Updates `status: pending`
- Expand `HandicapSettings` interface
- Implement score selection algorithms
- Implement weighting calculations
- Implement application rules

### Phase 3: Admin UI Overhaul `status: pending`
- Reorganize into collapsible sections
- Add preset templates (Simple, USGA-Style, etc.)
- Enhanced preview calculator with real team data
- Help tooltips for each option

### Phase 4: Recalculation Updates `status: pending`
- Update `recalculateLeagueStats` for new options
- Ensure backward compatibility
- Handle edge cases

### Phase 5: Testing & Polish `status: pending`
- Test all calculation combinations
- Verify edge cases
- Build verification

---

## Key Decisions
| Decision | Rationale |
|----------|-----------|
| All new fields have defaults matching current behavior | Backward compatibility |
| Features are opt-in | Existing leagues unchanged |
| Collapsible UI sections | Avoid overwhelming users |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|

## Files to Modify
| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add new handicap fields |
| `src/lib/handicap.ts` | Expand calculation functions |
| `src/lib/actions.ts` | Update server actions |
| `src/app/league/[slug]/admin/page.tsx` | New handicap UI |
