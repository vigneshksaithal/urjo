import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, runWithContext } from '@devvit/web/server'
import { expect } from 'vitest'

import { app } from '../index'
import { getTodayUTC } from '../lib/helpers'

type TestContext = {
    userId?: string
    postId: string
    subredditId: string
    subredditName: string
}

const POST_ID = 't3_migratepost'
const SESSION_ID = 'session_migrate_123'
const ATTEMPT_ID = 'attempt_migrate_123'
const LOGGED_OUT_CONTEXT: TestContext = {
    postId: POST_ID,
    subredditId: 't5_testsub',
    subredditName: 'testsub',
}
const LOGGED_IN_CONTEXT: TestContext = {
    ...LOGGED_OUT_CONTEXT,
    userId: 't2_returning',
}

const withContext = <T>(ctx: TestContext, callback: () => Promise<T>): Promise<T> =>
    runWithContext(ctx as Parameters<typeof runWithContext>[0], callback)

const stateHeaders = (): Record<string, string> => ({
    'x-urjo-session': SESSION_ID,
})

const attemptHeaders = (contentId: string): Record<string, string> => ({
    'Content-Type': 'application/json',
    'x-urjo-session': SESSION_ID,
    'x-urjo-content': contentId,
    'x-urjo-attempt': ATTEMPT_ID,
    'x-urjo-event': 'event_migrate_123',
})

const seedPuzzle = async (scheduledDate?: string): Promise<void> => {
    await redis.hSet(`game:${POST_ID}:puzzle`, {
        colors: 'rrbbrrbbrrbbrrbb',
        numbers: '----------------',
        solution: 'rrbbrrbbrrbbrrbb',
        difficulty: 'easy',
        gridSize: '4',
        ...(scheduledDate === undefined ? {} : {
            scheduledDate,
            scheduledSlotKey: '6x6-1400',
            scheduledGridSize: '4',
        }),
    })
}

const issueMigrationToken = async (scheduledDate?: string): Promise<{
    migrationToken: string
    timeTaken: number
}> => {
    await withContext(LOGGED_OUT_CONTEXT, () => seedPuzzle(scheduledDate))
    const state = await withContext(LOGGED_OUT_CONTEXT, () => app.request('/api/game/state', {
        headers: stateHeaders(),
    }))
    const { contentId } = await state.json() as { contentId: string }
    await withContext(LOGGED_OUT_CONTEXT, () => app.request('/api/game/timer-start', {
        method: 'POST',
        headers: attemptHeaders(contentId),
    }))
    const complete = await withContext(LOGGED_OUT_CONTEXT, () => app.request('/api/game/complete', {
        method: 'POST',
        headers: attemptHeaders(contentId),
        body: JSON.stringify({
            timeTaken: 999,
            mistakes: 999,
            board: 'rrbbrrbbrrbbrrbb',
        }),
    }))
    const body = await complete.json() as { migrationToken?: string; timeTaken: number }
    if (body.migrationToken === undefined) throw new Error('Expected a migration token')
    return { migrationToken: body.migrationToken, timeTaken: body.timeTaken }
}

const testMigration = createDevvitTest({
    userId: 't2_returning',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: POST_ID,
})

testMigration('credits only server-derived current-day scheduled completion data', async () => {
    const receipt = await issueMigrationToken(getTodayUTC())
    const response = await withContext(LOGGED_IN_CONTEXT, () =>
        app.request('/api/game/migrate-logged-out-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                migrationToken: receipt.migrationToken,
                timeTaken: 999,
                mistakes: 999,
                board: 'forged-client-data',
            }),
        }),
    )
    const body = await response.json() as {
        migrated: boolean
        credited: boolean
        coinReward?: { total: number }
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ migrated: true, credited: true })
    expect(body.coinReward?.total).toBeGreaterThan(0)
    expect(await redis.get(`user:${LOGGED_IN_CONTEXT.userId}:streak:current`)).toBe('1')
    expect(await redis.zScore(
        `leaderboard:speed:${getTodayUTC()}:4`,
        LOGGED_IN_CONTEXT.userId ?? '',
    )).toBe(receipt.timeTaken)
})

testMigration('is idempotent and never double-credits a token', async () => {
    const receipt = await issueMigrationToken(getTodayUTC())
    const request = (): Promise<Response> => withContext(LOGGED_IN_CONTEXT, () =>
        app.request('/api/game/migrate-logged-out-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ migrationToken: receipt.migrationToken }),
        }),
    )

    const first = await request()
    const coinsAfterFirst = await redis.hGet(
        `user:${LOGGED_IN_CONTEXT.userId}:economy`,
        'totalCoins',
    )
    const second = await request()
    const secondBody = await second.json() as { migrated: boolean; credited: boolean }

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(secondBody).toEqual({ migrated: false, credited: true })
    expect(await redis.hGet(
        `user:${LOGGED_IN_CONTEXT.userId}:economy`,
        'totalCoins',
    )).toBe(coinsAfterFirst)
})

testMigration('consumes but does not competitively credit unscheduled content', async () => {
    const receipt = await issueMigrationToken()
    const response = await withContext(LOGGED_IN_CONTEXT, () =>
        app.request('/api/game/migrate-logged-out-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ migrationToken: receipt.migrationToken }),
        }),
    )
    const body = await response.json() as { migrated: boolean; credited: boolean }

    expect(response.status).toBe(200)
    expect(body).toEqual({ migrated: true, credited: false })
    expect(await redis.get(`user:${LOGGED_IN_CONTEXT.userId}:streak:current`)).toBeUndefined()
    expect(await redis.hGet(
        `user:${LOGGED_IN_CONTEXT.userId}:economy`,
        'totalCoins',
    )).toBeUndefined()
    expect(await redis.zScore(
        `leaderboard:speed:${getTodayUTC()}:4`,
        LOGGED_IN_CONTEXT.userId ?? '',
    )).toBeUndefined()
})

testMigration('does not credit stale scheduled content', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const receipt = await issueMigrationToken(yesterday)
    const response = await withContext(LOGGED_IN_CONTEXT, () =>
        app.request('/api/game/migrate-logged-out-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ migrationToken: receipt.migrationToken }),
        }),
    )
    const body = await response.json() as { migrated: boolean; credited: boolean }

    expect(response.status).toBe(200)
    expect(body).toEqual({ migrated: true, credited: false })
    expect(await redis.get(`user:${LOGGED_IN_CONTEXT.userId}:streak:current`)).toBeUndefined()
})

testMigration('rejects missing or expired migration tokens', async () => {
    const response = await withContext(LOGGED_IN_CONTEXT, () =>
        app.request('/api/game/migrate-logged-out-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ migrationToken: 'missing_token_123' }),
        }),
    )

    expect(response.status).toBe(400)
})
const testNoUser = createDevvitTest({
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: POST_ID,
})

testNoUser('keeps migration gated to logged-in users', async () => {
    const response = await withContext(LOGGED_OUT_CONTEXT, () =>
        app.request('/api/game/migrate-logged-out-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ migrationToken: 'migration_token_123' }),
        }),
    )

    expect(response.status).toBe(400)
})
