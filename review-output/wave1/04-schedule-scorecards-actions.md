# Code Review: Schedule & Scorecards Server Actions

**Reviewer:** Senior Staff Engineer
**Date:** 2026-02-11
**Files Reviewed:**
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/schedule.ts` (1,195 lines)
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/actions/scorecards.ts` (1,030 lines)
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/scheduling/round-robin.ts` (297 lines)
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/scheduling/course-side.ts` (75 lines)
- `/Users/alexoberlander/Documents/Claude/golf/src/lib/scorecard-auth.ts` (72 lines)

---

## 1. Executive Summary

The schedule and scorecards modules are substantially well-structured. Transaction safety is applied consistently across multi-table mutations, authorization checks are present on all write operations, and TOCTOU race conditions have been proactively addressed in several places. The round-robin scheduling engine is a clean set of pure functions with a solid validation layer.

However, several significant issues remain:

1. **No Zod input validation on any server action** -- all parameter types are trusted from the client, violating the project's stated Zod-first convention and allowing type confusion attacks.
2. **Multiple admin-facing scorecards actions lack try/catch**, meaning Prisma errors will propagate as uncaught exceptions that Next.js will sanitize in production, giving users opaque "An error occurred" messages instead of actionable feedback.
3. **The `previewSchedule` function accepts a `leagueId` parameter directly from the caller**, creating an IDOR vulnerability where an admin authenticated for League A can preview schedules for League B.
4. **The `generateScorecardLink` upsert + separate token update is a two-step non-atomic operation** that can leave scorecards without valid tokens on partial failure.
5. **The `submitScorecard` action has no double-submit protection**, allowing concurrent submissions to race past the status check.
6. **Read-only schedule functions take raw `leagueId`/`seasonId` without authorization**, which is acceptable for public data but should be documented as intentionally public.

Overall quality is good for the schedule module (mostly transactional, good conflict checking), while the scorecards module has more gaps in error handling and atomicity.

---

## 2. Findings Table

