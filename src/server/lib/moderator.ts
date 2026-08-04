/**
 * Moderator Auth Module
 * Hono middleware and cached moderator check for admin/analytics endpoints
 */

import type { MiddlewareHandler } from 'hono'
import { context, redis, reddit } from '@devvit/web/server'

import { registerUserDynamicKey } from './account-deletion'

const HTTP_STATUS_UNAUTHORIZED = 401
const HTTP_STATUS_FORBIDDEN = 403
const HTTP_STATUS_INTERNAL_ERROR = 500

const MOD_CACHE_TTL = 300 // 5 minutes

/**
 * Build the Redis cache key for a moderator check.
 */
const modCacheKey = (subredditId: string, userId: string): string =>
    `mod:${subredditId}:${userId}`

/**
 * Check if a user is a moderator of a subreddit, with Redis caching.
 * Checks cache first (5-min TTL), falls back to Reddit API getModerators().
 */
export const isModeratorCached = async (subredditId: string, userId: string): Promise<boolean> => {
    const cacheKey = modCacheKey(subredditId, userId)

    // Check cache first
    try {
        const cached = await redis.get(cacheKey)
        if (cached !== undefined) {
            return cached === '1'
        }
    } catch {
        // Cache read failed — fall through to API check
    }

    // Fall back to Reddit API
    const { subredditName } = context
    if (!subredditName) {
        throw new Error('subredditName not available in context')
    }

    const isMod = await checkModeratorViaApi(subredditName, userId)

    // Cache the result (fire-and-forget — cache write failure is non-critical)
    try {
        await registerUserDynamicKey(userId, cacheKey)
        await redis.set(cacheKey, isMod ? '1' : '0')
        await redis.expire(cacheKey, MOD_CACHE_TTL)
    } catch {
        // Cache write failed — next request will re-check
    }

    return isMod
}

/**
 * Check moderator status via the Reddit API.
 * Uses getModerators with a username filter to check a specific user.
 */
const checkModeratorViaApi = async (subredditName: string, userId: string): Promise<boolean> => {
    try {
        // Look up the user's username from their ID
        const user = await reddit.getUserById(userId as `t2_${string}`)
        if (!user?.username) return false

        // Check if the user is in the moderator list
        const mods = reddit.getModerators({
            subredditName,
            username: user.username,
        })
        const modList = await mods.all()
        return modList.length > 0
    } catch {
        // API failure — throw so middleware returns 500 rather than silently granting/denying
        throw new Error('Failed to verify moderator status')
    }
}

/**
 * Hono middleware that requires the current user to be a moderator.
 * Returns 401 if no userId, 403 if not a moderator, 500 if API check fails.
 */
export const requireModerator = (): MiddlewareHandler =>
    async (c, next) => {
        const { userId, subredditId } = context

        if (!userId) {
            return c.json({ error: 'Authentication required' }, HTTP_STATUS_UNAUTHORIZED)
        }

        if (!subredditId) {
            return c.json({ error: 'Subreddit context required' }, HTTP_STATUS_INTERNAL_ERROR)
        }

        try {
            const isMod = await isModeratorCached(subredditId, userId)
            if (!isMod) {
                return c.json({ error: 'Moderator access required' }, HTTP_STATUS_FORBIDDEN)
            }
        } catch {
            return c.json({ error: 'Failed to verify moderator status' }, HTTP_STATUS_INTERNAL_ERROR)
        }

        await next()
    }
