import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
    calculateSeasonScore,
    getSeasonForDate,
    getCurrentSeason,
    recordSeasonScore,
    getSeasonLeaderboard,
    getSeasonRecap,
    awardSeasonRewards,
} from '../seasons'
import {
    SEASON_BASE_POINTS,
    SEASON_SPEED_BONUS,
    SEASON_PERFECT_BONUS,
    SEASON_TOP_REWARDS,
} from '../../../shared/growth-constants'

const seasonDateArb = (): fc.Arbitrary<Date> =>
    fc.date({
        min: new Date('2020-01-01T00:00:00Z'),
        max: new Date('2030-12-31T23:59:59Z'),
    }).filter((date) => !Number.isNaN(date.getTime()))

// ─── calculateSeasonScore (pure) ──────────────────────────────────────────────

describe('calculateSeasonScore', () => {
    it('returns base points only when slow and has mistakes', () => {
        const score = calculateSeasonScore(100, 50, 3)
        expect(score).toBe(SEASON_BASE_POINTS)
    })

    it('includes speed bonus when timeTaken <= parTime', () => {
        const score = calculateSeasonScore(50, 50, 3)
        expect(score).toBe(SEASON_BASE_POINTS + SEASON_SPEED_BONUS)
    })

    it('includes perfect bonus when mistakes === 0', () => {
        const score = calculateSeasonScore(100, 50, 0)
        expect(score).toBe(SEASON_BASE_POINTS + SEASON_PERFECT_BONUS)
    })

    it('includes both bonuses when fast and perfect', () => {
        const score = calculateSeasonScore(30, 50, 0)
        expect(score).toBe(SEASON_BASE_POINTS + SEASON_SPEED_BONUS + SEASON_PERFECT_BONUS)
    })

    it('speed bonus applies at exact par time boundary', () => {
        const score = calculateSeasonScore(50, 50, 1)
        expect(score).toBe(SEASON_BASE_POINTS + SEASON_SPEED_BONUS)
    })
})

// ─── getSeasonForDate (pure) ──────────────────────────────────────────────────

describe('getSeasonForDate', () => {
    it('returns Monday start and Sunday end for a Wednesday', () => {
        // 2025-01-15 is a Wednesday
        const date = new Date(Date.UTC(2025, 0, 15, 12, 0, 0))
        const season = getSeasonForDate(date)

        expect(season.startDate).toBe('2025-01-13') // Monday
        expect(season.endDate).toBe('2025-01-19')   // Sunday
        expect(season.isActive).toBe(true)
    })

    it('returns correct season for a Monday', () => {
        // 2025-01-13 is a Monday
        const date = new Date(Date.UTC(2025, 0, 13, 0, 0, 0))
        const season = getSeasonForDate(date)

        expect(season.startDate).toBe('2025-01-13')
        expect(season.endDate).toBe('2025-01-19')
        expect(season.isActive).toBe(true)
    })

    it('returns correct season for a Sunday', () => {
        // 2025-01-19 is a Sunday
        const date = new Date(Date.UTC(2025, 0, 19, 23, 59, 59))
        const season = getSeasonForDate(date)

        expect(season.startDate).toBe('2025-01-13')
        expect(season.endDate).toBe('2025-01-19')
        expect(season.isActive).toBe(true)
    })

    it('seasonId follows ISO week format', () => {
        const date = new Date(Date.UTC(2025, 0, 15))
        const season = getSeasonForDate(date)

        expect(season.seasonId).toMatch(/^\d{4}-W\d{2}$/)
    })

    it('seasonNumber is a positive integer', () => {
        const date = new Date(Date.UTC(2025, 0, 15))
        const season = getSeasonForDate(date)

        expect(season.seasonNumber).toBeGreaterThan(0)
        expect(Number.isInteger(season.seasonNumber)).toBe(true)
    })
})

// ─── getCurrentSeason ─────────────────────────────────────────────────────────

