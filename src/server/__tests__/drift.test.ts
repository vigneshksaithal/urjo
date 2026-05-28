/**
 * Tests for the Reddit-QE drift-detection library.
 *
 * Pure: classifyDrift, computeDrift, validateRedditQEUpload, formatDriftLogLine
 * Redis: storeRedditQEUpload, runDriftCheck, readDriftRecords
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { runWithContext } from '@devvit/web/server'
import { describe, expect, it } from 'vitest'

import {
    classifyDrift,
    computeDrift,
    DRIFT_BANDS,
    DriftRecord,
    formatDriftLogLine,
    MIN_DRIFT_SAMPLE,
    readDriftRecords,
    runDriftCheck,
    storeRedditQEUpload,
    validateRedditQEUpload,
} from '../lib/drift'
import { commitQualifiedUser } from '../lib/qualified'

const CTX = {
    userId: 't2_driftuser',
    subredditId: 't5_driftsub',
    subredditName: 'driftsub',
    postId: 't3_driftpost',
}

const withCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithContext(CTX as Parameters<typeof runWithContext>[0], fn)

// ─── Pure: classifyDrift ──────────────────────────────────────────────────────

describe('classifyDrift', () => {
    it('returns "none" for drift below 10%', () => {
        expect(classifyDrift(0).severity).toBe('none')
        expect(classifyDrift(0.05).severity).toBe('none')
        expect(classifyDrift(0.0999).severity).toBe('none')
    })

    it('returns "slack" for drift in [10%, 25%)', () => {
        expect(classifyDrift(0.10).severity).toBe('slack')
        expect(classifyDrift(0.20).severity).toBe('slack')
        expect(classifyDrift(0.2499).severity).toBe('slack')
    })

    it('returns "p2" for drift in [25%, 50%)', () => {
        expect(classifyDrift(0.25).severity).toBe('p2')
        expect(classifyDrift(0.40).severity).toBe('p2')
        expect(classifyDrift(0.4999).severity).toBe('p2')
    })

    it('returns "p1" for drift >= 50%', () => {
        expect(classifyDrift(0.50).severity).toBe('p1')
        expect(classifyDrift(0.99).severity).toBe('p1')
        expect(classifyDrift(2.0).severity).toBe('p1') // 200% drift
    })

    it('absolute-values negative drift (under-counting is just as bad as over-)', () => {
        expect(classifyDrift(-0.30).severity).toBe('p2')
        expect(classifyDrift(-0.60).severity).toBe('p1')
    })

    it('returns "none" for non-finite inputs (NaN/Infinity → defended as not-actionable)', () => {
        expect(classifyDrift(NaN).severity).toBe('none')
        expect(classifyDrift(Infinity).severity).toBe('none')
        expect(classifyDrift(-Infinity).severity).toBe('none')
    })

    it('DRIFT_BANDS is non-empty and ordered descending by minDrift', () => {
        expect(DRIFT_BANDS.length).toBeGreaterThan(0)
        for (let i = 1; i < DRIFT_BANDS.length; i++) {
            expect(DRIFT_BANDS[i - 1]!.minDrift).toBeGreaterThanOrEqual(DRIFT_BANDS[i]!.minDrift)
        }
    })
})

// ─── Pure: computeDrift ───────────────────────────────────────────────────────

describe('computeDrift', () => {
    it('returns null when sample is below MIN_DRIFT_SAMPLE', () => {
        expect(computeDrift(0, 10)).toBe(null)
        expect(computeDrift(100, MIN_DRIFT_SAMPLE - 1)).toBe(null)
    })

    it('returns 0 when DQP equals QE', () => {
        expect(computeDrift(100, 100)).toBe(0)
    })

    it('returns the correct fraction for over-counting', () => {
        expect(computeDrift(150, 100)).toBe(0.5)
    })

    it('returns the correct fraction for under-counting', () => {
        expect(computeDrift(50, 100)).toBe(0.5)
    })

    it('uses |DQP - QE| / QE so the fraction is always non-negative', () => {
        expect(computeDrift(0, 100)).toBe(1.0)
        expect(computeDrift(200, 100)).toBe(1.0)
    })
})

// ─── Pure: validateRedditQEUpload ─────────────────────────────────────────────

describe('validateRedditQEUpload', () => {
    it('accepts a minimal valid payload (date + global)', () => {
        expect(validateRedditQEUpload({ date: '2026-05-28', global: 800 })).toBe(null)
    })

    it('accepts a payload with perSub', () => {
        expect(validateRedditQEUpload({
            date: '2026-05-28',
            global: 800,
            perSub: { 't5_a': 400, 't5_b': 200 },
        })).toBe(null)
    })

    it('rejects non-object payloads', () => {
        expect(validateRedditQEUpload(null)).toMatch(/object/)
        expect(validateRedditQEUpload('hi')).toMatch(/object/)
        expect(validateRedditQEUpload(42)).toMatch(/object/)
    })

    it('rejects malformed date', () => {
        expect(validateRedditQEUpload({ date: '5/28/2026', global: 800 })).toMatch(/date/)
        expect(validateRedditQEUpload({ date: '2026-5-28', global: 800 })).toMatch(/date/)
        expect(validateRedditQEUpload({ global: 800 })).toMatch(/date/)
    })

    it('rejects negative or non-integer global', () => {
        expect(validateRedditQEUpload({ date: '2026-05-28', global: -1 })).toMatch(/global/)
        expect(validateRedditQEUpload({ date: '2026-05-28', global: 1.5 })).toMatch(/global/)
        expect(validateRedditQEUpload({ date: '2026-05-28', global: 'a lot' })).toMatch(/global/)
    })

    it('rejects perSub keys that do not start with t5_', () => {
        const err = validateRedditQEUpload({
            date: '2026-05-28',
            global: 800,
            perSub: { 'puzzles': 400 },
        })
        expect(err).toMatch(/t5_/)
    })

    it('rejects perSub values that are not non-negative integers', () => {
        expect(validateRedditQEUpload({
            date: '2026-05-28',
            global: 800,
            perSub: { 't5_a': -5 },
        })).toMatch(/non-negative/)
        expect(validateRedditQEUpload({
            date: '2026-05-28',
            global: 800,
            perSub: { 't5_a': 1.5 },
        })).toMatch(/non-negative/)
    })

    it('rejects perSub that is a non-object', () => {
        expect(validateRedditQEUpload({
            date: '2026-05-28',
            global: 800,
            perSub: 'lots',
        })).toMatch(/perSub/)
    })
})

// ─── Pure: formatDriftLogLine ─────────────────────────────────────────────────

describe('formatDriftLogLine', () => {
    const baseRec: DriftRecord = {
        date: '2026-05-28',
        scope: 't5_alpha',
        ourDQP: 1000,
        redditQE: 800,
        drift: 0.25,
        severity: 'p2',
        severityLabel: 'P2',
        computedAtMs: 0,
    }

    it('produces a stable log format', () => {
        const line = formatDriftLogLine(baseRec)
        expect(line).toMatch(/^\[DRIFT\] P2 /)
        expect(line).toContain('date=2026-05-28')
        expect(line).toContain('scope=t5_alpha')
        expect(line).toContain('dqp=1000')
        expect(line).toContain('redditQE=800')
        expect(line).toContain('drift=25.0%')
    })

    it('renders n/a when drift is null', () => {
        const rec = { ...baseRec, drift: null, severity: 'none' as const }
        const line = formatDriftLogLine(rec)
        expect(line).toContain('drift=n/a')
    })
})

// ─── Redis: end-to-end ────────────────────────────────────────────────────────

const test = createDevvitTest(CTX)

test('storeRedditQEUpload persists global + per-sub counts', async () => {
    const result = await withCtx(() =>
        storeRedditQEUpload({
            date: '2026-05-28',
            global: 938,
            perSub: { 't5_a': 500, 't5_b': 300, 't5_c': 100 },
        }),
    )

    expect(result.globalStored).toBe(938)
    expect(result.perSubStored).toBe(3)
})

test('runDriftCheck without an upload returns no records', async () => {
    const records = await withCtx(() => runDriftCheck('1999-01-01'))
    expect(records).toEqual([])
})

test('runDriftCheck flags drift correctly across global + top-N subs', async () => {
    const date = '2026-05-29'

    // Seed Reddit QE: global=500, t5_a=400 (top), t5_b=100 (small).
    await withCtx(() =>
        storeRedditQEUpload({
            date,
            global: 500,
            perSub: { 't5_a': 400, 't5_b': 100 },
        }),
    )

    // Seed our DQP:
    //   global has 600 users (drift = (600-500)/500 = 20%, slack)
    //   t5_a has 600 users (drift = (600-400)/400 = 50%, p1)
    //   t5_b has 110 users (drift = 10%, slack — but sample 100 ≥ MIN_DRIFT_SAMPLE)
    for (let i = 0; i < 600; i++) {
        await withCtx(() => commitQualifiedUser(date, `t2_global_${i}`, 't5_a'))
    }
    // The above commits all 600 to t5_a. We need t5_b to have its own users.
    // commitQualifiedUser is idempotent by userId, so reset by using fresh ids.
    for (let i = 0; i < 110; i++) {
        await withCtx(() => commitQualifiedUser(date, `t2_b_${i}`, 't5_b'))
    }

    const records = await withCtx(() => runDriftCheck(date))

    const byScope = Object.fromEntries(records.map((r) => [r.scope, r]))
    expect(byScope._global!.severity).toMatch(/slack|p2/) // global drift > 10%
    expect(byScope.t5_a!.severity).toBe('p1')             // 50% drift
    expect(byScope.t5_b!.severity).toBe('slack')          // 10% drift
})

test('runDriftCheck does not flag subs below MIN_DRIFT_SAMPLE', async () => {
    const date = '2026-05-30'

    // Tiny upload: 10 < MIN_DRIFT_SAMPLE.
    await withCtx(() =>
        storeRedditQEUpload({
            date,
            global: 1000, // global is fine
            perSub: { 't5_tiny': 10 },
        }),
    )
    // Massively over-count t5_tiny: 100 ours vs 10 QE = 900% drift.
    for (let i = 0; i < 100; i++) {
        await withCtx(() => commitQualifiedUser(date, `t2_tiny_${i}`, 't5_tiny'))
    }

    const records = await withCtx(() => runDriftCheck(date))
    const tinyRec = records.find((r) => r.scope === 't5_tiny')
    expect(tinyRec).toBeDefined()
    expect(tinyRec!.severity).toBe('none') // sample too small to act on
    expect(tinyRec!.drift).toBe(null)
})

test('readDriftRecords returns previously persisted records', async () => {
    const date = '2026-06-01'
    await withCtx(() =>
        storeRedditQEUpload({ date, global: 1000, perSub: { 't5_x': 1000 } }),
    )
    for (let i = 0; i < 100; i++) {
        await withCtx(() => commitQualifiedUser(date, `t2_p_${i}`, 't5_x'))
    }

    await withCtx(() => runDriftCheck(date))
    const persisted = await withCtx(() => readDriftRecords(date))

    expect(persisted.length).toBeGreaterThan(0)
    for (const rec of persisted) {
        expect(rec.date).toBe(date)
        expect(typeof rec.severity).toBe('string')
    }
})
