# Game Board Cutoff Fix Bugfix Design

## Overview

On narrow Reddit webview viewports (the primary ~375px target, e.g. a Samsung
A15), the puzzle board renders wider than the viewport and the rightmost column
of cells is clipped at the right edge, so those cells cannot be reliably tapped.
The header icon row (help, streak, coins, trophy, race/lightning, shuffle) also
overflows past the right edge. Larger grids (6×6, 8×8) make the board cut-off
worse because more columns are packed into the same constrained width.

This is a horizontal-overflow layout defect with two independent causes:

1. **Board sizing keyed off height.** In `GameView.svelte` the board wrapper is
   `aspect-square h-full max-w-full`. The `h-full` forces the square's side to
   equal the available *height*; on tall, narrow viewports the available height
   exceeds the available width, so the height-derived square is wider than the
   viewport and spills past the right edge.
2. **Header is a single no-wrap flex row.** The header uses
   `flex items-center justify-between` with fixed-width icon buttons and
   variable-width chips, none of which are allowed to shrink or wrap, so the
   trailing controls overflow on narrow widths.

The fix constrains the board to a square whose side is the **smaller** of the
available width and height — `min(availableWidth, availableHeight)` — so the
board can never exceed the viewport width, stays square, and scales cleanly for
6×6 and 8×8. The square-sizing clamp is extracted into a pure, unit- and
property-testable helper (`src/client/lib/board-layout.ts`) that `GameView`
drives from measured container dimensions. The header is made to reflow within
the available width (flexible, shrinkable clusters and/or wrapping) so no control
is clipped. On viewports where content already fits (wide screens, default 4×4),
the computed size equals the original height-derived square, so the layout is
unchanged.

## Glossary

- **Bug_Condition (C)**: The rendering context where the board/header content
  produced by the original layout is wider than the available viewport width,
  causing horizontal clipping. Driven by narrow viewports and amplified by
  larger grid sizes.
- **Property (P)**: For a buggy context, the fixed layout renders the board
  within the available width with no horizontal clipping, and every cell —
  including the rightmost column — stays fully visible and tappable.
- **Preservation**: Contexts where content already fits (wide viewports, or the
  default 4×4 within an adequate width) must render identically to the original,
  and gameplay (tap/cycle), grid structure, and square cell aspect must be
  unchanged.
- **`GameView.svelte`**: The view in `src/client/views/GameView.svelte` that owns
  the header, the grid-size selector row, and the `<main>` board wrapper.
- **`GameBoard.svelte`**: The component in `src/client/components/GameBoard.svelte`
  that renders the CSS grid (`grid-template-columns: repeat(gridSize, 1fr)`,
  currently `w-full h-full`).
- **`computeBoardSize`**: A new pure function in
  `src/client/lib/board-layout.ts` that returns the board's square pixel side
  given the available content-box dimensions — `min(availableWidth, availableHeight)`
  (clamped at 0).
- **availableWidth / availableHeight**: The inner content-box dimensions of the
  board wrapper (`<main>`), measured via Svelte `bind:clientWidth` /
  `bind:clientHeight`.
- **gridSize**: The selected board dimension — `4`, `6`, or `8`.

## Bug Details

### Bug Condition

The bug manifests when the board/header content rendered by the original layout
(`F`) is wider than the available viewport width. For the board, this happens
whenever the available height exceeds the available width, because the original
square is sized off height (`aspect-square h-full`) and therefore becomes wider
than the viewport. Larger `gridSize` values do not change *whether* the board
overflows (the outer square size is the same), but they multiply the number of
clipped columns and shrink each cell, so the cut-off is more damaging.

**Formal Specification:**
```
FUNCTION isBugCondition(ctx)
  INPUT: ctx with fields { availableWidth: number, availableHeight: number, gridSize: number }
  OUTPUT: boolean

  // F sizes the board square off the available height (aspect-square + h-full),
  // so the original rendered board width is availableHeight. The board overflows
  // the viewport precisely when that height-derived width exceeds the available
  // width.
  LET originalBoardWidth = ctx.availableHeight
  RETURN originalBoardWidth > ctx.availableWidth
END FUNCTION
```

### Examples

- **375px portrait, 4×4** — Available main area is roughly 351×430 after the
  header, season strip, and grid-size selector. Original board width = 430px >
  351px available, so the right column is clipped. Expected: board sized to
  351px, fully visible.
