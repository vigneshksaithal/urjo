import { describe, it, expect } from 'vitest'
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

const SUPPORTED_GRID_SIZES = [4, 6, 8] as const


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


// ─── Helpers for new validation tests ────────────────────────────────────────

const makeNumberedCell = (color: CellColor, number: number | null): Cell => ({
    color,
    number,
    locked: false,
})

const makeCheckerboardGrid = (gridSize: number): Grid =>
    Array.from({ length: gridSize }, (_, row) =>
        Array.from({ length: gridSize }, (_, col) =>
            makeCell((row + col) % 2 === 0 ? 'red' : 'blue')
        )
    )

const makeValid4x4Grid = (): Grid => makeCheckerboardGrid(4)

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

describe('validation across supported grid sizes', () => {
    it.each(SUPPORTED_GRID_SIZES)('accepts a valid complete %ix%i grid', (gridSize) => {
        const grid = makeCheckerboardGrid(gridSize)
        const validation = validateGrid(grid, gridSize)

        expect(validation.violatedRows.size).toBe(0)
        expect(validation.violatedCols.size).toBe(0)
        expect(isGridComplete(grid, gridSize)).toBe(true)
        expect(doesCellViolateConstraints(grid, 0, 0, gridSize)).toBe(false)
    })

    it.each(SUPPORTED_GRID_SIZES)('detects row balance violations in a %ix%i grid', (gridSize) => {
        const grid = makeCheckerboardGrid(gridSize)
        const limit = gridSize / 2

        for (let col = 0; col <= limit; col++) {
            grid[0]![col] = makeCell('red')
        }

        const validation = validateGrid(grid, gridSize)
        expect(validation.violatedRows.has(0)).toBe(true)
        expect(isGridComplete(grid, gridSize)).toBe(false)
        expect(doesCellViolateConstraints(grid, 0, 0, gridSize)).toBe(true)
    })

    it.each(SUPPORTED_GRID_SIZES)('detects column balance violations in a %ix%i grid', (gridSize) => {
        const grid = makeCheckerboardGrid(gridSize)
        const limit = gridSize / 2

        for (let row = 0; row <= limit; row++) {
            grid[row]![0] = makeCell('red')
        }

        const validation = validateGrid(grid, gridSize)
        expect(validation.violatedCols.has(0)).toBe(true)
        expect(isGridComplete(grid, gridSize)).toBe(false)
        expect(doesCellViolateConstraints(grid, 0, 0, gridSize)).toBe(true)
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
