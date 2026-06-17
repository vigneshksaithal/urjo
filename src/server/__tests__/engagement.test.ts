/**
 * Integration tests for engagement API routes.
 * Tests achievements endpoint.
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { expect } from 'vitest'
import { app } from '../index'
import { ACHIEVEMENT_DEFS } from '../../shared/engagement-constants'
import type { AchievementUnlock } from '../../shared/engagement-types'

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
