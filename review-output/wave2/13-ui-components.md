# UI Components & Design System Review

**Reviewer:** Senior Staff Engineer
**Date:** 2026-02-11
**Scope:** All shared components in `src/components/` and `src/components/grounds/`

---

## Executive Summary

The LeagueLinks component library is split into two tiers: a set of **domain-specific feature components** (`ScoreCard`, `ScorecardEntry`, `MatchupWithScorecards`, etc.) at the top level and a nascent **design system** ("The Grounds") in the `grounds/` subdirectory. The design system demonstrates genuinely strong vision -- semantic color tokens, time-of-day ambience, topographic contour patterns, a coherent animation language built on framer-motion -- and sets this project apart from generic admin dashboards. However, the feature components above it largely bypass the design system primitives and instead duplicate styling inline, creating a parallel universe of Tailwind classes that drift from the token vocabulary. The result is a codebase where the design system exists but is under-adopted by the very components that should consume it.

Overall quality is above average for a solo-developer project but has clear structural debts that will compound as the component count grows.

**Severity Scale:** CRITICAL (must fix before prod traffic), HIGH (fix in current cycle), MEDIUM (address in next sprint), LOW (improve opportunistically).

---

## 1. Component Architecture

### 1.1 The Good

**Well-defined prop interfaces.** Every component declares a TypeScript interface for its props. This is table-stakes but worth acknowledging -- zero `any` types in the component layer.

**Server/client boundary is clean.** `NavigationWrapper` is a textbook example of the Next.js App Router pattern: a thin async server component that fetches session data, then passes a minimal serializable prop down to the `"use client"` `Navigation`. This prevents leaking the entire session into the client bundle.

```tsx
// NavigationWrapper.tsx -- good pattern
export async function NavigationWrapper() {
  const session = await getAdminSession();
  const adminSession = session ? { leagueSlug: session.leagueSlug } : null;
  return <Navigation adminSession={adminSession} />;
}
```

**`grounds/` barrel export** (`index.ts`) provides clean import ergonomics. Consumers can do `import { MedalBadge, BallRollLoader } from "@/components/grounds"`.

**Composition in `MatchupWithScorecards`.** The expand/collapse with lazy-loaded scorecard detail, client-side cache, and O(1) availability lookup via a `Set` is well-engineered:

```tsx
const availableSet = useMemo(() => {
  const set = new Set<string>();
  for (const item of scorecardAvailabilityRaw) {
    set.add(`${item.weekNumber}-${item.teamId}`);
  }
  return set;
}, [scorecardAvailabilityRaw]);
```

### 1.2 Issues

#### CRITICAL: `ScoreCard` and `MatchupWithScorecards` are 90% identical -- massive code duplication

`ScoreCard` (`/src/components/ScoreCard.tsx`) is a nearly verbatim copy of `MatchupWithScorecards` (`/src/components/MatchupWithScorecards.tsx`) minus the scorecard expansion feature. The matchup rendering logic, forfeit handling, winner/tie indicators, team row layout, and all styling are duplicated line-for-line. This means:

- Bug fixes must be applied in two places (the forfeit logic, the winner indicator, the Sub badge).
- The two components will drift over time.

**Recommendation:** Delete `ScoreCard` entirely. Make `MatchupWithScorecards` the canonical component and add an `expandable` boolean prop (defaulting to `true`). When `expandable={false}`, omit the chevron and disable the click handler. This is a mechanical refactor.

#### HIGH: Duplicated TypeScript interfaces across files

`HoleData` is defined in at least three places:
- `ScorecardEntry.tsx` (lines 7-13, includes `id`)
- `ScorecardGrid.tsx` (lines 5-10, omits `id`)
- `AdminScorecardGrid.tsx` (lines 7-13, includes `id`)

`HoleScoreData` is defined in at least three places with slightly different shapes (the `ScorecardGrid` version omits `putts`, `fairwayHit`, `greenInReg`).

`TeamScore` is duplicated identically in `ScoreCard.tsx` and `MatchupWithScorecards.tsx`.

**Recommendation:** Create `src/types/scorecard.ts` (or `src/lib/types.ts`) with canonical interfaces. Each component imports and optionally `Pick<>`s what it needs.

#### HIGH: `grounds/ScorecardGrid` vs top-level `ScorecardGrid` name collision

