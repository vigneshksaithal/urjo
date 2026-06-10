/**
 * Property-based tests for the shared continuous-input scoring formulas.
 *
 * Feature: difficulty-weighted-scoring
 *   Property 4: Speed factor is bounded and monotonic in time
 *   Property 6: Daily decay is bounded, starts at 1.0, and never zeroes out
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { speedFactor, dailyDecay, DAILY_DECAY_FLOOR } from '../scoring'

describe('Feature: difficulty-weighted-scoring, Property 4: Speed factor is bounded and monotonic in time', () => {
    it('is always within [0, 1] for any parTime > 0 and timeTaken >= 0', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 2000 }),
                fc.integer({ min: 0, max: 4000 }),
                (parTime, timeTaken) => {
                    const factor = speedFactor(timeTaken, parTime)
                    expect(factor).toBeGreaterThanOrEqual(0)
                    expect(factor).toBeLessThanOrEqual(1)
                },
            ),
            { numRuns: 200 },
        )
    })

    it('equals 0 when timeTaken >= parTime', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 2000 }),
                fc.integer({ min: 0, max: 4000 }),
                (parTime, extra) => {
                    // timeTaken at or beyond par means no speed bonus.
                    const timeTaken = parTime + extra
                    expect(speedFactor(timeTaken, parTime)).toBe(0)
                },
            ),
            { numRuns: 200 },
        )
    })

    it('is non-increasing as timeTaken increases (sorted-pair monotonicity)', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 2000 }),
                fc.integer({ min: 0, max: 4000 }),
                fc.integer({ min: 0, max: 4000 }),
                (parTime, a, b) => {
                    const lower = Math.min(a, b)
                    const higher = Math.max(a, b)
                    // More time taken should never yield a higher speed factor.
                    expect(speedFactor(higher, parTime)).toBeLessThanOrEqual(
                        speedFactor(lower, parTime),
                    )
                },
            ),
            { numRuns: 200 },
        )
    })
})

describe('Feature: difficulty-weighted-scoring, Property 6: Daily decay is bounded, starts at 1.0, and never zeroes out', () => {
    it('is always within [DAILY_DECAY_FLOOR, 1.0] for any index >= 1', () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 100 }), (index) => {
                const decay = dailyDecay(index)
                expect(decay).toBeGreaterThanOrEqual(DAILY_DECAY_FLOOR)
                expect(decay).toBeLessThanOrEqual(1.0)
            }),
            { numRuns: 200 },
        )
    })

    it('equals 1.0 when index is 1', () => {
        expect(dailyDecay(1)).toBe(1.0)
    })

    it('is non-increasing as index increases (sorted-pair monotonicity)', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 100 }),
                fc.integer({ min: 1, max: 100 }),
                (a, b) => {
                    const lower = Math.min(a, b)
                    const higher = Math.max(a, b)
                    // A later solve of the day should never decay less than an earlier one.
                    expect(dailyDecay(higher)).toBeLessThanOrEqual(dailyDecay(lower))
                },
            ),
            { numRuns: 200 },
        )
    })
})

describe('unit: speedFactor edge cases', () => {
    it('returns 0.5 when timeTaken is half of parTime (par=100, time=50)', () => {
        expect(speedFactor(50, 100)).toBe(0.5)
    })

    it('returns 1 when timeTaken is 0', () => {
        expect(speedFactor(0, 100)).toBe(1)
    })

    it('returns 0 when timeTaken equals parTime', () => {
        expect(speedFactor(100, 100)).toBe(0)
    })

    it('returns 0 when timeTaken exceeds parTime', () => {
        expect(speedFactor(150, 100)).toBe(0)
    })

    it('returns 0 when parTime is 0 (divide-by-zero guard)', () => {
        expect(speedFactor(50, 0)).toBe(0)
    })
})

describe('unit: dailyDecay edge cases', () => {
    it('returns 1.0 for the first solve of the day (index 1)', () => {
        expect(dailyDecay(1)).toBe(1.0)
    })

    it('returns 0.9 for the second solve (index 2)', () => {
        expect(dailyDecay(2)).toBeCloseTo(0.9)
    })

    it('returns 0.8 for the third solve (index 3)', () => {
        expect(dailyDecay(3)).toBeCloseTo(0.8)
    })

    it('returns 0.5 for the sixth solve (index 6)', () => {
        expect(dailyDecay(6)).toBeCloseTo(0.5)
    })

    it('clamps to the floor 0.4 at index 7', () => {
        expect(dailyDecay(7)).toBe(DAILY_DECAY_FLOOR)
    })

    it('stays at the floor 0.4 for large indices (index 20)', () => {
        expect(dailyDecay(20)).toBe(DAILY_DECAY_FLOOR)
    })
})
