# CLAUDE.md — Project Intelligence for LeagueLinks

## What This Project Is

LeagueLinks is a golf league management web app. Next.js 16 + React 19 + Prisma 7 (SQLite/Turso) + Tailwind CSS 4. Deployed on Vercel with Turso (libSQL) as the production database.

## Commands

- `npm run dev` — Start dev server (webpack)
- `npm run build` — `prisma generate && npx tsx scripts/apply-migrations.ts && next build` (migrations run against Turso during Vercel builds)
- `npm run lint` — ESLint (clean as of 2026-07-08; keep it that way)
- `npm run test:ci` — Vitest, all unit + integration tests
- `npm run test:coverage` — Coverage with enforced thresholds (60% lines/functions, 50% branches on `src/lib`)
- `npm run test:e2e` — Seeds via `scripts/seed-e2e.ts`, then Playwright

### Databases (three SQLite files — easy to confuse)

- `./dev.db` (repo root) — the real local dev database (`src/lib/db.ts` resolves `file:./dev.db` from CWD)
- `./test.db` (repo root) — used by integration tests (each test file wires its own PrismaClient at `../../test.db`)
- `prisma/dev.db` — 0-byte stale artifact; ignore it. The Prisma CLI resolves `.env`'s `file:./dev.db` against the repo root, not `prisma/`.
- After adding a migration, apply it to BOTH root databases: `DATABASE_URL="file:$PWD/test.db" npx prisma migrate deploy` (and same for `dev.db`), then `npx prisma generate`.
- Keep `prisma`, `@prisma/client`, and `@prisma/adapter-libsql` on the SAME version — a CLI/client skew produces a generated client that imports runtime files the installed client doesn't have.

## Architecture

### Server actions — `src/lib/actions/` (split by domain)

`leagues`, `teams`, `matchups`, `weekly-scores`, `standings`, `seasons`, `schedule`, `scorecards`, `courses`, `league-settings`, `handicap-settings`, `scoring-config`, `league-about`, `course-import` (stub), plus `shared.ts` (ActionResult type, `getServerActionIp`, `revalidateLeaguePages`) and `index.ts` (re-exports).

Conventions that hold today — preserve them:
- Every mutating action calls `requireLeagueAdmin(leagueSlug)` (or `requireSuperAdmin()`) and derives `leagueId` from the verified session, never from client input. Middleware alone does NOT protect server actions.
- Mutations that touch an entity by id re-verify the entity belongs to `session.leagueId`.
- Most mutations also call `requireActiveLeague()` to block writes on suspended leagues.
- Multi-table mutations use `prisma.$transaction` with check-then-act reads INSIDE the transaction.
- Zod-validate numeric/string inputs at the top of the action.
- Public reads use explicit `select` clauses (`safeTeamSelect`, league selects excluding `adminPassword`/`adminUsername`/PII).
- After any mutation that changes standings/matchups/scores, call `revalidateLeaguePages(leagueSlug)` from `shared.ts` (revalidates league root, history, leaderboard, handicap-history, schedule, scorecards).

### Handicap engine — `src/lib/handicap.ts`

Pure functions; the best code in the project. Key entry points:
- `calculateHandicapFromEntries(entries, settings, weekNumber)` — PREFERRED. Takes `{week, gross}[]` so freeze-week truncation selects true calendar weeks 1..freezeWeek even when a team missed weeks (subs/forfeits/absences leave gaps).
- `calculateHandicap(scores, settings, weekNumber)` — positional legacy variant; freeze week slices by array index. Only for callers that genuinely have no week numbers.
- Score fetchers in `actions/teams.ts`: `getTeamPreviousScoreEntries` / `getTeamPreviousScoreEntriesForScoring` return week-tagged entries (`ForScoring` reads WeeklyScore for stroke_play/hybrid, Matchup for match_play). The plain `getTeamPreviousScores*` variants are thin `number[]` wrappers kept for compatibility.
- **By design:** `Course.courseRating`/`slopeRating` are display-only; the engine is a custom configurable system, not WHS-compliant. The "USGA-Inspired" preset is a loose approximation.
- Under-par split: `underParMultiplier` applies when avg <= baseScore; `underParCap` caps the rounded result before min/max caps. `describeCalculation` mirrors both.

### Recalculation — `league-settings.ts # recalculateLeagueStats`

Triggered by `updateHandicapSettings` and the exported `recalculateAllMatchups(leagueSlug)` action. Inside one transaction it: (1) replays WeeklyScore rows week-by-week (recomputes handicap/net/position/points via the same `calculateStrokePlayPoints` + `generatePointScale` pipeline as `previewWeeklyScores`), (2) replays Matchups (using WeeklyScore gross history for stroke_play/hybrid, matchup history for match_play), (3) rebuilds Team aggregates from the recomputed values. Manual handicaps (subs, first entries) are preserved; `pointsOverridden` matchups keep their points.

### Data model notes

