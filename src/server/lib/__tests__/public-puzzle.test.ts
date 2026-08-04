import { describe, expect, it } from 'vitest'

import type { SerializedPuzzle } from '../../../shared/types'
import { toPublicPuzzle } from '../public-puzzle'

describe('toPublicPuzzle', () => {
    it('keeps playable clues while removing the stored solution', () => {
        const puzzle: SerializedPuzzle = {
            colors: 'rbrbbrbrrbbbbrbr',
            numbers: '----------------',
            solution: 'rbrbbrbrrbbbbrbr',
            difficulty: 'easy',
            gridSize: 4,
        }

        const publicPuzzle = toPublicPuzzle(puzzle)

        expect(publicPuzzle).toEqual({
            colors: puzzle.colors,
            numbers: puzzle.numbers,
            difficulty: puzzle.difficulty,
            gridSize: puzzle.gridSize,
        })
        expect(publicPuzzle).not.toHaveProperty('solution')
    })
})
