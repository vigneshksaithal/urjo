import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/redis'
import { describe, expect } from 'vitest'
import { joinRace, getRaceStatus, completeRace, abandonRace } from '../race'

// ─── joinRace: Queue Join (no one waiting) ──────────────────────────────────────

describe('joinRace', () => {
    const test = createDevvitTest()

    test('adds player to queue when no one is waiting', async () => {
        const result = await joinRace('t3_post1', 't2_alice', 4)

        expect(result.status).toBe('waiting')
        expect(result.sessionId).toBeDefined()
        expect(result.puzzle).toBeUndefined()

        // Verify queue entry exists in Redis
        const queueRaw = await redis.get('race:queue:t3_post1:4')
        expect(queueRaw).toBeDefined()
        const entry = JSON.parse(queueRaw!)
        expect(entry.userId).toBe('t2_alice')
        expect(entry.sessionId).toBe(result.sessionId)
    })

    test('matches two different players into a race session', async () => {
        // Player 1 joins queue
        const result1 = await joinRace('t3_post1', 't2_alice', 4)
        expect(result1.status).toBe('waiting')

        // Player 2 joins and gets matched
        const result2 = await joinRace('t3_post1', 't2_bob', 4)
        expect(result2.status).toBe('matched')
        expect(result2.sessionId).toBe(result1.sessionId)
        expect(result2.puzzle).toBeDefined()
        expect(result2.puzzle!.colors).toBeDefined()
        expect(result2.puzzle!.numbers).toBeDefined()
        expect(result2.puzzle!.solution).toBeDefined()

        // Verify queue is cleared
        const queueRaw = await redis.get('race:queue:t3_post1:4')
        expect(queueRaw).toBeUndefined()

        // Verify session exists
        const session = await redis.hGetAll(`race:t3_post1:${result1.sessionId}`)
        expect(session['player1Id']).toBe('t2_alice')
        expect(session['player2Id']).toBe('t2_bob')
        expect(session['status']).toBe('racing')
    })

    test('prevents self-match — returns waiting if same user is queued', async () => {
        // Alice joins queue
        const result1 = await joinRace('t3_post1', 't2_alice', 4)
        expect(result1.status).toBe('waiting')

        // Alice tries to join again
        const result2 = await joinRace('t3_post1', 't2_alice', 4)
        expect(result2.status).toBe('waiting')
        expect(result2.sessionId).toBe(result1.sessionId)
    })

    test('returns already_racing if user has an active race', async () => {
        // Alice and Bob match
        await joinRace('t3_post1', 't2_alice', 4)
        const matchResult = await joinRace('t3_post1', 't2_bob', 4)

        // Alice tries to join another race
        const result = await joinRace('t3_post2', 't2_alice', 4)
        expect(result.status).toBe('already_racing')
        expect(result.sessionId).toBe(matchResult.sessionId)
    })

    test('does not match players across different grid sizes', async () => {
        // Alice queues for 4x4
        await joinRace('t3_post1', 't2_alice', 4)

        // Bob queues for 6x6 — should NOT match with Alice
        const result = await joinRace('t3_post1', 't2_bob', 6)
        expect(result.status).toBe('waiting')
        // Both should be in separate queues
        const queue4 = await redis.get('race:queue:t3_post1:4')
        const queue6 = await redis.get('race:queue:t3_post1:6')
        expect(queue4).toBeDefined()
        expect(queue6).toBeDefined()
    })
})

// ─── getRaceStatus ──────────────────────────────────────────────────────────────