- **375px portrait, 6×6** — Same 430px-wide square overflows 351px; six columns
  each ~72px are squeezed and the rightmost column is cut off and untappable.
  Expected: 351px square, six ~58px columns all visible.
- **375px portrait, 8×8** — Worst case: eight columns inside the overflowing
  430px square; the right two columns are partly clipped. Expected: 351px square,
  eight ~44px columns all visible and tappable.
- **Header at 375px** — `help` + streak chip + coin chip + `trophy` + `race` +
  `shuffle`, each rigid, sum past 375px and the trailing `shuffle`/`race`
  controls are clipped. Expected: all controls reflow within 375px.
- **Edge case — 768px tablet (already fits)** — Available main area is wider than
  it is tall, so the height-derived square already fits within the width. Not a
  bug; must remain unchanged.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Tapping a cell within the viewport SHALL CONTINUE TO cycle/toggle its color
  (null → blue → red → null) and the swipe gesture SHALL behave as today.
- The board SHALL CONTINUE TO render as a square grid with the correct number of
  rows and columns and preserve the square cell aspect ratio for every grid size.
- On the default 4×4 grid within an adequate width, the full board SHALL CONTINUE
  TO render with no clipping.
- On wider viewports (e.g. tablet ~768px) the board and header SHALL CONTINUE TO
  render without new layout regressions.
- Locked (clue) cells, number overlays, violation highlighting, and all
  completion/overlay UI SHALL remain unchanged.

**Scope:**
All contexts that do NOT trigger the bug condition (i.e. where the original
height-derived board already fits within the available width — wide viewports and
the default 4×4 within an adequate width) should be completely unaffected by this
fix. This includes:
- Wide/landscape viewports where availableWidth ≥ availableHeight.
- Any grid size in a context where the original board already fit.
- Cell interaction, gesture handling, and grid color/number rendering.

**Note:** The expected correct behavior for buggy contexts is defined in the
Correctness Properties section (Property 1). This section captures what must NOT
change.

## Hypothesized Root Cause

Based on the bug description and code review, the most likely issues are:

1. **Board square sized off height (`GameView.svelte`)**: The board wrapper
   `<div class="aspect-square h-full max-w-full">` forces the square's side to
   the available height. `max-w-full` clamps the *width* to the container but
   leaves `h-full` forcing the height, so on tall/narrow viewports the square is
   wider than the viewport (overflow + clipping) or is distorted. The board side
   should be the *minimum* of available width and height, not the height alone.

2. **No-wrap header flex row (`GameView.svelte`)**: The header
   `<header class="flex items-center justify-between gap-3">` packs a fixed help
   button, a `flex-1` centre cluster of variable chips and rigid `shrink-0` icon
   buttons, and a trailing action cluster. Nothing is allowed to shrink below its
   content width or wrap, so the row's intrinsic width exceeds 375px and trailing
   controls clip.

3. **Grid fills its parent unconditionally (`GameBoard.svelte`)**: The grid uses
   `w-full h-full`, so it inherits whatever (overflowing) size the wrapper gives
   it. Once the wrapper is correctly clamped, the grid fits automatically; no
   change may be required here beyond confirming it tracks the clamped wrapper.

4. **Parent `overflow-hidden` masks rather than fixes**: `<main … overflow-hidden>`
   hides the spillover instead of preventing it, which is exactly why the right
   column is *clipped* rather than scrollable. The fix removes the cause of the
   overflow so clipping never occurs.

## Correctness Properties

Property 1: Bug Condition - Board Fits Within Available Width

_For any_ context where the bug condition holds (`isBugCondition` returns true),
the fixed layout SHALL size the board to `computeBoardSize(availableWidth,
availableHeight)`, which is `≤ availableWidth` and `≤ availableHeight`, so the
board (and therefore every column, including the rightmost) renders fully within
the viewport with no horizontal clipping, remains square, and each column is
`boardSize / gridSize` wide so all columns of any supported grid size stay
visible and tappable.

**Validates: Requirements 2.1, 2.2, 2.4**

Property 2: Preservation - Sizing Unchanged Where Content Already Fits

_For any_ context where the bug condition does NOT hold (`isBugCondition` returns
false — i.e. `availableHeight ≤ availableWidth`), `computeBoardSize` SHALL return
exactly `availableHeight`, the original height-derived square side, so the board
renders identically to the original layout, preserving the fitting 4×4 and
wider-viewport behavior.

