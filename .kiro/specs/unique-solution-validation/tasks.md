# Implementation Plan: Unique Solution Validation Bugfix

## Overview

Fix the bug where puzzles with multiple valid solutions only accept one specific solution. Replace single-solution string comparison with full constraint validation for both completion detection and mistake tracking. Extend `validation.ts` with all constraint checks, update `App.svelte` completion logic, and update `mistakes.ts` to use constraint-based checking instead of solution-string comparison. Audit the generator's `couldBeValid` pruning for correctness.

## Tasks

- [x] 1. Extend client-side validation with full constraint checking
  - [x] 1.1 Add `countSameColorNeighbors` function to `src/client/lib/validation.ts`
    - Port the 8-directional neighbor counting logic from `src/server/lib/generator.ts`
    - Accept `Grid`, `row`, `col`, `gridSize` parameters
    - Return count of same-color neighbors (0 if cell has no color)
    - _Requirements: 2.1, 2.2_
  - [x] 1.2 Add `hasAdjacentIdenticalRows` function to `src/client/lib/validation.ts`
    - Check if any two adjacent rows have identical color patterns
    - Only compare fully-filled rows
    - _Requirements: 2.2_
  - [x] 1.3 Add `hasAdjacentIdenticalColumns` function to `src/client/lib/validation.ts`
    - Check if any two adjacent columns have identical color patterns
    - Only compare fully-filled columns
    - _Requirements: 2.2_
  - [x] 1.4 Add `numberConstraintsSatisfied` function to `src/client/lib/validation.ts`
    - Check that every cell with both a color and a number has a same-color neighbor count matching its number
    - Accept `Grid` and `gridSize` parameters
    - _Requirements: 2.2_
  - [x] 1.5 Add `isGridComplete` function to `src/client/lib/validation.ts`
    - Return true only when: all cells are filled, grid is balanced, no adjacent identical rows/columns, and all number constraints are satisfied
    - This is the new completion check replacing exact string comparison
    - _Requirements: 2.2_
  - [x] 1.6 Add `doesCellViolateConstraints` function to `src/client/lib/validation.ts`
    - Check whether a specific cell's current color violates any constraint
    - Check row/column balance (would exceed gridSize/2), adjacent row/column uniqueness, and number constraints for the cell and its numbered neighbors
    - Return true if the cell's color causes a constraint violation
    - _Requirements: 2.1_
  - [x] 1.7 Write unit tests for new validation functions
    - Test `countSameColorNeighbors` with corner, edge, and interior cells
    - Test `hasAdjacentIdenticalRows` with identical and non-identical adjacent rows
    - Test `hasAdjacentIdenticalColumns` with identical and non-identical adjacent columns
    - Test `numberConstraintsSatisfied` with valid and invalid number constraints
    - Test `isGridComplete` with valid complete grids, invalid grids, and partial grids
    - Test `doesCellViolateConstraints` with violating and non-violating cells
    - _Requirements: 2.1, 2.2, 3.1, 3.2_
  - [x] 1.8 Write property-based test for `isGridComplete` (Property 1)
    - **Property 1: Bug Condition - Valid Alternate Solutions Accepted as Complete**
    - Generate grids satisfying all constraints and verify `isGridComplete` returns true
    - Generate grids with at least one constraint violation and verify `isGridComplete` returns false
    - **Validates: Requirements 2.2**
  - [x] 1.9 Write property-based test for preservation (Property 3)
    - **Property 3: Preservation - Invalid Grids Still Rejected**
    - Generate random grids with known constraint violations (balance, adjacency, number) and verify `isGridComplete` returns false
    - **Validates: Requirements 3.1, 3.2**

- [x] 2. Update completion detection in `App.svelte`
  - [x] 2.1 Replace exact string comparison with `isGridComplete` in `handleCellChange`
    - Import `isGridComplete` from `validation.ts`
    - Replace `if (boardString === puzzleSolution)` with `if (isGridComplete(grid, gridSize))`
    - The grid passed to `isGridComplete` must include number data from the puzzle
    - _Requirements: 2.2_
  - [x] 2.2 Ensure number data is available in the grid for constraint checking
    - When deserializing the grid, preserve number data on locked cells so `isGridComplete` can check number constraints
    - Verify that `deserializeGrid` already includes numbers from the puzzle numbers string
    - _Requirements: 2.2_

- [x] 3. Update mistake tracking in `mistakes.ts`
  - [x] 3.1 Replace solution-string comparison with constraint-based checking
    - Remove the `solution` module-level variable and solution-string comparison logic
    - Instead of comparing against `solution[solutionIndex]`, use `doesCellViolateConstraints` to check if the cell's color violates any constraint
    - Update `onCellChange` to accept the full grid and puzzle numbers for constraint checking
    - _Requirements: 2.1_
  - [x] 3.2 Update `setSolution` to `setPuzzleData` accepting numbers string
    - Change the function signature to accept puzzle numbers and grid size (no longer needs solution string)
    - Store numbers string for use in constraint checking
    - _Requirements: 2.1_
  - [x] 3.3 Update all callers of `setSolution` in `App.svelte`
    - Replace `setSolution(data.puzzle.solution, data.puzzle.gridSize)` with `setPuzzleData(data.puzzle.numbers, data.puzzle.gridSize)` in `loadGame`, `handleNextChallenge`, `handleRestart`, and `handleGridSizeChange`
    - _Requirements: 2.1_
  - [x] 3.4 Write unit tests for updated mistake tracking
    - Test that a cell matching a valid alternate solution is NOT flagged as a mistake
    - Test that a cell violating a constraint IS still flagged as a mistake
    - Test that `resetMistakes` clears all state correctly
    - _Requirements: 2.1, 3.1_
  - [x] 3.5 Write property-based test for mistake tracking (Property 2)
    - **Property 2: Bug Condition - Valid Cells Not Flagged as Mistakes**
    - Generate cell placements that don't violate any constraint and verify they are not flagged
    - **Validates: Requirements 2.1**

- [x] 4. Audit and test generator's `countSolutions` pruning
  - [x] 4.1 Write targeted tests for `couldBeValid` with multi-solution grids
    - Construct a puzzle grid with a known X-wing pattern (2 valid solutions)
    - Verify `countSolutions` returns 2 for this grid
    - Construct a puzzle with a known unique solution and verify `countSolutions` returns 1
    - _Requirements: 2.3, 3.3_
  - [x] 4.2 Write property-based test for generator uniqueness (Property 4)
    - **Property 4: Preservation - Unique Puzzle Generation Unchanged**
    - Generate puzzles via `generatePuzzle` and verify each has exactly 1 solution via `countSolutions`
    - **Validates: Requirements 3.3**
  - [x] 4.3 Fix `couldBeValid` if tests reveal pruning issues
    - If 4.1 reveals that `countSolutions` undercounts, identify and fix the overly aggressive pruning condition
    - If tests pass, no changes needed — document that pruning is correct
    - _Requirements: 2.3_

- [x] 5. Checkpoint — Verify all tests pass
  - Run `bun run test` and `bun run type-check`
  - Ensure zero test failures and zero type errors
  - Verify that existing generator tests still pass
  - Verify that existing validation tests still pass

## Notes

- Each task references specific requirements from `bugfix.md` for traceability
- Property tests use fast-check (already a project dependency) for property-based testing
- The client-side constraint functions mirror the server-side implementations in `generator.ts` but are kept separate to avoid importing server code into the client bundle
- The `puzzleSolution` field in `SerializedPuzzle` is kept for backward compatibility but is no longer used for client-side completion detection
- Run `bun run test` after each implementation task per the TDD workflow
