# 01 — Security & Authentication Fixes

Based on review of auth layer, middleware, rate limiting, session management, and login/logout routes.

**Files in scope:**
- `src/lib/auth.ts`
- `src/lib/superadmin-auth.ts`
- `src/lib/session-secret.ts`
- `src/lib/scorecard-auth.ts`
- `src/lib/rate-limit.ts`
- `src/middleware.ts`
- `src/app/api/admin/login/route.ts`
- `src/app/api/admin/logout/route.ts`
- `src/app/api/sudo/login/route.ts`
- `src/app/api/sudo/logout/route.ts`
- `src/app/api/sudo/impersonate/route.ts`

---

## Priority 1: Critical

### 1.1 No session invalidation on password change
**File:** `src/lib/actions/leagues.ts:115-160`
**Problem:** `changeLeaguePassword()` hashes and saves a new password but does nothing to invalidate the existing JWT. Old JWT remains valid for up to 7 days. An attacker with a stolen token keeps access even after the password is changed. Same applies to super-admin — no way to invalidate without rotating `SESSION_SECRET` (which logs out every user on the platform).
**Fix:**
1. Add a `passwordVersion` (integer) column to the `League` model (and `SuperAdmin` model).
2. Include `passwordVersion` as a claim in the JWT when minting tokens.
3. In `getAdminSession()` and `verifySessionToken()`, after JWT signature verification, fetch the current `passwordVersion` from the DB and compare. If mismatched, return null.
4. In `changeLeaguePassword()`, increment `passwordVersion` in the same transaction as the password update.
5. This adds one lightweight DB query per authenticated request. If that is unacceptable, use a short-lived in-memory cache (60s TTL) keyed by `leagueId` for the version check.

**Migration required:** Yes — add `passwordVersion Int @default(0)` to `League` and `SuperAdmin` models.

### 1.2 Rate limiter is a no-op on Vercel (serverless)
**File:** `src/lib/rate-limit.ts` (entire file)
**Problem:** In-memory `Map` resets on every cold start. Each serverless invocation may get a fresh store. An attacker doing brute-force login gets a fresh rate limit bucket with every cold start. The code has a comment acknowledging this and then waves it away.
**Fix:**
Option A (recommended): Replace with `@upstash/ratelimit` backed by Upstash Redis. Upstash has a free tier sufficient for this use case. The API is nearly identical to the current interface.
Option B (budget): Use Vercel KV (Redis-compatible). Same approach, different provider.
Option C (no external deps): Store rate limit state in the database. Add a `RateLimitEntry` model with `key`, `count`, `windowStart`. Use `upsert` with a window check. Slower than Redis but functional. Delete expired entries via a cron or on-read cleanup.

Regardless of option chosen:
1. Keep the same `checkRateLimit(key, config)` interface so callers don't change.
2. Keep the same `RATE_LIMITS` config object.
3. Add rate limiting to `saveHoleScore` (config exists at `RATE_LIMITS.scorecardSave` but is never called).

### 1.3 IP spoofing bypasses rate limiting
**File:** `src/lib/rate-limit.ts:75-83`
**Problem:** `getClientIp()` trusts `x-forwarded-for` directly. Attacker sends random `X-Forwarded-For` header to get a fresh rate limit bucket per request. Fallback to `"unknown"` means all users behind NAT or with missing headers share one bucket.
**Fix:**
1. On Vercel, use the `x-vercel-forwarded-for` header instead of `x-forwarded-for`. Vercel sets this and it cannot be spoofed by the client.
2. Fallback chain: `x-vercel-forwarded-for` → `x-forwarded-for` (first entry only) → `x-real-ip` → `"anonymous-" + userAgent hash` (never use a shared key like `"unknown"`).
3. Add a comment documenting that `x-forwarded-for` is spoofable and why we prefer the Vercel-specific header.

---

## Priority 2: High

