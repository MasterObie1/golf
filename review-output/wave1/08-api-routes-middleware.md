# Code Review: API Routes, Middleware, and Super-Admin System

**Reviewer:** Senior Staff Engineer
**Date:** 2026-02-11
**Scope:** All API route handlers, middleware, super-admin pages, and league-settings server action
**Risk Assessment:** MEDIUM-HIGH -- several security-sensitive issues in the impersonation and middleware layers

---

## 1. Executive Summary

The API layer demonstrates good security fundamentals: signed JWTs with audience separation, bcrypt password hashing with timing-attack mitigation, rate limiting on login endpoints, CSRF origin checks, and solid security headers in `next.config.ts`. The super-admin system has appropriate audit logging and a transactional league-deletion flow.

However, the review uncovered **3 critical issues**, **5 high-severity issues**, and several medium/low items. The most dangerous finding is that the impersonation endpoint creates JWT tokens without the `issuer` claim, meaning those tokens fail silent validation in `getAdminSession()` which verifies `issuer: "leaguelinks"`. Additionally, the CSRF check has a bypass via substring matching, the middleware has a login-route exclusion gap for `/api/sudo/login`, and there is no rate limiting on any super-admin API endpoints after authentication.

---

## 2. Findings Table

| # | Severity | File | Line(s) | Finding |
|---|----------|------|---------|---------|
| 1 | CRITICAL | `api/sudo/impersonate/route.ts` | 39-49 | Impersonation JWT missing `issuer` claim -- token may fail verification in `getAdminSession()` |
| 2 | CRITICAL | `api/admin/login/route.ts` | 12 | CSRF origin check uses `endsWith` -- bypassed by attacker domains like `evil-example.com` |
| 3 | CRITICAL | `middleware.ts` | 108-118 | `/api/sudo/login` is matched by middleware config but the `startsWith("/api/sudo/")` check blocks unauthenticated login requests |
| 4 | HIGH | `api/sudo/impersonate/route.ts` | 38 | `process.env.SESSION_SECRET!` non-null assertion bypasses all secret validation in `session-secret.ts` |
| 5 | HIGH | `api/health/route.ts` | 15-18 | Health endpoint exposes database record count and environment variable presence -- information leakage |
| 6 | HIGH | `api/sudo/leagues/[id]/route.ts` | 62-68 | Generic error handling in GET catches all errors including auth failures, may mask issues |
| 7 | HIGH | `middleware.ts` | 110-116 | Double auth check on sudo API routes -- middleware verifies JWT, then route handlers call `requireSuperAdmin()` again |
| 8 | HIGH | `api/golf-news/route.ts` | 5 | `force-dynamic` on a public endpoint with its own 15-min cache -- should use ISR instead |
| 9 | MEDIUM | `api/sudo/leagues/[id]/status/route.ts` | 20-24 | Status value validated against hardcoded array instead of Zod enum; no Zod schema for request body |
| 10 | MEDIUM | `api/admin/login/route.ts` | 26 | `request.json()` can throw on malformed JSON -- caught by outer try/catch but returns generic 500 instead of 400 |
| 11 | MEDIUM | `api/sudo/impersonate/route.ts` | 71-74 | All errors (including DB failures, JSON parse errors) return 401 Unauthorized |
| 12 | MEDIUM | `sudo/layout.tsx` | 1, 16 | Client-side layout hides chrome on login page via pathname check -- but server-side auth in `page.tsx` is the real guard (defense in depth gap) |
| 13 | MEDIUM | `sudo/page.tsx` | 26 | `take: 50` hardcoded limit on leagues query with no pagination |
| 14 | MEDIUM | `sudo/leagues/[id]/page.tsx` | 7-31 | Interface `League` includes fields (`adminUsername`, `subscriptionTier`, `byePointsMode`, `scheduleVisibility`) not returned by the API's `select` clause |
| 15 | MEDIUM | `lib/actions/league-settings.ts` | 237 | `recalculateLeagueStats` is exported and callable as a server action but has no auth check (see TODO comment) |
| 16 | LOW | `api/admin/logout/route.ts` | 3-16 | Logout does not verify session before clearing -- not a security issue but allows unauthenticated logout calls |
| 17 | LOW | `middleware.ts` | 184-192 | Matcher patterns don't include `/api/health` or `/api/golf-news` -- intentional but worth documenting |
| 18 | LOW | `api/sudo/leagues/[id]/route.ts` | 100-125 | DELETE transaction manually cascades in 10 steps -- fragile if schema adds new relations |
| 19 | LOW | All API routes | N/A | No request ID propagation for distributed tracing |
| 20 | LOW | All sudo API routes | N/A | No rate limiting on authenticated super-admin operations (delete, status change, impersonate) |

