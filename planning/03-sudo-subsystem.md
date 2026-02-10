# 03 — Sudo/Superadmin Subsystem Fixes

Based on review of all superadmin pages, layouts, API routes, and the impersonate feature.

**Files in scope:**
- `src/app/sudo/page.tsx`
- `src/app/sudo/layout.tsx`
- `src/app/sudo/login/page.tsx`
- `src/app/sudo/leagues/[id]/page.tsx`
- `src/app/api/sudo/leagues/[id]/route.ts`
- `src/app/api/sudo/leagues/[id]/status/route.ts`
- `src/app/api/sudo/impersonate/route.ts`
- `src/app/api/sudo/login/route.ts`
- `src/app/api/sudo/logout/route.ts`

---

## Priority 1: Critical

### 1.1 No server-side auth in `sudo/page.tsx`
**File:** `src/app/sudo/page.tsx:6-27`
**Problem:** Server component calls `prisma.league.findMany()` directly. No `requireSuperAdmin()` call. Relies entirely on middleware. If middleware is misconfigured, disabled, or bypassed (test harness, refactor removes matcher), every league in the system is exposed.
**Fix:** Add `await requireSuperAdmin()` at the top of the component function, before the Prisma query. Import from `src/lib/superadmin-auth.ts`. If the function throws, the Next.js error boundary will catch it and show the error page — which is the correct behavior for an unauthorized access attempt.

### 1.2 Delete cascade fails on Restrict relations
**File:** `src/app/api/sudo/leagues/[id]/route.ts:69-96`
**Problem:** `prisma.league.delete()` cascades to teams, but `WeeklyScore.team` has `onDelete: Restrict` and `ScheduledMatchup.teamA/teamB` has `onDelete: Restrict`. If those records exist, the delete fails with a foreign key constraint error. Catch block returns generic "Failed to delete league" with no explanation.
**Fix:** Two options:

**Option A (recommended): Explicit cleanup before delete.**
Replace the bare `prisma.league.delete()` with an interactive transaction that:
1. Deletes `WeeklyScore` records for the league
2. Deletes `ScheduledMatchup` records for the league
3. Deletes `HoleScore` records for scorecards in the league
4. Deletes `Scorecard` records for the league
5. Deletes `Matchup` records for the league
6. Deletes `Team` records for the league
7. Deletes `Season` records for the league
8. Deletes `Course` + `Hole` records for the league
9. Deletes the `League` itself

This is verbose but explicit and predictable. No cascade surprises.

**Option B: Fix cascade policies in schema.**
Change `ScheduledMatchup.teamA/teamB` and `WeeklyScore.team` from `Restrict` to `Cascade`. This means deleting a team auto-deletes its scheduled matchups and weekly scores — which may have unintended side effects during normal team deletion (not just league deletion).

**Recommendation:** Option A for the delete route. Option B is a schema-level decision that affects the entire app and should be evaluated separately (see `05-data-integrity.md`).

### 1.3 Impersonate creates untraceable sessions
**File:** `src/app/api/sudo/impersonate/route.ts:7-56`
**Problem:** The impersonate endpoint creates a real `admin_session` JWT that is byte-for-byte identical to a normal admin login session. No `impersonatedBy` claim. No database record. No logging beyond `console.error` on failure. A superadmin can impersonate any league, make destructive changes, and there is zero forensic trail.
**Fix:**
1. Add an `impersonatedBy` claim to the JWT: `{ ...sessionPayload, impersonatedBy: superAdminUsername }`.
2. Create an `AuditLog` model in the schema:
   ```
   model AuditLog {
     id        Int      @id @default(autoincrement())
     action    String   // "impersonate", "delete_league", "change_status"
     actor     String   // superadmin username
     target    String   // league slug or ID
     details   String?  // JSON blob with additional context
     ip        String?
     createdAt DateTime @default(now())
   }
   ```
3. Log an audit entry when impersonate is called.
4. In the admin UI, if the session has `impersonatedBy`, show a banner: "Impersonating as [league] — actions are logged."
5. Reduce impersonation token expiry to 1 hour (not 1 day).
6. Validate `leagueId` in the request body as a number using Zod.

**Migration required:** Yes — add `AuditLog` model.

