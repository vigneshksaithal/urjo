import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
    recordChannelConversion,
    recordChannelOpen,
    recordCompleter,
    recordCycleTime,
    recordSharer,
} from '../viral-tracker'

import {
    trackPostOpen,
    trackFirstAction,
    normalizeFirstActionSource,
    trackCompletion,
    trackResultCopy,
    trackResultComment,
    trackChallengePostCreated,
    trackChallengeOpen,
    trackChallengeCompletion,
    trackNotifyOptIn,
    trackSubscribeTap,
    getDailyMetrics,
    computeD1ReturnRatePure,
    computeReturnRateForDate,
    computeKFactorPure,
    isReturnWindowClosed,
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

describe('normalizeFirstActionSource', () => {
    it('accepts known first-intent sources', () => {
        expect(normalizeFirstActionSource('play')).toBe('play')
        expect(normalizeFirstActionSource('cell')).toBe('cell')
        expect(normalizeFirstActionSource('result-comment')).toBe('result-comment')
    })

    it('falls back to unknown for unsupported values', () => {
        expect(normalizeFirstActionSource('bad-source')).toBe('unknown')
        expect(normalizeFirstActionSource(undefined)).toBe('unknown')
    })
})

const testFirstActionSource = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testFirstActionSource('trackFirstAction records the deduped source counter', async () => {
    await trackFirstAction('2025-01-15', 't3_post1', 't2_testuser', 't5_testsub', 'play')
    await trackFirstAction('2025-01-15', 't3_post1', 't2_testuser', 't5_testsub', 'cell')

    const firstActions = await redis.get('analytics:2025-01-15:first_actions')
    const playSource = await redis.get('analytics:2025-01-15:first_actions:source:play')
    const cellSource = await redis.get('analytics:2025-01-15:first_actions:source:cell')

    expect(firstActions).toBe('1')
    expect(playSource).toBe('1')
    expect(cellSource).toBeUndefined()
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

const testGrowthEvents = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testGrowthEvents('growth tracking records DAE and K-factor inputs', async () => {
    await trackFirstAction('2025-01-15', 't3_daily', 't2_solver', 't5_testsub')
    await trackCompletion('2025-01-15', 't3_daily', 't2_solver', 't5_testsub')
    await trackResultComment('2025-01-15', 't2_solver')
    await trackChallengePostCreated('2025-01-15', 't2_solver', 't3_challenge')
    await trackChallengeOpen('2025-01-15', 't3_challenge', 't2_newbie')
    await trackChallengeCompletion('2025-01-15', 't3_challenge', 't2_newbie', true)
    await trackNotifyOptIn('2025-01-15', 't2_solver')
    await trackSubscribeTap('2025-01-15', 't2_solver')

    const metrics = await getDailyMetrics('2025-01-15')

    expect(metrics.growth?.dailyActiveEngagers).toBe(2)
    expect(metrics.growth?.resultComments).toBe(1)
    expect(metrics.growth?.challengePosts).toBe(1)
    expect(metrics.growth?.challengeOpens).toBe(1)
    expect(metrics.growth?.challengeCompletions).toBe(1)
    expect(metrics.growth?.newPlayerChallengeCompletions).toBe(1)
    expect(metrics.growth?.notifyOptIns).toBe(1)
    expect(metrics.growth?.subscribeTaps).toBe(1)
    expect(metrics.growth?.challengePostsPerCompleter).toBe(1)
    expect(metrics.growth?.newCompletersPerChallenge).toBe(1)
})

const testDailyViralMetrics = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testDailyViralMetrics('getDailyMetrics includes computed viral metrics', async () => {
    await recordCompleter('2025-01-15', 't2_solver1')
    await recordCompleter('2025-01-15', 't2_solver2')
    await recordSharer('2025-01-15', 't2_solver1')
    await recordCycleTime('2025-01-15', 3600)
    await recordCycleTime('2025-01-15', 7200)
    await recordChannelOpen('2025-01-15', 'challenge_post', 't2_newbie')
    await recordChannelOpen('2025-01-15', 'challenge_post', 't2_other')
    await recordChannelConversion('2025-01-15', 'challenge_post', 't2_newbie')

    const metrics = await getDailyMetrics('2025-01-15')

    expect(metrics.growth?.shareRate).toBe(0.5)
    expect(metrics.growth?.viralCycleTimeHours).toBe(1.5)
    expect(metrics.growth?.perChannelMetrics?.challenge_post).toStrictEqual({
        opens: 2,
        conversions: 1,
        conversionRate: 0.5,
    })
    expect(metrics.growth?.perChannelMetrics?.result_comment).toStrictEqual({
        opens: 0,
        conversions: 0,
        conversionRate: null,
    })
})

const testReturnRate = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testReturnRate('computeReturnRateForDate reads persisted completion cohorts', async () => {
    await trackCompletion('2025-01-15', 't3_d1', 't2_u1', 't5_testsub')
    await trackCompletion('2025-01-15', 't3_d1', 't2_u2', 't5_testsub')
    await trackCompletion('2025-01-16', 't3_d2', 't2_u2', 't5_testsub')
    await trackCompletion('2025-01-16', 't3_d2', 't2_u3', 't5_testsub')

    expect(await computeReturnRateForDate('2025-01-15', 1)).toBe(0.5)
})

describe('computeKFactorPure', () => {
    it('multiplies challenge actions, new completers, and retained share', () => {
        expect(computeKFactorPure({
            completions: 20,
            challengePosts: 5,
            newPlayerChallengeCompletions: 10,
            challengeD1RetainedShare: 0.4,
        })).toBe(0.2)
    })

    it('returns 0 when there are no completions or no challenge posts', () => {
        expect(computeKFactorPure({
            completions: 0,
            challengePosts: 5,
            newPlayerChallengeCompletions: 10,
            challengeD1RetainedShare: 0.4,
        })).toBe(0)

        expect(computeKFactorPure({
            completions: 20,
            challengePosts: 0,
            newPlayerChallengeCompletions: 10,
            challengeD1RetainedShare: 0.4,
        })).toBe(0)
    })

    it('returns null when challengeD1RetainedShare is null (window incomplete)', () => {
        expect(computeKFactorPure({
            completions: 20,
            challengePosts: 5,
            newPlayerChallengeCompletions: 10,
            challengeD1RetainedShare: null,
        })).toBeNull()
    })

    it('the no-activity short-circuit takes precedence over null retention', () => {
        // When there is no viral activity at all, K is unambiguously 0 even
        // if the D+1 window is still open — there is nothing to retain.
        expect(computeKFactorPure({
            completions: 0,
            challengePosts: 0,
            newPlayerChallengeCompletions: 0,
            challengeD1RetainedShare: null,
        })).toBe(0)
    })
})

// ─── isReturnWindowClosed ──────────────────────────────────────────────────────

describe('isReturnWindowClosed', () => {
    it('returns false when today UTC equals date+days (window still open)', () => {
        const now = new Date('2026-05-27T18:00:00Z')
        expect(isReturnWindowClosed('2026-05-26', 1, now)).toBe(false)
    })

    it('returns false when today UTC is before date+days', () => {
        const now = new Date('2026-05-27T18:00:00Z')
        expect(isReturnWindowClosed('2026-05-27', 1, now)).toBe(false)
    })

    it('returns true when today UTC is strictly after date+days', () => {
        const now = new Date('2026-05-28T00:00:01Z')
        expect(isReturnWindowClosed('2026-05-26', 1, now)).toBe(true)
    })

    it('returns true for ancient dates regardless of days', () => {
        const now = new Date('2026-05-27T00:00:00Z')
        expect(isReturnWindowClosed('2025-01-15', 1, now)).toBe(true)
        expect(isReturnWindowClosed('2025-01-15', 3, now)).toBe(true)
    })

    it('handles the UTC-day-rollover boundary correctly', () => {
        // At exactly 00:00 UTC on date+days+1, the comparison is
        // todayUTC ('2026-05-28') > cohortDate ('2026-05-27') → true.
        const justAfterRollover = new Date('2026-05-28T00:00:00Z')
        expect(isReturnWindowClosed('2026-05-26', 1, justAfterRollover)).toBe(true)
    })
})

// ─── Window-aware return-rate semantics ────────────────────────────────────────

const testWindowOpen = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testWindowOpen('computeReturnRateForDate returns null when window is open', async () => {
    // Seed a cohort on a "yesterday" date relative to a fixed `now`.
    await trackCompletion('2026-05-26', 't3_p1', 't2_u1', 't5_testsub')
    await trackCompletion('2026-05-26', 't3_p1', 't2_u2', 't5_testsub')

    const now = new Date('2026-05-27T12:00:00Z')

    // Window for D+1 of 2026-05-26 closes at the end of 2026-05-27, so at
    // 12:00 on 2026-05-27 the window is still open.
    expect(await computeReturnRateForDate('2026-05-26', 1, now)).toBeNull()
})

const testWindowClosed = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testWindowClosed('computeReturnRateForDate returns the rate once the window closes', async () => {
    await trackCompletion('2026-05-26', 't3_p1', 't2_u1', 't5_testsub')
    await trackCompletion('2026-05-26', 't3_p1', 't2_u2', 't5_testsub')
    await trackCompletion('2026-05-27', 't3_p2', 't2_u2', 't5_testsub')

    const now = new Date('2026-05-28T00:00:01Z')

    // After UTC-day rollover the window for 2026-05-26 → D+1 has closed
    // and the rate is the real cohort overlap (1 of 2 returned).
    expect(await computeReturnRateForDate('2026-05-26', 1, now)).toBe(0.5)
})

const testD1WindowFlag = createDevvitTest({ userId: 't2_testuser', subredditId: 't5_testsub' })

testD1WindowFlag('getDailyMetrics flags d1WindowIncomplete for today and recent days', async () => {
    // Seed minimal activity so the metrics object has non-zero rates where
    // expected. The date is "today" relative to the system clock, so the
    // D+1 window is genuinely open.
    const today = new Date().toISOString().split('T')[0]!
    await trackPostOpen(today, 't3_today', 't2_u1', 't5_testsub')
    await trackFirstAction(today, 't3_today', 't2_u1', 't5_testsub')
    await trackCompletion(today, 't3_today', 't2_u1', 't5_testsub')

    const metrics = await getDailyMetrics(today)

    expect(metrics.dq.d1WindowIncomplete).toBe(true)
    expect(metrics.d1ReturnRate).toBeNull()
    // K-factor is null for today because challengeD1RetainedShare is null.
    // (The no-activity short-circuit doesn't apply here only if there's a
    // challenge post; without one, K returns 0 from the short-circuit.)
    // Either 0 or null is acceptable — the contract is "never silently lie".
    expect([null, 0]).toContain(metrics.growth?.kFactor ?? null)
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
    // estimatedDQE now reflects the daily_active_engagers sorted set, which
    // includes both first-action users (2) — not just completers (1).
    expect(metrics.estimatedDQE).toBe(2)
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

