/**
 * Integration tests for season API routes.
 * Tests player-facing season info and leaderboard endpoints.
 * Requirements: 5.4, 5.6
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit as webReddit, runWithContext } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { app } from '../index'
import { getCurrentSeason } from '../lib/seasons'
import type { SeasonInfo, SeasonLeaderboardResponse } from '../../shared/growth-types'

// ─── Helper: run with Devvit context ──────────────────────────────────────────

const withCtx = <T>(
    overrides: { userId?: string; subredditId?: string; subredditName?: string },
    fn: () => Promise<T>,
): Promise<T> =>
    runWithContext(
        {
            userId: overrides.userId,
            subredditId: overrides.subredditId ?? 't5_testsub',
            subredditName: overrides.subredditName ?? 'testsub',
        } as Parameters<typeof runWithContext>[0],
        fn,
    )

const CTX = { userId: 't2_player1', subredditId: 't5_testsub', subredditName: 'testsub' }

// ─── GET /api/season/current — returns season info with player data ───────────

const testSeasonCurrent = createDevvitTest({
    userId: 't2_player1',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testSeasonCurrent('GET /api/season/current returns season info with player score and rank', async () => {
    const season = getCurrentSeason()
    const leaderboardKey = `season:${season.seasonId}:leaderboard`

    await withCtx(CTX, async () => {
        await redis.zAdd(leaderboardKey, { member: 't2_player1', score: 50 })
        await redis.zAdd(leaderboardKey, { member: 't2_player2', score: 100 })
    })

    const res = await withCtx(CTX, () => app.request('/api/season/current'))
    expect(res.status).toBe(200)

    const body = await res.json() as { status: string; data: { season: SeasonInfo; playerScore: number; playerRank: number | null } }
    expect(body.status).toBe('success')
    expect(body.data.season).toHaveProperty('seasonId')
    expect(body.data.season).toHaveProperty('startDate')
    expect(body.data.season).toHaveProperty('endDate')
    expect(body.data.season).toHaveProperty('isActive')
    expect(body.data.playerScore).toBe(50)
    expect(body.data.playerRank).toBe(2) // player2 has higher score
})

// ─── GET /api/season/current — returns zero score for new player ──────────────

const testSeasonCurrentNew = createDevvitTest({
    userId: 't2_newplayer',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testSeasonCurrentNew('GET /api/season/current returns zero score for new player', async () => {
    const res = await withCtx(
        { userId: 't2_newplayer', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/season/current'),
    )
    expect(res.status).toBe(200)

    const body = await res.json() as { status: string; data: { playerScore: number; playerRank: number | null } }
    expect(body.status).toBe('success')
    expect(body.data.playerScore).toBe(0)
    expect(body.data.playerRank).toBeNull()
})

// ─── GET /api/season/leaderboard — returns top 50 entries ─────────────────────

const testLeaderboard = createDevvitTest({
    userId: 't2_player1',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testLeaderboard('GET /api/season/leaderboard returns leaderboard with player rank', async () => {
    const season = getCurrentSeason()
    const leaderboardKey = `season:${season.seasonId}:leaderboard`

    // Mock fetchUsername dependency (reddit.getUserById)
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'test_user' } as never)

    await withCtx(CTX, async () => {
        await redis.zAdd(leaderboardKey, { member: 't2_player1', score: 75 })
        await redis.zAdd(leaderboardKey, { member: 't2_player2', score: 150 })
        await redis.zAdd(leaderboardKey, { member: 't2_player3', score: 100 })
    })

    const res = await withCtx(CTX, () => app.request('/api/season/leaderboard'))
    expect(res.status).toBe(200)

    const body = await res.json() as { status: string; data: SeasonLeaderboardResponse }
    expect(body.status).toBe('success')
    expect(body.data.season).toHaveProperty('seasonId')
    expect(body.data.entries.length).toBeGreaterThanOrEqual(3)

    // Entries should be sorted by score descending
    expect(body.data.entries[0]!.score).toBeGreaterThanOrEqual(body.data.entries[1]!.score)

    // Player rank and score should be present
    expect(body.data.playerScore).toBe(75)
    expect(body.data.playerRank).toBeDefined()

    vi.restoreAllMocks()
})
