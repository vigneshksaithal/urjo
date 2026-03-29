/**
 * Shared constants between client and server
 */

export type Difficulty = 'easy' | 'medium' | 'hard' | 'diabolical'

export type DifficultyLevel = {
	level: number
	gridSize: 4 | 6 | 8
	difficulty: Difficulty
	expectedTime: number // seconds
}

/**
 * The difficulty ladder: 9 levels from beginner to expert.
 * Level maps to (gridSize, difficulty) pair.
 * expectedTime is used for performance scoring -- tunable after playtesting.
 */
export const DIFFICULTY_LADDER: readonly DifficultyLevel[] = [
	{ level: 1, gridSize: 4, difficulty: 'easy',       expectedTime: 45  },
	{ level: 2, gridSize: 4, difficulty: 'medium',     expectedTime: 90  },
	{ level: 3, gridSize: 4, difficulty: 'hard',       expectedTime: 150 },
	{ level: 4, gridSize: 6, difficulty: 'easy',       expectedTime: 120 },
	{ level: 5, gridSize: 6, difficulty: 'medium',     expectedTime: 210 },
	{ level: 6, gridSize: 6, difficulty: 'hard',       expectedTime: 360 },
	{ level: 7, gridSize: 8, difficulty: 'easy',       expectedTime: 300 },
	{ level: 8, gridSize: 8, difficulty: 'medium',     expectedTime: 480 },
	{ level: 9, gridSize: 8, difficulty: 'diabolical', expectedTime: 720 },
] as const

/** Default skill level for new users */
export const DEFAULT_SKILL_LEVEL = 1

/** Minimum skill level */
export const MIN_SKILL_LEVEL = 1

/** Maximum skill level */
export const MAX_SKILL_LEVEL = 9

/** Number of recent games to consider for level adjustment */
export const HISTORY_SIZE = 10

/** Average performance score threshold to promote (level up) */
export const PROMOTE_THRESHOLD = 0.65

/** Average performance score threshold to demote (level down) */
export const DEMOTE_THRESHOLD = 0.25

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

// ─── Economy Constants ─────────────────────────────────────────────────────────

/** Base coins earned per puzzle completion */
export const COIN_BASE = 10

/** Additional coins per streak day */
export const COIN_STREAK_MULTIPLIER = 2

/** Bonus coins for solving under par time */
export const COIN_SPEED_BONUS = 5

/** Bonus coins for first solve of the day */
export const COIN_DAILY_BONUS = 5

/** Multiplier for par time calculation (expectedTime * 2) */
export const PAR_TIME_MULTIPLIER = 2

/** Title definitions - purchasable cosmetic titles */
export const TITLES: readonly import('./types').TitleDef[] = [
	{ id: 'puzzler', emoji: '🧩', label: 'Puzzler', cost: 0 },
	{ id: 'streak_lord', emoji: '🔥', label: 'Streak Lord', cost: 100 },
	{
		id: 'speed_demon',
		emoji: '⚡',
		label: 'Speed Demon',
		cost: 150,
		condition: { type: 'minSpeedSolves', value: 10 },
	},
	{
		id: 'big_brain',
		emoji: '🧠',
		label: 'Big Brain',
		cost: 200,
		condition: { type: 'minSkillLevel', value: 5 },
	},
	{
		id: 'urjo_king',
		emoji: '👑',
		label: 'Urjo King',
		cost: 500,
		condition: { type: 'minSolves', value: 50 },
	},
	{
		id: 'diamond_mind',
		emoji: '💎',
		label: 'Diamond Mind',
		cost: 1000,
		condition: { type: 'minLongestStreak', value: 30 },
	},
	{
		id: 'chromatic',
		emoji: '🌈',
		label: 'Chromatic',
		cost: 300,
		condition: { type: 'minSolves', value: 100 },
	},
] as const

/** Get title by ID */
export const getTitleById = (id: string): import('./types').TitleDef | undefined => {
	return TITLES.find((t) => t.id === id)
}
