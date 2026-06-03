/**
 * Integration tests for POST /api/game/migrate-logged-out-score.
 *
 * When a logged-out player signs in, the client replays the score it stashed
 * in localStorage so the freshly-created account gets credit for the solve
 * (streak + coins + season). The endpoint must be idempotent and gated to
 * logged-in users.
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit as webReddit, runWithContext } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { app } from '../index'

const withCtx = <T>(
    overrides: { userId?: string; postId?: string; subredditId?: string; subredditName?: string },
    fn: () => Promise<T>,
): Promise<T> =>
    runWithContext(
        {
            userId: overrides.userId,
            postId: overrides.postId ?? 't3_migrate_post',
            subredditId: overrides.subredditId ?? 't5_testsub',
            subredditName: overrides.subredditName ?? 'testsub',
        } as Parameters<typeof runWithContext>[0],
        fn,
    )

const CTX = {
    userId: 't2_returning',
    postId: 't3_migrate_post',
    subredditId: 't5_testsub',
    subredditName: 'testsub',
}

const seedPuzzle = async (): Promise<void> => {
    await redis.hSet(`game:${CTX.postId}:puzzle`, {
        colors: 'rrbbrrbbrrbbrrbb',
        numbers: '----------------',
        solution: 'rrbbrrbbrrbbrrbb',
        difficulty: 'easy',
        gridSize: '4',
    })
}

const VALID_BODY = { timeTaken: 30, mistakes: 0 }

const testMigrate = createDevvitTest({
    userId: 't2_returning',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_migrate_post',
})

testMigrate('credits streak + coins for a returning user', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'returning' } as never)
    await withCtx(CTX, seedPuzzle)

    const res = await withCtx(CTX, () =>
        app.request('/api/game/migrate-logged-out-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(VALID_BODY),
        }),
    )
    expect(res.status).toBe(200)

    const body = await res.json() as { migrated: boolean; coinReward?: { total: number } }
    expect(body.migrated).toBe(true)
    expect(body.coinReward?.total).toBeGreaterThan(0)

    const streak = await withCtx(CTX, () => redis.get(`user:${CTX.userId}:streak:current`))
    expect(streak).toBe('1')

    vi.restoreAllMocks()
})

testMigrate('is idempotent — second call does not double-credit', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'returning' } as never)
    await withCtx(CTX, seedPuzzle)

    await withCtx(CTX, () =>
        app.request('/api/game/migrate-logged-out-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(VALID_BODY),
        }),
    )
    const coinsAfterFirst = await withCtx(CTX, () => redis.hGet(`user:${CTX.userId}:economy`, 'totalCoins'))

    const res = await withCtx(CTX, () =>
        app.request('/api/game/migrate-logged-out-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(VALID_BODY),
        }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { migrated: boolean }
    expect(body.migrated).toBe(false)

    const coinsAfterSecond = await withCtx(CTX, () => redis.hGet(`user:${CTX.userId}:economy`, 'totalCoins'))
    expect(coinsAfterSecond).toBe(coinsAfterFirst)

    vi.restoreAllMocks()
})

testMigrate('rejects invalid timeTaken', async () => {
    await withCtx(CTX, seedPuzzle)
    const res = await withCtx(CTX, () =>
        app.request('/api/game/migrate-logged-out-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeTaken: 0, mistakes: 0 }),
        }),
    )
    expect(res.status).toBe(400)
})

const testMigrateNoUser = createDevvitTest({
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_migrate_post',
})

testMigrateNoUser('returns 400 when logged out', async () => {
    const res = await runWithContext(
        { postId: 't3_migrate_post', subredditId: 't5_testsub', subredditName: 'testsub' } as Parameters<typeof runWithContext>[0],
        () =>
            app.request('/api/game/migrate-logged-out-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(VALID_BODY),
            }),
    )
    expect(res.status).toBe(400)
})
