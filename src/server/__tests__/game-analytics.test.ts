/**
 * Integration tests for analytics integration in game routes and result card comment.
 * Tests: GET /api/game/state analytics tracking, POST /api/game/complete analytics + season,
 *        POST /api/game/first-action, POST /api/game/result-comment dedup.
 * Requirements: 1.6, 3.1, 3.2, 3.3, 5.2
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit as webReddit, runWithContext } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { app } from '../index'
import { getCurrentSeason } from '../lib/seasons'

// ─── Helper: run with Devvit context ──────────────────────────────────────────

const withCtx = <T>(
    overrides: { userId?: string; postId?: string; subredditId?: string; subredditName?: string },
    fn: () => Promise<T>,
): Promise<T> =>
    runWithContext(
        {
            userId: overrides.userId,
            postId: overrides.postId ?? 't3_testpost',
            subredditId: overrides.subredditId ?? 't5_testsub',
            subredditName: overrides.subredditName ?? 'testsub',
        } as Parameters<typeof runWithContext>[0],
        fn,
    )

const CTX = {
    userId: 't2_player1',
    postId: 't3_testpost',
    subredditId: 't5_testsub',
    subredditName: 'testsub',
}

/**
 * Seed a puzzle for the test post so game state can load.
 */
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

/**
 * Seed a sticky comment ID for result-comment tests.
 */
const seedStickyComment = async (postId: string): Promise<void> => {
    await redis.hSet(`game:${postId}:meta`, {
        stickyCommentId: 't1_sticky123',
    })
}

// ─── GET /api/game/state — increments post_open counter (deduplicated) ────────

const testPostOpen = createDevvitTest({
    userId: 't2_player1',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_testpost',
})

testPostOpen('GET /api/game/state increments post_open counter on first load', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'test_player' } as never)

    await withCtx(CTX, () => seedPuzzle('t3_testpost'))

    const res = await withCtx(CTX, () => app.request('/api/game/state'))
    expect(res.status).toBe(200)

    // Check that the post_open counter was incremented
    const today = new Date().toISOString().split('T')[0] ?? ''
    const counter = await withCtx(CTX, () => redis.get(`analytics:${today}:post_opens`))
    expect(counter).toBe('1')

    vi.restoreAllMocks()
})

testPostOpen('GET /api/game/state deduplicates post_open for same user/post/day', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'test_player' } as never)

    await withCtx(CTX, () => seedPuzzle('t3_testpost'))

    // First load
    await withCtx(CTX, () => app.request('/api/game/state'))
    // Second load — should be deduplicated
    await withCtx(CTX, () => app.request('/api/game/state'))

    const today = new Date().toISOString().split('T')[0] ?? ''
    const counter = await withCtx(CTX, () => redis.get(`analytics:${today}:post_opens`))
    expect(counter).toBe('1') // Still 1, not 2

    vi.restoreAllMocks()
})

// ─── GET /api/game/state — returns firstScreen for new users ──────────────────

const testFirstScreen = createDevvitTest({
    userId: 't2_newuser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_testpost',
})

testFirstScreen('GET /api/game/state returns firstScreen data for new users with no solves', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'new_user' } as never)

    const newCtx = { ...CTX, userId: 't2_newuser' }
    await withCtx(newCtx, () => seedPuzzle('t3_testpost'))

    const res = await withCtx(newCtx, () => app.request('/api/game/state'))
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty('firstScreen')

    const firstScreen = body.firstScreen as {
        samplePuzzle: { gridSize: number }
        instruction: string
        communityStats: { activePlayers: number; collectiveStreakDays: number }
    }
    expect(firstScreen.samplePuzzle.gridSize).toBe(4)
    expect(firstScreen.instruction).toContain('Tap cells')
    expect(firstScreen.communityStats).toHaveProperty('activePlayers')
    expect(firstScreen.communityStats).toHaveProperty('collectiveStreakDays')

    vi.restoreAllMocks()
})

// ─── POST /api/game/first-action — tracks first action ────────────────────────

const testFirstAction = createDevvitTest({
    userId: 't2_player1',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_testpost',
})

testFirstAction('POST /api/game/first-action tracks first cell action per session', async () => {
    const res = await withCtx(CTX, () =>
        app.request('/api/game/first-action', { method: 'POST' }),
    )
    expect(res.status).toBe(200)

    const body = await res.json() as { tracked: boolean }
    expect(body.tracked).toBe(true)

    // Check counter
    const today = new Date().toISOString().split('T')[0] ?? ''
    const counter = await withCtx(CTX, () => redis.get(`analytics:${today}:first_actions`))
    expect(counter).toBe('1')
})

testFirstAction('POST /api/game/first-action deduplicates for same user/post/day', async () => {
    // First call
    await withCtx(CTX, () =>
        app.request('/api/game/first-action', { method: 'POST' }),
    )
    // Second call — should be deduplicated
    const res = await withCtx(CTX, () =>
        app.request('/api/game/first-action', { method: 'POST' }),
    )
    const body = await res.json() as { tracked: boolean }
    expect(body.tracked).toBe(false)

    const today = new Date().toISOString().split('T')[0] ?? ''
    const counter = await withCtx(CTX, () => redis.get(`analytics:${today}:first_actions`))
    expect(counter).toBe('1')
})