### 2.1 League admin login leaks information + timing attack
**File:** `src/app/api/admin/login/route.ts:41-55`
**Problem:** Returns `404 "League not found"` vs `401 "Invalid password"` — textbook account enumeration. Also, when the league is not found, `bcrypt.compare` is never called, so the response is measurably faster. The super-admin login correctly does a dummy `bcrypt.compare` to prevent this, but the league login does not.
**Fix:**
1. Change both the "league not found" and "invalid password" responses to return the same status code (`401`) with the same message: `"Invalid credentials"`.
2. When the league is not found, perform a dummy `bcrypt.compare` against a pre-hashed constant (same pattern as `superadmin-auth.ts:134-137`) to equalize timing.

### 2.2 Shared session secret across all token types
**Files:** `src/lib/auth.ts:25`, `src/lib/superadmin-auth.ts:27`, `src/lib/scorecard-auth.ts:38`, `src/lib/session-secret.ts`
**Problem:** One `SESSION_SECRET` signs admin, super-admin, and scorecard JWTs. Audience claim provides domain separation but doesn't help if the signing key leaks — attacker can forge all three token types.
**Fix:**
1. Derive per-purpose keys from the master secret using HKDF (available in Node.js `crypto` module).
   - `adminKey = hkdf(SESSION_SECRET, "admin-session")`
   - `sudoKey = hkdf(SESSION_SECRET, "sudo-session")`
   - `scorecardKey = hkdf(SESSION_SECRET, "scorecard-token")`
2. Update each module to use its derived key instead of the raw secret.
3. This is backward-incompatible — all existing tokens will be invalidated on deploy. This is acceptable since it is a security improvement and tokens are short-lived (7d max).

### 2.3 No CSRF protection on login endpoints
**Files:** `src/app/api/admin/login/route.ts`, `src/app/api/sudo/login/route.ts`
**Problem:** Login CSRF: attacker page auto-submits login with attacker's credentials, logging victim into attacker's account. `sameSite: "strict"` prevents sending existing cookies but doesn't prevent *setting* new ones.
**Fix:**
1. Add an `Origin` header check to both login routes. Compare `request.headers.get("origin")` against an allowlist (env var `ALLOWED_ORIGINS` or derive from `NEXT_PUBLIC_BASE_URL`). Reject requests with mismatched or missing `Origin`.
2. This is a lightweight CSRF mitigation that doesn't require tokens. Next.js Server Actions already do this for `"use server"` functions, but the API routes do not.

