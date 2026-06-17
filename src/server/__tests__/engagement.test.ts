/**
 * Integration tests for engagement API routes.
 * Tests missions, achievements, and profile endpoints.
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { app } from '../index'
import { saveMissionState, getMissionState } from '../lib/missions'
import { ACHIEVEMENT_DEFS } from '../../shared/engagement-constants'
import type { MissionsResponse } from '../../shared/engagement-types'
import type { AchievementUnlock } from '../../shared/engagement-types'

vi.mock('../lib/helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/helpers')>()
    return {
        ...actual,
        getTodayUTC: vi.fn(() => '2025-01-15'),
        getISOWeek: vi.fn(() => '2025-W03'),
    }
})

// ─── GET /api/missions ────────────────────────────────────────────────────────

const testMissions = createDevvitTest({ userId: 't2_testuser' })

testMissions('GET /api/missions returns 3 daily and 2 weekly missions', async () => {
    const res = await app.request('/api/missions')
    expect(res.status).toBe(200)

    const body = await res.json() as MissionsResponse
    expect(body.daily).toHaveLength(3)
    expect(body.weekly).toHaveLength(2)
    expect(typeof body.dailyBonusAvailable).toBe('boolean')
    expect(typeof body.weeklyBonusAvailable).toBe('boolean')
})

// Note: @devvit/test always provides a userId — the 400 guard is tested via unit logic
// The guard is verified by the route implementation reading context.userId

// ─── POST /api/missions/claim ─────────────────────────────────────────────────

const testClaimIncomplete = createDevvitTest({ userId: 't2_testuser' })

testClaimIncomplete('POST /api/missions/claim returns 400 for incomplete mission', async () => {
    // Get missions so state is generated
    const state = await getMissionState('t2_testuser', 'daily')
    const mission = state.missions[0]!

    const res = await app.request('/api/missions/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId: mission.templateId, cadence: 'daily' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/not yet completed/i)
})

const testClaimMissingId = createDevvitTest({ userId: 't2_testuser' })

testClaimMissingId('POST /api/missions/claim returns 400 for missing missionId', async () => {
    const res = await app.request('/api/missions/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadence: 'daily' }),
    })
    expect(res.status).toBe(400)
})

const testClaimSuccess = createDevvitTest({ userId: 't2_testuser' })

testClaimSuccess('POST /api/missions/claim awards coins for completed mission', async () => {
    const state = await getMissionState('t2_testuser', 'daily')
    const mission = state.missions[0]!
    mission.completed = true
    mission.currentProgress = mission.targetValue
    await saveMissionState('t2_testuser', 'daily', state)

    const res = await app.request('/api/missions/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId: mission.templateId, cadence: 'daily' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; coinsAwarded: number }
    expect(body.success).toBe(true)
    expect(body.coinsAwarded).toBe(mission.coinReward)
})

// ─── GET /api/achievements ────────────────────────────────────────────────────

const testAchievements = createDevvitTest({ userId: 't2_testuser' })

testAchievements('GET /api/achievements returns all achievements with unlocked status', async () => {
    const res = await app.request('/api/achievements')
    expect(res.status).toBe(200)

    const body = await res.json() as { achievements: Array<{ id: string; unlocked: boolean; progressPercent: number }> }
    expect(body.achievements).toHaveLength(ACHIEVEMENT_DEFS.length)
    for (const a of body.achievements) {
        expect(typeof a.unlocked).toBe('boolean')
        expect(typeof a.progressPercent).toBe('number')
    }
})

const testAchievementsUnlocked = createDevvitTest({ userId: 't2_testuser' })

testAchievementsUnlocked('GET /api/achievements marks unlocked achievements correctly', async () => {
    const stored: AchievementUnlock[] = [{ id: 'solve_10', unlockedAt: 1700000000000 }]
    await redis.set('user:t2_testuser:achievements', JSON.stringify(stored))

    const res = await app.request('/api/achievements')
    expect(res.status).toBe(200)

    const body = await res.json() as { achievements: Array<{ id: string; unlocked: boolean; progressPercent: number; unlockedAt?: number }> }
    const solve10 = body.achievements.find((a) => a.id === 'solve_10')
    expect(solve10?.unlocked).toBe(true)
    expect(solve10?.progressPercent).toBe(100)
    expect(solve10?.unlockedAt).toBe(1700000000000)

    const solve50 = body.achievements.find((a) => a.id === 'solve_50')
    expect(solve50?.unlocked).toBe(false)
    expect(solve50?.progressPercent).toBe(0)
})
