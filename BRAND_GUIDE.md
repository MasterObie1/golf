# LeagueLinks Brand Guide — "The Grounds" v2

> The Masters-inspired identity: dark course greens, tournament-board yellow,
> scorecard paper. This guide documents the system as implemented in
> `src/app/globals.css` and `src/components/`.

---

## Token architecture (two layers)

All tokens live in `src/app/globals.css`. Both layers have light **and** dark
values; `.dark` on any ancestor flips them (class strategy via
`@custom-variant dark`, toggled by next-themes).

### 1. Semantic layer (the shadcn/ui contract)

UI primitives consume only these. Never hardcode a hex in a component.

| Token | Light ("scorecard on the veranda") | Dark ("tournament board at dusk") |
|---|---|---|
| `--background` / `--foreground` | `#F5F7F5` / `#111827` | `#0F1B0F` / `#E8EFE8` |
| `--card` | `#FFFFFF` | `#152715` |
| `--popover` | `#FFFFFF` | `#1A2F1A` |
| `--primary` | `#2D5A27` (fairway) | `#4E8747` (brightened for contrast) |
| `--secondary` | `#F0F4F1` | `#1E351E` |
| `--muted` / fg | `#EDF1ED` / `#6B7280` | `#1B2E1B` / `#9DB39D` |
| `--accent` (hover wash) / fg | `#E8F0E6` / `#1A3A1A` | `#1E3A1E` / `#FFE066` |
| `--destructive` | `#CC0000` | `#E25555` |
| `--border`, `--input` | `#D1D5DB` | `#2A422A` |
| `--ring` | `#2D5A27` | `#FFD700` (yellow focus ring — signature) |
| `--radius` | `0.5rem` (`rounded-lg` = 8px) | same |

### 2. Material layer (the golf identity)

Theme-invariant physical materials — identical in both themes:
`--fairway #2D5A27`, `--rough #1A3A1A`, `--putting #4A7C59`, `--tee #3A6B34`,
`--board-green #006633`, `--board-green-dark #004D26`,
`--board-yellow #FFD700`, `--board-red #CC0000`, `--wood #B8960C`,
`--water #3B7CB8`, `--bunker #E5E7EB`, `--dusk #0F1B0F`.

Theme-aware materials:

| Token | Light | Dark |
|---|---|---|
| `--scorecard-paper` | `#FAFCFA` | `#132413` (chalkboard) |
| `--scorecard-line` | `#D1D5DB` | `#2E462E` |
| `--scorecard-pencil` | `#1F2937` | `#E8EFE8` (chalk) |
| `--surface`, `--surface-white` | aliases of `--background` / `--card` | follow semantic layer |
| success / warning / error / info sets | pastel bg + dark text | deep bg + bright text |

**Brand yellow rule:** `--board-yellow` is deliberately NOT mapped to shadcn's
`--accent` (that's a hover wash). Yellow appears through: the `accent` Button
variant, `SectionLabel`, dark-mode `--ring`, and dark-mode `--accent-foreground`.

**Theme-invariant canvases:** the marketing hero, tournament board, wood-grain
band, and `SiteFooter` are always dark — they carry `class="dark"` so nested
components resolve correct tokens in both themes.

---

## Typography

Loaded via `next/font` in `src/app/layout.tsx`:

| Var | Font | Role |
|---|---|---|
| `--font-display` | Oswald | Headings, buttons, badges, tab labels — always uppercase |
| `--font-sans` | Source Sans 3 | Body copy |
| `--font-mono` | IBM Plex Mono | Scores, handicaps, stats — pair with `tabular-nums` |

A global rule uppercases `h1–h4` in Oswald. Numeric table cells use
`font-mono tabular-nums`.

---

## Component inventory

| Layer | Location | Contents |
|---|---|---|
| Primitives | `src/components/ui/` | shadcn/ui (rethemed, repo-owned): Button (incl. `accent` variant), Card, Input (incl. `pencil` variant), Select, Dialog, AlertDialog, Tabs, Accordion, Table, Badge, Alert, Skeleton, DropdownMenu, Sonner toaster, Sheet, Tooltip, Separator, Switch, Checkbox, Label, Textarea |
| Composites | `src/components/composite/` | `PageHeader`, `SectionLabel` (yellow eyebrow), `EmptyState`, `StatTile`, `ThemeToggle` |
| The Grounds | `src/components/grounds/` | Brand-distinctive customs: `TournamentBoard`/`BoardRow`/`MedalBadge`/`MovementArrow`, `ContourBackground` + contours, `BallRollLoader`, `MotionProvider` |
| Helpers | `src/lib/` | `utils.ts # cn()`, `toast.ts # notify.success/error/info` (sonner) |

Conventions:
- **Buttons**: always `<Button>`; variants `default` (fairway), `secondary`,
  `outline`, `ghost`, `destructive`, `link`, `accent` (board-yellow).
- **Inputs**: `<Input>` default box style, or `variant="pencil"` for the
  scorecard underline aesthetic (the legacy `.pencil-input` class is being
  migrated to this variant).
- **Icons**: lucide-react only. `size-4` inline / `size-5` nav-level,
  `strokeWidth={1.75}`, `aria-hidden` unless standalone (then `aria-label`).
- **Toasts**: `notify.*` from `src/lib/toast.ts` — never per-component
  `message` state.
- **Empty states**: `<EmptyState icon={...} title description action />`.

---

## Dark mode

- next-themes, `attribute="class"`, system default, toggle in the nav
  (`ThemeToggle`: Light / Dark / System).
- Never use raw `bg-white` / `text-gray-*` — they don't adapt. Use semantic
  tokens (`bg-card`, `text-foreground`, `text-muted-foreground`).
- Native controls follow via `color-scheme` on `:root` / `.dark`.

## Motion

- framer-motion via `MotionProvider` (`reducedMotion="user"`); presets in
  `src/lib/animation.ts`.
- CSS keyframes (`ball-roll`, `reg-pulse`) respect
  `prefers-reduced-motion`.
- Rule: animation may never gate content visibility (see the leaderboard
  blank-row incident — rows must render visible-first).
