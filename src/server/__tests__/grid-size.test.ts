/**
 * Integration tests for grid-size-aware routes
 * Requirements: 1.1, 1.4, 1.5, 4.1, 5.1, 7.1
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit } from '@devvit/web/server'
import { runWithContext } from '@devvit/server'
import { expect, vi } from 'vitest'

import { app } from '../index'

// ─── Test contexts ────────────────────────────────────────────────────────────

const test = createDevvitTest({ userId: 't2_griduser', subredditName: 'urjo' })

/**
 * Run a request with an explicit postId/userId injected into the Devvit context.
 */
const withContext = <T>(postId: string, userId: string, fn: () => Promise<T>): Promise<T> =>
    runWithContext(
        { postId, userId, subredditName: 'urjo', subredditId: 't5_urjo' } as Parameters<typeof runWithContext>[0],
        fn
    )

// ─── Request helpers ──────────────────────────────────────────────────────────

const gridSizeRequest = (body: object) =>
    app.request('/api/game/grid-size', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

const gameStateRequest = () =>
    app.request('/api/game/state', { method: 'GET' })

const completeRequest = (body: object = { mistakes: 0 }) =>
    app.request('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

const nextChallengeRequest = (body: object = {}) =>
    app.request('/api/game/next-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

const leaderboardRequest = (type: string) =>
    app.request(`/api/game/leaderboard?type=${type}`, { method: 'GET' })

// ─── Seed helpers ─────────────────────────────────────────────────────────────

const seedPuzzle = async (postId: string, gridSize = 4) => {
    const colors = gridSize === 4 ? 'rbrbrbrbrbrbrbrb' : 'r'.repeat(gridSize * gridSize)
    await redis.hSet(`game:${postId}:puzzle`, {
        colors,
        numbers: '-'.repeat(gridSize * gridSize),
        solution: colors,
        difficulty: 'easy',
        gridSize: gridSize.toString(),
    })
}

const seedStartTime = async (userId: string, postId: string, secondsAgo = 30) => {
    await redis.set(
        `user:${userId}:puzzleStartTime:${postId}`,
        (Date.now() - secondsAgo * 1000).toString()
    )
}

// ─── POST /api/game/grid-size — valid sizes ───────────────────────────────────

test('POST /api/game/grid-size returns 200 for valid size 4', async () => {
    const postId = 't3_gs_valid4'
    await seedPuzzle(postId, 4)

    const res = await withContext(postId, 't2_griduser', () => gridSizeRequest({ gridSize: 4 }))
    expect(res.status).toBe(200)

    const body = await res.json() as { puzzle: { gridSize: number }; skillLevel: number; gridSizePreference: number }
    expect(body.gridSizePreference).toBe(4)
    expect(body.skillLevel).toBe(1)
    expect(body.puzzle.gridSize).toBe(4)
})

test('POST /api/game/grid-size returns 200 for valid size 6', async () => {
    const postId = 't3_gs_valid6'
    await seedPuzzle(postId, 6)

    const res = await withContext(postId, 't2_griduser', () => gridSizeRequest({ gridSize: 6 }))
    expect(res.status).toBe(200)

    const body = await res.json() as { puzzle: { gridSize: number }; gridSizePreference: number }
    expect(body.gridSizePreference).toBe(6)
    expect(body.puzzle.gridSize).toBe(6)
})

test('POST /api/game/grid-size returns 200 for valid size 8', async () => {
    const postId = 't3_gs_valid8'
    await seedPuzzle(postId, 8)

    const res = await withContext(postId, 't2_griduser', () => gridSizeRequest({ gridSize: 8 }))
    expect(res.status).toBe(200)

    const body = await res.json() as { puzzle: { gridSize: number }; gridSizePreference: number }
    expect(body.gridSizePreference).toBe(8)
    expect(body.puzzle.gridSize).toBe(8)
})

// ─── POST /api/game/grid-size — invalid size ──────────────────────────────────

test('POST /api/game/grid-size returns 400 for invalid size 5', async () => {
    const postId = 't3_gs_invalid5'
    await seedPuzzle(postId, 4)

    const res = await withContext(postId, 't2_griduser', () => gridSizeRequest({ gridSize: 5 }))
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toContain('Invalid grid size')
})

test('POST /api/game/grid-size returns 400 for invalid size 0', async () => {
    const postId = 't3_gs_invalid0'
    await seedPuzzle(postId, 4)

    const res = await withContext(postId, 't2_griduser', () => gridSizeRequest({ gridSize: 0 }))
    expect(res.status).toBe(400)
})

test('POST /api/game/grid-size persists preference to Redis', async () => {
    const postId = 't3_gs_persist'
    await seedPuzzle(postId, 6)

    await withContext(postId, 't2_griduser', () => gridSizeRequest({ gridSize: 6 }))

    const stored = await redis.get('user:t2_griduser:gridSizePreference')
    expect(stored).toBe('6')
})

// ─── GET /api/game/state — migration for old users ────────────────────────────

test('GET /api/game/state triggers migration for old users without gridMigrated flag', async () => {
    const postId = 't3_state_migrate'
    await seedPuzzle(postId, 4)

    // Seed old global skill level (level 5 → should migrate to 6×6 level 2)
    await redis.set('user:t2_griduser:skillLevel', '5')
    // No gridMigrated flag set

    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'griduser' } as never)

    const res = await withContext(postId, 't2_griduser', gameStateRequest)
    expect(res.status).toBe(200)

    // Migration should have run
    const migrated = await redis.get('user:t2_griduser:gridMigrated')
    expect(migrated).toBe('true')

    // Grid size preference should be set to 6 (old level 5 → 6×6)
    const pref = await redis.get('user:t2_griduser:gridSizePreference')
    expect(pref).toBe('6')

    // Per-grid skill level should be set to 2 (old level 5 → 6×6 level 2)
    const perGridLevel = await redis.get('user:t2_griduser:skillLevel:6')
    expect(perGridLevel).toBe('2')
})

test('GET /api/game/state includes gridSizePreference in response', async () => {
    const postId = 't3_state_pref'
    await seedPuzzle(postId, 4)

    // Pre-set preference and migration flag
    await redis.set('user:t2_griduser:gridSizePreference', '6')
    await redis.set('user:t2_griduser:gridMigrated', 'true')
    await redis.set('user:t2_griduser:skillLevel:6', '2')

    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'griduser' } as never)

    const res = await withContext(postId, 't2_griduser', gameStateRequest)
    expect(res.status).toBe(200)

    const body = await res.json() as { gridSizePreference: number; skillLevel: number }
    expect(body.gridSizePreference).toBe(6)
    expect(body.skillLevel).toBe(2)
})

