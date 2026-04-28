import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
    trackPostOpen,
    trackFirstAction,
    trackCompletion,
    trackResultCopy,
    getDailyMetrics,
    computeD1ReturnRatePure,
} from '../analytics'

// ─── trackPostOpen ─────────────────────────────────────────────────────────────

const testPostOpen = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testPostOpen('trackPostOpen increments counter on first call', async () => {
    const result = await trackPostOpen('2025-01-15', 't3_post1', 't2_testuser', 't5_testsub')
    expect(result).toBe(true)

    const counter = await redis.get('analytics:2025-01-15:post_opens')
    expect(counter).toBe('1')
})

const testPostOpenDedup = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testPostOpenDedup('trackPostOpen skips counter on duplicate', async () => {
    await trackPostOpen('2025-01-15', 't3_post1', 't2_testuser', 't5_testsub')
    const second = await trackPostOpen('2025-01-15', 't3_post1', 't2_testuser', 't5_testsub')
    expect(second).toBe(false)

    const counter = await redis.get('analytics:2025-01-15:post_opens')
    expect(counter).toBe('1')
})

const testPostOpenDiffUsers = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testPostOpenDiffUsers('trackPostOpen counts different users separately', async () => {
    await trackPostOpen('2025-01-15', 't3_post1', 't2_user1', 't5_testsub')
    await trackPostOpen('2025-01-15', 't3_post1', 't2_user2', 't5_testsub')

    const counter = await redis.get('analytics:2025-01-15:post_opens')
    expect(counter).toBe('2')
})

// ─── trackFirstAction ──────────────────────────────────────────────────────────

const testFirstAction = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testFirstAction('trackFirstAction increments counter on first call', async () => {
    const result = await trackFirstAction('2025-01-15', 't3_post1', 't2_testuser', 't5_testsub')
    expect(result).toBe(true)

    const counter = await redis.get('analytics:2025-01-15:first_actions')
    expect(counter).toBe('1')
})

const testFirstActionDedup = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testFirstActionDedup('trackFirstAction skips counter on duplicate', async () => {
    await trackFirstAction('2025-01-15', 't3_post1', 't2_testuser', 't5_testsub')
    const second = await trackFirstAction('2025-01-15', 't3_post1', 't2_testuser', 't5_testsub')
    expect(second).toBe(false)

    const counter = await redis.get('analytics:2025-01-15:first_actions')
    expect(counter).toBe('1')
})

// ─── trackCompletion ───────────────────────────────────────────────────────────

const testCompletion = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testCompletion('trackCompletion increments daily and subreddit counters', async () => {
    const result = await trackCompletion('2025-01-15', 't3_post1', 't2_testuser', 't5_testsub')
    expect(result).toBe(true)

    const dailyCounter = await redis.get('analytics:2025-01-15:completions')
    expect(dailyCounter).toBe('1')

    const subCounter = await redis.get('analytics:2025-01-15:completions:subreddit:t5_testsub')
    expect(subCounter).toBe('1')
})

const testCompletionDedup = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testCompletionDedup('trackCompletion skips counter on duplicate per post', async () => {
    await trackCompletion('2025-01-15', 't3_post1', 't2_testuser', 't5_testsub')
    const second = await trackCompletion('2025-01-15', 't3_post1', 't2_testuser', 't5_testsub')
    expect(second).toBe(false)

    const counter = await redis.get('analytics:2025-01-15:completions')
    expect(counter).toBe('1')
})

const testCompletionSortedSet = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testCompletionSortedSet('trackCompletion adds date to user completion dates sorted set', async () => {
    await trackCompletion('2025-01-15', 't3_post1', 't2_testuser', 't5_testsub')

    const entries = await redis.zRange('analytics:user:t2_testuser:completion_dates', 0, -1, { by: 'rank' })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.member).toBe('2025-01-15')
})

// ─── trackResultCopy ───────────────────────────────────────────────────────────

const testResultCopy = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testResultCopy('trackResultCopy increments counter (not deduplicated)', async () => {
    await trackResultCopy('2025-01-15')
    await trackResultCopy('2025-01-15')
    await trackResultCopy('2025-01-15')

    const counter = await redis.get('analytics:2025-01-15:result_copies')
    expect(counter).toBe('3')
})

// ─── getDailyMetrics ───────────────────────────────────────────────────────────

const testMetricsEmpty = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testMetricsEmpty('getDailyMetrics returns zeros for date with no data', async () => {
    const metrics = await getDailyMetrics('2025-01-15')

    expect(metrics.date).toBe('2025-01-15')
    expect(metrics.postOpens).toBe(0)
    expect(metrics.firstActions).toBe(0)
    expect(metrics.completions).toBe(0)
    expect(metrics.resultCopies).toBe(0)
    expect(metrics.firstActionRate).toBe(0)
    expect(metrics.completionRate).toBe(0)
})

