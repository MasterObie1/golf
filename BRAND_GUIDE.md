# LeagueLinks Brand Guide

> **Premium Golf League Management**
> A modern platform connecting golfers, teams, and leagues.

---

## Brand Overview

**LeagueLinks** represents the intersection of timeless golf tradition and modern technology. The brand draws inspiration from the prestigious greens of championship courses while embracing a clean, contemporary digital aesthetic. Every visual element should convey professionalism, connection, and the refined spirit of the game.

### Brand Attributes
- **Professional** — Trustworthy and polished
- **Connected** — Fostering community and competition
- **Modern** — Clean, intuitive, tech-forward
- **Premium** — Elevated experience without pretension

---

## Color Palette

### Primary Colors

| Color | Name | Hex | RGB | Usage |
|-------|------|-----|-----|-------|
| ![#00573F](https://via.placeholder.com/60x40/00573F/00573F.png) | **Masters Green** | `#00573F` | `0, 87, 63` | Primary brand color, headers, CTAs, navigation |
| ![#FDB913](https://via.placeholder.com/60x40/FDB913/FDB913.png) | **Championship Gold** | `#FDB913` | `253, 185, 19` | Accent highlights, badges, success states |
| ![#F0F4F2](https://via.placeholder.com/60x40/F0F4F2/F0F4F2.png) | **Fairway White** | `#F0F4F2` | `240, 244, 242` | Page backgrounds, cards, light surfaces |
| ![#1A2E26](https://via.placeholder.com/60x40/1A2E26/1A2E26.png) | **Deep Rough** | `#1A2E26` | `26, 46, 38` | Primary text, dark UI elements |

### Extended Palette

| Color | Name | Hex | Usage |
|-------|------|-----|-------|
| ![#004D38](https://via.placeholder.com/40x30/004D38/004D38.png) | Green Dark | `#004D38` | Hover states, pressed buttons |
| ![#007A55](https://via.placeholder.com/40x30/007A55/007A55.png) | Green Light | `#007A55` | Secondary actions, links |
| ![#E5A811](https://via.placeholder.com/40x30/E5A811/E5A811.png) | Gold Dark | `#E5A811` | Hover states for gold elements |
| ![#FFD54F](https://via.placeholder.com/40x30/FFD54F/FFD54F.png) | Gold Light | `#FFD54F` | Subtle highlights, badges |
| ![#FFFFFF](https://via.placeholder.com/40x30/FFFFFF/FFFFFF.png) | Pure White | `#FFFFFF` | Cards, modals, contrast surfaces |
| ![#6B7C74](https://via.placeholder.com/40x30/6B7C74/6B7C74.png) | Muted Sage | `#6B7C74` | Secondary text, placeholders |
| ![#D4DBD7](https://via.placeholder.com/40x30/D4DBD7/D4DBD7.png) | Soft Divider | `#D4DBD7` | Borders, dividers, subtle lines |

### Semantic Colors

| Purpose | Color | Hex |
|---------|-------|-----|
| Success | ![#22C55E](https://via.placeholder.com/30x20/22C55E/22C55E.png) | `#22C55E` |
| Warning | ![#F59E0B](https://via.placeholder.com/30x20/F59E0B/F59E0B.png) | `#F59E0B` |
| Error | ![#EF4444](https://via.placeholder.com/30x20/EF4444/EF4444.png) | `#EF4444` |
| Info | ![#3B82F6](https://via.placeholder.com/30x20/3B82F6/3B82F6.png) | `#3B82F6` |

---

## Typography

### Font Stack

**Primary Typeface: [Inter](https://fonts.google.com/specimen/Inter)**
A highly legible, modern sans-serif designed for digital interfaces. Use for all body text, UI elements, and general content.

**Display Typeface: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)**
A geometric sans-serif with subtle personality. Use for headlines, section titles, and brand moments.

### Font Import

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
```

### Tailwind CSS Configuration

```javascript
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  display: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
}
```

### Type Scale

| Element | Font | Weight | Size | Line Height | Letter Spacing |
|---------|------|--------|------|-------------|----------------|
| H1 | Plus Jakarta Sans | 800 | 48px / 3rem | 1.1 | -0.02em |
| H2 | Plus Jakarta Sans | 700 | 36px / 2.25rem | 1.2 | -0.01em |
| H3 | Plus Jakarta Sans | 600 | 24px / 1.5rem | 1.3 | 0 |
| H4 | Plus Jakarta Sans | 600 | 20px / 1.25rem | 1.4 | 0 |
| Body Large | Inter | 400 | 18px / 1.125rem | 1.6 | 0 |
| Body | Inter | 400 | 16px / 1rem | 1.5 | 0 |
| Body Small | Inter | 400 | 14px / 0.875rem | 1.5 | 0 |
| Caption | Inter | 500 | 12px / 0.75rem | 1.4 | 0.01em |
| Button | Inter | 600 | 14px / 0.875rem | 1 | 0.02em |

---

## Logo Concepts

### Concept 1: The Interlocking L

**Visual Description:**
Two stylized capital "L" letters (from "League" and "Links") that interlock at their bases, forming a subtle chain-link motif. The letters share a connection point, symbolizing the linking of teams and players.

**Wordmark Treatment:**
"League" in Masters Green, "Links" in Championship Gold, with the interlocking symbol preceding the text.

**Best Use Cases:**
Primary logo for marketing, hero sections, and branded materials.

---

### Concept 2: The Connected Tee

**Visual Description:**
A minimalist mark featuring a golf tee abstracted into a vertical line with a circular top. Two such elements are connected by a horizontal bridge, evoking both a golf tee and the concept of network nodes/links.

**Wordmark Treatment:**
"LeagueLinks" as a single word in Plus Jakarta Sans Bold, with subtle letter-spacing. The mark sits to the left or above the wordmark.

**Best Use Cases:**
App icon, favicon, social avatars, and compact branding.

---

### Concept 3: The Fairway Path

**Visual Description:**
The word "LeagueLinks" with a continuous underline that elegantly connects the two capital L's, weaving beneath the text like a fairway winding through a course. The line could have subtle curves suggesting a golf course layout.

**Wordmark Treatment:**
All text in Deep Rough (`#1A2E26`) with the connecting path in Masters Green, transitioning to Championship Gold at its terminus.

**Best Use Cases:**
Website header, email signatures, horizontal applications.

---

## UI Component Guidelines

### Buttons

**Primary Button**
- Background: `#00573F` (Masters Green)
- Text: `#FFFFFF` (White)
- Hover: `#004D38` (Green Dark)
- Border Radius: `8px`
- Padding: `12px 24px`

**Secondary Button**
- Background: `transparent`
- Border: `2px solid #00573F`
- Text: `#00573F`
- Hover Background: `#00573F` with white text

**Accent Button**
- Background: `#FDB913` (Championship Gold)
- Text: `#1A2E26` (Deep Rough)
- Hover: `#E5A811` (Gold Dark)

### Cards

- Background: `#FFFFFF`
- Border: `1px solid #D4DBD7`
- Border Radius: `12px`
- Shadow: `0 1px 3px rgba(26, 46, 38, 0.08)`
- Hover Shadow: `0 4px 12px rgba(26, 46, 38, 0.12)`

### Form Inputs

- Background: `#FFFFFF`
- Border: `1px solid #D4DBD7`
- Focus Border: `2px solid #00573F`
- Border Radius: `8px`
- Placeholder Color: `#6B7C74`

---

## Spacing System

Based on a 4px base unit:

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight spacing, icon gaps |
| `space-2` | 8px | Related elements |
| `space-3` | 12px | Form element padding |
| `space-4` | 16px | Standard component padding |
| `space-6` | 24px | Section internal spacing |
| `space-8` | 32px | Between components |
| `space-12` | 48px | Section margins |
| `space-16` | 64px | Page section breaks |

---

## Iconography

- **Style:** Outlined, 1.5px stroke weight
- **Size:** 20px default, 16px compact, 24px large
- **Color:** Inherits from text or uses Masters Green for interactive elements
- **Recommended Library:** [Lucide Icons](https://lucide.dev/) or [Heroicons](https://heroicons.com/)

---

## Imagery Guidelines

### Photography Style
- Natural lighting, soft shadows
- Focus on connection: handshakes, group celebrations, team moments
- Course imagery: lush greens, morning dew, golden hour light
- Avoid: Overly staged stock photos, harsh flash photography

### Illustrations
- Minimal, line-based style
- Use brand colors sparingly for accent
- Geometric shapes preferred over organic forms

---

## Voice & Tone

| Attribute | Do | Don't |
|-----------|-----|-------|
| **Professional** | "Your match has been scheduled" | "Awesome! You're all set!" |
| **Clear** | "Enter your handicap index" | "Pop in your magic number" |
| **Encouraging** | "Great round! You've moved up 2 spots" | "OMG you crushed it!!!" |
| **Inclusive** | "All skill levels welcome" | "For serious golfers only" |

---

## CSS Custom Properties

```css
:root {
  /* Primary Colors */
  --color-green-primary: #00573F;
  --color-green-dark: #004D38;
  --color-green-light: #007A55;

  --color-gold-primary: #FDB913;
  --color-gold-dark: #E5A811;
  --color-gold-light: #FFD54F;

  --color-bg-primary: #F0F4F2;
  --color-bg-white: #FFFFFF;

  --color-text-primary: #1A2E26;
  --color-text-secondary: #6B7C74;
  --color-border: #D4DBD7;

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-display: 'Plus Jakarta Sans', system-ui, sans-serif;

  /* Spacing */
  --space-unit: 4px;

  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(26, 46, 38, 0.08);
  --shadow-md: 0 4px 12px rgba(26, 46, 38, 0.12);
  --shadow-lg: 0 8px 24px rgba(26, 46, 38, 0.16);
}
```

---

## Accessibility

- Maintain WCAG 2.1 AA compliance minimum
- Primary Green on white: **7.5:1** contrast ratio
- Deep Rough on Fairway White: **12.3:1** contrast ratio
- Always provide text alternatives for images
- Ensure interactive elements have visible focus states
- Minimum touch target size: 44x44px

---

*LeagueLinks Brand Guide v1.0*
*Last Updated: January 2026*
