import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { expect } from 'vitest'

import {
    COMPLETION_SNAPSHOT_TTL_SECONDS,
    claimCompletionAction,
    createCompletionSnapshot,
    finalizeCompletionAction,
    getLatestCompletionForPost,
    getOwnedCompletionSnapshot,
    releaseCompletionAction,
} from '../completion-snapshot'

const USER_ID = 't2_snapshotuser'
const POST_ID = 't3_snapshotpost'

const makeInput = () => ({
    userId: USER_ID,
    sourcePostId: POST_ID,
    puzzleInstanceId: 'instance-1',
    puzzleNumber: 42,
    gridSize: 4 as const,
    skillLevel: 2,
    timeTaken: 37,
    streak: 5,
    colorGrid: [
        ['red', 'blue', 'red', 'blue'],
        ['blue', 'red', 'blue', 'red'],
        ['red', 'blue', 'red', 'blue'],
        ['blue', 'red', 'blue', 'red'],
    ] as ('red' | 'blue')[][],
})

const testCreate = createDevvitTest({ userId: USER_ID })

testCreate('createCompletionSnapshot stores an immutable, indexed 30-day snapshot', async () => {
    const input = makeInput()
    const snapshot = await createCompletionSnapshot(input)

    const stored = await getOwnedCompletionSnapshot(USER_ID, snapshot.completionId)
    expect(stored).toEqual(snapshot)

    const indexed = await redis.zRange(`user:${USER_ID}:completions`, 0, -1, { by: 'rank' })
    expect(indexed.map(({ member }) => member)).toEqual([snapshot.completionId])

    const expiringKeys = [
        `user:${USER_ID}:completion:${snapshot.completionId}`,
        `user:${USER_ID}:completions`,
        `user:${USER_ID}:completionLatestByPost`,
    ]
    for (const key of expiringKeys) {
        const expiresAt = await redis.expireTime(key)
        const secondsRemaining = expiresAt - Math.floor(Date.now() / 1000)
        expect(secondsRemaining).toBeGreaterThan(COMPLETION_SNAPSHOT_TTL_SECONDS - 10)
        expect(secondsRemaining).toBeLessThanOrEqual(COMPLETION_SNAPSHOT_TTL_SECONDS + 1)
    }

    input.colorGrid[0][0] = 'blue'
    const unchanged = await getOwnedCompletionSnapshot(USER_ID, snapshot.completionId)
    expect(unchanged?.colorGrid[0]?.[0]).toBe('red')
})

const testOwnership = createDevvitTest({ userId: USER_ID })

testOwnership('getOwnedCompletionSnapshot never returns another user\'s snapshot', async () => {
    const snapshot = await createCompletionSnapshot(makeInput())

    expect(await getOwnedCompletionSnapshot('t2_other', snapshot.completionId)).toBeNull()
})

const testLatest = createDevvitTest({ userId: USER_ID })

testLatest('getLatestCompletionForPost resolves the newest compatibility pointer', async () => {
    const first = await createCompletionSnapshot(makeInput())
    const second = await createCompletionSnapshot({
        ...makeInput(),
        puzzleInstanceId: 'instance-2',
        timeTaken: 29,
    })

    const latest = await getLatestCompletionForPost(USER_ID, POST_ID)
    expect(latest?.completionId).toBe(second.completionId)
    expect(latest?.completionId).not.toBe(first.completionId)
    expect(await getLatestCompletionForPost('t2_other', POST_ID)).toBeNull()
})

const testActions = createDevvitTest({ userId: USER_ID })

testActions('completion actions are claimed and finalized idempotently', async () => {
    const snapshot = await createCompletionSnapshot(makeInput())

    const claim = await claimCompletionAction(USER_ID, snapshot.completionId, 'challenge')
    expect(claim.status).toBe('claimed')
    if (claim.status !== 'claimed') throw new Error('Expected action claim')

    const actionExpiry = await redis.expireTime(
        `user:${USER_ID}:completion:${snapshot.completionId}:action:challenge`,
    )
    expect(actionExpiry - Math.floor(Date.now() / 1000)).toBeGreaterThan(
        COMPLETION_SNAPSHOT_TTL_SECONDS - 10,
    )

    expect(
        await claimCompletionAction(USER_ID, snapshot.completionId, 'challenge'),
    ).toEqual({ status: 'pending' })

    const finalized = await finalizeCompletionAction(
        USER_ID,
        snapshot.completionId,
        'challenge',
        claim.claimToken,
        't3_createdchallenge',
    )
    expect(finalized.status).toBe('finalized')
    expect(finalized.resourceId).toBe('t3_createdchallenge')

    expect(
        await claimCompletionAction(USER_ID, snapshot.completionId, 'challenge'),
    ).toMatchObject({
        status: 'finalized',
        resourceId: 't3_createdchallenge',
    })

    await expect(finalizeCompletionAction(
        USER_ID,
        snapshot.completionId,
        'challenge',
        claim.claimToken,
        't3_createdchallenge',
    )).resolves.toMatchObject({
        status: 'finalized',
        resourceId: 't3_createdchallenge',
    })
})

testActions('a failed side effect can release its matching action claim for retry', async () => {
    const snapshot = await createCompletionSnapshot(makeInput())
    const claim = await claimCompletionAction(USER_ID, snapshot.completionId, 'challenge')
    if (claim.status !== 'claimed') throw new Error('Expected action claim')

    expect(await releaseCompletionAction(
        USER_ID,
        snapshot.completionId,
        'challenge',
        claim.claimToken,
    )).toBe(true)
    expect((await claimCompletionAction(
        USER_ID,
        snapshot.completionId,
        'challenge',
    )).status).toBe('claimed')
})

const testActionGuards = createDevvitTest({ userId: USER_ID })

testActionGuards('completion action guards reject missing ownership and invalid finalizers', async () => {
    const snapshot = await createCompletionSnapshot(makeInput())
    const claim = await claimCompletionAction(USER_ID, snapshot.completionId, 'result-comment')
    if (claim.status !== 'claimed') throw new Error('Expected action claim')

    await expect(
        claimCompletionAction('t2_other', snapshot.completionId, 'result-comment'),
    ).rejects.toThrow('Completion snapshot not found')

    await expect(finalizeCompletionAction(
        USER_ID,
        snapshot.completionId,
        'result-comment',
        'wrong-token',
        't1_resultcomment',
    )).rejects.toThrow('Completion action claim does not match')

    await finalizeCompletionAction(
        USER_ID,
        snapshot.completionId,
        'result-comment',
        claim.claimToken,
        't1_resultcomment',
    )

    await expect(finalizeCompletionAction(
        USER_ID,
        snapshot.completionId,
        'result-comment',
        claim.claimToken,
        't1_differentcomment',
    )).rejects.toThrow('Completion action already finalized')
})
