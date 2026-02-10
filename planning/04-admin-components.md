# 04 — Admin Component Fixes

Based on review of the admin page and all 9 tab components.

**Files in scope:**
- `src/app/league/[slug]/admin/page.tsx` (467 lines, 4/10)
- `src/app/league/[slug]/admin/components/AboutTab.tsx` (249 lines, 6/10)
- `src/app/league/[slug]/admin/components/MatchupsTab.tsx` (755 lines, 5/10)
- `src/app/league/[slug]/admin/components/SeasonsTab.tsx` (229 lines, 7/10)
- `src/app/league/[slug]/admin/components/SettingsTab.tsx` (1149 lines, 3/10)
- `src/app/league/[slug]/admin/components/TeamsTab.tsx` (442 lines, 6/10)
- `src/app/league/[slug]/admin/components/CourseTab.tsx` (369 lines, 7/10)
- `src/app/league/[slug]/admin/components/ScheduleTab.tsx` (696 lines, 5/10)
- `src/app/league/[slug]/admin/components/ScorecardsTab.tsx` (774 lines, 4/10)
- `src/app/league/[slug]/admin/components/WeeklyScoresTab.tsx` (545 lines, 6/10)

**Note:** This is the largest document and the lowest-priority phase. None of these are security bugs. They are maintainability, correctness, and UX issues. Do these after Phases 1-3.

---

## Priority 1: High (Correctness bugs and major architecture problems)

### 1.1 SettingsTab.tsx must be decomposed
**File:** `src/app/league/[slug]/admin/components/SettingsTab.tsx` (1149 lines)
**Problem:** 66 `useState` calls. Manages 8+ distinct feature areas. `applyPreset` does 33 sequential `setState` calls. `useEffect` on `[league]` fires 25 `setState` calls per parent re-render. Inline 18-line async `onClick` handler.
**Fix:** Split into sub-components:
1. `BasicSettingsSection.tsx` — max teams, registration, scoring type (~100 lines)
2. `ScorecardSettingsSection.tsx` — scorecard mode, entry settings (~60 lines)
3. `ScheduleSettingsSection.tsx` — schedule visibility, bye points (~80 lines)
4. `PasswordChangeSection.tsx` — current/new password form (~80 lines)
5. `HandicapSettingsSection.tsx` — all 25+ handicap fields, presets, preview (~500 lines)

Each sub-component manages its own state, receives initial values via props, and calls a shared `onSave` callback. The parent `SettingsTab` becomes an orchestrator that passes league data down and handles save callbacks.

**HandicapSettingsSection specifically** should use `useReducer` instead of 25 `useState` calls:
```typescript
type HandicapState = { baseScore: number; multiplier: number; rounding: string; /* ... */ };
type HandicapAction =
  | { type: "SET_FIELD"; field: keyof HandicapState; value: unknown }
  | { type: "APPLY_PRESET"; preset: HandicapState }
  | { type: "RESET"; initial: HandicapState };
```
This collapses `applyPreset` from 33 lines to 1 dispatch call.

### 1.2 Admin page should be a server component
**File:** `src/app/league/[slug]/admin/page.tsx`
**Problem:** Entire admin page is `"use client"`. Initial load is a serial waterfall of 5+ round-trips. Every user pays this cost regardless of which tab they need.
**Fix:**
1. Convert `page.tsx` to a server component.
2. Fetch initial data server-side: league, seasons, active season, teams, matchups.
3. Pass as props to a new `AdminDashboard` client component (the current page.tsx content minus the data loading).
4. This eliminates the initial waterfall, improves TTI, and adds a server-side auth check.

```typescript
// page.tsx (server component)
export default async function AdminPage({ params }) {
  const { slug } = await params;
  // Server-side auth check — throws if unauthorized
  const session = await requireLeagueAdmin(slug);
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();
  const [seasons, activeSeason, teams, matchups] = await Promise.all([...]);
  return <AdminDashboard league={league} seasons={seasons} ... />;
}
```