---

## 3. Route-by-Route Analysis

### 3.1 `POST /api/admin/login` (`src/app/api/admin/login/route.ts`)

**Purpose:** Authenticate league admins, set `admin_session` JWT cookie.

**Strengths:**
- Rate limiting applied (`5 per 15 min`)
- Timing-attack mitigation with dummy bcrypt on unknown leagues
- Cookie set with `httpOnly`, `secure` (prod), `sameSite: strict`
- Password hash never returned to client
- Selective Prisma `select` clause

**Issues:**

**CRITICAL -- CSRF origin check bypass (line 12)**
```typescript
if (origin && host && !origin.endsWith(host)) {
```
The `endsWith` check is vulnerable. If the legitimate host is `example.com`, an attacker at `evil-example.com` passes this check because `"https://evil-example.com".endsWith("example.com")` is `true`.

Fix: Parse the origin URL and compare hostnames exactly:
```typescript
const originUrl = new URL(origin);
if (originUrl.host !== host) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

**MEDIUM -- Malformed JSON returns 500 (line 26)**
```typescript
const { password, leagueSlug } = await request.json();
```
If the request body is not valid JSON, `request.json()` throws, and the outer catch returns `{ error: "An error occurred" }` with status 500. This should be caught explicitly and return 400.

**Recommendation:** Wrap `request.json()` in its own try/catch:
```typescript
let body;
try {
  body = await request.json();
} catch {
  return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
}
```

---

### 3.2 `POST /api/admin/logout` (`src/app/api/admin/logout/route.ts`)

**Purpose:** Clear the admin session cookie.

**Strengths:**
- Simple and correct
- Matching cookie attributes for reliable clearing

**Issues:**

**LOW -- No session verification**
The endpoint does not verify the caller has a valid session before clearing. Not a security risk (clearing a non-existent cookie is harmless) but prevents audit logging of logouts.

---

### 3.3 `POST /api/sudo/login` (`src/app/api/sudo/login/route.ts`)

**Purpose:** Authenticate super-admins, set `sudo_session` JWT cookie.

**Strengths:**
- Stricter rate limit (`3 per 15 min`)
- Same timing-attack mitigation pattern as admin login
- Shorter session duration (4 hours vs 24 hours)
- Same CSRF check pattern (inherits the same bypass vulnerability)

**Issues:**

**CRITICAL -- Same CSRF `endsWith` bypass as admin login (line 12)**
Identical vulnerability as finding #2.

**CRITICAL -- Middleware blocks unauthenticated access to this endpoint (middleware.ts line 110-116)**
The middleware matcher includes `/api/sudo/:path*`, and the middleware code at line 110 checks `pathname.startsWith("/api/sudo/")` and requires a valid `sudo_session` cookie. This means `/api/sudo/login` requires you to already be authenticated to log in -- a Catch-22.

However, examining this more carefully: the middleware matcher pattern `/api/sudo/:path*` in Next.js matches `/api/sudo/login`, `/api/sudo/logout`, etc. The middleware function at line 110 runs the sudo auth check for ALL `/api/sudo/*` paths with no exception for `/api/sudo/login`. This would make the login endpoint unreachable for unauthenticated users.

Wait -- let me re-examine. The login page at `/sudo/login` is a client component that calls `POST /api/sudo/login`. The middleware would intercept this API call and return 401 before the route handler executes.

**This is a critical functional bug if `/api/sudo/login` is meant to be accessible without authentication.** Either:
1. The middleware must exclude `/api/sudo/login` from the auth check, OR
2. The login is somehow working because the middleware's `parseSuperAdminSession` returns null gracefully

Let me trace through: middleware line 110-116:
```typescript
if (pathname.startsWith("/api/sudo/")) {
  const sudoSessionCookie = request.cookies.get("sudo_session")?.value;
  const sudoSession = await parseSuperAdminSession(sudoSessionCookie);
  if (!sudoSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

This **will** return 401 for `/api/sudo/login` when there is no valid session. **The super-admin login API is unreachable.** This is a critical bug that would make the entire sudo system non-functional.

**UPDATE:** Unless this was tested and works in practice, in which case there may be a Next.js routing subtlety I'm missing. The matcher pattern `/api/sudo/:path*` uses the Next.js path pattern syntax. The `:path*` segment matches one or more path segments. Let me check: does `/api/sudo/login` match `/api/sudo/:path*`? Yes, it does -- `:path*` matches `login`.

The `/api/sudo/logout` endpoint has the same issue -- you need to be authenticated to log out, which is actually correct behavior for logout. But for login, this is a blocker.

**Fix:** Add an exception in the middleware:
```typescript
if (pathname.startsWith("/api/sudo/") && pathname !== "/api/sudo/login") {
```

---

### 3.4 `POST /api/sudo/logout` (`src/app/api/sudo/logout/route.ts`)

**Purpose:** Clear the super-admin session cookie.

**Strengths:**
- Simple, correct
- Protected by middleware (requires auth to logout -- appropriate)

**Issues:**

**LOW -- Same no-audit-logging issue as admin logout**

---

### 3.5 `POST /api/sudo/impersonate` (`src/app/api/sudo/impersonate/route.ts`)

**Purpose:** Allow super-admins to log in as league admins.

**Strengths:**
- Zod schema validation for input
- `requireSuperAdmin()` auth check
- Shorter JWT expiry (1 hour) for impersonation sessions
- Audit logging with super-admin identity and target league
- `impersonatedBy` marker in JWT payload (for future audit trail)
- Selective `select` clause on league query

**Issues:**

**CRITICAL -- JWT missing `issuer` claim (line 39-49)**
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

The token sets `audience: "admin"` but **does not call `.setIssuer("leaguelinks")`**. However, `getAdminSession()` in `auth.ts` verifies with `{ issuer: "leaguelinks" }`:
```typescript
const { payload } = await jwtVerify(sessionCookie, secret, {
  algorithms: ["HS256"],
  issuer: "leaguelinks",
  audience: "admin",
});
```

The `jwtVerify` call with `issuer: "leaguelinks"` will **reject** tokens that don't have a matching `iss` claim. This means impersonation tokens are created successfully but will fail verification when the impersonating admin tries to use the session. The impersonation feature is broken.

Fix: Add `.setIssuer("leaguelinks")` to the SignJWT chain.

**HIGH -- Direct `process.env.SESSION_SECRET!` access (line 38)**
```typescript
const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);
```

This bypasses the `getSessionSecret()` utility from `session-secret.ts` which validates the secret is not empty, not the placeholder value, and runs full env validation. If `SESSION_SECRET` is unset, the non-null assertion makes this encode `undefined` as a string, producing a valid but insecure key.

Fix: Import and use `getSessionSecret()`:
```typescript
import { getSessionSecret } from "@/lib/session-secret";
// ...
const secret = getSessionSecret();
```

---

### 3.6 `GET /api/sudo/leagues/[id]` (`src/app/api/sudo/leagues/[id]/route.ts`)

**Purpose:** Fetch league details for super-admin management.

**Strengths:**
- `requireSuperAdmin()` auth check
- Input validation for league ID (`parseInt` + `isNaN` check)
- Selective `select` clause (no password fields)
- `_count` aggregation avoids fetching full related records

**Issues:**

**HIGH -- Inconsistent error handling (lines 62-68)**
```typescript
} catch (error) {
  console.error("Get league error:", error);
  if (error instanceof Error && error.message.includes("Unauthorized")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ error: "Failed to fetch league" }, { status: 500 });
}
```
String matching on error messages is fragile. If `requireSuperAdmin()` changes its error message, the 401 response breaks and auth failures return 500. Use a custom error class instead:
```typescript
class UnauthorizedError extends Error { ... }
// Then:
if (error instanceof UnauthorizedError) { ... }
```

**MEDIUM -- Interface mismatch with client**
The client page at `sudo/leagues/[id]/page.tsx` defines a `League` interface with fields like `adminUsername`, `subscriptionTier`, `byePointsMode`, and `scheduleVisibility` that are **not** included in the API's `select` clause. These fields will be `undefined` at runtime but TypeScript won't catch this because the data comes from `fetch()` (typed as `any`).

---

### 3.7 `DELETE /api/sudo/leagues/[id]` (`src/app/api/sudo/leagues/[id]/route.ts`)

**Purpose:** Permanently delete a league and all associated data.

**Strengths:**
- `requireSuperAdmin()` auth check
- Existence check before deletion
- Full transactional cleanup respecting FK constraints
- Detailed audit logging
- Correct cascade order

**Issues:**

**LOW -- Fragile manual cascade (lines 100-125)**
The 10-step manual deletion is correct today but will silently miss data if new models with `leagueId` foreign keys are added. Consider:
1. Adding a comment listing all models that must be updated when schema changes
2. Or refactoring to use `onDelete: Cascade` where possible to let the database handle it

**LOW -- No rate limiting on destructive operation**
While protected by auth, there is no rate limiting on the DELETE endpoint. A compromised super-admin session could delete all leagues in rapid succession.

---

### 3.8 `PATCH /api/sudo/leagues/[id]/status` (`src/app/api/sudo/leagues/[id]/status/route.ts`)

**Purpose:** Change league status (active/suspended/cancelled).

**Strengths:**
- `requireSuperAdmin()` auth check
- Status validation against allowed values
- Existence check before update
- Audit logging with before/after state

**Issues:**

**MEDIUM -- No Zod schema (line 20-24)**
```typescript
const { status } = await request.json();
const validStatuses = ["active", "suspended", "cancelled"];
if (!validStatuses.includes(status)) {
```
This is manual validation instead of using Zod, which is the project's stated pattern. Also, `request.json()` can throw on malformed input.

Fix:
```typescript
const statusSchema = z.object({
  status: z.enum(["active", "suspended", "cancelled"]),
});
const parsed = statusSchema.safeParse(await request.json().catch(() => null));
```

---

### 3.9 `GET /api/health` (`src/app/api/health/route.ts`)

**Purpose:** Health check endpoint.

**Strengths:**
- Returns 500 when database is unhealthy
- Catches database errors gracefully

**Issues:**

**HIGH -- Information leakage (lines 5-19)**
```typescript
const checks = {
  timestamp: new Date().toISOString(),
  env: {
    hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
    hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
  },
};
// ...
checks.database = {
  status: "connected",
  leagueCount,
};
```

This endpoint is unauthenticated (not in middleware matcher) and publicly accessible. It reveals:
1. Whether Turso is configured (infrastructure information)
2. Exact league count (business intelligence)
3. Database error messages when unhealthy
4. Server timestamp (clock skew information)

Fix: Return only status for public consumption. Move detailed diagnostics behind super-admin auth or remove them:
```typescript
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
```

---

### 3.10 `GET /api/golf-news` (`src/app/api/golf-news/route.ts`)

**Purpose:** Proxy ESPN golf RSS feed.

**Strengths:**
- Graceful error handling
- In-memory cache in `rss.ts` with 15-min TTL
- Stale-while-error pattern (returns stale cache on failure)

**Issues:**

**HIGH -- `force-dynamic` is wasteful (line 5)**
```typescript
export const dynamic = "force-dynamic";
```
The route disables Next.js caching, but the underlying `getGolfNews()` function has its own 15-minute in-memory cache. In a serverless environment (Vercel), in-memory cache is per-instance and unreliable. This should use Next.js ISR instead:
```typescript
export const revalidate = 900; // 15 minutes
```
This gives you edge caching across all instances rather than per-instance memory caching.

**LOW -- No error type differentiation**
All errors return the same 500 response. If ESPN is down, it could be useful to return 503 (Service Unavailable) with a Retry-After header.

---

### 3.11 `src/lib/actions/league-settings.ts` (Server Actions)

**Purpose:** League settings management (general, scorecard, handicap).

**Strengths:**
- Full Zod validation on all inputs with `.refine()` for cross-field rules
- `requireLeagueAdmin()` auth on all exported actions
- `requireActiveLeague()` prevents modifications to suspended/cancelled leagues
- Transactional `recalculateLeagueStats` with comprehensive in-memory processing
- Excellent `isFinite` safety checks on all calculated values
- `leagueToHandicapSettings` read inside transaction for consistency
- Structured logging via `logger`

**Issues:**

**MEDIUM -- `recalculateLeagueStats` exported without auth (line 237)**
```typescript
// TODO: Add auth check if exposed as a server action
export async function recalculateLeagueStats(leagueId: number) {
```
This function is exported from a `"use server"` module, making it callable as a server action from the client. It takes a raw `leagueId` with no authorization check. An attacker could call `recalculateLeagueStats(anyLeagueId)` to trigger expensive recomputation on any league, or use it as a DoS vector.

Fix: Either make it non-exported (private to the module) or add an auth check:
```typescript
// Option A: Don't export it; call it only from other server actions
async function recalculateLeagueStats(leagueId: number) { ... }

// Option B: Add auth
export async function recalculateLeagueStats(leagueSlug: string) {
  const session = await requireLeagueAdmin(leagueSlug);
  // ... use session.leagueId
}
```

---

### 3.12 Super-Admin Pages

#### `/sudo/page.tsx` (Dashboard)

**Strengths:**
- Server component with `requireSuperAdmin()` at the top
- Selective `select` clause
- `force-dynamic` appropriate for admin dashboard

**Issues:**

**MEDIUM -- Hardcoded `take: 50` with no pagination (line 26)**
If the platform grows beyond 50 leagues, the dashboard silently drops leagues from view with no indication. Add pagination or at minimum display the total count vs. displayed count.

#### `/sudo/login/page.tsx`

**Strengths:**
- Clean client component
- Handles 429 rate limit errors gracefully
- Uses `autoComplete` attributes for accessibility

No significant issues.

#### `/sudo/layout.tsx`

**Strengths:**
- Clean navigation structure
- Logout handler with proper error handling

**MEDIUM -- Client-side layout bypass (line 16)**
```typescript
if (pathname === "/sudo/login") {
  return <>{children}</>;
}
```
The login page check is purely cosmetic (hides the nav bar). The real auth guard is `requireSuperAdmin()` in the server component. However, this means the layout is `"use client"`, preventing it from doing server-side auth. If someone navigates to `/sudo` with an expired token, they'll briefly see the nav bar before the server component redirects. This is a minor UX issue, not a security issue, since middleware handles the redirect.

#### `/sudo/leagues/[id]/page.tsx`

**Strengths:**
- Delete confirmation requires typing league name
- Impersonation clearly separated as an action
- Status management with appropriate button states

**Issues:**

**MEDIUM -- Interface/API mismatch (lines 7-31)**
As noted in finding #14, the `League` interface expects fields not returned by the API. Fields like `adminUsername`, `subscriptionTier`, `byePointsMode`, and `scheduleVisibility` will be `undefined`, which could cause rendering issues or missing data in the UI.

---

## 4. Middleware Flow Diagram

```
                    Incoming Request
                          |
                          v
              +------------------------+
              | Next.js Matcher Check  |
              | Patterns:              |
              |  /admin/:path*         |
              |  /league/:path*/admin/ |
              |  /api/admin/:path*     |
              |  /api/sudo/:path*      |
              |  /sudo/:path*          |
              +------------------------+
                     |          |
                  Matches    No Match
                     |          |
                     v          v
              middleware()    PASS THROUGH
                     |        (health, golf-news,
                     |         public pages)
                     v
           +------------------+
           | pathname check   |
           +------------------+
                     |
        +--------+---+---+--------+
        |        |       |        |
        v        v       v        v
   /api/sudo/* /api/*  /sudo/*  /league/*/admin/*
        |        |       |        |
        v        |       v        v
  Parse sudo     |   Is /sudo   Parse admin
  session JWT    |   /login?    session JWT
        |        |    |    |        |
    Valid? No    |  Yes   No     Valid? No
     -> 401      |   |    |      -> Redirect
        |        |   v    v      to login
    Valid? Yes   | PASS  Parse        |
     -> NEXT     | THRU  sudo     Valid? Yes
                 |       JWT      -> slug match?
                 v       |           |     |
              NEXT    Valid? No     Yes    No
             (admin   -> Redirect   |      |
              routes   to login     v      v
              handle              NEXT  Redirect
              own auth)                 to login

  [BUG] /api/sudo/login hits the /api/sudo/* branch
        and is blocked by the sudo session check.
        Unauthenticated users cannot reach the
        login endpoint.
```

### Middleware Coverage Matrix

| Route | In Matcher? | Auth Method | Rate Limited? |
|-------|------------|-------------|--------------|
| `GET /api/health` | No | None (public) | No |
| `GET /api/golf-news` | No | None (public) | No |
| `POST /api/admin/login` | Yes | Self (bcrypt) | Yes (5/15min) |
| `POST /api/admin/logout` | Yes | None enforced | No |
| `POST /api/sudo/login` | Yes | **BLOCKED by middleware** | Yes (3/15min) |
| `POST /api/sudo/logout` | Yes | Middleware JWT | No |
| `POST /api/sudo/impersonate` | Yes | Middleware JWT + `requireSuperAdmin()` | No |
| `GET /api/sudo/leagues/[id]` | Yes | Middleware JWT + `requireSuperAdmin()` | No |
| `DELETE /api/sudo/leagues/[id]` | Yes | Middleware JWT + `requireSuperAdmin()` | No |
| `PATCH /api/sudo/leagues/[id]/status` | Yes | Middleware JWT + `requireSuperAdmin()` | No |

---

## 5. Security Recommendations

### Immediate Fixes (Before Next Deploy)

1. **Fix the `/api/sudo/login` middleware block** -- Either exclude it from the middleware sudo check or remove it from the matcher:
   ```typescript
   // In middleware.ts, line 110:
   if (pathname.startsWith("/api/sudo/") && pathname !== "/api/sudo/login") {
   ```

2. **Fix the CSRF origin check** -- Replace `endsWith` with exact hostname comparison in both login routes:
   ```typescript
   if (origin && host) {
     try {
       const originHost = new URL(origin).host;
       if (originHost !== host) {
         return NextResponse.json({ error: "Forbidden" }, { status: 403 });
       }
     } catch {
       return NextResponse.json({ error: "Forbidden" }, { status: 403 });
     }
   }
   ```

3. **Fix the impersonation JWT** -- Add the missing issuer claim and use `getSessionSecret()`:
   ```typescript
   import { getSessionSecret } from "@/lib/session-secret";
   // ...
   const secret = getSessionSecret();
   const sessionToken = await new SignJWT({ ... })
     .setProtectedHeader({ alg: "HS256" })
     .setIssuedAt()
     .setExpirationTime("1h")
     .setIssuer("leaguelinks")  // <-- ADD THIS
     .setAudience("admin")
     .sign(secret);
   ```

4. **Remove auth from `recalculateLeagueStats` export** -- Either make it private or add auth:
   ```typescript
   // Remove 'export' to make it module-private
   async function recalculateLeagueStats(leagueId: number) {
   ```

### Short-Term Improvements

5. **Reduce health endpoint exposure** -- Strip environment info and league count from the public health check response. If detailed diagnostics are needed, gate them behind super-admin auth.

6. **Add JSON parse error handling** -- Wrap `request.json()` calls in try/catch with 400 responses:
   ```typescript
   let body;
   try { body = await request.json(); } catch {
     return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
   }
   ```

7. **Standardize error handling** -- Create a custom `AppError` class hierarchy instead of string-matching error messages:
   ```typescript
   export class UnauthorizedError extends Error { status = 401; }
   export class NotFoundError extends Error { status = 404; }
   export class ValidationError extends Error { status = 400; }
   ```

8. **Fix the client/API interface mismatch** -- Update either the API `select` clause or the client `League` interface in `sudo/leagues/[id]/page.tsx` so they agree on the shape.

### Medium-Term Improvements

9. **Add rate limiting to super-admin operations** -- Impersonate, delete, and status-change should have rate limits to mitigate compromised session abuse.

10. **Add request ID propagation** -- Generate a unique ID per request in middleware and thread it through all log calls for tracing:
    ```typescript
    const requestId = crypto.randomUUID();
    const headers = new Headers(response.headers);
    headers.set("x-request-id", requestId);
    ```

11. **Replace `force-dynamic` on golf-news route** -- Use `export const revalidate = 900` for ISR, which works across serverless instances instead of per-instance in-memory caching.

12. **Add pagination to the super-admin dashboard** -- The hardcoded `take: 50` will become a problem at scale.

13. **Eliminate double auth on sudo API routes** -- The middleware verifies the JWT and then each route handler calls `requireSuperAdmin()` which re-verifies the same JWT. This is wasteful. Either:
    - Trust the middleware and pass the session via request headers, or
    - Remove middleware auth for API routes and rely solely on route-handler auth

14. **Consider adding an impersonation audit table** -- `console.warn` audit logs are lost when log retention expires. Store impersonation events in a database table for permanent audit trail.

### Architectural Notes

15. **CORS is not explicitly configured** -- The app relies on `SameSite: strict` cookies and origin header checks for CSRF protection. This is sufficient for a same-origin app but breaks if you ever need to support mobile apps or external API consumers. No immediate action needed, but document this constraint.

16. **The super-admin system has no session revocation mechanism** -- JWTs are valid until they expire (4 hours). If a super-admin account is compromised, there is no way to invalidate existing sessions short of rotating `SESSION_SECRET` (which invalidates ALL sessions). Consider adding a `jti` (JWT ID) claim and a revocation list for high-privilege sessions.

---

## 6. Positive Observations

These patterns are well-implemented and should be maintained:

- **JWT audience separation** (`admin` vs `sudo`) prevents cross-session attacks
- **Timing-attack mitigation** on both login endpoints with dummy bcrypt
- **Security headers** in `next.config.ts` are comprehensive (HSTS, CSP, X-Frame-Options, etc.)
- **`poweredByHeader: false`** hides the Next.js fingerprint
- **Transactional league deletion** with correct FK ordering
- **Audit logging** on all destructive super-admin operations
- **Impersonation tokens** have shorter expiry (1 hour vs 24 hours)
- **`select` clauses** on Prisma queries prevent over-fetching sensitive fields
- **Zod validation** used consistently in server actions with cross-field `.refine()` rules
- **`isFinite` guards** on all handicap calculations prevent NaN/Infinity corruption

---

*Review completed 2026-02-11. 20 findings: 3 critical, 5 high, 7 medium, 5 low.*
