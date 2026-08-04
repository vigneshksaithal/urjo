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
import { createCompletionSnapshot } from '../lib/completion-snapshot'
import { getCurrentSeason } from '../lib/seasons'
import { serializeVerifiedResultComment } from '../../shared/result-card'

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

testPostOpen('GET /api/game/state does NOT increment post_open counter (DQP gate replaces pre-intent count)', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'test_player' } as never)

    await withCtx(CTX, () => seedPuzzle('t3_testpost'))

    const res = await withCtx(CTX, () => app.request('/api/game/state'))
    expect(res.status).toBe(200)

    // Pre-intent post_open counter is dead (kill list, 80/20 plan).
    // The DQP gate (lib/qualified.ts) is now the engagement instrument.
    const today = new Date().toISOString().split('T')[0] ?? ''
    const counter = await withCtx(CTX, () => redis.get(`analytics:${today}:post_opens`))
    expect(counter).toBeUndefined()

    vi.restoreAllMocks()
})

testPostOpen('GET /api/game/state captures referrer when x-urjo-session header is present (DQP gate)', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'test_player' } as never)

    await withCtx(CTX, () => seedPuzzle('t3_testpost'))

    const sessionId = 'test-session-state-1'
    const res = await withCtx(CTX, () =>
        app.request('/api/game/state', {
            headers: {
                'x-urjo-session': sessionId,
                referer: 'https://www.reddit.com/r/testsub/comments/abc123/x/',
            },
        }),
    )
    expect(res.status).toBe(200)

    const flags = await withCtx(CTX, () => redis.hGetAll(`qe:session:${sessionId}:flags`))
    expect(flags.referrer).toBe('1')
    expect(flags.userId).toBeUndefined()

    vi.restoreAllMocks()
})

// ─── GET /api/game/state — new users receive first-screen packaging ─

const testFirstScreen = createDevvitTest({
    userId: 't2_newuser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_testpost',
})

testFirstScreen('GET /api/game/state sets isFirstTimeUser for new users', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'new_user' } as never)

    const newCtx = { ...CTX, userId: 't2_newuser' }
    await withCtx(newCtx, () => seedPuzzle('t3_testpost'))

    const res = await withCtx(newCtx, () => app.request('/api/game/state'))
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    // firstScreen was removed — the client uses isFirstTimeUser to decide the view
    expect(body).not.toHaveProperty('firstScreen')
    expect(body).toHaveProperty('isFirstTimeUser', true)

    vi.restoreAllMocks()
})

testFirstScreen('GET /api/game/state returns challengerInfo for challenge posts', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'new_user' } as never)

    const newCtx = { ...CTX, userId: 't2_newuser' }
    await withCtx(newCtx, () => seedPuzzle('t3_testpost'))
    await withCtx(newCtx, () =>
        redis.hSet('game:t3_testpost:puzzle', {
            challengeBy: 't2_challenger',
            challengeScore: '45',
            challengeByUsername: 'TipsyBlueWhale',
            challengeByAvatar: 'https://img/challenger.png',
        }),
    )

    const res = await withCtx(newCtx, () => app.request('/api/game/state'))
    expect(res.status).toBe(200)

    const body = await res.json() as {
        challengerInfo?: { username: string; avatarUrl?: string; targetSeconds: number }
    }

    expect(body.challengerInfo).toStrictEqual({
        username: 'TipsyBlueWhale',
        avatarUrl: 'https://img/challenger.png',
        targetSeconds: 45,
    })

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
            body: JSON.stringify({ timeTaken: 30, mistakes: 0, board: 'rrbbrrbbrrbbrrbb' }),
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

// ─── POST /api/game/result-comment — verified, receipt-gated sharing ─────────

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

