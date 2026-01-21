# Progress Log

## Session: 2026-01-20 - Handicap Customization Overhaul

### Task
Complete overhaul of handicap options to give leagues maximum customization.

### Status: COMPLETE

#### Implementation Summary

**Database Changes:**
- Added 20+ new handicap configuration fields to League model
- Created migration: `20260120214654_add_handicap_customization_fields`

**Core Logic (src/lib/handicap.ts):**
- Expanded `HandicapSettings` interface with all new options
- Added preset templates (Simple, USGA-Inspired, Forgiving, Competitive, Strict, Custom)
- Implemented score selection algorithms (all, last_n, best_of_last, drop high/low)
- Implemented recency weighting with decay factor
- Implemented exceptional score capping
- Implemented application rules (percentage, max strokes, allowance types)
- Implemented time-based rules (provisional period, freeze week, trend adjustment)
- Added `leagueToHandicapSettings()` conversion function
- Added `describeCalculation()` for UI explanation

**Server Actions (src/lib/actions.ts):**
- Updated `getHandicapSettings()` to use `leagueToHandicapSettings()`
- Updated `updateHandicapSettings()` to accept full settings object
- Existing recalculation logic now automatically uses all new options

**Admin UI (src/app/league/[slug]/admin/page.tsx):**
- Added collapsible sections for organized settings
- Added preset template buttons (6 presets)
- Added all new input fields organized by category:
  - Basic Formula (base, multiplier, rounding, default, min/max)
  - Score Selection (method, count, best of, drop high/low)
  - Score Weighting (recency toggle, weight, decay, exceptional cap)
  - Application Rules (percentage, max strokes, allowance type)
  - Time-Based Rules (provisional, freeze, trend)
- Enhanced preview calculator showing applied handicap

#### Files Modified
| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Added 20+ new handicap fields |
| `prisma/migrations/20260120...` | New migration for fields |
| `src/lib/handicap.ts` | Complete rewrite with all features |
| `src/lib/actions.ts` | Updated settings functions |
| `src/app/league/[slug]/admin/page.tsx` | New handicap UI |

#### New Features Summary
1. **Score Selection**: all, last N, best X of last Y, drop highest/lowest
2. **Weighting**: recency weighting with configurable decay
3. **Exceptional Handling**: cap extreme scores before averaging
4. **Application**: percentage, max strokes, allowance types
5. **Time-Based**: provisional period, freeze week, trend adjustment
6. **Presets**: 6 pre-configured templates for common use cases
7. **UI**: Collapsible sections, live preview calculator

#### Build Status
Build passes successfully.

---

## Previous Sessions

### 2026-01-15 - Leaderboard Movement & Handicap History (Complete)
- Added rank/handicap movement indicators
- Created handicap history page

### 2026-01-15 - Team Drill-Down (Complete)
- Clickable team names on leaderboard
- Team history page

---

## Branch Info
- **Branch:** `feature/handicap-customization`
- **Base:** `main`
- **Started:** 2026-01-20
- **Completed:** 2026-01-20
