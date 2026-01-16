# Findings: About the League Feature

## Codebase Analysis

### Current Architecture
- **Framework:** Next.js 16.1.1 with App Router
- **Database:** Prisma 7.2.0 with SQLite (local) / Turso (production)
- **Styling:** Tailwind CSS 4 with CSS variables for theming
- **Validation:** Zod for input validation
- **Auth:** Cookie-based admin authentication via middleware

### Existing LeagueSettings Model
Located in `prisma/schema.prisma`:
```prisma
model LeagueSettings {
  id                   Int       @id @default(autoincrement())
  maxTeams             Int       @default(16)
  registrationOpen     Boolean   @default(true)
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
}
```

### Server Action Patterns
From `src/lib/actions.ts`:
- `getLeagueSettings()` - Get or create singleton settings record
- `updateLeagueSettings(maxTeams, registrationOpen)` - Update with admin auth check
- All mutations use `await requireAdmin()` for authorization

### Admin Page Structure
From `src/app/admin/page.tsx`:
- Tab-based navigation: "matchups" | "teams" | "settings"
- Settings tab has simple form with inputs and save button
- Uses useState for form state, loading states, and messages
- Consistent styling with CSS variables

### Theme Colors (globals.css)
```css
--masters-green: #006747
--masters-green-dark: #004d35
--masters-yellow: #FFCC00
--masters-cream: #f5f5f0
--masters-burgundy: #722F37
```

### Form UI Patterns
- Labels: `text-sm font-medium text-[var(--text-secondary)]`
- Inputs: `px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)]`
- Buttons: `px-6 py-2 bg-[var(--masters-green)] text-white rounded-lg hover:bg-[var(--masters-green-dark)]`
- Success messages: `bg-[var(--success-bg)] text-[var(--success-text)]`
- Error messages: `bg-[var(--error-bg)] text-[var(--error-text)]`

### Home Page Structure
From `src/app/page.tsx`:
- Hero section with background image and gradient overlay
- Centered content with title, description, navigation buttons
- Golf news component displayed below hero
- "A tradition unlike any other" decorative footer

## Design Decisions

### Extending vs New Model
**Decision:** Extend existing `LeagueSettings` model
**Reasoning:**
- Single source of truth for league configuration
- Already have get/update pattern
- All fields optional = backward compatible

### Tab Placement
**Decision:** Add new "About" tab in admin after Settings
**Reasoning:**
- Logical grouping with other configuration
- Set once per season (less frequently accessed)
- Keeps matchup entry prominent as first tab

### Public Display Location
**Decision:** Add LeagueInfo component to home page
**Reasoning:**
- Home page is the landing page for visitors
- Provides immediate context about the league
- Complements existing content

### Optional Fields Approach
**Decision:** All new fields are nullable/optional
**Reasoning:**
- Admins can fill out incrementally
- No migration issues with existing data
- Graceful degradation if not configured

## About Fields Design

### Categorized Fields
| Category | Fields |
|----------|--------|
| Basic Info | leagueName, description |
| Schedule | startDate, endDate, numberOfWeeks, playDay, playTime |
| Location | courseName, courseLocation |
| Fees & Prizes | entryFee, prizeInfo |
| Contact | contactEmail, contactPhone |

### Display Priority (Public)
1. League Name (header)
2. Schedule (dates, day/time)
3. Location (course info)
4. Entry Fee
5. Contact info
6. Description (expandable if long)
