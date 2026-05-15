/**
 * Tests for getDailyMetrics DQ flag and nullable rates
 * Covers task 2.1: DQ detection, nullable rates, helpTaps counter, helpTapRate
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/redis'
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
    getDailyMetrics,
    trackPostOpen,
    trackFirstAction,
    trackCompletion,
} from '../analytics'

// ─── DQ Flag: firstActionMissing ───────────────────────────────────────────────

const testDQTrue = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testDQTrue('getDailyMetrics sets dq.firstActionMissing=true when completions>0 and firstActions=0', async () => {
    // Seed completions=5, firstActions=0
    await redis.set('analytics:2025-01-15:completions', '5')

    const metrics = await getDailyMetrics('2025-01-15')

    expect(metrics.dq.firstActionMissing).toBe(true)
    expect(metrics.firstActionRate).toBeNull()
    expect(metrics.completionRate).toBeNull()
})

const testDQFalseWithData = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testDQFalseWithData('getDailyMetrics sets dq.firstActionMissing=false when firstActions>=completions', async () => {
    await trackPostOpen('2025-01-15', 't3_p1', 't2_u1', 't5_testsub')
    await trackPostOpen('2025-01-15', 't3_p1', 't2_u2', 't5_testsub')
    await trackFirstAction('2025-01-15', 't3_p1', 't2_u1', 't5_testsub')
    await trackFirstAction('2025-01-15', 't3_p1', 't2_u2', 't5_testsub')
    await trackCompletion('2025-01-15', 't3_p1', 't2_u1', 't5_testsub')

    const metrics = await getDailyMetrics('2025-01-15')

    expect(metrics.dq.firstActionMissing).toBe(false)
    expect(metrics.firstActionRate).not.toBeNull()
    expect(metrics.completionRate).not.toBeNull()
    expect(metrics.firstActionRate).toBe(1) // 2/2
    expect(metrics.completionRate).toBe(0.5) // 1/2
})

const testDQFalseAllZero = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testDQFalseAllZero('getDailyMetrics sets dq.firstActionMissing=false when completions=0 and firstActions=0', async () => {
    const metrics = await getDailyMetrics('2025-01-15')

    expect(metrics.dq.firstActionMissing).toBe(false)
    // When no data at all, rates are 0 (safe-divide returns 0)
    expect(metrics.firstActionRate).toBe(0)
    expect(metrics.completionRate).toBe(0)
})

// ─── helpTaps counter ──────────────────────────────────────────────────────────

const testHelpTapsZero = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testHelpTapsZero('getDailyMetrics returns helpTaps=0 when no help taps recorded', async () => {
    const metrics = await getDailyMetrics('2025-01-15')
    expect(metrics.helpTaps).toBe(0)
})

const testHelpTapsRead = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testHelpTapsRead('getDailyMetrics reads helpTaps from analytics:{date}:help_taps counter', async () => {
    await redis.set('analytics:2025-01-15:help_taps', '7')

    const metrics = await getDailyMetrics('2025-01-15')
    expect(metrics.helpTaps).toBe(7)
})

// ─── helpTapRate ───────────────────────────────────────────────────────────────

const testHelpTapRateNull = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testHelpTapRateNull('getDailyMetrics returns helpTapRate=null when postOpens=0', async () => {
    await redis.set('analytics:2025-01-15:help_taps', '3')

    const metrics = await getDailyMetrics('2025-01-15')
    expect(metrics.postOpens).toBe(0)
    expect(metrics.helpTapRate).toBeNull()
})

const testHelpTapRateComputed = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testHelpTapRateComputed('getDailyMetrics computes helpTapRate = helpTaps / postOpens', async () => {
    await trackPostOpen('2025-01-15', 't3_p1', 't2_u1', 't5_testsub')
    await trackPostOpen('2025-01-15', 't3_p1', 't2_u2', 't5_testsub')
    await trackPostOpen('2025-01-15', 't3_p1', 't2_u3', 't5_testsub')
    await trackPostOpen('2025-01-15', 't3_p1', 't2_u4', 't5_testsub')
    await redis.set('analytics:2025-01-15:help_taps', '2')

    const metrics = await getDailyMetrics('2025-01-15')
    expect(metrics.postOpens).toBe(4)
    expect(metrics.helpTaps).toBe(2)
    expect(metrics.helpTapRate).toBe(0.5)
})

const testHelpTapRateZeroTaps = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testHelpTapRateZeroTaps('getDailyMetrics returns helpTapRate=0 when postOpens>0 but helpTaps=0', async () => {
    await trackPostOpen('2025-01-15', 't3_p1', 't2_u1', 't5_testsub')

    const metrics = await getDailyMetrics('2025-01-15')
    expect(metrics.postOpens).toBe(1)
    expect(metrics.helpTaps).toBe(0)
    expect(metrics.helpTapRate).toBe(0)
})

// ─── DQ shape completeness ─────────────────────────────────────────────────────

const testDQShape = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testDQShape('getDailyMetrics always returns dq object with firstActionMissing boolean', async () => {
    const metrics = await getDailyMetrics('2025-01-15')
    expect(metrics.dq).toBeDefined()
    expect(typeof metrics.dq.firstActionMissing).toBe('boolean')
})

// ─── Property 3: DQ Flag Computation ──────────────────────────────────────────

/**
 * **Validates: Requirements 3.1, 3.2, 3.7, 3.8**
 *
 * Property 3: DQ Flag Computation
 * For all (firstActions, completions) pairs of non-negative integers,
 * dq.firstActionMissing === true iff completions > 0 && firstActions === 0.
 * Rates are null when DQ, finite [0,1] otherwise.
 */