There are **two completely different components** both named `ScorecardGrid`:
1. `src/components/ScorecardGrid.tsx` -- a data-rich scorecard table with hole-by-hole scores, par, handicap, and +/- rows.
2. `src/components/grounds/ScorecardGrid.tsx` -- a layout primitive (wrapper, header, row, cell).

These serve entirely different purposes. The naming collision means imports are confusing and the barrel export from `grounds/index.ts` shadows the domain component.

**Recommendation:** Rename the `grounds/` version to `ScorecardLayout` or `ScorecardShell`, and rename its sub-components (`ScorecardHeader` -> `ScorecardLayoutHeader`, etc.). Alternatively, adopt a naming convention where the design system primitive always has a `Ds` prefix or is always accessed via the barrel (`grounds/ScorecardGrid`).

#### MEDIUM: Feature components bypass design system primitives

The `grounds/ScorecardGrid` (layout primitive) provides `ScorecardGrid`, `ScorecardHeader`, `ScorecardRow`, and `ScorecardCell`. But the actual feature components (`WeeklyScoreCard`, `ScoreCard`, `MatchupWithScorecards`) rebuild the same card pattern from scratch with raw Tailwind classes:

```tsx
// This pattern appears in WeeklyScoreCard, ScoreCard, and MatchupWithScorecards:
<div className="bg-scorecard-paper rounded-lg shadow-md overflow-hidden border border-scorecard-line/50 mb-6">
  <div className="bg-rough text-board-yellow px-6 py-3">
    <h2 className="text-lg font-display font-semibold uppercase tracking-wider">
```

This should be using `<GroundsCard>` or `<ScorecardGrid>` from the design system. The design system components exist but are orphans.

**Recommendation:** Refactor the feature components to compose on top of the `grounds/` primitives.

#### MEDIUM: `ScorecardEntry` is a 490-line monolith

`ScorecardEntry.tsx` handles:
- Hole navigation state
- Score input with auto-save
- Optional stats tracking (putts, FIR, GIR)
- Review screen
- Submit flow
- Submitted confirmation screen

This is three or four components collapsed into one. The `if (submitted)` and `if (showReview)` blocks should be extracted into `ScorecardSubmitted` and `ScorecardReview` components.

---

## 2. Accessibility

### 2.1 The Good

**Strong navigation accessibility.** The `Navigation` component demonstrates well-considered keyboard handling:
- `aria-expanded`, `aria-haspopup`, `aria-controls` on the dropdown button.
- Arrow key navigation between menu items with `ArrowDown`/`ArrowUp`.
- `Escape` closes dropdown and returns focus to trigger button.
- `aria-label` switches between "Open menu" and "Close menu" on the hamburger.
- SVG icons have `aria-hidden="true"`.

```tsx
// Navigation.tsx -- exemplary keyboard handling
const handleDropdownKeyDown = useCallback((e: React.KeyboardEvent) => {
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      setLeaguesOpen(true);
      setTimeout(() => menuItemsRef.current[0]?.focus(), 0);
      break;
    case "Escape":
      setLeaguesOpen(false);
      dropdownButtonRef.current?.focus();
      break;
  }
}, []);
```

**Skip link in layout.** The root layout includes a proper skip-to-content link:

```tsx
<a href="#main-content" className="sr-only focus:not-sr-only ...">
  Skip to main content
</a>
```

**Reduced motion is respected at multiple layers:**
- `MotionProvider` uses `<MotionConfig reducedMotion="user">` for framer-motion.
- `BallIntoCup` uses `usePrefersReducedMotion()` and renders `null` when enabled.
- CSS animations have `@media (prefers-reduced-motion: reduce)` overrides.
- `BallRollLoader` has a CSS-only reduced-motion fallback animation.

**`TournamentBoard` has a `<caption>` element** explaining the table contents -- rare and commendable.

**`ConfirmDialog` uses native `<dialog>`** with `.showModal()`, which provides correct modal behavior (focus trap, backdrop, Escape key) for free.

**`MovementArrow` has proper `aria-label`** (e.g., "Rank up 3") and `role="img"`.

### 2.2 Issues

#### HIGH: Tables in `ScorecardGrid` and `AdminScorecardGrid` lack `scope` attributes and captions