| # | Severity | File:Line | Description | Recommendation |
|---|----------|-----------|-------------|----------------|
| 1 | CRITICAL | `scorecards.ts:304-393` | `generateScorecardLink`: Scorecard upsert and token storage are two separate DB calls. If the second `prisma.scorecard.update` (line 382) fails, the scorecard exists but has no token -- unusable state. | Combine into single transaction or use upsert with token in same call. |
| 2 | CRITICAL | `schedule.ts:61-118` | `previewSchedule` accepts `leagueId` as a direct parameter, enabling IDOR. Admin for league A can pass league B's ID. The `requireLeagueAdmin(leagueSlug)` check only validates the slug, not the leagueId. | Derive `leagueId` from the session like `generateSchedule` does (line 127). |
| 3 | HIGH | `scorecards.ts:245-300` | `submitScorecard`: No transaction. Two concurrent submits can both pass the status check at line 265, both compute `grossTotal`, and both update the scorecard. While idempotent in this specific case (same data), it reveals a pattern gap. More critically, no double-submit rate limit exists here (unlike `saveHoleScore`). | Wrap in transaction; add rate limit or optimistic lock. |
| 4 | HIGH | `schedule.ts` + `scorecards.ts` (all actions) | Zero Zod validation on any server action input. All parameters (numbers, strings, enums) are trusted from the client. A caller can pass `weekNumber: -1`, `strokes: NaN`, `strategy: "drop_tables"`, etc. | Add Zod schemas for all public server actions per project convention. |
| 5 | HIGH | `scorecards.ts:304-393` | `generateScorecardLink`: No try/catch. If any Prisma call throws, the error propagates as an uncaught exception. In Next.js production, error messages are sanitized -- the user gets no useful feedback. | Add try/catch returning `ActionResult`. |
| 6 | HIGH | `scorecards.ts:395-428` | `approveScorecard`: No try/catch wrapper. Same issue as above. | Add try/catch. |
| 7 | HIGH | `scorecards.ts:430-454` | `rejectScorecard`: No try/catch wrapper. | Add try/catch. |
| 8 | HIGH | `scorecards.ts:788-877` | `adminCreateScorecard`: No try/catch on the outer function. The inner `create` has one, but the `findUnique`, `findFirst`, and `update` calls above line 852 are unprotected. | Wrap entire function in try/catch. |
| 9 | HIGH | `scorecards.ts:879-934` | `adminCompleteAndApproveScorecard`: No try/catch. | Add try/catch. |
| 10 | HIGH | `scorecards.ts:936-974` | `adminLinkScorecardToMatchup`: No try/catch. | Add try/catch. |
| 11 | MEDIUM | `scorecards.ts:157-243` | `saveHoleScore`: Rate limit key is `scorecard-save:{scorecardId}`. A leaked token allows 100 writes per 15 min per scorecard. The rate limit does not prevent an attacker from enumerating scorecardIds (the token itself gates access, but the rate limit key should include IP for defense-in-depth). | Consider composite key `scorecard-save:{scorecardId}:{ip}`. |
| 12 | MEDIUM | `schedule.ts:641-757` | `processByeWeekPoints`: No idempotency guard. If called twice for the same week, the first call marks byes as "completed" and increments points. The second call finds no "scheduled" byes and is a no-op. This is correct behavior, but there is no guard against a race where two concurrent calls both find the same byes as "scheduled" and both increment points. | Use transaction with a `status: "scheduled"` check inside the transaction, or use `updateMany` with a `where` filter on status. |
| 13 | MEDIUM | `scorecards.ts:370-392` | `generateScorecardLink`: The `courseSide` is set on scorecard creation from the scheduled matchup, but on upsert-update (line 369), only `courseId` is updated -- `courseSide` is NOT updated. If a league admin changes the play mode after a scorecard was created, the scorecard keeps the stale `courseSide`. | Include `courseSide` in the upsert's `update` clause. |
| 14 | MEDIUM | `scorecard-auth.ts:62` | `verifyScorecardToken`: The check `!scorecardId || !teamId || ...` will reject `scorecardId: 0` or `weekNumber: 0` as falsy. While IDs should never be 0 in practice (autoincrement starts at 1), this is a subtle logical error. | Replace with explicit `typeof` / range checks (e.g., `scorecardId < 1`). |
| 15 | MEDIUM | `schedule.ts:382-411` | `getScheduleStatus`: `completedWeeks` counts individual matchups with status "completed", not whether ALL matchups in a week are completed. A week with 3/4 matchups completed is counted as "completed". | Filter to only count weeks where ALL matchups in the week are completed. |
| 16 | MEDIUM | `schedule.ts:252-295` | `getSchedule`: Uses `include` instead of `select` on the root model, fetching all columns of `ScheduledMatchup` including `createdAt`, `updatedAt`, etc. Not a correctness issue but sends unnecessary data to the client. | Use `select` on root or omit unneeded fields. |
| 17 | MEDIUM | `round-robin.ts:166` | `validateSchedule`: Uses `teamIds.includes()` inside a loop (O(n) per check, O(n*m) total). For typical league sizes (<30 teams) this is negligible, but for correctness the pattern should use a Set. | Convert `teamIds` to a `Set` before the loop. |
| 18 | LOW | `schedule.ts:160-163` | `generateSchedule`: Validation errors are logged as warnings but the schedule is still persisted. A schedule with validation errors (e.g., a team appearing twice in a round) gets saved to the database. | Either fail the operation on validation errors, or store the validation result alongside the schedule. |
| 19 | LOW | `scorecards.ts:655-706` | `emailScorecardLink`: No try/catch. If `sendScorecardEmail` throws (as opposed to returning `{ success: false }`), the error is uncaught. | Add try/catch. |
| 20 | LOW | `schedule.ts:802-831` | `addTeamToSchedule` with `fill_byes` strategy: Does not verify the `teamId` is an approved team in this league before filling bye slots. The team validation on line 577-584 is only in `addManualScheduledMatchup`. | Add team existence/approval check for `fill_byes`. |
| 21 | LOW | `schedule.ts:166-209` | `generateSchedule`: Builds an array of Prisma operations and passes to `$transaction`. For large leagues (e.g., 20 teams * 19 weeks = ~190 matchups), this creates ~192 operations in one transaction. SQLite can handle this, but it's worth noting for future scaling. | Consider batched `createMany` instead of individual creates. |
| 22 | LOW | `scorecards.ts:278-286` | `submitScorecard`: `frontNine`/`backNine` calculation doesn't account for `courseSide`. If a scorecard is for "back nine only", `frontNineScores` will be empty (correct), but the logic works by accident rather than by design. | Add a comment or make the logic explicit based on `courseSide`. |
| 23 | LOW | `course-side.ts:20` | `getCourseSideForWeek`: `firstWeekSide` parameter is typed as `string` instead of `"front" \| "back"`. No validation if an invalid value is passed. | Type as `"front" \| "back"` and add a fallback/validation. |