### 1.3 Duplicated types across components
**Files:** `page.tsx`, `MatchupsTab.tsx`, `TeamsTab.tsx`, `ScorecardsTab.tsx`, `WeeklyScoresTab.tsx`
**Problem:** `Team`, `League`, `Matchup` interfaces defined locally in multiple files. If Prisma schema changes, these hand-rolled types won't catch it at compile time.
**Fix:**
1. Create `src/lib/types/admin.ts` with shared types.
2. Derive types from Prisma's generated types where possible:
   ```typescript
   import type { Prisma } from "@prisma/client";
   export type AdminLeague = Prisma.LeagueGetPayload<{ select: typeof leagueAdminSelect }>;
   ```
3. Import from this shared file in all admin components.
4. Remove all local `interface Team { ... }` definitions.

### 1.4 Unsafe `as` casts throughout (20+ instances)
**Files:** Multiple — `SettingsTab.tsx` (worst offender), `MatchupsTab.tsx`, `TeamsTab.tsx`, `ScheduleTab.tsx`
**Problem:** `as "floor" | "round" | "ceil"` casts on DB strings with no runtime validation. `as number` on `number | ""` state values. `as League` on server action results.
**Fix:**
- For DB string → union casts: Add runtime validation. Use a Zod parse or a simple `includes` check before assignment. Or use the Zod-validated settings from the server (see `02-server-actions.md` for adding Zod to settings).
- For `number | ""` → `number` casts: Assign to a local `const` with a type guard before the async boundary:
  ```typescript
  const teamAIdNum = teamAId;
  if (typeof teamAIdNum !== "number") return;
  // Now teamAIdNum is narrowed to number, no cast needed
  ```
- For server action result casts: Define proper return types on server actions and use them.

### 1.5 `fillByesAvailable` race condition in TeamsTab
**File:** `src/app/league/[slug]/admin/components/TeamsTab.tsx:81, 99`
**Problem:** `fillByesAvailable` computed from old `approvedTeams.length` but `scheduleDialog` is shown before the component re-renders with new props after re-fetch.
**Fix:** Compute `fillByesAvailable` from `approvedTeams.length + 1` (since we know we just approved one team), or move the dialog display to a `useEffect` that triggers after the teams state updates.

---

## Priority 2: Medium (Performance, UX, and code quality)

### 2.1 Serial waterfall in `loadInitialData`
**File:** `src/app/league/[slug]/admin/page.tsx:151-231`
**Problem:** 5+ sequential async stages. `aboutData` fetch is NOT inside the `Promise.all`. Weekly scores block is also sequential when it doesn't need to be.
**Fix:** If 1.2 is done (server component), this goes away. If not, flatten the waterfall:
```typescript
const [league, seasons] = await Promise.all([getLeagueBySlug(slug), getSeasons(leagueId)]);
const activeSeason = seasons.find(s => s.isActive);
const [teams, matchups, allTeams, aboutData, weeklyScores] = await Promise.all([...]);
```

### 2.2 Silent error swallowing in page.tsx
**File:** `src/app/league/[slug]/admin/page.tsx:226-228`
**Problem:** Catch block logs `console.error` then shows "League not found" for ANY error including network failures, timeouts, and server errors.
**Fix:** Differentiate error types. Show "Network error — please try again" for fetch failures. Show "League not found" only when the server explicitly returns 404 or null.

### 2.3 No dirty-state tracking on form tabs
**Files:** `AboutTab.tsx`, `SettingsTab.tsx`, `CourseTab.tsx`
**Problem:** User modifies fields, switches tabs, changes are silently lost (if component unmounts) or silently preserved (if parent keeps it mounted). No visual indicator of unsaved changes.
**Fix:** Add a `isDirty` flag per form section. Compare current state to initial values. Show a warning badge on the tab label when dirty. Optionally add a "You have unsaved changes" prompt on tab switch.
**Implementation:** Each tab exposes `isDirty` via `useImperativeHandle` or callback prop. Parent shows dot/badge on dirty tabs.

