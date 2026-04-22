# Frontend Pages Code Review -- Public-Facing Routes

**Reviewer:** Senior Staff Engineer
**Date:** 2026-02-11
**Scope:** 16 public-facing page/layout files in `src/app/`
**Model:** claude-opus-4-6

---

## 1. Executive Summary

The public-facing pages of LeagueLinks demonstrate a solid understanding of Next.js App Router patterns. The home page and most league sub-pages are proper server components with parallel data fetching via `Promise.all`, good use of `select` clauses in Prisma, and appropriate `revalidate` settings. The visual design is polished and consistent.

However, the review uncovered several architectural issues that should be addressed before scaling:

- **Three pages are needlessly client-rendered** (`/leagues`, `/leagues/new`, `/league/[slug]/signup`), sacrificing SEO, initial load performance, and caching for no benefit.
- **Every league sub-page duplicates the `getLeagueBySlug` call** between `generateMetadata` and the page body, hitting the database twice per request without deduplication.
- **`getLeagueBySlug` over-fetches 40+ handicap config fields** on public pages that only need name, slug, and scoringType.
- **The error boundary uses legacy CSS variable references** from a previous design system, producing broken styling.
- **Several pages have serial data-fetching waterfalls** that could be parallelized.
- **No `generateStaticParams` is used anywhere**, meaning zero ISR pre-rendering for known league slugs.

The good news: the core server component patterns are sound, the security posture is correct (no password/secret leaks in props), and the SEO metadata generation is comprehensive. The fixes are straightforward.

**Severity Distribution:**
- CRITICAL: 1
- HIGH: 7
- MEDIUM: 8
- LOW: 6

---

## 2. Page-by-Page Findings

### 2.1 Root Layout (`/src/app/layout.tsx`)

**Lines of code:** 70

**Positive observations:**
- Proper `<html lang="en">` attribute for accessibility/i18n.
- Skip-to-content link (`#main-content`) for keyboard navigation.
- Semantic `<main id="main-content">` wrapper.
- Metadata template (`%s | LeagueLinks`) for consistent title suffix.
- Open Graph and Twitter card metadata at the root level.
- Font loading via `next/font/google` with CSS variable approach -- correct for tree-shaking unused weights.

**Issues:**

[MEDIUM] **Font weight over-loading.** Three font families are loaded, each with 4 weights (400, 500, 600, 700). That is 12 font files. CLAUDE.md mentions the project was designed with "Plus Jakarta Sans, Inter, Playfair Display" but the code uses Oswald, IBM Plex Mono, and Source Sans 3. The font families have been updated but the 4-weight-per-family pattern remains heavy. Consider whether weight 500 is truly needed for all three families.

```typescript
// src/app/layout.tsx:7-23
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
```

[LOW] **Missing `viewport` meta configuration.** Next.js 16 supports `export const viewport` for mobile viewport settings. The layout relies on default behavior, which is fine, but an explicit `viewport` export with `themeColor` would improve PWA/mobile Chrome theming.

[LOW] **No `robots` or `manifest` metadata.** Consider adding `robots` for crawl directives and a web app manifest for "add to home screen" on mobile devices.

---

### 2.2 Home Page (`/src/app/page.tsx`)

**Lines of code:** 581

**Positive observations:**
- Server component -- correct for a data-fetching landing page.
- `export const revalidate = 60` -- appropriate ISR cadence for a stats dashboard.
- `Promise.all` for parallel stat fetching (line 12).
- `select` clause on `getFeaturedLeagues` to avoid over-fetching.
- Graceful error handling with fallback values in both data functions.
- Good use of `aria-hidden="true"` on decorative SVG elements.
- Footer copyright uses `new Date().getFullYear()` dynamically.

**Issues:**

[MEDIUM] **Duplicate copyright notice.** The footer renders the copyright year twice: once in the flex row (line 569) and again in the bottom border section (line 574). One should be removed.

```typescript
// src/app/page.tsx:568-576
<div className="text-sm text-white/60 font-sans">
  &copy; {new Date().getFullYear()} LeagueLinks
</div>
// ...
<div className="border-t border-white/10 mt-8 pt-8 text-center text-white/60 text-sm font-sans">
  &copy; {new Date().getFullYear()} LeagueLinks Golf. All rights reserved.
</div>
```