describe('getRaceStatus', () => {
    const test = createDevvitTest()

    test('returns expired when session does not exist', async () => {
        const status = await getRaceStatus('nonexistent', 't2_alice', 't3_post1')
        expect(status.status).toBe('expired')
        expect(status.opponentProgress).toBe(0)
    })

    test('returns racing status with opponent progress', async () => {
        // Create a race
        await joinRace('t3_post1', 't2_alice', 4)
        const match = await joinRace('t3_post1', 't2_bob', 4)
        const sessionId = match.sessionId

        // Update player2 progress
        await redis.hSet(`race:t3_post1:${sessionId}`, { player2Progress: '50' })

        // Player1 checks status
        const status = await getRaceStatus(sessionId, 't2_alice', 't3_post1')
        expect(status.status).toBe('racing')
        expect(status.opponentProgress).toBe(50)
    })

    test('returns finished status after race completes', async () => {
        await joinRace('t3_post1', 't2_alice', 4)
        const match = await joinRace('t3_post1', 't2_bob', 4)
        const sessionId = match.sessionId

        // Both complete
        await completeRace(sessionId, 't2_alice', 't3_post1', 25000)
        await completeRace(sessionId, 't2_bob', 't3_post1', 30000)

        const status = await getRaceStatus(sessionId, 't2_alice', 't3_post1')
        expect(status.status).toBe('finished')
        expect(status.opponentProgress).toBe(100)
    })

    test('returns opponent_left when session is abandoned', async () => {
        await joinRace('t3_post1', 't2_alice', 4)
        const match = await joinRace('t3_post1', 't2_bob', 4)
        const sessionId = match.sessionId

        await abandonRace(sessionId, 't2_bob', 't3_post1')

        const status = await getRaceStatus(sessionId, 't2_alice', 't3_post1')
        expect(status.status).toBe('opponent_left')
    })
})

// ─── completeRace ───────────────────────────────────────────────────────────────

describe('completeRace', () => {
    const test = createDevvitTest()

    test('records time and returns waitingForOpponent when first to finish', async () => {
        await joinRace('t3_post1', 't2_alice', 4)
        const match = await joinRace('t3_post1', 't2_bob', 4)
        const sessionId = match.sessionId

        const result = await completeRace(sessionId, 't2_alice', 't3_post1', 25000)
        expect(result.waitingForOpponent).toBe(true)
        expect(result.yourTime).toBe(25000)
        expect(result.opponentTime).toBeNull()
        expect(result.winnerId).toBeNull()

        // Verify time recorded in Redis
        const session = await redis.hGetAll(`race:t3_post1:${sessionId}`)
        expect(session['player1Time']).toBe('25000')
        expect(session['player1Progress']).toBe('100')
    })

    test('determines winner when both players complete — fastest wins', async () => {
        await joinRace('t3_post1', 't2_alice', 4)
        const match = await joinRace('t3_post1', 't2_bob', 4)
        const sessionId = match.sessionId

        // Alice finishes first with slower time
        await completeRace(sessionId, 't2_alice', 't3_post1', 30000)
        // Bob finishes second with faster time
        const result = await completeRace(sessionId, 't2_bob', 't3_post1', 20000)

        expect(result.won).toBe(true)
        expect(result.yourTime).toBe(20000)
        expect(result.opponentTime).toBe(30000)
        expect(result.winnerId).toBe('t2_bob')

        // Verify session is finished
        const session = await redis.hGetAll(`race:t3_post1:${sessionId}`)
        expect(session['status']).toBe('finished')
        expect(session['winnerId']).toBe('t2_bob')
    })

    test('first finisher wins when they have the faster time', async () => {
        await joinRace('t3_post1', 't2_alice', 4)
        const match = await joinRace('t3_post1', 't2_bob', 4)
        const sessionId = match.sessionId

        // Alice finishes first with faster time
        await completeRace(sessionId, 't2_alice', 't3_post1', 15000)
        // Bob finishes second with slower time
        const result = await completeRace(sessionId, 't2_bob', 't3_post1', 25000)

        expect(result.won).toBe(false)
        expect(result.winnerId).toBe('t2_alice')
    })

    test('idempotent completion — calling twice does not overwrite time', async () => {
        await joinRace('t3_post1', 't2_alice', 4)
        const match = await joinRace('t3_post1', 't2_bob', 4)
        const sessionId = match.sessionId

        // Alice completes with 25s
        await completeRace(sessionId, 't2_alice', 't3_post1', 25000)

        // Alice tries to complete again with a different time
        const result = await completeRace(sessionId, 't2_alice', 't3_post1', 10000)

        // Should return original time, not the new one
        expect(result.yourTime).toBe(25000)
        expect(result.waitingForOpponent).toBe(true)

        // Verify Redis still has original time
        const session = await redis.hGetAll(`race:t3_post1:${sessionId}`)
        expect(session['player1Time']).toBe('25000')
    })

    test('returns error for non-participant', async () => {
        await joinRace('t3_post1', 't2_alice', 4)
        const match = await joinRace('t3_post1', 't2_bob', 4)
        const sessionId = match.sessionId

        const result = await completeRace(sessionId, 't2_charlie', 't3_post1', 20000)
        expect(result.error).toBe('not_a_participant')
    })

    test('returns error for expired/missing session', async () => {
        const result = await completeRace('nonexistent', 't2_alice', 't3_post1', 20000)
        expect(result.error).toBe('session_not_found')
    })

    test('cleans up active race markers after both complete', async () => {
        await joinRace('t3_post1', 't2_alice', 4)
        const match = await joinRace('t3_post1', 't2_bob', 4)
        const sessionId = match.sessionId

        await completeRace(sessionId, 't2_alice', 't3_post1', 25000)
        await completeRace(sessionId, 't2_bob', 't3_post1', 30000)

        // Active race markers should be cleaned up
        const aliceActive = await redis.get('user:t2_alice:activeRace')
        const bobActive = await redis.get('user:t2_bob:activeRace')
        expect(aliceActive).toBeUndefined()
        expect(bobActive).toBeUndefined()
    })
})

