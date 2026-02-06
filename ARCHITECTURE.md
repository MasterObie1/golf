# ARCHITECTURE.md — Current Architecture & Recommended Changes

## Current Architecture

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (3 fonts, NavigationWrapper)
│   ├── page.tsx                  # Homepage (force-dynamic)
│   ├── globals.css               # Tailwind + CSS custom properties
│   ├── api/
│   │   ├── admin/login/route.ts  # League admin login API
│   │   ├── sudo/login/route.ts   # Super-admin login API
│   │   ├── golf-news/route.ts    # RSS proxy for ESPN golf news
│   │   └── health/route.ts       # Health check endpoint
│   ├── league/[slug]/
│   │   ├── page.tsx              # League home (server component)
│   │   ├── leaderboard/page.tsx  # Leaderboard (server component)
│   │   ├── history/page.tsx      # Match history (server component)
│   │   ├── handicap-history/     # Handicap trends (server component)
│   │   ├── signup/page.tsx       # Registration (client component — should be server)
│   │   ├── team/[teamId]/        # Team detail (server component)
│   │   └── admin/
│   │       ├── page.tsx          # 2068-line admin panel (client component)
│   │       └── login/page.tsx    # Admin login form (client component)
│   ├── leagues/
│   │   ├── page.tsx              # Browse leagues (client component — should be server)
│   │   └── new/page.tsx          # Create league form (client component)
│   └── sudo/
│       ├── page.tsx              # Super-admin dashboard (server component)
│       └── login/page.tsx        # Super-admin login (client component)
├── components/
│   ├── GolfNews.tsx              # RSS news feed display
│   ├── LeaderboardTable.tsx      # Standings table
│   ├── Logo.tsx                  # Logo component (badge/text variants)
│   ├── Navigation.tsx            # Main nav (league-aware)
│   ├── NavigationWrapper.tsx     # Client wrapper for nav
│   ├── ScoreCard.tsx             # Matchup score display
│   └── SeasonSelector.tsx        # Season dropdown
├── lib/
│   ├── actions.ts                # 1951-line monolith (ALL server actions)
│   ├── auth.ts                   # League admin session management
│   ├── db.ts                     # Prisma client initialization
│   ├── handicap.ts               # Handicap calculation engine (605 lines, good code)
│   ├── rss.ts                    # ESPN RSS feed parser
│   └── superadmin-auth.ts        # Super-admin auth (hardcoded creds)
└── generated/prisma/             # Prisma-generated client (gitignored)
```

## Key Problems

### 1. The `actions.ts` Monolith (1,951 lines)

Every server action lives in one file. Read functions (data fetching) and write functions (mutations) are mixed together. Read functions are marked `"use server"` unnecessarily — they should be plain functions called from server components.

### 2. The Admin Page God Component (2,068 lines)

One client component with 40+ `useState` calls renders all admin functionality: matchup entry, team management, league settings, handicap configuration, about editing, and season management. No code splitting between tabs.

### 3. Server Actions as Data Layer

Client components call server actions for data fetching (via `useEffect` + server action RPC). This adds unnecessary overhead. The proper pattern is: server components fetch data, server actions handle mutations.

### 4. No Shared League Layout

Every page under `/league/[slug]/` independently fetches the league by slug and handles 404. A shared layout would deduplicate this.

---

## Recommended Architecture

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── error.tsx                     # NEW: Root error boundary
│   ├── loading.tsx                   # NEW: Root loading state
│   ├── not-found.tsx                 # NEW: Custom 404
│   ├── globals.css
│   ├── api/
│   │   ├── admin/login/route.ts
│   │   ├── sudo/login/route.ts
│   │   ├── golf-news/route.ts
│   │   └── health/route.ts
│   ├── league/[slug]/
│   │   ├── layout.tsx                # NEW: Shared layout (fetches league, provides context)
│   │   ├── loading.tsx               # NEW: League-scoped loading skeleton
│   │   ├── error.tsx                 # NEW: League-scoped error boundary
│   │   ├── page.tsx
│   │   ├── leaderboard/page.tsx
│   │   ├── history/page.tsx
│   │   ├── handicap-history/page.tsx
│   │   ├── signup/page.tsx           # CONVERT: Server component + client form child
│   │   ├── team/[teamId]/page.tsx
│   │   └── admin/
│   │       ├── page.tsx              # REFACTOR: Thin shell with tab routing
│   │       ├── login/page.tsx
│   │       └── _components/          # NEW: Admin sub-components
│   │           ├── MatchupEntryForm.tsx
│   │           ├── TeamManagement.tsx
│   │           ├── LeagueSettings.tsx
│   │           ├── HandicapSettings.tsx
│   │           ├── AboutEditor.tsx
│   │           └── SeasonManager.tsx
│   ├── leagues/
│   │   ├── page.tsx                  # CONVERT: Server component + client search child
│   │   └── new/page.tsx
│   └── sudo/
│       ├── page.tsx
│       └── login/page.tsx
├── components/
│   ├── layout/                       # NEW: Organized subdirectory
│   │   ├── Navigation.tsx
│   │   ├── NavigationWrapper.tsx
│   │   └── MobileNav.tsx             # NEW: Mobile hamburger menu
│   ├── league/                       # NEW: League-specific components
│   │   ├── LeaderboardTable.tsx
│   │   ├── ScoreCard.tsx
│   │   └── SeasonSelector.tsx
│   └── shared/                       # NEW: Shared/atomic components
│       ├── Logo.tsx
│       └── GolfNews.tsx
├── lib/
│   ├── actions/                      # NEW: Domain-split server actions
│   │   ├── index.ts                  # Re-export barrel
│   │   ├── leagues.ts                # League CRUD
│   │   ├── teams.ts                  # Team management
│   │   ├── matchups.ts               # Matchup operations
│   │   ├── standings.ts              # Leaderboard/rankings (consolidated)
│   │   ├── seasons.ts                # Season management
│   │   └── handicap-settings.ts      # Handicap config CRUD
│   ├── queries/                      # NEW: Read-only data fetching (NOT server actions)
│   │   ├── leagues.ts
│   │   ├── teams.ts
│   │   ├── matchups.ts
│   │   └── standings.ts
│   ├── auth.ts                       # REWRITE: JWT-based sessions
│   ├── db.ts
│   ├── handicap.ts                   # Keep as-is (good code)
│   ├── standings.ts                  # NEW: Shared ranking/tiebreaker logic
│   ├── rss.ts
│   ├── superadmin-auth.ts            # REWRITE: DB-backed auth
│   └── validation/                   # NEW: Zod schemas
│       ├── league.ts
│       ├── matchup.ts
│       ├── team.ts
│       └── handicap.ts
├── generated/prisma/
└── tests/                            # NEW: Test directory
    ├── unit/
    │   ├── handicap.test.ts
    │   ├── standings.test.ts
    │   └── auth.test.ts
    ├── integration/
    │   ├── leagues.test.ts
    │   ├── matchups.test.ts
    │   └── teams.test.ts
    └── e2e/
        ├── league-creation.spec.ts
        ├── admin-login.spec.ts
        └── matchup-flow.spec.ts
```

