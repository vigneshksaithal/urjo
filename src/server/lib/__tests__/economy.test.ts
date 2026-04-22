import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { expect } from 'vitest'
import { getUserEconomy, saveUserEconomy, calculateCoinReward, getUserStreakData } from '../economy'
import {
    COIN_BASE,
    COIN_SPEED_BONUS,
    COIN_DAILY_BONUS,
    COIN_STREAK_MULTIPLIER,
    COIN_PERFECT_BONUS,
    getDailyLoginBonus,
} from '../../../shared/constants'

// ─── calculateCoinReward (pure — no Redis needed) ─────────────────────────────

import { describe, it } from 'vitest'

describe('calculateCoinReward', () => {
    it('total equals base + streakBonus + speedBonus + dailyBonus + perfectBonus + loginBonus', () => {
        const reward = calculateCoinReward(5, 1, 3, true, 0, 2)
        expect(reward.total).toBe(reward.base + reward.streakBonus + reward.speedBonus + reward.dailyBonus + reward.perfectBonus + reward.loginBonus)
    })

    it('includes COIN_SPEED_BONUS when timeTaken <= parTime (expectedTime * 2)', () => {
        // level 1: expectedTime=45, parTime=90; timeTaken=90 is at par
        const reward = calculateCoinReward(90, 1, 0, false, 0)
        expect(reward.speedBonus).toBe(COIN_SPEED_BONUS)
    })

    it('does not include COIN_SPEED_BONUS when timeTaken > parTime', () => {
        // level 1: parTime=90; timeTaken=91 exceeds par
        const reward = calculateCoinReward(91, 1, 0, false, 0)
        expect(reward.speedBonus).toBe(0)
    })

    it('includes COIN_DAILY_BONUS when isDailyFirst is true', () => {
        const reward = calculateCoinReward(100, 1, 0, true, 0)
        expect(reward.dailyBonus).toBe(COIN_DAILY_BONUS)
    })

    it('does not include COIN_DAILY_BONUS when isDailyFirst is false', () => {
        const reward = calculateCoinReward(100, 1, 0, false, 0)
        expect(reward.dailyBonus).toBe(0)
    })

    it('base is always COIN_BASE', () => {
        const reward = calculateCoinReward(5, 1, 0, false, 0)
        expect(reward.base).toBe(COIN_BASE)
    })

    it('streakBonus equals currentStreak * COIN_STREAK_MULTIPLIER', () => {
        const reward = calculateCoinReward(100, 1, 5, false, 0)
        expect(reward.streakBonus).toBe(5 * COIN_STREAK_MULTIPLIER)
    })

    it('perfectBonus is COIN_PERFECT_BONUS when mistakes=0', () => {
        const reward = calculateCoinReward(100, 1, 0, false, 0)
        expect(reward.perfectBonus).toBe(COIN_PERFECT_BONUS)
    })

    it('perfectBonus is 0 when mistakes > 0', () => {
        const reward = calculateCoinReward(100, 1, 0, false, 1)
        expect(reward.perfectBonus).toBe(0)
    })

    // Login bonus tests
    it('loginBonus is 0 when isDailyFirst is false', () => {
        const reward = calculateCoinReward(100, 1, 0, false, 0, 5)
        expect(reward.loginBonus).toBe(0)
    })

    it('loginBonus is 0 when isDailyFirst is true but consecutiveLoginDays is 0', () => {
        const reward = calculateCoinReward(100, 1, 0, true, 0, 0)
        expect(reward.loginBonus).toBe(0)
    })

    it('loginBonus equals getDailyLoginBonus(consecutiveLoginDays) when isDailyFirst is true', () => {
        const reward = calculateCoinReward(100, 1, 0, true, 0, 3)
        expect(reward.loginBonus).toBe(getDailyLoginBonus(3))
    })

    it('loginBonus works for day 5+ (max bonus)', () => {
        const reward = calculateCoinReward(100, 1, 0, true, 0, 10)
        expect(reward.loginBonus).toBe(25)
    })
})

// ─── getUserEconomy (Redis-backed) ────────────────────────────────────────────

const test = createDevvitTest({ userId: 't2_testuser' })

test('getUserEconomy returns defaults for new user', async () => {
    const economy = await getUserEconomy('t2_testuser')
    expect(economy.coins).toBe(0)
    expect(economy.totalCoins).toBe(0)
    expect(economy.totalSolves).toBe(0)
    expect(economy.speedSolves).toBe(0)
    expect(economy.equippedTitle).toBe('puzzler')
    expect(economy.ownedTitles).toEqual(['puzzler'])
    expect(economy.dailyFirstSolve).toBeNull()
})

// ─── saveUserEconomy + getUserEconomy round-trip ──────────────────────────────

test('saveUserEconomy persists coins and totalSolves, getUserEconomy reads them back', async () => {
    await saveUserEconomy('t2_testuser', { coins: 50, totalSolves: 3 })
    const economy = await getUserEconomy('t2_testuser')
    expect(economy.coins).toBe(50)
    expect(economy.totalSolves).toBe(3)
})

