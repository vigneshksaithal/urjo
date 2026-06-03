/**
 * Presence Manager — tracks active players on a post using a sorted set.
 * Redis key: presence:{postId} — sorted set, score=timestamp(ms), member=userId
 * Stale threshold: 60 seconds
 * TTL on sorted set: 300 seconds (5 minutes)
 */

import { redis } from '@devvit/web/server'

import type { PresenceData, PresencePlayer } from '../../shared/social-types'

const STALE_THRESHOLD_MS = 60_000
const PRESENCE_TTL_SECONDS = 300
const MAX_PLAYERS_RETURNED = 10

const presenceKey = (postId: string): string => `presence:${postId}`

/**
 * Record a heartbeat for a user on a post and return current presence data.
 * Steps:
 * 1. ZADD presence:{postId} with score=now, member=userId
 * 2. ZREMRANGEBYSCORE to prune entries older than 60s
 * 3. EXPIRE 300s on the sorted set
 * 4. ZRANGE by score to read active members (last 60s)
 * 5. Build the player list (max 10)
 */
export const heartbeat = async (postId: string, userId: string): Promise<PresenceData> => {
    const key = presenceKey(postId)
    const now = Date.now()
    const staleThreshold = now - STALE_THRESHOLD_MS

    // Write heartbeat
    await redis.zAdd(key, { member: userId, score: now })

    // Prune stale entries
    await redis.zRemRangeByScore(key, 0, staleThreshold)

    // Set TTL on the sorted set
    await redis.expire(key, PRESENCE_TTL_SECONDS)

    // Read active members (score between staleThreshold+1 and now)
    const activeMembers = await redis.zRange(key, staleThreshold, now, { by: 'score' })

    // Build player list (max 10)
    const players = buildPlayerList(activeMembers.slice(0, MAX_PLAYERS_RETURNED))

    return {
        activeCount: activeMembers.length,
        players,
    }
}

/**
 * Read-only presence check — does not add the caller to the set.
 * Steps:
 * 1. ZRANGE by score to read active members (last 60s)
 * 2. Build the player list (max 10)
 */
export const getPresence = async (postId: string): Promise<PresenceData> => {
    const key = presenceKey(postId)
    const now = Date.now()
    const staleThreshold = now - STALE_THRESHOLD_MS

    const activeMembers = await redis.zRange(key, staleThreshold, now, { by: 'score' })

    const players = buildPlayerList(activeMembers.slice(0, MAX_PLAYERS_RETURNED))

    return {
        activeCount: activeMembers.length,
        players,
    }
}

const buildPlayerList = (
    members: { member: string; score: number }[]
): PresencePlayer[] =>
    members.map(({ member }) => ({
        userId: member,
        username: member, // Username resolution deferred to route layer
    }))
