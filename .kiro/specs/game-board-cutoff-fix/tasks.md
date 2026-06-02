# Implementation Plan

## Overview

Fix the horizontal cut-off where the game board and header render wider than
narrow Reddit webviews (~375px), clipping the rightmost column and trailing
header controls. The fix extracts a pure square-sizing helper
(`src/client/lib/board-layout.ts`) that clamps the board to
`max(0, min(availableWidth, availableHeight))`, drives `GameView.svelte` from
measured container dimensions, and reflows the header within the available width.

This plan uses the bug condition methodology. `F` = original height-derived
square sizing (`aspect-square h-full` → side = `availableHeight`). `F'` = fixed
sizing (`computeBoardSize = max(0, min(availableWidth, availableHeight))`).

Per AGENTS.md, `.svelte` files are not unit-tested, so the fix-checking and
preservation properties are verified as unit + property-based tests against the
extracted pure helper, and the rendered layout is verified via the UI Review
Workflow (Playwright MCP). `fast-check` (^4.8.0) is already a dependency.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6"] },
    { "id": 3, "tasks": ["4"] },
    { "id": 4, "tasks": ["5"] }
  ]
}
```

Wave 0: the exploration test (1, FAILS on `F`) and preservation tests (2, PASS
on `F`) are independent and both precede the fix. Wave 1: implementing the helper
(3.1) replaces the stub. Wave 2: the GameView/GameBoard wiring (3.2–3.4) and the
re-run verifications (3.5/3.6) all depend on 3.1. Wave 3: the Playwright UI review
(4) depends on the full fix. Wave 4: the checkpoint (5) is the final gate.

## Tasks

- [x] 1. Write bug condition exploration test (Property 1)
  - **Property 1: Bug Condition** - Board Overflows On Narrow Viewports
  - **CRITICAL**: This test MUST FAIL on the unfixed model - failure confirms the cut-off exists
  - **DO NOT attempt to make it pass yet** - the real fix lands in task 3
  - **NOTE**: This test encodes the Expected Behavior (Property 1 in design) - it validates the fix when it passes in task 3.5
  - **GOAL**: Surface counterexamples that demonstrate the right column is clipped
  - Create `src/client/lib/board-layout.ts` with `computeBoardSize(availableWidth, availableHeight)` **stubbed to model the ORIGINAL buggy behavior `F`**: return `Math.max(0, availableHeight)` (the height-derived square; `void availableWidth` to satisfy `noUnusedParameters`)
  - Create `src/client/lib/__tests__/board-layout.test.ts`
  - **Scoped PBT Approach**: bug-condition contexts are `0 <= availableWidth < availableHeight` with `gridSize ∈ {4, 6, 8}` (this is `isBugCondition`: `availableHeight > availableWidth` from design)
  - Write a `fast-check` property: for all bug-condition contexts, `computeBoardSize(w, h) <= w` AND `<= h` AND the side is used for both axes (stays square) AND `computeColumnSize(boardSize, gridSize) > 0` (all columns laid out) — this is `expectedBehavior` from the design's Fix Checking pseudocode
  - Include the design's representative counterexamples as concrete assertions: 375px portrait `w≈351, h≈430` for 4×4, 6×6, 8×8 (original side 430 > 351 available)
  - Run test on UNFIXED model: `bun run test`
  - **EXPECTED OUTCOME**: Test FAILS (the stub returns `h`, which exceeds `w` for every bug-condition context - this proves the overflow `F` produces)
  - Document counterexamples found (e.g. "computeBoardSize(351, 430) returns 430, overflowing the 351px width by 79px → rightmost column clipped")
  - Mark task complete when the test is written, run, and the failure is documented
  - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.4_

- [x] 2. Write preservation property tests (Property 2) — BEFORE implementing fix
  - **Property 2: Preservation** - Sizing Unchanged Where Content Already Fits
  - **IMPORTANT**: Follow observation-first methodology
  - Observe `F` on non-buggy contexts: when `availableHeight <= availableWidth`, the original height-derived square (side = `availableHeight`) already fits, so the rendered board side equals `availableHeight` (confirm visually on a wide viewport during the task 4 review; the stub from task 1 encodes this same `F` behavior)
  - In `src/client/lib/__tests__/board-layout.test.ts`, add a `fast-check` property: for all `0 <= h <= w`, `computeBoardSize(w, h) === h` (the preservation equality from the design's Preservation Checking pseudocode — non-buggy contexts unchanged)
  - Add a monotonic sanity property: shrinking `w` below `h` never increases the returned size (overflow can only decrease, never grow)
  - Run tests on the UNFIXED model: `bun run test`
  - **EXPECTED OUTCOME**: Tests PASS (the stub returns `h`, which equals `h` for every `h <= w` context - this confirms the baseline `F` behavior the fix must preserve)
  - Mark task complete when the tests are written, run, and passing on the unfixed model
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Fix for game board horizontal cut-off on narrow viewports

  - [x] 3.1 Implement the square-sizing helper (replace the stub)
    - In `src/client/lib/board-layout.ts`, replace the stubbed `computeBoardSize` with the real implementation: `Math.max(0, Math.min(availableWidth, availableHeight))` — the single source of truth for the board's square side
    - Add `computeColumnSize(boardSize, gridSize)` returning `boardSize / gridSize`, guarding `gridSize <= 0` (return 0)
    - Add explicit return types on both exported functions; keep them pure (same input → same output, no side effects)
    - Cover the design's unit cases: `min(w, h)` for `w < h`, `h < w`, `w === h`; clamp negative/zero dimensions to 0; `computeColumnSize` for grid sizes 4, 6, 8 and the `gridSize <= 0` guard
    - _Bug_Condition: isBugCondition(ctx) = ctx.availableHeight > ctx.availableWidth (from design)_
    - _Expected_Behavior: expectedBehavior(render) = boardSize <= availableWidth AND <= availableHeight AND square AND columns fit (from design)_
    - _Preservation: computeBoardSize(w, h) === availableHeight when availableHeight <= availableWidth (from design)_
    - _Requirements: 2.1, 2.2, 2.4, 3.1, 3.2, 3.3_

  - [x] 3.2 Wire GameView board wrapper to the helper
    - In `src/client/views/GameView.svelte`, import `computeBoardSize` from `../lib/board-layout`
    - Add `bind:clientWidth` / `bind:clientHeight` on the board wrapper element to measure `availableWidth` / `availableHeight` ($state)
    - Compute `const boardSize = $derived(computeBoardSize(availableWidth, availableHeight))`
    - Replace `aspect-square h-full max-w-full` on the square container with an inline `style="width: {boardSize}px; height: {boardSize}px"`, keeping the element centred
    - _Bug_Condition: isBugCondition(ctx) = availableHeight > availableWidth (from design)_
    - _Expected_Behavior: board side never exceeds availableWidth while staying square (from design)_
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 3.3 Make the header reflow within the available width
    - In `src/client/views/GameView.svelte`, let the centre cluster shrink (`min-w-0`, reduced gaps) and/or allow the header to wrap (`flex-wrap`) so the trailing `race`/`shuffle` controls compress or drop instead of clipping
    - Preserve ≥44px tap targets for icon buttons (final spacing tuned in the task 4 Playwright pass at 375px)
    - _Expected_Behavior: all header controls stay within the viewport width with none clipped (from design)_
    - _Requirements: 1.3, 2.3_

  - [x] 3.4 Confirm GameBoard grid tracks the clamped wrapper
    - In `src/client/components/GameBoard.svelte`, verify `w-full h-full` correctly fills the now-clamped square wrapper and `grid-template-columns: repeat(gridSize, 1fr)` yields evenly sized columns; no logic change expected
    - _Preservation: square grid with correct rows/columns and square cell aspect for every grid size (from design)_
    - _Requirements: 3.3_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Board Fits Within Available Width
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The task 1 test encodes the expected behavior; with `computeBoardSize` now returning `min(w, h)`, it must pass
    - Run `bun run test`
    - **EXPECTED OUTCOME**: Test PASSES (confirms the overflow is fixed: `min(w, h) <= w` for all bug-condition contexts)
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Sizing Unchanged Where Content Already Fits
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run `bun run test`
    - **EXPECTED OUTCOME**: Tests PASS (for `h <= w`, `min(w, h) === h` - non-buggy contexts unchanged, no regressions)
    - Confirm the full suite still passes after the fix
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. UI Review Workflow (Playwright MCP) — rendered fix-checking + Property 3 preservation
  - **Property 3: Preservation** - Interaction and Grid Structure Unchanged
  - Start the frontend-only server manually: `bun run local` (Vite at `http://localhost:4173`); ask the user to start it if it is not running
  - **375×667 (primary)**: load 4×4, then switch to 6×6 and 8×8 via the selector — confirm no right-edge clipping, every column (incl. rightmost) fully visible and tappable, and all header controls within width
  - **390×844**: repeat the checks; confirm no regression
  - **768×1024 (secondary)**: confirm the board and header render as before (preservation — board sized to the fitting height-derived square)
  - **Interaction (Property 3)**: tap the rightmost column at 375px and confirm cells cycle null → blue → red → null; confirm the grid keeps the correct square rows/columns for each grid size
  - **Console check**: `browser_console_messages` shows no new JS errors
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

