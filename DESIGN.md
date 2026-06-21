---
version: "1.0"
name: "urjo-design-system"
description: >
  Design tokens and guidelines for Urjo — a binary grid puzzle game as a Reddit
  Devvit webview. Bold game aesthetic: all buttons fully rounded, spring-physics
  press feedback, depth through directional shadows only (no borders), two
  semantic game-cell colors, one deep-blue interactive accent, gold for
  achievement/streak. No orange. No borders.

colors:
  # --- Interactive ---
  primary: "#2563EB"
  primary-press: "#1A4FA8"      # ledge shadow beneath primary buttons
  primary-on-dark: "#60A5FA"
  on-primary: "#ffffff"

  # --- Game cell colors (semantic — puzzle state, never UI chrome) ---
  game-red: "#E54E3E"
  game-red-press: "#C03328"     # ledge shadow beneath red cells
  game-blue: "#3997D7"
  game-blue-press: "#2175A8"    # ledge shadow beneath blue cells
  on-game-cell: "#ffffff"

  # --- Achievement / streak accent — gold, no orange ---
  achievement: "#F5A623"
  achievement-press: "#C4861C"
  achievement-on-dark: "#FCD34D"
  on-achievement: "#1A1A1A"

  # --- Coins ---
  coins: "#EAB308"
  coins-subtle: "rgba(234,179,8,0.14)"
  coins-on-dark: "#FDE68A"

  # --- Text ---
  ink: "#1C1C1E"
  ink-muted: "#636366"
  ink-faint: "#8E8E93"
  on-dark: "#ffffff"
  on-dark-muted: "#ebebf5"
  on-dark-faint: "#8E8E93"

  # --- Surfaces — light mode ---
  canvas: "#ffffff"
  canvas-secondary: "#F2F2F7"
  canvas-modal: "#ffffff"

  # --- Surfaces — dark mode ---
  surface-dark: "#1C1C1E"
  surface-dark-raised: "#2C2C2E"
  surface-dark-elevated: "#3A3A3C"

  # --- Game board empty cells ---
  cell-empty-light: "#E5E5EA"
  cell-empty-dark: "#48484A"

  # --- Overlays ---
  overlay: "rgba(0,0,0,0.50)"
  overlay-dark: "rgba(0,0,0,0.70)"

  # --- Semantic state ---
  error: "#FF3B30"
  error-fill: "rgba(255,59,48,0.12)"
  success: "#34C759"
  success-fill: "rgba(52,199,89,0.12)"

typography:
  font-display: "SF Pro Display, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
  font-body: "SF Pro Text, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"

  # Big solve-time display on completion screen
  score-hero:
    fontFamily: "{typography.font-display}"
    fontSize: "36px"
    fontWeight: 800
    lineHeight: 1.0
    letterSpacing: "0px"

  # Modal titles, overlay headers
  headline:
    fontFamily: "{typography.font-display}"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0px"

  # Section headings, stat values
  subhead:
    fontFamily: "{typography.font-body}"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0px"

  # Default body paragraphs
  body:
    fontFamily: "{typography.font-body}"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0px"

  # Secondary labels, helper copy
  caption:
    fontFamily: "{typography.font-body}"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0px"

  # Coin chip text, badge values
  caption-strong:
    fontFamily: "{typography.font-body}"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0px"

  # All button labels — heavy, clear at a glance
  button:
    fontFamily: "{typography.font-body}"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: "0px"

  # Stat card category labels: "STREAK", "COINS" — uppercase + wide
  micro-label:
    fontFamily: "{typography.font-body}"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.4px"
    textTransform: "uppercase"

  # Cell number: 4×4 grid — needs to dominate the cell area
  cell-number-4x4:
    fontFamily: "{typography.font-display}"
    fontSize: "44px"
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: "0px"

  # Cell number: 6×6 grid
  cell-number-6x6:
    fontFamily: "{typography.font-display}"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: "0px"

  # Cell number: 8×8 grid
  cell-number-8x8:
    fontFamily: "{typography.font-display}"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: "0px"

