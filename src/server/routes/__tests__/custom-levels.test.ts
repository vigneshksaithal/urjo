import { createDevvitTest } from '@devvit/test/server/vitest'
import { reddit, redis, runWithContext } from '@devvit/web/server'
import { afterEach, expect, vi } from 'vitest'

import { customLevelsRouter } from '../custom-levels'

const USER_ID = 't2_level_author'
const POST_ID = 't3_source_post'
const VALID_SOLUTION = 'rrbbrbbrbbrrbrrb'

const test = createDevvitTest({
    userId: USER_ID,
    postId: POST_ID,
    subredditName: 'urjo',
    subredditId: 't5_urjo',
})

const request = (path: string, body: Record<string, unknown>): Promise<Response> =>
    customLevelsRouter.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

const withLoggedOutContext = <T>(callback: () => Promise<T>): Promise<T> =>
    runWithContext({
        postId: POST_ID,
        subredditName: 'urjo',
        subredditId: 't5_urjo',
    }, callback)

afterEach(() => {
    vi.restoreAllMocks()
})

test('preview requires a logged-in user', async () => {
    const response = await withLoggedOutContext(() => request('/api/custom-levels/preview', {
        gridSize: 4,
        difficulty: 'medium',
        solution: VALID_SOLUTION,
    }))

    expect(response.status).toBe(401)
})

test('preview rejects invalid authored solutions', async () => {
    const response = await request('/api/custom-levels/preview', {
        gridSize: 4,
        difficulty: 'medium',
        solution: 'r'.repeat(16),
    })

    expect(response.status).toBe(400)
})

test('preview stores a short-lived server draft and returns no solution', async () => {
    const response = await request('/api/custom-levels/preview', {
        gridSize: 4,
        difficulty: 'medium',
        solution: VALID_SOLUTION,
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.status).toBe('success')
    expect(payload.data.puzzle).not.toHaveProperty('solution')
    expect(await redis.get(`user:${USER_ID}:level-draft:${payload.data.draftId}`)).toBeDefined()
})

test('publish creates a transparent user-authored Reddit post from the owned draft', async () => {
    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_custom_level' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue({
        id: 't1_sticky',
        distinguish: vi.fn().mockResolvedValue(undefined),
    } as never)

    const preview = await request('/api/custom-levels/preview', {
        gridSize: 4,
        difficulty: 'medium',
        solution: VALID_SOLUTION,
    })
    const previewPayload = await preview.json()
    const response = await request('/api/custom-levels/publish', {
        draftId: previewPayload.data.draftId,
        title: 'My balanced board',
    })

    expect(response.status).toBe(200)
    expect(reddit.submitCustomPost).toHaveBeenCalledWith(expect.objectContaining({
        runAs: 'USER',
        title: 'My balanced board',
        userGeneratedContent: { text: 'My balanced board' },
    }))
    expect(await redis.hGet('game:t3_custom_level:meta', 'creatorContentType')).toBe('level')
    expect(await redis.hGet('game:t3_custom_level:puzzle', 'lockedGridSize')).toBe('4')
    expect(await redis.zScore(`user:${USER_ID}:createdChallenges`, 't3_custom_level')).toBeDefined()
})

test('publish rejects another user\'s draft without posting', async () => {
    const submitPost = vi.spyOn(reddit, 'submitCustomPost')
    const preview = await request('/api/custom-levels/preview', {
        gridSize: 4,
        difficulty: 'medium',
        solution: VALID_SOLUTION,
    })
    const previewPayload = await preview.json()

    const response = await runWithContext({
        userId: 't2_other',
        postId: POST_ID,
        subredditName: 'urjo',
        subredditId: 't5_urjo',
    }, () => request('/api/custom-levels/publish', {
        draftId: previewPayload.data.draftId,
        title: 'Forged level',
    }))

    expect(response.status).toBe(404)
    expect(submitPost).not.toHaveBeenCalled()
})
