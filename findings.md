# Findings: Handicap Customization Overhaul

## Current System Analysis

### Database Schema (prisma/schema.prisma)
```prisma
handicapBaseScore    Float     @default(35)
handicapMultiplier   Float     @default(0.9)
handicapRounding     String    @default("floor")
handicapDefault      Float     @default(0)
handicapMax          Float?
```

### Current Calculation (src/lib/handicap.ts)
```typescript
export function calculateHandicap(scores: number[], settings: HandicapSettings): number {
  if (scores.length === 0) return settings.defaultHandicap;

  const average = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const raw = (average - settings.baseScore) * settings.multiplier;

  // Apply rounding, then max cap
  return applyRounding(raw, settings.rounding);
}
```

### Key Files
| File | Purpose |
|------|---------|
| `src/lib/handicap.ts` | Core calculations |
| `src/lib/actions.ts` | Server actions |
| `src/app/league/[slug]/admin/page.tsx` | Admin UI (lines 659-769) |
| `prisma/schema.prisma` | Database schema |

---

## Research: Common Golf Handicap Systems

### 1. USGA/World Handicap System
- Best 8 of last 20 differentials
- Differential = (Score - Course Rating) × 113 / Slope
- Multiply average by 0.96
- Soft cap (3.0 strokes) and hard cap (5.0 strokes)

### 2. Simple Average (Current System)
- Average all scores
- Subtract base (par)
- Multiply by factor

### 3. Best-of Method
- Use best N scores from last M rounds
- More forgiving for bad rounds

### 4. Peoria System
- Select random holes after play
- Calculate based on those holes only

### 5. Callaway System
- Deduct worst holes based on gross score
- Designed for one-day events

---

## Proposed Feature Analysis

### Score Selection Options
| Method | Use Case |
|--------|----------|
| All scores | Simple, traditional |
| Last N | Reflects current form |
| Best of last N | Forgiving, rewards good rounds |
| Drop high/low | Removes outliers |

### Application Options
| Method | Effect |
|--------|--------|
| Full (100%) | Standard |
| Percentage (80%) | Slight advantage to better players |
| Max strokes | Prevents blowouts |
| Difference-based | Only give difference between players |

### Time-Based Options
| Feature | Purpose |
|---------|---------|
| Provisional period | Stabilize new player handicaps |
| Freeze after week | Lock in for playoffs |
| Trend adjustment | Account for improvement |

---

## UI Design Considerations

### Current Issues
- All 5 settings in one flat section
- No guidance on what values to use
- Preview only shows one test value

### Proposed Improvements
1. **Preset Templates**
   - "Simple" (current defaults)
   - "USGA-Inspired" (best of recent, 96%)
   - "Forgiving" (best of, drop lowest)
   - "Competitive" (80% handicap)
   - "Custom" (full control)

2. **Collapsible Sections**
   - Basic Settings (base, multiplier, rounding)
   - Score Selection
   - Application Rules
   - Advanced Options

3. **Enhanced Preview**
   - Select actual team to preview
   - Show before/after comparison
   - Explain calculation step by step

---

## Edge Cases to Handle
1. New teams with no scores → default handicap
2. All substitute games → default handicap
3. Negative handicaps → minimum cap
4. Week 1 → manual entry required
5. Fewer scores than "last N" → use all available
6. Weighted average with 1 score → no weighting
