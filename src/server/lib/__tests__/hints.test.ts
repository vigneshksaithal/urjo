/**
 * Tests for hints.ts — hint dismissal persistence
 * Requirements: 12.1, 12.2, 12.3, 12.6
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/redis'
import { expect } from 'vitest'
import * as fc from 'fast-check'
import { getHintsDismissed, markHintDismissed, type HintKind } from '../hints'

// ─── getHintsDismissed ────────────────────────────────────────────────────────

const testGetDefault = createDevvitTest({ userId: 't2_testuser' })

testGetDefault('getHintsDismissed returns all false for a new user', async () => {
    const result = await getHintsDismissed('t2_testuser')
    expect(result).toEqual({ numberConstraint: false, adjacencyViolation: false })
})

const testGetNumberConstraintSet = createDevvitTest({ userId: 't2_testuser' })

testGetNumberConstraintSet('getHintsDismissed returns numberConstraint: true when flag is set', async () => {
    await redis.set('user:t2_testuser:hint:numberConstraint', '1')
    const result = await getHintsDismissed('t2_testuser')
    expect(result.numberConstraint).toBe(true)
    expect(result.adjacencyViolation).toBe(false)
})

const testGetAdjacencySet = createDevvitTest({ userId: 't2_testuser' })

testGetAdjacencySet('getHintsDismissed returns adjacencyViolation: true when flag is set', async () => {
    await redis.set('user:t2_testuser:hint:adjacencyViolation', '1')
    const result = await getHintsDismissed('t2_testuser')
    expect(result.numberConstraint).toBe(false)
    expect(result.adjacencyViolation).toBe(true)
})

const testGetBothSet = createDevvitTest({ userId: 't2_testuser' })

testGetBothSet('getHintsDismissed returns both true when both flags are set', async () => {
    await redis.set('user:t2_testuser:hint:numberConstraint', '1')
    await redis.set('user:t2_testuser:hint:adjacencyViolation', '1')
    const result = await getHintsDismissed('t2_testuser')
    expect(result).toEqual({ numberConstraint: true, adjacencyViolation: true })
})

// ─── markHintDismissed ────────────────────────────────────────────────────────

const testMarkNumberConstraint = createDevvitTest({ userId: 't2_testuser' })

testMarkNumberConstraint('markHintDismissed sets numberConstraint flag in Redis', async () => {
    await markHintDismissed('t2_testuser', 'numberConstraint')
    const value = await redis.get('user:t2_testuser:hint:numberConstraint')
    expect(value).toBe('1')
})

const testMarkAdjacency = createDevvitTest({ userId: 't2_testuser' })

testMarkAdjacency('markHintDismissed sets adjacencyViolation flag in Redis', async () => {
    await markHintDismissed('t2_testuser', 'adjacencyViolation')
    const value = await redis.get('user:t2_testuser:hint:adjacencyViolation')
    expect(value).toBe('1')
})

const testMarkReflectedInGet = createDevvitTest({ userId: 't2_testuser' })

testMarkReflectedInGet('markHintDismissed is reflected by subsequent getHintsDismissed call', async () => {
    await markHintDismissed('t2_testuser', 'numberConstraint')
    const result = await getHintsDismissed('t2_testuser')
    expect(result.numberConstraint).toBe(true)
    expect(result.adjacencyViolation).toBe(false)
})

// ─── Idempotence (Requirement 12.6) ──────────────────────────────────────────

const testMarkIdempotentNumber = createDevvitTest({ userId: 't2_testuser' })

testMarkIdempotentNumber('markHintDismissed is idempotent for numberConstraint — double call yields same state', async () => {
    await markHintDismissed('t2_testuser', 'numberConstraint')
    await markHintDismissed('t2_testuser', 'numberConstraint')
    const value = await redis.get('user:t2_testuser:hint:numberConstraint')
    expect(value).toBe('1')
    const result = await getHintsDismissed('t2_testuser')
    expect(result.numberConstraint).toBe(true)
})

const testMarkIdempotentAdjacency = createDevvitTest({ userId: 't2_testuser' })

testMarkIdempotentAdjacency('markHintDismissed is idempotent for adjacencyViolation — triple call yields same state', async () => {
    await markHintDismissed('t2_testuser', 'adjacencyViolation')
    await markHintDismissed('t2_testuser', 'adjacencyViolation')
    await markHintDismissed('t2_testuser', 'adjacencyViolation')
    const value = await redis.get('user:t2_testuser:hint:adjacencyViolation')
    expect(value).toBe('1')
    const result = await getHintsDismissed('t2_testuser')
    expect(result.adjacencyViolation).toBe(true)
})

// ─── No TTL (Requirement 12.1, 12.2) ─────────────────────────────────────────

const testNoTTLNumber = createDevvitTest({ userId: 't2_testuser' })

testNoTTLNumber('markHintDismissed sets no TTL on numberConstraint flag', async () => {
    await markHintDismissed('t2_testuser', 'numberConstraint')
    const ttl = await redis.expireTime('user:t2_testuser:hint:numberConstraint')
    // expireTime returns -1 when key exists with no TTL, -2 when key does not exist
    expect(ttl).toBe(-1)
})

const testNoTTLAdjacency = createDevvitTest({ userId: 't2_testuser' })

testNoTTLAdjacency('markHintDismissed sets no TTL on adjacencyViolation flag', async () => {
    await markHintDismissed('t2_testuser', 'adjacencyViolation')
    const ttl = await redis.expireTime('user:t2_testuser:hint:adjacencyViolation')
    expect(ttl).toBe(-1)
})

// ─── User isolation ───────────────────────────────────────────────────────────

const testUserIsolation = createDevvitTest({ userId: 't2_testuser' })

testUserIsolation('markHintDismissed is scoped to the given userId — other users are unaffected', async () => {
    await markHintDismissed('t2_userA', 'numberConstraint')
    const resultA = await getHintsDismissed('t2_userA')
    const resultB = await getHintsDismissed('t2_userB')
    expect(resultA.numberConstraint).toBe(true)
    expect(resultB.numberConstraint).toBe(false)
})

// ─── Property 7: Hint Dismissal Persistence Idempotence ──────────────────────
// **Validates: Requirement 12.6**
//
// For all sequences of N markHintDismissed calls for the same user and kind,
// the Redis state is always '1' regardless of N.

const testProperty7 = createDevvitTest()

testProperty7('Property 7: hint dismissal persistence idempotence — N calls always yield Redis state "1"', async () => {
    const hintKindArb = fc.constantFrom<HintKind>('numberConstraint', 'adjacencyViolation')

    const userIdArb = fc
        .string({ minLength: 3, maxLength: 20 })
        .map((s) => `t2_${s.replace(/[^a-z0-9]/gi, 'x')}`)
        .filter((s) => s.length > 3)

    const callCountArb = fc.integer({ min: 1, max: 20 })

    await fc.assert(
        fc.asyncProperty(userIdArb, hintKindArb, callCountArb, async (userId, kind, n) => {
            // Call markHintDismissed N times for the same user and kind
            for (let i = 0; i < n; i++) {
                await markHintDismissed(userId, kind)
            }

            // Redis state must always be '1' regardless of N
            const key =
                kind === 'numberConstraint'
                    ? `user:${userId}:hint:numberConstraint`
                    : `user:${userId}:hint:adjacencyViolation`

            const value = await redis.get(key)
            return value === '1'
        }),
        { numRuns: 100 },
    )
})
