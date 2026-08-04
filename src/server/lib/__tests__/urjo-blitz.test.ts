import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, realtime } from '@devvit/web/server'
import { expect, vi } from 'vitest'

import { URJO_BLITZ_CHANNEL } from '../../../shared/urjo-blitz'
import {
    URJO_BLITZ_RETENTION_SECONDS,
    UrjoBlitzInactiveError,
    closeUrjoBlitz,
    deleteUrjoBlitzUserData,
    getUrjoBlitzState,
    joinUrjoBlitz,
    recordVerifiedUrjoBlitzCompletion,
    startUrjoBlitz,
} from '../urjo-blitz'

const FRIDAY = new Date('2026-07-17T18:00:00.000Z')
const SUNDAY = new Date('2026-07-19T18:00:00.000Z')

const test = createDevvitTest()

test('starts one durable 48-hour event and emits one aggregate status update', async ({ mocks }) => {
    const first = await startUrjoBlitz(FRIDAY)
    const second = await startUrjoBlitz(FRIDAY)

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(first.event).toMatchObject({
        eventId: '2026-W29',
        status: 'active',
        participantCount: 0,
        completionCount: 0,
        startAt: FRIDAY.toISOString(),
        endAt: SUNDAY.toISOString(),
    })
    expect(await redis.get('blitz:current')).toBe('2026-W29')

    const messages = mocks.realtime.getSentMessagesForChannel(URJO_BLITZ_CHANNEL)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.data?.msg).toMatchObject({
        type: 'urjo-blitz-summary',
        eventId: '2026-W29',
        participantCount: 0,
        completionCount: 0,
    })
})

test('join is explicit and idempotent', async () => {
    await startUrjoBlitz(FRIDAY)

    const first = await joinUrjoBlitz('t2_alice', 'Alice', new Date(FRIDAY.getTime() + 1_000))
    const second = await joinUrjoBlitz('t2_alice', 'Alice', new Date(FRIDAY.getTime() + 2_000))
    const state = await getUrjoBlitzState('t2_alice', new Date(FRIDAY.getTime() + 3_000))

    expect(first.joinedNow).toBe(true)
    expect(second.joinedNow).toBe(false)
    expect(state.event?.participantCount).toBe(1)
    expect(state.viewer).toEqual({ joined: true, rank: null, score: 0 })
})

test('publishes identity-free aggregate updates after durable changes', async ({ mocks }) => {
    await startUrjoBlitz(FRIDAY)
    const joinedAt = new Date(FRIDAY.getTime() + 1_000)
    await joinUrjoBlitz('t2_alice', 'Alice', joinedAt)

    const messages = mocks.realtime.getSentMessagesForChannel(URJO_BLITZ_CHANNEL)
    const latest = messages.at(-1)?.data?.msg

    expect(latest).toMatchObject({
        type: 'urjo-blitz-summary',
        participantCount: 1,
        completionCount: 0,
        updatedAt: joinedAt.toISOString(),
    })
    expect(JSON.stringify(latest)).not.toMatch(/Alice|t2_alice/)
})

test('coalesces high-volume score hints to at most one aggregate update per second', async ({ mocks }) => {
    await startUrjoBlitz(FRIDAY)
    const joinedAt = new Date(FRIDAY.getTime() + 1_000)
    await joinUrjoBlitz('t2_alice', 'Alice', joinedAt)

    for (const completionId of ['burst-one', 'burst-two']) {
        await recordVerifiedUrjoBlitzCompletion({
            userId: 't2_alice', completionId, gridSize: 8,
            completedAt: new Date(FRIDAY.getTime() + 1_500),
        })
    }
    await recordVerifiedUrjoBlitzCompletion({
        userId: 't2_alice', completionId: 'next-bucket', gridSize: 8,
        completedAt: new Date(FRIDAY.getTime() + 2_000),
    })

    const messages = mocks.realtime.getSentMessagesForChannel(URJO_BLITZ_CHANNEL)
    expect(messages).toHaveLength(3)
    expect(messages.at(-1)?.data?.msg).toMatchObject({ completionCount: 3 })
})

test('verified completions count once and award larger boards more points', async () => {
    await startUrjoBlitz(FRIDAY)
    await joinUrjoBlitz('t2_alice', 'Alice', new Date(FRIDAY.getTime() + 1_000))

    const first = await recordVerifiedUrjoBlitzCompletion({
        userId: 't2_alice',
        completionId: 'completion-one',
        gridSize: 8,
        completedAt: new Date(FRIDAY.getTime() + 2_000),
    })
    const duplicate = await recordVerifiedUrjoBlitzCompletion({
        userId: 't2_alice',
        completionId: 'completion-one',
        gridSize: 8,
        completedAt: new Date(FRIDAY.getTime() + 3_000),
    })
    const second = await recordVerifiedUrjoBlitzCompletion({
        userId: 't2_alice',
        completionId: 'completion-two',
        gridSize: 6,
        completedAt: new Date(FRIDAY.getTime() + 4_000),
    })

    expect(first).toMatchObject({ recorded: true, points: 3, score: 3 })
    expect(duplicate).toMatchObject({ recorded: false, reason: 'duplicate', score: 3 })
    expect(second).toMatchObject({ recorded: true, points: 2, score: 5 })

    const state = await getUrjoBlitzState('t2_alice', new Date(FRIDAY.getTime() + 5_000))
    expect(state.event?.completionCount).toBe(2)
    expect(state.viewer).toEqual({ joined: true, rank: 1, score: 5 })
})

