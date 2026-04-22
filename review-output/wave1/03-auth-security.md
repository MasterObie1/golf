# Authentication & Authorization Security Audit

**Auditor:** Senior Staff Security Engineer (automated review)
**Date:** 2026-02-11
**Scope:** All authentication, session management, authorization, and rate limiting code in LeagueLinks
**Codebase revision:** `d8c5d66` (branch `main`)

---

## 1. Executive Summary

**Verdict: CONDITIONAL GO for production**, contingent on fixing the 2 CRITICAL and 3 HIGH findings below.

The authentication infrastructure is substantially sound. The codebase uses signed JWTs via the `jose` library with HS256, enforces issuer/audience claims to prevent cross-token confusion, uses bcrypt with cost factor 12, implements timing-attack mitigations on credential lookups, and has rate limiting on all login endpoints. Cookie settings are correct (httpOnly, sameSite=strict, conditional secure flag).

However, several findings must be addressed before this application handles real user data:

| Severity | Count | Summary |
|----------|-------|---------|
| CRITICAL | 2 | Missing issuer in impersonation JWT; `x-forwarded-for` spoofable for rate limit bypass |
| HIGH | 3 | No token revocation mechanism; CSRF check bypassable; no max password length |
| MEDIUM | 4 | In-memory rate limiting; shared JWT signing secret; getServerActionIp weaker than getClientIp; console.warn audit logging |
| LOW | 3 | No `jti` claim for replay detection; scorecard token 48h lifetime; redundant session parsing logic |

---

## 2. Vulnerability Table

