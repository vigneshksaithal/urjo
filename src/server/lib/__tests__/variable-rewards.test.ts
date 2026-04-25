/**
 * Tests for variable-rewards.ts
 * Pure function tests — no Redis needed.
 */

import { describe, expect, it } from 'vitest'
import {
    rollBonusMultiplier,
    calculateMysteryBoxDropRate,
    rollMysteryBox,
    rollVariableRewards,
} from '../variable-rewards'
import { TITLES } from '../../../shared/constants'

// ─── rollBonusMultiplier ───────────────────────────────────────────────────────

describe('rollBonusMultiplier', () => {
    it('returns null, 2, or 3 only', () => {
        const seeds = Array.from({ length: 100 }, (_, i) => `seed-${i}`)
        for (const seed of seeds) {
            const result = rollBonusMultiplier(seed)
            expect([null, 2, 3]).toContain(result)
        }
    })

    it('is deterministic — same seed returns same result', () => {
        const seed = 'user123:post456:1700000000'
        expect(rollBonusMultiplier(seed)).toBe(rollBonusMultiplier(seed))
    })

    it('distribution approximates 80/15/5 over many seeds', () => {
        // Use realistic seeds (userId:postId:timestamp) to avoid hash clustering
        const seeds = Array.from(
            { length: 10000 },
            (_, i) =>
                `t2_user${i % 1000}:t3_post${Math.floor(i / 10)}:${1700000000 + i * 37}:multiplier`
        )
        const results = seeds.map((s) => rollBonusMultiplier(s))

        const nullCount = results.filter((r) => r === null).length
        const doubleCount = results.filter((r) => r === 2).length
        const tripleCount = results.filter((r) => r === 3).length

        // Allow ±5% tolerance
        expect(nullCount / 10000).toBeGreaterThan(0.75)
        expect(nullCount / 10000).toBeLessThan(0.85)
        expect(doubleCount / 10000).toBeGreaterThan(0.10)
        expect(doubleCount / 10000).toBeLessThan(0.20)
        expect(tripleCount / 10000).toBeGreaterThan(0.02)
        expect(tripleCount / 10000).toBeLessThan(0.08)
    })
})

// ─── calculateMysteryBoxDropRate ──────────────────────────────────────────────

describe('calculateMysteryBoxDropRate', () => {
    it('returns 0.10 for streak 0', () => {
        expect(calculateMysteryBoxDropRate(0)).toBeCloseTo(0.10)
    })

    it('returns 0.30 for streak 10 (capped)', () => {
        expect(calculateMysteryBoxDropRate(10)).toBeCloseTo(0.30)
    })

    it('returns 0.20 for streak 5', () => {
        expect(calculateMysteryBoxDropRate(5)).toBeCloseTo(0.20)
    })

    it('never exceeds 0.30', () => {
        for (const streak of [0, 1, 5, 10, 20, 100, 1000]) {
            expect(calculateMysteryBoxDropRate(streak)).toBeLessThanOrEqual(0.30)
        }
    })

    it('never goes below 0.10', () => {
        for (const streak of [0, 1, 5, 10, 20, 100]) {
            expect(calculateMysteryBoxDropRate(streak)).toBeGreaterThanOrEqual(0.10)
        }
    })
})

// ─── rollMysteryBox ───────────────────────────────────────────────────────────

describe('rollMysteryBox', () => {
    const allTitleIds = TITLES.map((t) => t.id)

    it('returns null when drop does not occur (dropRate=0)', () => {
        // dropRate=0 means rand >= 0 is always true → no drop
        expect(rollMysteryBox('any-seed', 0, [])).toBeNull()
    })

    it('returns a reward when drop occurs (dropRate=1)', () => {
        // dropRate=1 means rand < 1 is always true → always drop
        const result = rollMysteryBox('any-seed', 1, [])
        expect(result).not.toBeNull()
    })

    it('coin reward is within [10, 50]', () => {
        // Force a drop and iterate seeds until we get a coin reward
        const seeds = Array.from({ length: 200 }, (_, i) => `coin-seed-${i}`)
        const coinRewards = seeds
            .map((s) => rollMysteryBox(s, 1, []))
            .filter((r) => r?.type === 'coins')

        expect(coinRewards.length).toBeGreaterThan(0)
        for (const reward of coinRewards) {
            expect(reward!.value).toBeGreaterThanOrEqual(10)
            expect(reward!.value).toBeLessThanOrEqual(50)
        }
    })

    it('streak_freeze reward has value 1', () => {
        const seeds = Array.from({ length: 200 }, (_, i) => `freeze-seed-${i}`)
        const freezeRewards = seeds
            .map((s) => rollMysteryBox(s, 1, []))
            .filter((r) => r?.type === 'streak_freeze')

        expect(freezeRewards.length).toBeGreaterThan(0)
        for (const reward of freezeRewards) {
            expect(reward!.value).toBe(1)
        }
    })

    it('substitutes 100 coins when all titles owned', () => {
        // With all titles owned, cosmetic_title rolls should become 100 coins
        const seeds = Array.from({ length: 500 }, (_, i) => `title-seed-${i}`)
        const rewards = seeds.map((s) => rollMysteryBox(s, 1, allTitleIds))

        // No cosmetic_title rewards should appear
        const titleRewards = rewards.filter((r) => r?.type === 'cosmetic_title')
        expect(titleRewards).toHaveLength(0)

        // Some rewards should be 100 coins (the substitution)
        const substitutionRewards = rewards.filter((r) => r?.type === 'coins' && r.value === 100)
        expect(substitutionRewards.length).toBeGreaterThan(0)
    })

    it('is deterministic — same seed returns same result', () => {
        const seed = 'deterministic-seed'
        const result1 = rollMysteryBox(seed, 0.5, [])
        const result2 = rollMysteryBox(seed, 0.5, [])
        expect(result1).toEqual(result2)
    })
})

// ─── rollVariableRewards ──────────────────────────────────────────────────────

describe('rollVariableRewards', () => {
    it('is deterministic — same inputs return same result', () => {
        const args = ['user1', 'post1', 1700000000, 5, []] as const
        const result1 = rollVariableRewards(...args)
        const result2 = rollVariableRewards(...args)
        expect(result1).toEqual(result2)
    })

    it('returns correct shape with bonusMultiplier and mysteryBox fields', () => {
        const result = rollVariableRewards('user1', 'post1', 1700000000, 0, [])
        expect(result).toHaveProperty('bonusMultiplier')
        expect(result).toHaveProperty('mysteryBox')
        expect([null, 2, 3]).toContain(result.bonusMultiplier)
        // mysteryBox is either null or a MysteryBoxReward
        if (result.mysteryBox !== null) {
            expect(result.mysteryBox).toHaveProperty('type')
            expect(result.mysteryBox).toHaveProperty('value')
            expect(['coins', 'streak_freeze', 'cosmetic_title']).toContain(result.mysteryBox.type)
        }
    })
})
