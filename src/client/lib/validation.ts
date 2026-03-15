import type { Grid } from '../../shared/types'

export type ValidationResult = {
    violatedRows: Set<number>
    violatedCols: Set<number>
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