const testMetricsComputed = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testMetricsComputed('getDailyMetrics computes correct rates from counters', async () => {
    // Simulate 10 post opens, 6 first actions, 3 completions, 2 copies
    await trackPostOpen('2025-01-15', 't3_p1', 't2_u1', 't5_testsub')
    await trackPostOpen('2025-01-15', 't3_p1', 't2_u2', 't5_testsub')
    await trackPostOpen('2025-01-15', 't3_p1', 't2_u3', 't5_testsub')
    await trackPostOpen('2025-01-15', 't3_p1', 't2_u4', 't5_testsub')

    await trackFirstAction('2025-01-15', 't3_p1', 't2_u1', 't5_testsub')
    await trackFirstAction('2025-01-15', 't3_p1', 't2_u2', 't5_testsub')

    await trackCompletion('2025-01-15', 't3_p1', 't2_u1', 't5_testsub')

    await trackResultCopy('2025-01-15')
    await trackResultCopy('2025-01-15')

    const metrics = await getDailyMetrics('2025-01-15')

    expect(metrics.postOpens).toBe(4)
    expect(metrics.firstActions).toBe(2)
    expect(metrics.completions).toBe(1)
    expect(metrics.resultCopies).toBe(2)
    expect(metrics.firstActionRate).toBe(0.5)
    expect(metrics.completionRate).toBe(0.5)
    expect(metrics.estimatedDQE).toBe(1)
})

// ─── computeD1ReturnRatePure ───────────────────────────────────────────────────

describe('computeD1ReturnRatePure', () => {
    it('returns 0 when dayD set is empty', () => {
        expect(computeD1ReturnRatePure([], ['u1', 'u2'])).toBe(0)
    })

    it('returns 0 when no users overlap', () => {
        expect(computeD1ReturnRatePure(['u1', 'u2'], ['u3', 'u4'])).toBe(0)
    })

    it('returns 1 when all dayD users return on dayD+1', () => {
        expect(computeD1ReturnRatePure(['u1', 'u2'], ['u1', 'u2', 'u3'])).toBe(1)
    })

    it('returns correct ratio for partial overlap', () => {
        expect(computeD1ReturnRatePure(['u1', 'u2', 'u3', 'u4'], ['u1', 'u3'])).toBe(0.5)
    })

    it('returns 0 when both sets are empty', () => {
        expect(computeD1ReturnRatePure([], [])).toBe(0)
    })

    it('returns 0 when dayD+1 set is empty', () => {
        expect(computeD1ReturnRatePure(['u1', 'u2'], [])).toBe(0)
    })
})

// ─── Property 3: D1 Return Rate Computation ────────────────────────────────────

describe('D1 Return Rate Computation — Property 3', () => {
    /**
     * **Validates: Requirements 3.6**
     *
     * Property 3: D1 Return Rate Computation
     * For any two sets of user IDs (day D and day D+1), the D1 return rate
     * equals |intersection| / |day D set|, and is 0 when day D set is empty.
     */
    it('rate equals |intersection| / |dayD| for any two user ID arrays', () => {
        const userIdArb = fc.stringMatching(/^u_[a-z0-9]{1,8}$/)
        const userSetArb = fc.uniqueArray(userIdArb, { minLength: 0, maxLength: 50 })

        fc.assert(
            fc.property(userSetArb, userSetArb, (dayD, dayD1) => {
                const rate = computeD1ReturnRatePure(dayD, dayD1)

                if (dayD.length === 0) {
                    expect(rate).toBe(0)
                    return
                }

                const dayD1Set = new Set(dayD1)
                const expectedIntersection = dayD.filter((u) => dayD1Set.has(u)).length
                const expectedRate = expectedIntersection / dayD.length

                expect(rate).toBeCloseTo(expectedRate, 10)
            }),
            { numRuns: 100 },
        )
    })

    it('rate is always between 0 and 1 inclusive', () => {
        const userIdArb = fc.stringMatching(/^u_[a-z0-9]{1,8}$/)
        const userSetArb = fc.uniqueArray(userIdArb, { minLength: 0, maxLength: 50 })

        fc.assert(
            fc.property(userSetArb, userSetArb, (dayD, dayD1) => {
                const rate = computeD1ReturnRatePure(dayD, dayD1)
                expect(rate).toBeGreaterThanOrEqual(0)
                expect(rate).toBeLessThanOrEqual(1)
            }),
            { numRuns: 100 },
        )
    })

    it('rate is 0 when dayD is empty regardless of dayD+1', () => {
        const userIdArb = fc.stringMatching(/^u_[a-z0-9]{1,8}$/)
        const userSetArb = fc.uniqueArray(userIdArb, { minLength: 0, maxLength: 50 })

        fc.assert(
            fc.property(userSetArb, (dayD1) => {
                const rate = computeD1ReturnRatePure([], dayD1)
                expect(rate).toBe(0)
            }),
            { numRuns: 100 },
        )
    })
})
