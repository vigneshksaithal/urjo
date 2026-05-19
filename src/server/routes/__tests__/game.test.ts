/**
 * Game Route Integration Tests
 * Tests all game API endpoints via app.request() with seeded Redis data.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 9.1, 9.2
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, runWithContext } from '@devvit/web/server'
import { expect } from 'vitest'
import { app } from '../../index'

// postId is not injected by createDevvitTest — it only sets userId/subreddit.
// We must call runWithContext with a context that includes postId for routes that need it.
// Context() builds a Devvit context from raw headers (reads 'devvit-post' for postId).
// We import it from @devvit/server (re-exported via @devvit/web/server).
import { Context } from '@devvit/server'

const POST_ID = 't3_post1'
const USER_ID = 't2_testuser'

// Full headers matching what createDevvitTest injects, plus devvit-post
const TEST_HEADERS = {
    'devvit-user': USER_ID,
    'devvit-app-user': USER_ID,
    'devvit-subreddit': 't5_testsub',
    'devvit-subreddit-name': 'testsub',
    'devvit-app': 'test-app',
    'devvit-version': '0.0.0-test',
    'devvit-app-viewer-authorization': 'test-token',
    'devvit-post': POST_ID,
}

const seedPuzzle = async (): Promise<void> => {
    await redis.hSet(`game:${POST_ID}:puzzle`, {
        colors: 'rbrbbrbrrbbbbrbr',
        numbers: '----------------',
        solution: 'rbrbbrbrrbbbbrbr',
        difficulty: 'easy',
        gridSize: '4',
    })
}

// Helper: run app.request inside a context that includes postId
const requestWithPost = async (url: string, init?: RequestInit): Promise<Response> => {
    const ctx = Context(TEST_HEADERS)
    return runWithContext(ctx, () => app.request(url, init))
}

// ─── GET /api/game/state ──────────────────────────────────────────────────────

const testState = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.1: GET /api/game/state returns 200 with GameState JSON when puzzle is seeded
 */
testState('GET /api/game/state returns 200 with GameState JSON when puzzle is seeded', async () => {
    await seedPuzzle()

    const res = await requestWithPost('/api/game/state')
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.puzzle).toBeDefined()
    expect(json.skillLevel).toBeDefined()
    expect(json.tutorialCompleted).toBeDefined()
    expect(json.streak).toBeDefined()
})

/**
 * Requirement 5.2: GET /api/game/state returns 400 when postId is missing from context.
 * Note: createDevvitTest always injects a default userId, so the userId guard is not
 * reachable. The postId guard IS reachable — calling without the devvit-post header
 * results in context.postId === undefined → 400.
 */
const testNoPost = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

testNoPost('GET /api/game/state returns 400 when postId is missing', async () => {
    // app.request without runWithContext(Context with postId) → context.postId undefined
    const res = await app.request('/api/game/state')
    expect(res.status).toBe(400)
})

// ─── POST /api/game/complete ──────────────────────────────────────────────────

const testComplete = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.3: POST /api/game/complete returns 200 with expected response fields
 */
testComplete('POST /api/game/complete returns 200 with performanceScore, newSkillLevel, previousSkillLevel, streak, coinReward', async () => {
    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 5 }),
    })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.performanceScore).toBeDefined()
    expect(json.newSkillLevel).toBeDefined()
    expect(json.previousSkillLevel).toBeDefined()
    expect(json.streak).toBeDefined()
    expect(json.coinReward).toBeDefined()
})

const testCompleteInvalidStr = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.4: POST /api/game/complete returns 400 for non-number timeTaken
 */
testCompleteInvalidStr('POST /api/game/complete returns 400 for non-number timeTaken', async () => {
    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 'bad' }),
    })
    expect(res.status).toBe(400)
})

const testCompleteZero = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.4: POST /api/game/complete returns 400 for timeTaken <= 0
 */
