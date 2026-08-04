/**
 * Integration tests for logged-out (no userId) support on the core game
 * routes. Logged-out users must be able to load and play the puzzle without
 * hitting the login wall; account-scoped routes stay gated.
 *
 * Reddit guide: "Building for Logged Out Players".
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, runWithContext } from '@devvit/web/server'
import { expect } from 'vitest'
import { app } from '../index'
import {
    getAnonymousPuzzle,
} from '../lib/anonymous-receipts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const withCtx = <T>(
    overrides: { userId?: string; postId?: string; subredditId?: string; subredditName?: string },
    fn: () => Promise<T>,
): Promise<T> =>
    runWithContext(
        {
            userId: overrides.userId,
            postId: overrides.postId ?? 't3_logged_out_post',
            subredditId: overrides.subredditId ?? 't5_testsub',
            subredditName: overrides.subredditName ?? 'testsub',
        } as Parameters<typeof runWithContext>[0],
        fn,
    )

/** Context with NO userId — simulates a logged-out Reddit viewer. */
const LOGGED_OUT_CTX = {
    postId: 't3_logged_out_post',
    subredditId: 't5_testsub',
    subredditName: 'testsub',
}

const SESSION_ID = 'session_logged_out_123'
const ATTEMPT_ID = 'attempt_logged_out_123'

const stateHeaders = (): Record<string, string> => ({
    'x-urjo-session': SESSION_ID,
})

const attemptHeaders = (contentId: string): Record<string, string> => ({
    'Content-Type': 'application/json',
    'x-urjo-session': SESSION_ID,
    'x-urjo-content': contentId,
    'x-urjo-attempt': ATTEMPT_ID,
    'x-urjo-event': 'event_logged_out_123',
})

const seedPuzzle = async (postId: string): Promise<void> => {
    await redis.hSet(`game:${postId}:puzzle`, {
        colors: 'rrbbrrbbrrbbrrbb',
        numbers: '----------------',
        solution: 'rrbbrrbbrrbbrrbb',
        difficulty: 'easy',
        gridSize: '4',
        created: new Date().toISOString(),
    })
}

// ─── GET /api/game/state ───────────────────────────────────────────────────────

const testState = createDevvitTest({
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_logged_out_post',
})

testState('GET /api/game/state serves a playable puzzle to logged-out users', async () => {
    await withCtx(LOGGED_OUT_CTX, () => seedPuzzle('t3_logged_out_post'))

    const res = await withCtx(LOGGED_OUT_CTX, () => app.request('/api/game/state', {
        headers: stateHeaders(),
    }))
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty('isLoggedIn', false)
    expect(body).toHaveProperty('puzzle')
    expect((body.puzzle as { colors: string }).colors).toBe('rrbbrrbbrrbbrrbb')
    const stored = await withCtx(LOGGED_OUT_CTX, () =>
        getAnonymousPuzzle(SESSION_ID, LOGGED_OUT_CTX.postId),
    )
    expect(stored?.puzzle.solution).toBe('rrbbrrbbrrbbrrbb')
    expect(stored?.contentId).toBe(body.contentId)
})

testState('GET /api/game/state omits account-scoped data for logged-out users', async () => {
    await withCtx(LOGGED_OUT_CTX, () => seedPuzzle('t3_logged_out_post'))

    const res = await withCtx(LOGGED_OUT_CTX, () => app.request('/api/game/state'))
    const body = await res.json() as Record<string, unknown>

    expect(body.streak).toBeUndefined()
    expect(body.username).toBeUndefined()
    expect(body.seasonProgress).toBeUndefined()
    expect(body.isMod).toBe(false)
})

testState('GET /api/game/state still 404s when the post has no puzzle', async () => {
    const res = await withCtx(
        { ...LOGGED_OUT_CTX, postId: 't3_missing_puzzle' },
        () => app.request('/api/game/state'),
    )
    expect(res.status).toBe(404)
})

// ─── POST /api/game/complete ─────────────────────────────────────────────────

const testComplete = createDevvitTest({
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_logged_out_post',
})

testComplete('POST /api/game/complete verifies the stored puzzle and uses first-cell server time', async () => {
    await withCtx(LOGGED_OUT_CTX, () => seedPuzzle('t3_logged_out_post'))

    const state = await withCtx(LOGGED_OUT_CTX, () => app.request('/api/game/state', {
        headers: stateHeaders(),
    }))
    const stateBody = await state.json() as { contentId: string }
    await withCtx(LOGGED_OUT_CTX, () => app.request('/api/game/timer-start', {
        method: 'POST',
        headers: attemptHeaders(stateBody.contentId),
    }))

    const res = await withCtx(LOGGED_OUT_CTX, () =>
        app.request('/api/game/complete', {
            method: 'POST',
            headers: attemptHeaders(stateBody.contentId),
            body: JSON.stringify({
                timeTaken: 999,
                mistakes: 999,
                board: 'rrbbrrbbrrbbrrbb',
            }),
        }),
    )
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty('isLoggedIn', false)
    expect(body).toHaveProperty('performanceScore')
    expect(body).toHaveProperty('migrationToken')
    expect(body.timeTaken).not.toBe(999)
    expect(body.coinReward).toBeUndefined()
    expect(body.streak).toBeUndefined()

    // No season leaderboard write should have occurred (nothing to key on).
    const today = new Date().toISOString().split('T')[0] ?? ''
    const completions = await withCtx(LOGGED_OUT_CTX, () => redis.get(`analytics:${today}:completions`))
    // Logged-out completions are counted at most as anonymous; they must not
    // create per-user leaderboard rows. We assert no streak leaderboard row.
    const streakBoard = await withCtx(LOGGED_OUT_CTX, () => redis.zCard('leaderboard:streak'))
    expect(streakBoard).toBe(0)
    void completions
})