[MEDIUM] **Large inline SVG in hero.** The terrain SVG (lines 101-178) is ~80 lines of SVG markup rendered on every page load. Since it is static and decorative, it could be extracted to a separate component or imported as an optimized SVG file. This would reduce the RSC payload.

[LOW] **No structured data (JSON-LD).** The home page is the primary SEO entry point but has no structured data for Google's rich results. A `WebSite` or `Organization` JSON-LD block would improve discoverability.

[LOW] **`groupBy` query performance.** The `weeklyScoreWeeks` groupBy (line 22-24) returns all distinct league/week combinations, which will grow linearly with data. For the home page counter, a raw SQL `COUNT(DISTINCT ...)` would be more efficient at scale.

---

### 2.3 Leagues Search (`/src/app/leagues/page.tsx`)

**Lines of code:** 137

**Issues:**

[HIGH] **Entire page is a client component but should be a server component.** This page is marked `"use client"` and fetches data via `useEffect` on mount. The initial render shows "Loading leagues..." with no content for crawlers. This page is a primary SEO landing page for discoverability. It should be a server component that renders leagues at the server, with an optional client-side search enhancement.

```typescript
// src/app/leagues/page.tsx:1
"use client";
// ...
// Line 25-31: data fetched on mount, invisible to crawlers
useEffect(() => {
  getAllLeagues().then((leagues) => {
    setAllLeagues(leagues);
    setResults(leagues);
    setLoading(false);
  });
}, []);
```

**Impact:** Zero SEO for the league directory. Google sees an empty page with "Loading leagues..." text.

**Fix:** Convert to a server component that fetches leagues at the server level. Extract search functionality into a separate `<LeagueSearch>` client component that receives the initial league list as props and handles the interactive search.

[MEDIUM] **No metadata export.** The page has no `generateMetadata` or static `metadata` export. The title defaults to "LeagueLinks" from the root layout rather than "Find a League | LeagueLinks".

[MEDIUM] **No revalidate setting.** Since this is a client component, no ISR caching is configured. When converted to a server component, a `revalidate = 60` would be appropriate.

[LOW] **Debounce timer cleanup race condition.** The search `useEffect` (line 35-49) clears the timer on unmount, but `setSearching(false)` (line 45) could fire after component unmount if the async operation completes between the clearTimeout and the component unmounting. This is a minor memory leak warning in development.

---

### 2.4 New League (`/src/app/leagues/new/page.tsx`)

**Lines of code:** 217

**Positive observations:**
- Client-side validation for password match and length before submission.
- `disabled` attribute on submit button with proper conditions.
- Success state with clear admin URL guidance.
- Clean form structure with proper `htmlFor`/`id` associations.

**Issues:**

[MEDIUM] **Client component where a hybrid approach would be better.** The form itself needs to be a client component, but the entire page (including the success view with static content) is client-rendered. The page could be a server component wrapper with a `<CreateLeagueForm>` client component child.

[MEDIUM] **`window.location.origin` usage in SSR context.** Line 78 uses `typeof window !== 'undefined' ? window.location.origin : ''` which means the admin URL code block is empty during SSR/prerender. This should use an environment variable (e.g., `NEXT_PUBLIC_BASE_URL`) for reliable URL generation.

```typescript
// src/app/leagues/new/page.tsx:78
{typeof window !== 'undefined' ? window.location.origin : ''}/league/{success.slug}/admin
```

[LOW] **No metadata export.** Title defaults to "LeagueLinks" instead of "Create a League | LeagueLinks".

[LOW] **No CSRF protection discussion.** While Next.js server actions have built-in origin checking, the `createLeague` call passes the password in cleartext over the server action RPC boundary. This is fine because server actions use POST requests with HTTPS, but worth noting.

---

### 2.5 League Home (`/src/app/league/[slug]/page.tsx`)

**Lines of code:** 671

**Positive observations:**
- Server component with parallel data fetching via `Promise.all` (line 174).
- Conditional data fetching based on `scoringType` (stroke play vs. match play) -- avoids unnecessary queries.
- Proper `notFound()` handling when league does not exist.
- `generateMetadata` with league-specific title and description.
- `.catch()` handlers on all parallel promises to prevent one failure from crashing the page.
- Admin link conditionally shown based on `isLeagueAdmin` check.
- Good responsive design with `grid-cols-2 sm:grid-cols-3` patterns.

**Issues:**