## Data Model Changes

### Extract HandicapConfig (1:1 with League)

```prisma
model League {
  id            Int      @id @default(autoincrement())
  name          String   @unique
  slug          String   @unique
  adminUsername String
  adminPassword String
  maxTeams      Int      @default(16)
  registrationOpen Boolean @default(true)

  // League info fields (keep)
  // Platform management fields (keep)

  // Relations
  teams          Team[]
  matchups       Matchup[]
  seasons        Season[]
  handicapConfig HandicapConfig?  // NEW: 1:1 relationship
}

model HandicapConfig {
  id        Int    @id @default(autoincrement())
  leagueId  Int    @unique
  league    League @relation(fields: [leagueId], references: [id], onDelete: Cascade)

  // All 20+ handicap fields move here
  baseScore         Float   @default(35)
  multiplier        Float   @default(0.9)
  rounding          String  @default("floor")
  // ... etc
}
```

### Add Indexes

```prisma
model Team {
  // ... fields ...
  @@index([leagueId])
  @@index([seasonId])
}

model Matchup {
  // ... fields ...
  @@index([leagueId])
  @@index([seasonId])
  @@index([teamAId])
  @@index([teamBId])
  @@index([leagueId, weekNumber])
}

model Season {
  // ... fields ...
  @@index([leagueId])
}
```

### Convert String Enums to Prisma Enums

```prisma
enum LeagueStatus {
  active
  suspended
  cancelled
}

enum TeamStatus {
  pending
  approved
  rejected
}

enum HandicapRounding {
  floor
  round
  ceil
}

enum ScoreSelection {
  all
  last_n
  best_of_last
}
```

## Caching Strategy

| Page | Current | Recommended |
|------|---------|-------------|
| Homepage (`/`) | `force-dynamic` | `revalidate = 60` |
| League home | Dynamic | `revalidate = 300` |
| Leaderboard | Dynamic | `revalidate = 300` + `revalidatePath` on score submit |
| Match history | Dynamic | `revalidate = 300` + `revalidatePath` on score submit |
| Handicap history | Dynamic | `revalidate = 300` + `revalidatePath` on score submit |
| Browse leagues | Client-side fetch | Server component + `revalidate = 60` |
| Admin panel | Client-side | Keep dynamic (mutations are frequent) |
