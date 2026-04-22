# Code Review: Admin Dashboard Component Architecture

**Reviewer:** Senior Staff Engineer
**Date:** 2026-02-11
**Scope:** `/src/app/league/[slug]/admin/` -- page.tsx + 10 tab components
**Total Lines Reviewed:** ~4,800 lines across 11 files

---

## 1. Executive Summary

The admin dashboard has been partially decomposed from what CLAUDE.md describes as a former 2,068-line monolith into a server component page (`page.tsx`, 74 lines) plus a client orchestrator (`AdminDashboard.tsx`, 345 lines) that manages 9 tab-level components. This is a significant improvement, but the decomposition is uneven. The `SettingsTab` has inherited the "god component" problem (1,187 lines, 57 `useState` hooks) and is now the single largest source of architectural debt in the admin section.

**Overall Assessment:** The server/client boundary is well-designed. The tab-based decomposition is structurally sound. However, the project has traded one large monolith for a medium-sized orchestrator with one oversized tab (SettingsTab) and several tabs that could benefit from further internal decomposition. The total `useState` count across all components is **184**, indicating a form-heavy UI that would benefit from a form library or at minimum `useReducer` consolidation.

**Critical Issues:** 3
**High Issues:** 8
**Medium Issues:** 11
**Low Issues:** 6

---

## 2. Component Architecture Diagram

```
page.tsx (Server Component)
|-- Auth check (getAdminSession)
|-- Phase 1: Parallel data fetches (league, seasons, teams, about)
|-- Phase 2: Season-dependent parallel fetches (matchups, scores, week#)
|
+-- AdminDashboard.tsx (Client Orchestrator)
    |-- 12 useState hooks (league, teams, matchups, scores, seasons, tab state)
    |-- loadInitialData() -- full re-fetch function (duplicates page.tsx logic)
    |-- Tab navigation (accessible: role=tablist, arrow keys, aria-selected)
    |
    +-- SettingsTab.tsx ........... 1,187 lines | 57 useState | GOD COMPONENT
    |   |-- Basic settings (maxTeams, registration)
    |   |-- Scoring format (match_play/stroke_play/hybrid + all sub-options)
    |   |-- Schedule settings (play mode, byes, playoffs)
    |   |-- Scorecard settings
    |   |-- Password change
    |   +-- Handicap configuration (20+ fields, presets, preview calculator)
    |
    +-- MatchupsTab.tsx .......... 760 lines  | 20 useState | OK
    |   |-- Schedule context display
    |   |-- Matchup entry form (preview -> confirm flow)
    |   |-- Forfeit mode
    |   +-- Recent matchups table with delete
    |
    +-- ScheduleTab.tsx .......... 865 lines  | 18 useState | BORDERLINE
    |   |-- Schedule generation (preview -> generate flow)
    |   |-- Week-by-week accordion view
    |   |-- Inline editing (swap, move, cancel, starting hole, course side)
    |   +-- Shotgun start assignment
    |
    +-- ScorecardsTab.tsx ........ 780 lines  | 23 useState | NEEDS SPLITTING
    |   |-- Scorecard link generation + email
    |   |-- Manual entry form
    |   |-- Scorecard list with expand/collapse
    |   |-- Inline editing (AdminScorecardGrid)
    |   +-- Approve/reject workflow
    |
    +-- WeeklyScoresTab.tsx ...... 541 lines  | 9 useState  | CLEAN
    |   |-- Score entry table (all teams at once)
    |   |-- Preview -> submit flow
    |   +-- Score history accordion
    |
    +-- TeamsTab.tsx ............. 435 lines  | 10 useState | CLEAN
    |   |-- Quick-add team form
    |   |-- Pending/approved/rejected team lists
    |   +-- Schedule integration dialog (mid-season add)
    |
    +-- CourseTab.tsx ............. 395 lines  | 12 useState | CLEAN
    |   |-- Course info form
    |   |-- Hole-by-hole par/handicap/yardage table
    |   +-- Par presets
    |
    +-- SeasonsTab.tsx ........... 227 lines  | 7 useState  | CLEAN
    |   |-- Create season form
    |   +-- Season list with set-active
    |
    +-- AboutTab.tsx ............. 252 lines  | 16 useState | FORM-HEAVY
        |-- League info form (13 fields)
        +-- Save action
```

