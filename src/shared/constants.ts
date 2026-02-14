/**
 * Shared constants between client and server
 */

export type Difficulty = 'easy' | 'medium' | 'hard'

export type DifficultyLevel = {
	level: number
	gridSize: 4 | 6
	difficulty: Difficulty
	expectedTime: number // seconds
}

/**
 * The difficulty ladder: 6 levels from beginner to expert.
 * Level maps to (gridSize, difficulty) pair.
 * expectedTime is used for performance scoring -- tunable after playtesting.
 */
export const DIFFICULTY_LADDER: readonly DifficultyLevel[] = [
	{ level: 1, gridSize: 4, difficulty: 'easy', expectedTime: 60 },
	{ level: 2, gridSize: 4, difficulty: 'medium', expectedTime: 90 },
	{ level: 3, gridSize: 4, difficulty: 'hard', expectedTime: 120 },
	{ level: 4, gridSize: 6, difficulty: 'easy', expectedTime: 180 },
	{ level: 5, gridSize: 6, difficulty: 'medium', expectedTime: 240 },
	{ level: 6, gridSize: 6, difficulty: 'hard', expectedTime: 300 },
] as const

/** Default skill level for new users */
export const DEFAULT_SKILL_LEVEL = 1

/** Minimum skill level */
export const MIN_SKILL_LEVEL = 1

/** Maximum skill level */
export const MAX_SKILL_LEVEL = 6

/** Number of recent games to consider for level adjustment */
export const HISTORY_SIZE = 5

/** Average performance score threshold to promote (level up) */
export const PROMOTE_THRESHOLD = 0.7

/** Average performance score threshold to demote (level down) */
export const DEMOTE_THRESHOLD = 0.3

/**
 * Get the difficulty config for a given skill level.
 * Returns the level config, clamped to valid range.
 */
export const getLevelConfig = (level: number): DifficultyLevel => {
	const clamped = Math.max(MIN_SKILL_LEVEL, Math.min(MAX_SKILL_LEVEL, level))
	return DIFFICULTY_LADDER[clamped - 1]!
}