rounded:
  none: "0px"
  sm: "8px"       # small internal tags / chips only
  md: "12px"      # compact surfaces (toast, inline badge)
  lg: "16px"      # stat cards, settings rows
  xl: "20px"      # modal sheets, large surface cards
  full: "9999px"  # ALL buttons, cells, coin chip — everything tappable

spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
  section: "64px"

motion:
  # --- Spring physics easing ---
  # This bezier overshoots past 1.0 and settles back — the Candy Crush "pop"
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)"
  # Faster snap for press-down (ease-in — snaps quickly into pressed state)
  snap-in: "cubic-bezier(0.55, 0.0, 1.0, 0.45)"
  # Standard ease-out for overlay/modal entrances
  ease-out: "cubic-bezier(0.0, 0.0, 0.2, 1)"

  # --- Durations ---
  press-down: "65ms"     # snap into pressed state — short, physical feel
  spring-back: "380ms"   # spring release with overshoot — longer to feel alive
  fade: "180ms"
  slide-up: "320ms"

  # --- Button press mechanics (applied in CSS) ---
  # 1. Tap: scale → 0.88, translateY → +ledge-depth in press-down ms (snap-in)
  # 2. Release: scale → 1.0 via spring easing (spring-back ms) — overshoots ~1.06 before settling
  # 3. box-shadow collapses on press, restores on release in sync
  button-press-scale: "0.88"
  button-spring-peak: "1.06"   # approximate overshoot peak
  ledge-depth: "5px"           # translateY shift on press (matches shadow offset)

  # --- Ambient animations ---
  cell-breathe: "3s ease-in-out infinite"
  hint-pulse: "0.9s ease-in-out infinite"
  cta-pulse: "2.2s ease-in-out infinite"
  bounce-btn: "1.6s ease-in-out infinite"