**Validates: Requirements 3.1, 3.2, 3.3**

Property 3: Preservation - Interaction and Grid Structure Unchanged

_For any_ cell within the visible viewport, tapping SHALL CONTINUE TO cycle the
cell color exactly as today, and the board SHALL CONTINUE TO render the correct
number of square rows and columns for the selected grid size.

**Validates: Requirements 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/client/lib/board-layout.ts` (new)

**Function**: `computeBoardSize`

**Specific Changes**:
1. **Add a pure square-sizing helper**: `computeBoardSize(availableWidth: number,
   availableHeight: number): number` returns `Math.max(0, Math.min(availableWidth,
   availableHeight))`. This is the single source of truth for the board's square
   side and is framework-agnostic so it can be unit- and property-tested in the
   `node` test environment.
2. **Add a column-size helper (optional, for assertions/clarity)**:
   `computeColumnSize(boardSize: number, gridSize: number): number` returns
   `boardSize / gridSize` with a guard for `gridSize <= 0`. Used to express the
   "all columns fit" property explicitly.

**File**: `src/client/views/GameView.svelte`

**Area**: Board wrapper in `<main>`

**Specific Changes**:
1. **Measure the available area**: Add `bind:clientWidth` / `bind:clientHeight`
   to the board wrapper element to capture `availableWidth` / `availableHeight`.
2. **Drive the square from the helper**: Compute
   `const boardSize = $derived(computeBoardSize(availableWidth, availableHeight))`
   and apply it as an inline `style="width: {boardSize}px; height: {boardSize}px"`
   on the square container, replacing `aspect-square h-full max-w-full`. The
   square is centred as today. This guarantees the side never exceeds the
   available width while staying square.

**Area**: Header row

**Specific Changes**:
3. **Let the header reflow within the width**: Allow the centre cluster to shrink
   (`min-w-0`, reduced gaps) and/or permit the header to wrap (`flex-wrap`) so the
   trailing controls drop or compress instead of clipping. Preserve the existing
   ≥44px tap-target sizing for icon buttons. Exact spacing is tuned during the
   Playwright UI review pass at 375px.

**File**: `src/client/components/GameBoard.svelte`

**Specific Changes**:
4. **Confirm the grid tracks the clamped wrapper**: With the wrapper now sized to
   a fitting square, `w-full h-full` correctly fills it. No logic change expected;
   verify visually that columns are evenly sized via `repeat(gridSize, 1fr)`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples
that demonstrate the overflow on the unfixed code, then verify the fix removes the
overflow for buggy contexts and preserves the layout for non-buggy ones.

Because the project's Vitest environment is `node` and `.svelte` files are not
unit-tested (per AGENTS.md), the **fix-checking and preservation properties are
verified as unit and property-based tests against the extracted pure helper**
(`src/client/lib/board-layout.ts`), and the **rendered layout is verified
visually via the AGENTS.md UI Review Workflow** (Playwright MCP) at the prescribed
viewports. `fast-check` (^4.8.0, already a dependency) is used for the
property-based tests.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the cut-off BEFORE implementing
the fix, and confirm or refute the root-cause hypothesis (board sized off height;
header no-wrap row). If refuted, re-hypothesize.

**Test Plan**: Run the unfixed app through the Playwright UI review workflow at the
narrow target and observe the clipped right column and overflowing header. In
parallel, model the original sizing as `originalBoardWidth = availableHeight` and
assert it exceeds `availableWidth` for narrow contexts, documenting the overflow
the fix must eliminate.

**Test Cases**:
1. **Narrow 4×4 board overflow** (`bun run local`, Playwright at 375×667): launch
   the board, screenshot, observe the rightmost column clipped (will fail to fit
   on unfixed code).
2. **Narrow 6×6 / 8×8 board overflow**: switch grid size via the selector at
   375×667; observe worsening right-edge clipping (will fail on unfixed code).
3. **Header overflow**: at 375×667, observe the trailing `race`/`shuffle` controls
   clipped at the right edge (will fail on unfixed code).
4. **Model check (unit)**: assert `availableHeight > availableWidth ⇒ original
   board width > availableWidth` for representative narrow dimensions
   (demonstrates the height-driven overflow).

**Expected Counterexamples**:
- Rightmost board column and trailing header controls are clipped at ≤375px.
- Possible causes: board square sized off height (`aspect-square h-full`),
  no-wrap header flex row.

### Fix Checking

**Goal**: Verify that for all contexts where the bug condition holds, the fixed
board size fits within the available width with all cells/columns visible.

**Pseudocode:**
```
FUNCTION expectedBehavior(render)
  // P(result): no horizontal overflow and every column is visible/tappable.
  RETURN render.boardSize <= render.availableWidth
         AND render.boardSize <= render.availableHeight
         AND render.boardSize = render.boardHeight        // stays square
         AND (render.boardSize / render.gridSize) > 0      // all columns laid out
