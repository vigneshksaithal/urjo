/**
 * Shared constants between client and server
 */

export type Difficulty = 'easy' | 'medium' | 'hard' | 'diabolical'

/** Default skill level for new users */
export const DEFAULT_SKILL_LEVEL = 1

/** Minimum skill level */
export const MIN_SKILL_LEVEL = 1

/** Number of recent games to consider for level adjustment. Must be >= PROMOTE_WINDOW. */
export const HISTORY_SIZE = 20

/**
 * Per-level promotion thresholds.
 * Early levels are easier to promote from; later levels require more sustained performance.
 * Index 0 = level 1, index 8 = level 9.
 */
export const PROMOTE_THRESHOLDS: readonly number[] = [0.46, 0.48, 0.50, 0.52, 0.54, 0.57, 0.60, 0.63, 0.66] as const

/**
 * Number of recent games needed to consider promotion, per level.
 * Early levels promote faster to reduce churn for new players.
 * Index 0 = Level 1.
 */
export const PROMOTE_WINDOWS: readonly number[] = [8, 8, 10, 10, 12, 12, 15, 15, 15] as const

/** Minimum games needed at current window to consider promotion
 * @deprecated Use PROMOTE_WINDOWS instead
 */
export const PROMOTE_WINDOW = 15

/** Minimum games needed at current window to consider demotion */
export const DEMOTE_WINDOW = 5

/** Average performance score threshold to demote (level down) */
export const DEMOTE_THRESHOLD = 0.18

/** Consecutive skips without a solve before forcing an immediate level demotion */
export const CONSECUTIVE_SKIP_THRESHOLD = 2

/** Base penalty score for skipping a puzzle (worse than worst completion of 0.0) */
export const SKIP_BASE_PENALTY = -0.2

/** Additional penalty for quick skips (added on top of base penalty) */
export const SKIP_MAX_EXTRA_PENALTY = -0.3

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

// ─── Economy Constants ─────────────────────────────────────────────────────────

/** Additional coins per streak day */
export const COIN_STREAK_MULTIPLIER = 2

/** Bonus coins for solving under par time */
export const COIN_SPEED_BONUS = 5

/** Bonus coins for first solve of the day */
export const COIN_DAILY_BONUS = 5

/** Bonus coins for a perfect solve (0 mistakes) */
export const COIN_PERFECT_BONUS = 10

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

// ─── Daily Login Bonus Constants ────────────────────────────────────────────────

/** Daily login bonus coins by consecutive login day (index 0 = day 1, index 4+ = day 5+) */
export const DAILY_LOGIN_BONUS: readonly number[] = [5, 5, 10, 10, 25] as const

/** Get daily login bonus for a given consecutive login day count */
export const getDailyLoginBonus = (consecutiveDays: number): number => {
	if (consecutiveDays <= 0) return DAILY_LOGIN_BONUS[0] ?? 5
	const idx = Math.min(consecutiveDays - 1, 4)
	return DAILY_LOGIN_BONUS[idx] ?? 5
}

// ─── Streak Freeze Constants ─────────────────────────────────────────────────

/** Cost of a streak freeze in coins */
export const STREAK_FREEZE_COST = 50

/** Maximum streak freezes a user can hold */
export const MAX_STREAK_FREEZES = 3

// ─── Per-Grid Difficulty Ladder ───────────────────────────────────────────────

/** Valid grid sizes */
export type GridSize = 4 | 6 | 8

export const VALID_GRID_SIZES: readonly GridSize[] = [4, 6, 8] as const

export const DEFAULT_GRID_SIZE: GridSize = 4

/** A single difficulty level entry within a specific grid size */
export type GridDifficultyLevel = {
	level: number
	gridSize: GridSize
	difficulty: Difficulty
	expectedTime: number // seconds -- Par_Time source
	coinBase: number // authored absolute base coin reward for this bucket
	seasonWeight: number // authored season-point difficulty multiplier for this bucket
}

/**
 * Per-grid difficulty ladder (the Unified_Ladder): each grid size has 4 independent levels.
 *
 * `coinBase` is authored to be strictly monotonic across the unified order
 * (4×4 L1→L4, 6×6 L1→L4, 8×8 L1→L4), so per-minute rates vary rather than holding a
 * fixed coins/min — larger grids keep the depth advantage required by Requirement 2.3.
 * `seasonWeight` follows a compressed curve anchored at 1.0 for 4×4 easy. They are free
 * to tune without touching scoring logic.
 */
export const PER_GRID_LADDER: Record<GridSize, readonly GridDifficultyLevel[]> = {
	4: [
		{ level: 1, gridSize: 4, difficulty: 'easy', expectedTime: 45, coinBase: 10, seasonWeight: 1.0 },
		{ level: 2, gridSize: 4, difficulty: 'medium', expectedTime: 90, coinBase: 20, seasonWeight: 1.3 },
		{ level: 3, gridSize: 4, difficulty: 'hard', expectedTime: 150, coinBase: 33, seasonWeight: 1.6 },
		{ level: 4, gridSize: 4, difficulty: 'diabolical', expectedTime: 210, coinBase: 46, seasonWeight: 1.9 },
	],
	6: [
		{ level: 1, gridSize: 6, difficulty: 'easy', expectedTime: 120, coinBase: 50, seasonWeight: 2.0 },
		{ level: 2, gridSize: 6, difficulty: 'medium', expectedTime: 210, coinBase: 64, seasonWeight: 2.2 },
		{ level: 3, gridSize: 6, difficulty: 'hard', expectedTime: 360, coinBase: 83, seasonWeight: 2.4 },
		{ level: 4, gridSize: 6, difficulty: 'diabolical', expectedTime: 480, coinBase: 111, seasonWeight: 2.6 },
	],
	8: [
		{ level: 1, gridSize: 8, difficulty: 'easy', expectedTime: 300, coinBase: 120, seasonWeight: 2.8 },
		{ level: 2, gridSize: 8, difficulty: 'medium', expectedTime: 480, coinBase: 150, seasonWeight: 3.2 },
		{ level: 3, gridSize: 8, difficulty: 'hard', expectedTime: 720, coinBase: 188, seasonWeight: 3.6 },
		{ level: 4, gridSize: 8, difficulty: 'diabolical', expectedTime: 960, coinBase: 232, seasonWeight: 4.0 },
	],
} as const

/** Maximum level within any per-grid ladder */
export const PER_GRID_MAX_LEVEL = 4

/** Minimum level within any per-grid ladder */
export const PER_GRID_MIN_LEVEL = 1

/** Coin reward multipliers by grid size */
export const GRID_SIZE_MULTIPLIERS: Record<GridSize, number> = {
	4: 1.0,
	6: 1.5,
	8: 2.0,
} as const

/**
 * Get the difficulty config for a given (gridSize, level) pair.
 * Level is clamped to [PER_GRID_MIN_LEVEL, PER_GRID_MAX_LEVEL].
 */
export const getGridLevelConfig = (gridSize: GridSize, level: number): GridDifficultyLevel => {
	const clamped = Math.max(PER_GRID_MIN_LEVEL, Math.min(PER_GRID_MAX_LEVEL, level))
	return PER_GRID_LADDER[gridSize][clamped - 1]!
}

/**
 * Type guard: returns true if value is a valid GridSize (4, 6, or 8).
 */
export const isValidGridSize = (value: unknown): value is GridSize =>
	value === 4 || value === 6 || value === 8