components:
  # --- Buttons — all rounded-full, no borders, depth via directional shadow ---

  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: "16px 32px"
    shadow: "0 6px 0 0 {colors.primary-press}"
    pressedShadow: "0 1px 0 0 {colors.primary-press}"
    pressedTransform: "translateY(5px) scale(0.95)"
    pressTransition: "transform {motion.press-down} {motion.snap-in}, box-shadow {motion.press-down} {motion.snap-in}"
    releaseTransition: "transform {motion.spring-back} {motion.spring}, box-shadow {motion.spring-back} {motion.spring}"

  button-secondary:
    backgroundColor: "rgba(37,99,235,0.12)"
    textColor: "{colors.primary}"
    darkBackgroundColor: "rgba(96,165,250,0.14)"
    darkTextColor: "{colors.primary-on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: "16px 32px"
    shadow: "none"
    pressedTransform: "scale(0.92)"
    releaseTransition: "transform {motion.spring-back} {motion.spring}"

  button-achievement:
    backgroundColor: "{colors.achievement}"
    textColor: "{colors.on-achievement}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: "16px 32px"
    shadow: "0 6px 0 0 {colors.achievement-press}"
    pressedShadow: "0 1px 0 0 {colors.achievement-press}"
    pressedTransform: "translateY(5px) scale(0.95)"
    pressTransition: "transform {motion.press-down} {motion.snap-in}, box-shadow {motion.press-down} {motion.snap-in}"
    releaseTransition: "transform {motion.spring-back} {motion.spring}, box-shadow {motion.spring-back} {motion.spring}"

  button-ghost:
    backgroundColor: "rgba(0,0,0,0.06)"
    darkBackgroundColor: "rgba(255,255,255,0.08)"
    textColor: "{colors.ink-muted}"
    darkTextColor: "{colors.on-dark-muted}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: "14px 28px"
    shadow: "none"
    pressedTransform: "scale(0.92)"
    releaseTransition: "transform {motion.spring-back} {motion.spring}"

  # --- Game cells ---

  cell-empty:
    backgroundColor: "{colors.cell-empty-light}"
    darkBackgroundColor: "{colors.cell-empty-dark}"
    rounded: "{rounded.full}"
    shadow: "none"
    animation: "cell-breathe {motion.cell-breathe}"

  cell-red:
    backgroundColor: "{colors.game-red}"
    textColor: "{colors.on-game-cell}"
    rounded: "{rounded.full}"
    shadow: "0 4px 0 0 {colors.game-red-press}"
    pressedShadow: "0 1px 0 0 {colors.game-red-press}"
    pressedTransform: "translateY(3px) scale(0.95)"
    pressTransition: "transform {motion.press-down} {motion.snap-in}"
    releaseTransition: "transform {motion.spring-back} {motion.spring}"

  cell-blue:
    backgroundColor: "{colors.game-blue}"
    textColor: "{colors.on-game-cell}"
    rounded: "{rounded.full}"
    shadow: "0 4px 0 0 {colors.game-blue-press}"
    pressedShadow: "0 1px 0 0 {colors.game-blue-press}"
    pressedTransform: "translateY(3px) scale(0.95)"
    pressTransition: "transform {motion.press-down} {motion.snap-in}"
    releaseTransition: "transform {motion.spring-back} {motion.spring}"

  cell-hint:
    backgroundColor: "color at 70% opacity"
    rounded: "{rounded.full}"
    animation: "hint-pulse {motion.hint-pulse}"
    glow: "0 0 0 4px color at 40% opacity"

  # --- Cards (no borders — color separation only) ---

  stat-card:
    backgroundColor: "{colors.canvas-secondary}"
    darkBackgroundColor: "{colors.surface-dark-raised}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md} {spacing.sm}"

  stat-card-coins:
    backgroundColor: "{colors.coins-subtle}"
    darkBackgroundColor: "rgba(234,179,8,0.12)"
    rounded: "{rounded.lg}"
    padding: "{spacing.md} {spacing.sm}"
    textColor: "{colors.coins}"
    darkTextColor: "{colors.coins-on-dark}"

  stat-card-streak:
    backgroundColor: "rgba(245,166,35,0.12)"
    darkBackgroundColor: "rgba(245,166,35,0.12)"
    rounded: "{rounded.lg}"
    padding: "{spacing.md} {spacing.sm}"
    textColor: "{colors.achievement}"
    darkTextColor: "{colors.achievement-on-dark}"

  # --- Surfaces ---

  completion-overlay:
    backgroundColor: "{colors.canvas}"
    darkBackgroundColor: "{colors.surface-dark}"
    padding: "{spacing.xl} {spacing.lg}"
    entryTransition: "opacity {motion.fade} ease"

  modal-sheet:
    backgroundColor: "{colors.canvas-modal}"
    darkBackgroundColor: "{colors.surface-dark-raised}"
    rounded: "{rounded.xl} {rounded.xl} 0 0"
    padding: "{spacing.lg}"
    shadow: "0 -8px 40px rgba(0,0,0,0.20)"
    entryTransition: "transform {motion.slide-up} {motion.ease-out}"

  header-bar:
    backgroundColor: "{colors.canvas}"
    darkBackgroundColor: "{colors.surface-dark}"
    textColor: "{colors.ink}"
    darkTextColor: "{colors.on-dark}"
    height: "52px"
    padding: "0 {spacing.md}"

  coin-chip:
    backgroundColor: "{colors.coins-subtle}"
    textColor: "{colors.coins}"
    darkTextColor: "{colors.coins-on-dark}"
    rounded: "{rounded.full}"
    padding: "5px {spacing.sm}"
    typography: "{typography.caption-strong}"
---


## Overview

Urjo is a binary grid puzzle where every cell is one of three states: empty, red, or blue. The UI exists to frame the puzzle — it should feel lighter and quieter than the game cells themselves.

**Primary viewport:** 375 × 667px (Reddit webview). Design at this width first.

**Five non-negotiable principles:**
1. **One interactive accent.** `{colors.primary}` (`#2563EB`) carries every "tap me" signal. Nothing else is interactive blue.
2. **Two game colors.** `{colors.game-red}` and `{colors.game-blue}` are puzzle-state colors — never used in UI chrome.
3. **No orange.** Streak and achievement moments use gold (`{colors.achievement}`). No hex between `#FF4500` and `#FF8C00` anywhere.
4. **No borders.** Depth comes from directional box-shadow (the button "ledge") and surface color differences. Never from a `border` property.
5. **Spring physics on every tap.** Buttons snap down fast (65ms), spring back with overshoot (380ms). The `cubic-bezier(0.34, 1.56, 0.64, 1)` easing is the system-wide press feel.