END FUNCTION

FOR ALL ctx WHERE isBugCondition(ctx) DO
  boardSize := computeBoardSize(ctx.availableWidth, ctx.availableHeight)
  render    := { boardSize, boardHeight: boardSize,
                 availableWidth: ctx.availableWidth,
                 availableHeight: ctx.availableHeight,
                 gridSize: ctx.gridSize }
  ASSERT expectedBehavior(render)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all contexts where the bug condition does NOT hold, the
fixed sizing equals the original height-derived square, so the layout is
unchanged.

**Pseudocode:**
```
FOR ALL ctx WHERE NOT isBugCondition(ctx) DO   // availableHeight <= availableWidth
  // Original board width = availableHeight (aspect-square + h-full, fitting case).
  ASSERT computeBoardSize(ctx.availableWidth, ctx.availableHeight) = ctx.availableHeight
END FOR
```

**Testing Approach**: Property-based testing is recommended because:
- It generates many `(availableWidth, availableHeight, gridSize)` contexts
  automatically across the input domain.
- It catches edge cases (zero/equal dimensions, extreme aspect ratios) that
  hand-written cases miss.
- It gives strong guarantees that the clamp never exceeds the available width and
  that non-buggy contexts are untouched.

**Test Plan**: Observe the unfixed layout on wide/fitting viewports via Playwright
first, then encode the preservation equality (`computeBoardSize = availableHeight`
when `availableHeight ≤ availableWidth`) as a property, and re-run the Playwright
review on tablet/desktop after the fix to confirm no regression.

**Test Cases**:
1. **Wide-viewport sizing preserved**: for `availableHeight ≤ availableWidth`,
   `computeBoardSize` equals `availableHeight` (property-based across the domain).
2. **4×4 fitting viewport unchanged** (Playwright 768×1024): screenshot before/
   after, confirm identical board placement and size.
3. **Tap/cycle preserved** (Playwright 375 & 768): tap cells, confirm
   null → blue → red → null cycling still works within the now-fitting board.

### Unit Tests

- `computeBoardSize` returns the smaller dimension: `min(w, h)` for
  `w < h`, `h < w`, and `w === h`.
- `computeBoardSize` clamps negatives/zero to 0 (defensive: collapsed/unmeasured
  container).
- `computeColumnSize` returns `boardSize / gridSize` for 4, 6, 8 and guards
  `gridSize <= 0`.
- A fitting context (`h ≤ w`) returns exactly `h` (preservation anchor).

### Property-Based Tests

- **No overflow (fix checking)**: for arbitrary non-negative `w, h` and
  `gridSize ∈ {4,6,8}`, `computeBoardSize(w, h) ≤ w` and `≤ h`
  (`fast-check`).
- **Stays square / all columns fit**: for arbitrary `w, h, gridSize`, the side
  is used for both width and height and `computeBoardSize(w,h) / gridSize` cells
  fit exactly along each axis (no remainder overflow).
- **Preservation**: for arbitrary `w ≥ h ≥ 0`, `computeBoardSize(w, h) === h`
  (non-buggy contexts unchanged).
- **Idempotent/monotonic sanity**: shrinking `w` below `h` never increases the
  board size (overflow can only decrease, never grow).

### Integration Tests

Performed via the AGENTS.md **UI Review Workflow** (Playwright MCP, frontend-only
`bun run local` at `http://localhost:4173`):
- **375×667 (primary)**: 4×4, 6×6, 8×8 — board fully visible, no right-edge
  clipping, every column tappable; header controls all within width.
- **390×844**: same checks; confirm no regression.
- **768×1024 (secondary)**: board and header render as before (preservation).
- **Console check**: `browser_console_messages` shows no new JS errors.
- **Interaction**: tap the rightmost column on 375px to confirm cells are
  reachable and cycle correctly; switch grid sizes and re-verify fit.
