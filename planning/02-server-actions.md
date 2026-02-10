# 02 — Server Action Fixes

Based on review of all 14 files in `src/lib/actions/`.

**Files in scope:**
- `src/lib/actions/leagues.ts`
- `src/lib/actions/matchups.ts`
- `src/lib/actions/seasons.ts`
- `src/lib/actions/teams.ts`
- `src/lib/actions/standings.ts`
- `src/lib/actions/league-about.ts`
- `src/lib/actions/league-settings.ts`
- `src/lib/actions/handicap-settings.ts`
- `src/lib/actions/courses.ts`
- `src/lib/actions/schedule.ts`
- `src/lib/actions/scorecards.ts`
- `src/lib/actions/scoring-config.ts`
- `src/lib/actions/weekly-scores.ts`
- `src/lib/actions/shared.ts`

---

## Priority 1: Critical

### 1.1 Head-to-head tiebreaker sorts backwards
**File:** `src/lib/actions/standings.ts:99, 300, 389`
**Problem:** `return bVsA - aVsB` should be `return aVsB - bVsA`. When two teams are tied on points and wins, the team that LOST more head-to-head games ranks HIGHER. Documented in CLAUDE.md as a known bug. Duplicated in 3 places. Corrupts every leaderboard.
**Fix:** Change `bVsA - aVsB` to `aVsB - bVsA` at all three locations. Extract the comparison into a shared `headToHeadCompare(aVsB, bVsA)` helper to prevent future drift.
**Test:** Create two teams with identical points and wins. Team A beat Team B in head-to-head. Verify Team A ranks higher (currently Team B would).

### 1.2 `saveHoleScore` has no rate limiting
**File:** `src/lib/actions/scorecards.ts:141`
**Problem:** Player with a valid 48-hour token can call `saveHoleScore` in a tight loop, generating thousands of DB writes. `RATE_LIMITS.scorecardSave` config exists but is never invoked.
**Fix:** Add `await checkRateLimit(scorecardId, RATE_LIMITS.scorecardSave)` at the top of `saveHoleScore`. Use the scorecard ID (not IP) as the key since the token is the auth mechanism.
**Dependency:** Blocked by `01-security-auth.md` item 1.2 (rate limiter must work on Vercel first). Can be added now with the in-memory limiter as a placeholder — it will start working once the limiter is replaced.

---

## Priority 2: High

### 2.1 `updateSeason` — mass assignment vulnerability
**File:** `src/lib/actions/seasons.ts:191-223`
**Problem:** Raw `data` object passed directly to `prisma.season.update` with no Zod validation. A malicious client could send `{ isActive: true, leagueId: 999 }` to reassign the season to a different league.
**Fix:** Add a Zod schema that whitelists only updatable fields:
```
const updateSeasonSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});
```
Parse `data` through this schema before passing to Prisma. Reject unknown fields.

### 2.2 `previewMatchup` — no `requireActiveLeague` check
**File:** `src/lib/actions/matchups.ts:36-160`
**Problem:** A suspended league admin can preview matchups. Inconsistent with other actions.
**Fix:** Add `await requireActiveLeague(session.leagueId)` after the `requireLeagueAdmin` call.

### 2.3 `previewMatchup` — redundant queries for data already fetched
**File:** `src/lib/actions/matchups.ts:53-78`
**Problem:** Fetches `existingMatchups` with `include: { teamA: true, teamB: true }` (full Team objects), then inside the loop does ADDITIONAL `findUnique` calls to get team names it already has. Wasteful and exposes full Team fields.
**Fix:** Use a `select` clause on the `include` to fetch only `{ id: true, name: true }`. Remove the redundant `findUnique` calls inside the loop — use the already-included team data.

### 2.4 `submitMatchup` — trusts client-submitted points for non-match-play
**File:** `src/lib/actions/matchups.ts:243-250`
**Problem:** For stroke_play/hybrid leagues, client can pass arbitrary `teamAPoints` and `teamBPoints` that get stored directly. Server only validates the sum equals 20 for match_play.
**Fix:** For stroke_play and hybrid scoring types, recalculate points server-side using `calculateStrokePlayPoints`. Ignore client-submitted values. Only trust client points for match_play where the admin is making a judgment call.