## Colors

### Interactive Accent
**`{colors.primary}` — `#2563EB`** is the single interactive signal. Filled primary buttons, tinted secondary buttons, coin chip, focus rings.

- **`{colors.primary-press}` — `#1A4FA8`**: The darker ledge shadow directly beneath primary buttons. Creates the 3D raised-button effect without a border.
- **`{colors.primary-on-dark}` — `#60A5FA`**: For inline links on dark surfaces only.

### Game Cell Colors
Reserved strictly for filled game cells. Never repurpose as UI color.

- **`{colors.game-red}` — `#E54E3E`**: Coral-red. Warm, alive. Clearly distinct from the primary blue, the achievement gold, and any orange tone.
- **`{colors.game-red-press}` — `#C03328`**: Ledge shadow for red cells — gives filled cells the same physical depth as buttons.
- **`{colors.game-blue}` — `#3997D7`**: Steel-blue. Visually distinct from `{colors.primary}` (`#2563EB`) so game state never reads as a UI affordance.
- **`{colors.game-blue-press}` — `#2175A8`**: Ledge shadow for blue cells.

### Achievement Accent — Gold
Every earned-reward moment: streak count, level-up, milestone overlays.

- **`{colors.achievement}` — `#F5A623`**: Primary gold on light and dark surfaces.
- **`{colors.achievement-press}` — `#C4861C`**: Ledge shadow for gold achievement buttons.
- **`{colors.achievement-on-dark}` — `#FCD34D`**: Slightly brighter for better contrast on near-black.
- **No orange.** `#F5A623` is amber-gold. Do not use anything in `#FF4500`–`#FF8C00`.

### Coins
Economy display only. Distinct from achievement gold — yellower, more saturated.

- **`{colors.coins}` — `#EAB308`**: Coin icon tint and balance text.
- **`{colors.coins-subtle}` — `rgba(234,179,8,0.14)`**: Background tint for coin stat cards and the header chip.

### Text

| Token | Value | Use |
|---|---|---|
| `{colors.ink}` | `#1C1C1E` | All headlines and body on light surfaces |
| `{colors.ink-muted}` | `#636366` | Secondary copy, stat labels |
| `{colors.ink-faint}` | `#8E8E93` | Disabled text, placeholders |
| `{colors.on-dark}` | `#ffffff` | All text on dark surfaces |
| `{colors.on-dark-muted}` | `#ebebf5` | Secondary copy on dark surfaces |

### Surfaces

| Token | Light | Dark | Use |
|---|---|---|---|
| `{colors.canvas}` | `#ffffff` | — | Page background, modals |
| `{colors.canvas-secondary}` | `#F2F2F7` | — | Settings panels, alternate rows |
| `{colors.surface-dark}` | — | `#1C1C1E` | Dark page background |
| `{colors.surface-dark-raised}` | — | `#2C2C2E` | Dark cards, modals |
| `{colors.surface-dark-elevated}` | — | `#3A3A3C` | Dark elevated drawers |
| `{colors.cell-empty-light}` | `#E5E5EA` | — | Empty cell fill |
| `{colors.cell-empty-dark}` | — | `#48484A` | Empty cell fill (dark) |


## Typography

**Font stack:** `SF Pro Display / SF Pro Text → system-ui → -apple-system → BlinkMacSystemFont → sans-serif`. Resolves to native system font on all platforms. On Android it falls back to the device sans-serif — acceptable in a game webview.

### Scale

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `{typography.score-hero}` | 36px | 800 | 1.0 | Completion time — the moment of triumph |
| `{typography.headline}` | 22px | 700 | 1.15 | Modal titles, overlay headers |
| `{typography.subhead}` | 16px | 600 | 1.25 | Section titles, stat values |
| `{typography.body}` | 16px | 400 | 1.5 | Descriptions, instructions |
| `{typography.caption}` | 13px | 400 | 1.4 | Secondary labels, helper text |
| `{typography.caption-strong}` | 13px | 600 | 1.35 | Coin chip text, badge values |
| `{typography.button}` | 16px | 700 | 1.0 | All button labels |
| `{typography.micro-label}` | 11px | 700 | 1.2 | Stat card labels: "STREAK", "COINS" |

