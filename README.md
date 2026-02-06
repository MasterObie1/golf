# LeagueLinks

Golf league management web app. Create leagues, register teams, submit scores, and track standings with automatic handicap calculations.

## Features

- **League Management** — Create and configure leagues with custom rules
- **Auto Handicaps** — Configurable handicap calculation engine with multiple formula options
- **Live Standings** — Real-time leaderboards with rank and handicap movement tracking
- **Match History** — Full record of every round, score, and result
- **Team Registration** — Online signup with admin approval workflow
- **Season Support** — Multiple seasons per league with independent standings
- **Admin Dashboard** — Submit matchups, manage teams, configure settings

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19 + Tailwind CSS 4
- **Database:** Prisma 7 with SQLite (local) / Turso libSQL (production)
- **Auth:** Custom JWT sessions (cookie-based)
- **Validation:** Zod
- **Deployment:** Vercel + Turso

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Generate a session secret
openssl rand -base64 32
# Add the output to SESSION_SECRET in .env

# Set up the database
npx prisma generate
npx prisma db push

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | SQLite file path (local) or Turso URL |
| `SESSION_SECRET` | Yes | Secret key for signing JWT session tokens |
| `TURSO_DATABASE_URL` | Prod only | Turso database URL |
| `TURSO_AUTH_TOKEN` | Prod only | Turso auth token |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── league/[slug]/      # League-specific pages
│   │   ├── admin/          # Admin dashboard (tabs)
│   │   ├── leaderboard/    # Standings
│   │   ├── history/        # Match history
│   │   ├── handicap-history/
│   │   ├── signup/         # Team registration
│   │   └── team/[teamId]/  # Team detail
│   └── leagues/            # League directory
├── components/             # Shared UI components
├── lib/
│   ├── actions/            # Server actions (by domain)
│   ├── auth.ts             # Session management
│   ├── handicap.ts         # Handicap calculation engine
│   ├── db.ts               # Prisma client
│   └── rate-limit.ts       # Rate limiting
└── middleware.ts            # Auth middleware
prisma/
└── schema.prisma           # Database schema
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |

## Deployment

Deployed on Vercel with Turso as the production database. Set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `SESSION_SECRET` in Vercel environment variables. Prisma generates the client during the build step.
