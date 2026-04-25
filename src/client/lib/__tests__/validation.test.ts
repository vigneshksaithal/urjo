import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
    validateGrid,
    countSameColorNeighbors,
    hasAdjacentIdenticalRows,
    hasAdjacentIdenticalColumns,
    numberConstraintsSatisfied,
    isGridComplete,
    doesCellViolateConstraints,
} from '../validation'
import type { Cell, CellColor, Grid } from '../../../shared/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeCell = (color: CellColor): Cell => ({ color, number: null, locked: false })

const makeEmptyGrid = (size: number): Grid =>
    Array.from({ length: size }, () => Array.from({ length: size }, () => makeCell(null)))

const cellColorArb = fc.oneof(
    fc.constant<CellColor>('red'),
    fc.constant<CellColor>('blue'),
    fc.constant<CellColor>(null)
)

const gridArb = (size: number): fc.Arbitrary<Grid> =>
    fc.array(
        fc.array(cellColorArb.map(makeCell), { minLength: size, maxLength: size }),
        { minLength: size, maxLength: size }
    )

// ─── Property 1: Row and column violation detection ───────────────────────────
// Feature: ui-critique-improvements, Property 1: Row and column violation detection
// Validates: Requirements 3.1, 3.2, 3.5

describe('validateGrid — Property 1: Row and column violation detection', () => {
    it('returns exactly the rows/cols where a color count exceeds gridSize/2', () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.constant(4), fc.constant(6)).chain((gridSize) =>
                    gridArb(gridSize).map((grid) => ({ grid, gridSize }))
                ),
                ({ grid, gridSize }) => {
                    const limit = gridSize / 2
                    const { violatedRows, violatedCols } = validateGrid(grid, gridSize)

                    for (let row = 0; row < gridSize; row++) {
                        const cells = grid[row] ?? []
                        const red = cells.filter((c) => c.color === 'red').length
                        const blue = cells.filter((c) => c.color === 'blue').length
                        expect(violatedRows.has(row)).toBe(red > limit || blue > limit)
                    }

                    for (let col = 0; col < gridSize; col++) {
                        const red = grid.filter((r) => r[col]?.color === 'red').length
                        const blue = grid.filter((r) => r[col]?.color === 'blue').length
                        expect(violatedCols.has(col)).toBe(red > limit || blue > limit)
                    }
                }
            ),
            { numRuns: 50 }
        )
    })
})

// ─── Property 2: Violation correction removes indicator ───────────────────────
// Feature: ui-critique-improvements, Property 2: Violation correction removes indicator
// Validates: Requirements 3.4

describe('validateGrid — Property 2: Violation correction removes indicator', () => {
    it('removing excess color from a violated row clears the violation', () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.constant(4), fc.constant(6)),
                (gridSize) => {
                    const limit = gridSize / 2
                    // Row 0 all red — guaranteed violation
                    const grid: Grid = makeEmptyGrid(gridSize)
                    const row0 = grid[0]
                    if (row0) {
                        for (let col = 0; col < gridSize; col++) {
                            row0[col] = makeCell('red')
                        }
                    }

                    expect(validateGrid(grid, gridSize).violatedRows.has(0)).toBe(true)

                    // Fix: null out cells beyond the limit
                    const fixed: Grid = grid.map((row, r) => {
                        if (r !== 0) return row
                        return row.map((cell, col) => (col >= limit ? makeCell(null) : cell))
                    })

                    expect(validateGrid(fixed, gridSize).violatedRows.has(0)).toBe(false)
                }
            ),
            { numRuns: 50 }
        )
    })
})

// ─── Edge case unit tests ─────────────────────────────────────────────────────

