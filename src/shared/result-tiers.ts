/**
 * Result Tier Spectrum
 *
 * Replaces the binary "Perfect / Imperfect" framing with a spectrum:
 *   Flawless → Sharp → Solid → Scrappy
 *
 * Every solve gets a positive label. Even a sloppy solve says "Scrappy" with a
 * grit emoji — never "you failed". This removes the implicit shame state
 * that Subway Surfers and Clash of Clans both engineer out of their games.
 *
 * Pure function, used by both client (display) and server (telemetry/season).
 */

import type { GridSize } from './constants'

export type ResultTierId = 'flawless' | 'sharp' | 'solid' | 'scrappy'

export type ResultTier = {
    id: ResultTierId
    label: string
    emoji: string
    /** Headline shown on the result screen — short and positive */
    headline: string
    /** Tailwind text color class for the badge */
    colorClass: string
    /** Tailwind background class (for chip styling) */
    bgClass: string
    /** Tailwind border class */
    borderClass: string
}

const TIERS: Record<ResultTierId, ResultTier> = {
    flawless: {
        id: 'flawless',
        label: 'Flawless',
        emoji: '🎯',
        headline: 'Flawless!',
        colorClass: 'text-green-400',
        bgClass: 'bg-green-500/10',
        borderClass: 'border-green-500/40',
    },
    sharp: {
        id: 'sharp',
        label: 'Sharp',
        emoji: '✨',
        headline: 'Sharp!',
        colorClass: 'text-yellow-300',
        bgClass: 'bg-yellow-500/10',
        borderClass: 'border-yellow-500/40',
    },
    solid: {
        id: 'solid',
        label: 'Solid',
        emoji: '💪',
        headline: 'Solid!',
        colorClass: 'text-orange-300',
        bgClass: 'bg-orange-500/10',
        borderClass: 'border-orange-500/40',
    },
    scrappy: {
        id: 'scrappy',
        label: 'Scrappy',
        emoji: '🪨',
        headline: 'Scrappy win!',
        colorClass: 'text-rose-300',
        bgClass: 'bg-rose-500/10',
        borderClass: 'border-rose-500/40',
    },
}

/**
 * Mistake threshold per tier scales with grid size — an 8x8 puzzle has many
 * more cells than a 4x4, so 3 mistakes on an 8x8 should still feel "Solid",
 * while 3 mistakes on a 4x4 is "Scrappy".
 */
const tierThresholds = (gridSize: GridSize): { sharp: number; solid: number } => {
    switch (gridSize) {
        case 4:
            return { sharp: 1, solid: 3 }
        case 6:
            return { sharp: 2, solid: 5 }
        case 8:
            return { sharp: 3, solid: 7 }
        default:
            return { sharp: 1, solid: 3 }
    }
}

/**
 * Determine the result tier for a completed solve.
 *
 *   mistakes === 0          → Flawless
 *   mistakes <= sharp(grid) → Sharp
 *   mistakes <= solid(grid) → Solid
 *   else                    → Scrappy
 */
export const getResultTier = (mistakes: number, gridSize: GridSize): ResultTier => {
    if (mistakes <= 0) return TIERS.flawless

    const { sharp, solid } = tierThresholds(gridSize)
    if (mistakes <= sharp) return TIERS.sharp
    if (mistakes <= solid) return TIERS.solid
    return TIERS.scrappy
}

/**
 * Coin multiplier applied to the *bonus pool* (perfect/speed/streak bonuses)
 * based on the tier. We keep base coins flat so even Scrappy solves pay
 * something — this prevents the "you failed, lose everything" feeling.
 *
 *   Flawless → 1.0  (full bonuses)
 *   Sharp    → 0.75 (most bonuses kept)
 *   Solid    → 0.5  (half)
 *   Scrappy  → 0.25 (quarter)
 */
export const getTierBonusMultiplier = (tier: ResultTierId): number => {
    switch (tier) {
        case 'flawless':
            return 1.0
        case 'sharp':
            return 0.75
        case 'solid':
            return 0.5
        case 'scrappy':
            return 0.25
    }
}
