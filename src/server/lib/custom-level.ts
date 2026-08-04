import type { Difficulty, GridSize } from '../../shared/constants'
import type { SerializedPuzzle } from '../../shared/types'
import {
    deserializeGrid,
    generatePuzzleFromSolution,
    hasAdjacentIdenticalColumns,
    hasAdjacentIdenticalRows,
    isBalanced,
} from './generator'

type CustomLevelValidation =
    | { valid: true }
    | { valid: false; message: string }

type BuildCustomLevelInput = {
    solution: string
    gridSize: GridSize
    difficulty: Difficulty
}

export const validateCustomLevelSolution = (
    solution: string,
    gridSize: GridSize,
): CustomLevelValidation => {
    const expectedLength = gridSize * gridSize
    if (solution.length !== expectedLength || !/^[rb]+$/.test(solution)) {
        return { valid: false, message: 'Fill every cell before previewing your level' }
    }

    const grid = deserializeGrid(
        solution,
        '-'.repeat(expectedLength),
        gridSize,
        solution,
    )
    if (!isBalanced(grid, gridSize)) {
        return {
            valid: false,
            message: 'Every row and column needs the same number of red and blue cells',
        }
    }
    if (hasAdjacentIdenticalRows(grid, gridSize) || hasAdjacentIdenticalColumns(grid, gridSize)) {
        return { valid: false, message: 'Adjacent rows and columns cannot be identical' }
    }
    return { valid: true }
}

export const buildCustomLevelPuzzle = (
    input: BuildCustomLevelInput,
): SerializedPuzzle => {
    const validation = validateCustomLevelSolution(input.solution, input.gridSize)
    if (!validation.valid) throw new Error(validation.message)
    return generatePuzzleFromSolution(input.solution, input.difficulty, input.gridSize)
}