test('GET /api/game/state uses baked-in grid size for challenge posts', async () => {
    const postId = 't3_state_challenge'

    // Seed a 6×6 challenge puzzle
    const colors6 = 'r'.repeat(36)
    await redis.hSet(`game:${postId}:puzzle`, {
        colors: colors6,
        numbers: '-'.repeat(36),
        solution: colors6,
        difficulty: 'easy',
        gridSize: '6',
        challengeBy: 't2_challenger',
        challengeScore: '60',
    })

    // User prefers 4×4
    await redis.set('user:t2_griduser:gridSizePreference', '4')
    await redis.set('user:t2_griduser:gridMigrated', 'true')
    await redis.set('user:t2_griduser:skillLevel:4', '1')
    await redis.set('user:t2_griduser:skillLevel:6', '3')

    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'griduser' } as never)

    const res = await withContext(postId, 't2_griduser', gameStateRequest)
    expect(res.status).toBe(200)

    const body = await res.json() as { puzzle: { gridSize: number }; skillLevel: number; gridSizePreference: number }
    // Challenge post: puzzle grid size is 6 (baked in), skill level from 6×6 ladder
    expect(body.puzzle.gridSize).toBe(6)
    expect(body.skillLevel).toBe(3)
    // gridSizePreference still reflects user's stored preference
    expect(body.gridSizePreference).toBe(4)
})

// ─── POST /api/game/complete — per-grid skill level update ────────────────────

test('POST /api/game/complete updates per-grid skill level only', async () => {
    const postId = 't3_complete_grid'
    const userId = 't2_griduser'

    // Seed a 6×6 puzzle as the current puzzle
    const colors6 = 'r'.repeat(36)
    await redis.hSet(`user:${userId}:game:${postId}:currentPuzzle`, {
        colors: colors6,
        numbers: '-'.repeat(36),
        solution: colors6,
        difficulty: 'easy',
        gridSize: '6',
    })
    await redis.hSet(`game:${postId}:puzzle`, {
        colors: colors6,
        numbers: '-'.repeat(36),
        solution: colors6,
        difficulty: 'easy',
        gridSize: '6',
    })

    // Set initial per-grid skill levels
    await redis.set(`user:${userId}:skillLevel:4`, '2')
    await redis.set(`user:${userId}:skillLevel:6`, '1')

    await seedStartTime(userId, postId, 30)

    const res = await withContext(postId, userId, () => completeRequest({ timeTaken: 30, mistakes: 0 }))
    expect(res.status).toBe(200)

    // 6×6 skill level may have changed (adaptive)
    const level6 = await redis.get(`user:${userId}:skillLevel:6`)
    expect(level6).toBeDefined()

    // 4×4 skill level must remain unchanged
    const level4 = await redis.get(`user:${userId}:skillLevel:4`)
    expect(level4).toBe('2')
})