// ─── POST /api/game/complete — increments completion counter + season score ───

const testComplete = createDevvitTest({
    userId: 't2_player1',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_testpost',
})

testComplete('POST /api/game/complete increments completion counter and records season score', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'test_player' } as never)

    await withCtx(CTX, async () => {
        await seedPuzzle('t3_testpost')
        // Set a start time so server-side timing works
        await redis.set(`user:t2_player1:puzzleStartTime:t3_testpost`, (Date.now() - 30000).toString())
    })

    const res = await withCtx(CTX, () =>
        app.request('/api/game/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeTaken: 30, mistakes: 0 }),
        }),
    )
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty('performanceScore')
    expect(body).toHaveProperty('newSkillLevel')

    // Check completion counter
    const today = new Date().toISOString().split('T')[0] ?? ''
    const counter = await withCtx(CTX, () => redis.get(`analytics:${today}:completions`))
    expect(counter).toBe('1')

    // Check season leaderboard entry
    const season = getCurrentSeason()
    const leaderboardKey = `season:${season.seasonId}:leaderboard`
    const score = await withCtx(CTX, () => redis.zScore(leaderboardKey, 't2_player1'))
    expect(score).toBeGreaterThan(0)

    // Check season data in response
    expect(body).toHaveProperty('seasonPoints')
    expect(typeof body.seasonPoints).toBe('number')
    expect((body.seasonPoints as number)).toBeGreaterThan(0)

    vi.restoreAllMocks()
})

// ─── POST /api/game/result-comment — succeeds first time, 400 on duplicate ───

const testResultComment = createDevvitTest({
    userId: 't2_player1',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_testpost',
})

const RESULT_BODY = {
    puzzleNumber: 42,
    gridSize: 4,
    skillLevel: 3,
    timeTaken: 23,
    mistakes: 0,
    streak: 5,
    colorGrid: [
        ['red', 'blue', 'red', 'blue'],
        ['blue', 'red', 'blue', 'red'],
        ['red', 'blue', 'red', 'blue'],
        ['blue', 'red', 'blue', 'red'],
    ],
}

testResultComment('POST /api/game/result-comment succeeds on first call', async () => {
    vi.spyOn(webReddit, 'submitComment').mockResolvedValue({ id: 't1_comment1' } as never)

    await withCtx(CTX, () => seedStickyComment('t3_testpost'))

    const res = await withCtx(CTX, () =>
        app.request('/api/game/result-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(RESULT_BODY),
        }),
    )
    expect(res.status).toBe(200)

    const body = await res.json() as { success: boolean }
    expect(body.success).toBe(true)

    // Verify comment was submitted with runAs: 'USER'
    expect(webReddit.submitComment).toHaveBeenCalledWith(
        expect.objectContaining({
            id: 't1_sticky123',
            runAs: 'USER',
        }),
    )

    const today = new Date().toISOString().split('T')[0] ?? ''
    const resultCopies = await withCtx(CTX, () => redis.get(`analytics:${today}:result_copies`))
    const social = await withCtx(CTX, () => redis.hGetAll('user:t2_player1:social'))

    expect(resultCopies).toBe('1')
    expect(social['sharesCount']).toBe('1')

    vi.restoreAllMocks()
})

testResultComment('POST /api/game/result-comment returns 400 on duplicate', async () => {
    vi.spyOn(webReddit, 'submitComment').mockResolvedValue({ id: 't1_comment1' } as never)

    await withCtx(CTX, () => seedStickyComment('t3_testpost'))

    // First call — succeeds
    await withCtx(CTX, () =>
        app.request('/api/game/result-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(RESULT_BODY),
        }),
    )

    // Second call — should return 400
    const res = await withCtx(CTX, () =>
        app.request('/api/game/result-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(RESULT_BODY),
        }),
    )
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Result already shared on this post')

    vi.restoreAllMocks()
})

testResultComment('POST /api/game/result-comment returns 400 with invalid body', async () => {
    const res = await withCtx(CTX, () =>
        app.request('/api/game/result-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ puzzleNumber: -1 }),
        }),
    )
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Invalid result card data')
})

// ─── POST /api/game/share — legacy share route metrics ───────────────────────

const testShare = createDevvitTest({
    userId: 't2_player1',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_testpost',
})

testShare('POST /api/game/share tracks result copy and share count on success', async () => {
    vi.spyOn(webReddit, 'submitComment').mockResolvedValue({ id: 't1_share' } as never)
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'test_player' } as never)

    await withCtx(CTX, () => seedStickyComment('t3_testpost'))

    const res = await withCtx(CTX, () =>
        app.request('/api/game/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timeTaken: 23,
                streak: 5,
                puzzleColors: 'rbrbbrbrrbbbbrbr',
                gridSize: 4,
                skillLevel: 3,
                mistakes: 0,
            }),
        }),
    )
    expect(res.status).toBe(200)

    const today = new Date().toISOString().split('T')[0] ?? ''
    const resultCopies = await withCtx(CTX, () => redis.get(`analytics:${today}:result_copies`))
    const social = await withCtx(CTX, () => redis.hGetAll('user:t2_player1:social'))

    expect(resultCopies).toBe('1')
    expect(social['sharesCount']).toBe('1')

    vi.restoreAllMocks()
})
