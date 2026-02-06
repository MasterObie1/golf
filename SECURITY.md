# SECURITY.md — Security Audit Findings

**Application:** LeagueLinks Golf League Management
**Audit Date:** 2026-02-05
**Overall Risk Rating:** CRITICAL

---

## Summary

The application has **3 critical vulnerabilities** that, when combined, allow any anonymous user to gain full administrative control over any league and the entire platform. These must be fixed before the application is used with real data.

---

## Critical Vulnerabilities

### CVE-Equivalent 1: Authentication Bypass via Unsigned Session Tokens

**Severity:** CRITICAL
**CVSS Score:** 9.8 (Network / Low complexity / No privileges required)
**Files:** `src/lib/auth.ts:88-90`, `src/lib/superadmin-auth.ts:67-69`

**Description:**
Session tokens are base64-encoded JSON with no cryptographic signature. The token for a league admin is:
```
base64({"leagueId":1,"leagueSlug":"some-league","adminUsername":"admin@SomeLeague"})
```

An attacker can construct a valid session for any league by:
1. Guessing or discovering a league slug (they're public in URLs)
2. Encoding `{"leagueId":N,"leagueSlug":"known-slug","adminUsername":"anything"}`
3. Setting the `admin_session` cookie

The super-admin token is equally forgeable:
```
base64({"superAdminId":1,"username":"anything"})
```

**Proof of Concept:**
```javascript
// In browser console on any page:
document.cookie = `admin_session=${btoa(JSON.stringify({
  leagueId: 1,
  leagueSlug: "target-league",
  adminUsername: "attacker"
}))}; path=/`;
// Navigate to /league/target-league/admin — full admin access
```

**Remediation:**
- Replace with JWTs signed using HS256 with a server-side secret
- Or implement server-side sessions with opaque tokens stored in a database table
- Recommended library: `jose` (already widely used in Next.js ecosystem)

---

### CVE-Equivalent 2: Hardcoded Platform Admin Credentials

**Severity:** CRITICAL
**Files:** `src/lib/superadmin-auth.ts:9-10`

**Description:**
```typescript
const SUPER_ADMIN_USERNAME = "alex";
const SUPER_ADMIN_PASSWORD = "sudo123!";
```

The super-admin credentials are hardcoded in plaintext source code. These are committed to git and permanently in repository history. The password is weak (8 characters, common pattern).

**Remediation:**
- Delete hardcoded credentials
- Use the existing `SuperAdmin` Prisma model with bcrypt-hashed passwords
- Create a seed script for initial admin setup
- Use BFG Repo-Cleaner to remove credentials from git history

---

### CVE-Equivalent 3: Password Hash Exposure via API Response

**Severity:** HIGH
**File:** `src/lib/actions.ts:132-136`

**Description:**
The `getLeagueBySlug()` server action returns the complete League database record including `adminPassword` (bcrypt hash) and `adminUsername`. This function is called from public-facing server components (leaderboard, history, team pages). The bcrypt hash is included in the serialized RSC payload sent to every visitor's browser.

**Impact:**
- Offline brute-force attacks against admin passwords
- With default password `pass@word1` (bcrypt cost 10), cracking takes seconds on modern GPUs

**Remediation:**
- Add `select` clause to exclude `adminPassword` and `adminUsername`
- Create separate functions for public data vs. admin authentication

---

## High Severity Findings

### No Rate Limiting on Authentication Endpoints

**Files:** `src/app/api/admin/login/route.ts`, `src/app/api/sudo/login/route.ts`

Both login endpoints accept unlimited requests with no throttling, lockout, or CAPTCHA. Combined with the weak default password, brute-force is trivial.

**Remediation:** Add rate limiting (5 attempts per 15 minutes per IP for admin, 3 for super-admin).

---

### No Password Change Mechanism

**Entire codebase**

No `changePassword` action exists. League admins cannot change the password set at creation time. The default password `pass@word1` is permanent.

**Remediation:** Add password change functionality to the admin panel.

---

### Unauthenticated League and Team Creation

**Files:** `src/lib/actions.ts:34`, `src/lib/actions.ts:1333`

Anyone can call `createLeague` and `registerTeam` server actions with no authentication and no rate limiting. This enables database flooding.

**Remediation:** Add CAPTCHA or rate limiting to public creation endpoints.

---

## Medium Severity Findings

| Finding | File |
|---------|------|
| Sudo dashboard has no server-side auth (relies only on middleware) | `src/app/sudo/page.tsx` |
| 7-day session cookies with no server-side invalidation | `api/admin/login/route.ts:65` |
| String-typed enums allow arbitrary values in database | `schema.prisma` |
| Input validation missing on most server actions | `actions.ts` |
| Health endpoint reveals environment variable configuration | `api/health/route.ts` |

---

## Low Severity / Informational

| Finding | Status |
|---------|--------|
| No XSS vulnerabilities (React auto-escaping) | PASS |
| No SQL injection (Prisma parameterized queries) | PASS |
| CSRF protection via Next.js server actions + SameSite cookies | PASS |
| Bcrypt cost factor 10 (minimum recommended, consider 12) | ADVISORY |
| `.env.production.local` on disk with production tokens | ADVISORY |

---

## Remediation Priority

| Priority | Action | Effort |
|----------|--------|--------|
| **P0 (Immediate)** | Sign session tokens with JWT | 2-4 hours |
| **P0 (Immediate)** | Remove hardcoded super-admin credentials | 1-2 hours |
| **P0 (Immediate)** | Add `select` to `getLeagueBySlug` | 30 minutes |
| **P1 (This week)** | Add password change mechanism | 2-4 hours |
| **P1 (This week)** | Require password on league creation | 1-2 hours |
| **P1 (This week)** | Add rate limiting to login endpoints | 2-4 hours |
| **P2 (This sprint)** | Add Zod validation to all server actions | 1-2 days |
| **P2 (This sprint)** | Add rate limiting to creation endpoints | 2-4 hours |
| **P3 (This quarter)** | Convert string enums to Prisma enums | 1 day |
| **P3 (This quarter)** | Add server-side auth check to sudo page | 1 hour |