---

## 3. Detailed Analysis

### 3.1 Transaction Safety

**Schedule module:** Excellent. All multi-table write operations use `$transaction`:
- `generateSchedule` (line 209): deleteMany + N creates + league update -- all in one transaction.
- `clearSchedule` (line 229): deleteMany + league update.
- `swapTeamsInMatchup` (line 450): Conflict check + update inside interactive transaction (TOCTOU-safe).
- `rescheduleMatchup` (line 533): Same pattern.
- `addManualScheduledMatchup` (line 593): Same pattern.
- `addTeamToSchedule` (line 856): Delete future + create new -- interactive transaction.
- `removeTeamFromSchedule` (line 976, 1047): Both paths use transactions.
- `processByeWeekPoints` (line 749): Team updates + status changes in transaction.
- `assignShotgunStartingHoles` (line 1180): Batch updates in transaction.

**Scorecards module:** Mixed.
- `saveHoleScore` (line 208): Good -- upsert + status reset in transaction.
- `adminSaveHoleScore` (line 587): Good -- upsert + recalculate + update in transaction.
- `submitScorecard` (line 288): **Not transactional.** Single update, but the read-check-write pattern is vulnerable to races.
- `generateScorecardLink` (line 352-388): **Two separate writes** (upsert, then update with token). Should be one transaction.
- `approveScorecard` (line 419): Single update after read-check. Low risk but not atomic.
- `adminCreateScorecard` (line 837-873): Check-then-create has a race, but the P2002 catch handles it. Good pattern.

### 3.2 Input Validation (Zod)

**Neither module uses Zod for input validation.** This is a significant gap given the project's stated convention in CLAUDE.md: "Use Zod schemas for ALL server action input validation."

Vulnerable parameters that could be exploited:
- `schedule.ts`: `options.totalWeeks` could be 0, negative, or `NaN`. `options.type` could be any string. `weekNumber` could be negative. `scheduledMatchupId` could be a float.
- `scorecards.ts`: `strokes` is validated manually (1-20) but `holeNumber` only gets a course-existence check. `putts` has no range validation. `weekNumber` and `teamId` could be negative or NaN.

The manual validation that does exist (e.g., `strokes < 1 || strokes > 20`) is correct but scattered and inconsistent.

### 3.3 Error Handling

**Schedule module:** Consistently wraps all public functions in try/catch, returning `ActionResult` with error messages. The one exception is read-only functions (`getSchedule`, `getScheduleForWeek`, etc.) which let errors propagate -- acceptable for server component data fetching.

**Scorecards module:** Significant gaps. The following functions have **no try/catch**:
- `generateScorecardLink` (line 304)
- `approveScorecard` (line 395)
- `rejectScorecard` (line 430)
- `emailScorecardLink` (line 655)
- `adminCreateScorecard` (line 788)
- `adminCompleteAndApproveScorecard` (line 879)
- `adminLinkScorecardToMatchup` (line 936)

In Next.js production builds, uncaught errors in server actions are sanitized to generic messages. Users will see "An error occurred" with no actionable information.

### 3.4 Authorization

**Schedule module:** All write actions call `requireLeagueAdmin(leagueSlug)` and most call `requireActiveLeague(session.leagueId)`. Read-only functions (`getSchedule`, `getTeamSchedule`, `getScheduleStatus`) take raw `leagueId` without auth -- appropriate since these serve public pages.

**Critical IDOR in `previewSchedule`:** This function accepts `leagueId` as a direct parameter (line 63) instead of deriving it from the session. An admin authenticated for League A can call `previewSchedule("league-a", 999, options)` to preview League B's schedule. The `requireLeagueAdmin` only checks the slug matches the session, not the leagueId.

**Scorecards module:** All admin actions use `requireLeagueAdmin`. Player-facing actions (`getScorecardByToken`, `saveHoleScore`, `submitScorecard`) use JWT token verification, which is correct. The token includes `leagueId` and is verified against the scorecard's `leagueId` (line 108).

### 3.5 Race Conditions

**Schedule module:** Well-handled. The `swapTeamsInMatchup`, `rescheduleMatchup`, and `addManualScheduledMatchup` functions all use interactive transactions with conflict checks inside the transaction, preventing TOCTOU races.