- `Team.totalPoints/wins/losses/ties` are denormalized; mutations keep them in sync transactionally, and `recalculateAllMatchups` is the reconciliation tool.
- FK indexes exist on all hot paths (leagueId, seasonId, teamAId/BId, composite league+week).
- `LoginAttempt` backs durable login rate limiting (see Security).
- The `League` model is still a god object (~50 columns of handicap/scoring/schedule config). Extracting a `HandicapConfig` model remains a good future refactor.
- Matchup uniqueness is `[leagueId, weekNumber, teamAId, teamBId]` — a swapped A/B pair bypasses the DB constraint; the app-layer duplicate check in `submitMatchup` (inside the transaction) covers both orderings.

## Security

- Sessions: HS256 JWTs via `jose` with pinned algorithms, issuer/audience, expiry (24h admin, 4h sudo, 1h impersonation, 48h scorecard links). `SESSION_SECRET` required; the placeholder value is rejected everywhere via `session-secret.ts # getSessionSecret()` — always use that helper, never `process.env.SESSION_SECRET!` directly.
- Login routes (`/api/admin/login`, `/api/sudo/login`): CSRF Origin check FAILS CLOSED (missing Origin → 403), timing-safe dummy bcrypt compare on unknown user, and durable DB-backed rate limiting via `checkRateLimitDurable` (LoginAttempt table, shared across serverless instances; falls back to the in-memory limiter on DB errors).
- Client IP: only `x-vercel-forwarded-for` is trusted by default. Self-hosted deployments must set `TRUST_PROXY_IP_HEADERS=true` to honor `x-forwarded-for`/`x-real-ip` (see `.env.example`).
- In-memory `checkRateLimit` still guards lower-value paths (createLeague, registerTeam, scorecard saves) — per-instance on Vercel, acceptable for those.
- Super-admin: `SuperAdmin` table with bcrypt (cost 12). Seed: `SUPER_ADMIN_PASSWORD=yourpass npx tsx scripts/seed-superadmin.ts`. Old hardcoded creds exist only in old git history.
- `/api/health` returns only `{timestamp, database: {status}}` — do not add env details or error strings back.
- Known accepted risks: scorecard share links are irrevocable until their 48h expiry (add a tokenVersion if this matters later); remaining `npm audit` moderates are build-time transitive (postcss-in-next, hono-in-prisma-dev) with no non-breaking fix.

## Patterns to Follow / Avoid

- Zod for all action inputs; `$transaction` for multi-table writes; `select` clauses everywhere; `Promise.all` for independent queries.
- Do NOT return full Prisma models to client components.
- Do NOT use `as number`/`as string` casts on unvalidated unions — validate and narrow.
- Do NOT trust client-computed points blindly: `submitMatchup` re-derives nets and enforces sum-to-20 for match play; `submitWeeklyScores` bounds-checks all numerics (a full server-side recompute there is still a worthwhile future hardening).
- Admin UI numeric inputs coerce blank → 0 (`parseFloat(v) || 0`); handicap save blocks multiplier/baseScore <= 0 client-side and the server rejects multiplier <= 0. Apply the same care to any new numeric setting.
- `handicapUnderParMultiplier`/`Cap` are optional in `updateHandicapSettings` (default null) — keep new settings optional-with-default so older clients/tests don't break.

## Testing

- `tests/unit/` — 15 files (handicap engine, auth, rate-limit, rss, round-robin, scoring-utils, ...). `tests/integration/` — 15 files covering every action module against `test.db` with mocked auth (`setAuthContext` pattern) and mocked `next/cache`/`next/headers`/rate-limit.
- Integration tests run with `fileParallelism: false` (shared test.db) under happy-dom. happy-dom's `Request` strips forbidden headers (origin/host) — `api-routes.test.ts` uses a duck-typed request helper for the CSRF tests.
- When changing engine or recalc behavior, extend `tests/unit/handicap.test.ts` and `tests/integration/league-settings.test.ts` ("recalculation rewrites weekly scores").
- E2E: Playwright specs in `e2e/` against the `seed-e2e.ts` league (password from `E2E_LEAGUE_PASSWORD`, default local-only).

## History / Gotchas

- 2026-07-08 audit fixed: recalc now rewrites WeeklyScore rows (was a silent no-op for stroke play); freeze week is week-aligned via `calculateHandicapFromEntries` (was positional); durable login rate limiting; fail-closed CSRF; health endpoint slimmed; `approveTeam` capacity check made transactional; schedule week numbers Zod-validated; dense rank labels respect tiebreakers.
- Handicap history (`getHandicapHistoryForSeason`) shows the recorded per-week handicap but a CALCULATED `currentHandicap`, and omits sub weeks entirely — tests encode this; don't "fix" it back.
- Manual handicap entries are capped at league max/min on entry (`capManualHandicap`).
- An auto-commit hook has previously swept unrelated untracked files into commits — verify commit contents before pushing.
