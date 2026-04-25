# Unique Solution Validation Bugfix Design

## Overview

The Urjo puzzle game incorrectly rejects valid alternate solutions. The bug has three components: (1) `mistakes.ts` compares each cell against a single stored solution string, flagging valid alternate placements as mistakes; (2) `App.svelte` uses exact string match (`boardString === puzzleSolution`) for completion detection, so valid alternate solutions are never recognized; (3) the generator's `countSolutions` function may have overly aggressive pruning in `couldBeValid`, allowing non-unique puzzles to slip through the safety net.

The fix replaces single-solution comparison with full constraint validation on the client side, and audits the generator's pruning logic to ensure correctness.

## Glossary

- **Bug_Condition (C)**: The condition where a player's grid satisfies all puzzle constraints but differs from the single stored solution string — causing false mistake flags and failed completion detection
- **Property (P)**: Any grid that satisfies all constraints (balance, adjacency uniqueness, number constraints) SHALL be accepted as complete, and cells consistent with at least one valid solution SHALL NOT be flagged as mistakes
- **Preservation**: Grids that violate constraints must still be rejected; mistake detection for genuinely wrong cells must still work; unique puzzles must continue to generate and validate normally
- **`countSolutions`**: The brute-force solver in `generator.ts` that enumerates valid solutions for a puzzle grid, used as a safety net to verify uniqueness
- **`couldBeValid`**: The pruning function in `generator.ts` used by `countSolutions` to skip branches that cannot lead to valid solutions
- **`validateGrid`**: The client-side function in `validation.ts` that currently only checks row/column balance violations
- **X-wing pattern**: A grid configuration where two pairs of cells can be swapped (e.g., swapping colors in a 2×2 sub-pattern) without violating any constraint, creating multiple valid solutions
- **Constraint set**: The full set of Urjo rules — (1) each row/column has exactly gridSize/2 red and gridSize/2 blue, (2) no adjacent identical rows/columns, (3) number cells match their same-color neighbor count

## Bug Details

### Bug Condition

The bug manifests when a puzzle has multiple valid solutions (e.g., an X-wing pattern) and the player fills in a valid alternate solution that differs from the single stored solution string. The `mistakes.ts` store compares each cell against the stored solution character-by-character, and `App.svelte` checks `serializeGrid(grid) === puzzleSolution` for completion.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { currentGrid: Grid, puzzle: SerializedPuzzle, gridSize: number }
  OUTPUT: boolean

  LET playerColors = serializeGrid(input.currentGrid)
  LET storedSolution = input.puzzle.solution
  LET numbersGrid = applyNumbers(input.currentGrid, input.puzzle.numbers)

  RETURN isBalanced(numbersGrid, input.gridSize)
         AND NOT hasAdjacentIdenticalRows(numbersGrid, input.gridSize)
         AND NOT hasAdjacentIdenticalColumns(numbersGrid, input.gridSize)
         AND numberConstraintsSatisfied(numbersGrid, input.gridSize)
         AND playerColors ≠ storedSolution