**Scorecards module:**
- `saveHoleScore`: Rate-limited, uses upsert (inherently safe).
- `submitScorecard`: **Vulnerable to double-submit.** Two concurrent calls can both read status as "completed" (not yet "approved") or both read status as "in_progress", both pass the check, and both write. In practice this is idempotent for `submitScorecard` (both compute the same total), but it reveals a pattern gap.
- `generateScorecardLink`: Uses `upsert` which is safe for the scorecard creation race, but the separate token write is not atomic with the upsert.
- `approveScorecard`: Two concurrent calls can both read status as "completed" and both set it to "approved". Harmless but wasteful.

### 3.6 Business Logic

**Round-robin algorithm (round-robin.ts):** The circle method implementation is correct. Key observations:
- Odd team counts correctly add a BYE_SENTINEL and produce N rounds (not N-1).
- Double round-robin swaps home/away and applies a circular shift for better spacing.
- The `validateSchedule` function checks for completeness, balance, and team appearances per round.
- `generateScheduleForWeeks` handles truncation cleanly when `totalWeeks < fullSchedule.length`.

**Edge case: `generateSchedule` with 0 playoff weeks.** If `league.playoffWeeks` is 0, `schedulableWeeks = Math.max(1, options.totalWeeks - 0) = options.totalWeeks`. This is correct.

**Edge case: `generateSchedule` with `playoffWeeks > totalWeeks`.** `schedulableWeeks = Math.max(1, totalWeeks - playoffWeeks)` = 1. Generates only 1 week of matches. This silently degrades. The admin should be warned.

**Course-side logic:** Clean and correct. The `getCourseSideForWeek` function handles all four play modes. `filterHolesByCourseSide` and `isHoleInPlay` are straightforward.

**Bye week points (`processByeWeekPoints`):** Pre-computes league average and team averages in batch (avoiding N+1). The `league_average` calculation divides by `weekMatchups.length * 2` which assumes every matchup has two scoring teams -- if any matchup has been submitted with 0 points for one side, this deflates the average. This is a design decision, not a bug.

### 3.7 Performance