[HIGH] **Duplicate database call between `generateMetadata` and page body.** `getLeaguePublicInfo(slug)` is called in `generateMetadata` (line 23) and again in the page component (line 168). Next.js does NOT automatically deduplicate `fetch` calls for direct Prisma queries (only `fetch()` calls are deduped by the Request Deduplication layer). This means every page load issues two identical database queries.

```typescript
// src/app/league/[slug]/page.tsx:23
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeaguePublicInfo(slug);  // Query 1
  // ...
}

// src/app/league/[slug]/page.tsx:168
const league = await getLeaguePublicInfo(slug);  // Query 2 (duplicate)
```

**Fix:** Use React's `cache()` wrapper around the Prisma call in the action module, or use a shared layout that passes league data down.

[MEDIUM] **No `revalidate` export.** Unlike the leaderboard, schedule, and history pages (all set to `revalidate = 60`), the league home page has no revalidation configured. With `isLeagueAdmin` called during render, the page may be treated as dynamic by Next.js (depending on whether that function reads cookies). If it does read cookies, the page is fully dynamic on every request, which is expensive for a mostly-static page.

[MEDIUM] **Unsafe type assertion on line 186.** The league type is cast to include optional `seasons` via `as { seasons?: { name: string }[] }`. This bypasses TypeScript's type system. The `getLeaguePublicInfo` return type already includes `seasons`, so this cast is likely unnecessary and masks a type mismatch.

```typescript
// src/app/league/[slug]/page.tsx:186
const currentSeason = (league as { seasons?: { name: string }[] }).seasons?.[0];
```

[LOW] **13 inline SVG icon components.** Lines 35-161 define 13 icon components (IconTrophy, IconClipboard, etc.) inline in the page file. These should be extracted to a shared `@/components/icons/` module for reuse across pages.

---

### 2.6 Leaderboard (`/src/app/league/[slug]/leaderboard/page.tsx`)

**Lines of code:** 191

**Positive observations:**
- `revalidate = 60` for ISR caching.
- Parallel fetch of `seasons` and `activeSeason`.
- Season-aware scoring type for historical accuracy (line 63-65).
- Clean separation: data fetching in server component, display in `<LeaderboardTable>`.

**Issues:**

[HIGH] **Duplicate `getLeagueBySlug` call.** Called in `generateMetadata` (line 23) and page body (line 35). Same deduplication problem as the league home page.

[HIGH] **`getLeagueBySlug` massively over-fetches for public pages.** The function (defined in `leagues.ts:212-290+`) returns 40+ handicap config fields, schedule config fields, and stroke play config fields. The leaderboard page only needs `id`, `name`, `slug`, `scoringType`, and `strokePlayProRate`. The excess data is serialized into the RSC payload for no reason.

```typescript
// leagues.ts:236-282 -- All of these are fetched but unused by the leaderboard:
handicapBaseScore, handicapMultiplier, handicapRounding, handicapDefault,
handicapMax, handicapMin, handicapScoreSelection, handicapScoreCount,
handicapBestOf, handicapLastOf, handicapDropHighest, handicapDropLowest,
handicapUseWeighting, handicapWeightRecent, handicapWeightDecay,
handicapCapExceptional, handicapExceptionalCap, handicapProvWeeks, ...
```

**Fix:** Create a lightweight `getLeagueMinimal(slug)` function that returns only the fields needed for public page chrome (id, name, slug, scoringType), and use `getLeagueBySlug` only in the admin dashboard.

[MEDIUM] **Sequential data fetch after league lookup.** The season leaderboard fetch (line 104) and all-time leaderboard fetch (line 87) happen after the season determination logic, which itself depends on the league fetch. The `seasons` + `activeSeason` fetch (line 42-45) is parallel, but it depends on `league.id` from the prior query. This is unavoidable for the first hop but the pattern is repeated across every league sub-page without a shared layout to hoist the common league + season resolution.

[LOW] **Unsafe `as` casts.** Lines 100-121 use `"avgNet" in team ? (team as { avgNet: number }).avgNet : undefined` pattern repeatedly. This suggests the type returned by `getSeasonLeaderboard` does not include these optional fields. The action should return a properly typed union or the caller should use a type guard.

---

### 2.7 Schedule (`/src/app/league/[slug]/schedule/page.tsx`)

**Lines of code:** 295