testComplete('POST /api/game/complete rejects a forged anonymous board', async () => {
    await withCtx(LOGGED_OUT_CTX, () => seedPuzzle('t3_logged_out_post'))
    const state = await withCtx(LOGGED_OUT_CTX, () => app.request('/api/game/state', {
        headers: stateHeaders(),
    }))
    const { contentId } = await state.json() as { contentId: string }
    await withCtx(LOGGED_OUT_CTX, () => app.request('/api/game/timer-start', {
        method: 'POST',
        headers: attemptHeaders(contentId),
    }))

    const res = await withCtx(LOGGED_OUT_CTX, () => app.request('/api/game/complete', {
        method: 'POST',
        headers: attemptHeaders(contentId),
        body: JSON.stringify({
            timeTaken: 1,
            mistakes: 0,
            board: 'bbbbrrrrbbbbrrrr',
        }),
    }))

    expect(res.status).toBe(400)
})

testComplete('POST /api/game/complete preserves unranked play without measurement headers', async () => {
    await withCtx(LOGGED_OUT_CTX, () => seedPuzzle('t3_logged_out_post'))

    const res = await withCtx(LOGGED_OUT_CTX, () => app.request('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 30, mistakes: 999, board: 'forged' }),
    }))
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.timeTaken).toBe(30)
    expect(body.migrationToken).toBeUndefined()
    expect(body.coinReward).toBeUndefined()
})

testComplete('POST /api/game/complete rejects invalid timeTaken for logged-out users', async () => {
    await withCtx(LOGGED_OUT_CTX, () => seedPuzzle('t3_logged_out_post'))

    const res = await withCtx(LOGGED_OUT_CTX, () =>
        app.request('/api/game/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeTaken: -5, mistakes: 0 }),
        }),
    )
    expect(res.status).toBe(400)
})

// ─── POST /api/game/next-challenge ─────────────────────────────────────────────

const testNext = createDevvitTest({
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_logged_out_post',
})

testNext('POST /api/game/next-challenge serves a fresh puzzle to logged-out users', async () => {
    await withCtx(LOGGED_OUT_CTX, () => seedPuzzle('t3_logged_out_post'))

    const state = await withCtx(LOGGED_OUT_CTX, () => app.request('/api/game/state', {
        headers: stateHeaders(),
    }))
    const stateBody = await state.json() as { contentId: string }

    const res = await withCtx(LOGGED_OUT_CTX, () =>
        app.request('/api/game/next-challenge', {
            method: 'POST',
            headers: attemptHeaders(stateBody.contentId),
            body: JSON.stringify({ timeSpent: 10 }),
        }),
    )
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty('puzzle')
    expect((body.puzzle as { colors: string }).colors.length).toBeGreaterThan(0)
    const stored = await withCtx(LOGGED_OUT_CTX, () =>
        getAnonymousPuzzle(SESSION_ID, LOGGED_OUT_CTX.postId),
    )
    expect(stored?.contentId).toBe(body.contentId)
    expect(stored?.puzzle.solution).toHaveLength(stored?.puzzle.gridSize ** 2)
})

// ─── POST /api/game/grid-size ──────────────────────────────────────────────────

const testGrid = createDevvitTest({
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_logged_out_post',
})

testGrid('POST /api/game/grid-size returns a puzzle at the requested size for logged-out users', async () => {
    await withCtx(LOGGED_OUT_CTX, () => seedPuzzle('t3_logged_out_post'))

    const state = await withCtx(LOGGED_OUT_CTX, () => app.request('/api/game/state', {
        headers: stateHeaders(),
    }))
    const stateBody = await state.json() as { contentId: string }

    const res = await withCtx(LOGGED_OUT_CTX, () =>
        app.request('/api/game/grid-size', {
            method: 'POST',
            headers: attemptHeaders(stateBody.contentId),
            body: JSON.stringify({ gridSize: 6 }),
        }),
    )
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    expect((body.puzzle as { gridSize: number }).gridSize).toBe(6)
    expect(body).toHaveProperty('gridSizePreference', 6)
    const stored = await withCtx(LOGGED_OUT_CTX, () =>
        getAnonymousPuzzle(SESSION_ID, LOGGED_OUT_CTX.postId),
    )
    expect(stored?.contentId).toBe(body.contentId)
    expect(stored?.puzzle.gridSize).toBe(6)
})

testGrid('POST /api/game/grid-size rejects invalid size for logged-out users', async () => {
    const res = await withCtx(LOGGED_OUT_CTX, () =>
        app.request('/api/game/grid-size', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gridSize: 5 }),
        }),
    )
    expect(res.status).toBe(400)
})

// ─── Account-scoped routes stay gated ──────────────────────────────────────────

const testGated = createDevvitTest({
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_logged_out_post',
})
