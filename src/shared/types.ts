/**
 * Urjo Puzzle Game Types
 * Shared between client and server
 */

export type CellColor = 'red' | 'blue' | null

export type Cell = {
	color: CellColor
	number: number | null
	locked: boolean
}

export type Grid = Cell[][]

export type SerializedPuzzle = {
	colors: string // "rbbrr.bb..." (r=red, b=blue, .=empty)
	numbers: string // "2-31--5-..." (digit or - for no number)
	solution: string // Complete solution (rbbrrbbrrbbrrbbb)
	difficulty: 'easy' | 'medium' | 'hard'
}

export type GameState = {
	puzzle: SerializedPuzzle
	tutorialCompleted: boolean
}

export type NextChallengeResponse = {
	puzzle: SerializedPuzzle
}