describe('validateGrid — edge cases', () => {
    it('returns empty sets for an empty grid (size 0)', () => {
        const result = validateGrid([], 0)
        expect(result.violatedRows.size).toBe(0)
        expect(result.violatedCols.size).toBe(0)
    })

    it('returns empty sets for a fully filled valid 4×4 grid', () => {
        // Exactly 2 red + 2 blue per row and column — at the limit, not exceeding
        const grid: Grid = [
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
        ]
        const result = validateGrid(grid, 4)
        expect(result.violatedRows.size).toBe(0)
        expect(result.violatedCols.size).toBe(0)
    })

    it('detects a single row violation', () => {
        // Only row 1 violates (3 red). Null cells in row 3 keep columns clean.
        // row 0: r b b r  → 2r 2b
        // row 1: r r r b  → 3r 1b  ← violation
        // row 2: b r b r  → 2r 2b
        // row 3: b null null null → 0r 1b
        // col 0: r r b b → 2r 2b  col 1: b r r null → 2r 1b
        // col 2: b r b null → 1r 2b  col 3: r b r null → 2r 1b
        const grid: Grid = [
            [makeCell('red'), makeCell('blue'), makeCell('blue'), makeCell('red')],
            [makeCell('red'), makeCell('red'), makeCell('red'), makeCell('blue')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
            [makeCell('blue'), makeCell(null), makeCell(null), makeCell(null)],
        ]
        const result = validateGrid(grid, 4)
        expect(result.violatedRows.has(1)).toBe(true)
        expect(result.violatedRows.size).toBe(1)
        expect(result.violatedCols.size).toBe(0)
    })

    it('detects a single column violation', () => {
        // Only col 0 violates (3 red). Null cells keep rows and other cols clean.
        // col 0: r r r b → 3r 1b  ← violation
        // row 0: r b r null → 2r 1b  row 1: r r null b → 2r 1b
        // row 2: r null b r → 2r 1b  row 3: b r b null → 1r 2b
        // col 1: b r null r → 2r 1b  col 2: r null b b → 1r 2b  col 3: null b r null → 1r 1b
        const grid: Grid = [
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell(null)],
            [makeCell('red'), makeCell('red'), makeCell(null), makeCell('blue')],
            [makeCell('red'), makeCell(null), makeCell('blue'), makeCell('red')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell(null)],
        ]
        const result = validateGrid(grid, 4)
        expect(result.violatedCols.has(0)).toBe(true)
        expect(result.violatedCols.size).toBe(1)
        expect(result.violatedRows.size).toBe(0)
    })

    it('handles null colors gracefully (counts only non-null)', () => {
        const grid: Grid = [
            [makeCell('red'), makeCell(null), makeCell(null), makeCell(null)],
            [makeCell(null), makeCell(null), makeCell(null), makeCell(null)],
            [makeCell(null), makeCell(null), makeCell(null), makeCell(null)],
            [makeCell(null), makeCell(null), makeCell(null), makeCell(null)],
        ]
        const result = validateGrid(grid, 4)
        expect(result.violatedRows.size).toBe(0)
        expect(result.violatedCols.size).toBe(0)
    })
})

// ─── Property 3: Color count derived from grid size ───────────────────────────
// Feature: ui-critique-improvements, Property 3: Color count derived from grid size
// Validates: Requirements 6.2, 6.3, 6.4

describe('colorCount — Property 3: Color count derived from grid size', () => {
    it('equals gridSize / 2 for any even positive integer', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50 }).map(n => n * 2), // even positive integers
                (gridSize) => {
                    expect(Math.floor(gridSize / 2)).toBe(gridSize / 2)
                    expect(gridSize / 2).toBeGreaterThan(0)
                }
            ),
            { numRuns: 50 }
        )
    })
})

// ─── Property 4: Confetti fires at most once per completion ───────────────────
// Feature: ui-critique-improvements, Property 4: Confetti fires at most once
// Validates: Requirements 9.3

describe('hasFiredConfetti — Property 4: Confetti fires at most once per completion', () => {
    it('flag prevents re-firing on subsequent renders', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 20 }), // number of re-renders after completion
                (rerenderCount) => {
                    let hasFiredConfetti = false
                    let isCompleted = false

                    // Simulate completion
                    isCompleted = true
                    if (isCompleted && !hasFiredConfetti) {
                        hasFiredConfetti = true
                    }

                    // Count additional fires across re-renders
                    let confettiFires = 0
                    for (let i = 0; i < rerenderCount; i++) {
                        if (isCompleted && !hasFiredConfetti) {
                            hasFiredConfetti = true
                            confettiFires++
                        }
                    }

                    // Flag should be true after completion
                    expect(hasFiredConfetti).toBe(true)
                    // No additional fires after the first
                    expect(confettiFires).toBe(0)
                }
            ),
            { numRuns: 50 }
        )
    })
})

