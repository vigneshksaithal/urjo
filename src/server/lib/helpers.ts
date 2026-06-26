/**
 * Shared Helper Functions
 * Consolidated helpers used across server routes and lib modules
 */

import { redis, reddit } from '@devvit/web/server'
import { DEFAULT_SKILL_LEVEL, DEFAULT_GRID_SIZE, isValidGridSize } from '../../shared/constants'
import type { GridSize } from '../../shared/constants'
import type { GameRecord } from '../../shared/types'

/**
 * Parse a value read from Redis into an integer, returning a fallback when the
 * value is missing or not a valid number. Avoids leaking NaN into responses
 * when a cached counter is absent or malformed.
 */
export const safeParseInt = (value: string | null | undefined, fallback: number): number => {
	if (value === null || value === undefined) return fallback
	const parsed = parseInt(value, 10)
	return Number.isNaN(parsed) ? fallback : parsed
}

/**
 * Count how many members of a sorted set have a score strictly greater than
 * `playerScore`. Used to derive a "higher is better" rank without assuming
 * integer scores: it fetches the [playerScore, +∞] slice and filters out ties
 * and the player themselves, so it stays correct even if scores become
 * fractional.
 */
export const countPlayersAbove = async (key: string, playerScore: number): Promise<number> => {
	const atOrAbove = await redis.zRange(key, playerScore, Number.MAX_SAFE_INTEGER, { by: 'score' })
	return atOrAbove.filter((entry) => entry.score > playerScore).length
}

/**
 * Generate an opaque, single-use identifier for a freshly issued puzzle. Stored
 * with the per-user puzzle so completion can be credited exactly once per
 * issued puzzle (a "run again" puzzle gets a new id and is credited again).
 */
