import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit } from '@devvit/web/server'
import { expect, vi } from 'vitest'

import { app } from '../index'
import { URJO_PUZZLE_POST_TYPE, URJO_POST_TYPE_KEY } from '../post'

const test = createDevvitTest({ userId: 't2_testuser', subredditName: 'urjo' })

const makePostCreateBody = (
  postId = 'abc123',
  title = 'Urjo Puzzle - Can you solve it?',
  authorName = 'urjo-game-app'
) => ({
  type: 'PostCreate',
  post: { id: postId, title },
  author: { id: 't2_testuser', name: authorName },
  subreddit: { id: 't5_urjo', name: 'urjo' },
})

test('POST /internal/on-post-create returns 200 with ok status for tagged puzzle posts', async () => {
  vi.spyOn(reddit, 'crosspost').mockResolvedValue({ id: 't3_cross1' } as never)
  vi.spyOn(reddit, 'getAppUser').mockResolvedValue({ username: 'urjo-game-app' } as never)
  await redis.hSet('game:t3_abc123:meta', { [URJO_POST_TYPE_KEY]: URJO_PUZZLE_POST_TYPE })

  const res = await app.request('/internal/on-post-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makePostCreateBody()),
  })

  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body).toEqual({ status: 'ok' })
})

test('POST /internal/on-post-create crossposts tagged app puzzle posts to r/RedditGames', async () => {
  const crosspostSpy = vi.spyOn(reddit, 'crosspost').mockResolvedValue({ id: 't3_cross2' } as never)
  vi.spyOn(reddit, 'getAppUser').mockResolvedValue({ username: 'urjo-game-app' } as never)
  await redis.hSet('game:t3_xyz789:meta', { [URJO_POST_TYPE_KEY]: URJO_PUZZLE_POST_TYPE })

  await app.request('/internal/on-post-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makePostCreateBody('xyz789', 'Test Puzzle')),
  })

  expect(crosspostSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      subredditName: 'RedditGames',
      postId: 't3_xyz789',
      title: 'Test Puzzle',
    })
  )
})

test('POST /internal/on-post-create skips non-puzzle posts', async () => {
  const crosspostSpy = vi.spyOn(reddit, 'crosspost').mockResolvedValue({ id: 't3_cross3' } as never)
  vi.spyOn(reddit, 'getAppUser').mockResolvedValue({ username: 'urjo-game-app' } as never)

  const res = await app.request('/internal/on-post-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makePostCreateBody('post123', 'Moderator Update')),
  })

  expect(res.status).toBe(200)
  expect(crosspostSpy).not.toHaveBeenCalled()
})

test('POST /internal/on-post-create skips posts not created by the app user', async () => {
  const crosspostSpy = vi.spyOn(reddit, 'crosspost').mockResolvedValue({ id: 't3_cross4' } as never)
  vi.spyOn(reddit, 'getAppUser').mockResolvedValue({ username: 'urjo-game-app' } as never)
  await redis.hSet('game:t3_post123:meta', { [URJO_POST_TYPE_KEY]: URJO_PUZZLE_POST_TYPE })

  const res = await app.request('/internal/on-post-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makePostCreateBody('post123', 'My Puzzle Title', 'different-user')),
  })

  expect(res.status).toBe(200)
  expect(crosspostSpy).not.toHaveBeenCalled()
})

test('POST /internal/on-post-create returns 500 when qualifying crosspost fails', async () => {
  vi.spyOn(reddit, 'crosspost').mockRejectedValue(new Error('crosspost failed'))
  vi.spyOn(reddit, 'getAppUser').mockResolvedValue({ username: 'urjo-game-app' } as never)
  await redis.hSet('game:t3_abc123:meta', { [URJO_POST_TYPE_KEY]: URJO_PUZZLE_POST_TYPE })

  const res = await app.request('/internal/on-post-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makePostCreateBody()),
  })

  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({ status: 'error', message: 'crosspost failed' })
})

test('POST /internal/on-post-create skips posts that were already crossposted', async () => {
  const crosspostSpy = vi.spyOn(reddit, 'crosspost').mockResolvedValue({ id: 't3_cross6' } as never)
  vi.spyOn(reddit, 'getAppUser').mockResolvedValue({ username: 'urjo-game-app' } as never)
  await redis.hSet('game:t3_repeat123:meta', {
    [URJO_POST_TYPE_KEY]: URJO_PUZZLE_POST_TYPE,
    redditGamesCrosspostId: 't3_existing',
  })

  const res = await app.request('/internal/on-post-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makePostCreateBody('repeat123', 'Repeat Puzzle')),
  })

  expect(res.status).toBe(200)
  expect(crosspostSpy).not.toHaveBeenCalled()
})

test('POST /internal/on-post-create stores the created crosspost id for dedupe', async () => {
  vi.spyOn(reddit, 'crosspost').mockResolvedValue({ id: 't3_cross7' } as never)
  vi.spyOn(reddit, 'getAppUser').mockResolvedValue({ username: 'urjo-game-app' } as never)
  await redis.hSet('game:t3_store123:meta', { [URJO_POST_TYPE_KEY]: URJO_PUZZLE_POST_TYPE })

  const res = await app.request('/internal/on-post-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makePostCreateBody('store123', 'Store Puzzle')),
  })

  expect(res.status).toBe(200)
  const meta = await redis.hGetAll('game:t3_store123:meta')
  expect(meta.redditGamesCrosspostId).toBe('t3_cross7')
})

test('POST /internal/on-post-create returns 200 when post payload is missing', async () => {
  vi.spyOn(reddit, 'crosspost').mockResolvedValue({ id: 't3_cross5' } as never)

  const res = await app.request('/internal/on-post-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'PostCreate' }),
  })

  expect(res.status).toBe(200)
})