### 2.4 Hardcoded 20-point total in MatchupsTab
**File:** `src/app/league/[slug]/admin/components/MatchupsTab.tsx:676-686`
**Problem:** "Total: X / 20 points" validation assumes match play. If scoring changes, this is wrong.
**Fix:** Pass `maxMatchPoints` as a prop derived from league config. Use it instead of hardcoded 20.

### 2.5 No form reset on week number change in MatchupsTab
**File:** `src/app/league/[slug]/admin/components/MatchupsTab.tsx:417`
**Problem:** Changing the week number keeps team selections and scores from the previous week.
**Fix:** Add a `useEffect` on `weekNumber` that resets form fields to defaults.

### 2.6 No debouncing on week number input
**Files:** `MatchupsTab.tsx`, `ScorecardsTab.tsx`, `WeeklyScoresTab.tsx`
**Problem:** Each keystroke triggers a fetch. Typing "12" triggers a fetch for week "1" first.
**Fix:** Debounce the `useEffect` that fetches on week number change. 300ms delay.

### 2.7 ScorecardsTab — 4 non-parallel useEffects
**File:** `src/app/league/[slug]/admin/components/ScorecardsTab.tsx:84-131`
**Problem:** Email config, course loading, scorecard loading, and matchup loading all run as separate sequential waterfalls on mount.
**Fix:** Combine into a single `useEffect` with `Promise.all`:
```typescript
useEffect(() => {
  Promise.all([checkEmailConfig(), loadCourse(), loadScorecards(), loadMatchups()]);
}, [leagueId]);
```

### 2.8 ScorecardsTab — memory leak from setTimeout
**File:** `src/app/league/[slug]/admin/components/ScorecardsTab.tsx:61-62, 153, 172`
**Problem:** `setTimeout` to clear `linkCopied` and `emailSent` after 3 seconds. No cleanup on unmount.
**Fix:** Store timeout IDs in refs. Clear them in `useEffect` cleanup:
```typescript
const linkTimerRef = useRef<NodeJS.Timeout>();
useEffect(() => () => clearTimeout(linkTimerRef.current), []);
```

### 2.9 SeasonsTab — dual source of truth
**File:** `src/app/league/[slug]/admin/components/SeasonsTab.tsx:44`
**Problem:** Local `SeasonInfo[]` state from `useState(initialSeasons)` never updates when parent re-renders with new data.
**Fix:** Use `useEffect` to sync local state when props change, or eliminate local state and use props directly with callbacks for mutations.

### 2.10 ScheduleTab — triple-nested ternary in JSX
**File:** `src/app/league/[slug]/admin/components/ScheduleTab.tsx:548-637`
**Problem:** Unreadable conditional rendering for swap/move/default views.
**Fix:** Extract into sub-components:
```typescript
function MatchupRowEditing({ type, matchup, ... }) { ... }
function MatchupRowDisplay({ matchup, onEdit, ... }) { ... }
```

### 2.11 ScheduleTab — stale `totalWeeks`
**File:** `src/app/league/[slug]/admin/components/ScheduleTab.tsx:52`
**Problem:** `totalWeeks` initialized from `teams.length`. If teams change, `totalWeeks` is stale.
**Fix:** Either derive from props (no state): `const totalWeeks = teams.length - 1 + (teams.length % 2 === 0 ? 0 : 0)` with a `useMemo`, or sync via `useEffect` when `teams.length` changes.

### 2.12 WeeklyScoresTab — point override corruption
**File:** `src/app/league/[slug]/admin/components/WeeklyScoresTab.tsx:160-169`
**Problem:** Point override difference stuffed into `bonusPoints`. Makes bonus inflated in reports.
**Fix:** Add a separate `pointOverride` field to the submission data. Server should store overridden total as `points` and record the original calculated points separately for audit.

