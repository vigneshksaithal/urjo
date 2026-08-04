/**
 * Tests for the DQP (Daily Qualified Players) gate library.
 *
 * Pure-function tests (isRedditReferrer, evaluateGate, clampTickSeconds,
 * getSessionIdFromHeader) need no Redis. Mutator tests (captureReferrer,
 * markFirstTapAndCommit, recordDwellTick, commitQualifiedUser) use the
 * @devvit/test in-memory Redis via createDevvitTest.
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, runWithContext } from '@devvit/web/server'
import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'

import {
    captureReferrer,
    clampTickSeconds,
    commitQualifiedUser,
    dqpKeys,
    evaluateGate,
    getSessionIdFromHeader,
    isRedditReferrer,
    markFirstTapAndCommit,
    MIN_DWELL_SECONDS,
    MAX_DWELL_SECONDS,
    computeGlobalD1RetentionEstimate,
    DQP_RETENTION_SAMPLE_CAP,
    DQP_RETENTION_TTL_SECONDS,
    readGlobalDQP,
    readPerSubDQP,
    readQualifiedPlaytime,
    buildQualifiedSummary,
    recordDwellTick,
    SESSION_HEADER,
} from '../lib/qualified'

const CTX = {
    userId: 't2_qpuser',
    subredditId: 't5_testsub',
    subredditName: 'testsub',
    postId: 't3_qppost',
}

const withCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithContext(CTX as Parameters<typeof runWithContext>[0], fn)

// ─── Pure: isRedditReferrer ───────────────────────────────────────────────────

describe('isRedditReferrer', () => {
    it('accepts canonical reddit.com URLs', () => {
        expect(isRedditReferrer('https://www.reddit.com/r/foo/comments/abc/')).toBe(true)
        expect(isRedditReferrer('https://reddit.com/r/foo')).toBe(true)
        expect(isRedditReferrer('https://old.reddit.com/r/foo')).toBe(true)
        expect(isRedditReferrer('https://m.reddit.com/r/foo')).toBe(true)
        expect(isRedditReferrer('https://np.reddit.com/r/foo')).toBe(true)
    })

    it('accepts redditmedia.com and redd.it', () => {
        expect(isRedditReferrer('https://i.redditmedia.com/some/asset.png')).toBe(true)
        expect(isRedditReferrer('https://redd.it/abc123')).toBe(true)
    })

    it('rejects non-Reddit referrers', () => {
        expect(isRedditReferrer('https://google.com/')).toBe(false)
        expect(isRedditReferrer('https://reddit.evil.com/')).toBe(false)
        expect(isRedditReferrer('https://my-reddit-clone.com/')).toBe(false)
        expect(isRedditReferrer('https://reddit.com.evil.com/')).toBe(false)
    })

    it('rejects null, undefined, and empty referrers', () => {
        expect(isRedditReferrer(null)).toBe(false)
        expect(isRedditReferrer(undefined)).toBe(false)
        expect(isRedditReferrer('')).toBe(false)
        expect(isRedditReferrer('   ')).toBe(false)
    })

    it('accepts host-only (no scheme) reddit hosts', () => {
        expect(isRedditReferrer('reddit.com')).toBe(true)
        expect(isRedditReferrer('www.reddit.com/r/foo')).toBe(true)
    })

    it('is case-insensitive', () => {
        expect(isRedditReferrer('HTTPS://WWW.REDDIT.COM/')).toBe(true)
        expect(isRedditReferrer('https://Reddit.COM/r/foo')).toBe(true)
    })
})

// ─── Pure: evaluateGate ───────────────────────────────────────────────────────

describe('evaluateGate', () => {
    it('returns qualified=false when all flags are missing', () => {
        const result = evaluateGate({})
        expect(result.qualified).toBe(false)
        expect(result.flags).toEqual({ referrer: false, firstTap: false, dwellOk: false })
        expect(result.dwellSeconds).toBe(0)
    })

    it('requires all three flags to be true', () => {
        // Two of three — never qualified.
        expect(evaluateGate({ referrer: '1', firstTap: '1' }).qualified).toBe(false)
        expect(evaluateGate({ referrer: '1', dwellSeconds: '20' }).qualified).toBe(false)
        expect(evaluateGate({ firstTap: '1', dwellSeconds: '20' }).qualified).toBe(false)

        // All three — qualified.
        expect(
            evaluateGate({ referrer: '1', firstTap: '1', dwellSeconds: '20' }).qualified,
        ).toBe(true)
    })

    it('treats dwellSeconds < threshold as not-yet-qualified', () => {
        const result = evaluateGate({
            referrer: '1',
            firstTap: '1',
            dwellSeconds: (MIN_DWELL_SECONDS - 1).toString(),
        })
        expect(result.qualified).toBe(false)
        expect(result.flags.dwellOk).toBe(false)
    })

    it('caps dwellSeconds reads at MAX_DWELL_SECONDS', () => {
        const result = evaluateGate({
            referrer: '1',
            firstTap: '1',
            dwellSeconds: '99999',
        })
        expect(result.dwellSeconds).toBe(MAX_DWELL_SECONDS)
        expect(result.qualified).toBe(true)
    })

    it('coerces non-numeric and negative dwell to 0', () => {
        expect(evaluateGate({ dwellSeconds: 'abc' }).dwellSeconds).toBe(0)
        expect(evaluateGate({ dwellSeconds: '-5' }).dwellSeconds).toBe(0)
    })

    it('respects a custom minDwellSeconds threshold', () => {
        const result = evaluateGate(
            { referrer: '1', firstTap: '1', dwellSeconds: '5' },
            5,
        )
        expect(result.qualified).toBe(true)
    })
})

// ─── Pure: clampTickSeconds ───────────────────────────────────────────────────

describe('clampTickSeconds', () => {
    it('returns 0 for invalid inputs', () => {
        expect(clampTickSeconds(undefined)).toBe(0)
        expect(clampTickSeconds(null)).toBe(0)
        expect(clampTickSeconds('5' as unknown)).toBe(0)
        expect(clampTickSeconds(NaN)).toBe(0)
        expect(clampTickSeconds(Infinity)).toBe(0)
        expect(clampTickSeconds(0)).toBe(0)
        expect(clampTickSeconds(-3)).toBe(0)
    })

    it('floors fractional seconds', () => {
        expect(clampTickSeconds(5.7)).toBe(5)
        expect(clampTickSeconds(0.9)).toBe(0)
    })

    it('caps at maxPerTick (default 10)', () => {
        expect(clampTickSeconds(15)).toBe(10)
        expect(clampTickSeconds(1000)).toBe(10)
        expect(clampTickSeconds(15, 30)).toBe(15)
    })

    it('property: result is always within [0, maxPerTick]', () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.float(), fc.integer(), fc.constant(NaN)),
                fc.integer({ min: 1, max: 60 }),
                (raw, max) => {
                    const result = clampTickSeconds(raw, max)
                    expect(result).toBeGreaterThanOrEqual(0)
                    expect(result).toBeLessThanOrEqual(max)
                    expect(Number.isInteger(result)).toBe(true)
                },
            ),
            { numRuns: 100 },
        )
    })
})

// ─── Pure: getSessionIdFromHeader ─────────────────────────────────────────────

describe('getSessionIdFromHeader', () => {
    const headersFor = (value: string | null): Headers => {
        const h = new Headers()
        if (value !== null) h.set(SESSION_HEADER, value)
        return h
    }

    it('returns trimmed value when present', () => {
        expect(getSessionIdFromHeader(headersFor('  abc-123  '))).toBe('abc-123')
    })

    it('returns null when missing', () => {
        expect(getSessionIdFromHeader(headersFor(null))).toBe(null)
    })

    it('returns null when empty after trim', () => {
        expect(getSessionIdFromHeader(headersFor('   '))).toBe(null)
    })

    it('returns null when implausibly long (>64 chars)', () => {
        expect(getSessionIdFromHeader(headersFor('a'.repeat(65)))).toBe(null)
    })

    it('accepts a 64-char session id', () => {
        const id = 'a'.repeat(64)
        expect(getSessionIdFromHeader(headersFor(id))).toBe(id)
    })
})

// ─── Integration: captureReferrer ─────────────────────────────────────────────

const testCapture = createDevvitTest(CTX)

testCapture('captureReferrer sets referrer=1 when referer is Reddit-origin', async () => {
    const sessionId = 'sess-cap-1'
    await withCtx(() =>
        captureReferrer(sessionId, 't2_qpuser', 't5_testsub', 'https://www.reddit.com/r/foo/comments/x/'),
    )

    const flags = await withCtx(() => redis.hGetAll(`qe:session:${sessionId}:flags`))
    expect(flags.referrer).toBe('1')
    expect(flags.userId).toBeUndefined()
    expect(flags.subredditId).toBe('t5_testsub')
})

testCapture('captureReferrer does NOT set referrer flag for non-Reddit referer', async () => {
    const sessionId = 'sess-cap-2'
    await withCtx(() =>
        captureReferrer(sessionId, 't2_qpuser', 't5_testsub', 'https://google.com/'),
    )

    const flags = await withCtx(() => redis.hGetAll(`qe:session:${sessionId}:flags`))
    expect(flags.referrer).toBeUndefined()
    expect(flags.userId).toBeUndefined()
})

testCapture('captureReferrer is idempotent on subredditId (first-write wins)', async () => {
    const sessionId = 'sess-cap-3'
    await withCtx(() =>
        captureReferrer(sessionId, 't2_qpuser', 't5_first', 'https://reddit.com/r/foo'),
    )
    await withCtx(() =>
        captureReferrer(sessionId, 't2_qpuser', 't5_second', 'https://reddit.com/r/bar'),
    )

    const flags = await withCtx(() => redis.hGetAll(`qe:session:${sessionId}:flags`))
    // First sub wins for attribution (user might bounce across multiple posts)
    expect(flags.subredditId).toBe('t5_first')
})

// ─── Integration: full AND-gate flow → commit ─────────────────────────────────

const testGate = createDevvitTest(CTX)

testGate('full DQP flow: referrer + first-tap + dwell ≥ 20s commits user to per-sub zset', async () => {
    const sessionId = 'sess-flow-1'
    const date = '2026-05-28'

    // 1. Open: referrer captured.
    await withCtx(() =>
        captureReferrer(sessionId, 't2_qpuser', 't5_testsub', 'https://reddit.com/r/foo'),
    )
    // Not yet qualified — only 1 of 3 flags set.
    expect(await withCtx(() => readGlobalDQP(date))).toBe(0)

    // 2. First tap: still missing dwell.
    await withCtx(() => markFirstTapAndCommit(sessionId, date, 't2_qpuser', 't5_testsub'))
    expect(await withCtx(() => readGlobalDQP(date))).toBe(0)

    // 3. Dwell heartbeats: 4 × 5s = 20s, hits threshold.
    for (let i = 0; i < 4; i++) {
        await withCtx(() => recordDwellTick(sessionId, 't2_qpuser', 5, date))
    }

    expect(await withCtx(() => readGlobalDQP(date))).toBe(1)
    expect(await withCtx(() => readPerSubDQP(date, 't5_testsub'))).toBe(1)
})

testGate('first-tap arriving AFTER dwell still commits the user (any order)', async () => {
    const sessionId = 'sess-flow-order'
    const date = '2026-05-29'

    await withCtx(() =>
        captureReferrer(sessionId, 't2_qpuser', 't5_testsub', 'https://reddit.com/r/foo'),
    )
    // Dwell first.
    for (let i = 0; i < 5; i++) {
        await withCtx(() => recordDwellTick(sessionId, 't2_qpuser', 5, date))
    }
    expect(await withCtx(() => readGlobalDQP(date))).toBe(0) // no first-tap yet

    // First tap last — gate now closes.
    await withCtx(() => markFirstTapAndCommit(sessionId, date, 't2_qpuser', 't5_testsub'))
    expect(await withCtx(() => readGlobalDQP(date))).toBe(1)
})

testGate('non-Reddit referrer never qualifies regardless of taps and dwell', async () => {
    const sessionId = 'sess-flow-nonreddit'
    const date = '2026-05-30'

    await withCtx(() =>
        captureReferrer(sessionId, 't2_qpuser', 't5_testsub', 'https://google.com/'),
    )
    await withCtx(() => markFirstTapAndCommit(sessionId, date, 't2_qpuser', 't5_testsub'))
    for (let i = 0; i < 6; i++) {
        await withCtx(() => recordDwellTick(sessionId, 't2_qpuser', 5, date))
    }

    expect(await withCtx(() => readGlobalDQP(date))).toBe(0)
})

testGate('dwell below MIN_DWELL_SECONDS does not qualify', async () => {
    const sessionId = 'sess-flow-shortdwell'
    const date = '2026-05-31'

    await withCtx(() =>
        captureReferrer(sessionId, 't2_qpuser', 't5_testsub', 'https://reddit.com/r/foo'),
    )
    await withCtx(() => markFirstTapAndCommit(sessionId, date, 't2_qpuser', 't5_testsub'))
    // Only 15s — under the 20s threshold.
    await withCtx(() => recordDwellTick(sessionId, 't2_qpuser', 10, date))
    await withCtx(() => recordDwellTick(sessionId, 't2_qpuser', 5, date))

    expect(await withCtx(() => readGlobalDQP(date))).toBe(0)
})

testGate('dwell ticks accumulate but cap at MAX_DWELL_SECONDS', async () => {
    const sessionId = 'sess-flow-cap'
    const date = '2026-06-01'

    for (let i = 0; i < 30; i++) {
        await withCtx(() => recordDwellTick(sessionId, 't2_qpuser', 10, date))
    }
    const flags = await withCtx(() => redis.hGetAll(`qe:session:${sessionId}:flags`))
    expect(parseInt(flags.dwellSeconds!, 10)).toBe(MAX_DWELL_SECONDS)
})

// ─── Integration: idempotent commit ───────────────────────────────────────────

const testCommit = createDevvitTest(CTX)

testCommit('commitQualifiedUser is idempotent — second call returns false', async () => {
    const date = '2026-06-02'

    const first = await withCtx(() =>
        commitQualifiedUser(date, 't2_qpuser', 't5_testsub'),
    )
    expect(first).toBe(true)

    const second = await withCtx(() =>
        commitQualifiedUser(date, 't2_qpuser', 't5_testsub'),
    )
    expect(second).toBe(false)

    // Cardinality stays at 1
    expect(await withCtx(() => readGlobalDQP(date))).toBe(1)
    expect(await withCtx(() => readPerSubDQP(date, 't5_testsub'))).toBe(1)
})

testCommit('commit cross-sub same-day: user counted once globally, per first-touch sub only', async () => {
    const date = '2026-06-03'

    await withCtx(() => commitQualifiedUser(date, 't2_qpuser', 't5_first'))
    // Different sub, same day, same user — should be a no-op (dedup wins).
    await withCtx(() => commitQualifiedUser(date, 't2_qpuser', 't5_second'))

    expect(await withCtx(() => readGlobalDQP(date))).toBe(1)
    expect(await withCtx(() => readPerSubDQP(date, 't5_first'))).toBe(1)
    expect(await withCtx(() => readPerSubDQP(date, 't5_second'))).toBe(0)
})

testCommit('commit without subredditId only writes to the global zset', async () => {
    const date = '2026-06-04'

    await withCtx(() => commitQualifiedUser(date, 't2_qpuser', undefined))

    expect(await withCtx(() => readGlobalDQP(date))).toBe(1)
})

testCommit('dqpKeys export shape is stable for read paths', () => {
    expect(dqpKeys.global('2026-06-05')).toBe('qe:ours:2026-06-05')
    expect(dqpKeys.perSub('2026-06-05', 't5_x')).toBe('qe:ours:2026-06-05:t5_x')
    expect(dqpKeys.filter('2026-06-05')).toBe('qe:filter:2026-06-05')
    expect(dqpKeys.sample('2026-06-05')).toBe('qe:sample:2026-06-05')
    expect(dqpKeys.playtime('2026-06-05')).toBe('qe:playtime:2026-06-05')
})

testCommit('commitQualifiedUser estimates unique DQP without increasing for repeat qualification', async () => {
    const date = '2026-06-06'

    await withCtx(() => commitQualifiedUser(date, 't2_repeat', 't5_testsub'))
    await withCtx(() => commitQualifiedUser(date, 't2_repeat', 't5_testsub'))

    expect(await withCtx(() => readGlobalDQP(date))).toBe(1)
})

testCommit('commitQualifiedUser sets a 35-day TTL on bounded retention keys', async () => {
    const date = '2026-06-07'
    await withCtx(() => commitQualifiedUser(date, 't2_ttl', 't5_testsub'))

    const filterExpireAt = await withCtx(() => redis.expireTime(dqpKeys.filter(date)))
    const sampleExpireAt = await withCtx(() => redis.expireTime(dqpKeys.sample(date)))
    const minExpected = Math.floor(Date.now() / 1000) + DQP_RETENTION_TTL_SECONDS - 60

    expect(filterExpireAt).toBeGreaterThanOrEqual(minExpected)
    expect(sampleExpireAt).toBeGreaterThanOrEqual(minExpected)
})

testCommit(
    'retention cohort sample is capped at the configured maximum',
    async () => {
        const date = '2026-06-08'

        for (let i = 0; i < DQP_RETENTION_SAMPLE_CAP + 25; i++) {
            await withCtx(() => commitQualifiedUser(date, `t2_cap_${i}`, 't5_testsub'))
        }

        expect(await withCtx(() => redis.zCard(dqpKeys.sample(date)))).toBe(DQP_RETENTION_SAMPLE_CAP)
    },
    15_000,
)

testCommit('qualified play time is stored as daily counters and histogram buckets', async () => {
    const sessionId = 'sess-playtime'
    const date = '2026-06-09'

    await withCtx(() =>
        captureReferrer(sessionId, 't2_qpuser', 't5_testsub', 'https://reddit.com/r/foo'),
    )
    await withCtx(() => markFirstTapAndCommit(sessionId, date, 't2_qpuser', 't5_testsub'))
    for (let i = 0; i < 6; i++) {
        await withCtx(() => recordDwellTick(sessionId, 't2_qpuser', 5, date))
    }

    const metrics = await withCtx(() => redis.hGetAll(dqpKeys.playtime(date)))
    expect(metrics.totalSeconds).toBe('30')
    expect(metrics.qualifiedSessions).toBe('1')
    expect(metrics.b20_29).toBe('0')
    expect(metrics.b30_44).toBe('1')
})

testCommit('readQualifiedPlaytime aggregates sessions, average, and buckets', async () => {
    const date = '2026-06-11'

    // Session A: 30s active (b30_44 bucket).
    await withCtx(() =>
        captureReferrer('sess-a', 't2_pt_a', 't5_testsub', 'https://reddit.com/r/foo'),
    )
    await withCtx(() => markFirstTapAndCommit('sess-a', date, 't2_pt_a', 't5_testsub'))
    for (let i = 0; i < 6; i++) {
        await withCtx(() => recordDwellTick('sess-a', 't2_pt_a', 5, date))
    }

    // Session B: 50s active (b45_60 bucket).
    await withCtx(() =>
        captureReferrer('sess-b', 't2_pt_b', 't5_testsub', 'https://reddit.com/r/foo'),
    )
    await withCtx(() => markFirstTapAndCommit('sess-b', date, 't2_pt_b', 't5_testsub'))
    for (let i = 0; i < 5; i++) {
        await withCtx(() => recordDwellTick('sess-b', 't2_pt_b', 10, date))
    }

    const playtime = await withCtx(() => readQualifiedPlaytime(date))
    expect(playtime.qualifiedSessions).toBe(2)
    expect(playtime.totalSeconds).toBe(80)
    expect(playtime.averageSeconds).toBe(40)
    expect(playtime.buckets).toEqual({ b20_29: 0, b30_44: 1, b45_60: 1 })
})

testCommit('readQualifiedPlaytime returns a null average for an empty date', async () => {
    const playtime = await withCtx(() => readQualifiedPlaytime('1999-01-01'))
    expect(playtime.qualifiedSessions).toBe(0)
    expect(playtime.totalSeconds).toBe(0)
    expect(playtime.averageSeconds).toBe(null)
    expect(playtime.buckets).toEqual({ b20_29: 0, b30_44: 0, b45_60: 0 })
})

testCommit('buildQualifiedSummary reads DQP and play time from yesterday', async () => {
    // Fix "now" so yesterday is a stable, isolated date.
    const now = new Date('2026-07-15T12:00:00Z')
    const dqpDate = '2026-07-14'

    await withCtx(() =>
        captureReferrer('sess-sum', 't2_sum_a', 't5_testsub', 'https://reddit.com/r/foo'),
    )
    await withCtx(() => markFirstTapAndCommit('sess-sum', dqpDate, 't2_sum_a', 't5_testsub'))
    for (let i = 0; i < 6; i++) {
        await withCtx(() => recordDwellTick('sess-sum', 't2_sum_a', 5, dqpDate))
    }

    const summary = await withCtx(() => buildQualifiedSummary(now))
    expect(summary.dqpDate).toBe(dqpDate)
    expect(summary.dqp).toBe(1)
    expect(summary.d1Date).toBe('2026-07-13')
    expect(summary.d7Date).toBe('2026-07-07')
    expect(summary.qualifiedSessions).toBe(1)
    expect(summary.averagePlaySeconds).toBe(30)
    expect(summary.playtimeBuckets).toEqual({ b20_29: 0, b30_44: 1, b45_60: 0 })
})

testCommit('buildQualifiedSummary surfaces a matured D1 retention estimate', async () => {
    // now → yesterday=07-19, D1 cohort=07-18 (its D+1 day 07-19 has closed).
    const now = new Date('2026-07-20T12:00:00Z')
    const d1Cohort = '2026-07-18'
    const d1Return = '2026-07-19'

    // Two qualify on the cohort day; one returns on D+1.
    await withCtx(() => commitQualifiedUser(d1Cohort, 't2_sum_d1a', 't5_testsub'))
    await withCtx(() => commitQualifiedUser(d1Cohort, 't2_sum_d1b', 't5_testsub'))
    await withCtx(() => commitQualifiedUser(d1Return, 't2_sum_d1a', 't5_testsub'))

    const summary = await withCtx(() => buildQualifiedSummary(now, 1))
    expect(summary.d1Date).toBe(d1Cohort)
    expect(summary.d1SampleSize).toBe(2)
    expect(summary.d1Retention).toBe(0.5)
})


// ─── D7 Retention ─────────────────────────────────────────────────────────────

import {
    computeD7Pure,
    computeGlobalD7Retention,
    computePerSubD7Retention,
    isD7WindowClosed,
} from '../lib/qualified'

describe('computeD7Pure', () => {
    it('returns null on an empty cohort (cannot divide by zero)', () => {
        expect(computeD7Pure([], [])).toBe(null)
        expect(computeD7Pure([], ['t2_a'])).toBe(null)
    })

    it('returns 0 when no cohort member returned', () => {
        expect(computeD7Pure(['t2_a', 't2_b'], ['t2_c'])).toBe(0)
    })

    it('returns 1 when every cohort member returned', () => {
        expect(computeD7Pure(['t2_a', 't2_b'], ['t2_a', 't2_b', 't2_c'])).toBe(1)
    })

    it('returns the correct fraction for a partial overlap', () => {
        expect(computeD7Pure(
            ['t2_a', 't2_b', 't2_c', 't2_d'],
            ['t2_a', 't2_c'],
        )).toBe(0.5)
    })

    it('does not double-count duplicate cohort members (set-style intersection)', () => {
        // Even if a userId appears twice in the cohort (shouldn't happen with
        // zset semantics, but be defensive), we count by occurrence in cohort
        // since cohort.length is the divisor.
        const cohort = ['t2_a', 't2_a', 't2_b']
        const returned = ['t2_a']
        // 2 of 3 occurrences are in returned → 2/3.
        expect(computeD7Pure(cohort, returned)).toBeCloseTo(2 / 3)
    })
})

describe('isD7WindowClosed', () => {
    it('returns false before D+7 has ended', () => {
        // Cohort date = 2026-05-28. Today = 2026-06-04 (D+7). Window NOT closed yet.
        expect(isD7WindowClosed('2026-05-28', new Date('2026-06-04T00:00:00Z'))).toBe(false)
    })

    it('returns true once UTC date is past D+7', () => {
        // Cohort date = 2026-05-28. Today = 2026-06-05 (D+8). Window closed.
        expect(isD7WindowClosed('2026-05-28', new Date('2026-06-05T00:00:00Z'))).toBe(true)
    })

    it('returns false when called on the cohort day itself', () => {
        expect(isD7WindowClosed('2026-05-28', new Date('2026-05-28T12:00:00Z'))).toBe(false)
    })
})

const testD7 = createDevvitTest(CTX)

testD7('computeGlobalD7Retention returns null while window is open', async () => {
    // Use a cohort date "today" so the window is definitely open.
    const today = new Date().toISOString().split('T')[0] ?? ''
    const result = await withCtx(() => computeGlobalD7Retention(today))
    expect(result).toBe(null)
})

testD7('computeGlobalD7Retention returns null on an empty closed-window cohort', async () => {
    // Cohort 60 days ago — window is closed but no users qualified.
    const longAgo = new Date()
    longAgo.setUTCDate(longAgo.getUTCDate() - 60)
    const cohortDate = longAgo.toISOString().split('T')[0] ?? ''
    expect(await withCtx(() => computeGlobalD7Retention(cohortDate))).toBe(null)
})

testD7('computeGlobalD7Retention computes the correct fraction across D+1..D+7', async () => {
    // Cohort 60d ago (window guaranteed closed).
    const cohortDateMs = Date.now() - 60 * 86400 * 1000
    const cohortDate = new Date(cohortDateMs).toISOString().split('T')[0] ?? ''

    // Seed cohort: 4 users.
    await withCtx(() => commitQualifiedUser(cohortDate, 't2_a', 't5_x'))
    await withCtx(() => commitQualifiedUser(cohortDate, 't2_b', 't5_x'))
    await withCtx(() => commitQualifiedUser(cohortDate, 't2_c', 't5_x'))
    await withCtx(() => commitQualifiedUser(cohortDate, 't2_d', 't5_x'))

    // Returns: t2_a on D+1, t2_c on D+5. Exact-day D7 should ignore both.
    const dPlus = (n: number): string => {
        const d = new Date(cohortDateMs + n * 86400 * 1000)
        return d.toISOString().split('T')[0] ?? ''
    }
    await withCtx(() => commitQualifiedUser(dPlus(1), 't2_a', 't5_x'))
    await withCtx(() => commitQualifiedUser(dPlus(5), 't2_c', 't5_y'))
    // Some noise: a user who wasn't in the cohort returns. Should not affect rate.
    await withCtx(() => commitQualifiedUser(dPlus(3), 't2_z', 't5_x'))

    expect(await withCtx(() => computeGlobalD7Retention(cohortDate, new Date(), 1))).toBe(0)
})

testD7('computeGlobalD1RetentionEstimate uses exact D+1 return only', async () => {
    const cohortDateMs = Date.now() - 60 * 86400 * 1000
    const cohortDate = new Date(cohortDateMs).toISOString().split('T')[0] ?? ''
    const dPlus = (n: number): string => {
        const d = new Date(cohortDateMs + n * 86400 * 1000)
        return d.toISOString().split('T')[0] ?? ''
    }

    await withCtx(() => commitQualifiedUser(cohortDate, 't2_d1_a', 't5_x'))
    await withCtx(() => commitQualifiedUser(cohortDate, 't2_d1_b', 't5_x'))
    await withCtx(() => commitQualifiedUser(dPlus(1), 't2_d1_a', 't5_y'))
    await withCtx(() => commitQualifiedUser(dPlus(2), 't2_d1_b', 't5_y'))

    const result = await withCtx(() => computeGlobalD1RetentionEstimate(cohortDate, new Date(), 1))
    expect(result.sampleSize).toBe(2)
    expect(result.rate).toBe(0.5)
})

testD7('retention estimate returns null below the minimum actionable sample size', async () => {
    const cohortDateMs = Date.now() - 60 * 86400 * 1000
    const cohortDate = new Date(cohortDateMs).toISOString().split('T')[0] ?? ''

    await withCtx(() => commitQualifiedUser(cohortDate, 't2_small_sample', 't5_x'))

    const result = await withCtx(() => computeGlobalD7Retention(cohortDate))
    expect(result).toBe(null)
})

testD7('computePerSubD7Retention is suppressed for bounded-sample cohorts', async () => {
    const cohortDateMs = Date.now() - 60 * 86400 * 1000
    const cohortDate = new Date(cohortDateMs).toISOString().split('T')[0] ?? ''

    // Two users qualified on cohort day in t5_alpha; one user qualified in t5_beta.
    await withCtx(() => commitQualifiedUser(cohortDate, 't2_a1', 't5_alpha'))
    await withCtx(() => commitQualifiedUser(cohortDate, 't2_a2', 't5_alpha'))
    await withCtx(() => commitQualifiedUser(cohortDate, 't2_b1', 't5_beta'))

    // Per-sub retention is de-emphasized once bounded global sampling is present.
    const dPlus = (n: number): string => {
        const d = new Date(cohortDateMs + n * 86400 * 1000)
        return d.toISOString().split('T')[0] ?? ''
    }
    await withCtx(() => commitQualifiedUser(dPlus(7), 't2_a1', 't5_beta'))

    expect(await withCtx(() => computePerSubD7Retention(cohortDate, 't5_alpha', new Date(), 1))).toBe(null)
    expect(await withCtx(() => computePerSubD7Retention(cohortDate, 't5_beta', new Date(), 1))).toBe(null)
})
