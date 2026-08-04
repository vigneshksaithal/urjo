import type { PublicPuzzle, SerializedPuzzle } from '../../shared/types'

export const toPublicPuzzle = (puzzle: SerializedPuzzle): PublicPuzzle => ({
    colors: puzzle.colors,
    numbers: puzzle.numbers,
    difficulty: puzzle.difficulty,
    gridSize: puzzle.gridSize,
})
