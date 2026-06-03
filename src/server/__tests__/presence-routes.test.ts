/**
 * Integration tests for presence API routes.
 * Tests heartbeat endpoint with username resolution and error handling.
 * Requirements: 4
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { reddit, runWithContext } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { app } from '../index'

// ─── Helper: run with Devvit context ──────────────────────────────────────────

const withCtx = <T>(
    overrides: { userId?: string; postId?: string },
    fn: () => Promise<T>,
): Promise<T> =>
    runWithContext(
        {
            userId: overrides.userId,
            postId: overrides.postId,
            subredditId: 't5_testsub',
            subredditName: 'testsub',
        } as Parameters<typeof runWithContext>[0],
        fn,
    )

// ─── POST /api/presence/heartbeat — returns presence data with usernames ──────

const testHeartbeat = createDevvitTest({
    userId: 't2_player1',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testHeartbeat('POST /api/presence/heartbeat returns presence data with resolved usernames', async () => {
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'player_one' } as never)

    const res = await withCtx(
        { userId: 't2_player1', postId: 't3_testpost' },
        () =>
            app.request('/api/presence/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postId: 't3_testpost' }),
            }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
        activeCount: number
        players: Array<{ userId: string; username: string }>
    }
    expect(body.activeCount).toBeGreaterThanOrEqual(1)
    expect(body.players).toHaveLength(1)
    expect(body.players[0]!.userId).toBe('t2_player1')
    expect(body.players[0]!.username).toBe('player_one')

    vi.restoreAllMocks()
})

// ─── POST /api/presence/heartbeat — returns 400 without postId ─────────────────

const testHeartbeatNoPostId = createDevvitTest({
    userId: 't2_player1',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testHeartbeatNoPostId('POST /api/presence/heartbeat returns 400 when postId is missing', async () => {
    const res = await withCtx(
        { userId: 't2_player1', postId: 't3_testpost' },
        () =>
            app.request('/api/presence/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            }),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as { status: string; message: string }
    expect(body.status).toBe('error')
    expect(body.message).toContain('postId')
})

// ─── POST /api/presence/heartbeat — returns 400 without userId ─────────────────

const testHeartbeatNoUser = createDevvitTest({
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testHeartbeatNoUser('POST /api/presence/heartbeat returns 400 when user is not logged in', async () => {
    const res = await withCtx(
        { postId: 't3_testpost' },
        () =>
            app.request('/api/presence/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postId: 't3_testpost' }),
            }),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as { status: string; message: string }
    expect(body.status).toBe('error')
})

// ─── POST /api/presence/heartbeat — falls back to userId when username fetch fails

const testHeartbeatUsernameFallback = createDevvitTest({
    userId: 't2_fallback',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testHeartbeatUsernameFallback('POST /api/presence/heartbeat uses userId as fallback when username resolution fails', async () => {
    vi.spyOn(reddit, 'getUserById').mockRejectedValue(new Error('API error'))

    const res = await withCtx(
        { userId: 't2_fallback', postId: 't3_testpost' },
        () =>
            app.request('/api/presence/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postId: 't3_testpost' }),
            }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
        players: Array<{ userId: string; username: string }>
    }
    // Falls back to userId when Reddit API fails
    expect(body.players[0]!.username).toBe('t2_fallback')

    vi.restoreAllMocks()
})
