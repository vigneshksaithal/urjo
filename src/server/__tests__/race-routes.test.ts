/**
 * Integration tests for race API routes.
 * Tests matchmaking, status polling, completion with coin/streak awards, and abandonment.
 * Requirements: 1, 2, 7
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { runWithContext } from '@devvit/server'
import { expect } from 'vitest'
import { app } from '../index'

// ─── Test Constants ─────────────────────────────────────────────────────────────

const POST_ID = 't3_racepost'
const USER_1 = 't2_racer1'
const USER_2 = 't2_racer2'

// ─── Helper ─────────────────────────────────────────────────────────────────────

const withCtx = <T>(userId: string, postId: string, fn: () => Promise<T>): Promise<T> =>
    runWithContext(
        { postId, userId, subredditName: 'testsub', subredditId: 't5_testsub' } as Parameters<typeof runWithContext>[0],
        fn
    )

const joinRace = (userId: string, postId: string, gridSize: number) =>
    withCtx(userId, postId, () =>
        app.request('/api/race/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gridSize }),
        })
    )

const getStatus = (userId: string, postId: string, sessionId: string) =>
    withCtx(userId, postId, () =>
        app.request(`/api/race/status/${sessionId}`)
    )

const completeRace = (userId: string, postId: string, sessionId: string, timeTaken: number) =>
    withCtx(userId, postId, () =>
        app.request(`/api/race/complete/${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeTaken }),
        })
    )

const abandonRace = (userId: string, postId: string, sessionId: string) =>
    withCtx(userId, postId, () =>
        app.request(`/api/race/abandon/${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        })
    )

// ─── POST /api/race/join — validation ────────────────────────────────────────

const testJoinValidation = createDevvitTest({
    userId: USER_1,
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testJoinValidation('POST /api/race/join returns 400 for invalid gridSize', async () => {
    const res = await joinRace(USER_1, POST_ID, 5)

    expect(res.status).toBe(400)
    const body = await res.json() as { status: string; message: string }
    expect(body.status).toBe('error')
    expect(body.message).toBe('gridSize must be 4, 6, or 8')
})

testJoinValidation('POST /api/race/join returns 400 for missing body', async () => {
    const res = await withCtx(USER_1, POST_ID, () =>
        app.request('/api/race/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json',
        })
    )

    expect(res.status).toBe(400)
    const body = await res.json() as { status: string; message: string }
    expect(body.status).toBe('error')
    expect(body.message).toBe('Invalid request body')
})

// ─── POST /api/race/join — queue and match ───────────────────────────────────

const testJoinQueue = createDevvitTest({
    userId: USER_1,
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testJoinQueue('POST /api/race/join queues player when no opponent', async () => {
    const res = await joinRace(USER_1, POST_ID, 4)

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; data: { status: string; sessionId: string } }
    expect(body.status).toBe('success')
    expect(body.data.status).toBe('waiting')
    expect(body.data.sessionId).toBeDefined()
})

const testJoinMatch = createDevvitTest({
    userId: USER_1,
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testJoinMatch('POST /api/race/join matches two different players', async () => {
    // Player 1 joins queue
    const res1 = await joinRace(USER_1, POST_ID, 4)
    expect(res1.status).toBe(200)
    const body1 = await res1.json() as { status: string; data: { status: string; sessionId: string } }
    expect(body1.data.status).toBe('waiting')
    const sessionId = body1.data.sessionId

    // Player 2 joins and gets matched
    const res2 = await joinRace(USER_2, POST_ID, 4)
    expect(res2.status).toBe(200)
    const body2 = await res2.json() as { status: string; data: { status: string; sessionId: string; puzzle: unknown } }
    expect(body2.data.status).toBe('matched')
    expect(body2.data.sessionId).toBe(sessionId)
    expect(body2.data.puzzle).toBeDefined()
})

// ─── POST /api/race/join — self-match prevention ─────────────────────────────

const testSelfMatch = createDevvitTest({
    userId: USER_1,
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testSelfMatch('POST /api/race/join prevents self-match', async () => {
    // Player 1 joins queue
    await joinRace(USER_1, POST_ID, 6)

    // Same player joins again — should return waiting (not matched)
    const res = await joinRace(USER_1, POST_ID, 6)
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; data: { status: string } }
    expect(body.data.status).toBe('waiting')
})

// ─── GET /api/race/status/:sessionId ─────────────────────────────────────────

const testStatus = createDevvitTest({
    userId: USER_1,
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testStatus('GET /api/race/status returns racing status after match', async () => {
    // Create a match
    await joinRace(USER_1, POST_ID, 4)
    const matchRes = await joinRace(USER_2, POST_ID, 4)
    const matchBody = await matchRes.json() as { data: { sessionId: string } }
    const sessionId = matchBody.data.sessionId

    // Poll status
    const statusRes = await getStatus(USER_1, POST_ID, sessionId)
    expect(statusRes.status).toBe(200)

    const statusBody = await statusRes.json() as { status: string; data: { status: string; opponentProgress: number } }
    expect(statusBody.status).toBe('success')
    expect(statusBody.data.status).toBe('racing')
    expect(statusBody.data.opponentProgress).toBe(0)
})

const testStatusExpired = createDevvitTest({
    userId: USER_1,
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testStatusExpired('GET /api/race/status returns expired for non-existent session', async () => {
    const res = await getStatus(USER_1, POST_ID, 'nonexistent-session')
    expect(res.status).toBe(200)

    const body = await res.json() as { status: string; data: { status: string } }
    expect(body.status).toBe('success')
    expect(body.data.status).toBe('expired')
})

// ─── POST /api/race/complete/:sessionId ──────────────────────────────────────

const testCompleteValidation = createDevvitTest({
    userId: USER_1,
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testCompleteValidation('POST /api/race/complete returns 400 for invalid timeTaken', async () => {
    const res = await completeRace(USER_1, POST_ID, 'some-session', -5)
    expect(res.status).toBe(400)
    const body = await res.json() as { status: string; message: string }
    expect(body.status).toBe('error')
    expect(body.message).toBe('timeTaken must be > 0')
})

testCompleteValidation('POST /api/race/complete returns 400 for zero timeTaken', async () => {
    const res = await completeRace(USER_1, POST_ID, 'some-session', 0)
    expect(res.status).toBe(400)
})

const testCompleteFlow = createDevvitTest({
    userId: USER_1,
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testCompleteFlow('POST /api/race/complete records time and determines winner', async () => {
    // Create a match
    await joinRace(USER_1, POST_ID, 4)
    const matchRes = await joinRace(USER_2, POST_ID, 4)
    const matchBody = await matchRes.json() as { data: { sessionId: string } }
    const sessionId = matchBody.data.sessionId

    // Player 1 completes first (faster time)
    const complete1 = await completeRace(USER_1, POST_ID, sessionId, 30)
    expect(complete1.status).toBe(200)
    const body1 = await complete1.json() as { status: string; data: { waitingForOpponent: boolean; yourTime: number } }
    expect(body1.data.waitingForOpponent).toBe(true)
    expect(body1.data.yourTime).toBe(30)

    // Player 2 completes (slower time)
    const complete2 = await completeRace(USER_2, POST_ID, sessionId, 45)
    expect(complete2.status).toBe(200)
    const body2 = await complete2.json() as { status: string; data: { won: boolean; yourTime: number; opponentTime: number; winnerId: string } }
    // P2 completed with 45s, P1 already completed with 30s. Winner = P1 (lower time).
    // From P2's perspective: won = false
    expect(body2.data.won).toBe(false)
    expect(body2.data.yourTime).toBe(45)
    expect(body2.data.opponentTime).toBe(30)
    expect(body2.data.winnerId).toBe(USER_1)
})

// ─── POST /api/race/complete — awards coins on race finish ───────────────────

const testCompleteAwards = createDevvitTest({
    userId: USER_1,
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testCompleteAwards('POST /api/race/complete awards coins and streak on race finish', async () => {
    // Create a match
    await joinRace(USER_1, POST_ID, 4)
    const matchRes = await joinRace(USER_2, POST_ID, 4)
    const matchBody = await matchRes.json() as { data: { sessionId: string } }
    const sessionId = matchBody.data.sessionId

    // Both complete — P1 faster
    await completeRace(USER_1, POST_ID, sessionId, 20)
    const complete2 = await completeRace(USER_2, POST_ID, sessionId, 40)

    const body = await complete2.json() as { status: string; data: { won: boolean; yourTime: number; opponentTime: number; coinReward?: { total: number }; streak?: { currentStreak: number } } }
    expect(body.status).toBe('success')
    expect(body.data.won).toBe(false)
    expect(body.data.yourTime).toBe(40)
    expect(body.data.opponentTime).toBe(20)
    // Coin reward should have a positive total
    expect(body.data.coinReward).toBeDefined()
    expect(body.data.coinReward!.total).toBeGreaterThan(0)
    // Streak should be updated
    expect(body.data.streak).toBeDefined()
    expect(body.data.streak!.currentStreak).toBeGreaterThanOrEqual(1)
})

// ─── POST /api/race/abandon/:sessionId ───────────────────────────────────────

const testAbandon = createDevvitTest({
    userId: USER_1,
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testAbandon('POST /api/race/abandon marks session as abandoned', async () => {
    // Create a match
    await joinRace(USER_1, POST_ID, 4)
    const matchRes = await joinRace(USER_2, POST_ID, 4)
    const matchBody = await matchRes.json() as { data: { sessionId: string } }
    const sessionId = matchBody.data.sessionId

    // Player 1 abandons
    const abandonRes = await abandonRace(USER_1, POST_ID, sessionId)
    expect(abandonRes.status).toBe(200)
    const abandonBody = await abandonRes.json() as { status: string; data: { abandoned: boolean } }
    expect(abandonBody.status).toBe('success')
    expect(abandonBody.data.abandoned).toBe(true)

    // Player 2 polls and sees opponent_left
    const statusRes = await getStatus(USER_2, POST_ID, sessionId)
    const statusBody = await statusRes.json() as { status: string; data: { status: string } }
    expect(statusBody.data.status).toBe('opponent_left')
})

// ─── POST /api/race/join — already racing guard ──────────────────────────────

const testAlreadyRacing = createDevvitTest({
    userId: USER_1,
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testAlreadyRacing('POST /api/race/join returns already_racing if user has active race', async () => {
    // Create a match so USER_1 has an active race
    await joinRace(USER_1, POST_ID, 4)
    const matchRes = await joinRace(USER_2, POST_ID, 4)
    const matchBody = await matchRes.json() as { data: { sessionId: string } }
    const sessionId = matchBody.data.sessionId

    // USER_1 tries to join another race
    const res = await joinRace(USER_1, POST_ID, 4)
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; data: { status: string; sessionId: string } }
    expect(body.data.status).toBe('already_racing')
    expect(body.data.sessionId).toBe(sessionId)
})

// ─── POST /api/race/join — no userId ─────────────────────────────────────────

const testNoUser = createDevvitTest({
    userId: 't2_testuser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testNoUser('POST /api/race/join returns 400 when no postId in context', async () => {
    // Call without postId by using runWithContext with no postId
    const res = await runWithContext(
        { userId: USER_1, subredditName: 'testsub', subredditId: 't5_testsub' } as Parameters<typeof runWithContext>[0],
        () =>
            app.request('/api/race/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gridSize: 4 }),
            })
    )

    expect(res.status).toBe(400)
    const body = await res.json() as { status: string; message: string }
    expect(body.status).toBe('error')
    expect(body.message).toBe('Must be in a post context')
})
