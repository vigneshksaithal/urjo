/**
 * Season System
 * Pure season score calculation, season boundary computation,
 * and Redis-backed leaderboard management.
 */

import { redis } from '@devvit/web/server'

import type {
    SeasonInfo,
    SeasonLeaderboardEntry,
    SeasonLeaderboardResponse,
    SeasonRecap,
} from '../../shared/growth-types'
import {
    SEASON_BASE_POINTS,
    SEASON_SPEED_BONUS,
    SEASON_PERFECT_BONUS,
    SEASON_TOP_REWARDS,
} from '../../shared/growth-constants'
import { getGridLevelConfig } from '../../shared/constants'
import type { GridSize } from '../../shared/constants'
import { speedFactor, dailyDecay } from '../../shared/scoring'
import { fetchUsername, countPlayersAbove } from './helpers'

// ─── Key Builders ──────────────────────────────────────────────────────────────

const seasonLeaderboardKey = (seasonId: string): string =>
    `season:${seasonId}:leaderboard`

const seasonResultsKey = (seasonId: string): string =>
    `season:${seasonId}:results`

const economyKey = (userId: string): string =>
    `user:${userId}:economy`

// ─── Pure Functions ────────────────────────────────────────────────────────────

/**
 * Calculate season score for a puzzle completion.
 *
 * Difficulty-weighted: `(BASE + graduatedSpeed + perfect) × seasonWeight`, then
 * scaled by the player's daily diminishing-returns factor. Par_Time and the
 * difficulty weight both come from the authored Unified_Ladder bucket.
 */
export const calculateSeasonScore = (
    timeTaken: number,
    gridSize: GridSize,
    level: number,
    mistakes: number,
    dailySolveIndex: number,
): number => {
    const config = getGridLevelConfig(gridSize, level)
    const sf = speedFactor(timeTaken, config.expectedTime)
    const speedComponent = Math.round(SEASON_SPEED_BONUS * sf)
    const perfectComponent = mistakes === 0 ? SEASON_PERFECT_BONUS : 0
    const preDecay = (SEASON_BASE_POINTS + speedComponent + perfectComponent) * config.seasonWeight
    return Math.round(preDecay * dailyDecay(dailySolveIndex))
}

/**
 * Compute season info for a given UTC date.
 * A season starts Monday 00:00 UTC and ends Sunday 23:59:59 UTC.
 * The seasonId is the ISO week identifier (e.g. "2025-W03").
 */
export const getSeasonForDate = (date: Date): SeasonInfo => {
    const utcYear = date.getUTCFullYear()
    const utcMonth = date.getUTCMonth()
    const utcDate = date.getUTCDate()

    // Day of week: Monday=1 ... Sunday=7
    const dayOfWeek = date.getUTCDay() || 7

    // Monday 00:00 UTC of the current week
    const monday = new Date(Date.UTC(utcYear, utcMonth, utcDate - (dayOfWeek - 1)))

    // Sunday 23:59:59 UTC of the current week
    const sunday = new Date(Date.UTC(
        monday.getUTCFullYear(),
        monday.getUTCMonth(),
        monday.getUTCDate() + 6,
        23, 59, 59,
    ))

    // Compute ISO week number using the Thursday of the current week
    const thursday = new Date(Date.UTC(
        monday.getUTCFullYear(),
        monday.getUTCMonth(),
        monday.getUTCDate() + 3,
    ))
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
    const weekNum = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    const isoYear = thursday.getUTCFullYear()
    const seasonId = `${isoYear}-W${String(weekNum).padStart(2, '0')}`

    const startDate = monday.toISOString().split('T')[0]!
    const endDate = sunday.toISOString().split('T')[0]!

    // A season is active if the input date falls within [monday, sunday]
    const dateMs = Date.UTC(utcYear, utcMonth, utcDate)
    const mondayMs = monday.getTime()
    const sundayEndMs = sunday.getTime()
    const isActive = dateMs >= mondayMs && dateMs <= sundayEndMs

    return {
        seasonId,
        seasonNumber: weekNum,
        startDate,
        endDate,
        isActive,
    }
}