### Cell Number Scale

| Token | Size | Weight | Grid |
|---|---|---|---|
| `{typography.cell-number-4x4}` | 44px | 600 | 4×4 |
| `{typography.cell-number-6x6}` | 30px | 600 | 6×6 |
| `{typography.cell-number-8x8}` | 19px | 600 | 8×8 |

### Principles
- **Weight ladder: 400 / 600 / 700 / 800.** No 300, no 500. Body is 400. Emphasis is 600. Buttons and headlines are 700. Score hero is 800.
- **Letter spacing is 0** everywhere except `{typography.micro-label}` which uses `+0.4px` for uppercase legibility.
- **Line height is context-specific.** Display (`1.0`), game UI (`1.15–1.25`), readable body (`1.5`).
- **Font size does not use rem or vw.** Fixed px sizes only in a fixed-width webview.


## Layout & Spacing

### Spacing Scale

| Token | Value | Use |
|---|---|---|
| `{spacing.xxs}` | 4px | Icon-label gap, tight internal nudges |
| `{spacing.xs}` | 8px | Grid cell gap, chip padding |
| `{spacing.sm}` | 12px | Compact card padding |
| `{spacing.md}` | 16px | Default card padding, horizontal screen padding |
| `{spacing.lg}` | 24px | Modal padding, section gaps |
| `{spacing.xl}` | 32px | Screen-level vertical padding (compact) |
| `{spacing.xxl}` | 48px | Screen-level vertical padding |
| `{spacing.section}` | 64px | Between major layout regions |

### Game Board
- Board is square, size computed in JS: `min(viewport-width − 32px, viewport-height × 0.55)`
- Cells: equal size, `gap: {spacing.xs}` (8px)
- Cell size: `(board-size − (gridSize−1) × 8px) / gridSize`

### Container
- Primary target: **375px wide**
- Header bar: full width, 52px tall, `{spacing.md}` horizontal padding
- Overlays: full-screen fixed (`inset: 0`) or bottom-sheet
- Content max-width inside modals: 320px, centered


## Depth & Elevation

**No borders.** Separation comes from: (1) a darker surface color, (2) the directional ledge shadow on buttons and cells.

### Ledge Shadow (Buttons & Filled Cells)
The primary depth mechanism. A directional `box-shadow` directly below an element makes it feel raised off the surface — like a physical button. On press, the element drops into the shadow.

```
Normal:  box-shadow: 0 6px 0 0 {press-color}; transform: translateY(0)
Pressed: box-shadow: 0 1px 0 0 {press-color}; transform: translateY(5px)
```

This combination — the shadow shrinks AND the element moves down — sells the physical press illusion.

### Elevation Table

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow | Empty cells, page background, header bar |
| Ledge | `0 6px 0 0 press-color` | Primary buttons, achievement buttons |
| Cell ledge | `0 4px 0 0 press-color` | Filled game cells |
| Modal lift | `0 -8px 40px rgba(0,0,0,0.20)` | Bottom sheet shadow (upward) |

No drop shadows on text. No drop shadows on cards. Cards are distinguished purely by their background color being lighter/darker than the page canvas.


## Shapes

All buttons and cells are `{rounded.full}` (9999px). This is the non-negotiable rule.

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Full-screen overlays only |
| `{rounded.sm}` | 8px | Internal badges, tooltips |
| `{rounded.md}` | 12px | Toast notifications |
| `{rounded.lg}` | 16px | Stat cards, settings rows |
| `{rounded.xl}` | 20px | Modal sheets |
| `{rounded.full}` | 9999px | **All buttons, all cells, coin chip** |


## Motion & Spring Physics

The press interaction has two distinct phases with different easing curves — this asymmetry is what makes it feel physically real.

### The Press Pattern