### 2.5 `submitForfeit` — hard-codes 20 points regardless of scoring type
**File:** `src/lib/actions/matchups.ts:508-543`
**Problem:** Awards 20 points for a forfeit win. In stroke_play, this number is meaningless and corrupts standings.
**Fix:** Make forfeit points configurable per league (add `forfeitPoints` to League model), or derive from the scoring type's max possible points. For now, a simpler fix: for stroke_play leagues, award the top position's point value from the scale instead of a hardcoded 20.

### 2.6 `createCourse` / `updateCourse` — no Zod validation
**File:** `src/lib/actions/courses.ts:46-227`
**Problem:** Validation is manual if-statements only. TypeScript interface provides compile-time safety but no runtime safety. Client can send 10,000-char names, NaN ratings, par values outside 3-5 range check.
**Fix:** Create a `courseInputSchema` Zod schema:
```
const courseInputSchema = z.object({
  name: z.string().min(1).max(100),
  holeCount: z.literal(9).or(z.literal(18)),
  courseRating: z.number().min(50).max(90).nullable(),
  slopeRating: z.number().int().min(55).max(155).nullable(),
  holes: z.array(z.object({
    holeNumber: z.number().int().min(1).max(18),
    par: z.number().int().min(3).max(5),
    handicapIndex: z.number().int().min(1).max(18),
    yardage: z.number().int().min(50).max(700).nullable(),
  })),
});
```
Replace manual validation with `courseInputSchema.parse(data)`.

### 2.7 `previewSchedule` — no auth check
**File:** `src/lib/actions/schedule.ts:50-92`
**Problem:** Takes raw `leagueId: number` with no auth. Any client-callable code can preview schedules for any league, exposing internal team IDs.
**Fix:** Change signature to accept `leagueSlug: string`. Call `requireLeagueAdmin(leagueSlug)` at the top. Use `session.leagueId` internally.

### 2.8 `swapTeamsInMatchup`, `cancelScheduledMatchup`, `rescheduleMatchup` — no `requireActiveLeague`
**File:** `src/lib/actions/schedule.ts:371-482`
**Problem:** Admin of a suspended league can still modify the schedule.
**Fix:** Add `await requireActiveLeague(session.leagueId)` to all three functions after the `requireLeagueAdmin` call.

### 2.9 `addManualScheduledMatchup` — no team ownership validation
**File:** `src/lib/actions/schedule.ts:484-530`
**Problem:** Accepts `teamAId` and `teamBId` without verifying they belong to the league. A malicious admin could insert matchups referencing teams from other leagues.
**Fix:** After auth, query `prisma.team.findMany({ where: { id: { in: [teamAId, teamBId] }, leagueId: session.leagueId } })`. If the result count is not 2, return an error.
**Also applies to:** `swapTeamsInMatchup` (new team IDs not validated), `addTeamToSchedule`, `removeTeamFromSchedule`.

### 2.10 `generateScorecardLink` — stores JWT as plaintext in DB
**File:** `src/lib/actions/scorecards.ts:329-335`
**Problem:** JWT bearer token stored as `accessToken: token` in the database. If the DB is compromised, attacker gets valid tokens for all active scorecards.
**Fix:** Store a SHA-256 hash of the token instead: `accessToken: crypto.createHash('sha256').update(token).digest('hex')`. When verifying, hash the presented token and compare. The actual JWT is only ever in the URL/cookie, never at rest in the DB.

### 2.11 `previewWeeklyScores` — no auth check
**File:** `src/lib/actions/weekly-scores.ts:83-259`
**Problem:** Takes raw `leagueId: number` with no auth. Reads league config, handicap settings, team names, and weekly scores for any league.
**Fix:** Change signature to accept `leagueSlug: string`. Call `requireLeagueAdmin(leagueSlug)` at the top.

---

## Priority 3: Medium

### 3.1 `searchLeagues` — no pagination cursor, no rate limiting
**File:** `src/lib/actions/leagues.ts:162-183`
**Problem:** Attacker can enumerate all league names. `take: 20` limit is good but not sufficient.
**Fix:** Add `checkRateLimit(ip, RATE_LIMITS.leagueSearch)` with a generous limit (30/minute). Add cursor-based pagination for future use.

