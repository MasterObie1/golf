# Admin Code Review — Master Fix Plan

**Author:** Senior code review, 30 years experience, still not a fan
**Date:** 2026-02-10
**Branch:** `feature/scorecards`
**Overall Rating:** 4.5/10

---

## How This Is Organized

Five planning documents, one per domain. Each follows the format from `handicap-engine-fixes.md` because that actually worked.

| Doc | Domain | Critical | High | Medium | Scope |
|-----|--------|----------|------|--------|-------|
| [01-security-auth.md](./01-security-auth.md) | Auth, sessions, rate limiting, CSRF | 3 | 4 | 7 | `src/lib/auth.ts`, `rate-limit.ts`, `session-secret.ts`, `scorecard-auth.ts`, middleware, login/logout routes |
| [02-server-actions.md](./02-server-actions.md) | Server action bugs, validation, authorization | 2 | 11 | 15 | `src/lib/actions/*.ts` (14 files) |
| [03-sudo-subsystem.md](./03-sudo-subsystem.md) | Superadmin pages, API routes, audit | 4 | 5 | 8 | `src/app/sudo/**`, `src/app/api/sudo/**`, impersonate route |
| [04-admin-components.md](./04-admin-components.md) | Admin UI decomposition, state, types | 0 | 5 | 12 | `src/app/league/[slug]/admin/**` (10 components) |
| [05-data-integrity.md](./05-data-integrity.md) | Schema fixes, cascade, indexes, PII leaks | 1 | 3 | 5 | `prisma/schema.prisma`, various query sites |

---

## Global Execution Order

Security and data corruption bugs first. UI decomposition last.

### Phase 1: Stop the Bleeding (Critical + High security)
1. `01-security-auth.md` items 1.1–1.3 (session invalidation, rate limiter, IP spoofing)
2. `02-server-actions.md` items 1.1–1.2 (tiebreaker bug, saveHoleScore DoS)
3. `03-sudo-subsystem.md` items 1.1–1.4 (auth gap, cascade failure, audit, soft-delete)

### Phase 2: Close Authorization Gaps (High server action issues)
4. `02-server-actions.md` items 2.1–2.11 (mass assignment, missing auth, missing Zod)
5. `01-security-auth.md` items 2.1–2.4 (login enumeration, shared secret, CSRF, logout auth)

### Phase 3: Data Integrity
6. `05-data-integrity.md` all items (cascade fixes, indexes, PII select clauses)

### Phase 4: Admin UI Hardening
7. `03-sudo-subsystem.md` items 2.1–2.5 and 3.1–3.8 (type drift, confirmations, medium/low)
8. `04-admin-components.md` all items (state management, server components, type dedup)

### Phase 5: Polish
9. `01-security-auth.md` items 3.1–3.4 (low-priority auth)
10. Remaining low items from all docs

---

## What Is NOT In Scope

- Handicap engine fixes — already planned and implemented in `handicap-engine-fixes.md`
- Feature work (new scoring types, new schedule modes)
- Visual/design changes unrelated to bugs
- Performance optimization beyond the obvious N+1 queries
- Test infrastructure (separate effort)

---

## Dependencies

- Phase 1 item 1 (rate limiter replacement) requires adding `@upstash/ratelimit` or similar. This is the only new dependency.
- Phase 3 requires a Prisma migration (index additions, cascade policy changes).
- Phase 4 has no external dependencies but is the largest effort.

---

## How To Use These Files

Same as `handicap-engine-fixes.md`: work through each file's execution order. Each item has File, Problem, Fix. Write a test or verification step for each fix. Do not commit partial phases — each phase should be a single coherent commit.