---

## 3. Findings Summary Table

| # | Severity | Component | Category | Issue |
|---|----------|-----------|----------|-------|
| 1 | CRITICAL | SettingsTab | Architecture | 57 useState hooks -- god component that needs decomposition |
| 2 | CRITICAL | AdminDashboard | State Management | `loadInitialData()` duplicates server-side data fetching logic from `page.tsx` |
| 3 | CRITICAL | SettingsTab | Type Safety | `onDataRefresh` callback typed as `{ league?: unknown; matchups?: unknown; teams?: unknown }` -- erases type safety |
| 4 | HIGH | AdminDashboard | Re-render Performance | All 9 inactive tabs re-render when any parent state changes (no memoization) |
| 5 | HIGH | SettingsTab | Re-render Performance | Render-time state sync pattern (lines 139-164) calls 23 setState calls during render |
| 6 | HIGH | SettingsTab | Type Safety | Widespread `as` casts on string unions (e.g., `scoringType as "match_play" | ...`) instead of proper type narrowing |
| 7 | HIGH | Multiple | Error Handling | No global error boundary -- unhandled promise rejections in async handlers silently fail |
| 8 | HIGH | ScheduleTab | Architecture | 865 lines with inline editing, shotgun start, side override -- needs sub-components |
| 9 | HIGH | ScorecardsTab | Architecture | 780 lines managing 23 state variables for 4 distinct features |
| 10 | HIGH | CourseTab | UX | Uses `window.confirm()` instead of the `ConfirmDialog` component used everywhere else |
| 11 | HIGH | AdminDashboard | State Management | `onDataRefresh` callbacks use different shapes per tab -- no unified interface |
| 12 | MEDIUM | AdminDashboard | Server/Client | Importing server actions directly in client component for `loadInitialData()` |
| 13 | MEDIUM | MatchupsTab | Form Handling | `as number` casts on `number | ""` union types (lines 160-166) -- pattern from original bug #3 |
| 14 | MEDIUM | SettingsTab | Form Handling | No unsaved changes warning -- navigating tabs silently discards form edits |
| 15 | MEDIUM | AboutTab | State Management | 16 useState hooks for a single form -- should use `useReducer` or form library |
| 16 | MEDIUM | SeasonsTab | State Management | Local state duplicates parent state with useEffect sync -- stale state risk |
| 17 | MEDIUM | ScorecardsTab | UX | Multiple useEffect hooks with independent cancellation flags -- race condition potential |
| 18 | MEDIUM | CourseTab | UX | `useEffect` dependency on `leagueId` but lists `slug` in the effect body -- inconsistent |
| 19 | MEDIUM | WeeklyScoresTab | Form Handling | `eslint-disable-next-line react-hooks/exhaustive-deps` suppresses a real dependency issue |
| 20 | MEDIUM | Multiple | Accessibility | Only AdminDashboard and CourseTab have ARIA attributes (10 total); 8 of 10 tab components have zero ARIA |
| 21 | MEDIUM | AdminDashboard | UX | Tab content conditionally rendered (not just hidden) -- scroll position lost on tab switch |
| 22 | MEDIUM | Multiple | Form Handling | No form-level validation -- each save handler does ad-hoc checks |
| 23 | LOW | ScheduleTab | State Management | Render-time state sync for `prevTeamCount` (lines 119-123) -- same pattern as SettingsTab |
| 24 | LOW | AdminDashboard | Accessibility | Tab navigation keyboard support is good but focus ring styles are missing |
| 25 | LOW | SettingsTab | UX | Message banner at top of 1,187-line component -- may scroll off-screen on save |
| 26 | LOW | Multiple | Code Style | Identical message banner JSX duplicated in all 10 components -- extract to shared component |
| 27 | LOW | ScorecardsTab | Performance | `useRef` for timer cleanup is correct but the IIFEs in useEffect are less readable than async helper functions |
| 28 | LOW | AboutTab | Type Safety | `populateForm()` re-sets all 13 fields after save -- could use a single dispatch |

