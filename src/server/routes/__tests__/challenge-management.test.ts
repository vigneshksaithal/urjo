import { redis } from '@devvit/redis'
import { reddit } from '@devvit/reddit'
import { createDevvitTest } from '@devvit/test/server/vitest'
import { runWithContext } from '@devvit/web/server'
import { afterEach, expect, vi } from 'vitest'

import { challengeManagementRouter } from '../challenge-management'

const USER_ID = 't2_challenge_owner'
const OTHER_USER_ID = 't2_other_user'
const POST_ID = 't3_owned_challenge'
const POST_URL = 'https://reddit.com/comments/owned_challenge'

const test = createDevvitTest({
    userId: USER_ID,
    subredditName: 'urjo',
    subredditId: 't5_urjo',
})

afterEach(() => {
    vi.restoreAllMocks()
})

const request = (path: string, init?: RequestInit): Promise<Response> =>
    challengeManagementRouter.request(path, init)

const seedChallenge = async (
    postId: string,
    ownerId: string = USER_ID,
    createdAt = 1_720_000_000_000,
): Promise<void> => {
    await Promise.all([
        redis.zAdd(`user:${USER_ID}:createdChallenges`, { member: postId, score: createdAt }),
        redis.hSet(`game:${postId}:meta`, {
            postType: 'urjo-puzzle',
            challengeCreatorId: ownerId,
            createdAt: createdAt.toString(),
        }),
        redis.hSet(`game:${postId}:puzzle`, {
            challengeBy: ownerId,
            challengeScore: '42',
            gridSize: '6',
        }),
        redis.hSet(`game:${postId}:stats`, { attempts: '3', beats: '1' }),
        redis.hSet(`game:${postId}:preview`, { type: 'challenge' }),
        redis.zAdd(`challenge:${postId}:beat_events`, { member: 'event', score: 1 }),
        redis.set(`viral:challenge:${postId}:created_at`, createdAt.toString()),
        redis.set(`referral:${postId}:count`, '1'),
        redis.set(`preview:updated:${postId}`, '1'),
    ])
}

test('GET /api/challenges/mine requires a logged-in user', async () => {
    const response = await runWithContext(
        { subredditName: 'urjo' },
        () => request('/api/challenges/mine'),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
        status: 'error',
        message: 'Sign in to manage your rival posts',
    })
})

test('GET /api/challenges/mine lists only server-verified owned challenges newest first', async () => {
    await seedChallenge('t3_older', USER_ID, 1_710_000_000_000)
    await seedChallenge('t3_newer', USER_ID, 1_720_000_000_000)
    await seedChallenge('t3_forged', OTHER_USER_ID, 1_730_000_000_000)

    const response = await request('/api/challenges/mine')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
        status: 'success',
        data: {
            challenges: [
                {
                    postId: 't3_newer',
                    postUrl: 'https://reddit.com/comments/newer',
                    createdAt: '2024-07-03T09:46:40.000Z',
                    gridSize: 6,
                    targetTime: 42,
                    kind: 'challenge',
                },
                {
                    postId: 't3_older',
                    postUrl: 'https://reddit.com/comments/older',
                    createdAt: '2024-03-09T16:00:00.000Z',
                    gridSize: 6,
                    targetTime: 42,
                    kind: 'challenge',
                },
            ],
        },
    })
})

test('DELETE /api/challenges/:postId rejects forged ownership without calling Reddit', async () => {
    await seedChallenge(POST_ID, OTHER_USER_ID)
    const remove = vi.spyOn(reddit, 'remove').mockResolvedValue(undefined)

    const response = await request(`/api/challenges/${POST_ID}`, { method: 'DELETE' })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
        status: 'error',
        message: 'This rival post is not owned by your Urjo account',
    })
    expect(remove).not.toHaveBeenCalled()
    expect(await redis.zScore(`user:${USER_ID}:createdChallenges`, POST_ID)).toBeDefined()
    expect(await redis.hGet(`game:${POST_ID}:puzzle`, 'challengeBy')).toBe(OTHER_USER_ID)
})

test('DELETE /api/challenges/:postId preserves Redis when Reddit removal fails', async () => {
    await seedChallenge(POST_ID)
    vi.spyOn(reddit, 'remove').mockRejectedValue(new Error('reddit unavailable'))

    const response = await request(`/api/challenges/${POST_ID}`, { method: 'DELETE' })

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
        status: 'error',
        message: 'Reddit could not remove this rival post. You can manage it directly on Reddit.',
        postUrl: POST_URL,
    })
    expect(await redis.zScore(`user:${USER_ID}:createdChallenges`, POST_ID)).toBeDefined()
    expect(await redis.hGet(`game:${POST_ID}:meta`, 'challengeCreatorId')).toBe(USER_ID)
    expect(await redis.hGet(`game:${POST_ID}:puzzle`, 'challengeBy')).toBe(USER_ID)
    expect(
        await redis.zScore(
            `user:${USER_ID}:dynamicKeys`,
            `user:${USER_ID}:challenge-removal:${POST_ID}`,
        ),
    ).toBeDefined()
})

test('DELETE /api/challenges/:postId rejects a concurrent removal without calling Reddit', async () => {
    await seedChallenge(POST_ID)
    await redis.set(`user:${USER_ID}:challenge-removal:${POST_ID}`, '1')
    const remove = vi.spyOn(reddit, 'remove').mockResolvedValue(undefined)

    const response = await request(`/api/challenges/${POST_ID}`, { method: 'DELETE' })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
        status: 'error',
        message: 'This rival post removal is already in progress',
    })
    expect(remove).not.toHaveBeenCalled()
    expect(await redis.zScore(`user:${USER_ID}:createdChallenges`, POST_ID)).toBeDefined()
    expect(await redis.hGet(`game:${POST_ID}:puzzle`, 'challengeBy')).toBe(USER_ID)
})

test('DELETE /api/challenges/:postId removes an owned challenge then cleans its Redis records', async () => {
    await seedChallenge(POST_ID)
    const remove = vi.spyOn(reddit, 'remove').mockResolvedValue(undefined)

    const response = await request(`/api/challenges/${POST_ID}`, { method: 'DELETE' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
        status: 'success',
        data: { postId: POST_ID, state: 'removed', alreadyRemoved: false },
    })
    expect(remove).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith(POST_ID, false)
    expect(await redis.zScore(`user:${USER_ID}:createdChallenges`, POST_ID)).toBeUndefined()
    expect(await redis.hGetAll(`game:${POST_ID}:meta`)).toEqual({})
    expect(await redis.hGetAll(`game:${POST_ID}:puzzle`)).toEqual({})
    expect(await redis.hGetAll(`game:${POST_ID}:stats`)).toEqual({})
    expect(await redis.hGetAll(`game:${POST_ID}:preview`)).toEqual({})
    expect(await redis.zRange(`challenge:${POST_ID}:beat_events`, 0, -1, { by: 'rank' })).toEqual([])
    expect(await redis.get(`viral:challenge:${POST_ID}:created_at`)).toBeUndefined()
    expect(await redis.get(`referral:${POST_ID}:count`)).toBeUndefined()
    expect(await redis.get(`preview:updated:${POST_ID}`)).toBeUndefined()
})

test('DELETE /api/challenges/:postId is an idempotent no-op after the index is gone', async () => {
    const remove = vi.spyOn(reddit, 'remove').mockResolvedValue(undefined)

    const response = await request(`/api/challenges/${POST_ID}`, { method: 'DELETE' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
        status: 'success',
        data: { postId: POST_ID, state: 'removed', alreadyRemoved: true },
    })
    expect(remove).not.toHaveBeenCalled()
})
