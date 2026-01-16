# Task Plan: About the League Section

## Goal
Create an "About the League" section that allows admins to fill out league information including start date, end date, number of weeks, number of teams, and other pertinent details. This information will be displayed publicly on the home page for visitors.

## Current Phase
Phase 1

## Phases

### Phase 1: Database Schema Update
- [ ] Add new fields to `LeagueSettings` model in `prisma/schema.prisma`
- [ ] Run Prisma migration
- **Status:** pending

### Phase 2: Server Actions
- [ ] Update `getLeagueSettings()` to return all new fields
- [ ] Update `updateLeagueSettings()` to accept and save all new fields
- [ ] Create new action `getLeagueAbout()` (public, no auth) for public display
- [ ] Add Zod validation schema for about fields
- **Status:** pending

### Phase 3: Admin UI - About Tab
- [ ] Add new "About" tab to admin page tab navigation
- [ ] Create form with all about fields
- [ ] Add state management for all new fields
- [ ] Connect form to server action
- [ ] Add loading states and success/error messages
- **Status:** pending

### Phase 4: Public Display Component
- [ ] Create new `LeagueInfo` component
- [ ] Fetch data using `getLeagueAbout()` action
- [ ] Design responsive card layout with Masters theme
- [ ] Handle conditional rendering for optional fields
- **Status:** pending

### Phase 5: Home Page Integration
- [ ] Import and add `LeagueInfo` component to home page
- [ ] Position appropriately in layout
- [ ] Ensure responsive design
- **Status:** pending

### Phase 6: Testing & Polish
- [ ] Test admin form save functionality
- [ ] Test public display with various data states
- [ ] Test empty state (no about info filled out)
- [ ] Verify on mobile and desktop viewports
- **Status:** pending

## Schema Changes
```prisma
model LeagueSettings {
  // Existing fields...
  maxTeams             Int       @default(16)
  registrationOpen     Boolean   @default(true)

  // About the League fields (all optional)
  leagueName           String?   // e.g., "Thursday Night Golf League"
  startDate            DateTime? // League start date
  endDate              DateTime? // League end date
  numberOfWeeks        Int?      // Total weeks in season
  courseName           String?   // Golf course name
  courseLocation       String?   // City/State
  playDay              String?   // Day of week (e.g., "Thursday")
  playTime             String?   // Start time (e.g., "5:30 PM")
  entryFee             Float?    // League entry fee
  prizeInfo            String?   // Prize pool description
  description          String?   // General description
  contactEmail         String?   // Contact email
  contactPhone         String?   // Contact phone
}
```

## Key Files
| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Add new fields |
| `src/lib/actions.ts` | Server actions |
| `src/app/admin/page.tsx` | Admin UI |
| `src/components/LeagueInfo.tsx` | Public display (new) |
| `src/app/page.tsx` | Home page integration |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| (none yet) | - | - |

## Notes
- All new fields are optional for gradual completion by admin
- Public display should gracefully handle missing information
- Follow existing Masters tournament theme styling
- Maintain consistent form patterns from existing settings tab