/**
 * Get current season metadata based on the current UTC date.
 */
export const getCurrentSeason = (): SeasonInfo =>
    getSeasonForDate(new Date())

// ─── Redis Persistence ─────────────────────────────────────────────────────────

/**
 * Record a season score for a player.
 * Uses zScore + zAdd to increment the player's score in the season leaderboard.
 */
export const recordSeasonScore = async (
    seasonId: string,
    userId: string,
    score: number,
): Promise<void> => {
    const key = seasonLeaderboardKey(seasonId)
    const currentScore = await redis.zScore(key, userId)
    const newScore = (currentScore ?? 0) + score
    await redis.zAdd(key, { member: userId, score: newScore })
    await redis.expire(key, 7776000) // 90 days
}

/**
 * Get season leaderboard: top N entries + the requesting player's rank and score.
 */
export const getSeasonLeaderboard = async (
    seasonId: string,
    userId: string,
    limit: number,
): Promise<SeasonLeaderboardResponse> => {
    const key = seasonLeaderboardKey(seasonId)
    const season = getCurrentSeason()

    // Top N entries (highest scores first)
    const topEntries = await redis.zRange(key, 0, limit - 1, {
        by: 'rank',
        reverse: true,
    })

    // Build leaderboard entries with usernames
    const entries: SeasonLeaderboardEntry[] = await Promise.all(
        topEntries.map(async (entry, index) => {
            const username = await fetchUsername(entry.member, userId)
            return {
                rank: index + 1,
                userId: entry.member,
                username,
                score: entry.score,
            }
        }),
    )

    // Player's own rank and score
    const playerScore = await redis.zScore(key, userId)
    let playerRank: number | null = null

    if (playerScore !== undefined && playerScore !== null) {
        // Count how many users have a strictly higher score (robust to
        // fractional scores and ties).
        playerRank = (await countPlayersAbove(key, playerScore)) + 1
    }

    return {
        season,
        entries,
        playerRank,
        playerScore: playerScore ?? 0,
    }
}

/**
 * Generate season recap data: top 10 players + total participants.
 */
export const getSeasonRecap = async (seasonId: string): Promise<SeasonRecap> => {
    const key = seasonLeaderboardKey(seasonId)

    // Top 10 entries
    const topEntries = await redis.zRange(key, 0, 9, {
        by: 'rank',
        reverse: true,
    })

    const topPlayers = await Promise.all(
        topEntries.map(async (entry) => {
            const username = await fetchUsername(entry.member)
            return {
                userId: entry.member,
                username,
                score: entry.score,
            }
        }),
    )

    // Total participants = count of all entries in the sorted set
    const allEntries = await redis.zRange(key, 0, -1, { by: 'rank' })
    const totalParticipants = allEntries.length

    return {
        seasonId,
        topPlayers,
        totalParticipants,
    }
}

/**
 * Award season rewards (coins) to top-ranked players.
 * Uses the same coin-awarding pattern as the economy module.
 */
export const awardSeasonRewards = async (seasonId: string): Promise<void> => {
    const key = seasonLeaderboardKey(seasonId)

    for (const reward of SEASON_TOP_REWARDS) {
        // Get the player at this rank (0-indexed, so rank 1 = index 0)
        const entries = await redis.zRange(key, reward.rank - 1, reward.rank - 1, {
            by: 'rank',
            reverse: true,
        })

        const entry = entries[0]
        if (!entry) continue

        const userId = entry.member

        // Award coins using the same pattern as referrals/economy
        const coinsStr = await redis.hGet(economyKey(userId), 'coins')
        const totalCoinsStr = await redis.hGet(economyKey(userId), 'totalCoins')
        const coins = parseInt(coinsStr ?? '0', 10)
        const totalCoins = parseInt(totalCoinsStr ?? '0', 10)

        await redis.hSet(economyKey(userId), {
            coins: String(coins + reward.coins),
            totalCoins: String(totalCoins + reward.coins),
        })
    }

    // Store season results for history
    const recap = await getSeasonRecap(seasonId)
    await redis.set(seasonResultsKey(seasonId), JSON.stringify(recap))
}
