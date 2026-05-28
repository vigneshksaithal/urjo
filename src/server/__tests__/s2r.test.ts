/**
 * Tests for Second-Puzzle Rate (S2R) instrumentation.
 *
 * Pure: skillToBucket, bucketKey, computeS2RPure, isDifficulty
 * Redis: markS2REligible, tryConvertS2R, readS2RBucket, readS2RGlobal
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, runWithContext } from '@devvit/web/server'
import { describe, expect, it } from 'vitest'

import {
    bucketKey,
    computeS2RPure,
    isDifficulty,
    markS2REligible,
    readS2RBucket,
    readS2RGlobal,
    S2R_ELIGIBILITY_WINDOW_MS,
    skillToBucket,
    tryConvertS2R,
} from '../lib/s2r'

const CTX = {
    userId: 't2_s2ruser',
    subredditId: 't5_s2rsub',
    subredditName: 's2rsub',
    postId: 't3_s2rpost',
}

const withCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithContext(CTX as Parameters<typeof runWithContext>[0], fn)

// ─── Pure ─────────────────────────────────────────────────────────────────────

describe('skillToBucket', () => {
    it('maps 1–3 to "low"', () => {
        expect(skillToBucket(1)).toBe('low')
        expect(skillToBucket(2)).toBe('low')
        expect(skillToBucket(3)).toBe('low')
    })

    it('maps 4–6 to "mid"', () => {
        expect(skillToBucket(4)).toBe('mid')
        expect(skillToBucket(5)).toBe('mid')
        expect(skillToBucket(6)).toBe('mid')
    })

    it('maps 7–9 to "high"', () => {
        expect(skillToBucket(7)).toBe('high')
        expect(skillToBucket(8)).toBe('high')
        expect(skillToBucket(9)).toBe('high')
    })

    it('clamps fractional skill levels to their floor', () => {
        expect(skillToBucket(3.9)).toBe('low')
        expect(skillToBucket(4.1)).toBe('mid')
    })

    it('returns "mid" for non-finite inputs', () => {
        expect(skillToBucket(NaN)).toBe('mid')
        expect(skillToBucket(Infinity)).toBe('mid')
    })

    it('returns "high" for skill > 9 (out-of-band players still get high)', () => {
        expect(skillToBucket(99)).toBe('high')
    })

    it('returns "low" for skill < 1', () => {
        expect(skillToBucket(0)).toBe('low')
        expect(skillToBucket(-5)).toBe('low')
    })
})

describe('bucketKey', () => {
    it('produces stable canonical keys', () => {
        expect(bucketKey(2, 'easy')).toBe('low:easy')
        expect(bucketKey(5, 'medium')).toBe('mid:medium')
        expect(bucketKey(9, 'diabolical')).toBe('high:diabolical')
    })
})

describe('isDifficulty', () => {
    it('accepts the four canonical difficulties', () => {
        expect(isDifficulty('easy')).toBe(true)
        expect(isDifficulty('medium')).toBe(true)
        expect(isDifficulty('hard')).toBe(true)
        expect(isDifficulty('diabolical')).toBe(true)
    })

    it('rejects everything else', () => {
        expect(isDifficulty('Easy')).toBe(false)
        expect(isDifficulty('')).toBe(false)
        expect(isDifficulty(null)).toBe(false)
        expect(isDifficulty(undefined)).toBe(false)
        expect(isDifficulty(123)).toBe(false)
    })
})

describe('computeS2RPure', () => {
    it('returns null when there are no eligible completions', () => {
        expect(computeS2RPure(0, 0)).toBe(null)
        expect(computeS2RPure(0, 5)).toBe(null) // would be infinite
    })

    it('computes the standard fraction', () => {
        expect(computeS2RPure(10, 5)).toBe(0.5)
        expect(computeS2RPure(100, 60)).toBe(0.6)
    })

    it('clamps results to [0, 1]', () => {
        // converted > eligible should never happen, but be defensive.
        expect(computeS2RPure(10, 15)).toBe(1)
    })
})

// ─── Redis: mark + convert flow ──────────────────────────────────────────────

const test = createDevvitTest(CTX)

test('markS2REligible increments the bucket eligible counter', async () => {
    await withCtx(() =>
        markS2REligible('sess-s2r-1', '2026-05-28', 5, 'medium', 't2_user', 't3_post1'),
    )
    await withCtx(() =>
        markS2REligible('sess-s2r-1', '2026-05-28', 5, 'medium', 't2_user', 't3_post1'),
    )

    const snapshot = await withCtx(() => readS2RBucket('2026-05-28', 'mid:medium'))
    expect(snapshot.eligible).toBe(2)
    expect(snapshot.converted).toBe(0)
    expect(snapshot.rate).toBe(0)
})

test('tryConvertS2R returns false when no session record exists', async () => {
    const converted = await withCtx(() =>
        tryConvertS2R('sess-no-record', 't3_anypost'),
    )
    expect(converted).toBe(false)
})

test('tryConvertS2R returns false within window if same postId is reloaded', async () => {
    const sessionId = 'sess-s2r-same-post'
    await withCtx(() =>
        markS2REligible(sessionId, '2026-05-28', 5, 'medium', 't2_user', 't3_post1'),
    )

    // Reload the SAME post — not a "next puzzle" event.
    const converted = await withCtx(() => tryConvertS2R(sessionId, 't3_post1'))
    expect(converted).toBe(false)

    // Counter must not have moved.
    const snapshot = await withCtx(() => readS2RBucket('2026-05-28', 'mid:medium'))
    expect(snapshot.converted).toBe(0)
})

test('tryConvertS2R increments the bucket converted counter and clears the session', async () => {
    const sessionId = 'sess-s2r-convert'
    await withCtx(() =>
        markS2REligible(sessionId, '2026-05-28', 5, 'medium', 't2_user', 't3_post1'),
    )

    // Different post, within window → conversion.
    const converted = await withCtx(() => tryConvertS2R(sessionId, 't3_post2'))
    expect(converted).toBe(true)

    const snapshot = await withCtx(() => readS2RBucket('2026-05-28', 'mid:medium'))
    expect(snapshot.eligible).toBe(1)
    expect(snapshot.converted).toBe(1)
    expect(snapshot.rate).toBe(1)

    // Session record is gone — a second conversion attempt is a no-op.
    const second = await withCtx(() => tryConvertS2R(sessionId, 't3_post3'))
    expect(second).toBe(false)
})

test('tryConvertS2R returns false outside the eligibility window', async () => {
    const sessionId = 'sess-s2r-expired'
    await withCtx(() =>
        markS2REligible(sessionId, '2026-05-28', 5, 'medium', 't2_user', 't3_post1'),
    )

    // Simulate clock advancing past the window.
    const future = Date.now() + S2R_ELIGIBILITY_WINDOW_MS + 1000
    const converted = await withCtx(() =>
        tryConvertS2R(sessionId, 't3_post2', future),
    )
    expect(converted).toBe(false)

    // Stale session record was cleaned up.
    const flags = await withCtx(() => redis.hGetAll(`s2r:session:${sessionId}`))
    expect(flags.bucket).toBeUndefined()
})

test('tryConvertS2R is a no-op when sessionId is null', async () => {
    expect(await withCtx(() => tryConvertS2R(null, 't3_anypost'))).toBe(false)
})

test('readS2RGlobal sums across all buckets', async () => {
    const date = '2026-05-29'
    await withCtx(() => markS2REligible('s1', date, 2, 'easy', 't2_a', 't3_p1'))     // low:easy
    await withCtx(() => markS2REligible('s2', date, 5, 'medium', 't2_b', 't3_p1'))   // mid:medium
    await withCtx(() => markS2REligible('s3', date, 8, 'hard', 't2_c', 't3_p1'))     // high:hard

    await withCtx(() => tryConvertS2R('s1', 't3_p2'))
    await withCtx(() => tryConvertS2R('s2', 't3_p2'))

    const global = await withCtx(() => readS2RGlobal(date))
    expect(global.eligible).toBe(3)
    expect(global.converted).toBe(2)
    expect(global.rate).toBeCloseTo(2 / 3)
})
