import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { expect } from 'vitest'

import { app } from '../index'

const test = createDevvitTest({
    userId: 't2_testuser',
    subredditName: 'urjo',
    subredditId: 't5_urjo',
})

const postDeleteRequest = (postId: string): Promise<Response> =>
    app.request('/internal/on-post-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'PostDelete',
            postId,
        }),
    })

const commentDeleteRequest = (postId: string, commentId: string): Promise<Response> =>
    app.request('/internal/on-comment-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'CommentDelete',
            postId,
            commentId,
            parentId: postId,
        }),
    })

test('POST /internal/on-post-delete removes post-scoped game data', async () => {
    const postId = 't3_deletedpost'

    await redis.hSet(`game:${postId}:puzzle`, {
        challengeBy: 't2_creator',
        challengeByUsername: 'creator',
        challengeByAvatar: 'https://img/avatar.png',
    })
    await redis.hSet(`game:${postId}:meta`, {
        stickyCommentId: 't1_sticky',
        leaderboardCommentId: 't1_sticky',
    })
    await redis.hSet(`game:${postId}:stats`, { attempts: '3', beats: '1' })
    await redis.hSet(`game:${postId}:preview`, {
        type: 'challenge',
        data: '{"challengerUsername":"creator"}',
    })
    await redis.zAdd(`challenge:${postId}:beat_events`, {
        member: 't2_winner:123',
        score: 123,
    })
    await redis.set(`viral:challenge:${postId}:created_at`, '123')
    await redis.set(`referral:${postId}:count`, '1')

    const res = await postDeleteRequest(postId)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(await redis.hGetAll(`game:${postId}:puzzle`)).toEqual({})
    expect(await redis.hGetAll(`game:${postId}:meta`)).toEqual({})
    expect(await redis.hGetAll(`game:${postId}:stats`)).toEqual({})
    expect(await redis.hGetAll(`game:${postId}:preview`)).toEqual({})
    expect(await redis.zRange(`challenge:${postId}:beat_events`, 0, -1, { by: 'rank' })).toEqual([])
    expect(await redis.get(`viral:challenge:${postId}:created_at`)).toBeUndefined()
    expect(await redis.get(`referral:${postId}:count`)).toBeUndefined()
})

test('POST /internal/on-comment-delete clears stored sticky comment references', async () => {
    const postId = 't3_commentpost'
    const commentId = 't1_deletedsticky'

    await redis.hSet(`game:${postId}:meta`, {
        stickyCommentId: commentId,
        leaderboardCommentId: commentId,
        postType: 'urjo-puzzle',
    })

    const res = await commentDeleteRequest(postId, commentId)

    expect(res.status).toBe(200)
    const meta = await redis.hGetAll(`game:${postId}:meta`)
    expect(meta['postType']).toBe('urjo-puzzle')
    expect(meta['stickyCommentId']).toBeUndefined()
    expect(meta['leaderboardCommentId']).toBeUndefined()
})

test('POST /internal/on-comment-delete leaves unrelated comment references intact', async () => {
    const postId = 't3_unrelatedcommentpost'

    await redis.hSet(`game:${postId}:meta`, {
        stickyCommentId: 't1_sticky',
        leaderboardCommentId: 't1_leaderboard',
    })

    const res = await commentDeleteRequest(postId, 't1_other')

    expect(res.status).toBe(200)
    const meta = await redis.hGetAll(`game:${postId}:meta`)
    expect(meta['stickyCommentId']).toBe('t1_sticky')
    expect(meta['leaderboardCommentId']).toBe('t1_leaderboard')
})
