# Bugfix Requirements Document

## Introduction

Players are reporting that the game board is "cut off" inside the Reddit mobile
app webview. On narrow viewports (the primary Reddit webview target of ~375px
and narrower, e.g. a Samsung A15), the puzzle grid renders wider than the
visible viewport, so the rightmost column of cells is clipped at the right edge.
The header row of icons (help, streak, coins, trophy, lightning/race, shuffle)
also overflows past the right edge. The clipped content is not fully visible and
the cut-off cells cannot be reliably tapped, which blocks players from solving
the puzzle.

This is a horizontal-overflow layout defect. It is most severe on the narrowest
screens and is made worse by larger grids (6×6 and 8×8 via the grid-size
selector), where more columns must fit into the same constrained width. The fix
must keep the entire board and header within the horizontal viewport so all
cells are visible and interactable, without regressing the layout on wider
screens or for the default 4×4 grid where content already fits.

## Bug Analysis

### Current Behavior (Defect)

When the app renders inside a narrow webview, horizontal content exceeds the
viewport width and is clipped instead of being constrained to fit.

1.1 WHEN the app is rendered in a webview whose width is at or below the primary mobile target (~375px) THEN the game board grid renders wider than the viewport and the rightmost column of cells is clipped at the right edge

1.2 WHEN the game board overflows the viewport horizontally THEN the cells in the clipped rightmost column are not fully visible and cannot be reliably tapped

1.3 WHEN the header row is rendered on a narrow viewport THEN the row of header controls (help, streak, coins, trophy, race/lightning, shuffle) extends past the right edge and the trailing controls are cut off

1.4 WHEN a larger grid size (6×6 or 8×8) is selected on a narrow viewport THEN the additional columns increase the horizontal overflow and worsen the cut-off

### Expected Behavior (Correct)

The board and header must always fit within the available horizontal width on
narrow viewports, so the full puzzle and all controls are visible and usable.

2.1 WHEN the app is rendered in a webview whose width is at or below the primary mobile target (~375px) THEN the system SHALL constrain the game board to fit entirely within the viewport width with no horizontal clipping of any cell

2.2 WHEN the game board is displayed on a narrow viewport THEN the system SHALL keep every cell, including the rightmost column, fully visible and tappable within the viewport bounds

2.3 WHEN the header row is rendered on a narrow viewport THEN the system SHALL keep all header controls within the viewport width (fitting, wrapping, or otherwise reflowing) so none are clipped at the right edge

2.4 WHEN a larger grid size (6×6 or 8×8) is selected on a narrow viewport THEN the system SHALL scale the board to fit the available width so all columns remain visible without horizontal clipping

### Unchanged Behavior (Regression Prevention)

The fix must not alter the layout where content already fits, nor change
gameplay or the board's visual structure.

3.1 WHEN the default 4×4 grid is displayed on a viewport wide enough to contain it THEN the system SHALL CONTINUE TO render the full board with no clipping

3.2 WHEN the app is rendered on wider viewports (e.g. tablet ~768px) THEN the system SHALL CONTINUE TO render the board and header without introducing new layout regressions

3.3 WHEN the board is displayed at any supported grid size THEN the system SHALL CONTINUE TO render cells as a square grid with the correct number of rows and columns and preserve the square cell aspect ratio

3.4 WHEN a player taps a cell that is within the visible viewport THEN the system SHALL CONTINUE TO cycle/toggle the cell color as it does today

## Deriving the Bug Condition

**Key Definitions:**
- **F**: The original layout/render of the board and header before the fix
- **F'**: The fixed layout/render after constraining content to the viewport

**Inputs of interest:** the rendering context, characterized by the available
viewport width `W` and the selected `gridSize` (4, 6, or 8). Conceptually the
"output" is whether rendered content fits within `W` (no horizontal overflow)
and all cells are visible/tappable.

**Bug Condition Function** — identifies rendering contexts that trigger the
cut-off:

```pascal
FUNCTION isBugCondition(ctx)
  INPUT: ctx with fields { viewportWidth: number, gridSize: number }
  OUTPUT: boolean

  // The bug manifests when the board/header content rendered by F is wider
  // than the available viewport width, causing horizontal clipping. This is
  // driven by narrow viewports and amplified by larger grids.
  RETURN renderedContentWidth(F, ctx.gridSize) > ctx.viewportWidth
END FUNCTION
```

**Property Specification** — defines correct behavior for buggy inputs:

```pascal
// Property: Fix Checking - No horizontal overflow, all cells visible
FOR ALL ctx WHERE isBugCondition(ctx) DO
  render ← F'(ctx)
  ASSERT renderedContentWidth(render) <= ctx.viewportWidth
  ASSERT all_cells_visible_and_tappable(render)
END FOR
```

**Preservation Goal** — non-buggy contexts must render identically:

```pascal
// Property: Preservation Checking
FOR ALL ctx WHERE NOT isBugCondition(ctx) DO
  ASSERT F(ctx) = F'(ctx)
END FOR
```

This ensures that for contexts where content already fits (wide viewports, or
the default 4×4 grid within an adequate width), the fixed layout behaves
identically to the original.