```
Phase 1 — Press down (65ms, snap-in easing):
  transform: translateY(5px) scale(0.88)
  box-shadow collapses from full ledge to stub

Phase 2 — Spring release (380ms, spring easing):
  transform: translateY(0) scale(1.0)
  box-shadow restores to full ledge
  The cubic-bezier overshoots: scale briefly passes 1.06 before settling
```

**`{motion.spring}` — `cubic-bezier(0.34, 1.56, 0.64, 1)`**: The core spring easing. The control point at Y=1.56 pushes the animation past its endpoint, creating a natural overshoot-and-settle. This is what makes it feel alive, not canned.

**`{motion.snap-in}` — `cubic-bezier(0.55, 0.0, 1.0, 0.45)`**: Fast ease-in for the press-down phase only. Mimics the physical feel of pressing a button — quick initial resistance then snap.

### CSS Implementation

```css
/* Button default — spring releases apply here */
.btn {
  transition:
    transform  380ms cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 380ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Button pressed — snap-in applies here, overrides transition */
.btn:active {
  transform: translateY(5px) scale(0.88);
  box-shadow: 0 1px 0 0 var(--btn-shadow-color);
  transition:
    transform  65ms cubic-bezier(0.55, 0.0, 1.0, 0.45),
    box-shadow 65ms cubic-bezier(0.55, 0.0, 1.0, 0.45);
}
```

### Animation Reference

| Name | Spec | Use |
|---|---|---|
| Button spring press | Phase 1 (65ms snap-in) + Phase 2 (380ms spring) | Every tappable button |
| Cell tap | Same spring pattern, ledge 4px | Game cells on color change |
| Fade overlay | `opacity` at 180ms ease | Completion screen appear |
| Slide up | `translateY` at 320ms ease-out | Bottom sheet entry |
| Cell breathe | Opacity 0.85↔1.0, 3s loop | Empty cells — puzzle feels alive |
| Hint pulse | `scale(0.88↔1.05)` + opacity, 0.9s loop | Hint overlay on correct empty cell |
| CTA pulse | `scale(1.0↔1.015)` + soft glow, 2.2s loop | Primary CTA on result screen |
| Bounce btn | `scale(1.0→1.06→0.97→1.03→1.0)`, 1.6s | Play button on first screen |

**No layout animations.** Nothing shifts spatially except the sheet slide and the button press translate. The game grid never moves.


## Components

### Buttons
All buttons are `{rounded.full}`. No exceptions. No borders.

**`button-primary`** — Deep blue, ledge shadow. The single highest-priority action on any screen. `{colors.primary}` fill, `{colors.primary-press}` ledge. Spring press. One per screen max.

**`button-secondary`** — Tinted blue fill (`rgba(37,99,235,0.12)`), `{colors.primary}` text. No ledge shadow — secondary priority means less physical weight. Spring press without the ledge collapse.

**`button-achievement`** — Gold fill, gold ledge. Used for the highest-energy CTA: "Challenge & Continue." Same spring mechanics as primary.

**`button-ghost`** — Near-transparent fill (`rgba(0,0,0,0.06)`), muted text. For lowest-priority actions: "Join r/urjo," destructive-neutral flows. Spring press, no ledge.

### Game Cells
**`cell-empty`** — Neutral fill `{colors.cell-empty-light/dark}`, circular, no shadow. Breathing animation signals the puzzle is active. Tutorial target uses a float animation with a blue tint blend.

**`cell-red` / `cell-blue`** — Solid fill with a 4px directional ledge. Same spring press mechanics as buttons — tapping a cell feels as satisfying as pressing a button. White numbers on top.

**`cell-hint`** — Pulsing overlay in the correct color at 70% opacity, with a soft ring glow at 40% opacity. One active at a time.

### Stat Cards
**`stat-card-coins`** — Tinted yellow-gold background, no border. Coin icon + balance in gold, `{typography.micro-label}` "COINS" label below.

**`stat-card-streak`** — Tinted amber-gold background, no border. Flame icon + streak count in `{colors.achievement}`, "STREAK" label below. Never orange.

### Overlays & Sheets
**`completion-overlay`** — Full-screen fixed. Plain canvas background (white/dark). Fades in at 180ms. Trophy + stats + action buttons stack vertically, centered.