**Positive observations:**
- `revalidate = 60`.
- Handles `scheduleVisibility === "hidden"` gracefully with user-friendly message.
- Redirects stroke play leagues (no schedule needed).
- Current week highlighting with visual ring indicator.
- `isCurrentWeekOnly` visibility mode properly filters future weeks.

**Issues:**

[HIGH] **Duplicate `getLeagueBySlug` call.** Same pattern -- called in `generateMetadata` (line 20) and page body (line 32).

[MEDIUM] **Three sequential data-fetch stages.** The page has three waterfall stages:
1. `getLeagueBySlug(slug)` (line 32)
2. `getSeasons` + `getActiveSeason` in parallel (line 61-64)
3. `getSchedule` + `getScheduleStatus` + `getCurrentWeekNumber` in parallel (line 77-81)

Stage 2 depends on `league.id` from stage 1 (unavoidable). Stage 3 depends on `currentSeasonId` from stage 2 (avoidable -- could pass league.id and resolve season inside the action).

---

### 2.8 Handicap History (`/src/app/league/[slug]/handicap-history/page.tsx`)

**Lines of code:** 232

**Positive observations:**
- `revalidate = 60`.
- Parallel season fetch.
- Clean handicap change calculation logic with week-over-week deltas.
- Sticky first column in the table for horizontal scrolling.
- Legend at bottom explaining up/down arrows.

**Issues:**

[HIGH] **Duplicate `getLeagueBySlug` call.** Lines 19 and 31.

[MEDIUM] **Serial waterfall after season resolution.** `getHandicapHistoryForSeason` (line 52-53) runs after the season determination logic completes. It could be parallelized with the season fetch if the API accepted both league ID and optional season ID.

[LOW] **No horizontal scroll indicator.** The table uses `overflow-x-auto` for wide handicap grids, but there is no visual affordance (shadow, gradient) to indicate that horizontal scrolling is available on mobile.

---

### 2.9 Match/Score History (`/src/app/league/[slug]/history/page.tsx`)

**Lines of code:** 238

**Positive observations:**
- `revalidate = 60`.
- Adapts display for match_play, stroke_play, and hybrid modes.
- Parallel data fetching with conditional queries (line 69-79).
- Scorecard availability fetched alongside matchup data.

**Issues:**

[HIGH] **Duplicate `getLeagueBySlug` call.** Lines 24 and 37.

[MEDIUM] **Potential large payload.** The page fetches ALL matchups and weekly scores for a season with no pagination. For a 20-week season with 10 teams, that could be 100+ matchup records plus weekly scores, all serialized into the RSC payload. This will degrade over time.

---

### 2.10 Team Signup (`/src/app/league/[slug]/signup/page.tsx`)

**Lines of code:** 336

**Positive observations:**
- Field-level validation with `getFieldError` helper.
- `onBlur` touch tracking to avoid showing errors before user interaction.
- `aria-describedby` linking error messages to inputs.
- `role="alert"` on validation messages for screen readers.
- Handles registration closed and no active season states.

**Issues:**

[HIGH] **Entire page is a client component but should be a hybrid.** The page fetches league info via `useEffect` on mount (line 59-77), showing "Loading..." to users and crawlers. The league info and registration status could be fetched at the server level, with only the form being a client component.

```typescript
// src/app/league/[slug]/signup/page.tsx:1
"use client";
// ...
// Line 59-77: League data fetched on mount
useEffect(() => {
  getLeaguePublicInfo(slug).then((league) => {
    // ...
  });
}, [slug]);
```

**Impact:** Users see a blank loading state before the form appears. If registration is closed, they have to wait for the fetch to complete before learning this. With a server component wrapper, the "Registration Closed" state renders instantly.

[MEDIUM] **No metadata export.** No `generateMetadata` -- the title is "LeagueLinks" instead of "Team Signup - [League Name] | LeagueLinks".

[MEDIUM] **Unsafe type assertion.** Line 69 uses the same `(league as { seasons?: ... })` pattern as the league home page. The `getLeaguePublicInfo` return type already includes seasons.

---

### 2.11 Team Detail (`/src/app/league/[slug]/team/[teamId]/page.tsx`)

**Lines of code:** 341

**Positive observations:**
- Validates `teamId` is a number and verifies `team.leagueId === league.id` (ownership check).
- Parallel data fetching based on scoring type (line 59-64).
- Comprehensive stats summary (match play, stroke play, hybrid).
- Upcoming schedule section with current week highlighting.

