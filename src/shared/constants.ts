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
	{ level: 1, gridSize: 4, difficulty: 'easy', expectedTime: 10 },
	{ level: 2, gridSize: 4, difficulty: 'medium', expectedTime: 20 },
	{ level: 3, gridSize: 4, difficulty: 'hard', expectedTime: 30 },
	{ level: 4, gridSize: 6, difficulty: 'easy', expectedTime: 60 },
	{ level: 5, gridSize: 6, difficulty: 'medium', expectedTime: 90 },
	{ level: 6, gridSize: 6, difficulty: 'hard', expectedTime: 120 },
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

/** Consecutive skips without a solve before forcing an immediate level demotion */
export const CONSECUTIVE_SKIP_THRESHOLD = 2

/** Base penalty score for skipping a puzzle (worse than worst completion of 0.0) */
export const SKIP_BASE_PENALTY = -0.2

/** Additional penalty for quick skips (added on top of base penalty) */
export const SKIP_MAX_EXTRA_PENALTY = -0.3

/**
 * Get the difficulty config for a given skill level.
 * Returns the level config, clamped to valid range.
 */
export const getLevelConfig = (level: number): DifficultyLevel => {
	const clamped = Math.max(MIN_SKILL_LEVEL, Math.min(MAX_SKILL_LEVEL, level))
	return DIFFICULTY_LADDER[clamped - 1]!
}

/**
 * Urjo Game Color Constants
 * Centralized color palette for consistent theming across the app
 */
export const URJO_COLORS = {
	/** Primary game colors */
	RED: '#E54E3E',
	BLUE: '#5199CA',

	/** Background colors */
	BACKGROUND: '#1a1a1a',
	OVERLAY_BG: '#f5f5dc', // Cream/beige for primary buttons

	/** Text colors */
	TEXT_PRIMARY: '#ffffff',
	TEXT_SECONDARY: '#d1d5db',
	TEXT_TERTIARY: '#9ca3af',

	/** Accent colors */
	YELLOW: '#fbbf24', // Leaderboard scores
	GREEN: '#10b981', // Success states
} as const

export type UrjoColor = (typeof URJO_COLORS)[keyof typeof URJO_COLORS]
