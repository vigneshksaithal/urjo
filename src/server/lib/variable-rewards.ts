/**
 * Variable Reward Engine
 * Pure functions for deterministic bonus multiplier and mystery box rolls.
 * No side effects — all randomness is seeded from caller-provided strings.
 */

import type { MysteryBoxReward, VariableRewardResult } from '../../shared/engagement-types'
import {
    MYSTERY_BOX_BASE_DROP_RATE,
    MYSTERY_BOX_STREAK_BONUS,
    MYSTERY_BOX_MAX_DROP_RATE,
    MYSTERY_BOX_COIN_RANGE,
    MYSTERY_BOX_TITLE_SUBSTITUTE_COINS,
} from '../../shared/engagement-constants'
import { TITLES } from '../../shared/constants'

// ─── Seeded PRNG ───────────────────────────────────────────────────────────────

/**
 * djb2 hash: converts a string seed to a float in [0, 1).
 * Deterministic — same seed always produces the same float.
 */
const seedToFloat = (seed: string): number => {
    let hash = 5381
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) + hash + (seed.charCodeAt(i) ?? 0)) | 0
    }
    return Math.abs(hash) / 2147483647
}

// ─── Bonus Multiplier ─────────────────────────────────────────────────────────

/**
 * Roll for a bonus coin multiplier.
 * 5% → 3×, 15% → 2×, 80% → null (no multiplier).
 * Deterministic given the same seed.
 */
export const rollBonusMultiplier = (seed: string): number | null => {
    const rand = seedToFloat(seed)
    if (rand < 0.05) return 3
    if (rand < 0.20) return 2
    return null
}

// ─── Mystery Box Drop Rate ────────────────────────────────────────────────────

/**
 * Calculate the mystery box drop rate for a given streak.
 * Formula: 0.10 + min(streak × 0.02, 0.20), capped at 0.30.
 */
export const calculateMysteryBoxDropRate = (currentStreak: number): number => {
    const streakBonus = Math.min(currentStreak * MYSTERY_BOX_STREAK_BONUS, 0.20)
    return Math.min(MYSTERY_BOX_BASE_DROP_RATE + streakBonus, MYSTERY_BOX_MAX_DROP_RATE)
}

// ─── Mystery Box Roll ─────────────────────────────────────────────────────────

/** Pick a coin amount in [min, max] using a seeded float. */
const rollCoinAmount = (rand: number): number => {
    const range = MYSTERY_BOX_COIN_RANGE.max - MYSTERY_BOX_COIN_RANGE.min
    return Math.floor(rand * (range + 1)) + MYSTERY_BOX_COIN_RANGE.min
}

/** Pick a cosmetic title the user doesn't own, or substitute coins if all owned. */
const rollCosmeticTitle = (rand: number, ownedTitles: string[]): MysteryBoxReward => {
    const unowned = TITLES.filter((t) => !ownedTitles.includes(t.id))
    if (unowned.length === 0) {
        return { type: 'coins', value: MYSTERY_BOX_TITLE_SUBSTITUTE_COINS }
    }
    const index = Math.floor(rand * unowned.length)
    const title = unowned[index] ?? unowned[0]!
    return { type: 'cosmetic_title', value: 1, titleId: title.id }
}

/** Select the reward type and value from the weighted pool. */
const selectReward = (typeRand: number, valueRand: number, ownedTitles: string[]): MysteryBoxReward => {
    if (typeRand < 0.50) {
        return { type: 'coins', value: rollCoinAmount(valueRand) }
    }
    if (typeRand < 0.80) {
        return { type: 'streak_freeze', value: 1 }
    }
    return rollCosmeticTitle(valueRand, ownedTitles)
}

/**
 * Roll for a mystery box reward.
 * Uses sub-seeds to avoid correlation between drop, type, and value rolls.
 * Returns null if no box drops.
 */
export const rollMysteryBox = (
    seed: string,
    dropRate: number,
    ownedTitles: string[]
): MysteryBoxReward | null => {
    const dropRand = seedToFloat(`${seed}:drop`)
    if (dropRand >= dropRate) return null

    const typeRand = seedToFloat(`${seed}:type`)
    const valueRand = seedToFloat(`${seed}:value`)
    return selectReward(typeRand, valueRand, ownedTitles)
}

// ─── Combined Roll ────────────────────────────────────────────────────────────

/**
 * Roll all variable rewards for a puzzle completion.
 * Builds a deterministic seed from userId + postId + timestamp.
 */
export const rollVariableRewards = (
    userId: string,
    postId: string,
    timestamp: number,
    streak: number,
    ownedTitles: string[]
): VariableRewardResult => {
    const seed = `${userId}:${postId}:${timestamp}`
    const dropRate = calculateMysteryBoxDropRate(streak)

    return {
        bonusMultiplier: rollBonusMultiplier(`${seed}:multiplier`),
        mysteryBox: rollMysteryBox(`${seed}:box`, dropRate, ownedTitles),
    }
}
