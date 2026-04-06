/**
 * Shared Helper Functions
 * Consolidated helpers used across server routes and lib modules
 */

import { redis, reddit } from '@devvit/web/server'
import { DEFAULT_SKILL_LEVEL } from '../../shared/constants'

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
 */
export const getDayDifference = (date1: string, date2: string): number => {
	const d1 = new Date(date1)
	const d2 = new Date(date2)
	const diffTime = d2.getTime() - d1.getTime()
	return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