// ─── getUserStreakData (Redis-backed) ─────────────────────────────────────────

test('getUserStreakData returns defaults for new user', async () => {
    const streak = await getUserStreakData('t2_testuser')
    expect(streak.currentStreak).toBe(0)
    expect(streak.longestStreak).toBe(0)
    expect(streak.lastPlayedDate).toBeNull()
})

// ─── Property 8: Coin reward algebraic invariant (Task 5.2) ──────────────────

describe('Coin reward algebraic invariant — Property 8', () => {
    /**
     * Property 8: Coin reward algebraic invariant
     * For any valid inputs, total === base + streakBonus + speedBonus + dailyBonus + perfectBonus + loginBonus
     * Validates: Requirements 4.1, 4.2, 4.3
     */
    it('total always equals sum of components for all input combinations', () => {
        const timeTakenValues = [0, 5, 10, 20, 50, 100]
        const levels = [1, 2, 3, 4, 5, 6]
        const streakValues = [0, 1, 3, 5, 10]
        const isDailyFirstValues = [true, false]
        const mistakesValues = [0, 1, 3]
        const loginDaysValues = [0, 1, 3, 5, 10]

        for (const timeTaken of timeTakenValues) {
            for (const level of levels) {
                for (const currentStreak of streakValues) {
                    for (const isDailyFirst of isDailyFirstValues) {
                        for (const mistakes of mistakesValues) {
                            for (const loginDays of loginDaysValues) {
                                const reward = calculateCoinReward(timeTaken, level, currentStreak, isDailyFirst, mistakes, loginDays)
                                expect(reward.total).toBe(
                                    reward.base + reward.streakBonus + reward.speedBonus + reward.dailyBonus + reward.perfectBonus + reward.loginBonus
                                )
                            }
                        }
                    }
                }
            }
        }
    })
})

// ─── Property 9: Economy save/load round-trip (Task 5.3) ─────────────────────

/**
 * Property 9: Economy save/load round-trip
 * Saving via saveUserEconomy then loading via getUserEconomy preserves saved field values.
 * Validates: Requirement 4.5
 */

const testRoundTrip = createDevvitTest({ userId: 't2_testuser' })

testRoundTrip('round-trip: save {coins: 42} → getUserEconomy returns coins=42', async () => {
    await saveUserEconomy('t2_testuser', { coins: 42 })
    const economy = await getUserEconomy('t2_testuser')
    expect(economy.coins).toBe(42)
})

const testRoundTrip2 = createDevvitTest({ userId: 't2_testuser' })

testRoundTrip2('round-trip: save {totalSolves: 7, speedSolves: 2} → both fields preserved', async () => {
    await saveUserEconomy('t2_testuser', { totalSolves: 7, speedSolves: 2 })
    const economy = await getUserEconomy('t2_testuser')
    expect(economy.totalSolves).toBe(7)
    expect(economy.speedSolves).toBe(2)
})

const testRoundTrip3 = createDevvitTest({ userId: 't2_testuser' })

testRoundTrip3(
    "round-trip: save {equippedTitle: 'streak_lord', ownedTitles: ['puzzler', 'streak_lord']} → both fields preserved",
    async () => {
        await saveUserEconomy('t2_testuser', {
            equippedTitle: 'streak_lord',
            ownedTitles: ['puzzler', 'streak_lord'],
        })
        const economy = await getUserEconomy('t2_testuser')
        expect(economy.equippedTitle).toBe('streak_lord')
        expect(economy.ownedTitles).toEqual(['puzzler', 'streak_lord'])
    }
)

const testRoundTrip4 = createDevvitTest({ userId: 't2_testuser' })

testRoundTrip4("round-trip: save {dailyFirstSolve: '2025-01-15'} → field preserved", async () => {
    await saveUserEconomy('t2_testuser', { dailyFirstSolve: '2025-01-15' })
    const economy = await getUserEconomy('t2_testuser')
    expect(economy.dailyFirstSolve).toBe('2025-01-15')
})

// ─── Property 4: Coin reward scales monotonically with grid size (Task 4.2) ───

import * as fc from 'fast-check'
import { VALID_GRID_SIZES } from '../../../shared/constants'

