# CLAUDE.md — Project Intelligence for LeagueLinks

## What This Project Is

LeagueLinks is a golf league management web app. Next.js 16 + React 19 + Prisma 7 (SQLite/Turso) + Tailwind CSS 4. Deployed on Vercel with Turso (libSQL) as the production database.

## Commands

- `npm run dev` — Start dev server
- `npm run build` — `prisma generate && next build`
- `npm run lint` — ESLint
- No test command exists yet. Tests need to be set up from scratch.

## Critical Warnings (Phase 1 Security — FIXED 2026-02-05)

### Authentication — FIXED
Session tokens now use HS256-signed JWTs via `jose`. Requires `SESSION_SECRET` env var.
- `src/lib/auth.ts` — `createSessionToken()` / `verifySessionToken()` use signed JWTs
- `src/lib/superadmin-auth.ts` — same pattern for super-admin tokens
- `src/middleware.ts` — verifies JWT signatures before allowing access

### Super-Admin Auth — FIXED
Hardcoded credentials removed. Now uses `SuperAdmin` database model with bcrypt.
- Seed with: `SUPER_ADMIN_PASSWORD=yourpass npx tsx scripts/seed-superadmin.ts`
- Old credentials (`alex`/`sudo123!`) are still in git history — consider BFG cleanup

### Password Hash Leak — FIXED
`getLeagueBySlug()` now uses a `select` clause excluding `adminPassword` and `adminUsername`.

### Password Management — FIXED
- `createLeague()` now requires a password (no more default `pass@word1`)
- `changeLeaguePassword()` server action added for admin password changes
- Password change UI added to admin settings tab

### Rate Limiting — ADDED
- Login: 5 attempts per 15 min per IP
- Sudo login: 3 attempts per 15 min per IP
- League creation: 3 per hour per IP
- Team registration: 10 per hour per IP

## Architecture Notes

### File Structure

- `src/lib/actions.ts` — **1,951-line monolith**. Contains ALL server actions (read + write). Needs to be split into domain modules (`src/lib/actions/leagues.ts`, `src/lib/actions/matchups.ts`, etc.).
- `src/app/league/[slug]/admin/page.tsx` — **2,068-line client component** with 40+ `useState` calls. Must be decomposed into tab-level components.
- `src/lib/handicap.ts` — The handicap calculation engine. This is well-designed and is the best code in the project. 605 lines of pure functions.

### Data Model

- The `League` model in `prisma/schema.prisma` is a god object with 40+ columns. The 20+ handicap config fields should be extracted to a separate `HandicapConfig` model.
- `Team.totalPoints`, `wins`, `losses`, `ties` are denormalized aggregates that are manually incremented. They can drift from reality. `recalculateLeagueStats()` exists as a reconciliation tool.
- **No database indexes exist on foreign keys.** Add `@@index` on `leagueId`, `seasonId`, `teamAId`, `teamBId` before scaling.

### Known Bugs (Must Fix)

1. **`submitMatchup` has no transaction** (`actions.ts:406-462`) — partial failures corrupt team stats
2. **Head-to-head tiebreaker sorts backwards** (`actions.ts:520-524`) — `bVsA - aVsB` should be `aVsB - bVsA`. Duplicated in 3 places.
3. **Points override passes `""` as number** (`admin/page.tsx:388`) — `as number` cast on `number | ""` doesn't convert at runtime
4. **`createSeason` has no transaction** (`actions.ts:1530-1548`) — can leave zero active seasons
5. **Freeze week is a no-op** (`handicap.ts:387-392`) — commented out with "For now, just calculate normally"

### Patterns to Follow

- Use Zod schemas for ALL server action input validation (currently only used for `registerTeam` and `updateLeagueAbout`)
- Use `$transaction` for any operation that touches multiple tables
- Use `select` clauses on Prisma queries to avoid over-fetching
- Use `Promise.all` for independent async operations (several pages have serial waterfalls)
- Server components should fetch data directly; reserve `"use server"` for mutations only

### Patterns to Avoid

- Do NOT add more state to the admin page — decompose into smaller components first
- Do NOT use `as number` casts on union types — validate and convert properly
- Do NOT use `force-dynamic` without good reason — prefer `revalidate` for read-heavy pages
- Do NOT return full Prisma models to client components — always select/omit sensitive fields

## Tech Stack

- **Framework:** Next.js 16.1.1 (App Router)
- **UI:** React 19.2.3 + Tailwind CSS 4
- **Database:** Prisma 7.2.0 with SQLite provider, libSQL adapter for Turso in production
- **Auth:** Custom cookie-based (BROKEN — see warnings above)
- **Validation:** Zod 4.3.5 (underused)
- **Fonts:** Plus Jakarta Sans, Inter, Playfair Display (3 font families, 12 weights total)
- **Deployment:** Vercel + Turso

## Testing (TODO)

No tests exist. Priority order for adding tests:
1. `src/lib/handicap.ts` — pure functions, highest value, easiest to test
2. `src/lib/auth.ts` — session parsing and validation
3. Server actions in `src/lib/actions.ts` — integration tests with test database
4. E2E with Playwright — login flow, matchup submission, leaderboard display