### 1.4 Hard delete with no recovery
**File:** `src/app/api/sudo/leagues/[id]/route.ts:69-96`
**Problem:** League deletion is permanent. No soft-delete, no recycle bin, no backup trigger. Partial cascade failure (see 1.2) leaves orphaned records.
**Fix:**
1. Add a `deletedAt DateTime?` column to the `League` model.
2. Change the "delete" operation to set `deletedAt = new Date()` and `status = "deleted"` instead of calling `prisma.league.delete()`.
3. Add a `where: { deletedAt: null }` filter to all league queries (or use Prisma middleware for this).
4. Add a `permanentlyDeleteLeague` function that only superadmins can call, which performs the actual hard delete (with the cleanup from 1.2). This should require a separate confirmation step.
5. Optionally: add a scheduled job to permanently delete leagues that have been soft-deleted for > 30 days.

**Migration required:** Yes — add `deletedAt DateTime?` to `League` model.

---

## Priority 2: High

### 2.1 Client-side `League` interface diverges from API response
**File:** `src/app/sudo/leagues/[id]/page.tsx:7-31` vs `src/app/api/sudo/leagues/[id]/route.ts:22-54`
**Problem:** The `League` interface declares `adminUsername`, `subscriptionTier`, `scheduleVisibility`, `byePointsMode` that the API's `select` clause does not return. Runtime values are `undefined`. `adminUsername` is displayed on line 221 as empty. `subscriptionTier` is displayed on line 225 as empty.
**Fix:**
1. Either add the missing fields to the API's `select` clause (if they should be visible to superadmins).
2. Or remove the fields from the client-side `League` interface.
3. **Best:** Create a shared type in `src/lib/types/sudo.ts` that is the single source of truth. Derive the API select clause from the type, and import the type in the page component.

### 2.2 Status changes have no confirmation dialog
**File:** `src/app/sudo/leagues/[id]/page.tsx:64-80, 298-325`
**Problem:** Suspend and Cancel are one-click operations. A fat-finger can shut down a league instantly. Only Delete has a confirmation.
**Fix:** Add a `ConfirmDialog` (the project already has one at `src/components/ConfirmDialog.tsx`) before Suspend and Cancel actions. The confirm message should explain the consequence: "This will suspend the league. Admins will not be able to make changes. Are you sure?"

### 2.3 No audit logging anywhere in sudo
**Problem:** Delete, status change, impersonate — all unaudited. If a disgruntled superadmin sabotages a league, there is no way to know.
**Fix:** Use the `AuditLog` model from 1.3. Add audit entries for:
- `impersonate` (already covered in 1.3)
- `delete_league` (or `soft_delete_league` after 1.4)
- `change_status` (active/suspended/cancelled)
- `permanent_delete` (if implemented from 1.4)

Add audit logging in each API route handler, after the successful operation.

### 2.4 GET error handler returns 401 for all errors
**File:** `src/app/api/sudo/leagues/[id]/route.ts:62-65`
**Problem:** Database timeouts, query failures, and connection issues all return "Unauthorized" to the client. Masks real errors.
**Fix:** Differentiate error types in the catch block:
```
if (error instanceof Error && error.message.includes("Unauthorized")) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
return NextResponse.json({ error: "Failed to fetch league" }, { status: 500 });
```

