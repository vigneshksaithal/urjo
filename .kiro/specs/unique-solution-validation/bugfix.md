# Bugfix Requirements Document

## Introduction

Players report that some puzzles have multiple valid solutions (particularly the "X-wing" pattern where two pairs of cells can be swapped without violating any constraint), but the game only accepts one specific solution. This manifests in two ways: (1) cells filled with a valid alternate color are incorrectly flagged as mistakes, and (2) a fully valid alternate solution is never recognized as complete. The root cause is twofold — the puzzle generator may occasionally produce non-unique puzzles due to a bug in the `countSolutions` brute-force checker (its `couldBeValid` pruning may be too aggressive, causing it to miss valid alternate solutions and incorrectly report 1 solution), and the client-side validation compares against a single stored solution string rather than checking all puzzle constraints.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a puzzle has multiple valid solutions (e.g., an X-wing pattern where two pairs of cells can be swapped) AND the player fills in a valid alternate solution THEN the system flags those cells as mistakes via per-cell comparison against the single stored solution string in `mistakes.ts`

1.2 WHEN a puzzle has multiple valid solutions AND the player completes the grid with a valid alternate arrangement that satisfies all constraints (balance, adjacency uniqueness, number constraints) THEN the system does not recognize the puzzle as complete because `App.svelte` performs an exact string comparison (`boardString === puzzleSolution`) against the single stored solution

1.3 WHEN the puzzle generator removes clues during `generateClues` AND the `countSolutions` brute-force checker's `couldBeValid` pruning is too aggressive THEN the system may incorrectly count only 1 solution for a puzzle that actually has multiple valid solutions, allowing non-unique puzzles to pass the safety net

### Expected Behavior (Correct)

2.1 WHEN a player fills a cell with a color that satisfies all puzzle constraints (row/column balance, adjacent line uniqueness, and number constraints) in any valid solution THEN the system SHALL NOT flag that cell as a mistake

2.2 WHEN a player completes the entire grid with colors that satisfy all puzzle constraints (every row and column has exactly gridSize/2 red and gridSize/2 blue, no adjacent identical rows or columns, and all number constraints are met) THEN the system SHALL recognize the puzzle as complete regardless of whether the solution matches the single stored solution string

2.3 WHEN the puzzle generator runs `countSolutions` to verify uniqueness THEN the system SHALL correctly enumerate all valid solutions without pruning valid branches, ensuring only truly unique puzzles pass the safety net

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a player fills a cell with a color that genuinely violates a puzzle constraint (e.g., exceeds the row/column color balance limit) THEN the system SHALL CONTINUE TO flag that cell as a mistake

3.2 WHEN a player completes the grid but the arrangement violates one or more puzzle constraints THEN the system SHALL CONTINUE TO not recognize the puzzle as complete

3.3 WHEN the puzzle generator produces a puzzle with a truly unique solution THEN the system SHALL CONTINUE TO generate and accept that puzzle normally

3.4 WHEN a player interacts with locked (clue) cells THEN the system SHALL CONTINUE TO prevent modification of those cells

3.5 WHEN a puzzle is completed correctly THEN the system SHALL CONTINUE TO report the completion to the server with the correct time and mistake count

---

## Bug Condition (Formal)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type PlayerMove (a cell placement on a puzzle grid)
  OUTPUT: boolean

  // The bug triggers when the puzzle has multiple valid solutions
  // and the player's choice differs from the stored solution but
  // still satisfies all constraints
  LET puzzle = X.puzzle
  LET playerGrid = X.currentGrid
  LET storedSolution = X.storedSolution

  // A move triggers the bug when:
  // 1. The player's grid satisfies all constraints, AND
  // 2. The serialized grid does not match the stored solution string
  RETURN satisfiesAllConstraints(playerGrid, puzzle) 
     AND serialize(playerGrid) ≠ storedSolution
END FUNCTION
```

### Fix Checking Property

```pascal
// Property: Fix Checking — Valid alternate solutions are accepted
FOR ALL X WHERE isBugCondition(X) DO
  result ← validateCompletion'(X.currentGrid, X.puzzle)
  ASSERT result.isComplete = true
  ASSERT result.mistakesOnValidCells = 0
END FOR
```

### Preservation Checking Property

```pascal
// Property: Preservation Checking — Invalid solutions are still rejected
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
  // Specifically:
  // - Grids that violate constraints are still not marked complete
  // - Cells that violate constraints are still flagged as mistakes
  // - Unique puzzles continue to work identically
END FOR
```