**Issues:**

[HIGH] **Three sequential data fetches.** The page has a 3-stage waterfall:
1. `getLeagueBySlug(slug)` (line 42) -- also called in `generateMetadata` (line 24), totaling 3 calls.
2. `getTeamById(teamIdNum)` (line 47) -- depends on nothing, could be parallel with stage 1.
3. `Promise.all([getTeamMatchupHistory, ...])` (line 59-64) -- depends on `league.id` and `teamIdNum`.

Stage 1 and 2 are independent but executed serially. The metadata also calls both `getLeagueBySlug` AND `getTeamById` (line 23-26), so the total is:
- `generateMetadata`: `getLeagueBySlug` + `getTeamById` (parallel)
- Page body: `getLeagueBySlug` (serial) + `getTeamById` (serial) + parallel batch

That is 4 duplicated queries.

```typescript
// src/app/league/[slug]/team/[teamId]/page.tsx:42-48
const league = await getLeagueBySlug(slug);     // Serial
if (!league) { notFound(); }
const team = await getTeamById(teamIdNum);       // Serial (should be parallel with above)
```

**Fix:**
```typescript
const [league, team] = await Promise.all([
  getLeagueBySlug(slug),
  getTeamById(teamIdNum),
]);
```

[MEDIUM] **No `revalidate` export.** Team pages have no ISR caching, so they are either fully dynamic (if auth cookies are read) or fully static (cached indefinitely). Given that team stats change after every match, `revalidate = 60` would be appropriate.

---

### 2.12 Scorecard Entry (`/src/app/league/[slug]/scorecard/[token]/page.tsx`)

**Lines of code:** 53

**Positive observations:**
- Clean separation: server component fetches data, client component (`ScorecardEntry`) handles interaction.
- Token-based access (no auth cookie needed).
- Error state with user-friendly message.

**Issues:**

[MEDIUM] **Static metadata instead of dynamic.** The metadata is hardcoded as `"Enter Scorecard - LeagueLinks"` (line 9). It should use `generateMetadata` to include the team name and week number: `"Week 5 Scorecard - Team Eagles | LeagueLinks"`.

[MEDIUM] **No `revalidate` or caching configuration.** Scorecard pages are token-gated, so caching is tricky, but the absence of any configuration means the behavior depends on Next.js's auto-detection. Since `getScorecardByToken` is a server action (`"use server"`), this page is always dynamic. That is probably correct, but it should be explicitly documented with a comment.

[LOW] **`slug` param is unused.** The `slug` is destructured from params but never used (only `token` is used). The route could potentially be `/scorecard/[token]` without the league slug prefix, though keeping it for URL aesthetics is reasonable.

---

### 2.13 Public Scorecards (`/src/app/league/[slug]/scorecards/page.tsx`)

**Lines of code:** 141

**Positive observations:**
- Week navigation with previous/next links.
- Handles `scorecardMode === "disabled"` with `notFound()`.
- Clean scorecard grid rendering.

**Issues:**

[MEDIUM] **Serial waterfall for week determination.** Lines 40-48 have a 3-step serial waterfall:
1. `getActiveSeason(league.id)` -- awaited
2. `getCurrentWeekNumberForSeason(activeSeason.id)` -- awaited (depends on 1)
3. `getPublicScorecardsForWeek(league.id, weekNumber)` -- awaited (depends on 2)

Steps 1-2 are inherently sequential, but step 3 could be started earlier if the week number is known from the URL query parameter. When `search.week` is provided, the season/week detection is unnecessary.

```typescript
// Optimization: skip season lookup when week is explicitly provided
const parsedWeek = search.week ? parseInt(search.week) : NaN;
if (!isNaN(parsedWeek) && parsedWeek >= 1) {
  // Skip getActiveSeason + getCurrentWeekNumber entirely
  const scorecards = await getPublicScorecardsForWeek(league.id, parsedWeek);
  // ...
}
```

[LOW] **"Next week" link always shown.** The week navigator always shows a "Week N+1" link (line 82-87), even if there are no scorecards for future weeks. This leads users to empty pages.

---

### 2.14 Error Boundary (`/src/app/league/[slug]/error.tsx`)

**Lines of code:** 48

**Issues:**