### 3.2 `createLeague` — TOCTOU race on slug uniqueness
**File:** `src/lib/actions/leagues.ts:84-89`
**Problem:** Two concurrent requests with the same name could both pass the `findUnique` check. One fails with unhandled Prisma unique constraint error.
**Fix:** Wrap in a try/catch that specifically handles `PrismaClientKnownRequestError` with code `P2002` (unique constraint) and returns a user-friendly "League name already taken" message.

### 3.3 `getMatchupHistory`, `getTeamMatchupHistory` — no auth on read functions
**File:** `src/lib/actions/matchups.ts:345-382`
**Problem:** Any caller can query any league's matchup history if they know the ID.
**Fix:** These are likely called from public-facing pages where auth is not needed. Add a code comment: `// Public read — no auth required. Called from public leaderboard/history pages.` If they should be admin-only, add auth.

### 3.4 `deleteTeam` — schedule removal outside transaction
**File:** `src/lib/actions/teams.ts:472-502`
**Problem:** `removeTeamFromSchedule` is called via dynamic import OUTSIDE the transaction. If schedule removal succeeds but team deletion fails, schedule is corrupted.
**Fix:** Move `removeTeamFromSchedule` call inside the `$transaction` callback. Remove the dynamic import — use a normal import. If circular dependency is the concern, refactor the shared logic into a separate module.

### 3.5 `submitWeeklyScores` — duplicate check outside transaction
**File:** `src/lib/actions/weekly-scores.ts:289-343`
**Problem:** Duplicate check (`findFirst`) is outside the transaction. Two concurrent submissions for the same week could both pass and create duplicate scores.
**Fix:** Convert to an interactive `$transaction(async (tx) => { ... })`. Move the duplicate check inside the transaction.

### 3.6 `submitWeeklyScores` — no team ownership validation
**File:** `src/lib/actions/weekly-scores.ts:299-341`
**Problem:** Does not validate that each `score.teamId` belongs to the league. A malicious admin could increment `totalPoints` for teams in other leagues.
**Fix:** Query `prisma.team.findMany({ where: { id: { in: teamIds }, leagueId: session.leagueId } })`. If count doesn't match input count, return an error.

### 3.7 `updateLeagueAbout` — name change without slug update
**File:** `src/lib/actions/league-about.ts:99`
**Problem:** Changing the league name does NOT update the slug, creating a permanent disconnect.
**Fix:** When `name` is included in the update and differs from the current name, regenerate the slug using `generateSlug(name)`. Check for uniqueness. If the new slug conflicts, append a numeric suffix.

### 3.8 `updateLeagueAbout` — no try/catch
**File:** `src/lib/actions/league-about.ts:85-116`
**Problem:** If `prisma.league.update` throws, error propagates raw to client. Inconsistent with every other mutating action.
**Fix:** Wrap in try/catch, return `ActionResult` on failure.

### 3.9 `recalculateLeagueStats` — exported with no auth check
**File:** `src/lib/actions/league-settings.ts:235`
**Problem:** Exported function with no auth. Any code path can trigger a full league recalculation. DoS vector if exposed as a callable action.
**Fix:** Make it a non-exported helper. Or add an auth check at the top. Currently only called from `updateHandicapSettings` which already checks auth, so removing the export is the simplest fix.

### 3.10 `updateScorecardSettings` — no Zod validation on `scorecardMode`
**File:** `src/lib/actions/league-settings.ts:48-67`
**Problem:** TypeScript type annotation `"disabled" | "optional" | "required"` is compile-time only. DB accepts anything.
**Fix:** Add `z.enum(["disabled", "optional", "required"])` validation.

### 3.11 Leaderboard functions return full Team objects (PII leak)
**File:** `src/lib/actions/standings.ts:476-478, 514-516, 829-831, 877-879`
**Problem:** `prisma.team.findMany` with no `select` clause returns `email`, `phone`, `captainName` — PII that should not be in leaderboard responses.
**Fix:** Add `select` clauses that include only: `id`, `name`, `totalPoints`, `wins`, `losses`, `ties`, `averageScore`, `netDifferential`. Exclude PII fields.