const createResultReceipt = async (): Promise<string> => {
    const snapshot = await createCompletionSnapshot({
        userId: 't2_player1',
        sourcePostId: 't3_testpost',
        puzzleInstanceId: 'verified-instance',
        puzzleNumber: RESULT_BODY.puzzleNumber,
        gridSize: RESULT_BODY.gridSize as 4,
        skillLevel: RESULT_BODY.skillLevel,
        timeTaken: RESULT_BODY.timeTaken,
        streak: RESULT_BODY.streak,
        colorGrid: RESULT_BODY.colorGrid as ('red' | 'blue')[][],
    })
    return snapshot.completionId
}

const VERIFIED_RESULT_BODY = {
    puzzleNumber: RESULT_BODY.puzzleNumber,
    gridSize: RESULT_BODY.gridSize as 4,
    skillLevel: RESULT_BODY.skillLevel,
    timeTaken: RESULT_BODY.timeTaken,
    streak: RESULT_BODY.streak,
    colorGrid: RESULT_BODY.colorGrid as ('red' | 'blue')[][],
}

testResultComment('POST /api/game/result-comment succeeds on first call', async () => {
    vi.spyOn(webReddit, 'submitComment').mockResolvedValue({ id: 't1_comment1' } as never)

    const completionId = await createResultReceipt()
    await withCtx(CTX, () => seedStickyComment('t3_testpost'))

    const res = await withCtx(CTX, () =>
        app.request('/api/game/result-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completionId }),
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
    const resultComments = await withCtx(CTX, () => redis.get(`analytics:${today}:result_comments`))
    const social = await withCtx(CTX, () => redis.hGetAll('user:t2_player1:social'))

    // /api/game/result-comment should increment ONLY the result_comments
    // counter. Previously it also incremented result_copies, which
    // double-counted shares across two viral channel counters.
    expect(resultComments).toBe('1')
    expect(resultCopies).toBeUndefined()
    expect(social['sharesCount']).toBe('1')

    vi.restoreAllMocks()
})

testResultComment('POST /api/game/result-comment prepends a custom message when provided', async () => {
    vi.spyOn(webReddit, 'submitComment').mockResolvedValue({ id: 't1_comment1' } as never)

    const completionId = await createResultReceipt()
    await withCtx(CTX, () => seedStickyComment('t3_testpost'))

    const res = await withCtx(CTX, () =>
        app.request('/api/game/result-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                completionId,
                commentMessage: 'Big win today!',
            }),
        }),
    )
    expect(res.status).toBe(200)

    expect(webReddit.submitComment).toHaveBeenCalledWith(
        expect.objectContaining({
            id: 't1_sticky123',
            runAs: 'USER',
            text: serializeVerifiedResultComment(VERIFIED_RESULT_BODY, 'Big win today!'),
        }),
    )

    vi.restoreAllMocks()
})

testResultComment('POST /api/game/result-comment returns 400 when commentMessage exceeds 400 characters', async () => {
    vi.spyOn(webReddit, 'submitComment').mockResolvedValue({ id: 't1_comment1' } as never)

    const completionId = await createResultReceipt()
    await withCtx(CTX, () => seedStickyComment('t3_testpost'))

    const res = await withCtx(CTX, () =>
        app.request('/api/game/result-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                completionId,
                commentMessage: 'x'.repeat(401),
            }),
        }),
    )
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Comment message must be 400 characters or fewer')
    expect(webReddit.submitComment).not.toHaveBeenCalled()

    vi.restoreAllMocks()
})

testResultComment('POST /api/game/result-comment accepts commentMessage at exactly 400 characters', async () => {
    vi.spyOn(webReddit, 'submitComment').mockResolvedValue({ id: 't1_comment1' } as never)

    const completionId = await createResultReceipt()
    await withCtx(CTX, () => seedStickyComment('t3_testpost'))

    const res = await withCtx(CTX, () =>
        app.request('/api/game/result-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                completionId,
                commentMessage: 'x'.repeat(400),
            }),
        }),
    )
    expect(res.status).toBe(200)

    vi.restoreAllMocks()
})