[CRITICAL] **Broken styling -- uses legacy CSS variables.** The error boundary references CSS variables from a previous design system that no longer exist: `--green-dark`, `--green-primary`, `--bg-primary`, `--font-playfair`. The rest of the app uses the new design system tokens (`text-fairway`, `text-rough`, `bg-surface`, `font-display`).

```typescript
// src/app/league/[slug]/error.tsx:21
<h1 className="text-3xl font-bold text-[var(--green-dark)] mb-2" style={{ fontFamily: "var(--font-playfair)" }}>
// Line 34
className="px-6 py-3 bg-[var(--green-primary)] text-white ..."
// Line 40
className="... border-[var(--green-primary)] hover:bg-[var(--bg-primary)] ..."
```

**Impact:** When an error occurs, users see unstyled text (CSS variables resolve to nothing, defaulting to `inherit` or transparent). The error page -- the one page that MUST look correct -- is visually broken. This is a production-facing bug.

**Fix:** Replace all legacy CSS variable references with the current Tailwind design tokens:
- `var(--green-dark)` -> `text-rough`
- `var(--green-primary)` -> `bg-fairway` / `text-fairway`
- `var(--bg-primary)` -> `bg-surface`
- `var(--font-playfair)` -> remove (use `font-display` class)
- Hardcoded colors like `bg-red-100`, `text-red-500`, `bg-[#F8FAF9]` -> `bg-error-bg`, `text-board-red`, `bg-surface`

---

### 2.15 Loading State (`/src/app/league/[slug]/loading.tsx`)

**Lines of code:** 11

**Positive observations:**
- Uses a custom `BallRollLoader` component -- on-brand loading experience.
- Proper `min-h-screen` to prevent layout shift.

[LOW] **Only covers `[slug]` route group.** There is no `loading.tsx` at the root level or in the `/leagues/` route. The `/leagues` page (when converted to a server component) would benefit from a loading state.

---

### 2.16 Not Found (`/src/app/not-found.tsx`)

**Lines of code:** 49

**Positive observations:**
- On-brand "Lost Ball" messaging.
- Animated golf ball element for visual interest.
- Two navigation options (home + leagues).
- Uses the current design system tokens consistently.

[LOW] **No metadata export.** The 404 page title shows "LeagueLinks" instead of "Page Not Found | LeagueLinks".

---

## 3. Cross-Cutting Concerns

### 3.1 Data Fetching Architecture

[HIGH] **No shared layout for league data.** Every page under `/league/[slug]/*` independently fetches the league data. There is no `layout.tsx` at the `[slug]` level to provide shared league context. A shared layout could:
1. Fetch the league once and pass it down via a context or as a prop.
2. Handle the `notFound()` case in one place.
3. Provide consistent breadcrumb navigation.

Currently, the same Prisma query runs 2x per page (generateMetadata + body), and across the 8 league sub-pages, the `getLeagueBySlug` function is called 16+ times per user session of browsing league pages.