---

## 4. Detailed Analysis Per Component

### 4.1 `page.tsx` (Server Component -- 74 lines)

**Verdict: Well-designed**

This is one of the cleanest files in the review. It correctly:
- Performs auth checks server-side before any data fetching
- Uses two-phase parallel data fetching (independent first, season-dependent second)
- Passes serializable props to the client boundary
- Uses `Promise.all` for all independent fetches

**Issues:**

| Severity | Issue |
|----------|-------|
| MEDIUM (#13) | `teams as AdminTeam[]` cast at line 63-64. The return type of `getTeams()` and `getAllTeamsWithStatus()` likely differs from `AdminTeam`. This should be mapped explicitly rather than cast. |

**Positive Notes:**
- Clean separation: server component owns data fetching, client component owns interactivity
- Conditional fetching based on `scoringType` avoids unnecessary work
- `notFound()` and `redirect()` used correctly for error cases

---

### 4.2 `AdminDashboard.tsx` (Client Orchestrator -- 345 lines)

**Verdict: Solid structure with significant data management problems**

The tab orchestrator is the right architectural pattern. It holds shared state (league, teams, matchups, seasons) and passes relevant slices to each tab. The tab navigation is accessible with proper ARIA attributes and keyboard support.

**Issues:**

| Severity | Issue | Detail |
|----------|-------|--------|
| CRITICAL (#2) | `loadInitialData()` duplicates `page.tsx` | Lines 90-128 replicate the exact same two-phase fetch logic from the server component. This means: (a) logic drift risk when one is updated but not the other, (b) unnecessary client-side server action calls that could be replaced by `router.refresh()`, (c) 10 sequential `setState` calls that cause cascade re-renders. |
| HIGH (#4) | No memoization on tab components | Every state change in AdminDashboard (e.g., `setWeekNumber`) re-renders ALL tab components, even inactive ones. Since tabs are conditionally rendered (`{activeTab === "settings" && <SettingsTab .../>}`), this is partially mitigated -- inactive tabs unmount entirely. However, the `allTeams.filter()` computation at line 140 and 242 runs every render. More critically, switching tabs destroys and recreates component trees, losing internal state. |
| HIGH (#11) | Inconsistent `onDataRefresh` shapes | SettingsTab: `{ league?, matchups?, teams? }`. MatchupsTab: `{ weekNumber?, matchups? }`. WeeklyScoresTab: `{ weekNumber?, weeklyScores? }`. TeamsTab: `(teams, allTeams) => void`. SeasonsTab/ScheduleTab: `() => void` (triggers full reload). This inconsistency makes the data flow hard to reason about. |
| MEDIUM (#12) | Server actions imported in client | Lines 6-29 import 12 server action functions for use in `loadInitialData()`. While Next.js 16 allows this, it bundles these imports into the client module graph. Better to call `router.refresh()` to re-trigger the server component. |
| MEDIUM (#21) | Tab content conditionally rendered | `{activeTab === "settings" && <SettingsTab />}` unmounts inactive tabs. This means: form state is lost on tab switch (SettingsTab's 57 useState hooks reset), scroll position is lost, and useEffect cleanup/re-initialization runs. Consider rendering all tabs but hiding inactive ones with CSS, or persisting critical form state in the orchestrator. |

**Positive Notes:**
- Accessible tab navigation with `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `tabIndex` roving, and arrow key support
- `useMemo` for tab list based on `scoringType` and `scorecardMode`
- Pending teams badge count on the Teams tab

---

### 4.3 `SettingsTab.tsx` (1,187 lines -- GOD COMPONENT)

**Verdict: Critical architectural debt. Must be decomposed.**

This component has **57 `useState` hooks** managing 5 distinct settings domains:
1. Basic settings (2 fields)
2. Scoring format (12+ fields)
3. Schedule settings (10+ fields)
4. Scorecard settings (2 fields)
5. Handicap configuration (20+ fields)
6. Password change (handled via uncontrolled form)

Each domain has its own save handler, its own loading state (shared `loadingSection`), and its own set of form fields. The render-time state sync pattern (lines 139-164) that batch-updates 23 state variables when the parent's `league` prop changes is a code smell indicating too much state.

**Issues:**

| Severity | Issue | Detail |
|----------|-------|--------|
| CRITICAL (#1) | 57 useState hooks | This exceeds any reasonable threshold. Each useState creates a new closure reference on every render. The handicap section alone has 20+ state variables that should be managed as a single object via `useReducer`. |
| CRITICAL (#3) | `onDataRefresh` typed as `unknown` | `onDataRefresh: (data: { league?: unknown; matchups?: unknown; teams?: unknown }) => void` at line 27. The parent casts these back: `data.league as AdminLeague`. This is a type-safety hole -- the callback should use proper types. |
| HIGH (#5) | Render-time state sync | Lines 139-164: When `league` prop changes (e.g., after save), 23 `setState` calls execute during render via the `syncedLeague !== league` pattern. While this is a documented React pattern for deriving state from props, 23 calls is excessive. This should be a single `useReducer` dispatch or the fields should derive from `league` prop directly (controlled by parent). |
| HIGH (#6) | Widespread `as` casts | `scoringType as "match_play" | "stroke_play" | "hybrid"` (line 303), `handicapRounding as "floor" | "round" | "ceil"` (line 41). Over 15 `as` casts on string unions. These should use Zod schemas or discriminated union types. |
| MEDIUM (#14) | No unsaved changes warning | With 5 independent save buttons and 50+ form fields, navigating away (tab switch or page navigation) silently discards unsaved edits. There is no `beforeunload` listener or tab-switch confirmation. |
| MEDIUM (#22) | No form-level validation | Each save handler performs minimal validation. `handleSaveSettings` sends whatever `maxTeamsInput` is without checking bounds. `handleSaveScoringConfig` doesn't validate that `strokePlayPointScale` has enough entries for the team count. Handicap validation exists (`handicapHasErrors`) but only for the selection mode. |
| LOW (#25) | Message banner scrolls off-screen | The message banner is at the top of a 1,187-line component. After modifying handicap settings near the bottom and saving, the success/error message appears above the fold, invisible to the user. |

**Recommended Decomposition:**

```
SettingsTab.tsx (slim orchestrator)
+-- BasicSettingsSection.tsx
+-- ScoringFormatSection.tsx
+-- ScheduleSettingsSection.tsx
+-- ScorecardSettingsSection.tsx
+-- PasswordChangeSection.tsx
+-- HandicapConfigSection.tsx
    +-- HandicapPresetPicker.tsx
    +-- HandicapBasicFormula.tsx
    +-- HandicapScoreSelection.tsx
    +-- HandicapWeighting.tsx
    +-- HandicapTimeRules.tsx
    +-- HandicapPreviewCalculator.tsx
```

Each section should use `useReducer` for its state and expose a `getFormData()` method, or the entire form should be managed by a form library (react-hook-form would work well here).

---

### 4.4 `MatchupsTab.tsx` (760 lines, 20 useState)

**Verdict: Well-structured but has type safety issues**

The preview-then-confirm flow is a good UX pattern. The schedule context display showing which matchups are expected is excellent. The forfeit mode toggle is clean.

**Issues:**

| Severity | Issue | Detail |
|----------|-------|--------|
| MEDIUM (#13) | `as number` casts on union types | Lines 160-166: `teamAId as number`, `teamAGross as number`. These are `number | ""` union types. The `as` cast does nothing at runtime -- if the value is `""`, it gets passed as `""` to the server. The validation at lines 133-134 (`if teamAId === ""`) makes this safe in practice, but the type assertion is misleading. Should use a type guard function: `function isNumber(v: number | ""): v is number { return v !== ""; }` |
| LOW | Form reset duplication | Lines 74-87 (`changeWeek`) and lines 224-231 (after submit) both manually reset 8+ form fields. This should be a `resetForm()` helper. |

**Positive Notes:**
- `ConfirmDialog` used for delete confirmation
- `useEffect` with cancellation flag for schedule loading
- Off-schedule matchup warning is good UX
- `refreshData()` uses `Promise.all` for parallel fetches

---

### 4.5 `ScheduleTab.tsx` (865 lines, 18 useState)

**Verdict: Functionality-rich but architecturally borderline**

This component handles schedule generation, display, and 6 types of inline editing (swap, move, cancel, add, starting hole, course side override). The accordion week-by-week view is appropriate for the data density.

**Issues:**

| Severity | Issue | Detail |
|----------|-------|--------|
| HIGH (#8) | Too many responsibilities | Generation form, week accordion, inline swap editor, inline move editor, add matchup form, starting hole editor, course side override, and shotgun assign are all in one file. The week row with its 5 inline editing modes (lines 696-807) alone is over 100 lines of nested ternaries. |
| LOW (#23) | Render-time state sync | Lines 119-123: `prevTeamCount` pattern. Same concern as SettingsTab but only 1 setState call, so low impact. |
| MEDIUM | No loading skeleton | When `loadScheduleData()` runs (on mount and after every mutation), the entire schedule disappears and reappears. No skeleton/optimistic UI. |

**Recommended Decomposition:**

```
ScheduleTab.tsx
+-- ScheduleGenerationForm.tsx
+-- ScheduleWeekAccordion.tsx
    +-- ScheduleMatchRow.tsx
        +-- InlineSwapEditor.tsx
        +-- InlineMoveEditor.tsx
        +-- StartingHoleEditor.tsx
    +-- AddMatchupForm.tsx
    +-- WeekActionBar.tsx (override side, shotgun assign)
```

---

### 4.6 `ScorecardsTab.tsx` (780 lines, 23 useState)

**Verdict: Feature-complete but needs decomposition**

This component manages 4 distinct features: link generation, manual entry, scorecard list with expand/collapse, and approval workflow. Each feature has its own subset of state variables.

**Issues:**

| Severity | Issue | Detail |
|----------|-------|--------|
| HIGH (#9) | 23 useState for 4 features | Link management (linkCopied, emailSending, emailSent, emailEnabled), manual entry (showManualEntry, manualTeamId, manualPlayerName, manualMatchupId, creating), detail view (expandedId, expandedDetail), editing (editingId, editingDetail, savingScore), course data (course, courseLoaded), matchup data (weekMatchups). These should be separate sub-components or at minimum grouped with `useReducer`. |
| MEDIUM (#17) | Multiple concurrent useEffects | Lines 87-134: Four `useEffect` hooks fire independently on mount (email config, course, scorecards, matchups). The course and email config effects have no cleanup. The scorecards and matchups effects have cancellation flags but could race with manual `loadScorecards()` calls. |
| MEDIUM | `slug` in dependency array mismatch | Line 102: `useEffect` for loading course depends on `[leagueId]` but calls `getCourseWithHoles(slug)`. If `slug` could change without `leagueId` changing (unlikely but possible), this would be stale. |

---

### 4.7 `TeamsTab.tsx` (435 lines, 10 useState)

**Verdict: Clean and well-structured**

This is one of the better-decomposed components. The schedule integration dialog for mid-season team addition is a thoughtful UX pattern.

**Issues:**

| Severity | Issue | Detail |
|----------|-------|--------|
| MEDIUM | Custom modal instead of ConfirmDialog | Lines 218-290: The schedule integration dialog is a custom modal with `fixed inset-0` positioning, while other components use the shared `ConfirmDialog`. This should either be generalized into the shared dialog system or at minimum use the same backdrop/animation patterns. |
| LOW | No escape key handler | The schedule integration dialog has no keyboard escape handler. `ConfirmDialog` likely handles this, but the custom modal does not. |

---

### 4.8 `WeeklyScoresTab.tsx` (541 lines, 9 useState)

**Verdict: Well-designed**

Clean preview-then-confirm pattern matching the MatchupsTab. The point override system in the preview is a good feature.

**Issues:**

| Severity | Issue | Detail |
|----------|-------|--------|
| MEDIUM (#19) | ESLint rule suppression | Line 75: `eslint-disable-next-line react-hooks/exhaustive-deps`. The effect depends on `teamIdsKey` (a derived string) but not `teams` (the array). This is intentional optimization but the comment should explain why `teams` is excluded and what `teamIdsKey` stabilizes. |
| LOW | `Map` for point overrides | Line 54: `useState<Map<number, number>>(new Map())`. Maps are awkward in React state -- `setPointOverrides(prev => new Map(prev).set(...))` creates a new Map on every change. A plain object `Record<number, number>` would be simpler and equally performant. |

---

### 4.9 `CourseTab.tsx` (395 lines, 12 useState)

**Verdict: Solid but has inconsistencies**

The hole-by-hole editor with par presets is well-designed. ARIA labels on hole inputs are present and correct.

**Issues:**

| Severity | Issue | Detail |
|----------|-------|--------|
| HIGH (#10) | `window.confirm()` | Line 82: `window.confirm("Switching to N holes will discard...")`. Every other destructive action in the admin uses the shared `ConfirmDialog` component. This breaks the UX pattern and is not accessible (cannot be styled, no keyboard trap, blocks the main thread). |
| MEDIUM (#18) | Effect dependency mismatch | Line 51: `useEffect(() => { loadCourse(); }, [leagueId])`. But `loadCourse()` calls `getCourseWithHoles(slug)`, not `getCourseWithHoles(leagueId)`. The dependency should include `slug`, or better, `slug` should be the only dependency since `leagueId` is not used in the effect body. |
| LOW | Missing `eslint-disable` comment | The `useEffect` at line 49-51 has `loadCourse` as a closure dependency that is not in the dependency array. React's exhaustive-deps rule would flag this, but no suppression comment is present, suggesting the lint rule may not be enforced. |

---

### 4.10 `SeasonsTab.tsx` (227 lines, 7 useState)

**Verdict: Clean but has redundant state**

**Issues:**

| Severity | Issue | Detail |
|----------|-------|--------|
| MEDIUM (#16) | Local state duplicates parent state | Lines 29-39: `seasons` and `activeSeason` are local state copies of props, synced via `useEffect`. This creates a window where local and parent state diverge. After `onSeasonChanged()` triggers the parent to reload, there is a moment where local state shows the optimistic update while props still hold old values. Better to use props directly and let the parent own the state. |

---

### 4.11 `AboutTab.tsx` (252 lines, 16 useState)

**Verdict: Simple form, over-engineered state**

**Issues:**

| Severity | Issue | Detail |
|----------|-------|--------|
| MEDIUM (#15) | 16 useState for a single form | Every form field has its own `useState` hook. This is a textbook case for `useReducer` with a single form state object, or better yet, react-hook-form. The `populateForm()` function at lines 50-64 that manually sets 13 state variables is a symptom of this over-decomposition. |
| LOW (#28) | `populateForm()` called after save | After `handleSaveAbout()`, it re-fetches the about data and calls `populateForm()` to re-set all 13 fields. This is a full round-trip just to confirm the save worked. Could use optimistic state (the local state already has the correct values). |

---

## 5. Recommended Refactoring Strategy

### Phase 1: Critical (1-2 days)

1. **Decompose SettingsTab into 6 sub-components** (see diagram in section 4.3). Each section gets its own file with its own local state. The SettingsTab becomes a thin orchestrator that passes `league` prop and `onSave` callbacks.

2. **Replace `loadInitialData()` with `router.refresh()`**. The client-side data refetching in AdminDashboard duplicates server logic. Instead, call `router.refresh()` which re-executes the server component and passes fresh props down. This eliminates 40 lines of duplicated fetch logic and 10 unnecessary server action imports.

3. **Type the `onDataRefresh` callbacks properly**. Replace `unknown` with proper types:
   ```typescript
   onDataRefresh: (data: {
     league?: AdminLeague;
     matchups?: AdminMatchup[];
     teams?: AdminTeam[];
   }) => void;
   ```

### Phase 2: High Priority (2-3 days)

4. **Add `React.memo` to tab components** or switch to rendering all tabs with CSS visibility toggle. Currently, switching tabs destroys and recreates the entire component tree.

5. **Replace `window.confirm()` in CourseTab** with `ConfirmDialog`.

6. **Extract ScheduleTab inline editors** into sub-components. The 100+ line nested ternary for match row actions is unmaintainable.

7. **Consolidate ScorecardsTab** into sub-components: `ScorecardLinkGenerator`, `ManualEntryForm`, `ScorecardList`, and `ScorecardDetailPanel`.

8. **Introduce `useReducer` for form-heavy components**. Priority order:
   - SettingsTab handicap section (20+ fields)
   - AboutTab (13 fields)
   - ScorecardsTab (23 state variables)

### Phase 3: Medium Priority (1-2 days)

9. **Add unsaved changes detection**. At minimum, a `beforeunload` listener. Ideally, a tab-switch confirmation dialog when form state has been modified.

10. **Fix type assertions**. Replace `as number` casts with proper type narrowing:
    ```typescript
    // Before:
    teamAId as number
    // After:
    if (typeof teamAId !== 'number') throw new Error('teamAId required');
    teamAId  // TypeScript now knows this is number
    ```

11. **Add ARIA attributes to tab components**. Currently only AdminDashboard (tablist) and CourseTab (hole input labels) have accessibility markup. Forms need `aria-describedby` for help text, `aria-invalid` for validation errors, and `aria-busy` for loading states.

12. **Extract shared `MessageBanner` component**. The identical success/error banner JSX appears in all 10 components.

13. **Fix useEffect dependency arrays**. CourseTab line 51 (`[leagueId]` vs `slug` usage) and SeasonsTab's prop-syncing effects should be corrected.

### Phase 4: Low Priority (ongoing)

14. **Consider react-hook-form** for the settings and about forms. This would eliminate ~80% of the useState hooks in SettingsTab and provide built-in dirty tracking, validation, and submit handling.

15. **Add error boundaries** around each tab to prevent one tab's error from crashing the entire dashboard.

16. **Implement loading skeletons** for ScheduleTab and ScorecardsTab data fetches, replacing the current flash-of-empty-content pattern.

---

## Appendix: State Count by Component

| Component | useState | useEffect | useMemo | useCallback | useRef | Total Hooks |
|-----------|----------|-----------|---------|-------------|--------|-------------|
| AdminDashboard | 12 | 0 | 1 | 0 | 0 | 13 |
| SettingsTab | 57 | 0 | 2 | 0 | 0 | 59 |
| MatchupsTab | 20 | 1 | 0 | 0 | 0 | 21 |
| ScheduleTab | 18 | 1 | 0 | 0 | 0 | 19 |
| ScorecardsTab | 23 | 5 | 0 | 0 | 2 | 30 |
| WeeklyScoresTab | 9 | 1 | 0 | 0 | 0 | 10 |
| TeamsTab | 10 | 0 | 0 | 0 | 0 | 10 |
| CourseTab | 12 | 1 | 0 | 0 | 0 | 13 |
| SeasonsTab | 7 | 2 | 0 | 0 | 0 | 9 |
| AboutTab | 16 | 0 | 0 | 0 | 0 | 16 |
| **TOTAL** | **184** | **11** | **3** | **0** | **2** | **200** |

Key observations:
- Zero `useCallback` usage across all 10 components. Every callback prop passed to children is recreated on every render.
- Only 3 `useMemo` usages (tab list and JSON parse warnings). No memoization on computed values like `pendingTeamsCount`, filtered team lists, or grouped weekly scores.
- `useRef` only used in ScorecardsTab for timer cleanup -- correct usage.
