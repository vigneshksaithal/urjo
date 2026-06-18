import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import type { Cell, CellColor, Grid } from '../../../shared/types'
import { mistakeCount, onCellChange, resetMistakes } from '../mistakes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeCell = (color: CellColor): Cell => ({ color, number: null, locked: false })

/**
 * Valid 4×4 checkerboard grid — no constraint violations:
 *   r b r b
 *   b r b r
 *   r b r b
 *   b r b r
 */
const makeValidGrid = (): Grid => [
    [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
    [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
    [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
    [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
]

/**
 * Violation grid — row 0 has 3 red cells (exceeds limit of 2):
 *   r r r b  ← balance violation
 *   b r b r
 *   r b r b
 *   b r b r
 */
const makeViolationGrid = (): Grid => [
    [makeCell('red'), makeCell('red'), makeCell('red'), makeCell('blue')],
    [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
    [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell('blue')],
    [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
]

// ─── Test isolation ───────────────────────────────────────────────────────────

beforeEach(() => {
    resetMistakes()
})

// ─── Test 1: Valid cell is NOT flagged as a mistake ───────────────────────────

describe('onCellChange — valid cell not flagged as mistake', () => {
    it('does not increment mistake count when leaving a cell that satisfies all constraints', () => {
        // Requirements: 2.1, 3.1
        // A cell in the valid checkerboard grid does not violate any constraint.
        // Placing at (0,0) then moving to (0,1) should NOT count a mistake.
        const grid = makeValidGrid()
        const gridSize = 4

        // Touch cell (0,0) — sets lastActiveCell
        onCellChange(0, 0, grid, gridSize)
        expect(get(mistakeCount)).toBe(0)

        // Move to cell (0,1) — evaluates previous cell (0,0) which is valid
        onCellChange(0, 1, grid, gridSize)
        expect(get(mistakeCount)).toBe(0)
    })

    it('does not flag any cell in a fully valid grid after traversing multiple cells', () => {
        // Requirements: 2.1
        // Traverse several cells in the valid grid — none should be flagged.
        const grid = makeValidGrid()
        const gridSize = 4

        onCellChange(0, 0, grid, gridSize)
        onCellChange(1, 0, grid, gridSize)
        onCellChange(2, 0, grid, gridSize)
        onCellChange(3, 0, grid, gridSize)

        expect(get(mistakeCount)).toBe(0)
    })
})

// ─── Test 2: Constraint-violating cell IS flagged as a mistake ────────────────

describe('onCellChange — constraint-violating cell flagged as mistake', () => {
    it('increments mistake count when leaving a cell that causes a balance violation', () => {
        // Requirements: 2.1, 3.1
        // Row 0 in the violation grid has 3 red cells — exceeds the limit of 2.
        // Cell (0,2) is red and causes the row balance violation.
        // After touching (0,2) and then moving to another cell, mistake count should be 1.
        const grid = makeViolationGrid()
        const gridSize = 4

        // Touch the violating cell (0,2) — sets lastActiveCell
        onCellChange(0, 2, grid, gridSize)
        expect(get(mistakeCount)).toBe(0) // not counted yet — still on this cell

        // Move to a different cell — evaluates previous cell (0,2) which violates balance
        onCellChange(1, 0, grid, gridSize)
        expect(get(mistakeCount)).toBe(1)
    })

    it('does not double-count the same violating cell if revisited', () => {
        // Requirements: 2.1
        // Once a cell is counted as a mistake, returning to it and leaving again
        // should NOT increment the count a second time.
        const grid = makeViolationGrid()
        const gridSize = 4

        // Touch violating cell (0,2), then leave
        onCellChange(0, 2, grid, gridSize)
        onCellChange(1, 0, grid, gridSize)
        expect(get(mistakeCount)).toBe(1)

        // Return to (0,2) and leave again — should NOT count again
        onCellChange(0, 2, grid, gridSize)
        onCellChange(1, 0, grid, gridSize)
        expect(get(mistakeCount)).toBe(1)
    })
})

// ─── Test 3: resetMistakes clears all state ───────────────────────────────────

describe('resetMistakes', () => {
    it('resets mistake count to 0', () => {
        // Requirements: 2.1, 3.1
        const grid = makeViolationGrid()
        const gridSize = 4

        // Accumulate a mistake
        onCellChange(0, 2, grid, gridSize)
        onCellChange(1, 0, grid, gridSize)
        expect(get(mistakeCount)).toBe(1)

        resetMistakes()
        expect(get(mistakeCount)).toBe(0)
    })

    it('clears lastActiveCell so subsequent moves start fresh', () => {
        // Requirements: 3.1
        // After reset, moving to a new cell should not evaluate any "previous" cell.
        const grid = makeViolationGrid()
        const gridSize = 4

        // Touch a violating cell
        onCellChange(0, 2, grid, gridSize)

        // Reset — clears lastActiveCell
        resetMistakes()

        // Move to another cell — no previous cell to evaluate, so count stays 0
        onCellChange(1, 0, grid, gridSize)
        expect(get(mistakeCount)).toBe(0)
    })

    it('clears countedMistakeCells so previously-counted cells can be re-evaluated after reset', () => {
        // Requirements: 3.1
        // After reset, a cell that was previously counted as a mistake should be
        // eligible to be counted again if it still violates constraints.
        const grid = makeViolationGrid()
        const gridSize = 4

        // Count a mistake for cell (0,2)
        onCellChange(0, 2, grid, gridSize)
        onCellChange(1, 0, grid, gridSize)
        expect(get(mistakeCount)).toBe(1)

        // Reset — clears all state
        resetMistakes()
        expect(get(mistakeCount)).toBe(0)

        // Touch the same violating cell again and leave — should count again
        onCellChange(0, 2, grid, gridSize)
        onCellChange(1, 0, grid, gridSize)
        expect(get(mistakeCount)).toBe(1)
    })
})

