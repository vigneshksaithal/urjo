import { createDevvitTest } from '@devvit/test/server/vitest'
import { reddit, redis, runWithContext } from '@devvit/web/server'
import { afterEach, expect, vi } from 'vitest'

import { app } from '../index'
import { createCompletionSnapshot } from '../lib/completion-snapshot'

const USER_ID = 't2_player1'
const POST_ID = 't3_testpost'
const OTHER_POST_ID = 't3_otherpost'

const test = createDevvitTest({
    userId: USER_ID,
    postId: POST_ID,
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

const withContext = <T>(userId: string, postId: string, callback: () => Promise<T>): Promise<T> =>
    runWithContext({
        userId,
        postId,
        subredditName: 'testsub',
        subredditId: 't5_testsub',
    }, callback)

const createReceipt = async (
    userId = USER_ID,
    sourcePostId = POST_ID,
): Promise<string> => {
    const snapshot = await createCompletionSnapshot({
        userId,
        sourcePostId,
        puzzleInstanceId: 'verified-instance',
        puzzleNumber: 42,
        gridSize: 4,
        skillLevel: 3,
        timeTaken: 23,
        streak: 5,
        colorGrid: [
            ['red', 'blue', 'red', 'blue'],
            ['blue', 'red', 'blue', 'red'],
            ['red', 'blue', 'red', 'blue'],
            ['blue', 'red', 'blue', 'red'],
        ],
    })
    return snapshot.completionId
}

const seedStickyComment = (): Promise<number> => redis.hSet(`game:${POST_ID}:meta`, {
    stickyCommentId: 't1_sticky123',
})

const requestComment = (body: Record<string, unknown>): Promise<Response> =>
    app.request('/api/game/result-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

afterEach(() => {
    vi.restoreAllMocks()
})

test('requires a server-issued completion receipt', async () => {
    const submitComment = vi.spyOn(reddit, 'submitComment')

    const response = await withContext(USER_ID, POST_ID, () => requestComment({
        puzzleNumber: 999,
        timeTaken: 1,
    }))

    expect(response.status).toBe(400)
    expect(submitComment).not.toHaveBeenCalled()
})

test('rejects a receipt owned by another player', async () => {
    const completionId = await createReceipt('t2_other')
    const submitComment = vi.spyOn(reddit, 'submitComment')

    const response = await withContext(USER_ID, POST_ID, () => requestComment({ completionId }))

    expect(response.status).toBe(403)
    expect(submitComment).not.toHaveBeenCalled()
})

test('rejects a receipt issued for a different source post', async () => {
    const completionId = await createReceipt(USER_ID, OTHER_POST_ID)
    const submitComment = vi.spyOn(reddit, 'submitComment')

    const response = await withContext(USER_ID, POST_ID, () => requestComment({ completionId }))

    expect(response.status).toBe(403)
    expect(submitComment).not.toHaveBeenCalled()
})

test('derives the public result from the completion snapshot and ignores forged metrics', async () => {
    const completionId = await createReceipt()
    await seedStickyComment()
    vi.spyOn(reddit, 'submitComment').mockResolvedValue({ id: 't1_result' } as never)

    const response = await withContext(USER_ID, POST_ID, () => requestComment({
        completionId,
        commentMessage: 'Big win today!',
        puzzleNumber: 999,
        gridSize: 8,
        skillLevel: 9,
        timeTaken: 1,
        mistakes: 0,
        streak: 999,
        colorGrid: Array.from({ length: 8 }, () => Array(8).fill('red')),
    }))

    expect(response.status).toBe(200)
    expect(reddit.submitComment).toHaveBeenCalledWith({
        id: 't1_sticky123',
        runAs: 'USER',
        text: [
            'Big win today!',
            '',
            'Urjo #42 🧩 4×4 ⭐3',
            '🟥🟦🟥🟦',
            '🟦🟥🟦🟥',
            '🟥🟦🟥🟦',
            '🟦🟥🟦🟥',
            '⏱️ 23s | 🔥 5 streak',
            'Play at r/urjo',
        ].join('\n'),
    })
})

test('returns the finalized comment on retry without posting twice', async () => {
    const completionId = await createReceipt()
    await seedStickyComment()
    const submitComment = vi.spyOn(reddit, 'submitComment')
        .mockResolvedValue({ id: 't1_result' } as never)

    const first = await withContext(USER_ID, POST_ID, () => requestComment({ completionId }))
    const second = await withContext(USER_ID, POST_ID, () => requestComment({ completionId }))

    expect(first.status).toBe(200)
    await expect(second.json()).resolves.toEqual({ success: true, commentId: 't1_result' })
    expect(submitComment).toHaveBeenCalledTimes(1)
})

test('releases the receipt action when Reddit rejects the comment so the player can retry', async () => {
    const completionId = await createReceipt()
    await seedStickyComment()
    const submitComment = vi.spyOn(reddit, 'submitComment')
        .mockRejectedValueOnce(new Error('reddit unavailable'))
        .mockResolvedValueOnce({ id: 't1_result' } as never)

    const first = await withContext(USER_ID, POST_ID, () => requestComment({ completionId }))
    const second = await withContext(USER_ID, POST_ID, () => requestComment({ completionId }))

    expect(first.status).toBe(500)
    expect(second.status).toBe(200)
    expect(submitComment).toHaveBeenCalledTimes(2)
})

