/**
 * Race API Routes
 * Handles race matchmaking, status polling, completion, and abandonment.
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { context, redis } from '@devvit/web/server'
import { isValidGridSize } from '../../shared/constants'
import type { GridSize } from '../../shared/constants'
import { joinRace, getRaceStatus, completeRace, abandonRace } from '../lib/race'
import { calculateCoinReward, getUserEconomy } from '../lib/economy'
import { getTodayUTC, getDayDifference, updateLoginStreak } from '../lib/helpers'
import { trackRaceJoin, trackRaceMatch, trackRaceComplete } from '../lib/analytics'
import { recordChannelOpen } from '../lib/viral-tracker'

// ─── Constants ──────────────────────────────────────────────────────────────────

const HTTP_STATUS_BAD_REQUEST = 400
const HTTP_STATUS_INTERNAL_ERROR = 500
const VALID_GRID_SIZES = [4, 6, 8] as const

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Get the user's current streak data from Redis.
 */
const getStreakData = async (userId: string) => {
    const [currentStr, longestStr, lastDate] = await Promise.all([
        redis.get(`user:${userId}:streak:current`),
        redis.get(`user:${userId}:streak:longest`),
        redis.get(`user:${userId}:streak:lastDate`),
    ])

    return {
        currentStreak: currentStr ? parseInt(currentStr, 10) : 0,
        longestStreak: longestStr ? parseInt(longestStr, 10) : 0,
        lastPlayedDate: lastDate ?? null,
    }
}

/**
 * Update the user's streak based on completion.
 */
const updateStreak = async (userId: string) => {
    const today = getTodayUTC()
    const streakData = await getStreakData(userId)

    if (streakData.lastPlayedDate === today) {
        return streakData
    }

    let newStreak = 1

    if (streakData.lastPlayedDate) {
        const dayDiff = getDayDifference(streakData.lastPlayedDate, today)
        if (dayDiff === 1 || dayDiff === 2) {
            newStreak = streakData.currentStreak + 1
        } else if (dayDiff > 2) {
            const economy = await getUserEconomy(userId)
            if (economy.streakFreezes > 0) {
                await redis.hIncrBy(`user:${userId}:economy`, 'streakFreezes', -1)
                newStreak = streakData.currentStreak + 1
            }
        }
    }

    const newLongest = Math.max(newStreak, streakData.longestStreak)

    await Promise.all([
        redis.set(`user:${userId}:streak:current`, newStreak.toString()),
        redis.set(`user:${userId}:streak:longest`, newLongest.toString()),
        redis.set(`user:${userId}:streak:lastDate`, today),
    ])

    return {
        currentStreak: newStreak,
        longestStreak: newLongest,
        lastPlayedDate: today,
    }
}

/**
 * Award coins and streak on race completion (mirrors game.ts applyCoinReward).
 */
const awardRaceCompletion = async (
    userId: string,
    timeTaken: number,
    gridSize: GridSize
) => {
    const streak = await updateStreak(userId)
    const today = getTodayUTC()
    const economyKey = `user:${userId}:economy`
    const economyData = await redis.hGetAll(economyKey)
    const lastDailySolve = economyData?.['dailyFirstSolve'] ?? null
    const isDailyFirst = lastDailySolve !== today

    const consecutiveLoginDays = await updateLoginStreak(userId, isDailyFirst)

    const coinReward = calculateCoinReward(
        timeTaken,
        1, // default skill level for race context
        streak.currentStreak,
        isDailyFirst,
        0, // mistakes not tracked in race
        consecutiveLoginDays,
        gridSize
    )

    await Promise.all([
        redis.hIncrBy(economyKey, 'coins', coinReward.total),
        redis.hIncrBy(economyKey, 'totalCoins', coinReward.total),
        redis.hIncrBy(economyKey, 'totalSolves', 1),
    ])

    if (isDailyFirst) {
        await redis.hSet(economyKey, { dailyFirstSolve: today })
    }

    // Update leaderboards
    await Promise.all([
        redis.zAdd('leaderboard:streak', { score: streak.currentStreak, member: userId }),
        redis.zAdd(`leaderboard:speed:${today}:${gridSize}`, { score: timeTaken, member: userId }),
        redis.expire(`leaderboard:speed:${today}:${gridSize}`, 2592000),
    ])

    return { coinReward, streak }
}

// ─── Router ─────────────────────────────────────────────────────────────────────

export const raceRouter = new Hono()

// ─── POST /api/race/join ────────────────────────────────────────────────────────

