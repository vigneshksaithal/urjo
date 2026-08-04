import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/redis'
import { expect } from 'vitest'

import type { SerializedPuzzle } from '../../../shared/types'
import {
    ANONYMOUS_MIGRATION_TTL_SECONDS,
    ANONYMOUS_PUZZLE_TTL_SECONDS,
    claimAnonymousMigration,
    finalizeAnonymousMigration,
    getAnonymousPuzzle,
    persistAnonymousPuzzle,
    startAnonymousPuzzleTimer,
    verifyAnonymousPuzzleCompletion,
} from '../anonymous-receipts'

const test = createDevvitTest()

const PUZZLE: SerializedPuzzle = {
    colors: 'rrbbrrbbrrbbrrbb',
    numbers: '----------------',
    solution: 'rrbbrrbbrrbbrrbb',
    difficulty: 'easy',
    gridSize: 4,
}

const ISSUE = {
    sessionId: 'session_anon_123',
    postId: 't3_anon',
    contentId: 't3_anon_instance_1',
    puzzle: PUZZLE,
    scheduledDate: '2026-07-15',
    scheduledSlotKey: '6x6-1400',
} as const

test('persists the exact anonymous puzzle server-side with a bounded TTL', async () => {
    await persistAnonymousPuzzle(ISSUE, 1_000)

    const stored = await getAnonymousPuzzle(ISSUE.sessionId, ISSUE.postId)
    expect(stored).toMatchObject({
        contentId: ISSUE.contentId,
        puzzle: PUZZLE,
        scheduledDate: ISSUE.scheduledDate,
        scheduledSlotKey: ISSUE.scheduledSlotKey,
        issuedAt: 1_000,
    })
    expect(JSON.stringify(stored)).toContain(PUZZLE.solution)

    const keys = await redis.hKeys('anonymous:puzzles:index')
    expect(keys).toEqual([])
    expect(ANONYMOUS_PUZZLE_TTL_SECONDS).toBeLessThanOrEqual(24 * 60 * 60)
})

test('binds the first-cell timer to content and attempt exactly once', async () => {
    await persistAnonymousPuzzle(ISSUE, 1_000)

    const first = await startAnonymousPuzzleTimer({
        sessionId: ISSUE.sessionId,
        postId: ISSUE.postId,
        contentId: ISSUE.contentId,
        attemptId: 'attempt_anon_1',
        nowMs: 5_000,
    })
    const second = await startAnonymousPuzzleTimer({
        sessionId: ISSUE.sessionId,
        postId: ISSUE.postId,
        contentId: ISSUE.contentId,
        attemptId: 'attempt_anon_1',
        nowMs: 9_000,
    })

    expect(first).toEqual({ status: 'started' })
    expect(second).toEqual({ status: 'already-started' })
    expect(await startAnonymousPuzzleTimer({
        sessionId: ISSUE.sessionId,
        postId: ISSUE.postId,
        contentId: 't3_anon_wrong_1',
        attemptId: 'attempt_anon_1',
        nowMs: 9_000,
    })).toEqual({ status: 'mismatch' })
})

test('verifies the stored board and derives elapsed time without client metrics', async () => {
    await persistAnonymousPuzzle(ISSUE, 1_000)
    await startAnonymousPuzzleTimer({
        sessionId: ISSUE.sessionId,
        postId: ISSUE.postId,
        contentId: ISSUE.contentId,
        attemptId: 'attempt_anon_1',
        nowMs: 5_000,
    })

    const result = await verifyAnonymousPuzzleCompletion({
        sessionId: ISSUE.sessionId,
        postId: ISSUE.postId,
        contentId: ISSUE.contentId,
        attemptId: 'attempt_anon_1',
        board: PUZZLE.solution,
        nowMs: 50_100,
    })

    expect(result).toMatchObject({
        status: 'verified',
        timeTaken: 46,
        gridSize: 4,
        completionDate: '1970-01-01',
    })
    if (result.status !== 'verified') throw new Error('Expected a verified completion')
    expect(result.migrationToken).toMatch(/^[a-f0-9-]{36}$/)
    expect(JSON.stringify(result)).not.toContain('mistakes')
    expect(ANONYMOUS_MIGRATION_TTL_SECONDS).toBeLessThan(ANONYMOUS_PUZZLE_TTL_SECONDS)
})

test('rejects a forged board without issuing a migration receipt', async () => {
    await persistAnonymousPuzzle(ISSUE, 1_000)
    await startAnonymousPuzzleTimer({
        sessionId: ISSUE.sessionId,
        postId: ISSUE.postId,
        contentId: ISSUE.contentId,
        attemptId: 'attempt_anon_1',
        nowMs: 5_000,
    })

    const result = await verifyAnonymousPuzzleCompletion({
        sessionId: ISSUE.sessionId,
        postId: ISSUE.postId,
        contentId: ISSUE.contentId,
        attemptId: 'attempt_anon_1',
        board: 'bbbbrrrrbbbbrrrr',
        nowMs: 50_100,
    })

    expect(result).toEqual({ status: 'invalid-solution' })
})

test('atomically claims a one-time migration token and preserves idempotency state', async () => {
    await persistAnonymousPuzzle(ISSUE, 1_000)
    await startAnonymousPuzzleTimer({
        sessionId: ISSUE.sessionId,
        postId: ISSUE.postId,
        contentId: ISSUE.contentId,
        attemptId: 'attempt_anon_1',
        nowMs: 5_000,
    })
    const completion = await verifyAnonymousPuzzleCompletion({
        sessionId: ISSUE.sessionId,
        postId: ISSUE.postId,
        contentId: ISSUE.contentId,
        attemptId: 'attempt_anon_1',
        board: PUZZLE.solution,
        nowMs: 50_100,
    })
    if (completion.status !== 'verified') throw new Error('Expected a verified completion')

    const [left, right] = await Promise.all([
        claimAnonymousMigration(completion.migrationToken, 't2_player', ISSUE.postId),
        claimAnonymousMigration(completion.migrationToken, 't2_player', ISSUE.postId),
    ])
    expect([left.status, right.status].sort()).toEqual(['claimed', 'pending'])

    await finalizeAnonymousMigration(completion.migrationToken, 't2_player', true)
    expect(await claimAnonymousMigration(
        completion.migrationToken,
        't2_player',
        ISSUE.postId,
    )).toEqual({ status: 'finalized', credited: true })
    expect(await claimAnonymousMigration(
        completion.migrationToken,
        't2_other',
        ISSUE.postId,
    )).toEqual({ status: 'unavailable' })
})