testResultComment('POST /api/game/result-comment creates missing sticky comment before replying', async () => {
    const distinguishSticky = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(webReddit, 'submitComment')
        .mockResolvedValueOnce({
            id: 't1_created_sticky',
            distinguish: distinguishSticky,
        } as never)
        .mockResolvedValueOnce({ id: 't1_result_comment' } as never)

    const completionId = await createResultReceipt()

    const res = await withCtx(CTX, () =>
        app.request('/api/game/result-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completionId }),
        }),
    )

    expect(res.status).toBe(200)
    expect(webReddit.submitComment).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
            id: 't3_testpost',
            text: expect.stringContaining('Share your victory'),
        }),
    )
    expect(webReddit.submitComment).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
            id: 't1_created_sticky',
            runAs: 'USER',
        }),
    )
    expect(distinguishSticky).toHaveBeenCalledWith(true)

    const meta = await withCtx(CTX, () => redis.hGetAll('game:t3_testpost:meta'))
    expect(meta['stickyCommentId']).toBe('t1_created_sticky')

    vi.restoreAllMocks()
})

testResultComment('POST /api/game/result-comment allows distinct completions on the same post', async () => {
    vi.spyOn(webReddit, 'submitComment').mockResolvedValue({ id: 't1_comment1' } as never)

    const firstCompletionId = await createResultReceipt()
    const secondCompletionId = await createResultReceipt()
    await withCtx(CTX, () => seedStickyComment('t3_testpost'))

    // Each verified completion may create its own explicit result comment.
    const firstRes = await withCtx(CTX, () =>
        app.request('/api/game/result-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completionId: firstCompletionId }),
        }),
    )
    expect(firstRes.status).toBe(200)

    const secondRes = await withCtx(CTX, () =>
        app.request('/api/game/result-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completionId: secondCompletionId }),
        }),
    )
    expect(secondRes.status).toBe(200)

    expect(webReddit.submitComment).toHaveBeenCalledTimes(2)
    expect(webReddit.submitComment).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
            id: 't1_sticky123',
            runAs: 'USER',
        }),
    )
    expect(webReddit.submitComment).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
            id: 't1_sticky123',
            runAs: 'USER',
        }),
    )

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
    expect(body.error).toBe('A verified completion is required')
})

// ─── POST /api/game/help-tap — tracks help icon taps ─────────────────────────

const testHelpTap = createDevvitTest({
    userId: 't2_player1',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_testpost',
})

testHelpTap('POST /api/game/help-tap returns { tracked: true } on first call and increments counter', async () => {
    const res = await withCtx(CTX, () =>
        app.request('/api/game/help-tap', { method: 'POST' }),
    )
    expect(res.status).toBe(200)

    const body = await res.json() as { tracked: boolean }
    expect(body.tracked).toBe(true)

    const today = new Date().toISOString().split('T')[0] ?? ''
    const counter = await withCtx(CTX, () => redis.get(`analytics:${today}:help_taps`))
    expect(counter).toBe('1')
})

testHelpTap('POST /api/game/help-tap returns { tracked: false } on duplicate call and does not increment counter', async () => {
    // First call
    await withCtx(CTX, () =>
        app.request('/api/game/help-tap', { method: 'POST' }),
    )
    // Second call — same (date, postId, userId)
    const res = await withCtx(CTX, () =>
        app.request('/api/game/help-tap', { method: 'POST' }),
    )
    expect(res.status).toBe(200)

    const body = await res.json() as { tracked: boolean }
    expect(body.tracked).toBe(false)

    const today = new Date().toISOString().split('T')[0] ?? ''
    const counter = await withCtx(CTX, () => redis.get(`analytics:${today}:help_taps`))
    expect(counter).toBe('1') // Still 1, not 2
})

testHelpTap('POST /api/game/help-tap returns 400 when postId is missing', async () => {
    // Pass empty string for postId — falsy, triggers the guard
    const res = await withCtx({ userId: 't2_player1', postId: '' }, () =>
        app.request('/api/game/help-tap', { method: 'POST' }),
    )
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Post ID is required')
})

testHelpTap('POST /api/game/help-tap returns 400 when userId is missing', async () => {
    const res = await withCtx({ postId: 't3_testpost' }, () =>
        app.request('/api/game/help-tap', { method: 'POST' }),
    )
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('User ID is required')
})