END FUNCTION
```

### Examples

- **4×4 X-wing**: A puzzle where cells (0,2), (0,3), (1,2), (1,3) form a 2×2 block that can be red-blue/blue-red or blue-red/red-blue without violating any constraint. The stored solution has one arrangement; the player fills the other. Result: cells flagged as mistakes, puzzle never completes.
- **6×6 alternate solution**: A larger grid where removing enough clues leaves two valid completions. The player finds the non-stored one. Result: 4+ cells flagged as mistakes despite a fully valid grid.
- **Correct unique puzzle**: A puzzle with only one valid solution. The player fills it correctly. Result: works fine (no bug). The player fills it incorrectly. Result: correctly flagged (no bug).
- **Edge case — partial grid**: A player has filled some cells correctly (matching stored solution) and some with valid alternates. The mistake tracker flags the alternate cells even though they're part of a valid solution.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Mouse/tap interactions with cells must continue to cycle colors (null → blue → red → null)
- Locked (clue) cells must remain unmodifiable
- Server-side completion reporting (`/api/game/complete`) must continue to receive timeTaken and mistakes
- Puzzle generation for truly unique puzzles must continue to work identically
- The existing row/column balance violation highlighting in `validateGrid` must continue to work
- Streak tracking, coin rewards, and all economy features must remain unchanged

**Scope:**
All inputs where the player's grid does NOT satisfy all constraints should be completely unaffected by this fix. This includes:
- Grids with row/column balance violations (more than gridSize/2 of one color)
- Grids with adjacent identical rows or columns
- Grids where number constraints are not met
- Partially filled grids (cells with null color)

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **Single-solution completion check in `App.svelte`**: Line `if (boardString === puzzleSolution)` performs an exact string comparison. This is fundamentally wrong for puzzles with multiple valid solutions — it should check all constraints instead.

2. **Single-solution mistake tracking in `mistakes.ts`**: The `onCellChange` function compares each cell's color against `solution[solutionIndex]`. For puzzles with multiple valid solutions, a cell that differs from the stored solution may still be correct in an alternate valid solution. Mistake tracking should instead check whether the cell's color violates any constraint.

3. **Potentially aggressive pruning in `couldBeValid`**: The `couldBeValid` function in `generator.ts` checks number constraints for the placed cell and all 8 neighbors. If the pruning logic has an off-by-one or overly strict check, it could prune valid branches, causing `countSolutions` to undercount and allow non-unique puzzles through the safety net. However, code review suggests the pruning logic looks correct — the `sameCount > checkCell.number` and `sameCount + unfilledCount < checkCell.number` checks are standard. This hypothesis needs validation through testing.

4. **Missing constraint checks in client-side `validation.ts`**: Currently only checks row/column balance. Does not check adjacent row/column uniqueness or number constraints. These checks are needed for both completion detection and constraint-based mistake tracking.

## Correctness Properties

Property 1: Bug Condition - Valid Alternate Solutions Accepted as Complete

_For any_ fully-filled grid where all constraints are satisfied (isBalanced, no adjacent identical rows/columns, all number constraints met), the completion check SHALL recognize the puzzle as complete, regardless of whether the serialized grid matches the stored solution string.

**Validates: Requirements 2.2**

Property 2: Bug Condition - Valid Cells Not Flagged as Mistakes

_For any_ cell placement where the cell's color does not violate any constraint (row/column balance, adjacency uniqueness, number constraints for neighboring numbered cells), the mistake tracker SHALL NOT flag that cell as a mistake.

**Validates: Requirements 2.1**

Property 3: Preservation - Invalid Grids Still Rejected

_For any_ fully-filled grid where at least one constraint is violated (balance, adjacency uniqueness, or number constraints), the completion check SHALL NOT recognize the puzzle as complete, preserving the existing rejection behavior.

**Validates: Requirements 3.1, 3.2**

Property 4: Preservation - Unique Puzzle Generation Unchanged

_For any_ puzzle produced by `generatePuzzle`, the puzzle SHALL have exactly one valid solution as verified by `countSolutions`, preserving the existing uniqueness guarantee for correctly generated puzzles.

**Validates: Requirements 3.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/client/lib/validation.ts`

**Function**: `validateGrid` (extend) + new functions

**Specific Changes**:
1. **Add `isGridComplete` function**: A new pure function that checks all constraints — balance, no adjacent identical rows/columns, number constraints, and all cells filled. This replaces the exact string comparison for completion detection.
2. **Add `hasAdjacentIdenticalRows` function**: Client-side implementation checking if any two adjacent rows have identical color patterns.
3. **Add `hasAdjacentIdenticalColumns` function**: Client-side implementation checking if any two adjacent columns have identical color patterns.
4. **Add `numberConstraintsSatisfied` function**: Client-side implementation checking that every numbered cell's same-color neighbor count matches its number.
5. **Add `countSameColorNeighbors` function**: Client-side helper counting same-color neighbors in all 8 directions.
6. **Add `doesCellViolateConstraints` function**: Checks whether a specific cell's color violates any constraint — used by mistake tracking to determine if a cell placement is genuinely wrong.

**File**: `src/client/App.svelte`

**Function**: `handleCellChange`

**Specific Changes**:
1. **Replace string comparison with constraint check**: Replace `if (boardString === puzzleSolution)` with `if (isGridComplete(grid, gridSize))` using the new validation function.
2. **Remove `puzzleSolution` dependency for completion**: The completion check no longer needs the stored solution string.

