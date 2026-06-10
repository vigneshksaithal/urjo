/**
 * Property-based tests for the authored Unified_Ladder scoring columns.
 *
 * Feature: difficulty-weighted-scoring
 *   Property 1: Coin base is monotonic along the unified difficulty order
 *   Property 2: Bigger grids hold a per-minute coin advantage
 *   Property 5: Season weight is monotonic and anchored
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { PER_GRID_LADDER, type GridDifficultyLevel } from '../constants'

/**
 * The 12 buckets flattened into the unified difficulty order:
 * 4×4 L1→L4, then 6×6 L1→L4, then 8×8 L1→L4.
 */
const UNIFIED_ORDER: readonly GridDifficultyLevel[] = [
    ...PER_GRID_LADDER[4],
    ...PER_GRID_LADDER[6],
    ...PER_GRID_LADDER[8],
] as const

describe('Feature: difficulty-weighted-scoring, Property 1: Coin base is monotonic along the unified difficulty order', () => {
    it('coinBase strictly increases for every preceding/following bucket pair', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: UNIFIED_ORDER.length - 1 }),
                fc.integer({ min: 0, max: UNIFIED_ORDER.length - 1 }),
                (a, b) => {
                    // Order the two indices so that i precedes j in the unified order.
                    const i = Math.min(a, b)
                    const j = Math.max(a, b)
                    fc.pre(i < j)
                    const earlier = UNIFIED_ORDER[i]!
                    const later = UNIFIED_ORDER[j]!
                    expect(earlier.coinBase).toBeLessThan(later.coinBase)
                },
            ),
            { numRuns: 200 },
        )
    })
})

describe('Feature: difficulty-weighted-scoring, Property 2: Bigger grids hold a per-minute coin advantage', () => {
    it('4×4 easy coins-per-minute is <= 8×8 diabolical coins-per-minute', () => {
        const easiest = PER_GRID_LADDER[4][0]! // 4×4 level 1 (easy)
        const hardest = PER_GRID_LADDER[8][3]! // 8×8 level 4 (diabolical)

        const easiestPerMinute = easiest.coinBase / easiest.expectedTime
        const hardestPerMinute = hardest.coinBase / hardest.expectedTime

        expect(easiestPerMinute).toBeLessThanOrEqual(hardestPerMinute)
    })
})

describe('Feature: difficulty-weighted-scoring, Property 5: Season weight is monotonic and anchored', () => {
    it('seasonWeight strictly increases for every preceding/following bucket pair', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: UNIFIED_ORDER.length - 1 }),
                fc.integer({ min: 0, max: UNIFIED_ORDER.length - 1 }),
                (a, b) => {
                    // Order the two indices so that i precedes j in the unified order.
                    const i = Math.min(a, b)
                    const j = Math.max(a, b)
                    fc.pre(i < j)
                    const earlier = UNIFIED_ORDER[i]!
                    const later = UNIFIED_ORDER[j]!
                    expect(earlier.seasonWeight).toBeLessThan(later.seasonWeight)
                },
            ),
            { numRuns: 200 },
        )
    })

    it('seasonWeight is anchored at 1.0 for 4×4 level 1', () => {
        const anchor = PER_GRID_LADDER[4][0]! // 4×4 level 1 (easy)
        expect(anchor.seasonWeight).toBe(1.0)
    })
})