### 3.12 Dense ranking only compares `points`
**File:** `src/lib/actions/standings.ts:404-412`
**Problem:** Two teams with the same points but different wins get the same rank number. The sort function uses multiple tiebreakers (wins, h2h, net diff), but the ranking assignment only looks at `points`.
**Fix:** The ranking comparison should use the same composite key as the sort. Compare `points`, then `wins`, then `netDifferential` for same-rank determination.

### 3.13 `getScorecardByToken` — no `leagueId` scope check
**File:** `src/lib/actions/scorecards.ts:75-139`
**Problem:** Does not verify that the scorecard's `leagueId` matches the token payload's `leagueId`.
**Fix:** After fetching the scorecard, compare `scorecard.leagueId !== tokenPayload.leagueId`. If mismatched, return null/error.

### 3.14 `adminCreateScorecard` — TOCTOU race on duplicate check
**File:** `src/lib/actions/scorecards.ts:762-810`
**Problem:** `findUnique` check for existing scorecard is outside the transaction. Two concurrent calls can both pass.
**Fix:** Use `upsert` instead of `findUnique` + `create`, matching the pattern already used in `generateScorecardLink`.

### 3.15 `scoringConfig` JSON parse uses `as number[]` cast
**File:** `src/lib/actions/scoring-config.ts:65-81`
**Problem:** `JSON.parse` result cast as `number[]` with no validation. Corrupted DB value silently becomes a plain object.
**Fix:** After `JSON.parse`, validate with `z.array(z.number()).parse(parsed)`. Catch and fall back to default on failure.

---

## Priority 4: Low

### 4.1 `createTeam` uses `requireAdmin()` instead of `requireLeagueAdmin(slug)`
**File:** `src/lib/actions/teams.ts:40-78`
**Fix:** Change to accept `leagueSlug: string`. Use `requireLeagueAdmin(leagueSlug)`.

### 4.2 `adminQuickAddTeam` manual validation instead of Zod
**File:** `src/lib/actions/teams.ts:369-433`
**Fix:** Use the existing `createTeamSchema` or a derived schema.

### 4.3 `changeLeaguePassword` manual validation instead of Zod
**File:** `src/lib/actions/leagues.ts:124-129`
**Fix:** Add a dedicated Zod schema for password changes.

### 4.4 Multiple read functions take raw IDs with no auth
**Files:** `handicap-settings.ts`, `seasons.ts`, `teams.ts`, `weekly-scores.ts`, `standings.ts`
**Fix:** Add code comments clarifying these are public reads. If any should be admin-only, add auth. Audit each function's call sites.

### 4.5 `recalculateLeagueStats` sequential queries in loop
**File:** `src/lib/actions/league-settings.ts:306-403`
**Fix:** Batch `team.update` calls using `Promise.all` within the transaction (Prisma supports parallel operations within interactive transactions). Or use `updateMany` where possible.

### 4.6 `schedule.ts` N+1 query in `processByeWeekPoints`
**File:** `src/lib/actions/schedule.ts:562-604`
**Fix:** Fetch all relevant matchups in a single query before the loop.

### 4.7 `scorecards.ts` — 5 copies of `ScorecardDetail` mapping
**File:** `src/lib/actions/scorecards.ts` (multiple locations)
**Fix:** Extract a `mapToScorecardDetail(prismaResult)` helper function.

### 4.8 `scoring-config.ts` uses `console.error` instead of `logger`
**File:** `src/lib/actions/scoring-config.ts:70, 79`
**Fix:** Replace with `logger.error()`.

---

## Execution Order

1. **1.1** (tiebreaker — one-line fix per location, write test first)
2. **1.2** (saveHoleScore rate limit — add the call now, works properly after rate limiter is replaced)
3. **2.1** (mass assignment — Zod schema for updateSeason)
4. **2.2 + 2.8** together (add `requireActiveLeague` to all missing locations)
5. **2.4 + 2.5** together (server-side point recalculation)
6. **2.6** (Zod for courses)
7. **2.7 + 2.11** together (add auth to preview functions)
8. **2.9** (team ownership validation in schedule)
9. **2.10** (hash scorecard tokens in DB)
10. **2.3** (remove redundant queries in previewMatchup)
11. **3.1 → 3.15** (medium items, mostly independent, batch in any order)
12. **4.1 → 4.8** (low items, batch together)