export const makeInstanceId = (): string =>
	`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/**
 * Get today's date in UTC as YYYY-MM-DD.
 */
export const getTodayUTC = (): string =>
	new Date().toISOString().split('T')[0] ?? ''

/**
 * Get the current ISO week string in YYYY-Wnn format (e.g., "2025-W03").
 * Uses UTC date to determine the ISO week number.
 */
export const getISOWeek = (): string => {
	const now = new Date()
	// Create a copy set to the nearest Thursday (ISO week date algorithm)
	const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
	// Set to nearest Thursday: current date + 4 - current day number (Monday=1, Sunday=7)
	const dayNum = target.getUTCDay() || 7
	target.setUTCDate(target.getUTCDate() + 4 - dayNum)
	// Get first day of year
	const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
	// Calculate week number
	const weekNum = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
	const ww = String(weekNum).padStart(2, '0')
	return `${target.getUTCFullYear()}-W${ww}`
}

/**
 * Get yesterday's date in UTC as YYYY-MM-DD.
 */
export const getYesterdayUTC = (): string => {
	const yesterday = new Date()
	yesterday.setUTCDate(yesterday.getUTCDate() - 1)
	return yesterday.toISOString().split('T')[0] ?? ''
}

/**
 * Get the user's current skill level from Redis.
 */
export const getSkillLevel = async (userId: string): Promise<number> => {
	const level = await redis.get(`user:${userId}:skillLevel`)
	return level ? parseInt(level, 10) : DEFAULT_SKILL_LEVEL
}

/**
 * Fetch Reddit username for a user ID.
 * Caches results in Redis for 24 hours.
 * Returns "You" for current user, actual username for others, "Anon" as fallback.
 */
export const fetchUsername = async (targetUserId: string, currentUserId?: string): Promise<string> => {
	if (currentUserId && targetUserId === currentUserId) {
		return 'You'
	}

	const cacheKey = `user:${targetUserId}:username`
	const cached = await redis.get(cacheKey)
	if (cached) return cached

	try {
		const user = await reddit.getUserById(targetUserId as `t2_${string}`)
		if (!user) return 'Anon'

		const username = user.username
		await redis.set(cacheKey, username)
		await redis.expire(cacheKey, 86400)

		return username
	} catch (error) {
		console.error(`Failed to fetch username for ${targetUserId}:`, error)
		return 'Anon'
	}
}

/**
 * Calculate the day difference between two YYYY-MM-DD date strings.
 * Returns positive number if date2 is after date1, negative if before.
 * Uses Math.round to handle DST transitions safely.
 */
export const getDayDifference = (date1: string, date2: string): number => {
	const d1 = new Date(date1)
	const d2 = new Date(date2)
	const diffTime = d2.getTime() - d1.getTime()
	return Math.round(diffTime / (1000 * 60 * 60 * 24))
}

// ─── Login Streak ───────────────────────────────────────────────────────────

/** Login streak data stored as a Redis hash */
export type LoginStreak = {
	days: number
	lastDate: string | null
}

const LOGIN_STREAK_KEY = (userId: string): string => `user:${userId}:loginStreak`

/**
 * Get login streak data for a user from a single Redis hash.
 */
export const getLoginStreak = async (userId: string): Promise<LoginStreak> => {
	const data = await redis.hGetAll(LOGIN_STREAK_KEY(userId))
	return {
		days: data?.days ? parseInt(data.days, 10) : 0,
		lastDate: data?.lastDate ?? null,
	}
}

/**
 * Update login streak on first daily solve.
 * Returns 0 immediately when isDailyFirst is false (no Redis call).
 * On first daily solve: increments if consecutive, resets to 1 if gap.
 */
export const updateLoginStreak = async (userId: string, isDailyFirst: boolean): Promise<number> => {
	if (!isDailyFirst) return 0

	const today = getTodayUTC()
	const yesterday = getYesterdayUTC()
	const loginStreak = await getLoginStreak(userId)

	if (loginStreak.lastDate === today) return loginStreak.days

	const newDays = loginStreak.lastDate === yesterday
		? loginStreak.days + 1
		: 1

	await redis.hSet(LOGIN_STREAK_KEY(userId), {
		days: newDays.toString(),
		lastDate: today,
	})

	return newDays
}


/**
 * Read the user's current streak count from Redis.
 * Returns 0 if no streak is recorded.
 */
export const readUserStreak = async (userId: string): Promise<number> => {
	const value = await redis.get(`user:${userId}:streak:current`)
	return value !== undefined ? parseInt(value, 10) : 0
}

// ─── Grid Size Preference ───────────────────────────────────────────────────

/**
 * Get the user's grid size preference from Redis.
 * Defaults to DEFAULT_GRID_SIZE (4) if not set.
 */
export const getGridSizePreference = async (userId: string): Promise<GridSize> => {
	const value = await redis.get(`user:${userId}:gridSizePreference`)
	if (value === undefined) return DEFAULT_GRID_SIZE
	const parsed = parseInt(value, 10)
	return isValidGridSize(parsed) ? parsed : DEFAULT_GRID_SIZE
}

/**
 * Persist the user's grid size preference to Redis.
 * Only accepts valid GridSize values (4, 6, 8).
 */
export const setGridSizePreference = async (userId: string, gridSize: GridSize): Promise<void> => {
	await redis.set(`user:${userId}:gridSizePreference`, gridSize.toString())
}

// ─── Per-Grid Skill Level ───────────────────────────────────────────────────

/**
 * Get the user's skill level for a specific grid size.
 * Defaults to 1 if not set.
 */
export const getGridSkillLevel = async (userId: string, gridSize: GridSize): Promise<number> => {
	const value = await redis.get(`user:${userId}:skillLevel:${gridSize}`)
	return value !== undefined ? parseInt(value, 10) : 1
}

/**
 * Persist the user's skill level for a specific grid size.
 */
export const setGridSkillLevel = async (userId: string, gridSize: GridSize, level: number): Promise<void> => {
	await redis.set(`user:${userId}:skillLevel:${gridSize}`, level.toString())
}

// ─── Path Level Progression ─────────────────────────────────────────────────

const PATH_LEVEL_KEY = (userId: string): string => `user:${userId}:pathLevel`

/**
 * Get the user's visible level-map position.
 * This is separate from adaptive skill level, which is capped per grid ladder.
 */
export const getPathLevel = async (userId: string): Promise<number> => {
	const value = await redis.get(PATH_LEVEL_KEY(userId))
	return safeParseInt(value, 1)
}

/**
 * Advance the user's visible level-map position after a credited completion.
 */
export const incrementPathLevel = async (userId: string): Promise<number> => {
	const nextLevel = (await getPathLevel(userId)) + 1
	await redis.set(PATH_LEVEL_KEY(userId), nextLevel.toString())
	return nextLevel
}

// ─── Per-Grid Game History ──────────────────────────────────────────────────

/**
 * Get the user's game history for a specific grid size.
 * Returns an empty array if no history is stored.
 */
export const getGridHistory = async (userId: string, gridSize: GridSize): Promise<GameRecord[]> => {
	const value = await redis.get(`user:${userId}:history:${gridSize}`)
	if (value === undefined) return []
	try {
		return JSON.parse(value) as GameRecord[]
	} catch {
		return []
	}
}

/**
 * Persist the user's game history for a specific grid size.
 */
export const setGridHistory = async (userId: string, gridSize: GridSize, history: GameRecord[]): Promise<void> => {
	await redis.set(`user:${userId}:history:${gridSize}`, JSON.stringify(history))
}
