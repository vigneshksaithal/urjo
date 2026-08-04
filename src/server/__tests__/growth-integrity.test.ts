import { Context, runWithContext } from '@devvit/server'
import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { expect } from 'vitest'

import { app } from '../index'

const POST_ID = 't3_growth_integrity'
const USER_ID = 't2_growth_player'
const SESSION_ID = 'growth-session-123'
const SOLUTION = 'rbrbbrbrrbbbbrbr'

const TEST_HEADERS = {
    'devvit-user': USER_ID,
    'devvit-app-user': USER_ID,
    'devvit-subreddit': 't5_urjo',
    'devvit-subreddit-name': 'urjo',
    'devvit-app': 'urjo-game',
    'devvit-version': '0.0.0-test',
    'devvit-app-viewer-authorization': 'test-token',
    'devvit-post': POST_ID,
}

const test = createDevvitTest({ userId: USER_ID, subredditName: 'urjo' })

const requestWithPost = (url: string, init?: RequestInit): Promise<Response> =>
    runWithContext(Context(TEST_HEADERS), () => app.request(url, init))

const seedPostPuzzle = async (): Promise<void> => {
    await redis.hSet(`game:${POST_ID}:puzzle`, {
        colors: SOLUTION,
        numbers: '-'.repeat(SOLUTION.length),
        solution: SOLUTION,
        difficulty: 'easy',
        gridSize: '4',
        created: new Date().toISOString(),
    })
}

const issuePuzzle = async (instanceId: string): Promise<void> => {
    await redis.hSet(`user:${USER_ID}:game:${POST_ID}:currentPuzzle`, {
        colors: SOLUTION,
        numbers: '-'.repeat(SOLUTION.length),
        solution: SOLUTION,
        difficulty: 'easy',
        gridSize: '4',
        instanceId,
        source: 'adaptive',
    })
}

const complete = (): Promise<Response> =>
    requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-urjo-session': SESSION_ID,
        },
        body: JSON.stringify({
            board: SOLUTION,
            timeTaken: 30,
            mistakes: 99,
            sessionRun: 50,
        }),
    })

test('game state never exposes the stored solution to a normal player', async () => {
    await seedPostPuzzle()

    const response = await requestWithPost('/api/game/state', {
        headers: { 'x-urjo-session': SESSION_ID },
    })
    const body = await response.json() as { puzzle: Record<string, unknown> }

    expect(body.puzzle).not.toHaveProperty('solution')
})

test('verified completion returns a reusable opaque completion id', async () => {
    await seedPostPuzzle()
    await issuePuzzle('receipt-1')

    const response = await complete()
    const body = await response.json() as { completionId?: string }

    expect(response.status).toBe(200)
    expect(body.completionId).toMatch(/^[a-zA-Z0-9_-]{16,64}$/)
})

test('session run is derived from verified solves instead of the client value', async () => {
    await seedPostPuzzle()
    await issuePuzzle('run-1')

    const firstResponse = await complete()
    const first = await firstResponse.json() as { sessionRun?: number }

    await issuePuzzle('run-2')
    const secondResponse = await complete()
    const second = await secondResponse.json() as { sessionRun?: number }

    expect(first.sessionRun).toBe(1)
    expect(second.sessionRun).toBe(2)
})

test('client-only mistake counts do not alter verified performance or award a perfect bonus', async () => {
    await seedPostPuzzle()
    await issuePuzzle('mistakes-local-only')

    const response = await complete()
    const body = await response.json() as {
        performanceScore?: number
        coinReward?: { perfectBonus?: number }
    }

    expect(response.status).toBe(200)
    expect(body.performanceScore).toBeCloseTo(2 / 3, 5)
    expect(body.coinReward?.perfectBonus).toBe(0)
})

test('daily preview counts every unique verified puzzle completion', async () => {
    await seedPostPuzzle()
    await redis.hSet(`game:${POST_ID}:preview`, {
        type: 'daily',
        data: JSON.stringify({
            puzzleNumber: 91,
            gridSize: 4,
            completionsToday: 0,
            activeNow: 0,
            fastestTime: null,
            fastestUsername: null,
        }),
    })

    await issuePuzzle('preview-1')
    expect((await complete()).status).toBe(200)
    await issuePuzzle('preview-2')
    expect((await complete()).status).toBe(200)

    const preview = await redis.hGetAll(`game:${POST_ID}:preview`)
    const data = JSON.parse(preview.data ?? '{}') as { completionsToday?: number }

    expect(data.completionsToday).toBe(2)
})
