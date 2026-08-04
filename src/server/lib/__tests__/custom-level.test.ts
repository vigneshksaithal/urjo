import { describe, expect, it } from 'vitest'

import { countSolutions, deserializeGrid } from '../generator'
import { buildCustomLevelPuzzle, validateCustomLevelSolution } from '../custom-level'

const makeValidSolution = (gridSize: 4 | 6 | 8): string =>
    Array.from({ length: gridSize }, (_, row) =>
        Array.from(
            { length: gridSize },
            (_, col) => ((row + col) % gridSize < gridSize / 2 ? 'r' : 'b'),
        ).join(''),
    ).join('')

const VALID_SOLUTIONS = {
    4: makeValidSolution(4),
    6: makeValidSolution(6),
    8: makeValidSolution(8),
} as const

describe('custom level validation', () => {
    it.each([4, 6, 8] as const)('accepts a valid %d×%d solution', (gridSize) => {
        expect(validateCustomLevelSolution(VALID_SOLUTIONS[gridSize], gridSize)).toEqual({
            valid: true,
        })
    })

    it('rejects an incomplete solution', () => {
        expect(validateCustomLevelSolution('rrbb', 4)).toEqual({
            valid: false,
            message: 'Fill every cell before previewing your level',
        })
    })

    it('rejects rows without an equal color split', () => {
        expect(validateCustomLevelSolution('rrrrrbbrbrrbbrbr', 4)).toEqual({
            valid: false,
            message: 'Every row and column needs the same number of red and blue cells',
        })
    })

    it('rejects adjacent matching rows', () => {
        expect(validateCustomLevelSolution('rrbbrrbbbbrrbbrr', 4)).toEqual({
            valid: false,
            message: 'Adjacent rows and columns cannot be identical',
        })
    })
})

describe('custom level clue generation', () => {
    it.each([4, 6, 8] as const)('builds a uniquely solvable %d×%d puzzle', (gridSize) => {
        const puzzle = buildCustomLevelPuzzle({
            solution: VALID_SOLUTIONS[gridSize],
            gridSize,
            difficulty: 'medium',
        })
        const grid = deserializeGrid(puzzle.colors, puzzle.numbers, gridSize, puzzle.colors)

        expect(puzzle.solution).toBe(VALID_SOLUTIONS[gridSize])
        expect(countSolutions(grid, gridSize)).toBe(1)
    })
})
