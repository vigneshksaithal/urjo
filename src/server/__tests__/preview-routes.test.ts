/**
 * Tests for GET /api/preview — the inline preview webview data endpoint.
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit } from '@devvit/web/server'
import { runWithContext } from '@devvit/server'
import { expect, vi } from 'vitest'

import { app } from '../index'

const test = createDevvitTest({ subredditName: 'urjo' })

const withContext = <T>(postId: string | undefined, fn: () => Promise<T>): Promise<T> =>
    runWithContext(
        { postId, subredditName: 'urjo', subredditId: 't5_urjo' } as Parameters<typeof runWithContext>[0],
        fn,
    )

const seedChallengePuzzle = async (postId = 't3_challenge', challengerId = 't2_challenger', score = 42) => {
    await redis.hSet(`game:${postId}:puzzle`, {
        colors: 'rb.brb.brb.brb..',
        numbers: '----------------',
        solution: 'rbrbrbrbrbrbrbrb',
        difficulty: 'easy',
        gridSize: '4',
        challengeBy: challengerId,
        challengeScore: score.toString(),
    })
}

const seedDailyPuzzle = async (postId = 't3_daily') => {
    await redis.hSet(`game:${postId}:puzzle`, {
        colors: 'rb.brb.brb.brb..',
        numbers: '----------------',
        solution: 'rbrbrbrbrbrbrbrb',
        difficulty: 'easy',
        gridSize: '4',
    })
}

const getPreview = () => app.request('/api/preview')

test('returns 400 when there is no post context', async () => {
    const res = await withContext(undefined, () => getPreview())
    expect(res.status).toBe(400)
})

test('returns 404 when the puzzle does not exist', async () => {
    const res = await withContext('t3_missing', () => getPreview())
    expect(res.status).toBe(404)
})

test('returns daily puzzle preview without challenger fields', async () => {
    await seedDailyPuzzle('t3_daily')
    const res = await withContext('t3_daily', () => getPreview())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('success')
    expect(body.data.isChallenge).toBe(false)
    expect(body.data.colors).toBe('rb.brb.brb.brb..')
    expect(body.data.gridSize).toBe(4)
    expect(body.data.challengerUsername).toBeNull()
    expect(body.data.challengerTime).toBeNull()
    expect(body.data.avatarUrl).toBeNull()
})

test('never leaks the solution in the response', async () => {
    await seedDailyPuzzle('t3_daily2')
    const res = await withContext('t3_daily2', () => getPreview())
    const text = await res.text()
    expect(text).not.toContain('rbrbrbrbrbrbrbrb')
})

test('returns challenger username, time, and avatar for challenge posts', async () => {
    await seedChallengePuzzle('t3_challenge', 't2_challenger', 42)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'alice' } as never)
    vi.spyOn(reddit, 'getSnoovatarUrl').mockResolvedValue('https://img/alice.png' as never)

    const res = await withContext('t3_challenge', () => getPreview())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.isChallenge).toBe(true)
    expect(body.data.challengerUsername).toBe('alice')
    expect(body.data.challengerTime).toBe(42)
    expect(body.data.avatarUrl).toBe('https://img/alice.png')
})

test('falls back to null avatar when snoovatar lookup fails', async () => {
    await seedChallengePuzzle('t3_challenge2', 't2_challenger', 30)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'bob' } as never)
    vi.spyOn(reddit, 'getSnoovatarUrl').mockRejectedValue(new Error('no avatar'))

    const res = await withContext('t3_challenge2', () => getPreview())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.challengerUsername).toBe('bob')
    expect(body.data.avatarUrl).toBeNull()
})

test('uses precomputed username and avatar without any live Reddit lookup', async () => {
    await redis.hSet('game:t3_stored:puzzle', {
        colors: 'rb.brb.brb.brb..',
        numbers: '----------------',
        solution: 'rbrbrbrbrbrbrbrb',
        difficulty: 'easy',
        gridSize: '4',
        challengeBy: 't2_challenger',
        challengeScore: '37',
        challengeByUsername: 'stored_user',
        challengeByAvatar: 'https://img/stored.png',
    })
    const getUserById = vi.spyOn(reddit, 'getUserById')
    const getSnoovatarUrl = vi.spyOn(reddit, 'getSnoovatarUrl')

    const res = await withContext('t3_stored', () => getPreview())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.challengerUsername).toBe('stored_user')
    expect(body.data.avatarUrl).toBe('https://img/stored.png')
    expect(getUserById).not.toHaveBeenCalled()
    expect(getSnoovatarUrl).not.toHaveBeenCalled()
})