describe('getCurrentSeason', () => {
    it('returns a valid SeasonInfo for the current date', () => {
        const season = getCurrentSeason()

        expect(season.seasonId).toMatch(/^\d{4}-W\d{2}$/)
        expect(season.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(season.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(typeof season.isActive).toBe('boolean')
        expect(season.seasonNumber).toBeGreaterThan(0)
    })
})

// ─── Property 4: Season Boundary Computation ──────────────────────────────────

describe('Season Boundary Computation — Property 4', () => {
    /**
     * **Validates: Requirements 5.1**
     *
     * Property 4: Season Boundary Computation
     * For any date, the computed season start is a Monday 00:00 UTC,
     * end is Sunday 23:59:59 UTC, span is exactly 7 days minus 1 second,
     * and the input date falls within [start, end].
     */
    it('start is always a Monday 00:00 UTC', () => {
        const dateArb = seasonDateArb()

        fc.assert(
            fc.property(dateArb, (date) => {
                const season = getSeasonForDate(date)
                const start = new Date(season.startDate + 'T00:00:00Z')

                // Monday = 1 in getUTCDay(), but getUTCDay() returns 0 for Sunday
                expect(start.getUTCDay()).toBe(1) // Monday
                expect(start.getUTCHours()).toBe(0)
                expect(start.getUTCMinutes()).toBe(0)
                expect(start.getUTCSeconds()).toBe(0)
            }),
            { numRuns: 100 },
        )
    })

    it('end is always a Sunday', () => {
        const dateArb = seasonDateArb()

        fc.assert(
            fc.property(dateArb, (date) => {
                const season = getSeasonForDate(date)
                const end = new Date(season.endDate + 'T23:59:59Z')

                expect(end.getUTCDay()).toBe(0) // Sunday
            }),
            { numRuns: 100 },
        )
    })

    it('span between start and end is exactly 7 days minus 1 second', () => {
        const dateArb = seasonDateArb()

        fc.assert(
            fc.property(dateArb, (date) => {
                const season = getSeasonForDate(date)
                const startMs = new Date(season.startDate + 'T00:00:00Z').getTime()
                const endMs = new Date(season.endDate + 'T23:59:59Z').getTime()

                const sevenDaysMinusOneSecond = 7 * 24 * 60 * 60 * 1000 - 1000
                expect(endMs - startMs).toBe(sevenDaysMinusOneSecond)
            }),
            { numRuns: 100 },
        )
    })

    it('input date always falls within [start, end]', () => {
        const dateArb = seasonDateArb()

        fc.assert(
            fc.property(dateArb, (date) => {
                const season = getSeasonForDate(date)
                const startMs = new Date(season.startDate + 'T00:00:00Z').getTime()
                const endMs = new Date(season.endDate + 'T23:59:59Z').getTime()
                const dateMs = date.getTime()

                expect(dateMs).toBeGreaterThanOrEqual(startMs)
                expect(dateMs).toBeLessThanOrEqual(endMs)
            }),
            { numRuns: 100 },
        )
    })
})

// ─── Property 5: Season Score Calculation ─────────────────────────────────────

describe('Season Score Calculation — Property 5', () => {
    /**
     * **Validates: Requirements 5.3**
     *
     * Property 5: Season Score Calculation
     * For any (timeTaken > 0, parTime > 0, mistakes >= 0), score is always in
     * [SEASON_BASE_POINTS, SEASON_BASE_POINTS + SEASON_SPEED_BONUS + SEASON_PERFECT_BONUS],
     * speed bonus iff timeTaken <= parTime, perfect bonus iff mistakes === 0.
     */
    const MIN_SCORE = SEASON_BASE_POINTS
    const MAX_SCORE = SEASON_BASE_POINTS + SEASON_SPEED_BONUS + SEASON_PERFECT_BONUS

    it('score is always within [BASE, BASE + SPEED + PERFECT]', () => {
        const arb = fc.record({
            timeTaken: fc.integer({ min: 1, max: 99999 }),
            parTime: fc.integer({ min: 1, max: 99999 }),
            mistakes: fc.integer({ min: 0, max: 999 }),
        })

        fc.assert(
            fc.property(arb, ({ timeTaken, parTime, mistakes }) => {
                const score = calculateSeasonScore(timeTaken, parTime, mistakes)
                expect(score).toBeGreaterThanOrEqual(MIN_SCORE)
                expect(score).toBeLessThanOrEqual(MAX_SCORE)
            }),
            { numRuns: 100 },
        )
    })

    it('speed bonus is awarded iff timeTaken <= parTime', () => {
        const arb = fc.record({
            timeTaken: fc.integer({ min: 1, max: 99999 }),
            parTime: fc.integer({ min: 1, max: 99999 }),
            mistakes: fc.integer({ min: 0, max: 999 }),
        })

        fc.assert(
            fc.property(arb, ({ timeTaken, parTime, mistakes }) => {
                const score = calculateSeasonScore(timeTaken, parTime, mistakes)
                const expectedSpeedBonus = timeTaken <= parTime ? SEASON_SPEED_BONUS : 0
                const expectedPerfectBonus = mistakes === 0 ? SEASON_PERFECT_BONUS : 0

                expect(score).toBe(SEASON_BASE_POINTS + expectedSpeedBonus + expectedPerfectBonus)
            }),
            { numRuns: 100 },
        )
    })

    it('perfect bonus is awarded iff mistakes === 0', () => {
        const arb = fc.record({
            timeTaken: fc.integer({ min: 1, max: 99999 }),
            parTime: fc.integer({ min: 1, max: 99999 }),
            mistakes: fc.integer({ min: 0, max: 999 }),
        })

        fc.assert(
            fc.property(arb, ({ timeTaken, parTime, mistakes }) => {
                const score = calculateSeasonScore(timeTaken, parTime, mistakes)
                const hasPerfectBonus = score >= SEASON_BASE_POINTS + SEASON_PERFECT_BONUS ||
                    (score === SEASON_BASE_POINTS + SEASON_SPEED_BONUS + SEASON_PERFECT_BONUS)

                if (mistakes === 0) {
                    // Score must include perfect bonus
                    const withoutPerfect = score - SEASON_PERFECT_BONUS
                    expect(withoutPerfect).toBeGreaterThanOrEqual(SEASON_BASE_POINTS)
                } else {
                    // Score must NOT include perfect bonus
                    expect(score).toBeLessThanOrEqual(SEASON_BASE_POINTS + SEASON_SPEED_BONUS)
                }
            }),
            { numRuns: 100 },
        )
    })
})

// ─── recordSeasonScore (Redis-backed) ─────────────────────────────────────────

const testRecord = createDevvitTest({ userId: 't2_testuser' })

testRecord('recordSeasonScore adds score to leaderboard', async () => {
    await recordSeasonScore('2025-W03', 't2_testuser', 15)

    const score = await redis.zScore('season:2025-W03:leaderboard', 't2_testuser')
    expect(score).toBe(15)
})

const testRecordIncrement = createDevvitTest({ userId: 't2_testuser' })

testRecordIncrement('recordSeasonScore increments existing score', async () => {
    await recordSeasonScore('2025-W03', 't2_testuser', 10)
    await recordSeasonScore('2025-W03', 't2_testuser', 15)

    const score = await redis.zScore('season:2025-W03:leaderboard', 't2_testuser')
    expect(score).toBe(25)
})

// ─── getSeasonLeaderboard (Redis-backed) ──────────────────────────────────────

const testLeaderboard = createDevvitTest({ userId: 't2_testuser' })

testLeaderboard('getSeasonLeaderboard returns top entries and player rank', async () => {
    const seasonId = getCurrentSeason().seasonId

    await redis.zAdd(`season:${seasonId}:leaderboard`, { member: 't2_alice', score: 100 })
    await redis.zAdd(`season:${seasonId}:leaderboard`, { member: 't2_bob', score: 200 })
    await redis.zAdd(`season:${seasonId}:leaderboard`, { member: 't2_testuser', score: 50 })

    const result = await getSeasonLeaderboard(seasonId, 't2_testuser', 10)

    expect(result.entries).toHaveLength(3)
    expect(result.entries[0]?.userId).toBe('t2_bob')
    expect(result.entries[0]?.score).toBe(200)
    expect(result.entries[1]?.userId).toBe('t2_alice')
    expect(result.entries[1]?.score).toBe(100)
    expect(result.playerScore).toBe(50)
    expect(result.playerRank).toBe(3)
})

const testLeaderboardEmpty = createDevvitTest({ userId: 't2_testuser' })

testLeaderboardEmpty('getSeasonLeaderboard returns empty for no data', async () => {
    const result = await getSeasonLeaderboard('2025-W99', 't2_testuser', 10)

    expect(result.entries).toHaveLength(0)
    expect(result.playerRank).toBeNull()
    expect(result.playerScore).toBe(0)
})

// ─── getSeasonRecap (Redis-backed) ────────────────────────────────────────────

const testRecap = createDevvitTest({ userId: 't2_testuser' })

testRecap('getSeasonRecap returns top players and total participants', async () => {
    await redis.zAdd('season:2025-W03:leaderboard', { member: 't2_alice', score: 100 })
    await redis.zAdd('season:2025-W03:leaderboard', { member: 't2_bob', score: 200 })
    await redis.zAdd('season:2025-W03:leaderboard', { member: 't2_charlie', score: 50 })

    const recap = await getSeasonRecap('2025-W03')

    expect(recap.seasonId).toBe('2025-W03')
    expect(recap.totalParticipants).toBe(3)
    expect(recap.topPlayers).toHaveLength(3)
    expect(recap.topPlayers[0]?.score).toBe(200)
})

// ─── awardSeasonRewards (Redis-backed) ────────────────────────────────────────

const testRewards = createDevvitTest({ userId: 't2_testuser' })

testRewards('awardSeasonRewards gives coins to top 3 players', async () => {
    // Seed leaderboard
    await redis.zAdd('season:2025-W03:leaderboard', { member: 't2_first', score: 300 })
    await redis.zAdd('season:2025-W03:leaderboard', { member: 't2_second', score: 200 })
    await redis.zAdd('season:2025-W03:leaderboard', { member: 't2_third', score: 100 })

    // Initialize economy for all players
    await redis.hSet('user:t2_first:economy', { coins: '0', totalCoins: '0' })
    await redis.hSet('user:t2_second:economy', { coins: '0', totalCoins: '0' })
    await redis.hSet('user:t2_third:economy', { coins: '0', totalCoins: '0' })

    await awardSeasonRewards('2025-W03')

    // Check coins awarded
    const firstCoins = await redis.hGet('user:t2_first:economy', 'coins')
    const secondCoins = await redis.hGet('user:t2_second:economy', 'coins')
    const thirdCoins = await redis.hGet('user:t2_third:economy', 'coins')

    expect(firstCoins).toBe(String(SEASON_TOP_REWARDS[0]!.coins))
    expect(secondCoins).toBe(String(SEASON_TOP_REWARDS[1]!.coins))
    expect(thirdCoins).toBe(String(SEASON_TOP_REWARDS[2]!.coins))
})

const testRewardsStoresResults = createDevvitTest({ userId: 't2_testuser' })

testRewardsStoresResults('awardSeasonRewards stores season results in Redis', async () => {
    await redis.zAdd('season:2025-W03:leaderboard', { member: 't2_first', score: 300 })
    await redis.hSet('user:t2_first:economy', { coins: '0', totalCoins: '0' })

    await awardSeasonRewards('2025-W03')

    const resultsStr = await redis.get('season:2025-W03:results')
    expect(resultsStr).toBeDefined()

    const results = JSON.parse(resultsStr!) as { seasonId: string; totalParticipants: number }
    expect(results.seasonId).toBe('2025-W03')
    expect(results.totalParticipants).toBe(1)
})