The hole-by-hole scorecard tables use `<th>` elements but do not include `scope="col"` or `scope="row"`. For a data table with headers in both the first row and first column, screen readers need these attributes to associate data cells with their headers.

```tsx
// ScorecardGrid.tsx -- headers lack scope
<th className="...">{label}</th>
{nineHoles.map((h) => (
  <th key={h.holeNumber} className="...">
    {h.holeNumber}
  </th>
))}
```

Neither component provides a `<caption>` element. Compare with `TournamentBoard` which does this correctly.

**Recommendation:** Add `scope="col"` to all column headers, `scope="row"` to the first `<td>` in each body row, and add a `<caption className="sr-only">` describing the scorecard.

#### HIGH: `ScorecardEntry` score input has no visible label or `aria-label`

The large circular score display (`{currentScore?.strokes ?? "-"}`) is purely visual. The plus/minus buttons have `aria-label` but the score itself is not announced as a live region, so screen reader users cannot hear the current value change.

Additionally, the quick-score buttons (array of numbers) lack `aria-label`:

```tsx
<button key={val} onClick={() => setStrokesForHole(val)} className="...">
  {val}
</button>
```

A screen reader user would hear "3", "4", "5" with no context.

**Recommendation:**
1. Add `aria-live="polite"` to the score display element.
2. Add `aria-label={`Set score to ${val}`}` on quick-score buttons.
3. Add `aria-label={`Putts: ${p}`}` on putts buttons.

#### HIGH: `ConfirmDialog` does not trap focus on open

While native `<dialog>.showModal()` provides focus trapping in modern browsers, the component does not auto-focus the cancel button (or any element) on open. Users must Tab to find the interactive elements. The `onCancel` handler correctly responds to Escape, which is good.

**Recommendation:** After `dialog.showModal()`, call `dialogRef.current.querySelector('button')?.focus()` to move focus to the Cancel button (or whichever element should receive initial focus per the dialog pattern).

#### MEDIUM: Hole navigation dots in `ScorecardEntry` are too small for touch

The hole selector dots are `w-3 h-3` (12px x 12px), well below the WCAG 2.2 minimum target size of 24x24 CSS pixels. These are critical navigation elements on mobile.

```tsx
<button className={`w-3 h-3 rounded-full ...`}
  aria-label={`Go to hole ${h.holeNumber}`}
/>
```

**Recommendation:** Increase the visual dot size to at least `w-5 h-5` and/or add transparent padding to achieve a 44x44px touch target (Apple HIG minimum). The dot indicator styling can remain small using a pseudo-element if needed.

#### MEDIUM: `SeasonSelector` dropdown has no accessible description of current selection

The select element has a proper `<label htmlFor="season-select">`. However, when the selection changes, there is no announcement or live region to inform assistive technology that the page content has updated (since the `router.push` triggers a soft navigation).

#### LOW: Color contrast concerns with `text-text-light` (#9CA3AF) on white backgrounds