- [x] 5. Checkpoint — ensure all tests and types pass
  - Run `bun run test && bun run type-check`
  - **EXPECTED OUTCOME**: zero test failures, zero type errors
  - Ensure all tests pass; ask the user if questions arise
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

## Notes

- **TDD red/green via the helper**: Task 1's `computeBoardSize` stub returns the
  height-derived side, faithfully modeling the original buggy layout `F`. This
  makes Property 1 (fix-checking) genuinely fail red and Property 2
  (preservation) genuinely pass green on the same pre-fix code. Task 3.1 swaps
  the stub for `min(w, h)`, flipping Property 1 to green while keeping
  Property 2 green — a real `F → F'` transition.
- **Why property-based**: preservation and fix-checking are universal claims
  ("for all contexts"), so `fast-check` generates many
  `(availableWidth, availableHeight, gridSize)` contexts and catches edge cases
  (zero/equal dimensions, extreme aspect ratios) that hand-written cases miss.
- **`.svelte` not unit-tested** (AGENTS.md): GameView/GameBoard changes
  (tasks 3.2–3.4) are validated through the Playwright UI Review Workflow in
  task 4, not unit tests.
- **Property hover status**: tasks use `**Property N: Type** - [Title]` so PBT
  status is trackable. Property 1 = Bug Condition / Expected Behavior,
  Property 2 = Preservation, Property 3 = Interaction & grid-structure
  preservation (verified visually).
- **Verify before done** (AGENTS.md Step 7): `bun run test && bun run type-check`
  must be clean before the spec is considered complete.