raceRouter.post('/api/race/join', async (c: Context): Promise<Response> => {
    const { userId, postId } = context
    if (!userId) return c.json({ status: 'error', message: 'User must be logged in' }, HTTP_STATUS_BAD_REQUEST)
    if (!postId) return c.json({ status: 'error', message: 'Must be in a post context' }, HTTP_STATUS_BAD_REQUEST)

    try {
        const body = await c.req.json().catch(() => null)
        if (!body || typeof body !== 'object') {
            return c.json({ status: 'error', message: 'Invalid request body' }, HTTP_STATUS_BAD_REQUEST)
        }

        const { gridSize } = body as Record<string, unknown>
        if (typeof gridSize !== 'number' || !VALID_GRID_SIZES.includes(gridSize as typeof VALID_GRID_SIZES[number])) {
            return c.json({ status: 'error', message: 'gridSize must be 4, 6, or 8' }, HTTP_STATUS_BAD_REQUEST)
        }

        const result = await joinRace(postId, userId, gridSize as GridSize)

        // ─── Analytics: track race join (non-blocking) ────────────────────
        // Fire only on a new queue entry or new match, not on resume of an
        // existing race (status === 'already_racing'). Mirrors the dedup
        // semantics of trackPostOpen / trackChallengeOpen.
        if (result.status === 'waiting' || result.status === 'matched') {
            try {
                const today = getTodayUTC()
                await trackRaceJoin(today, postId, userId)
                await recordChannelOpen(today, 'race', userId)
                if (result.status === 'matched') {
                    await trackRaceMatch(today, postId, result.sessionId)
                }
            } catch (err) {
                console.error('[Race] Join tracking failed (non-critical):', err)
            }
        }

        return c.json({ status: 'success', data: result })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})

// ─── GET /api/race/status/:sessionId ────────────────────────────────────────────

raceRouter.get('/api/race/status/:sessionId', async (c: Context): Promise<Response> => {
    const { userId, postId } = context
    if (!userId) return c.json({ status: 'error', message: 'User must be logged in' }, HTTP_STATUS_BAD_REQUEST)
    if (!postId) return c.json({ status: 'error', message: 'Must be in a post context' }, HTTP_STATUS_BAD_REQUEST)

    try {
        const sessionId = c.req.param('sessionId')
        if (!sessionId) {
            return c.json({ status: 'error', message: 'sessionId is required' }, HTTP_STATUS_BAD_REQUEST)
        }

        const result = await getRaceStatus(sessionId, userId, postId)
        return c.json({ status: 'success', data: result })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})

// ─── POST /api/race/complete/:sessionId ─────────────────────────────────────────

raceRouter.post('/api/race/complete/:sessionId', async (c: Context): Promise<Response> => {
    const { userId, postId } = context
    if (!userId) return c.json({ status: 'error', message: 'User must be logged in' }, HTTP_STATUS_BAD_REQUEST)
    if (!postId) return c.json({ status: 'error', message: 'Must be in a post context' }, HTTP_STATUS_BAD_REQUEST)

    try {
        const sessionId = c.req.param('sessionId')
        if (!sessionId) {
            return c.json({ status: 'error', message: 'sessionId is required' }, HTTP_STATUS_BAD_REQUEST)
        }

        const body = await c.req.json().catch(() => null)
        if (!body || typeof body !== 'object') {
            return c.json({ status: 'error', message: 'Invalid request body' }, HTTP_STATUS_BAD_REQUEST)
        }

        const { timeTaken: rawTime } = body as Record<string, unknown>
        const timeTaken = typeof rawTime === 'number' ? rawTime : parseFloat(String(rawTime))

        if (!Number.isFinite(timeTaken) || timeTaken <= 0) {
            return c.json({ status: 'error', message: 'timeTaken must be > 0' }, HTTP_STATUS_BAD_REQUEST)
        }

        const result = await completeRace(sessionId, userId, postId, timeTaken)

        // If race is finished (both players done), award coins/streak to this player
        if (!result.error && !result.waitingForOpponent && result.winnerId) {
            // Get grid size from the race session
            const raceKey = `race:${postId}:${sessionId}`
            const session = await redis.hGetAll(raceKey)
            const gridSizeRaw = parseInt(session?.['gridSize'] ?? '4', 10)
            const gridSize: GridSize = isValidGridSize(gridSizeRaw) ? gridSizeRaw : 4

            // ─── Analytics: track race completion (non-blocking) ──────────
            try {
                await trackRaceComplete(getTodayUTC(), postId, sessionId, result.winnerId)
            } catch (err) {
                console.error('[Race] Complete tracking failed (non-critical):', err)
            }

            try {
                const { coinReward, streak } = await awardRaceCompletion(userId, timeTaken, gridSize)
                return c.json({
                    status: 'success',
                    data: { ...result, coinReward, streak },
                })
            } catch (rewardErr) {
                // Award failed but race completion succeeded — still return result
                console.error('[Race] Coin/streak award failed:', rewardErr)
            }
        }

        return c.json({ status: 'success', data: result })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})

// ─── POST /api/race/abandon/:sessionId ──────────────────────────────────────────

raceRouter.post('/api/race/abandon/:sessionId', async (c: Context): Promise<Response> => {
    const { userId, postId } = context
    if (!userId) return c.json({ status: 'error', message: 'User must be logged in' }, HTTP_STATUS_BAD_REQUEST)
    if (!postId) return c.json({ status: 'error', message: 'Must be in a post context' }, HTTP_STATUS_BAD_REQUEST)

    try {
        const sessionId = c.req.param('sessionId')
        if (!sessionId) {
            return c.json({ status: 'error', message: 'sessionId is required' }, HTTP_STATUS_BAD_REQUEST)
        }

        await abandonRace(sessionId, userId, postId)
        return c.json({ status: 'success', data: { abandoned: true } })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})