- **Batch queries:** `processByeWeekPoints` efficiently pre-loads all needed data before the loop (lines 670-709). Good.
- **N+1 in `addManualScheduledMatchup`:** Inside the transaction, line 614 does `tx.team.findUnique` per conflicting team. Since conflicts are the exception path, this is acceptable.
- **`getScheduleStatus` makes 3 queries** (league, matchups, team count). The matchups query fetches all matchups for the league/season to count them in JS. For large leagues, `groupBy` with `count` would be more efficient.
- **`getSchedule` uses `include`** instead of `select`, sending all ScheduledMatchup columns to the client.
- **`generateSchedule` creates matchups one at a time** inside a transaction array. `createMany` would be more efficient but Prisma's `createMany` doesn't support returning created records (which isn't needed here). Using an operation array with `$transaction` is fine for typical league sizes.

---

## 4. Refactored Code Examples

### 4.1 Fix IDOR in `previewSchedule` (Finding #2)

```typescript
// BEFORE (schedule.ts:61-68) -- leagueId accepted from caller
export async function previewSchedule(
  leagueSlug: string,
  leagueId: number,
  options: ScheduleGenerationOptions
): Promise<ActionResult<PreviewResult>> {
  try {
    await requireLeagueAdmin(leagueSlug);
    // leagueId is NEVER validated against the session!

// AFTER -- derive leagueId from session
export async function previewSchedule(
  leagueSlug: string,
  options: ScheduleGenerationOptions
): Promise<ActionResult<PreviewResult>> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    const leagueId = session.leagueId; // Safe: derived from verified session
```

### 4.2 Make `generateScorecardLink` Atomic with Error Handling (Findings #1, #5)

```typescript
// BEFORE (scorecards.ts:304-393) -- two separate writes, no try/catch
export async function generateScorecardLink(
  leagueSlug: string,
  teamId: number,
  weekNumber: number,
  seasonId?: number | null
): Promise<ActionResult<{ url: string; scorecardId: number }>> {
  const session = await requireLeagueAdmin(leagueSlug);
  // ... validation ...

  const scorecard = await prisma.scorecard.upsert({ ... });
  const token = await createScorecardToken({ ... });

  // BUG: If this fails, scorecard exists but has no token
  await prisma.scorecard.update({
    where: { id: scorecard.id },
    data: { accessToken: token, tokenExpiresAt: ... },
  });

  // No try/catch -- errors propagate uncaught
}

// AFTER -- atomic with error handling
export async function generateScorecardLink(
  leagueSlug: string,
  teamId: number,
  weekNumber: number,
  seasonId?: number | null
): Promise<ActionResult<{ url: string; scorecardId: number }>> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    // ... same validation code ...

    const token = await createScorecardToken({
      scorecardId: 0, // Placeholder -- will be set after upsert
      teamId,
      leagueId: session.leagueId,
      weekNumber,
    });

    // Use interactive transaction so token creation includes the real scorecardId
    const scorecardId = await prisma.$transaction(async (tx) => {
      const scorecard = await tx.scorecard.upsert({
        where: {
          leagueId_weekNumber_teamId: {
            leagueId: session.leagueId,
            weekNumber,
            teamId,
          },
        },
        create: {
          leagueId: session.leagueId,
          courseId: course.id,
          teamId,
          seasonId: seasonId ?? null,
          weekNumber,
          status: "in_progress",
          courseSide,
        },
        update: { courseId: course.id, courseSide }, // Also update courseSide (Finding #13)
      });

      // Generate token with real scorecardId
      const realToken = await createScorecardToken({
        scorecardId: scorecard.id,
        teamId,
        leagueId: session.leagueId,
        weekNumber,
      });

      await tx.scorecard.update({
        where: { id: scorecard.id },
        data: {
          accessToken: realToken,
          tokenExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });

      return scorecard.id;
    });

    // Re-derive URL from the token we just stored
    const storedScorecard = await prisma.scorecard.findUniqueOrThrow({
      where: { id: scorecardId },
      select: { accessToken: true },
    });

    const url = `/league/${leagueSlug}/scorecard/${storedScorecard.accessToken}`;
    return { success: true, data: { url, scorecardId } };
  } catch (error) {
    logger.error("generateScorecardLink failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to generate scorecard link." };
  }
}
```

### 4.3 Add Zod Validation to Server Actions (Finding #4)

```typescript
// Add to schedule.ts
import { z } from "zod/v4";

const ScheduleGenerationSchema = z.object({
  type: z.enum(["single_round_robin", "double_round_robin"]),
  totalWeeks: z.number().int().min(1).max(104),
  startWeek: z.number().int().min(1).optional(),
});

const SwapTeamsSchema = z.object({
  scheduledMatchupId: z.number().int().positive(),
  newTeamAId: z.number().int().positive(),
  newTeamBId: z.number().int().positive().nullable(),
});

const RescheduleSchema = z.object({
  scheduledMatchupId: z.number().int().positive(),
  newWeekNumber: z.number().int().min(1).max(104),
});

// Usage in generateSchedule:
export async function generateSchedule(
  leagueSlug: string,
  rawOptions: ScheduleGenerationOptions
): Promise<ActionResult<{ weeksGenerated: number }>> {
  try {
    const parseResult = ScheduleGenerationSchema.safeParse(rawOptions);
    if (!parseResult.success) {
      return { success: false, error: `Invalid options: ${parseResult.error.issues[0]?.message}` };
    }
    const options = parseResult.data;
    // ... rest of function uses validated `options` ...

// Add to scorecards.ts
const SaveHoleScoreSchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  strokes: z.number().int().min(1).max(20),
  putts: z.number().int().min(0).max(20).nullable().optional(),
  fairwayHit: z.boolean().nullable().optional(),
  greenInReg: z.boolean().nullable().optional(),
});
```

### 4.4 Add try/catch to All Uncovered Admin Actions (Findings #6-10)

```typescript
// Pattern to apply to: approveScorecard, rejectScorecard, adminCreateScorecard,
// adminCompleteAndApproveScorecard, adminLinkScorecardToMatchup, emailScorecardLink

// BEFORE (approveScorecard as example)
export async function approveScorecard(
  leagueSlug: string,
  scorecardId: number
): Promise<ActionResult> {
  const session = await requireLeagueAdmin(leagueSlug);
  // ... if requireLeagueAdmin throws, user gets opaque "An error occurred"

// AFTER
export async function approveScorecard(
  leagueSlug: string,
  scorecardId: number
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    const scorecard = await prisma.scorecard.findFirst({
      where: { id: scorecardId, leagueId: session.leagueId },
    });

    if (!scorecard) {
      return { success: false, error: "Scorecard not found." };
    }
    if (scorecard.status === "approved") {
      return { success: false, error: "Scorecard is already approved." };
    }
    if (scorecard.status === "in_progress") {
      return { success: false, error: "Scorecard has not been submitted yet." };
    }
    if (scorecard.grossTotal === null) {
      return { success: false, error: "Scorecard has no total score." };
    }

    await prisma.scorecard.update({
      where: { id: scorecardId },
      data: {
        status: "approved",
        approvedAt: new Date(),
      },
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("approveScorecard failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to approve scorecard." };
  }
}
```

### 4.5 Fix `getScheduleStatus` Completed Weeks Logic (Finding #15)

```typescript
// BEFORE (schedule.ts:390-393) -- counts individual matchups, not full weeks
const completedWeeks = new Set(
  allMatchups.filter((m) => m.status === "completed").map((m) => m.weekNumber)
);

// AFTER -- only count weeks where ALL matchups are completed
const weekMatchups = new Map<number, { total: number; completed: number }>();
for (const m of allMatchups) {
  const entry = weekMatchups.get(m.weekNumber) || { total: 0, completed: 0 };
  entry.total++;
  if (m.status === "completed") entry.completed++;
  weekMatchups.set(m.weekNumber, entry);
}
const completedWeeks = new Set(
  [...weekMatchups.entries()]
    .filter(([, { total, completed }]) => completed === total)
    .map(([weekNumber]) => weekNumber)
);
```

### 4.6 Fix `processByeWeekPoints` Race Condition (Finding #12)

```typescript
// BEFORE (schedule.ts:641-757) -- reads byes outside transaction, races possible
const byeEntries = await prisma.scheduledMatchup.findMany({
  where: { ... status: "scheduled" },
});
// ... compute points ...
await prisma.$transaction(operations);

// AFTER -- use interactive transaction for the entire operation
export async function processByeWeekPoints(
  leagueSlug: string,
  weekNumber: number
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    const league = await prisma.league.findUniqueOrThrow({
      where: { id: session.leagueId },
      select: { byePointsMode: true, byePointsFlat: true },
    });

    await prisma.$transaction(async (tx) => {
      // Read byes INSIDE transaction to prevent races
      const byeEntries = await tx.scheduledMatchup.findMany({
        where: {
          leagueId: session.leagueId,
          weekNumber,
          teamBId: null,
          status: "scheduled",
        },
      });

      if (byeEntries.length === 0) return;

      // Pre-compute averages (also inside tx for consistency)
      let leagueAvgPoints = 0;
      if (league.byePointsMode === "league_average") {
        const weekMatchups = await tx.matchup.findMany({
          where: { leagueId: session.leagueId, weekNumber },
          select: { teamAPoints: true, teamBPoints: true },
        });
        if (weekMatchups.length > 0) {
          const totalPts = weekMatchups.reduce(
            (sum, m) => sum + m.teamAPoints + m.teamBPoints, 0
          );
          leagueAvgPoints = Math.round((totalPts / (weekMatchups.length * 2)) * 10) / 10;
        }
      }

      // ... same team average logic but using `tx` ...

      for (const bye of byeEntries) {
        let points = 0;
        // ... same switch logic ...

        if (points > 0) {
          await tx.team.update({
            where: { id: bye.teamAId },
            data: { totalPoints: { increment: points } },
          });
        }

        await tx.scheduledMatchup.update({
          where: { id: bye.id },
          data: { status: "completed" },
        });
      }
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("processByeWeekPoints failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to process bye points." };
  }
}
```

---

## 5. Summary of Priority Actions

### Must Fix Before Next Release
1. **Fix IDOR in `previewSchedule`** -- remove `leagueId` parameter, derive from session (Finding #2)
2. **Add try/catch to all scorecards admin actions** (Findings #5-10, #19) -- 7 functions need wrapping
3. **Make `generateScorecardLink` atomic** (Finding #1) -- transaction the upsert + token write

### Should Fix Soon
4. **Add Zod validation to all server actions** (Finding #4) -- both modules
5. **Add rate limit / double-submit guard to `submitScorecard`** (Finding #3)
6. **Fix `processByeWeekPoints` race condition** (Finding #12) -- move reads inside transaction
7. **Fix stale `courseSide` on scorecard upsert-update** (Finding #13)

### Fix When Convenient
8. **Fix `getScheduleStatus` completed weeks logic** (Finding #15)
9. **Use `select` instead of `include` in schedule read functions** (Finding #16)
10. **Add team validation to `fill_byes` strategy** (Finding #20)
11. **Fix falsy-zero check in `verifyScorecardToken`** (Finding #14)
