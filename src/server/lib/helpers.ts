/**
 * Shared Helper Functions
 * Consolidated helpers used across server routes and lib modules
 */

import { redis, reddit } from '@devvit/web/server'
import { DEFAULT_SKILL_LEVEL } from '../../shared/constants'
import type { GridFilter } from '../../shared/types'

/**
 * Get today's date in UTC as YYYY-MM-DD.
 */
export const getTodayUTC = (): string =>
	new Date().toISOString().split('T')[0] ?? ''

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

// ─── Grid Filter ─────────────────────────────────────────────────────────────

/**
 * Get the user's grid filter preference from Redis.
 * Returns 'all' if not set.
 */
export const getGridFilter = async (userId: string): Promise<GridFilter> => {
	const filter = await redis.get(`user:${userId}:gridFilter`)
	return (filter as GridFilter) ?? 'all'
}

/**
 * Set the user's grid filter preference in Redis.
 */
export const setGridFilter = async (userId: string, filter: GridFilter): Promise<void> => {
	await redis.set(`user:${userId}:gridFilter`, filter)
}