### 2.4 Logout endpoints have no authentication
**Files:** `src/app/api/admin/logout/route.ts`, `src/app/api/sudo/logout/route.ts`
**Problem:** Anyone can `POST` to clear session cookies. Middleware passes through `/api/admin/*` without auth checks (middleware.ts:110-111).
**Fix:**
1. In each logout route, verify the session cookie exists and is a valid JWT before clearing it. If not valid, return 401. This prevents unauthenticated cookie-clearing.
2. Alternatively, since logout is inherently safe (clearing a cookie you don't have is a no-op), this can be deprioritized. But it is sloppy and should be cleaned up.

---

## Priority 3: Medium

### 3.1 Middleware duplicates `getSessionSecret()` without placeholder check
**File:** `src/middleware.ts:16-23` vs `src/lib/session-secret.ts:8-24`
**Problem:** Middleware has its own `getSessionSecret()` that does NOT check for the placeholder value `"CHANGE-ME-generate-a-random-secret"`. If deployed with the placeholder, middleware happily verifies tokens signed with it.
**Fix:** Import `getSessionSecret` from `src/lib/session-secret.ts` instead of reimplementing it. Remove the duplicate function from middleware.

### 3.2 JWT claims not validated against database (stale authorization)
**File:** `src/lib/auth.ts:26-44`
**Problem:** `getAdminSession()` trusts JWT claims without DB lookup. If a league is deleted, suspended, or slug changes, the JWT remains valid for 7 days.
**Fix:** This is partially addressed by 1.1 (`passwordVersion` check). Additionally, the `requireLeagueAdmin()` function should verify the league still exists and is active. Some actions already call `requireActiveLeague()` after, but this is inconsistent.
**Recommendation:** Add `requireActiveLeague(session.leagueId)` inside `requireLeagueAdmin()` itself, so every admin action automatically checks league status. Remove the redundant `requireActiveLeague()` calls from individual action functions.

### 3.3 7-day token expiry with no refresh
**Files:** `src/lib/auth.ts:112`, `src/lib/superadmin-auth.ts:87`
**Problem:** No refresh token, no sliding window. Token works for a full week then user is abruptly logged out. Combined with no revocation (1.1), a stolen token is valid for 7 days.
**Fix:**
1. Reduce admin token expiry to 24 hours.
2. Reduce super-admin token expiry to 4 hours.
3. Add a sliding window: middleware checks token age. If > 50% of expiry, mint a fresh token and set it as the new cookie. This gives a seamless UX while reducing the revocation window.

### 3.4 No password complexity requirements
**File:** `src/lib/actions/leagues.ts:128-130`
**Problem:** `changeLeaguePassword()` only checks `newPassword.length < 8`. No complexity rules.
**Fix:** Add a Zod schema: `z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/)` — require at least one uppercase and one digit. Or use `zxcvbn` library for strength scoring. Keep it simple — this is a league admin password, not a bank vault.

### 3.5 Scorecard token in URL (bearer token in logs)
**File:** `src/lib/scorecard-auth.ts`
**Problem:** Scorecard JWT is likely passed as a URL query parameter. Logged by servers, proxies, browser history, `Referer` header. 48-hour bearer credential in access logs.
**Fix:** Instead of passing the full JWT in the URL, use a short random lookup key (stored in DB alongside the JWT). The URL contains the lookup key, the server fetches the JWT from DB and verifies it. The lookup key is opaque and useless without DB access.

### 3.6 Scorecard actions not rate limited
**File:** `src/lib/actions/scorecards.ts:141`
**Problem:** `RATE_LIMITS.scorecardSave` config exists in `rate-limit.ts` but `saveHoleScore` never calls `checkRateLimit`. Leaked token enables unlimited DB writes.
**Fix:** Add `checkRateLimit` call at the top of `saveHoleScore`. Use the scorecard token (or scorecard ID) as the rate limit key. This is blocked by 1.2 (rate limiter must actually work first).

### 3.7 `autoComplete` inconsistency on login forms
**Files:** `src/app/sudo/login/page.tsx:67`, `src/app/league/[slug]/admin/login/page.tsx`
**Problem:** `autoComplete="off"` on super-admin username discourages password managers. Inconsistent between forms.
**Fix:** Remove `autoComplete="off"`. Set `autoComplete="username"` on username fields and `autoComplete="current-password"` on password fields. Let password managers work.

---

## Priority 4: Low

### 4.1 Error logging may leak passwords
**Files:** `src/app/api/admin/login/route.ts:81`, `src/app/api/sudo/login/route.ts:61`
**Fix:** Replace `console.error("Login error:", error)` with `console.error("Login error:", error instanceof Error ? error.message : "Unknown error")`. Never log the raw error object on auth endpoints.

### 4.2 No `issuer` claim in JWTs
**Files:** All JWT creation functions
**Fix:** Add `.setIssuer("leaguelinks")` to all `SignJWT` calls. Add `issuer: "leaguelinks"` to all `jwtVerify` options.

### 4.3 Hardcoded test credentials in seed scripts
**Files:** `scripts/seed-smoke-test.ts:606-610`, `scripts/seed-sample-data.ts:173`
**Fix:** Read credentials from environment variables with fallback to generated random values. Add a warning log when using fallback values.

### 4.4 Sudo layout renders admin chrome to unauthenticated users
**File:** `src/app/sudo/layout.tsx`
**Fix:** Add a client-side session check (fetch `/api/sudo/session` or similar) and redirect to login if stale. Minor — middleware handles the real protection.

---

## Execution Order

1. **1.2 + 1.3** together (rate limiter replacement + IP fix — same file)
2. **1.1** (session invalidation — requires migration, test thoroughly)
3. **2.1** (login enumeration — quick fix)
4. **2.2** (key derivation — backward-incompatible, deploy carefully)
5. **2.3 + 2.4** together (CSRF + logout auth — both are route-level changes)
6. **3.1 → 3.7** (medium items, independent, batch together)
7. **4.1 → 4.4** (low items, batch together)

Each fix should include a test demonstrating the vulnerability existed and is now resolved.
