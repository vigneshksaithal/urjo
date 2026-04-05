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