testCompleteZero('POST /api/game/complete returns 400 for timeTaken=0', async () => {
    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 0 }),
    })
    expect(res.status).toBe(400)
})

// ─── POST /api/game/next-challenge ────────────────────────────────────────────

const testNextChallenge = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.5: POST /api/game/next-challenge returns 200 with puzzle and skillLevel
 */
testNextChallenge('POST /api/game/next-challenge returns 200 with puzzle and skillLevel', async () => {
    const res = await requestWithPost('/api/game/next-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeSpent: 3 }),
    })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.puzzle).toBeDefined()
    expect(json.skillLevel).toBeDefined()
})

// ─── GET /api/game/leaderboard ────────────────────────────────────────────────

const testLeaderboard = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.6: GET /api/game/leaderboard returns 200 with type and entries fields
 */
testLeaderboard('GET /api/game/leaderboard returns 200 with type and entries fields', async () => {
    const res = await app.request('/api/game/leaderboard')
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.type).toBeDefined()
    expect(json.entries).toBeDefined()
})


// ─── Daily Preview Update on First Completion ─────────────────────────────────

const testPreviewUpdate = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 6: First completion on a daily post updates the preview data in Redis
 */
testPreviewUpdate('POST /api/game/complete updates daily preview on first completion', async () => {
    // Seed a daily preview in Redis (simulating what the scheduler does)
    await redis.hSet(`game:${POST_ID}:preview`, {
        type: 'daily',
        data: JSON.stringify({
            puzzleNumber: 42,
            gridSize: 4,
            completionsToday: 0,
            activeNow: 0,
            fastestTime: null,
            fastestUsername: null,
        }),
    })

    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 30 }),
    })
    expect(res.status).toBe(200)

    // Verify preview was updated
    const previewMeta = await redis.hGetAll(`game:${POST_ID}:preview`)
    expect(previewMeta.type).toBe('daily')
    const parsed = JSON.parse(previewMeta.data!)
    expect(parsed.completionsToday).toBe(1)
    expect(parsed.fastestTime).toBe(30)
})

const testPreviewDedup = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 6: Preview update is deduped — second completion does not update preview again
 */
testPreviewDedup('POST /api/game/complete does not update daily preview on second completion (deduped)', async () => {
    // Seed a daily preview in Redis
    await redis.hSet(`game:${POST_ID}:preview`, {
        type: 'daily',
        data: JSON.stringify({
            puzzleNumber: 43,
            gridSize: 4,
            completionsToday: 0,
            activeNow: 0,
            fastestTime: null,
            fastestUsername: null,
        }),
    })

    // Set the dedup key to simulate already-updated
    await redis.set(`preview:updated:${POST_ID}`, '1')

    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 20 }),
    })
    expect(res.status).toBe(200)

    // Verify preview was NOT updated (still shows 0 completions)
    const previewMeta = await redis.hGetAll(`game:${POST_ID}:preview`)
    const parsed = JSON.parse(previewMeta.data!)
    expect(parsed.completionsToday).toBe(0)
    expect(parsed.fastestTime).toBeNull()
})

const testPreviewNonDaily = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 6: Preview update only applies to daily posts, not challenge posts
 */
testPreviewNonDaily('POST /api/game/complete does not update preview for challenge posts', async () => {
    // Seed a challenge preview (not daily)
    await redis.hSet(`game:${POST_ID}:preview`, {
        type: 'challenge',
        data: JSON.stringify({
            challengerUsername: 'testuser',
            challengerTime: 42,
            gridSize: 4,
            puzzleGridEmoji: '🟥🟦🟥🟦',
            beatsCount: 0,
            attemptsCount: 0,
            fastestTime: null,
            activeRacers: 0,
        }),
    })

    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 15 }),
    })
    expect(res.status).toBe(200)

    // Verify no dedup key was set (preview update logic was skipped)
    const dedupKey = await redis.get(`preview:updated:${POST_ID}`)
    expect(dedupKey).toBeUndefined()
})
