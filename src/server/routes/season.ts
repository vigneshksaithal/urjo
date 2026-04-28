/**
 * Season API Routes
 * Player-facing endpoints for season info and leaderboard.
 */

import { Hono } from 'hono'
import { context, redis } from '@devvit/web/server'

import { getCurrentSeason, getSeasonLeaderboard } from '../lib/seasons'

const HTTP_STATUS_BAD_REQUEST = 400
const HTTP_STATUS_INTERNAL_ERROR = 500

const SEASON_LEADERBOARD_LIMIT = 50

export const seasonRouter = new Hono()

// ─── GET /api/season/current ───────────────────────────────────────────────────

seasonRouter.get('/api/season/current', async (c) => {
    const { userId } = context

    if (!userId) {
        return c.json({ status: 'error', message: 'User ID required' }, HTTP_STATUS_BAD_REQUEST)
    }

    try {
        const season = getCurrentSeason()
        const leaderboardKey = `season:${season.seasonId}:leaderboard`

        const playerScore = await redis.zScore(leaderboardKey, userId)

        let playerRank: number | null = null
        if (playerScore !== undefined && playerScore !== null) {
            const higherEntries = await redis.zRange(leaderboardKey, playerScore + 1, Number.MAX_SAFE_INTEGER, {
                by: 'score',
            })
            playerRank = higherEntries.length + 1
        }

        return c.json({
            status: 'success',
            data: {
                season,
                playerScore: playerScore ?? 0,
                playerRank,
            },
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})

// ─── GET /api/season/leaderboard ───────────────────────────────────────────────

seasonRouter.get('/api/season/leaderboard', async (c) => {
    const { userId } = context

    if (!userId) {
        return c.json({ status: 'error', message: 'User ID required' }, HTTP_STATUS_BAD_REQUEST)
    }

    try {
        const season = getCurrentSeason()
        const leaderboard = await getSeasonLeaderboard(
            season.seasonId,
            userId,
            SEASON_LEADERBOARD_LIMIT,
        )

        return c.json({ status: 'success', data: leaderboard })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})