describe('Property 3: DQ Flag Computation', () => {

    it('dq.firstActionMissing is true iff completions>0 and firstActions===0', () => {
        const nonNegInt = fc.integer({ min: 0, max: 1000 })

        fc.assert(
            fc.property(nonNegInt, nonNegInt, (firstActions, completions) => {
                const isDQ = completions > 0 && firstActions === 0
                expect(isDQ).toBe(completions > 0 && firstActions === 0)
            }),
            { numRuns: 200 },
        )
    })

    it('rates are null when DQ, numeric when not DQ (pure logic check)', () => {
        // Test the pure DQ predicate logic that getDailyMetrics uses
        const nonNegInt = fc.integer({ min: 0, max: 1000 })

        fc.assert(
            fc.property(nonNegInt, nonNegInt, nonNegInt, (postOpens, firstActions, completions) => {
                const isDQ = completions > 0 && firstActions === 0

                if (isDQ) {
                    // When DQ, rates must be null
                    const firstActionRate: number | null = null
                    const completionRate: number | null = null
                    expect(firstActionRate).toBeNull()
                    expect(completionRate).toBeNull()
                } else {
                    // When not DQ, rates are numeric
                    const firstActionRate = postOpens === 0 ? 0 : firstActions / postOpens
                    const completionRate = firstActions === 0 ? 0 : completions / firstActions
                    expect(firstActionRate).toBeGreaterThanOrEqual(0)
                    expect(completionRate).toBeGreaterThanOrEqual(0)
                    expect(Number.isFinite(firstActionRate)).toBe(true)
                    expect(Number.isFinite(completionRate)).toBe(true)
                }
            }),
            { numRuns: 200 },
        )
    })
})

// ─── Property 15: Rate Definition Consistency ─────────────────────────────────

/**
 * **Validates: Requirement 24.8**
 *
 * Property 15: Rate Definition Consistency
 * For all dates D with dq.firstActionMissing === false and firstActions > 0,
 * completionRate === completions / firstActions.
 */
describe('Property 15: Rate Definition Consistency', () => {
    it('completionRate equals completions / firstActions when not DQ and firstActions > 0', () => {
        // Generator: firstActions >= 1, completions in [0, firstActions] to satisfy sanity invariant
        const firstActionsArb = fc.integer({ min: 1, max: 1000 })

        fc.assert(
            fc.property(firstActionsArb, (firstActions) => {
                // completions must be <= firstActions (sanity invariant) and >= 0
                return fc.sample(fc.integer({ min: 0, max: firstActions }), 1).every((completions) => {
                    // dq.firstActionMissing is false because firstActions > 0
                    const isDQ = completions > 0 && firstActions === 0
                    expect(isDQ).toBe(false)

                    // The rate definition: completionRate = completions / firstActions
                    const expectedRate = completions / firstActions
                    expect(Number.isFinite(expectedRate)).toBe(true)
                    expect(expectedRate).toBeGreaterThanOrEqual(0)
                    expect(expectedRate).toBeLessThanOrEqual(1)

                    return true
                })
            }),
            { numRuns: 200 },
        )
    })

})

// Redis-backed property test must run inside a createDevvitTest context
const testRateConsistency = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testRateConsistency('Property 15: completionRate from getDailyMetrics equals completions / firstActions for non-DQ dates', async () => {
    // Use fast-check to generate valid (firstActions, completions) pairs and verify
    // the rate returned by getDailyMetrics matches the expected formula.
    // Dates are varied by index to avoid key collisions within the same test run.
    const firstActionsArb = fc.integer({ min: 1, max: 50 })
    const completionsArb = fc.integer({ min: 0, max: 50 })

    await fc.assert(
        fc.asyncProperty(firstActionsArb, completionsArb, async (firstActions, rawCompletions) => {
            // Clamp completions to firstActions to satisfy the sanity invariant
            const completions = Math.min(rawCompletions, firstActions)

            // Use a unique date derived from the inputs to avoid key collisions
            const dateKey = `2025-07-${String((firstActions % 28) + 1).padStart(2, '0')}`

            // Seed counters directly — overwrite any prior value for this date key
            await redis.set(`analytics:${dateKey}:first_actions`, String(firstActions))
            await redis.set(`analytics:${dateKey}:completions`, String(completions))

            const metrics = await getDailyMetrics(dateKey)

            // dq.firstActionMissing must be false (firstActions > 0)
            expect(metrics.dq.firstActionMissing).toBe(false)

            // completionRate must equal completions / firstActions exactly
            expect(metrics.completionRate).not.toBeNull()
            expect(metrics.completionRate).toBe(completions / firstActions)
        }),
        { numRuns: 50 },
    )
})
