/**
 * Integration tests that the simplified metrics are actually wired into the
 * request paths: opens on /api/game/state, play time on /api/dwell/tick.
 * The metrics lib is unit-tested separately; these guard the wiring.
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, runWithContext } from '@devvit/web/server'
import { expect } from 'vitest'

import { app } from '../index'
import { getTodayUTC } from '../lib/helpers'
import { SESSION_HEADER } from '../lib/qualified'

const POST_ID = 't3_metrics_post'
const USER_ID = 't2_metrics_user'

const withCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithContext(
        {
            userId: USER_ID,
            postId: POST_ID,
            subredditId: 't5_testsub',
            subredditName: 'testsub',
        } as Parameters<typeof runWithContext>[0],
        fn,
    )

const seedPuzzle = async (): Promise<void> => {
    await redis.hSet(`game:${POST_ID}:puzzle`, {
        colors: 'rrbbrrbbrrbbrrbb',
        numbers: '----------------',
        solution: 'rrbbrrbbrrbbrrbb',
        difficulty: 'easy',
        gridSize: '4',
        created: new Date().toISOString(),
    })
}

// ─── Opens wiring ──────────────────────────────────────────────────────────────

const testOpensWired = createDevvitTest({
    userId: USER_ID,
    postId: POST_ID,
    subredditId: 't5_testsub',
    subredditName: 'testsub',
})

testOpensWired('GET /api/game/state counts a logged-in open once per user/day', async () => {
    await withCtx(async () => {
        await seedPuzzle()

        const first = await app.request('/api/game/state')
        expect(first.status).toBe(200)
        expect(await redis.get(`metrics:${getTodayUTC()}:opens`)).toBe('1')

        // Repeat open by the same user is deduped.
        await app.request('/api/game/state')
        expect(await redis.get(`metrics:${getTodayUTC()}:opens`)).toBe('1')
    })
})

// ─── Play-time wiring ────────────────────────────────────────────────────────

const testPlaytimeWired = createDevvitTest({
    userId: USER_ID,
    postId: POST_ID,
    subredditId: 't5_testsub',
    subredditName: 'testsub',
})

testPlaytimeWired('POST /api/dwell/tick accumulates play time for the session', async () => {
    await withCtx(async () => {
        const tick = (): Promise<Response> =>
            app.request('/api/dwell/tick', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', [SESSION_HEADER]: 'sess-wire' },
                body: JSON.stringify({ tickSeconds: 5 }),
            })

        await tick()
        await tick()

        const pt = await redis.hGetAll(`metrics:${getTodayUTC()}:playtime`)
        expect(pt.totalSeconds).toBe('10')
        expect(pt.sessions).toBe('1')
    })
})
