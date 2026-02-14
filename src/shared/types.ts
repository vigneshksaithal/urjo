/**
 * Urjo Puzzle Game Types
 * Shared between client and server
 */

export type CellColor = 'red' | 'blue' | null

export type Cell = {
	color: CellColor
	number: number | null
	locked: boolean
	isLoading?: boolean
}

export type Grid = Cell[][]

export type SerializedPuzzle = {
	colors: string // "rbbrr.bb..." (r=red, b=blue, .=empty)
	numbers: string // "2-31--5-..." (digit or - for no number)
	solution: string // Complete solution (rbbrrbbrrbbrrbbb)
	difficulty: 'easy' | 'medium' | 'hard'
	gridSize: number // 4 or 6
}

export type GameState = {
	puzzle: SerializedPuzzle
	tutorialCompleted: boolean
	skillLevel: number
}

export type NextChallengeResponse = {
	puzzle: SerializedPuzzle
	skillLevel: number
}

export type CompleteRequest = {
	timeTaken: number // seconds
}

export type CompleteResponse = {
	performanceScore: number
	newSkillLevel: number
	previousSkillLevel: number
}

/** A single game record stored in user history */
export type GameRecord = {
	level: number
	timeTaken: number
	timestamp: number
}
