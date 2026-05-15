/**
 * Integration tests for notify API routes.
 * Tests opt-in and opt-out endpoints for the Tomorrow-Trigger feature.
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 19.1
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, runWithContext } from '@devvit/web/server'
import { expect } from 'vitest'
import { app } from '../index'

// ─── Helper: run with Devvit context ──────────────────────────────────────────

const withCtx = <T>(
    overrides: { userId?: string; subredditId?: string; subredditName?: string },
    fn: () => Promise<T>,
): Promise<T> =>
    runWithContext(
        {
            userId: overrides.userId,
            subredditId: overrides.subredditId ?? 't5_testsub',
            subredditName: overrides.subredditName ?? 'testsub',
        } as Parameters<typeof runWithContext>[0],
        fn,
    )

const CTX = { userId: 't2_player1', subredditId: 't5_testsub', subredditName: 'testsub' }
const NO_USER_CTX = { subredditId: 't5_testsub', subredditName: 'testsub' }

// ─── POST /api/game/notify/opt-in — 401 when no userId ───────────────────────

const testOptInNoUser = createDevvitTest({ subredditId: 't5_testsub', subredditName: 'testsub' })

testOptInNoUser('POST /api/game/notify/opt-in returns 401 when no userId', async () => {
    const res = await withCtx(NO_USER_CTX, () =>
        app.request('/api/game/notify/opt-in', { method: 'POST' }),
    )

    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Authentication required')
})

// ─── POST /api/game/notify/opt-out — 401 when no userId ──────────────────────

const testOptOutNoUser = createDevvitTest({ subredditId: 't5_testsub', subredditName: 'testsub' })

testOptOutNoUser('POST /api/game/notify/opt-out returns 401 when no userId', async () => {
    const res = await withCtx(NO_USER_CTX, () =>
        app.request('/api/game/notify/opt-out', { method: 'POST' }),
    )

    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Authentication required')
})

// ─── POST /api/game/notify/opt-in — returns { optedIn: true } ────────────────

const testOptIn = createDevvitTest({ userId: 't2_player1', subredditId: 't5_testsub', subredditName: 'testsub' })

testOptIn('POST /api/game/notify/opt-in adds user to opt-in set and returns { optedIn: true }', async () => {
    const res = await withCtx(CTX, () =>
        app.request('/api/game/notify/opt-in', { method: 'POST' }),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { optedIn: boolean }
    expect(body.optedIn).toBe(true)

    // Verify user is in the sorted set
    const score = await withCtx(CTX, () => redis.zScore('notify:optin', 't2_player1'))
    expect(score).toBeDefined()
})

// ─── POST /api/game/notify/opt-out — returns { optedIn: false } ──────────────

const testOptOut = createDevvitTest({ userId: 't2_player1', subredditId: 't5_testsub', subredditName: 'testsub' })

testOptOut('POST /api/game/notify/opt-out removes user from opt-in set and returns { optedIn: false }', async () => {
    // First opt in
    await withCtx(CTX, () => redis.zAdd('notify:optin', { member: 't2_player1', score: Date.now() }))

    const res = await withCtx(CTX, () =>
        app.request('/api/game/notify/opt-out', { method: 'POST' }),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { optedIn: boolean }
    expect(body.optedIn).toBe(false)

    // Verify user is no longer in the sorted set
    const score = await withCtx(CTX, () => redis.zScore('notify:optin', 't2_player1'))
    expect(score).toBeUndefined()
})

// ─── POST /api/game/notify/opt-in — idempotent (double opt-in) ───────────────

const testDoubleOptIn = createDevvitTest({ userId: 't2_player1', subredditId: 't5_testsub', subredditName: 'testsub' })

testDoubleOptIn('POST /api/game/notify/opt-in is idempotent — double opt-in preserves membership', async () => {
    // First opt-in
    await withCtx(CTX, () =>
        app.request('/api/game/notify/opt-in', { method: 'POST' }),
    )

    // Second opt-in
    const res = await withCtx(CTX, () =>
        app.request('/api/game/notify/opt-in', { method: 'POST' }),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { optedIn: boolean }
    expect(body.optedIn).toBe(true)

    // User is still in the set
    const score = await withCtx(CTX, () => redis.zScore('notify:optin', 't2_player1'))
    expect(score).toBeDefined()
})

// ─── POST /api/game/notify/opt-out — safe for non-member ─────────────────────

const testOptOutNonMember = createDevvitTest({ userId: 't2_player1', subredditId: 't5_testsub', subredditName: 'testsub' })

testOptOutNonMember('POST /api/game/notify/opt-out returns { optedIn: false } for non-member without error', async () => {
    // User is not in the set — opt-out should still succeed
    const res = await withCtx(CTX, () =>
        app.request('/api/game/notify/opt-out', { method: 'POST' }),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { optedIn: boolean }
    expect(body.optedIn).toBe(false)
})