test('does not count a verified solve before the player joins', async () => {
    await startUrjoBlitz(FRIDAY)

    const result = await recordVerifiedUrjoBlitzCompletion({
        userId: 't2_alice',
        completionId: 'completion-not-joined',
        gridSize: 8,
        completedAt: new Date(FRIDAY.getTime() + 1_000),
    })

    expect(result).toEqual({ recorded: false, reason: 'not_joined' })
})

test('does not open participation before the real start time', async () => {
    await startUrjoBlitz(FRIDAY)

    await expect(joinUrjoBlitz(
        't2_alice',
        'Alice',
        new Date(FRIDAY.getTime() - 1),
    )).rejects.toBeInstanceOf(UrjoBlitzInactiveError)
})

test('returns a username-only top leaderboard in descending score order', async () => {
    await startUrjoBlitz(FRIDAY)
    await joinUrjoBlitz('t2_alice', 'Alice', new Date(FRIDAY.getTime() + 1_000))
    await joinUrjoBlitz('t2_bob', 'Bob', new Date(FRIDAY.getTime() + 2_000))
    await recordVerifiedUrjoBlitzCompletion({
        userId: 't2_alice', completionId: 'alice-1', gridSize: 4,
        completedAt: new Date(FRIDAY.getTime() + 3_000),
    })
    await recordVerifiedUrjoBlitzCompletion({
        userId: 't2_bob', completionId: 'bob-1', gridSize: 8,
        completedAt: new Date(FRIDAY.getTime() + 4_000),
    })

    const state = await getUrjoBlitzState(null, new Date(FRIDAY.getTime() + 5_000))

    expect(state.leaderboard).toEqual([
        { rank: 1, username: 'Bob', score: 3 },
        { rank: 2, username: 'Alice', score: 1 },
    ])
    expect(JSON.stringify(state.leaderboard)).not.toContain('t2_')
})

test('closes only after the real deadline and never reopens the same event', async () => {
    await startUrjoBlitz(FRIDAY)

    const early = await closeUrjoBlitz('2026-W29', new Date(SUNDAY.getTime() - 1))
    const first = await closeUrjoBlitz('2026-W29', SUNDAY)
    const second = await closeUrjoBlitz('2026-W29', new Date(SUNDAY.getTime() + 1_000))
    const restarted = await startUrjoBlitz(FRIDAY)

    expect(early.changed).toBe(false)
    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)
    expect(restarted.event.status).toBe('closed')
})

test('lazily closes an expired event and rejects a late completion', async () => {
    await startUrjoBlitz(FRIDAY)
    await joinUrjoBlitz('t2_alice', 'Alice', new Date(FRIDAY.getTime() + 1_000))

    const result = await recordVerifiedUrjoBlitzCompletion({
        userId: 't2_alice',
        completionId: 'completion-late',
        gridSize: 8,
        completedAt: new Date(SUNDAY.getTime() + 1),
    })
    const state = await getUrjoBlitzState('t2_alice', new Date(SUNDAY.getTime() + 2))

    expect(result).toEqual({ recorded: false, reason: 'inactive' })
    expect(state.event?.status).toBe('closed')
})

test('keeps all event keys on bounded retention', async () => {
    await startUrjoBlitz(FRIDAY)
    await joinUrjoBlitz('t2_alice', 'Alice', new Date(FRIDAY.getTime() + 1_000))

    const keys = [
        'blitz:current',
        'blitz:event:2026-W29:meta',
        'blitz:event:2026-W29:participants',
        'user:t2_alice:blitz-participation',
    ]
    const expiresAt = await Promise.all(keys.map((key) => redis.expireTime(key)))
    const nowSeconds = Math.floor(Date.now() / 1_000)

    expect(expiresAt.every((expiry) => {
        const secondsRemaining = expiry - nowSeconds
        return secondsRemaining > 0 && secondsRemaining <= URJO_BLITZ_RETENTION_SECONDS + 1
    })).toBe(true)
})

test('Realtime failures never roll back durable participation', async () => {
    await startUrjoBlitz(FRIDAY)
    vi.spyOn(realtime, 'send').mockRejectedValue(new Error('Realtime unavailable'))

    const result = await joinUrjoBlitz('t2_alice', 'Alice', new Date(FRIDAY.getTime() + 1_000))
    const state = await getUrjoBlitzState('t2_alice', new Date(FRIDAY.getTime() + 2_000))

    expect(result.joinedNow).toBe(true)
    expect(state.viewer?.joined).toBe(true)
})

test('account cleanup removes leaderboard identity while retaining aggregate totals', async () => {
    await startUrjoBlitz(FRIDAY)
    await joinUrjoBlitz('t2_alice', 'Alice', new Date(FRIDAY.getTime() + 1_000))
    await recordVerifiedUrjoBlitzCompletion({
        userId: 't2_alice', completionId: 'alice-cleanup', gridSize: 8,
        completedAt: new Date(FRIDAY.getTime() + 2_000),
    })

    await deleteUrjoBlitzUserData('t2_alice')
    const state = await getUrjoBlitzState(null, new Date(FRIDAY.getTime() + 3_000))

    expect(state.leaderboard).toEqual([])
    expect(state.event).toMatchObject({ participantCount: 1, completionCount: 1 })
    expect(await redis.get('user:t2_alice:blitz-participation')).toBeUndefined()
})