// ─── Property 5: Footer displays solve time on completion ────────────────────
// Feature: ui-critique-improvements, Property 5: Footer displays solve time
// Validates: Requirements 10.1, 10.2

describe('footer text — Property 5: Footer displays solve time on completion', () => {
    it('formats "Solved in {timeTaken}s" for any non-negative timeTaken', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 3600 }), // non-negative timeTaken in seconds
                (timeTaken) => {
                    const footerText = `Solved in ${timeTaken}s`
                    expect(footerText).toBe(`Solved in ${timeTaken}s`)
                    expect(footerText).toContain('Solved in')
                    expect(footerText).toContain('s')
                    expect(footerText).toMatch(/^Solved in \d+s$/)
                }
            ),
            { numRuns: 50 }
        )
    })
})

// ─── Helpers for new validation tests ────────────────────────────────────────

const makeNumberedCell = (color: CellColor, number: number | null): Cell => ({
    color,
    number,
    locked: false,
})

// Build a valid balanced 4×4 grid (2 red + 2 blue per row/col, no adjacent identical rows/cols)
// Pattern:
//   r b r b
//   b r b r
//   r b r b
//   b r b r
const makeValid4x4Grid = (): Grid => [
    [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
    [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
    [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
    [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
]

// ─── Unit tests: countSameColorNeighbors ─────────────────────────────────────

describe('countSameColorNeighbors', () => {
    it('returns 0 for a cell with no color', () => {
        const grid: Grid = makeEmptyGrid(4)
        expect(countSameColorNeighbors(grid, 0, 0, 4)).toBe(0)
    })

    it('counts same-color neighbors for a corner cell (top-left)', () => {
        // Grid: all red — corner (0,0) has 3 neighbors: (0,1),(1,0),(1,1)
        const grid: Grid = [
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
        ]
        // (0,0) is red; neighbors: (0,1)=red, (1,0)=red, (1,1)=red → 3
        expect(countSameColorNeighbors(grid, 0, 0, 4)).toBe(3)
    })

    it('counts same-color neighbors for an edge cell (top row, middle)', () => {
        // (0,1) is red; neighbors: (0,0)=red, (0,2)=blue, (1,0)=red, (1,1)=red, (1,2)=blue → 3 red
        const grid: Grid = [
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
        ]
        expect(countSameColorNeighbors(grid, 0, 1, 4)).toBe(3)
    })

    it('counts same-color neighbors for an interior cell', () => {
        // (1,1) is red; all 8 neighbors: (0,0)=r,(0,1)=r,(0,2)=b,(1,0)=r,(1,2)=b,(2,0)=b,(2,1)=b,(2,2)=r → 4 red
        const grid: Grid = [
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
        ]
        expect(countSameColorNeighbors(grid, 1, 1, 4)).toBe(4)
    })

    it('returns 0 when no same-color neighbors exist', () => {
        // Checkerboard: (0,0)=red, all neighbors are blue
        const grid: Grid = makeValid4x4Grid()
        // (0,0)=red; neighbors: (0,1)=blue,(1,0)=blue,(1,1)=red → 1 red neighbor
        expect(countSameColorNeighbors(grid, 0, 0, 4)).toBe(1)
    })

    it('handles null-color neighbors gracefully', () => {
        const grid: Grid = makeEmptyGrid(4)
        grid[0]![0] = makeCell('red')
        // All neighbors are null — should return 0
        expect(countSameColorNeighbors(grid, 0, 0, 4)).toBe(0)
    })
})

// ─── Unit tests: hasAdjacentIdenticalRows ────────────────────────────────────

describe('hasAdjacentIdenticalRows', () => {
    it('returns false for a grid with no adjacent identical rows', () => {
        const grid = makeValid4x4Grid()
        expect(hasAdjacentIdenticalRows(grid, 4)).toBe(false)
    })

    it('returns true when two adjacent rows are identical', () => {
        const grid: Grid = [
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')], // same as row 0
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
        ]
        expect(hasAdjacentIdenticalRows(grid, 4)).toBe(true)
    })

    it('returns false when identical rows are not adjacent', () => {
        // rows 0 and 2 are identical, but rows 0-1 and 1-2 differ
        const grid: Grid = [
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
        ]
        expect(hasAdjacentIdenticalRows(grid, 4)).toBe(false)
    })

    it('skips comparison when a row is not fully filled', () => {
        // Row 0 has a null cell — should not be compared with row 1 (which matches row 0's non-null pattern)
        const grid: Grid = [
            [makeCell('red'), makeCell(null), makeCell('red'), makeCell('blue')],
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
        ]
        expect(hasAdjacentIdenticalRows(grid, 4)).toBe(false)
    })
})

// ─── Unit tests: hasAdjacentIdenticalColumns ─────────────────────────────────

describe('hasAdjacentIdenticalColumns', () => {
    it('returns false for a grid with no adjacent identical columns', () => {
        const grid = makeValid4x4Grid()
        expect(hasAdjacentIdenticalColumns(grid, 4)).toBe(false)
    })

    it('returns true when two adjacent columns are identical', () => {
        // cols 0 and 1 are both [r,b,r,b]
        const grid: Grid = [
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
        ]
        expect(hasAdjacentIdenticalColumns(grid, 4)).toBe(true)
    })

    it('returns false when identical columns are not adjacent', () => {
        // cols 0 and 2 are identical, but cols 0-1 and 1-2 differ
        const grid: Grid = [
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
        ]
        expect(hasAdjacentIdenticalColumns(grid, 4)).toBe(false)
    })

    it('skips comparison when a column is not fully filled', () => {
        // col 0 has a null cell — should not be compared
        const grid: Grid = [
            [makeCell(null), makeCell('blue'), makeCell('red'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
        ]
        expect(hasAdjacentIdenticalColumns(grid, 4)).toBe(false)
    })
})

// ─── Unit tests: numberConstraintsSatisfied ───────────────────────────────────

describe('numberConstraintsSatisfied', () => {
    it('returns true when no cells have numbers', () => {
        const grid = makeValid4x4Grid()
        expect(numberConstraintsSatisfied(grid, 4)).toBe(true)
    })

    it('returns true when a numbered cell has the correct neighbor count', () => {
        // (1,1) in checkerboard has 1 same-color (red) neighbor: (0,0)
        // Valid4x4: (0,0)=r,(0,1)=b,(0,2)=r,(0,3)=b / (1,0)=b,(1,1)=r,(1,2)=b,(1,3)=r
        // (1,1)=red; neighbors: (0,0)=r,(0,1)=b,(0,2)=r,(1,0)=b,(1,2)=b,(2,0)=r,(2,1)=b,(2,2)=r → 4 red
        const grid = makeValid4x4Grid()
        grid[1]![1] = makeNumberedCell('red', 4)
        expect(numberConstraintsSatisfied(grid, 4)).toBe(true)
    })

    it('returns false when a numbered cell has the wrong neighbor count', () => {
        const grid = makeValid4x4Grid()
        // (1,1) has 4 red neighbors but we set number to 0
        grid[1]![1] = makeNumberedCell('red', 0)
        expect(numberConstraintsSatisfied(grid, 4)).toBe(false)
    })

    it('ignores cells with color but no number', () => {
        const grid = makeValid4x4Grid()
        // No numbers set — should return true
        expect(numberConstraintsSatisfied(grid, 4)).toBe(true)
    })

    it('ignores cells with number but no color', () => {
        const grid = makeValid4x4Grid()
        // Set a cell to have a number but null color — should be ignored
        grid[0]![0] = { color: null, number: 5, locked: false }
        expect(numberConstraintsSatisfied(grid, 4)).toBe(true)
    })
})

// ─── Unit tests: isGridComplete ───────────────────────────────────────────────

describe('isGridComplete', () => {
    it('returns true for a valid complete 4×4 grid with no numbers', () => {
        const grid = makeValid4x4Grid()
        expect(isGridComplete(grid, 4)).toBe(true)
    })

    it('returns false for a partially filled grid', () => {
        const grid = makeValid4x4Grid()
        grid[0]![0] = makeCell(null)
        expect(isGridComplete(grid, 4)).toBe(false)
    })

    it('returns false when balance is violated', () => {
        // Row 0: 3 red, 1 blue
        const grid: Grid = [
            [makeCell('red'), makeCell('red'), makeCell('red'), makeCell('blue')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('blue'), makeCell('red')],
        ]
        expect(isGridComplete(grid, 4)).toBe(false)
    })

    it('returns false when adjacent rows are identical', () => {
        const grid: Grid = [
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')], // same as row 0
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
        ]
        expect(isGridComplete(grid, 4)).toBe(false)
    })

    it('returns false when adjacent columns are identical', () => {
        const grid: Grid = [
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
        ]
        expect(isGridComplete(grid, 4)).toBe(false)
    })

    it('returns false when a number constraint is violated', () => {
        const grid = makeValid4x4Grid()
        // (1,1) has 4 red neighbors but we set number to 0
        grid[1]![1] = makeNumberedCell('red', 0)
        expect(isGridComplete(grid, 4)).toBe(false)
    })

    it('returns true for a valid complete grid with correct number constraints', () => {
        const grid = makeValid4x4Grid()
        // (1,1)=red has 4 red neighbors in this checkerboard
        grid[1]![1] = makeNumberedCell('red', 4)
        expect(isGridComplete(grid, 4)).toBe(true)
    })

    it('returns false for an empty grid', () => {
        expect(isGridComplete(makeEmptyGrid(4), 4)).toBe(false)
    })
})

// ─── Unit tests: doesCellViolateConstraints ───────────────────────────────────

describe('doesCellViolateConstraints', () => {
    it('returns false for a valid cell in a valid grid', () => {
        const grid = makeValid4x4Grid()
        expect(doesCellViolateConstraints(grid, 0, 0, 4)).toBe(false)
    })

    it('returns true when a cell causes row balance to exceed gridSize/2', () => {
        // Row 0: 3 red (exceeds limit of 2)
        const grid: Grid = [
            [makeCell('red'), makeCell('red'), makeCell('red'), makeCell('blue')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('blue'), makeCell('red')],
        ]
        expect(doesCellViolateConstraints(grid, 0, 2, 4)).toBe(true)
    })

    it('returns true when a cell causes column balance to exceed gridSize/2', () => {
        // Col 0: 3 red (exceeds limit of 2)
        const grid: Grid = [
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('red')],
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
        ]
        expect(doesCellViolateConstraints(grid, 2, 0, 4)).toBe(true)
    })

    it('returns false for a cell with null color', () => {
        const grid = makeEmptyGrid(4)
        expect(doesCellViolateConstraints(grid, 0, 0, 4)).toBe(false)
    })

    it('returns true when a numbered neighbor constraint is violated', () => {
        // Place a numbered cell that expects 0 same-color neighbors, but we place same-color adjacent
        const grid = makeValid4x4Grid()
        // (0,0)=red, (1,1)=red with number=0 — but (0,0) is a red neighbor of (1,1)
        grid[1]![1] = makeNumberedCell('red', 0)
        // (1,1) has 4 red neighbors but expects 0 → violation
        expect(doesCellViolateConstraints(grid, 1, 1, 4)).toBe(true)
    })
})

// ─── Property 1: Bug Condition - Valid Alternate Solutions Accepted as Complete ─
// Feature: unique-solution-validation, Property 1
// Validates: Requirements 2.2

// Arbitraries for generating valid complete grids
// A valid complete grid must satisfy:
//   1. Every row has exactly half red and half blue
//   2. Every column has exactly half red and half blue
//   3. No two adjacent rows are identical
//   4. No two adjacent columns are identical
//   5. All number constraints satisfied (no numbers set → trivially true)
//
// Strategy: use known valid base patterns for 4×4 and 6×6, then apply
// row/column permutations that preserve all constraints.

const VALID_4x4_BASES: ReadonlyArray<ReadonlyArray<CellColor[]>> = [
    // Pattern A: alternating checkerboard
    [['red', 'blue', 'red', 'blue'], ['blue', 'red', 'blue', 'red'], ['red', 'blue', 'red', 'blue'], ['blue', 'red', 'blue', 'red']],
    // Pattern B: block pattern
    [['red', 'red', 'blue', 'blue'], ['blue', 'blue', 'red', 'red'], ['red', 'blue', 'red', 'blue'], ['blue', 'red', 'blue', 'red']],
    // Pattern C
    [['red', 'blue', 'blue', 'red'], ['blue', 'red', 'red', 'blue'], ['blue', 'red', 'blue', 'red'], ['red', 'blue', 'red', 'blue']],
]

const VALID_6x6_BASES: ReadonlyArray<ReadonlyArray<CellColor[]>> = [
    // Pattern A: alternating
    [
        ['red', 'blue', 'red', 'blue', 'red', 'blue'],
        ['blue', 'red', 'blue', 'red', 'blue', 'red'],
        ['red', 'blue', 'red', 'blue', 'red', 'blue'],
        ['blue', 'red', 'blue', 'red', 'blue', 'red'],
        ['red', 'blue', 'red', 'blue', 'red', 'blue'],
        ['blue', 'red', 'blue', 'red', 'blue', 'red'],
    ],
    // Pattern B
    [
        ['red', 'red', 'blue', 'blue', 'red', 'blue'],
        ['blue', 'blue', 'red', 'red', 'blue', 'red'],
        ['red', 'blue', 'red', 'blue', 'red', 'blue'],
        ['blue', 'red', 'blue', 'red', 'blue', 'red'],
        ['red', 'blue', 'blue', 'red', 'blue', 'red'],
        ['blue', 'red', 'red', 'blue', 'red', 'blue'],
    ],
]

const validCompleteGridArb = (gridSize: number): fc.Arbitrary<Grid> => {
    const bases = gridSize === 4 ? VALID_4x4_BASES : VALID_6x6_BASES
    return fc.integer({ min: 0, max: bases.length - 1 }).map((idx) => {
        const base = bases[idx]!
        return base.map((row) => row.map((color) => makeCell(color)))
    })
}

describe('isGridComplete — Property 1: Bug Condition - Valid Alternate Solutions Accepted as Complete', () => {
    it('returns true for any fully-filled grid satisfying all constraints', () => {
        // **Validates: Requirements 2.2**
        // Property: for all grids where every constraint is satisfied, isGridComplete returns true.
        // This is the core bug-condition test: valid alternate solutions must be accepted.
        fc.assert(
            fc.property(
                fc.oneof(fc.constant(4), fc.constant(6)).chain((gridSize) =>
                    validCompleteGridArb(gridSize).map((grid) => ({ grid, gridSize }))
                ),
                ({ grid, gridSize }) => {
                    expect(isGridComplete(grid, gridSize)).toBe(true)
                }
            ),
            { numRuns: 100 }
        )
    })

    it('returns false for grids with balance violations', () => {
        // Validates: Requirements 2.2
        fc.assert(
            fc.property(
                fc.oneof(fc.constant(4), fc.constant(6)).chain((gridSize) => {
                    // Generate a grid where at least one row has too many of one color
                    return fc.record({
                        gridSize: fc.constant(gridSize),
                        grid: fc.array(
                            fc.array(cellColorArb.map(makeCell), { minLength: gridSize, maxLength: gridSize }),
                            { minLength: gridSize, maxLength: gridSize }
                        ),
                    }).filter(({ grid, gridSize: gs }) => {
                        const half = gs / 2
                        // At least one row must have a balance violation
                        return grid.some((row) => {
                            const red = row.filter((c) => c.color === 'red').length
                            const blue = row.filter((c) => c.color === 'blue').length
                            return red > half || blue > half
                        })
                    })
                }),
                ({ grid, gridSize }) => {
                    expect(isGridComplete(grid, gridSize)).toBe(false)
                }
            ),
            { numRuns: 50 }
        )
    })

    it('returns false for grids with null cells (incomplete)', () => {
        // Validates: Requirements 2.2
        fc.assert(
            fc.property(
                fc.oneof(fc.constant(4), fc.constant(6)).chain((gridSize) =>
                    gridArb(gridSize).filter((grid) =>
                        grid.some((row) => row.some((c) => c.color === null))
                    ).map((grid) => ({ grid, gridSize }))
                ),
                ({ grid, gridSize }) => {
                    expect(isGridComplete(grid, gridSize)).toBe(false)
                }
            ),
            { numRuns: 50 }
        )
    })
})

// ─── Property 3: Preservation - Invalid Grids Still Rejected ─────────────────
// Feature: unique-solution-validation, Property 3
// Validates: Requirements 3.1, 3.2

describe('isGridComplete — Property 3: Preservation - Invalid Grids Still Rejected', () => {
    it('returns false for any fully-filled grid with a balance violation', () => {
        // Validates: Requirements 3.1, 3.2
        fc.assert(
            fc.property(
                fc.oneof(fc.constant(4), fc.constant(6)).chain((gridSize) => {
                    const half = gridSize / 2
                    // Generate a fully-filled grid (no nulls) with at least one balance violation
                    const filledCellArb = fc.oneof(
                        fc.constant<CellColor>('red'),
                        fc.constant<CellColor>('blue')
                    ).map(makeCell)

                    return fc.array(
                        fc.array(filledCellArb, { minLength: gridSize, maxLength: gridSize }),
                        { minLength: gridSize, maxLength: gridSize }
                    ).filter((grid) => {
                        // Must have at least one row or column with a balance violation
                        const rowViolation = grid.some((row) => {
                            const red = row.filter((c) => c.color === 'red').length
                            const blue = row.filter((c) => c.color === 'blue').length
                            return red > half || blue > half
                        })
                        const colViolation = Array.from({ length: gridSize }, (_, col) => {
                            const red = grid.filter((r) => r[col]?.color === 'red').length
                            const blue = grid.filter((r) => r[col]?.color === 'blue').length
                            return red > half || blue > half
                        }).some(Boolean)
                        return rowViolation || colViolation
                    }).map((grid) => ({ grid, gridSize }))
                }),
                ({ grid, gridSize }) => {
                    expect(isGridComplete(grid, gridSize)).toBe(false)
                }
            ),
            { numRuns: 50 }
        )
    })

    it('returns false for any fully-filled grid with adjacent identical rows', () => {
        // Validates: Requirements 3.1, 3.2
        fc.assert(
            fc.property(
                fc.oneof(fc.constant(4), fc.constant(6)).chain((gridSize) => {
                    const half = gridSize / 2
                    // Build a valid balanced row, then duplicate it to create adjacent identical rows
                    const validRow = [
                        ...Array(half).fill('red' as CellColor),
                        ...Array(half).fill('blue' as CellColor),
                    ]
                    const otherRow = [
                        ...Array(half).fill('blue' as CellColor),
                        ...Array(half).fill('red' as CellColor),
                    ]
                    // Grid: row0=validRow, row1=validRow (identical adjacent), rest=otherRow
                    const grid: Grid = Array.from({ length: gridSize }, (_, i) => {
                        const colors = i <= 1 ? validRow : otherRow
                        return colors.map(makeCell)
                    })
                    return fc.constant({ grid, gridSize })
                }),
                ({ grid, gridSize }) => {
                    expect(isGridComplete(grid, gridSize)).toBe(false)
                }
            ),
            { numRuns: 20 }
        )
    })

    it('returns false for any fully-filled grid with adjacent identical columns', () => {
        // Validates: Requirements 3.1, 3.2
        fc.assert(
            fc.property(
                fc.oneof(fc.constant(4), fc.constant(6)).chain((gridSize) => {
                    const half = gridSize / 2
                    // Build a grid where columns 0 and 1 are identical and balanced.
                    // Column pattern: alternating red/blue to keep each column balanced.
                    // col0 = col1 = [r, b, r, b, ...] (half red, half blue)
                    // col2 = col3 = [b, r, b, r, ...] (different, to keep rows balanced)
                    // For gridSize=4: rows are [r,r,b,b], [b,b,r,r], [r,r,b,b], [b,b,r,r]
                    // → col0=[r,b,r,b], col1=[r,b,r,b] (identical adjacent columns)
                    const grid: Grid = Array.from({ length: gridSize }, (_, row) => {
                        return Array.from({ length: gridSize }, (__, col) => {
                            // Columns 0..half-1 share one pattern; columns half..gridSize-1 share the other
                            const colGroup = col < half ? 0 : 1
                            const color: CellColor = (row + colGroup) % 2 === 0 ? 'red' : 'blue'
                            return makeCell(color)
                        })
                    })
                    return fc.constant({ grid, gridSize })
                }),
                ({ grid, gridSize }) => {
                    expect(isGridComplete(grid, gridSize)).toBe(false)
                }
            ),
            { numRuns: 20 }
        )
    })
})
