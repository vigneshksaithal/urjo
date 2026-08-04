import { runWithContext } from '@devvit/server'
import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit } from '@devvit/web/server'
import { expect, vi } from 'vitest'

import { app } from '../index'
import { createCompletionSnapshot } from '../lib/completion-snapshot'

const USER_ID = 't2_challenge_integrity'
const POST_ID = 't3_challenge_integrity'
const SOLUTION = 'rbrbbrbrrbbbbrbr'

const test = createDevvitTest({ userId: USER_ID, subredditName: 'urjo' })

const withContext = <T>(userId: string, fn: () => Promise<T>): Promise<T> =>
    runWithContext(
        {
            postId: POST_ID,
            userId,
            subredditName: 'urjo',
            subredditId: 't5_urjo',
        } as Parameters<typeof runWithContext>[0],
        fn,
    )

const requestChallenge = (body: object): Promise<Response> =>
    app.request('/api/game/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

const seedVerifiedCompletion = async (userId = USER_ID): Promise<string> => {
    await redis.hSet(`game:${POST_ID}:puzzle`, {
        colors: SOLUTION,
        numbers: '-'.repeat(16),
        solution: SOLUTION,
        difficulty: 'easy',
        gridSize: '4',
    })
    const snapshot = await createCompletionSnapshot({
        userId,
        sourcePostId: POST_ID,
        puzzleInstanceId: 'post',
        puzzleNumber: 12,
        gridSize: 4,
        skillLevel: 2,
        timeTaken: 45,
        streak: 3,
        colorGrid: [
            ['red', 'blue', 'red', 'blue'],
            ['blue', 'red', 'blue', 'red'],
            ['red', 'blue', 'blue', 'blue'],
            ['blue', 'red', 'blue', 'red'],
        ],
    })
    return snapshot.completionId
}

const createAnotherCompletion = async (sequence: number): Promise<string> => {
    const snapshot = await createCompletionSnapshot({
        userId: USER_ID,
        sourcePostId: POST_ID,
        puzzleInstanceId: 'post',
        puzzleNumber: 12 + sequence,
        gridSize: 4,
        skillLevel: 2,
        timeTaken: 45 + sequence,
        streak: 3,
        colorGrid: Array.from({ length: 4 }, () =>
            ['red', 'blue', 'red', 'blue'] as const,
        ),
    })
    return snapshot.completionId
}

const mockRedditPost = (): ReturnType<typeof vi.spyOn> => {
    const submit = vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_verified_rival' } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'VerifiedPlayer' } as never)
    vi.spyOn(reddit, 'getSnoovatarUrl').mockResolvedValue(undefined as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue({
        id: 't1_verified_board',
        distinguish: vi.fn().mockResolvedValue(undefined),
    } as never)
    return submit
}

test('challenge creation requires an owned verified completion receipt', async () => {
    await redis.hSet(`game:${POST_ID}:puzzle`, {
        colors: SOLUTION,
        numbers: '-'.repeat(16),
        solution: SOLUTION,
        difficulty: 'easy',
        gridSize: '4',
    })

    const submit = vi.spyOn(reddit, 'submitCustomPost')
    const response = await withContext(USER_ID, () => requestChallenge({ timeTaken: 1 }))

    expect(response.status).toBe(400)
    expect(submit).not.toHaveBeenCalled()
})

test('challenge creation uses the immutable server snapshot and ignores forged metrics', async () => {
    const completionId = await seedVerifiedCompletion()
    mockRedditPost()

    const response = await withContext(USER_ID, () => requestChallenge({
        completionId,
        timeTaken: 1,
        skillLevel: 9,
        mistakes: 0,
    }))

    expect(response.status).toBe(200)
    const puzzle = await redis.hGetAll('game:t3_verified_rival:puzzle')
    expect(puzzle.challengeScore).toBe('45')
    expect(puzzle.challengeMistakes).toBeUndefined()
})

test('retrying the same completion returns the created challenge without posting twice', async () => {
    const completionId = await seedVerifiedCompletion()
    const submit = mockRedditPost()

    const first = await withContext(USER_ID, () => requestChallenge({ completionId }))
    const second = await withContext(USER_ID, () => requestChallenge({ completionId }))
    const secondBody = await second.json() as { postId?: string }

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(secondBody.postId).toBe('t3_verified_rival')
    expect(submit).toHaveBeenCalledTimes(1)
})

test('challenge creation is capped at three user-authored posts per UTC day', async () => {
    const firstCompletionId = await seedVerifiedCompletion()
    const completionIds = [
        firstCompletionId,
        await createAnotherCompletion(1),
        await createAnotherCompletion(2),
        await createAnotherCompletion(3),
    ]
    const submit = vi.spyOn(reddit, 'submitCustomPost')
    for (let index = 0; index < 3; index++) {
        submit.mockResolvedValueOnce({ id: `t3_capped_${index}` } as never)
    }
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'VerifiedPlayer' } as never)
    vi.spyOn(reddit, 'getSnoovatarUrl').mockResolvedValue(undefined as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue({
        id: 't1_capped_board',
        distinguish: vi.fn().mockResolvedValue(undefined),
    } as never)

    for (const completionId of completionIds.slice(0, 3)) {
        expect((await withContext(USER_ID, () => requestChallenge({ completionId }))).status).toBe(200)
    }
    const capped = await withContext(USER_ID, () => requestChallenge({
        completionId: completionIds[3],
    }))

    expect(capped.status).toBe(429)
    expect(submit).toHaveBeenCalledTimes(3)
})
