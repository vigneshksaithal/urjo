import type { Grid } from '../../shared/types'

export type ValidationResult = {
    violatedRows: Set<number>
    violatedCols: Set<number>
}

/** All 8 surrounding directions (orthogonal + diagonal). */
const ALL_DIRECTIONS: ReadonlyArray<[number, number]> = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
]

/**
 * Count all surrounding neighbors (including diagonals) of same color.
 * Returns 0 if the cell has no color.
 */
export const countSameColorNeighbors = (grid: Grid, row: number, col: number, gridSize: number): number => {
    const cell = grid[row]?.[col]
    if (!cell || cell.color === null) return 0

    const color = cell.color
    let count = 0

    for (const [dr, dc] of ALL_DIRECTIONS) {
        const neighbor = grid[row + dr]?.[col + dc]
        if (
            row + dr >= 0 && row + dr < gridSize &&
            col + dc >= 0 && col + dc < gridSize &&
            neighbor && neighbor.color === color
        ) {
            count++
        }
    }

    return count
}

/**
 * Returns true if any two adjacent rows are both fully filled and have identical color patterns.
 */
export const hasAdjacentIdenticalRows = (grid: Grid, gridSize: number): boolean => {
    for (let row = 0; row < gridSize - 1; row++) {
        const rowA = grid[row]
        const rowB = grid[row + 1]
        if (rowA === undefined || rowB === undefined) continue

        // Only compare fully-filled rows
        const aFull = rowA.every(cell => cell.color !== null)
        const bFull = rowB.every(cell => cell.color !== null)
        if (!aFull || !bFull) continue

        const identical = rowA.every((cell, col) => cell.color === rowB[col]?.color)
        if (identical) return true
    }
    return false
}

/**
 * Returns true if any two adjacent columns are both fully filled and have identical color patterns.
 */
export const hasAdjacentIdenticalColumns = (grid: Grid, gridSize: number): boolean => {
    for (let col = 0; col < gridSize - 1; col++) {
        // Only compare fully-filled columns
        const aFull = Array.from({ length: gridSize }, (_, row) => grid[row]?.[col]).every(cell => cell !== undefined && cell.color !== null)
        const bFull = Array.from({ length: gridSize }, (_, row) => grid[row]?.[col + 1]).every(cell => cell !== undefined && cell.color !== null)
        if (!aFull || !bFull) continue

        const identical = Array.from({ length: gridSize }, (_, row) => row).every(
            row => grid[row]?.[col]?.color === grid[row]?.[col + 1]?.color
        )
        if (identical) return true
    }
    return false
}

/**
 * Returns true if every cell that has both a color and a number has a same-color
 * neighbor count exactly matching its number. Cells with no color or no number are skipped.
 */
export const numberConstraintsSatisfied = (grid: Grid, gridSize: number): boolean => {
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const cell = grid[row]?.[col]
            if (!cell || cell.color === null || cell.number === null || cell.number === undefined) continue
            if (countSameColorNeighbors(grid, row, col, gridSize) !== cell.number) return false
        }
    }
    return true
}

/**
 * Returns true only when the grid is fully complete and valid:
 * - All cells are filled (no null colors)
 * - Each row and column has exactly gridSize/2 red and gridSize/2 blue (balanced)
 * - No two adjacent rows have identical color patterns
 * - No two adjacent columns have identical color patterns
 * - All number constraints are satisfied
 */
export const isGridComplete = (grid: Grid, gridSize: number): boolean => {
    const half = gridSize / 2

    for (let row = 0; row < gridSize; row++) {
        let redCount = 0
        let blueCount = 0
        for (let col = 0; col < gridSize; col++) {
            const cell = grid[row]?.[col]
            if (!cell || cell.color === null) return false
            if (cell.color === 'red') redCount++
            else blueCount++
        }
        if (redCount !== half || blueCount !== half) return false
    }

    for (let col = 0; col < gridSize; col++) {
        let redCount = 0
        let blueCount = 0
        for (let row = 0; row < gridSize; row++) {
            const cell = grid[row]?.[col]
            if (!cell || cell.color === null) return false
            if (cell.color === 'red') redCount++
            else blueCount++
        }
        if (redCount !== half || blueCount !== half) return false
    }

    if (hasAdjacentIdenticalRows(grid, gridSize)) return false
    if (hasAdjacentIdenticalColumns(grid, gridSize)) return false
    if (!numberConstraintsSatisfied(grid, gridSize)) return false

    return true
}