testHelpTap('POST /api/game/help-tap sets dedup key with 24h TTL', async () => {
    await withCtx(CTX, () =>
        app.request('/api/game/help-tap', { method: 'POST' }),
    )

    const today = new Date().toISOString().split('T')[0] ?? ''
    const dedupKey = `analytics:helped:${today}:${CTX.postId}:${CTX.userId}`
    const dedupValue = await withCtx(CTX, () => redis.get(dedupKey))
    expect(dedupValue).toBe('1')

    // expireTime returns absolute Unix timestamp in seconds — verify it's within 24h from now
    const ttl = await withCtx(CTX, () => redis.expireTime(dedupKey))
    const nowSeconds = Math.floor(Date.now() / 1000)
    expect(ttl).toBeGreaterThan(nowSeconds)
    expect(ttl).toBeLessThanOrEqual(nowSeconds + 86400 + 5) // +5s buffer for test execution time
})

// ─── GET /api/game/state — notifyOptIn and hintsDismissed fields ──────────────
// Requirements: 7.1, 7.2, 7.3, 12.3, 14.6

const testGameStateFields = createDevvitTest({
    userId: 't2_stateuser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_statepost',
})

const STATE_CTX = {
    userId: 't2_stateuser',
    postId: 't3_statepost',
    subredditId: 't5_testsub',
    subredditName: 'testsub',
}

const seedStatePuzzle = async (): Promise<void> => {
    await redis.hSet(`game:${STATE_CTX.postId}:puzzle`, {
        colors: 'rrbbrrbbrrbbrrbb',
        numbers: '----------------',
        solution: 'rrbbrrbbrrbbrrbb',
        difficulty: 'easy',
        gridSize: '4',
    })
}

testGameStateFields('GET /api/game/state includes notifyOptIn: false for user not opted in', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'stateuser' } as never)
    await withCtx(STATE_CTX, seedStatePuzzle)

    const res = await withCtx(STATE_CTX, () => app.request('/api/game/state'))
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty('notifyOptIn', false)

    vi.restoreAllMocks()
})

testGameStateFields('GET /api/game/state includes notifyOptIn: true for opted-in user', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'stateuser' } as never)
    await withCtx(STATE_CTX, seedStatePuzzle)

    // Opt the user in directly via Redis
    await withCtx(STATE_CTX, () =>
        redis.zAdd('notify:optin', { member: STATE_CTX.userId, score: Date.now() }),
    )

    const res = await withCtx(STATE_CTX, () => app.request('/api/game/state'))
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty('notifyOptIn', true)

    vi.restoreAllMocks()
})

testGameStateFields('GET /api/game/state includes hintsDismissed with both false for new user', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'stateuser' } as never)
    await withCtx(STATE_CTX, seedStatePuzzle)

    const res = await withCtx(STATE_CTX, () => app.request('/api/game/state'))
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty('hintsDismissed')
    const hintsDismissed = body.hintsDismissed as { numberConstraint: boolean; adjacencyViolation: boolean }
    expect(hintsDismissed.numberConstraint).toBe(false)
    expect(hintsDismissed.adjacencyViolation).toBe(false)

    vi.restoreAllMocks()
})

testGameStateFields('GET /api/game/state reflects persisted hint dismissal flags', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'stateuser' } as never)
    await withCtx(STATE_CTX, seedStatePuzzle)

    // Pre-set the numberConstraint hint as dismissed
    await withCtx(STATE_CTX, () =>
        redis.set(`user:${STATE_CTX.userId}:hint:numberConstraint`, '1'),
    )

    const res = await withCtx(STATE_CTX, () => app.request('/api/game/state'))
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    const hintsDismissed = body.hintsDismissed as { numberConstraint: boolean; adjacencyViolation: boolean }
    expect(hintsDismissed.numberConstraint).toBe(true)
    expect(hintsDismissed.adjacencyViolation).toBe(false)

    vi.restoreAllMocks()
})