**`modal-sheet`** — Bottom-aligned drawer. Rounded top at `{rounded.xl}`. Upward shadow for lift. Slides in at 320ms ease-out.

### Header
**`header-bar`** — Full-width, 52px. Plain surface matching canvas — no shadow, no border. Puzzle number left, coin chip right.

**`coin-chip`** — Gold-tinted pill in the header. `{rounded.full}`, gold text, no border.


## Dark Mode

Activates via `prefers-color-scheme: dark`. No manual toggle.

| What changes | Light | Dark |
|---|---|---|
| Page background | `{colors.canvas}` | `{colors.surface-dark}` |
| Cards, modals | `{colors.canvas-secondary}` | `{colors.surface-dark-raised}` |
| Primary text | `{colors.ink}` | `{colors.on-dark}` |
| Secondary text | `{colors.ink-muted}` | `{colors.on-dark-muted}` |
| Empty cell | `{colors.cell-empty-light}` | `{colors.cell-empty-dark}` |

**Unchanged in both modes:** `{colors.primary}`, `{colors.game-red}`, `{colors.game-blue}`, `{colors.achievement}`, `{colors.error}`. Game colors and interactive accent are mode-invariant.


## Do's and Don'ts

### Do
- Use `{colors.primary}` (`#2563EB`) for every interactive affordance — buttons, chips, focus rings.
- Use `{colors.achievement}` (`#F5A623`) gold for streak, level-up, and milestone moments.
- Apply spring press to **every** tappable element — no flat `active:scale-95`, always the full two-phase spring.
- Use `{rounded.full}` on every button, every cell, every pill chip.
- Give filled cells the same 4px ledge shadow as buttons — cells should feel like physical tokens to flip.
- Let background color carry the full burden of card separation. No border needed.

### Don't
- Don't use orange — no hex in `#FF4500`–`#FF8C00`. Streak was orange; it's now gold. Lock it.
- Don't add `border` to any component. Not cards, not buttons, not cells.
- Don't use `{colors.game-blue}` for UI affordances. It will read as game state, not interaction.
- Don't use `{colors.primary}` for cell fills — it visually competes with `{colors.game-blue}`.
- Don't skip the ledge shadow on primary and achievement buttons — without it they feel flat and weightless.
- Don't use font weight 500 or 300. Ladder is 400 / 600 / 700 / 800.
- Don't letter-space anything except `{typography.micro-label}`.
- Don't add shadows to cards or text. Ledge shadows on buttons/cells only, modal lift shadow only.
- Don't animate layout position. Only press translate and sheet slide move spatially.


## CSS Variable Reference

Current `app.css` variable mapping:

| Design token | CSS variable | Tailwind class |
|---|---|---|
| `{colors.game-red}` | `--color-urjo-coral` | `bg-urjo-coral` |
| `{colors.game-blue}` | `--color-urjo-blue` | `bg-urjo-blue` |
| `{colors.canvas}` | `--theme-bg-primary` | `bg-theme-bg-primary` |
| `{colors.canvas-secondary}` | `--theme-bg-secondary` | `bg-theme-bg-secondary` |
| `{colors.ink}` | `--theme-text-primary` | `text-theme-text-primary` |
| `{colors.ink-muted}` | `--theme-text-secondary` | `text-theme-text-secondary` |
| `{colors.ink-faint}` | `--theme-text-muted` | `text-theme-text-muted` |
| `{colors.cell-empty-light}` | `--theme-empty-cell` | `bg-theme-empty-cell` |
| `{colors.overlay}` | `--theme-overlay` | `bg-theme-overlay` |

Add these to `@theme` in `app.css` for the new tokens:

```css
@theme {
  --color-urjo-primary: #2563EB;
  --color-urjo-primary-press: #1A4FA8;
  --color-urjo-achievement: #F5A623;
  --color-urjo-achievement-press: #C4861C;
  --color-urjo-achievement-dark: #FCD34D;
  --color-urjo-coins: #EAB308;
  --color-urjo-coins-subtle: rgba(234,179,8,0.14);
}
```