// ─── abandonRace ────────────────────────────────────────────────────────────────

describe('abandonRace', () => {
    const test = createDevvitTest()

    test('marks session as abandoned and cleans up active marker', async () => {
        await joinRace('t3_post1', 't2_alice', 4)
        const match = await joinRace('t3_post1', 't2_bob', 4)
        const sessionId = match.sessionId

        await abandonRace(sessionId, 't2_bob', 't3_post1')

        // Session should be abandoned
        const session = await redis.hGetAll(`race:t3_post1:${sessionId}`)
        expect(session['status']).toBe('abandoned')

        // Bob's active race marker should be gone
        const bobActive = await redis.get('user:t2_bob:activeRace')
        expect(bobActive).toBeUndefined()

        // Alice's active race marker should still exist
        const aliceActive = await redis.get('user:t2_alice:activeRace')
        expect(aliceActive).toBe(sessionId)
    })

    test('handles abandoning a non-existent session gracefully', async () => {
        // Should not throw
        await abandonRace('nonexistent', 't2_alice', 't3_post1')
    })
})

// ─── Session Expiry ─────────────────────────────────────────────────────────────

describe('session expiry', () => {
    const test = createDevvitTest()

    test('queue entry has TTL set', async () => {
        await joinRace('t3_post1', 't2_alice', 4)

        // expireTime returns absolute Unix timestamp (seconds) when key expires
        const expireAt = await redis.expireTime('race:queue:t3_post1:4')
        const nowSeconds = Math.floor(Date.now() / 1000)
        // Should expire within 30s from now (+ 2s buffer for test execution time)
        expect(expireAt).toBeGreaterThan(nowSeconds - 2)
        expect(expireAt).toBeLessThanOrEqual(nowSeconds + 32)
    })

    test('race session has TTL set', async () => {
        await joinRace('t3_post1', 't2_alice', 4)
        const match = await joinRace('t3_post1', 't2_bob', 4)

        const expireAt = await redis.expireTime(`race:t3_post1:${match.sessionId}`)
        const nowSeconds = Math.floor(Date.now() / 1000)
        // Should expire within 300s from now (+ 2s buffer)
        expect(expireAt).toBeGreaterThan(nowSeconds - 2)
        expect(expireAt).toBeLessThanOrEqual(nowSeconds + 302)
    })

    test('active race markers have TTL set', async () => {
        await joinRace('t3_post1', 't2_alice', 4)
        await joinRace('t3_post1', 't2_bob', 4)

        const nowSeconds = Math.floor(Date.now() / 1000)
        const aliceExpire = await redis.expireTime('user:t2_alice:activeRace')
        const bobExpire = await redis.expireTime('user:t2_bob:activeRace')
        expect(aliceExpire).toBeGreaterThan(nowSeconds - 2)
        expect(aliceExpire).toBeLessThanOrEqual(nowSeconds + 302)
        expect(bobExpire).toBeGreaterThan(nowSeconds - 2)
        expect(bobExpire).toBeLessThanOrEqual(nowSeconds + 302)
    })
})