| # | Severity | Type | Location | Description | Exploit Scenario |
|---|----------|------|----------|-------------|------------------|
| 1 | CRITICAL | JWT Validation Bypass | `src/app/api/sudo/impersonate/route.ts:46-49` | Impersonation JWT is missing `.setIssuer("leaguelinks")`, which means `jwtVerify` with issuer check will reject it in `auth.ts` and middleware | Impersonation tokens will fail verification in `verifySessionToken()` because it requires issuer "leaguelinks"; however, the middleware's `parseSession()` also requires issuer. **On re-analysis:** this means impersonation tokens are actually *broken* -- they will be rejected by middleware on subsequent requests, and the super-admin impersonation feature silently fails. The cookie is set but unusable. This is a critical functional bug that could lead to operational workarounds (disabling issuer checks, etc.). |
| 2 | CRITICAL | Rate Limit Bypass | `src/lib/rate-limit.ts:83`, `src/lib/actions/shared.ts:13` | `x-forwarded-for` header is client-spoofable when not behind a trusted proxy. The `getClientIp()` function prefers `x-vercel-forwarded-for` (Vercel-only, non-spoofable) but falls through to `x-forwarded-for` which clients can set directly. `getServerActionIp()` (used in server actions) *only* reads `x-forwarded-for` with no Vercel header check at all. | Attacker includes `X-Forwarded-For: 1.2.3.4` header on each request with a unique IP, completely bypassing the rate limiter for login, league creation, and team registration. |
| 3 | HIGH | No Token Revocation | `src/lib/auth.ts`, `src/lib/superadmin-auth.ts` | JWTs are stateless with no revocation mechanism (no blocklist, no DB-backed sessions). Password changes do not invalidate existing sessions. | Admin changes their password after a compromise. The attacker's previously-issued JWT remains valid for up to 24 hours (admin) or 4 hours (super-admin). |
| 4 | HIGH | CSRF Protection Bypass | `src/app/api/admin/login/route.ts:11-13`, `src/app/api/sudo/login/route.ts:11-13` | CSRF check uses `origin.endsWith(host)`. If host is `example.com`, an attacker at `evilexample.com` passes the check because `"evilexample.com".endsWith("example.com")` is `true`. Additionally, the check is skipped entirely if `origin` or `host` headers are absent (both conditions must be truthy). | Attacker registers `evil-leaguelinks.vercel.app` (or any domain ending in the target's host) and performs cross-origin login requests. Also, some HTTP clients and older browsers may not send Origin headers, bypassing the check entirely. |
| 5 | HIGH | bcrypt DoS via Long Password | `src/lib/actions/leagues.ts:58`, `src/app/api/admin/login/route.ts:59` | No maximum password length enforced. bcrypt has a known DoS vector: extremely long passwords (e.g., 1MB) cause excessive CPU usage during hashing. The Zod schema requires `min(8)` but has no `max()`. | Attacker sends a 1MB password string to the login endpoint, causing the bcrypt.compare() call to consume significant CPU for several seconds per request. Combined with the rate limit bypass (#2), this enables CPU exhaustion. |
| 6 | MEDIUM | In-Memory Rate Limiting | `src/lib/rate-limit.ts:12` | Rate limit state is stored in a `Map` in process memory. On Vercel's serverless architecture, each function invocation may get a fresh instance, making the rate limiter ineffective -- an attacker gets a fresh counter on each cold start. | Attacker sends requests spaced to trigger cold starts (or across multiple Vercel regions), effectively getting unlimited attempts. |
| 7 | MEDIUM | Shared JWT Signing Secret | `src/lib/session-secret.ts`, all auth modules | All three token types (admin, super-admin, scorecard) share the same `SESSION_SECRET`. While audience/issuer claims prevent cross-type confusion, a leaked secret compromises all token types simultaneously. | If the secret leaks via logs, error messages, or environment variable exposure, attacker can forge admin, super-admin, and scorecard tokens. |
| 8 | MEDIUM | Server Action IP Extraction Weaker | `src/lib/actions/shared.ts:11-14` | `getServerActionIp()` only checks `x-forwarded-for` and `x-real-ip`, returning `"unknown"` as fallback. It lacks the `x-vercel-forwarded-for` check that `getClientIp()` has. All server actions using this function are trivially rate-limit-bypassable. | Same as #2 but affects server action rate limits specifically (league creation, team registration). |
| 9 | MEDIUM | Audit Logging to stdout | `src/app/api/sudo/impersonate/route.ts:52-54`, `src/app/api/sudo/leagues/[id]/route.ts:128-130` | Security-critical audit events (impersonation, league deletion, status changes) are logged via `console.warn()`. These logs may be lost on Vercel's serverless infrastructure and are not durable, searchable, or alertable. | Attacker compromises super-admin account, performs malicious actions. Audit trail is lost when serverless function recycles. No alerting on suspicious impersonation patterns. |
| 10 | LOW | No `jti` Claim | All JWT creation functions | JWTs lack a unique identifier (`jti` claim). Without this, individual tokens cannot be revoked by ID even if a revocation mechanism is added later. | Minor: makes future implementation of targeted token revocation more difficult. |
| 11 | LOW | Scorecard Token 48h Lifetime | `src/lib/scorecard-auth.ts:27` | Scorecard tokens are valid for 48 hours and contain the scorecardId, teamId, leagueId. If a token link is shared or intercepted, anyone with the link can submit scores for that team for 2 days. | Leaked scorecard URL allows unauthorized score submission. Mitigated by per-scorecard rate limiting. |
| 12 | LOW | Duplicated Session Parsing | `src/middleware.ts:33-63` vs `src/lib/auth.ts:16-49` | Session parsing logic is duplicated between middleware and auth module. The middleware copy lacks the `validateEnv()` call and has a different fallback for missing secrets (empty Uint8Array vs. thrown error). | Maintenance risk: divergent behavior between middleware and server-side auth checks. The middleware silently denies all sessions if SESSION_SECRET is missing, while `auth.ts` throws. |

---

## 3. Detailed Analysis

### 3.1 JWT Implementation

**Files:** `src/lib/auth.ts`, `src/lib/superadmin-auth.ts`, `src/lib/scorecard-auth.ts`

**Strengths:**
- Uses `jose` library (well-maintained, standards-compliant)
- HS256 algorithm explicitly pinned in both signing and verification (`algorithms: ["HS256"]`)
- Issuer claim `"leaguelinks"` and distinct audience claims (`"admin"`, `"sudo"`, `"scorecard"`) prevent token confusion across token types
- Expiration times are reasonable: 24h (admin), 4h (super-admin), 48h (scorecard), 1h (impersonation)
- `setIssuedAt()` included on all tokens
- Payload types are validated after verification (typeof checks at lines `auth.ts:36-37`, `superadmin-auth.ts:36-37`, etc.)

**Finding #1 -- CRITICAL: Missing Issuer on Impersonation Token**

File: `src/app/api/sudo/impersonate/route.ts`, lines 39-49:
```typescript
const sessionToken = await new SignJWT({
  leagueId: league.id,
  leagueSlug: league.slug,
  adminUsername: league.adminUsername,
  impersonatedBy: session.username,
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .setAudience("admin")
  .sign(secret);
```

This token is missing `.setIssuer("leaguelinks")`. The `parseSession()` function in the middleware (line 40-44) and `verifySessionToken()` in `auth.ts` (line 126-130) both require `issuer: "leaguelinks"`:

```typescript
const { payload } = await jwtVerify(cookie, secret, {
  algorithms: ["HS256"],
  issuer: "leaguelinks",  // <-- This will reject tokens without issuer
  audience: "admin",
});
```

**Impact:** Every impersonation token issued by a super-admin is immediately rejected by middleware and auth verification. The impersonation feature is silently broken. This is a critical functionality bug that could drive developers to weaken issuer validation as a "fix."

**Fix:**
```typescript
// src/app/api/sudo/impersonate/route.ts, line 46
.setExpirationTime("1h")
.setIssuer("leaguelinks")    // ADD THIS LINE
.setAudience("admin")
```

Also, this endpoint constructs its own JWT instead of using `createSessionToken()` from `auth.ts`. It should use the centralized function or a variant:

```typescript
// Better: use a dedicated function that includes impersonation metadata
export async function createImpersonationToken(
  session: AdminSession & { impersonatedBy: string }
): Promise<string> {
  const secret = getSessionSecret();
  return new SignJWT({
    ...session,
    impersonatedBy: session.impersonatedBy,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .setIssuer("leaguelinks")
    .setAudience("admin")
    .sign(secret);
}
```

### 3.2 Session Management

**Files:** `src/app/api/admin/login/route.ts:81-87`, `src/app/api/sudo/login/route.ts:58-64`

**Cookie settings (GOOD):**
```typescript
response.cookies.set("admin_session", sessionToken, {
  httpOnly: true,                              // Prevents XSS-based cookie theft
  secure: process.env.NODE_ENV === "production", // HTTPS-only in production
  sameSite: "strict",                          // Strongest CSRF cookie protection
  maxAge: 60 * 60 * 24,                       // 24 hours
  path: "/",                                   // Available site-wide
});
```

All cookie attributes are correctly set. The `sameSite: "strict"` is the strongest setting and prevents cookies from being sent on any cross-origin request.

**Finding #3 -- HIGH: No Token Revocation**

There is no token revocation or session invalidation mechanism anywhere in the codebase. A `grep` for "revoke", "invalidate", "blacklist", "blocklist" returned zero results. This means:

1. When a league admin changes their password (`changeLeaguePassword` in `leagues.ts:124-169`), the old JWT remains valid until expiration (up to 24h).
2. When a super-admin account is compromised, there is no way to force-logout all sessions.
3. Impersonation tokens (1h) cannot be revoked if misused.
4. Logout only clears the cookie on the client side -- the JWT itself remains valid for its full lifetime.

**Fix (recommended minimal approach):**
```typescript
// Add a `sessionVersion` column to League and SuperAdmin models
// Increment it on password change
// Include it in JWT claims
// Verify it matches current DB value on sensitive operations

// In changeLeaguePassword:
await prisma.league.update({
  where: { id: session.leagueId },
  data: {
    adminPassword: hashedPassword,
    sessionVersion: { increment: 1 },  // Invalidate all existing tokens
  },
});
```

### 3.3 Password Handling

**Files:** `src/app/api/admin/login/route.ts:59`, `src/lib/superadmin-auth.ts:129-149`, `src/lib/actions/leagues.ts:96,158`

**Strengths:**
- bcrypt with cost factor 12 (good -- above the minimum recommended 10)
- Timing attack mitigation: dummy `bcrypt.compare()` when user not found (admin login `route.ts:51`, superadmin-auth.ts:139)
- Password minimum length enforced (8 characters) via Zod schema and runtime checks
- Passwords stored as bcrypt hashes in the database

**Finding #5 -- HIGH: No Maximum Password Length**

File: `src/lib/actions/leagues.ts:58`:
```typescript
const createLeagueSchema = z.object({
  name: z.string().min(3).max(100).trim(),
  adminPassword: z.string().min(8),  // No .max()!
  scoringType: z.enum(["match_play", "stroke_play", "hybrid"]),
});
```

File: `src/lib/actions/leagues.ts:137`:
```typescript
if (newPassword.length < 8) {  // No upper bound check
```

bcrypt truncates input at 72 bytes (or 72 characters in ASCII). Any characters beyond position 72 are silently ignored. More critically, passing an extremely long string (e.g., 1MB) to `bcrypt.hash()` or `bcrypt.compare()` consumes significant CPU time before the truncation occurs in the bcryptjs JavaScript implementation.

**Fix:**
```typescript
const createLeagueSchema = z.object({
  adminPassword: z.string().min(8).max(72, "Password must be 72 characters or less"),
  // ...
});

// Also in changeLeaguePassword:
if (newPassword.length < 8 || newPassword.length > 72) {
  return { success: false, error: "Password must be between 8 and 72 characters" };
}

// And in API login routes, validate body length before parsing:
const body = await request.text();
if (body.length > 10_000) {
  return NextResponse.json({ error: "Request too large" }, { status: 413 });
}
const { password, leagueSlug } = JSON.parse(body);
```

### 3.4 Rate Limiting

**File:** `src/lib/rate-limit.ts`

**Strengths:**
- Differentiated limits: login (5/15min), sudo (3/15min), league creation (3/hr), team registration (10/hr), scorecard saves (100/15min)
- Retry-After header included in 429 responses
- Automatic cleanup of expired entries (every 5 minutes)
- Rate limiting applied at scorecard submission level too

**Finding #2 -- CRITICAL: IP Spoofing Bypasses Rate Limiting**

File: `src/lib/rate-limit.ts:77-99`:
```typescript
export function getClientIp(request: Request): string {
  const headers = new Headers(request.headers);
  const vercelIp = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelIp) return vercelIp;

  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) return forwardedFor;  // <-- CLIENT SPOOFABLE
  // ...
}
```

When deployed on Vercel, `x-vercel-forwarded-for` is set by the platform and takes precedence (good). But:

1. In non-Vercel deployments, `x-forwarded-for` is the first fallback and is trivially spoofed.
2. `getServerActionIp()` in `shared.ts:11-14` does **not** check `x-vercel-forwarded-for` at all:

```typescript
export async function getServerActionIp(): Promise<string> {
  const hdrs = await headers();
  return hdrs.get("x-forwarded-for")?.split(",")[0]?.trim()
    || hdrs.get("x-real-ip")
    || "unknown";
}
```

**Impact:** All rate limits on server actions (league creation, team registration) can be bypassed by sending a different `X-Forwarded-For` header on each request. Login rate limits are similarly bypassable in non-Vercel deployments.

**Finding #6 -- MEDIUM: In-Memory Rate Limiting on Serverless**

File: `src/lib/rate-limit.ts:12`:
```typescript
const store = new Map<string, RateLimitEntry>();
```

On Vercel's serverless platform, each function invocation may spin up a new instance with a fresh `Map`. Rate limit state is not shared across instances. Under high load or across regions, the effective rate limit is multiplied by the number of active instances.

**Fix for both:** Use Vercel KV (Redis-compatible), Upstash, or a similar distributed store:

```typescript
// Minimal fix for getServerActionIp:
export async function getServerActionIp(): Promise<string> {
  const hdrs = await headers();
  // Prefer Vercel's non-spoofable header
  const vercelIp = hdrs.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelIp) return vercelIp;

  return hdrs.get("x-forwarded-for")?.split(",")[0]?.trim()
    || hdrs.get("x-real-ip")
    || "unknown";
}
```

### 3.5 Middleware Chain

**File:** `src/middleware.ts`

**Strengths:**
- Route matcher limits middleware to admin/sudo paths only (efficient)
- League-scoped authorization: middleware verifies `session.leagueSlug === leagueSlug` (line 164)
- Login pages explicitly exempted (lines 124, 149)
- Super-admin API routes verified in middleware (lines 110-116)
- Old `/admin` routes redirected (line 175)
- Placeholder secret detection (line 23-26)

**Analysis of route protection:**

| Route Pattern | Middleware Protection | Handler Protection |
|--------------|---------------------|-------------------|
| `/api/admin/login` | Matched by middleware but falls through (line 118: `return NextResponse.next()`) | Self-protected (no auth needed -- it IS the login) |
| `/api/admin/logout` | Same as above | Self-protected (no auth needed) |
| `/api/sudo/login` | Matched, sudo check applied (line 110-116) | **BUG: Login endpoint requires sudo session in middleware** |
| `/api/sudo/logout` | Same sudo check | Same bug -- logout requires auth |
| `/api/sudo/impersonate` | Sudo session checked in middleware | Also checked via `requireSuperAdmin()` |
| `/league/*/admin/*` | Session checked, league-scoped | Also checked via `requireLeagueAdmin()` |
| `/sudo/*` | Session checked | Also checked via `requireSuperAdmin()` |

**Wait -- Potential Issue with sudo login middleware check:**

Lines 108-118:
```typescript
if (pathname.startsWith("/api/")) {
  if (pathname.startsWith("/api/sudo/")) {
    const sudoSessionCookie = request.cookies.get("sudo_session")?.value;
    const sudoSession = await parseSuperAdminSession(sudoSessionCookie);
    if (!sudoSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return NextResponse.next();
}
```

This applies the sudo session check to ALL `/api/sudo/*` routes, **including** `/api/sudo/login`. This means an unauthenticated super-admin cannot reach the login endpoint because middleware rejects them first.

**However**, looking at the matcher config (line 184-191):
```typescript
matcher: [
  "/admin/:path*",
  "/league/:path*/admin/:path*",
  "/api/admin/:path*",
  "/api/sudo/:path*",
  "/sudo/:path*",
],
```

The `/api/sudo/login` route IS matched. This means the super-admin login endpoint is unreachable unless you already have a valid session -- a classic chicken-and-egg bug.

**Wait -- I need to verify this is actually a live bug or if it's being handled.** The `/api/sudo/login` route IS under `/api/sudo/`, so the middleware WILL block it. But the application presumably works in practice, so either:
1. There's a different login mechanism, or
2. The `POST` route handler still executes because Next.js middleware behavior differs for API routes

Actually, looking more carefully at the matcher: `/api/sudo/:path*` matches `/api/sudo/login`, `/api/sudo/logout`, etc. The middleware function's line 108 check (`pathname.startsWith("/api/")`) catches these, then line 110 requires sudo auth for ALL of them. **This is a bug** -- the login endpoint should be exempted:

```typescript
if (pathname.startsWith("/api/sudo/") && pathname !== "/api/sudo/login") {
  // ... sudo session check
}
```

**Classification:** This is a functional bug rather than a security vulnerability (it blocks access rather than grants it), but it means the sudo login flow is broken unless there's a workaround.

**UPDATE:** On reflection, this may actually be working if the login form posts directly and Next.js middleware processes the response differently. But the code as written should block the POST to `/api/sudo/login`. This needs testing.

### 3.6 CSRF Protection

**Finding #4 -- HIGH: CSRF Check Bypassable**

File: `src/app/api/admin/login/route.ts:10-14`:
```typescript
// CSRF: verify Origin header matches our host
const origin = request.headers.get("origin");
const host = request.headers.get("host");
if (origin && host && !origin.endsWith(host)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Three issues:

**Issue A: `endsWith` is not a safe domain comparison.**
If `host` is `leaguelinks.com`, then `origin` values like `https://evil-leaguelinks.com` or `https://fakeleaguelinks.com` would pass the check because the string `"evil-leaguelinks.com".endsWith("leaguelinks.com")` returns `true`.

**Issue B: Check skipped if either header is missing.**
The condition `if (origin && host && ...)` means the entire check is skipped if `origin` or `host` is null/empty. While modern browsers always send `Origin` on `POST` requests, some HTTP clients, proxies, or browser extensions may strip it.

**Issue C: No CSRF protection on server actions.**
The CSRF check only exists on API route handlers. Server actions (everything in `src/lib/actions/`) have no CSRF protection. Next.js Server Actions do include some built-in CSRF protection via the `Next-Action` header check, but this relies on Next.js internals and is not explicitly enforced.

**Fix:**
```typescript
// Proper Origin validation
const origin = request.headers.get("origin");
const host = request.headers.get("host");
if (!origin || !host) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
const originUrl = new URL(origin);
if (originUrl.host !== host) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Note: `sameSite: "strict"` on cookies provides the primary CSRF defense. The Origin check is defense-in-depth. The severity is HIGH because the Origin check creates a false sense of security.

### 3.7 Authorization & IDOR

**Positive findings:**
- `requireLeagueAdmin(leagueSlug)` is called consistently across all server action modules (verified via grep -- 50+ call sites)
- The function verifies `session.leagueSlug !== leagueSlug` (auth.ts:76), preventing cross-league access
- Middleware also performs this check (middleware.ts:164)
- Super-admin routes consistently call `requireSuperAdmin()`
- Impersonation endpoint validates input with Zod schema (impersonate/route.ts:7-9)

**Remaining IDOR risk (LOW):**
- Server actions use `session.leagueId` from the JWT to scope database queries. Since the JWT is signed, the leagueId cannot be tampered with. However, if a league admin guesses a valid `matchupId` or `teamId` from another league, the actions rely on `leagueId` filtering in database queries to prevent cross-league access. This is generally correct but should be verified per-action.
- Scorecard tokens embed `scorecardId` and `teamId`. The `saveHoleScore` action (scorecards.ts:157) looks up the scorecard by ID from the token but does not re-verify that the scorecard belongs to the claimed league. Since the token is signed, this is acceptable but adds defense-in-depth risk if the signing key is compromised.

### 3.8 Input Validation in Auth Flows

**Admin login (route.ts:26-34):**
```typescript
const { password, leagueSlug } = await request.json();
if (!password || !leagueSlug) { ... }
```
- No type validation (could pass arrays or objects as password/leagueSlug)
- No length limits on input (see Finding #5)
- `leagueSlug` is used directly in a Prisma `findUnique` where clause, which is safe against SQL injection (parameterized queries)

**Super-admin login (route.ts:27-35):**
```typescript
const { username, password } = await request.json();
if (!username || !password) { ... }
```
- Same issues as admin login

**Fix:** Use Zod schemas on all login endpoints:
```typescript
const loginSchema = z.object({
  password: z.string().min(1).max(128),
  leagueSlug: z.string().min(1).max(100),
});
const parsed = loginSchema.safeParse(await request.json());
if (!parsed.success) {
  return NextResponse.json({ error: "Invalid input" }, { status: 400 });
}
```

### 3.9 Error Messages & Information Leakage

**Positive findings:**
- Login errors use generic "Invalid credentials" message (admin login:53,62; sudo login:42)
- Server errors use generic "An error occurred" message (admin login:93; sudo login:69)
- Error logging uses `error.message` only, not full stack traces sent to client
- `getLeagueBySlug()` explicitly excludes `adminUsername` and `adminPassword` from the select clause (leagues.ts:290 comment)

**Minor concern:**
- `src/app/api/sudo/impersonate/route.ts:72` logs the full error object: `console.error("Impersonate error:", error)`. This could potentially include sensitive stack traces in server logs. Not a direct security vulnerability but could aid an attacker with log access.

### 3.10 Timing Attacks

**Handled correctly:**
- Admin login (route.ts:49-51): dummy `bcrypt.compare()` when league not found
- Super-admin login (superadmin-auth.ts:138-139): dummy `bcrypt.compare()` with a valid bcrypt hash when user not found
- Both use the same dummy hash `"$2a$12$4tdsSuOvxPn843EZvlpMlO9g7WbsIphMfgilddhwRLuGiaCwcClIe"`, which is a valid bcrypt hash at cost 12, ensuring comparable timing

**Note:** The `jose` library's `jwtVerify` uses constant-time comparison for HMAC verification internally. No additional mitigation needed for token verification.

### 3.11 Secret Management

**File:** `src/lib/session-secret.ts`, `src/lib/env.ts`

**Strengths:**
- Env validation with Zod requires SESSION_SECRET to be at least 32 characters (env.ts:4-5)
- Placeholder value detection prevents deployment with default secret (session-secret.ts:17-22, middleware.ts:23-26)
- Lazy validation avoids build-time failures

**Finding #7 -- MEDIUM: Single Signing Key for All Token Types**

All three token types (admin, super-admin, scorecard) are signed with the same `SESSION_SECRET`. The audience claim differentiation (`"admin"`, `"sudo"`, `"scorecard"`) is the only barrier between token types. This is correctly enforced, but a leaked secret compromises all authentication simultaneously.

**Recommended:** Derive per-type keys from the master secret:
```typescript
import { hkdf } from "@panva/hkdf";

export async function getSigningKey(audience: string): Promise<Uint8Array> {
  const masterSecret = process.env.SESSION_SECRET!;
  return hkdf("sha256", masterSecret, "", `leaguelinks:${audience}`, 32);
}
```

---

## 4. Prioritized Remediation Plan

### Immediate (before production launch):

1. **Fix impersonation JWT issuer** (Finding #1)
   Add `.setIssuer("leaguelinks")` to `src/app/api/sudo/impersonate/route.ts:46`.
   Effort: 1 line. Risk of regression: none.

2. **Fix CSRF Origin check** (Finding #4)
   Replace `endsWith` with `new URL(origin).host !== host` comparison. Require both headers to be present.
   Effort: ~5 lines per endpoint.

3. **Add max password length** (Finding #5)
   Add `.max(72)` to Zod schemas and runtime checks. Add request body size limit.
   Effort: ~10 lines across 3 files.

4. **Fix getServerActionIp** (Finding #8)
   Add `x-vercel-forwarded-for` check to `getServerActionIp()`.
   Effort: 2 lines.

5. **Fix middleware sudo login blocking** (Section 3.5)
   Exempt `/api/sudo/login` from the sudo session requirement in middleware.
   Effort: 1 line.

### Short-term (within 2 weeks):

6. **Add session versioning** (Finding #3)
   Add `sessionVersion` to League and SuperAdmin models. Include in JWT. Verify on sensitive operations.
   Effort: ~50 lines + migration.

7. **Move rate limiting to distributed store** (Finding #6)
   Use Vercel KV or Upstash Redis.
   Effort: ~100 lines + infrastructure.

### Medium-term (within 1 month):

8. **Add `jti` claims** (Finding #10)
   Include unique token IDs for future revocation capability.

9. **Implement proper audit logging** (Finding #9)
   Use a structured logging service (Axiom, Datadog, etc.) instead of `console.warn()`.

10. **Derive per-audience signing keys** (Finding #7)
    Use HKDF to derive separate keys for each token type.

---

## 5. What's Done Well

Credit where due -- this codebase gets many security fundamentals right:

- **JWT verification is thorough**: algorithm pinning, issuer/audience validation, type checking on claims
- **bcrypt cost factor 12** is above industry minimum
- **Timing attack mitigations** are correctly implemented on both login flows
- **Cookie attributes** are all correct (httpOnly, secure in prod, sameSite strict)
- **Consistent auth checks**: `requireLeagueAdmin()` is called in all 50+ server actions
- **Input validation with Zod** on critical paths (league creation, impersonation)
- **Sensitive field exclusion** from API responses (`adminPassword`, `adminUsername`)
- **Impersonation audit logging** exists (even if implementation needs improvement)
- **Rate limiting exists** on all authentication and registration endpoints
- **Scorecard tokens use a separate audience** preventing confusion with admin sessions

The security posture is above average for a small-team project. The critical findings are fixable with minimal effort.