testGameStateFields('GET /api/game/state sets isFirstTimeUser for new users', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'stateuser' } as never)
    await withCtx(STATE_CTX, seedStatePuzzle)

    // Ensure user has no solves (new user)
    const res = await withCtx(STATE_CTX, () => app.request('/api/game/state'))
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    // firstScreen was removed from the response — isFirstTimeUser carries the signal
    expect(body).not.toHaveProperty('firstScreen')
    expect(body).toHaveProperty('isFirstTimeUser', true)

    vi.restoreAllMocks()
})

// ─── POST /api/game/hints/dismiss ────────────────────────────────────────────

const testHintsDismiss = createDevvitTest({
    userId: 't2_player1',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_testpost',
})

testHintsDismiss('POST /api/game/hints/dismiss returns { dismissed: true } for numberConstraint', async () => {
    const res = await withCtx(CTX, () =>
        app.request('/api/game/hints/dismiss', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'numberConstraint' }),
        }),
    )
    expect(res.status).toBe(200)

    const body = await res.json() as { dismissed: boolean }
    expect(body.dismissed).toBe(true)
})

testHintsDismiss('POST /api/game/hints/dismiss sets Redis flag for numberConstraint', async () => {
    await withCtx(CTX, () =>
        app.request('/api/game/hints/dismiss', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'numberConstraint' }),
        }),
    )

    const flag = await withCtx(CTX, () => redis.get('user:t2_player1:hint:numberConstraint'))
    expect(flag).toBe('1')
})

testHintsDismiss('POST /api/game/hints/dismiss returns { dismissed: true } for adjacencyViolation', async () => {
    const res = await withCtx(CTX, () =>
        app.request('/api/game/hints/dismiss', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'adjacencyViolation' }),
        }),
    )
    expect(res.status).toBe(200)

    const body = await res.json() as { dismissed: boolean }
    expect(body.dismissed).toBe(true)
})

testHintsDismiss('POST /api/game/hints/dismiss sets Redis flag for adjacencyViolation', async () => {
    await withCtx(CTX, () =>
        app.request('/api/game/hints/dismiss', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'adjacencyViolation' }),
        }),
    )

    const flag = await withCtx(CTX, () => redis.get('user:t2_player1:hint:adjacencyViolation'))
    expect(flag).toBe('1')
})

testHintsDismiss('POST /api/game/hints/dismiss is idempotent — second call still returns { dismissed: true }', async () => {
    await withCtx(CTX, () =>
        app.request('/api/game/hints/dismiss', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'numberConstraint' }),
        }),
    )

    const res = await withCtx(CTX, () =>
        app.request('/api/game/hints/dismiss', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'numberConstraint' }),
        }),
    )
    expect(res.status).toBe(200)

    const body = await res.json() as { dismissed: boolean }
    expect(body.dismissed).toBe(true)

    const flag = await withCtx(CTX, () => redis.get('user:t2_player1:hint:numberConstraint'))
    expect(flag).toBe('1')
})

testHintsDismiss('POST /api/game/hints/dismiss returns 400 for invalid kind', async () => {
    const res = await withCtx(CTX, () =>
        app.request('/api/game/hints/dismiss', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'invalidKind' }),
        }),
    )
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Invalid request body')
})

testHintsDismiss('POST /api/game/hints/dismiss returns 400 when kind is missing', async () => {
    const res = await withCtx(CTX, () =>
        app.request('/api/game/hints/dismiss', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        }),
    )
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Invalid request body')
})

const testHintsDismissNoUser = createDevvitTest({
    subredditName: 'testsub',
    subredditId: 't5_testsub',
    postId: 't3_testpost',
})

testHintsDismissNoUser('POST /api/game/hints/dismiss returns 400 when no userId', async () => {
    const res = await runWithContext(
        { postId: 't3_testpost', subredditId: 't5_testsub', subredditName: 'testsub' } as Parameters<typeof runWithContext>[0],
        () =>
            app.request('/api/game/hints/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: 'numberConstraint' }),
            }),
    )
    expect(res.status).toBe(400)
})