### 2.5 Layout has no client-side auth awareness
**File:** `src/app/sudo/layout.tsx:7-66`
**Problem:** Renders full admin shell without checking session validity. If middleware redirect fails (race condition, service worker cache), user sees the admin chrome.
**Fix:** Add a `useEffect` that checks session validity on mount (e.g., `fetch("/api/sudo/session")` or check for the cookie's existence). If invalid, `router.replace("/sudo/login")`. This is defense in depth — middleware is the primary gate.

---

## Priority 3: Medium

### 3.1 Error state shared across operations
**File:** `src/app/sudo/leagues/[id]/page.tsx:43, 75-76, 93, 111`
**Problem:** Single `error` state used for all operations. Stale errors persist across different actions.
**Fix:** Clear the error at the start of each operation: `setError("")` as the first line in `handleStatusChange`, `handleDelete`, `handleImpersonate`.

### 3.2 Logout has no error handling
**File:** `src/app/sudo/layout.tsx:20-24`
**Problem:** If logout API fails, user is redirected to login but cookie is NOT cleared. Silently re-authenticated on next visit.
**Fix:** Add try/catch. If the fetch fails, still redirect to login (best effort). Log the error. The cookie will eventually expire.

### 3.3 No pagination on leagues list
**File:** `src/app/sudo/page.tsx:7`
**Problem:** `prisma.league.findMany()` with no limit. Will not scale.
**Fix:** Add `take: 50, orderBy: { createdAt: "desc" }`. Add a "Load more" button or cursor-based pagination.

### 3.4 Login page passes through server error messages
**File:** `src/app/sudo/login/page.tsx:29`
**Problem:** `data.error || "Login failed"` displays whatever the server sends. If the API ever returns detailed error info, this client displays it.
**Fix:** Map server errors to fixed client messages. If `response.status === 401`, show "Invalid credentials". If `response.status === 429`, show "Too many attempts. Try again later." Otherwise show "Login failed."

### 3.5 No Zod validation in sudo subsystem
**Problem:** No endpoint in the sudo subsystem uses Zod despite CLAUDE.md mandating it.
**Fix:**
- `impersonate/route.ts`: `z.object({ leagueId: z.number().int().positive() })`
- `status/route.ts`: `z.object({ status: z.enum(["active", "suspended", "cancelled"]) })`
- `login/route.ts`: Already has manual validation, convert to Zod.

### 3.6 Status route doesn't check league existence
**File:** `src/app/api/sudo/leagues/[id]/status/route.ts:28-34`
**Problem:** `prisma.league.update` on a non-existent league throws `RecordNotFound`. Catch block returns generic error.
**Fix:** Use `findUniqueOrThrow` first, or handle the specific Prisma error in the catch block.

### 3.7 Superadmin session lifetime is 7 days
**File:** `src/app/api/sudo/login/route.ts:51-57`
**Problem:** Far too long for a privileged account. Industry standard: 1-8 hours.
**Fix:** Change expiry from `"7d"` to `"4h"`. Add sliding window refresh in middleware (see `01-security-auth.md` item 3.3).

### 3.8 `use(params)` in client component with no error boundary
**File:** `src/app/sudo/leagues/[id]/page.tsx:38`
**Problem:** React 19 `use()` unwraps the params Promise. If it rejects, throws with no local error boundary.
**Fix:** Wrap the league detail content in an error boundary, or convert the params handling to `useParams()` from `next/navigation` which does not throw on resolution.

---

## Priority 4: Low

### 4.1 Duplicate status badge rendering
**Files:** `src/app/sudo/page.tsx:104-127`, `src/app/sudo/leagues/[id]/page.tsx`
**Fix:** Extract a `StatusBadge` component to `src/components/StatusBadge.tsx`.

### 4.2 Single-link navigation bar
**File:** `src/app/sudo/layout.tsx:39-49`
**Fix:** Either add more navigation items (Audit Log, Settings) or remove the nav bar.

### 4.3 No "logged in as" indicator
**File:** `src/app/sudo/layout.tsx`
**Fix:** Fetch the superadmin username from the session and display in the header.

### 4.4 Duplicate imports in layout
**File:** `src/app/sudo/layout.tsx:3, 5`
**Fix:** Combine `useRouter` and `usePathname` into a single import from `"next/navigation"`.

### 4.5 No "back to site" link on login page
**File:** `src/app/sudo/login/page.tsx`
**Fix:** Add a "Back to main site" link below the form.

### 4.6 Password not cleared on failed login
**File:** `src/app/sudo/login/page.tsx:10, 34-38`
**Fix:** Add `setPassword("")` in the `catch` or `finally` block.

### 4.7 No skeleton loading state
**File:** `src/app/sudo/leagues/[id]/page.tsx:116-122`
**Fix:** Replace "Loading..." text with a skeleton component matching the page layout.

### 4.8 `autoComplete` inconsistency on login form
**File:** `src/app/sudo/login/page.tsx:67`
**Fix:** See `01-security-auth.md` item 3.7.

---

## Execution Order

1. **1.1** (server-side auth in page.tsx — one-line fix, highest impact)
2. **1.3** (impersonate audit trail — requires migration, do with 1.4)
3. **1.4** (soft-delete — requires migration, do with 1.3)
4. **1.2** (delete cascade cleanup — implement explicit delete transaction)
5. **2.1** (fix type divergence — prevents runtime undefined bugs)
6. **2.2 + 2.3** together (confirmation dialogs + audit logging)
7. **2.4 + 2.5** together (error handling improvements)
8. **3.1 → 3.8** (medium items, batch together)
9. **4.1 → 4.8** (low items, batch together)

**Migration batch:** Items 1.3 and 1.4 both require schema changes. Bundle into a single migration:
- Add `AuditLog` model
- Add `deletedAt DateTime?` to `League`
- Add `passwordVersion Int @default(0)` to `League` and `SuperAdmin` (from `01-security-auth.md` item 1.1)