[HIGH] **`getLeagueBySlug` is a god query for public pages.** The function returns 40+ fields including all handicap config, schedule config, and stroke play config. Public pages need at most 10-15 fields. This wastes bandwidth and Prisma serialization time. There should be two tiers:
- `getLeaguePublicInfo(slug)` -- already exists, returns ~20 fields (used by 3 pages)
- `getLeagueBySlug(slug)` -- returns 40+ fields (used by 5 public pages that don't need the extra data)

The 5 pages using `getLeagueBySlug` (leaderboard, schedule, handicap-history, history, team) should switch to a lighter query or to `getLeaguePublicInfo` with the missing fields added selectively.

### 3.2 Caching & Revalidation

| Page | revalidate | Dynamic? | Assessment |
|------|-----------|----------|------------|
| `/` (home) | 60 | No | Correct |
| `/leagues` | None | Yes (client) | Should be server + 60 |
| `/leagues/new` | None | Yes (client) | Client is OK for forms |
| `/league/[slug]` | None | Likely dynamic (isLeagueAdmin reads cookies) | Should use revalidate + separate admin check |
| `/league/[slug]/leaderboard` | 60 | No | Correct |
| `/league/[slug]/schedule` | 60 | No | Correct |
| `/league/[slug]/handicap-history` | 60 | No | Correct |
| `/league/[slug]/history` | 60 | No | Correct |
| `/league/[slug]/signup` | None | Yes (client) | Should be server + 60 |
| `/league/[slug]/team/[teamId]` | None | Possibly | Should add revalidate = 60 |
| `/league/[slug]/scorecard/[token]` | None | Yes (token-based) | Correct for dynamic |
| `/league/[slug]/scorecards` | None | Possibly | Should add revalidate = 60 |

### 3.3 SEO

**Missing metadata on 4 pages:**
- `/leagues` -- no title, no description
- `/leagues/new` -- no title, no description
- `/league/[slug]/signup` -- no title, no description (client component)
- `/not-found` -- no title

**No `generateStaticParams` anywhere.** For a small number of leagues, pre-rendering known slugs at build time would dramatically improve TTFB for the most-visited pages.

**No JSON-LD structured data.** The home page and league pages would benefit from `SportsOrganization` or `Event` structured data for Google's rich results.

### 3.4 Security

[MEDIUM] **`contactEmail` and `contactPhone` rendered in public HTML.** While these are intentionally public, they are rendered as plain text (line 643-653 of league home page), making them trivially harvestable by email scrapers. Consider obfuscation or a contact form.

No other security issues found. Sensitive fields (passwords, admin credentials) are properly excluded from all public queries via `select` clauses. The `isLeagueAdmin` check correctly does not expose admin status in the HTML -- it only controls whether the "Admin" link is shown.

### 3.5 Responsive Design

The responsive patterns are generally good:
- `grid-cols-2 sm:grid-cols-3` for navigation links
- `hidden sm:block` for table columns on mobile
- `flex-col sm:flex-row` for button groups
- `text-6xl md:text-8xl lg:text-[7rem]` for hero typography

[MEDIUM] **Handicap history table on mobile.** The table in `handicap-history/page.tsx` has a sticky first column and horizontal scroll, but with many weeks, the scrollable area can be very wide. The table cells have `min-w-[70px]`, so 20 weeks = 1400px minimum width. There is no visual scroll indicator (shadow/gradient) to alert mobile users that content extends beyond the viewport.

### 3.6 Accessibility

**Good patterns observed:**
- `aria-hidden="true"` on decorative elements (SVGs, dividers)
- `role="alert"` on form validation messages
- `aria-describedby` linking inputs to error messages
- Skip-to-content link in root layout
- Semantic HTML (`<header>`, `<nav>`, `<section>`, `<footer>`)

[MEDIUM] **Missing `alt` text on Logo component.** The `<Logo>` component is used in the footer (line 547) but we cannot verify its accessibility without reading the component source. Ensure it has appropriate `alt` text or `aria-label`.

[LOW] **Color-only status indicators.** Registration status uses green/red colors without additional text differentiation in some contexts (e.g., the small dot indicator in the season badge, line 253). Users with color blindness may not distinguish these states.

---

## 4. Performance Optimization Recommendations

### 4.1 Eliminate Duplicate Database Queries (High Impact)

Wrap `getLeagueBySlug` and `getLeaguePublicInfo` in React's `cache()`:

```typescript
import { cache } from "react";

export const getLeagueBySlug = cache(async (slug: string) => {
  return prisma.league.findUnique({ where: { slug }, select: { ... } });
});
```

This ensures that within a single request (metadata + page body), the query runs only once. This is a **single-line change per function** that halves database queries on every league page.

### 4.2 Create a Shared League Layout (High Impact)

Add `/src/app/league/[slug]/layout.tsx` that:
1. Fetches league data once
2. Handles `notFound()` for invalid slugs
3. Passes league data to children via React context or slot props

### 4.3 Split `getLeagueBySlug` Into Tiers (Medium Impact)

- `getLeagueCore(slug)` -> id, name, slug, scoringType, status (for all pages)
- `getLeaguePublicInfo(slug)` -> core + display fields (for public pages, already exists)
- `getLeagueAdminConfig(slug)` -> core + handicap/scoring/schedule config (admin only)

### 4.4 Convert Client Pages to Server Components (Medium Impact)

Convert `/leagues`, `/leagues/new`, and `/league/[slug]/signup` to server components with client component children for interactive parts. Priority: `/leagues` (SEO) > `/signup` (UX) > `/leagues/new` (low traffic).

### 4.5 Add `generateStaticParams` for Known Leagues (Medium Impact)

```typescript
export async function generateStaticParams() {
  const leagues = await prisma.league.findMany({
    where: { status: "active" },
    select: { slug: true },
  });
  return leagues.map((l) => ({ slug: l.slug }));
}
```

This pre-renders all active league pages at build time, reducing TTFB to near-zero for the most common routes.

### 4.6 Add Pagination to History Pages (Low Impact, Future-Proofing)

The history and team detail pages fetch all matchups/scores for a season without pagination. For now this is fine (seasons are typically 20 weeks), but adding `?page=1` support would future-proof the pages.

---

## 5. Priority-Ordered Fix List

| # | Severity | Page(s) | Issue | Effort |
|---|----------|---------|-------|--------|
| 1 | CRITICAL | `error.tsx` | Broken styling -- legacy CSS variables produce invisible text on error pages | 15 min |
| 2 | HIGH | All league sub-pages | Duplicate `getLeagueBySlug`/`getLeaguePublicInfo` calls -- wrap in `cache()` | 30 min |
| 3 | HIGH | `/leagues` | Client component kills SEO -- convert to server component with client search child | 1-2 hr |
| 4 | HIGH | All league sub-pages | `getLeagueBySlug` over-fetches 40+ fields on public pages | 1 hr |
| 5 | HIGH | `/league/[slug]/signup` | Client component shows loading state instead of server-rendered content | 1 hr |
| 6 | HIGH | `/league/[slug]/team/[teamId]` | Serial league + team fetch should be `Promise.all` | 10 min |
| 7 | HIGH | No shared layout | Add `layout.tsx` at `[slug]` level for shared league fetching | 2-3 hr |
| 8 | MEDIUM | `/league/[slug]` | Missing `revalidate` -- page may be fully dynamic | 5 min |
| 9 | MEDIUM | `/league/[slug]/team/[teamId]`, `/league/[slug]/scorecards` | Missing `revalidate` exports | 5 min |
| 10 | MEDIUM | `/leagues`, `/leagues/new`, `/league/[slug]/signup` | Missing metadata exports | 15 min |
| 11 | MEDIUM | `/league/[slug]/scorecard/[token]` | Static metadata instead of dynamic (missing team/week info) | 15 min |
| 12 | MEDIUM | `/league/[slug]/scorecards` | Serial waterfall for week determination when week is in URL | 20 min |
| 13 | MEDIUM | `/league/[slug]`, `/league/[slug]/signup` | Unsafe `as` type casts for season data | 10 min |
| 14 | MEDIUM | `page.tsx` (home) | Duplicate copyright notice in footer | 2 min |
| 15 | MEDIUM | Handicap history table | No horizontal scroll indicator on mobile | 20 min |
| 16 | LOW | All league pages | Add `generateStaticParams` for ISR pre-rendering | 30 min |
| 17 | LOW | `/` (home) | No JSON-LD structured data | 20 min |
| 18 | LOW | `/league/[slug]` | 13 inline SVG icons should be extracted to shared module | 30 min |
| 19 | LOW | `/not-found` | Missing metadata title | 2 min |
| 20 | LOW | `/leagues` | Search debounce cleanup race condition | 10 min |
| 21 | LOW | `layout.tsx` | Consider reducing font weights from 4 to 3 per family | 10 min |
| 22 | LOW | `/league/[slug]/scorecards` | "Next week" link always shown even for future weeks | 15 min |

---

## Files Reviewed

1. `/Users/alexoberlander/Documents/Claude/golf/src/app/page.tsx`
2. `/Users/alexoberlander/Documents/Claude/golf/src/app/layout.tsx`
3. `/Users/alexoberlander/Documents/Claude/golf/src/app/leagues/page.tsx`
4. `/Users/alexoberlander/Documents/Claude/golf/src/app/leagues/new/page.tsx`
5. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/page.tsx`
6. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/leaderboard/page.tsx`
7. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/schedule/page.tsx`
8. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/handicap-history/page.tsx`
9. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/history/page.tsx`
10. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/signup/page.tsx`
11. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/team/[teamId]/page.tsx`
12. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/scorecard/[token]/page.tsx`
13. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/scorecards/page.tsx`
14. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/error.tsx`
15. `/Users/alexoberlander/Documents/Claude/golf/src/app/league/[slug]/loading.tsx`
16. `/Users/alexoberlander/Documents/Claude/golf/src/app/not-found.tsx`
17. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/leagues.ts` (supporting analysis)
18. `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/scorecards.ts` (supporting analysis)
19. `/Users/alexoberlander/Documents/Claude/golf/src/components/GolfNews.tsx` (supporting analysis)
