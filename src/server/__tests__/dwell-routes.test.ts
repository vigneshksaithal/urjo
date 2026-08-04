/**
 * Tests for POST /api/dwell/tick.
 *
 * Covers:
 *   - Header / body validation (400s)
 *   - Happy path: tick accumulates, qualified flag flips when gate closes
 *   - Server-side cap is enforced via the underlying lib (smoke check)
 *   - Tick from a session that already qualified is idempotent
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, runWithContext } from '@devvit/web/server'
import { describe, expect } from 'vitest'

import { app } from '../index'
import {
    captureReferrer,
    markFirstTapAndCommit,
    readGlobalDQP,
    readPerSubDQP,
    SESSION_HEADER,
} from '../lib/qualified'
import { readAnonymousPlaytime } from '../lib/metrics'

const CTX = {
    userId: 't2_dwelluser',
    subredditId: 't5_dwellsub',
    subredditName: 'dwellsub',
    postId: 't3_dwellpost',
}

const withCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithContext(CTX as Parameters<typeof runWithContext>[0], fn)

const todayUTC = (): string => {
    const iso = new Date().toISOString().split('T')[0]
    if (iso === undefined) throw new Error('failed to format today')
    return iso
}

const test = createDevvitTest(CTX)

const ANONYMOUS_CTX = {
    subredditId: 't5_dwellsub',
    subredditName: 'dwellsub',
    postId: 't3_dwellpost',
}

const withAnonymousCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithContext(ANONYMOUS_CTX as Parameters<typeof runWithContext>[0], fn)

// ─── Validation ───────────────────────────────────────────────────────────────

test('POST /api/dwell/tick rejects missing x-urjo-session header (400)', async () => {
    const res = await withCtx(() =>
        app.request('/api/dwell/tick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tickSeconds: 5 }),
        }),
    )
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/session/i)
})

test('POST /api/dwell/tick rejects invalid JSON body (400)', async () => {
    const res = await withCtx(() =>
        app.request('/api/dwell/tick', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                [SESSION_HEADER]: 'sess-bad-body',
            },
            body: 'not-json',
        }),
    )
    expect(res.status).toBe(400)
})

test('POST /api/dwell/tick accepts but skips zero/negative tickSeconds (200, no-op)', async () => {
    const res = await withCtx(() =>
        app.request('/api/dwell/tick', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                [SESSION_HEADER]: 'sess-noop',
            },
            body: JSON.stringify({ tickSeconds: 0 }),
        }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { qualified: boolean; tickSeconds: number }
    expect(body.qualified).toBe(false)
    expect(body.tickSeconds).toBe(0)

    // No session-flag hash should have been written.
    const flags = await withCtx(() => redis.hGetAll('qe:session:sess-noop:flags'))
    expect(flags.dwellSeconds).toBeUndefined()
})

test('POST /api/dwell/tick aggregates anonymous dwell without creating identity or DQP state', async () => {
    const sessionId = 'session_anonymous-dwell'
    const date = todayUTC()

    for (let i = 0; i < 2; i++) {
        const res = await withAnonymousCtx(() =>
            app.request('/api/dwell/tick', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    [SESSION_HEADER]: sessionId,
                },
                body: JSON.stringify({ tickSeconds: 5 }),
            }),
        )
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ qualified: false, tickSeconds: 5 })
    }

    expect(await withAnonymousCtx(() => readAnonymousPlaytime(date))).toEqual({
        totalSeconds: 10,
        sessions: 1,
        averageSeconds: 10,
    })
    expect(await withAnonymousCtx(() => redis.hGetAll(`qe:session:${sessionId}:flags`))).toEqual({})
    expect(await withAnonymousCtx(() => readGlobalDQP(date))).toBe(0)
})

// ─── Happy path ───────────────────────────────────────────────────────────────

test('POST /api/dwell/tick: ticks accumulate and DQP commits when gate closes', async () => {
    const sessionId = 'sess-dwell-happy'
    const date = todayUTC()

    // Pre-set referrer + first-tap so we can isolate the dwell-driven commit.
    await withCtx(() =>
        captureReferrer(sessionId, 't2_dwelluser', 't5_dwellsub', 'https://reddit.com/r/x/'),
    )
    await withCtx(() => markFirstTapAndCommit(sessionId, date, 't2_dwelluser', 't5_dwellsub'))

    expect(await withCtx(() => readGlobalDQP(date))).toBe(0)

    // 4 ticks of 5s each → 20s, hits the threshold.
    for (let i = 0; i < 4; i++) {
        const res = await withCtx(() =>
            app.request('/api/dwell/tick', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    [SESSION_HEADER]: sessionId,
                },
                body: JSON.stringify({ tickSeconds: 5 }),
            }),
        )
        expect(res.status).toBe(200)
    }

    expect(await withCtx(() => readGlobalDQP(date))).toBe(1)
    expect(await withCtx(() => readPerSubDQP(date, 't5_dwellsub'))).toBe(1)
})

test('POST /api/dwell/tick: a tick on an already-qualified session does not double-count', async () => {
    const sessionId = 'sess-dwell-idem'
    const date = todayUTC()

    await withCtx(() =>
        captureReferrer(sessionId, 't2_dwelluser', 't5_dwellsub', 'https://reddit.com/r/x/'),
    )
    await withCtx(() => markFirstTapAndCommit(sessionId, date, 't2_dwelluser', 't5_dwellsub'))

    // Push past the gate.
    for (let i = 0; i < 5; i++) {
        await withCtx(() =>
            app.request('/api/dwell/tick', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    [SESSION_HEADER]: sessionId,
                },
                body: JSON.stringify({ tickSeconds: 5 }),
            }),
        )
    }
    expect(await withCtx(() => readGlobalDQP(date))).toBe(1)

    // Two more ticks — should be a no-op for cardinality.
    for (let i = 0; i < 2; i++) {
        await withCtx(() =>
            app.request('/api/dwell/tick', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    [SESSION_HEADER]: sessionId,
                },
                body: JSON.stringify({ tickSeconds: 5 }),
            }),
        )
    }
    expect(await withCtx(() => readGlobalDQP(date))).toBe(1)
})

test('POST /api/dwell/tick: clamps oversized tickSeconds (cap = 10/tick)', async () => {
    const sessionId = 'sess-dwell-clamp'
    const date = todayUTC()

    await withCtx(() =>
        captureReferrer(sessionId, 't2_dwelluser', 't5_dwellsub', 'https://reddit.com/r/x/'),
    )
    await withCtx(() => markFirstTapAndCommit(sessionId, date, 't2_dwelluser', 't5_dwellsub'))

    // Try to skip the gate with a single oversized tick.
    const res = await withCtx(() =>
        app.request('/api/dwell/tick', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                [SESSION_HEADER]: sessionId,
            },
            body: JSON.stringify({ tickSeconds: 9999 }),
        }),
    )
    expect(res.status).toBe(200)

    // dwellSeconds should be at most 10 (per-tick cap), so still NOT qualified.
    const body = await res.json() as { qualified: boolean; dwellSeconds: number }
    expect(body.dwellSeconds).toBe(10)
    expect(body.qualified).toBe(false)
    expect(await withCtx(() => readGlobalDQP(date))).toBe(0)
})