/**
 * Returns true if the cell at (row, col) has a number constraint that is
 * definitively violated — either the same-color neighbor count already exceeds
 * the number, or all neighbors are filled and the count doesn't match exactly.
 */
const isNumberConstraintViolated = (grid: Grid, row: number, col: number, gridSize: number): boolean => {
    const cell = grid[row]?.[col]
    if (!cell || cell.color === null || cell.number === null || cell.number === undefined) return false

    const sameCount = countSameColorNeighbors(grid, row, col, gridSize)

    // Definite violation: already too many same-color neighbors
    if (sameCount > cell.number) return true

    // Definite violation: all neighbors are filled and count doesn't match
    let unfilledCount = 0
    for (const [dr, dc] of ALL_DIRECTIONS) {
        const nr = row + dr
        const nc = col + dc
        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue
        const neighbor = grid[nr]?.[nc]
        if (!neighbor || neighbor.color === null) unfilledCount++
    }

    if (unfilledCount === 0 && sameCount !== cell.number) return true

    return false
}

/**
 * Returns true if the cell at (row, col) definitively violates any constraint:
 * - Row or column balance: more than gridSize/2 of the cell's color
 * - Number constraint for this cell: count exceeds its number, or all neighbors
 *   are filled and count doesn't match
 * - Number constraint for any numbered neighbor: same check applied to each
 *   of the 8 neighbors that has a number and a color
 *
 * Only flags DEFINITE violations — not speculative future ones.
 * Returns false if the cell has no color.
 */
export const doesCellViolateConstraints = (grid: Grid, row: number, col: number, gridSize: number): boolean => {
    const cell = grid[row]?.[col]
    if (!cell || cell.color === null) return false

    const limit = gridSize / 2

    // Check row balance
    let rowColorCount = 0
    for (let c = 0; c < gridSize; c++) {
        if (grid[row]?.[c]?.color === cell.color) rowColorCount++
    }
    if (rowColorCount > limit) return true

    // Check column balance
    let colColorCount = 0
    for (let r = 0; r < gridSize; r++) {
        if (grid[r]?.[col]?.color === cell.color) colColorCount++
    }
    if (colColorCount > limit) return true

    // Check number constraint for this cell
    if (isNumberConstraintViolated(grid, row, col, gridSize)) return true

    // Check number constraints for all 8 neighbors
    for (const [dr, dc] of ALL_DIRECTIONS) {
        const nr = row + dr
        const nc = col + dc
        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue
        if (isNumberConstraintViolated(grid, nr, nc, gridSize)) return true
    }

    return false
}

export const validateGrid = (grid: Grid, gridSize: number): ValidationResult => {
    const limit = gridSize / 2
    const violatedRows = new Set<number>()
    const violatedCols = new Set<number>()

    for (let row = 0; row < gridSize; row++) {
        const rowCells = grid[row]
        if (rowCells === undefined) continue

        let redCount = 0
        let blueCount = 0
        for (let col = 0; col < gridSize; col++) {
            const cell = rowCells[col]
            if (cell === undefined) continue
            if (cell.color === 'red') redCount++
            else if (cell.color === 'blue') blueCount++
        }
        if (redCount > limit || blueCount > limit) violatedRows.add(row)
    }

    for (let col = 0; col < gridSize; col++) {
        let redCount = 0
        let blueCount = 0
        for (let row = 0; row < gridSize; row++) {
            const cell = grid[row]?.[col]
            if (cell === undefined) continue
            if (cell.color === 'red') redCount++
            else if (cell.color === 'blue') blueCount++
        }
        if (redCount > limit || blueCount > limit) violatedCols.add(col)
    }

    return { violatedRows, violatedCols }
}
