import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { expect } from 'vitest'
import { getUserEconomy, saveUserEconomy, calculateCoinReward, getUserStreakData } from '../economy'
import {
    COIN_DAILY_BONUS,
    COIN_STREAK_MULTIPLIER,
    COIN_PERFECT_BONUS,
    getDailyLoginBonus,
    getGridLevelConfig,
} from '../../../shared/constants'
import { MAX_SPEED_COIN_BONUS } from '../../../shared/scoring'

// ─── calculateCoinReward (pure — no Redis needed) ─────────────────────────────

import { describe, it } from 'vitest'

describe('calculateCoinReward', () => {
	it('treats unverified client mistake data as neutral and never grants a perfect bonus', () => {
		const trustedFlawless = calculateCoinReward(20, 1, 3, false, 0, 0, 4)
		const mistakeNeutral = calculateCoinReward(20, 1, 3, false, 0, 0, 4, false)

		expect(mistakeNeutral.perfectBonus).toBe(0)
		expect(mistakeNeutral.speedBonus).toBe(trustedFlawless.speedBonus)
		expect(mistakeNeutral.streakBonus).toBe(trustedFlawless.streakBonus)
	})

    it('total equals base + streakBonus + speedBonus + dailyBonus + perfectBonus + loginBonus', () => {
        const reward = calculateCoinReward(5, 1, 3, true, 0, 2)
        expect(reward.total).toBe(reward.base + reward.streakBonus + reward.speedBonus + reward.dailyBonus + reward.perfectBonus + reward.loginBonus)
    })

    it('awards a graduated speed bonus that scales with how far under par the solve is', () => {
        // 4×4 L1 par = expectedTime = 45s; mistakes=0 → flawless tier (1.0× bonus pool)
        const instant = calculateCoinReward(0, 1, 0, false, 0)
        const halfway = calculateCoinReward(22, 1, 0, false, 0)
        expect(instant.speedBonus).toBe(MAX_SPEED_COIN_BONUS)
        expect(halfway.speedBonus).toBeGreaterThan(0)
        expect(halfway.speedBonus).toBeLessThan(instant.speedBonus)
    })

    it('speed bonus is 0 when timeTaken is at or beyond par time', () => {
        // 4×4 L1 par = 45s
        expect(calculateCoinReward(45, 1, 0, false, 0).speedBonus).toBe(0)
        expect(calculateCoinReward(91, 1, 0, false, 0).speedBonus).toBe(0)
    })

    it('includes COIN_DAILY_BONUS when isDailyFirst is true', () => {
        const reward = calculateCoinReward(100, 1, 0, true, 0)
        expect(reward.dailyBonus).toBe(COIN_DAILY_BONUS)
    })

    it('does not include COIN_DAILY_BONUS when isDailyFirst is false', () => {
        const reward = calculateCoinReward(100, 1, 0, false, 0)
        expect(reward.dailyBonus).toBe(0)
    })

    it('base equals the authored 4×4 L1 coinBase (10)', () => {
        const reward = calculateCoinReward(5, 1, 0, false, 0)
        expect(reward.base).toBe(getGridLevelConfig(4, 1).coinBase)
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

// ─── Property 3: Coin reward total is always a non-negative integer (Task 4.2) ─

describe('Coin reward total is always a non-negative integer — Property 3', () => {
    /**
     * Feature: difficulty-weighted-scoring, Property 3: Coin reward total is always a non-negative integer
     * For any valid completion parameters (timeTaken 1–9999, level 1–4, streak 0–500,
     * isDailyFirst bool, mistakes 0–20, loginDays 0–60) and any valid grid size (4, 6, 8),
     * calculateCoinReward(...).total SHALL satisfy Number.isInteger(total) && total >= 0.
     * Validates: Requirements 2.4
     */
    it('total is a non-negative integer for any valid inputs and any valid grid size', () => {
        const arb = fc.record({
            timeTaken: fc.integer({ min: 1, max: 9999 }),
            level: fc.integer({ min: 1, max: 4 }),
            streak: fc.integer({ min: 0, max: 500 }),
            isDailyFirst: fc.boolean(),
            mistakes: fc.integer({ min: 0, max: 20 }),
            loginDays: fc.integer({ min: 0, max: 60 }),
            gridSize: fc.constantFrom(...VALID_GRID_SIZES),
        })

        fc.assert(
            fc.property(arb, ({ timeTaken, level, streak, isDailyFirst, mistakes, loginDays, gridSize }) => {
                const reward = calculateCoinReward(timeTaken, level, streak, isDailyFirst, mistakes, loginDays, gridSize)
                expect(Number.isInteger(reward.total)).toBe(true)
                expect(reward.total).toBeGreaterThanOrEqual(0)
            }),
            { numRuns: 100 }
        )
    })
})

// ─── Unit tests: difficulty-weighted calculateCoinReward (Task 4.3) ───────────

describe('calculateCoinReward difficulty-weighted base + graduated speed (Task 4.3)', () => {
    /**
     * Validates: Requirements 2.2, 2.4, 3.4, 6.1
     */

    it('4×4 level 1 base is the authored entry value (10)', () => {
        const reward = calculateCoinReward(100, 1, 0, false, 0, 0, 4)
        expect(reward.base).toBe(10)
    })

    it('8×8 level 4 base is the authored hardest-bucket value (232)', () => {
        const reward = calculateCoinReward(1000, 4, 0, false, 0, 0, 8)
        expect(reward.base).toBe(232)
    })

    it('graduated speed bonus: a faster solve earns strictly more than a slower one (both under par)', () => {
        // 4×4 L1 par (expectedTime) = 45s; flawless tier keeps the full bonus pool
        const faster = calculateCoinReward(5, 1, 0, false, 0, 0, 4)
        const slower = calculateCoinReward(40, 1, 0, false, 0, 0, 4)
        expect(faster.speedBonus).toBeGreaterThan(slower.speedBonus)
    })

    it('graduated speed bonus: a near-instant solve reaches MAX_SPEED_COIN_BONUS (flawless tier)', () => {
        const instant = calculateCoinReward(1, 1, 0, false, 0, 0, 4)
        expect(instant.speedBonus).toBe(MAX_SPEED_COIN_BONUS)
    })

    it('graduated speed bonus: 0 at par and beyond par (4×4 L1 par = 45s)', () => {
        expect(calculateCoinReward(45, 1, 0, false, 0, 0, 4).speedBonus).toBe(0)
        expect(calculateCoinReward(60, 1, 0, false, 0, 0, 4).speedBonus).toBe(0)
    })

    it('result tier still scales the bonus pool: a mistake-laden solve has a smaller scaled pool than a flawless one', () => {
        // Same fast solve + streak on a 4×4; 10 mistakes on a 4×4 → Scrappy (0.25×),
        // 0 mistakes → Flawless (1.0×). The scaled bonuses must shrink with the lower tier.
        const flawless = calculateCoinReward(5, 1, 10, false, 0, 0, 4)
        const scrappy = calculateCoinReward(5, 1, 10, false, 10, 0, 4)
        expect(flawless.speedBonus).toBeGreaterThan(scrappy.speedBonus)
        expect(flawless.streakBonus).toBeGreaterThan(scrappy.streakBonus)
    })

    it('daily bonus is unscaled by tier: equals COIN_DAILY_BONUS for both flawless and mistake-laden solves', () => {
        const flawless = calculateCoinReward(5, 1, 0, true, 0, 0, 4)
        const scrappy = calculateCoinReward(5, 1, 0, true, 10, 0, 4)
        expect(flawless.dailyBonus).toBe(COIN_DAILY_BONUS)
        expect(scrappy.dailyBonus).toBe(COIN_DAILY_BONUS)
        expect(flawless.dailyBonus).toBe(scrappy.dailyBonus)
    })
})