describe('Coin reward scales monotonically with grid size — Property 4', () => {
    /**
     * Feature: grid-size-selector, Property 4: Coin reward scales monotonically with grid size
     * For any valid completion parameters, total for gridSize 6 >= total for gridSize 4,
     * and total for gridSize 8 >= total for gridSize 6, when all other params are held constant.
     * Validates: Requirements 6.1, 6.2
     */
    it('reward total for gridSize 6 >= gridSize 4, and gridSize 8 >= gridSize 6, for any valid inputs', () => {
        const arb = fc.record({
            timeTaken: fc.integer({ min: 1, max: 999 }),
            level: fc.integer({ min: 1, max: 4 }),
            streak: fc.integer({ min: 0, max: 50 }),
            isDailyFirst: fc.boolean(),
            mistakes: fc.integer({ min: 0, max: 10 }),
            loginDays: fc.integer({ min: 0, max: 30 }),
        })

        fc.assert(
            fc.property(arb, ({ timeTaken, level, streak, isDailyFirst, mistakes, loginDays }) => {
                const reward4 = calculateCoinReward(timeTaken, level, streak, isDailyFirst, mistakes, loginDays, 4)
                const reward6 = calculateCoinReward(timeTaken, level, streak, isDailyFirst, mistakes, loginDays, 6)
                const reward8 = calculateCoinReward(timeTaken, level, streak, isDailyFirst, mistakes, loginDays, 8)

                expect(reward6.total).toBeGreaterThanOrEqual(reward4.total)
                expect(reward8.total).toBeGreaterThanOrEqual(reward6.total)
            }),
            { numRuns: 100 }
        )
    })
})

// ─── Property 5: Coin reward total is always an integer (Task 4.3) ────────────

describe('Coin reward total is always an integer — Property 5', () => {
    /**
     * Feature: grid-size-selector, Property 5: Coin reward total is always an integer
     * For any valid completion parameters and any valid grid size,
     * calculateCoinReward(...).total SHALL be an integer (Number.isInteger(total) === true).
     * Validates: Requirements 6.3
     */
    it('reward total is always an integer for any valid inputs and any valid grid size', () => {
        const arb = fc.record({
            timeTaken: fc.integer({ min: 1, max: 999 }),
            level: fc.integer({ min: 1, max: 4 }),
            streak: fc.integer({ min: 0, max: 50 }),
            isDailyFirst: fc.boolean(),
            mistakes: fc.integer({ min: 0, max: 10 }),
            loginDays: fc.integer({ min: 0, max: 30 }),
            gridSize: fc.constantFrom(...VALID_GRID_SIZES),
        })

        fc.assert(
            fc.property(arb, ({ timeTaken, level, streak, isDailyFirst, mistakes, loginDays, gridSize }) => {
                const reward = calculateCoinReward(timeTaken, level, streak, isDailyFirst, mistakes, loginDays, gridSize)
                expect(Number.isInteger(reward.total)).toBe(true)
            }),
            { numRuns: 100 }
        )
    })
})

// ─── Unit tests: calculateCoinReward grid size multiplier (Task 4.4) ──────────

describe('calculateCoinReward grid size multiplier unit tests', () => {
    /**
     * Validates: Requirements 6.1, 6.2, 6.3
     */

    it('4×4 applies 1.0× multiplier (gridSizeMultiplier === 1.0)', () => {
        const reward = calculateCoinReward(100, 1, 0, false, 0, 0, 4)
        expect(reward.gridSizeMultiplier).toBe(1.0)
    })

    it('6×6 applies 1.5× multiplier (gridSizeMultiplier === 1.5)', () => {
        const reward = calculateCoinReward(100, 1, 0, false, 0, 0, 6)
        expect(reward.gridSizeMultiplier).toBe(1.5)
    })

    it('8×8 applies 2.0× multiplier (gridSizeMultiplier === 2.0)', () => {
        const reward = calculateCoinReward(100, 1, 0, false, 0, 0, 8)
        expect(reward.gridSizeMultiplier).toBe(2.0)
    })

    it('total is always an integer for 4×4', () => {
        const reward = calculateCoinReward(100, 1, 3, true, 0, 2, 4)
        expect(Number.isInteger(reward.total)).toBe(true)
    })

    it('total is always an integer for 6×6', () => {
        const reward = calculateCoinReward(100, 1, 3, true, 0, 2, 6)
        expect(Number.isInteger(reward.total)).toBe(true)
    })

    it('total is always an integer for 8×8', () => {
        const reward = calculateCoinReward(100, 1, 3, true, 0, 2, 8)
        expect(Number.isInteger(reward.total)).toBe(true)
    })

    it('returned CoinReward includes gridSizeMultiplier field', () => {
        const reward = calculateCoinReward(100, 1, 0, false, 0, 0, 6)
        expect(reward).toHaveProperty('gridSizeMultiplier')
        expect(typeof reward.gridSizeMultiplier).toBe('number')
    })

    it('6×6 total is greater than 4×4 total when all other params are equal (multiplier effect)', () => {
        const reward4 = calculateCoinReward(100, 1, 0, false, 0, 0, 4)
        const reward6 = calculateCoinReward(100, 1, 0, false, 0, 0, 6)
        expect(reward6.total).toBeGreaterThan(reward4.total)
    })

    it('8×8 total is greater than 6×6 total when all other params are equal (multiplier effect)', () => {
        const reward6 = calculateCoinReward(100, 1, 0, false, 0, 0, 6)
        const reward8 = calculateCoinReward(100, 1, 0, false, 0, 0, 8)
        expect(reward8.total).toBeGreaterThan(reward6.total)
    })
})