**File**: `src/client/stores/mistakes.ts`

**Function**: `onCellChange`, `onPuzzleComplete`

**Specific Changes**:
1. **Replace solution-string comparison with constraint checking**: Instead of comparing against `solution[solutionIndex]`, check whether the cell's color violates any constraint using `doesCellViolateConstraints`.
2. **Remove `solution` and `gridSize` module state**: The mistake tracker no longer needs the stored solution string. Instead, it receives the full grid and puzzle numbers to check constraints.
3. **Update `setSolution` to `setPuzzleData`**: Accept puzzle numbers string instead of solution string, since constraint checking needs number data.

**File**: `src/server/lib/generator.ts`

**Function**: `couldBeValid`

**Specific Changes**:
1. **Audit and test pruning logic**: Write targeted tests with known multi-solution grids to verify `couldBeValid` doesn't prune valid branches. If bugs are found, fix the pruning conditions.
2. **No changes expected if pruning is correct**: The code review suggests the pruning logic is sound, but this needs empirical validation.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Construct grids with known alternate valid solutions and verify that the current code incorrectly rejects them. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Completion string mismatch test**: Create a valid grid that satisfies all constraints but serializes differently from the stored solution. Verify `boardString === puzzleSolution` returns false (will fail on unfixed code — demonstrates the bug).
2. **Mistake tracking false positive test**: Set a solution string, then place a cell color that differs from the solution but satisfies all constraints. Verify `onCellChange` incorrectly flags it as a mistake (will fail on unfixed code).
3. **countSolutions accuracy test**: Construct a puzzle grid with a known X-wing pattern that has exactly 2 solutions. Verify `countSolutions` returns 2 (may fail on unfixed code if pruning is too aggressive).
4. **Validation completeness test**: Create a valid complete grid and verify `validateGrid` alone is insufficient to detect completion (it only checks balance, not adjacency or numbers).

**Expected Counterexamples**:
- Valid alternate solutions are rejected by exact string comparison
- Cells matching valid alternate solutions are flagged as mistakes
- Possible causes: single-solution string comparison, missing constraint checks in validation.ts

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := isGridComplete(input.currentGrid, input.gridSize)
  ASSERT result = true
  
  FOR ALL cell IN input.currentGrid WHERE cell.color ≠ storedSolution[cell.index] DO
    ASSERT doesCellViolateConstraints(cell, input.currentGrid, input.gridSize) = false
  END FOR
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT isGridComplete_original(input) = isGridComplete_fixed(input)
  // Specifically:
  // - Grids violating balance are still rejected
  // - Grids with adjacent identical rows/columns are still rejected
  // - Grids with number constraint violations are still rejected
  // - Partially filled grids are still not marked complete
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for constraint-violating grids, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Balance violation preservation**: Observe that grids with too many red/blue in a row/column are rejected on unfixed code, then verify this continues after fix
2. **Adjacency violation preservation**: Observe that grids with adjacent identical rows/columns are rejected, then verify this continues after fix
3. **Number constraint violation preservation**: Observe that grids where numbered cells don't match neighbor counts are rejected, then verify this continues after fix
4. **Partial grid preservation**: Observe that partially filled grids are not marked complete, then verify this continues after fix

### Unit Tests

- Test `isGridComplete` with valid grids (returns true), invalid grids (returns false), and partially filled grids (returns false)
- Test `doesCellViolateConstraints` with cells that violate balance, adjacency, and number constraints
- Test `countSameColorNeighbors` client-side implementation matches server-side for various grid configurations
- Test `countSolutions` with constructed grids having known solution counts (1 and 2)
- Test that the new completion check in `App.svelte` accepts valid alternate solutions

### Property-Based Tests

- Generate random valid grids (satisfying all constraints) and verify `isGridComplete` returns true
- Generate random grids with at least one constraint violation and verify `isGridComplete` returns false
- Generate random cell placements and verify `doesCellViolateConstraints` correctly identifies violations
- Generate random puzzles via `generatePuzzle` and verify they have exactly 1 solution

### Integration Tests

- Test full game flow: load puzzle, fill in alternate valid solution, verify completion is detected
- Test mistake tracking: fill cells with valid alternate colors, verify no false mistake flags
- Test that server completion reporting still works when completion is detected via constraint checking