The `text-text-light` color token (#9CA3AF) on `--surface-white` (#FFFFFF) gives a contrast ratio of approximately 2.9:1, which fails WCAG AA for normal text (requires 4.5:1). This token is used for placeholder-like content (e.g., "-" for missing scores, "DNP" labels, em-dashes). While these are decorative indicators rather than essential content, the DNP label in `WeeklyScoreCard` conveys meaningful information and should meet contrast requirements.

---

## 3. Responsive Design

### 3.1 The Good

**Navigation has a complete mobile implementation.** The `md:` breakpoint cleanly separates desktop dropdown from a mobile slide-down menu. The mobile menu has appropriately sized touch targets (`py-3` = 12px vertical padding on links, making them approximately 48px tall).

**Scorecard tables use `overflow-x-auto`.** Both `ScorecardGrid` and `AdminScorecardGrid` wrap their tables in a scrollable container, preventing layout breakage on narrow screens. This is the correct approach for data-dense tabular content.

**`ScorecardEntry` is mobile-first by design.** The entire component is built for thumb-friendly interaction: large circular score display (96px), large +/- buttons (64px), bottom-anchored navigation. This is genuinely well-designed for the use case of a golfer entering scores on the course.

### 3.2 Issues

#### HIGH: `MatchupWithScorecards` team rows are not responsive

The team row layout uses a horizontal flex with four data columns (Gross, Hcp, Net, Pts) that do not wrap:

```tsx
<div className="flex items-center gap-6 text-sm">
  <div className="text-center">Gross...</div>
  <div className="text-center">Hcp...</div>
  <div className="text-center">Net...</div>
  <div className="text-center min-w-[50px]">Pts...</div>
</div>
```

On screens narrower than approximately 375px, the team name and stats will overlap or cause horizontal overflow. There is no `flex-wrap`, no responsive stacking, and no breakpoint adjustments.

**Recommendation:** At the `sm:` breakpoint and below, stack the team name above the stats or reduce the stats to a condensed row. Alternatively, use `flex-wrap` with `gap-2` so the stats wrap naturally.

#### MEDIUM: `WeeklyScoreCard` table has no responsive fallback

The six-column table (Pos, Team, Gross, Hcp, Net, Points) has no `overflow-x-auto` wrapper, unlike the scorecard tables which do. On narrow mobile screens, this will cause horizontal page overflow.

```tsx
// WeeklyScoreCard.tsx -- missing overflow wrapper
<table className="w-full text-sm">
```

Note that it is wrapped in `<div className="overflow-x-auto">` on line 41, so this is actually handled. Good. However, the table's fixed `px-4` padding on every cell may make the table too wide for very narrow viewports, leading to visible horizontal scrolling.

#### MEDIUM: `TournamentBoard` column count varies by scoring type but touch targets do not

The hybrid scoring mode shows 10 columns. On a phone in portrait mode, this table will be very cramped. While `overflow-x-auto` is present, the experience of scrolling a 10-column table horizontally is poor.

**Recommendation:** For mobile, consider a card-based layout alternative for the leaderboard (show rank, name, and points prominently, with a tap-to-expand for secondary stats).

#### LOW: No explicit max-width on `ScorecardEntry`

While `ScorecardEntry` constrains content with `max-w-lg mx-auto`, the outermost `<div className="min-h-screen bg-surface flex flex-col">` itself has no max-width. On a desktop browser, the header bar and running total bar span the full viewport width while the hole card is constrained to `max-w-lg`. This creates a visual inconsistency.

---

## 4. State Management

### 4.1 The Good

**`ScorecardEntry` properly initializes state from server data.** The `useState` initializer function finds the first unscored hole, which means resuming a partially-completed scorecard positions the user correctly:

```tsx
const [currentHoleIndex, setCurrentHoleIndex] = useState(() => {
  const scored = new Set(initialScores.map((s) => s.holeNumber));
  const idx = holes.findIndex((h) => !scored.has(h.holeNumber));
  return idx >= 0 ? idx : 0;
});
```

**`AdminScorecardGrid` uses optimistic updates correctly.** The local state updates immediately while the server call runs in the background. The `setSavingHole` state provides per-hole saving feedback.

**`MatchupWithScorecards` has a proper client-side cache** for fetched scorecards, preventing redundant server calls when toggling the same team's scorecard expansion.

**`SeasonSelector` properly preserves other URL search params** when changing season.

### 4.2 Issues

#### HIGH: `AdminScorecardGrid` uses `defaultValue` without a key reset mechanism

The input elements use `defaultValue` (uncontrolled), making them uncontrolled inputs. But when the parent component passes new `holeScores` (e.g., after an admin action reloads data), the inputs will NOT update because React only reads `defaultValue` on mount.

```tsx
<input
  type="number"
  defaultValue={score ?? ""}  // won't update on prop change
  onBlur={(e) => e.target.value && handleSave(h.holeNumber, e.target.value)}
/>
```

The `localScores` state is initialized from `holeScores` via a state initializer, which also only runs on mount. If the parent re-renders with new `holeScores`, the component will display stale data.

**Recommendation:** Either:
1. Add a `key` prop at the call site (e.g., `key={scorecard.id}`) to force remount on data change, or
2. Switch to controlled inputs using `value` instead of `defaultValue`, and update `localScores` via `useEffect` when `holeScores` changes.

#### HIGH: `ScorecardEntry` autoSave silently swallows errors

```tsx
const autoSave = useCallback(async (holeNumber: number, data: HoleScoreData) => {
  setSaving(true);
  try {
    await saveHoleScore(token, holeNumber, data.strokes, ...);
  } catch {
    // Silently fail -- will retry on next save
  }
  setSaving(false);
}, [token]);
```

The comment says "will retry on next save," but there is no retry mechanism. If a save fails, the local state contains a score that the server does not have. The user sees no indication that their data is lost. On submit, the server may reject the scorecard because holes are missing.

**Recommendation:**
1. Track failed saves in a `Set<number>` and show a visual indicator (red dot on the hole navigation dot).
2. Implement actual retry logic (e.g., queue failed saves and retry on next successful save or on a timer).
3. At minimum, show a toast/banner when a save fails.

#### MEDIUM: `MatchupWithScorecards.handleToggle` has stale closure over `expandedKey` and `scorecardCache`

```tsx
const handleToggle = useCallback(
  async (matchupId: number, teamId: number) => {
    const key = `${matchupId}-${teamId}`;
    if (expandedKey === key) { ... }
    ...
    if (scorecardCache[cacheKey]) return;
    ...
  },
  [expandedKey, scorecardCache, leagueId, weekNumber]
);
```

Because `expandedKey` and `scorecardCache` are in the dependency array, the callback is recreated on every state change. This is not a bug per se, but it defeats the purpose of `useCallback`. More importantly, the `onClick` handlers that call `handleToggle` will trigger re-renders of all child matchup rows when the callback reference changes.

**Recommendation:** Use `useRef` for `expandedKey` and `scorecardCache` in the closure, or refactor to use a reducer. Alternatively, accept the re-render cost since these matchup lists are typically small.

#### LOW: `Navigation` conditionally renders based on `pathname` during render

```tsx
if (pathname.includes("/admin/login")) {
  return null;
}
```

This means the navigation component mounts, subscribes to pathname, and then conditionally renders nothing. This is a minor efficiency concern. In Next.js App Router, this would be better handled by using a `(with-navigation)` route group layout that excludes the admin login route.

---

## 5. Performance

### 5.1 The Good

**`BallRollLoader` is CSS-only.** It works during SSR hydration with no JavaScript cost. The reduced-motion fallback is also CSS-only.

**Contour SVGs (`ContourHills`, `ContourTerrain`) are static and zero-runtime-cost.** They use `currentColor` for color theming, avoiding CSS-in-JS overhead.

**`MotionProvider` uses `reducedMotion="user"`** which lets framer-motion skip animation calculations entirely for users who prefer reduced motion.

**`AnimatedNumber` uses `useInView` with `once: true`** to avoid re-triggering the counting animation on scroll.

**`BallIntoCup` properly cleans up event listeners** and uses `useSyncExternalStore` for the reduced motion query, which is the correct React 18+ pattern for external subscriptions.

### 5.2 Issues

#### HIGH: `BallIntoCup` attaches a `mousemove` listener to `window`

```tsx
useEffect(() => {
  window.addEventListener("mousemove", handleMouseMove);
  return () => window.removeEventListener("mousemove", handleMouseMove);
}, [handleMouseMove]);
```

`mousemove` fires at high frequency (60+ times per second when the user is moving the mouse). Each event calls `setBallX`, triggering a React re-render. While the component is small, this runs on every page since it is in the navigation area.

The `handleMouseMove` callback recreates on every state change (`sinking`, `hidden`, `prefersReducedMotion` are dependencies), which means the effect cleanup/setup cycle runs frequently.

**Recommendation:**
1. Use `requestAnimationFrame` to throttle updates.
2. Use a ref for `ballX` and update the DOM directly via `ref.current.style.left`, bypassing React's render cycle entirely.
3. Consider making this an opt-in component rather than always-rendered.

#### MEDIUM: `BoardRow` uses `whileInView` with framer-motion, creating an intersection observer per row

Each `BoardRow` mounts its own `IntersectionObserver` via framer-motion's `whileInView`:

```tsx
<motion.tr
  custom={index}
  variants={boardRow}
  initial="hidden"
  whileInView="visible"
  viewport={{ once: true }}
>
```

For a 30-team leaderboard, this creates 30 separate observers. While browsers handle this efficiently in practice, a better pattern is to use a single `IntersectionObserver` at the parent `TournamentBoard` level or use the `staggerContainer` pattern with a single `whileInView` on the `<tbody>`.

#### MEDIUM: `ContourBackground` runs parallax scroll tracking unconditionally

```tsx
const { scrollYProgress } = useScroll({
  target: ref,
  offset: ["start end", "end start"],
});
```

Even when `parallaxEnabled={false}`, the `useScroll` hook still attaches scroll listeners and computes progress. The `useTransform` output maps to `["0%", "0%"]` which is a no-op, but the scroll subscription still fires.

**Recommendation:** Conditionally call `useScroll` only when `parallaxEnabled` is true, or better yet, use an early-return pattern.

#### LOW: `ScorecardGrid` and `AdminScorecardGrid` recompute derived values every render

Front/back hole filtering, par totals, and score totals are computed inline on every render without memoization:

```tsx
const frontHoles = holes.filter((h) => h.holeNumber <= 9);
const backHoles = holes.filter((h) => h.holeNumber > 9);
```

With a maximum of 18 holes, this is cheap enough that memoization would add complexity without meaningful benefit. Flagging as LOW.

---

## 6. Design Consistency

### 6.1 The Good

**The design token system is comprehensive and well-organized.** The CSS custom properties in `globals.css` are grouped by domain (Course Greens, Natural Materials, Tournament Board, Scorecard, etc.) and mapped to Tailwind via `@theme inline`. This is a mature pattern.

**Typography is consistently applied.** Three font families with clear roles:
- `font-display` (Oswald) -- headings, labels, navigation
- `font-sans` (Source Sans 3) -- body text, descriptions
- `font-mono` (IBM Plex Mono) -- scores, numbers, tabular data

Components consistently apply `font-display uppercase tracking-wider` for labels and `font-mono tabular-nums` for numeric data.

**Score coloring is centralized.** The `scoreColor()` and `scoreBg()` utility functions in `format-utils.ts` provide a single source of truth for golf score styling. Both `ScorecardGrid` and `AdminScorecardGrid` use these.

**The "scorecard paper" aesthetic is consistent.** The `bg-scorecard-paper`, `border-scorecard-line`, and `text-scorecard-pencil` tokens create a cohesive visual language across all scorecard-related components.

**Animation presets in `animation.ts` are well-named** using golf metaphors (swing, roll, flutter) and provide consistent timing across the design system.

### 6.2 Issues

#### HIGH: Three font families referenced in CLAUDE.md do not match what is actually loaded

CLAUDE.md says: "Plus Jakarta Sans, Inter, Playfair Display (3 font families, 12 weights total)"

The actual `layout.tsx` loads: Oswald, IBM Plex Mono, Source Sans 3.

The globals.css `@theme` references: `--font-oswald`, `--font-ibm-plex-mono`, `--font-source-sans`.

This is a documentation mismatch, not a code bug. But it indicates the design system was overhauled and the project docs were not updated.

**Recommendation:** Update CLAUDE.md to reflect the actual font stack.

#### MEDIUM: Button styling is inconsistent between CSS utility classes and inline Tailwind

`globals.css` defines `.btn-primary`, `.btn-secondary`, and `.btn-accent` utility classes. However, no component in the reviewed set uses these classes. Instead, buttons are styled with inline Tailwind:

```tsx
// ScorecardEntry.tsx
<button className="flex-1 py-3 bg-fairway text-white font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-rough transition-colors">

// ConfirmDialog.tsx
<button className="px-4 py-2 text-sm font-display font-medium text-white rounded-lg focus:outline-none focus:ring-2 uppercase tracking-wider">
```

These inline styles approximately match `.btn-primary` but use different padding, font sizes, and border radius values. The CSS utility classes are dead code in the context of these components.

**Recommendation:** Either adopt the CSS utility classes consistently, or delete them and standardize on a `<Button>` component that encapsulates the shared styling.

#### MEDIUM: Inconsistent use of `rounded-lg` vs `rounded` vs `rounded-full`

- Navigation links: `rounded`
- Cards and dialogs: `rounded-lg`
- Badges: `rounded-lg` or `rounded-full`
- Score display: `rounded-full`
- Season selector: `rounded-none`

The CSS custom properties define `--radius-sm: 4px`, `--radius-md: 8px`, `--radius-lg: 12px`, `--radius-xl: 16px` but these are not mapped to Tailwind classes and are not used by components. Tailwind's default `rounded-lg` (8px) approximately matches `--radius-md` but the intent is not explicit.

#### LOW: Margin applied directly on card components

`WeeklyScoreCard`, `ScoreCard`, and `MatchupWithScorecards` all include `mb-6` on their outermost element:

```tsx
<div className="bg-scorecard-paper rounded-lg shadow-md overflow-hidden border border-scorecard-line/50 mb-6">
```

Margin on components is an anti-pattern because it makes them non-composable. The parent should control spacing, not the component.

---

## 7. Error States & Edge Cases

### 7.1 The Good

**`TournamentBoard` handles empty state.** When `teams.length === 0`, it renders a helpful message:

```tsx
<td colSpan={colCount} className="py-8 text-center text-text-muted font-sans">
  No teams yet. Add teams and matchups in the Admin page.
</td>
```

**`MatchupWithScorecards` handles missing scorecard gracefully:**

```tsx
) : cachedScorecard ? (
  <ScorecardGrid ... />
) : (
  <p className="...">Scorecard not available.</p>
)}
```

**`SeasonSelector` returns `null` when no seasons exist**, preventing a broken empty dropdown.

**`ScorecardEntry` validates score range** (1-20) and prevents out-of-bounds input.

**`ScorecardSummary` has a fallback for unknown status values:**

```tsx
const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.in_progress;
```

### 7.2 Issues

#### HIGH: `ScorecardEntry` has no offline/network error handling

The component auto-saves scores via server actions. If the user is on a golf course with intermittent connectivity (the primary use case!), saves will fail silently (as noted in Section 4.2). The submit action has error handling that shows a message, but the auto-save path does not. The user could enter all 18 holes, see them in local state, hit Submit, and then discover the server has none of their data.

**Recommendation:** Implement a save queue with retry logic. Store pending saves in `localStorage` as a safety net. Show a persistent "Unsaved changes" warning when saves fail.

#### MEDIUM: `AdminScorecardGrid` does not handle save failures

The `handleSave` function calls `onSaveHoleScore` in a try/finally but has no catch:

```tsx
async function handleSave(holeNumber: number, value: string) {
  setLocalScores((prev) => { ... }); // optimistic update
  setSavingHole(holeNumber);
  try {
    await onSaveHoleScore(holeNumber, strokes);
  } finally {
    setSavingHole(null);
  }
}
```

If the save fails, the local state shows the new score but the server has the old score. There is no error indication or rollback.

**Recommendation:** Add a `catch` block that reverts the optimistic update and shows an error indicator on the affected cell.

#### MEDIUM: `Logo` image variant has no error fallback

```tsx
<Image
  src="/images/logo.png"
  alt="LeagueLinks"
  width={imageConfig.width}
  height={imageConfig.height}
  priority
/>
```

If the image fails to load, the user sees a broken image. The `badge` and `contour` variants are self-contained (SVG/CSS), but the `image` variant depends on a static file.

**Recommendation:** Add an `onError` handler that falls back to the `badge` variant.

#### LOW: `MatchupWithScorecards` does not handle the case where `matchups` is empty

If there are no matchups for a week, the component renders the week header and an empty `divide-y` container:

```tsx
<div className="bg-rough text-board-yellow px-6 py-3">
  <h2>Round {weekNumber}</h2>
</div>
<div className="divide-y divide-scorecard-line/40">
  {matchups.map(...)}  // empty
</div>
```

This results in a header with no content below it.

**Recommendation:** Show a "No matchups this round" empty state when `matchups.length === 0`.

---

## 8. Design System ("The Grounds") Assessment

### 8.1 Strengths

The `grounds/` directory is a genuinely thoughtful design system foundation:

1. **`TimeProvider`** adds ambient time-of-day warmth shifts. This is delightful and distinctive.
2. **`ContourBackground`** with parallax creates a topographic map aesthetic that reinforces the golf theme.
3. **`MotionProvider`** centralizes framer-motion configuration and reduced-motion handling.
4. **`BallRollLoader`** is a CSS-only loading animation that works during SSR -- superior to a JS-dependent spinner.
5. **`MedalBadge`** with gold/silver/bronze colors and scale-in animation is polished.
6. **`animation.ts`** provides a centralized, well-named animation vocabulary.

### 8.2 Adoption Gap

The design system's biggest problem is that most of the application does not use it. The `grounds/` primitives (`GroundsCard`, `ScorecardGrid`/`ScorecardRow`/`ScorecardCell`, `BallRollLoader`) appear to be unused by the feature components reviewed here. The feature components inline their own styling, creating a parallel styling layer.

This is a governance problem more than a technical one. The design system exists; it just needs to be enforced as the canonical way to build UI.

---

## 9. Summary of Findings

### Critical (1)
| # | Finding | Location |
|---|---------|----------|
| 1 | `ScoreCard` is a near-verbatim copy of `MatchupWithScorecards` | `ScoreCard.tsx`, `MatchupWithScorecards.tsx` |

### High (8)
| # | Finding | Location |
|---|---------|----------|
| 1 | Duplicated TypeScript interfaces (`HoleData`, `HoleScoreData`, `TeamScore`) | Multiple files |
| 2 | `grounds/ScorecardGrid` name collision with feature `ScorecardGrid` | `grounds/ScorecardGrid.tsx`, `ScorecardGrid.tsx` |
| 3 | Scorecard tables lack `scope` attributes and `<caption>` | `ScorecardGrid.tsx`, `AdminScorecardGrid.tsx` |
| 4 | `ScorecardEntry` score input missing `aria-live`, quick buttons missing `aria-label` | `ScorecardEntry.tsx` |
| 5 | `ConfirmDialog` does not auto-focus on open | `ConfirmDialog.tsx` |
| 6 | `AdminScorecardGrid` uses `defaultValue` without key reset | `AdminScorecardGrid.tsx` |
| 7 | `ScorecardEntry` autoSave silently swallows errors with no retry | `ScorecardEntry.tsx` |
| 8 | `BallIntoCup` attaches unthrottled `mousemove` to `window` | `BallIntoCup.tsx` |

### Medium (9)
| # | Finding | Location |
|---|---------|----------|
| 1 | Feature components bypass `grounds/` design system primitives | `WeeklyScoreCard`, `ScoreCard`, `MatchupWithScorecards` |
| 2 | `ScorecardEntry` is a 490-line monolith | `ScorecardEntry.tsx` |
| 3 | `MatchupWithScorecards` team rows not responsive on narrow screens | `MatchupWithScorecards.tsx` |
| 4 | `TournamentBoard` 10-column hybrid mode poor on mobile | `TournamentBoard.tsx` |
| 5 | `MatchupWithScorecards.handleToggle` stale closure on `expandedKey` | `MatchupWithScorecards.tsx` |
| 6 | `ContourBackground` runs parallax tracking when disabled | `ContourBackground.tsx` |
| 7 | CSS utility classes (`.btn-primary`, etc.) are dead code | `globals.css` |
| 8 | `AdminScorecardGrid` does not handle save failures | `AdminScorecardGrid.tsx` |
| 9 | Hole navigation dots too small for touch (12px) | `ScorecardEntry.tsx` |

### Low (5)
| # | Finding | Location |
|---|---------|----------|
| 1 | `text-text-light` (#9CA3AF) fails WCAG AA contrast on white | `globals.css` |
| 2 | Navigation conditionally renders null based on pathname | `Navigation.tsx` |
| 3 | No memoization on hole filtering (trivial cost) | `ScorecardGrid.tsx` |
| 4 | Margin (`mb-6`) baked into card components | Multiple files |
| 5 | CLAUDE.md font documentation is stale | `CLAUDE.md` |

---

## 10. Recommended Priority Actions

1. **Deduplicate `ScoreCard` into `MatchupWithScorecards`** with an `expandable` prop. This eliminates the largest code duplication and prevents future drift.

2. **Extract shared TypeScript interfaces** into `src/types/scorecard.ts` and `src/types/matchup.ts`.

3. **Add accessibility attributes to scorecard tables** (`scope`, `<caption>`) and score input (`aria-live`, `aria-label`).

4. **Add error handling/retry to `ScorecardEntry` autoSave** -- this is user-facing data loss on the primary use case (golfer on a course with spotty connectivity).

5. **Throttle `BallIntoCup` mouse tracking** with `requestAnimationFrame` or move to direct DOM manipulation.

6. **Rename `grounds/ScorecardGrid`** to resolve the naming collision.

7. **Begin adopting `grounds/` primitives** in feature components, starting with the card wrapper pattern that is duplicated across three components.