test('POST /api/game/complete records speed to grid-size-scoped leaderboard', async () => {
    const postId = 't3_complete_lb'
    const userId = 't2_griduser'

    // Seed a 6×6 puzzle
    const colors6 = 'r'.repeat(36)
    await redis.hSet(`user:${userId}:game:${postId}:currentPuzzle`, {
        colors: colors6,
        numbers: '-'.repeat(36),
        solution: colors6,
        difficulty: 'easy',
        gridSize: '6',
    })
    await redis.hSet(`game:${postId}:puzzle`, {
        colors: colors6,
        numbers: '-'.repeat(36),
        solution: colors6,
        difficulty: 'easy',
        gridSize: '6',
    })

    await seedStartTime(userId, postId, 45)

    const res = await withContext(postId, userId, () => completeRequest({ timeTaken: 30, mistakes: 0 }))
    expect(res.status).toBe(200)

    // Speed entry should be in the 6×6 leaderboard
    const today = new Date().toISOString().split('T')[0]!
    const entries6 = await redis.zRange(`leaderboard:speed:${today}:6`, 0, 9, { by: 'rank' })
    expect(entries6.some((e) => e.member === userId)).toBe(true)

    // Speed entry should NOT be in the 4×4 leaderboard
    const entries4 = await redis.zRange(`leaderboard:speed:${today}:4`, 0, 9, { by: 'rank' })
    expect(entries4.some((e) => e.member === userId)).toBe(false)
})

// ─── POST /api/game/next-challenge — uses grid size preference ────────────────

test('POST /api/game/next-challenge uses grid size preference', async () => {
    const postId = 't3_next_grid'
    const userId = 't2_griduser'

    // Set preference to 8×8
    await redis.set(`user:${userId}:gridSizePreference`, '8')
    await redis.set(`user:${userId}:skillLevel:8`, '2')

    await seedPuzzle(postId, 8)

    const res = await withContext(postId, userId, () => nextChallengeRequest({ timeSpent: 10 }))
    expect(res.status).toBe(200)

    const body = await res.json() as { puzzle: { gridSize: number }; skillLevel: number; gridSizePreference: number }
    expect(body.puzzle.gridSize).toBe(8)
    expect(body.gridSizePreference).toBe(8)
})

test('POST /api/game/next-challenge records skip in per-grid history', async () => {
    const postId = 't3_next_history'
    const userId = 't2_griduser'

    // Set preference to 6×6
    await redis.set(`user:${userId}:gridSizePreference`, '6')
    await redis.set(`user:${userId}:skillLevel:6`, '1')

    await seedPuzzle(postId, 6)

    await withContext(postId, userId, () => nextChallengeRequest({ timeSpent: 5 }))

    // History for 6×6 should have a skip record
    const history6 = await redis.get(`user:${userId}:history:6`)
    expect(history6).toBeDefined()
    const parsed = JSON.parse(history6!) as Array<{ skipped?: boolean }>
    expect(parsed.some((r) => r.skipped === true)).toBe(true)

    // History for 4×4 should remain empty
    const history4 = await redis.get(`user:${userId}:history:4`)
    expect(history4).toBeUndefined()
})

// ─── GET /api/game/leaderboard — speed scoped by grid size ───────────────────

test('GET /api/game/leaderboard speed type returns entries for user grid size preference', async () => {
    const userId = 't2_griduser'
    const today = new Date().toISOString().split('T')[0]!

    // Set preference to 6×6
    await redis.set(`user:${userId}:gridSizePreference`, '6')

    // Seed entries in 6×6 leaderboard
    await redis.zAdd(`leaderboard:speed:${today}:6`, { member: userId, score: 45 })
    await redis.zAdd(`leaderboard:speed:${today}:6`, { member: 't2_other', score: 60 })

    // Seed entries in 4×4 leaderboard (should NOT appear)
    await redis.zAdd(`leaderboard:speed:${today}:4`, { member: 't2_another', score: 30 })

    const res = await withContext('t3_lb_speed', userId, () => leaderboardRequest('speed'))
    expect(res.status).toBe(200)

    const body = await res.json() as { type: string; entries: Array<{ userId: string }> }
    expect(body.type).toBe('speed')

    // Should contain 6×6 entries
    const memberIds = body.entries.map((e) => e.userId)
    expect(memberIds).toContain(userId)
    expect(memberIds).toContain('t2_other')

    // Should NOT contain 4×4-only entries
    expect(memberIds).not.toContain('t2_another')
})

test('GET /api/game/leaderboard streak type remains global (not grid-scoped)', async () => {
    const userId = 't2_griduser'

    // Set preference to 8×8
    await redis.set(`user:${userId}:gridSizePreference`, '8')

    // Seed global streak leaderboard
    await redis.zAdd('leaderboard:streak', { member: userId, score: 15 })
    await redis.zAdd('leaderboard:streak', { member: 't2_streaker', score: 20 })

    const res = await withContext('t3_lb_streak', userId, () => leaderboardRequest('streak'))
    expect(res.status).toBe(200)

    const body = await res.json() as { type: string; entries: Array<{ userId: string }> }
    expect(body.type).toBe('streak')

    const memberIds = body.entries.map((e) => e.userId)
    expect(memberIds).toContain(userId)
    expect(memberIds).toContain('t2_streaker')
})