---

## Priority 3: Low (Minor DRY violations, cosmetic, nice-to-have)

### 3.1 AboutTab — 13 duplicate setState calls
**File:** `src/app/league/[slug]/admin/components/AboutTab.tsx:70-82`
**Fix:** Extract a `populateForm(data)` function used by both initialization and post-save.

### 3.2 AboutTab — message banner scrolls with form
**File:** `src/app/league/[slug]/admin/components/AboutTab.tsx:92`
**Fix:** Use a sticky/fixed position for the success/error message, or scroll to top on save.

### 3.3 MatchupsTab — only shows 10 recent matchups
**File:** `src/app/league/[slug]/admin/components/MatchupsTab.tsx:729`
**Fix:** Add a "Show all" button or pagination.

### 3.4 CourseTab — silent data loss on hole count change
**File:** `src/app/league/[slug]/admin/components/CourseTab.tsx:79-93`
**Fix:** Add a confirmation dialog: "Switching to 9 holes will discard holes 10-18. Continue?"

### 3.5 CourseTab — no unique handicap index validation
**File:** `src/app/league/[slug]/admin/components/CourseTab.tsx`
**Fix:** Validate that handicap indices are unique within the course before saving. Show inline errors.

### 3.6 ScorecardsTab — no clipboard fallback
**File:** `src/app/league/[slug]/admin/components/ScorecardsTab.tsx:150`
**Fix:** Wrap in try/catch. Fallback to `document.execCommand("copy")` or show a "Copy failed" message with the URL in a selectable text field.

### 3.7 WeeklyScoresTab — `updateEntry` takes `unknown` value
**File:** `src/app/league/[slug]/admin/components/WeeklyScoresTab.tsx:84`
**Fix:** Type the value parameter properly: `value: number | string | boolean`.

### 3.8 WeeklyScoresTab — triple setState on DNP checkbox
**File:** `src/app/league/[slug]/admin/components/WeeklyScoresTab.tsx:342-349`
**Fix:** Combine into a single state update using a callback that modifies all three fields at once.

### 3.9 SeasonsTab — no confirmation for creating a season
**File:** `src/app/league/[slug]/admin/components/SeasonsTab.tsx`
**Fix:** Add a confirmation dialog since creating a season auto-sets it as active.

### 3.10 ScheduleTab — function-in-state antipattern
**File:** `src/app/league/[slug]/admin/components/ScheduleTab.tsx:57-62`
**Fix:** Store the dialog config (action type, target ID) in state instead of a callback. Execute the appropriate action in the confirm handler based on the config.

### 3.11 SeasonsTab — redundant refetches
**File:** `src/app/league/[slug]/admin/components/SeasonsTab.tsx:59-63, 84-89`
**Fix:** Remove local refetches since `onSeasonChanged()` triggers `loadInitialData()` in the parent which already fetches everything.

### 3.12 SettingsTab — stroke_play tab flash on initial load
**File:** `src/app/league/[slug]/admin/page.tsx:165`
**Fix:** Determine the default tab before the first render. Set `activeTab` initial value based on props from server component (if 1.2 is done) or use a loading state.

---

## Execution Order

This is Phase 4 work — do after security (Phases 1-3) are complete.

1. **1.2** (server component conversion — biggest architectural win, eliminates 2.1 and 2.2)
2. **1.3** (shared types — affects all files, do before other component changes)
3. **1.1** (SettingsTab decomposition — largest single file, biggest maintenance burden)
4. **1.4** (unsafe casts cleanup — do after types are shared)
5. **1.5** (fillByesAvailable bug — quick fix)
6. **2.3 → 2.12** (medium items — mostly independent, batch as convenient)
7. **3.1 → 3.12** (low items — batch together at the end)

**Estimated effort:** Phase 4 is the most labor-intensive phase. Items 1.1 and 1.2 alone are each multi-hour refactors. Budget accordingly.
