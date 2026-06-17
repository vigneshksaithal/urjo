/**
 * Engagement API Routes
 * Handles missions, achievements, and profile endpoints.
 */

import { Hono } from 'hono'
import { context } from '@devvit/web/server'
import type { MissionsResponse } from '../../shared/engagement-types'
import { ACHIEVEMENT_DEFS } from '../../shared/engagement-constants'
import { getMissionState, claimMission } from '../lib/missions'
import { getUnlockedAchievements } from '../lib/achievements'

export const engagementRouter = new Hono()

// ─── GET /api/missions ────────────────────────────────────────────────────────

engagementRouter.get('/api/missions', async (c) => {
    const { userId } = context
    if (!userId) return c.json({ error: 'User ID required' }, 400)

    try {
        const [dailyState, weeklyState] = await Promise.all([
            getMissionState(userId, 'daily'),
            getMissionState(userId, 'weekly'),
        ])

        const allDailyComplete = dailyState.missions.every((m) => m.completed)
        const allWeeklyComplete = weeklyState.missions.every((m) => m.completed)

        const response: MissionsResponse = {
            daily: dailyState.missions,
            weekly: weeklyState.missions,
            dailyBonusAvailable: allDailyComplete && !dailyState.allCompleteBonusClaimed,
            weeklyBonusAvailable: allWeeklyComplete && !weeklyState.allCompleteBonusClaimed,
        }

        return c.json(response)
    } catch (error) {
        console.error('Error fetching missions:', error)
        return c.json({ error: 'Failed to fetch missions' }, 500)
    }
})

// ─── POST /api/missions/claim ─────────────────────────────────────────────────

engagementRouter.post('/api/missions/claim', async (c) => {
    const { userId } = context
    if (!userId) return c.json({ error: 'User ID required' }, 400)

    try {
        const body = await c.req.json<{ missionId?: string; cadence?: string }>()
        const { missionId, cadence } = body

        if (!missionId) return c.json({ error: 'missionId is required' }, 400)
        if (cadence !== 'daily' && cadence !== 'weekly') {
            return c.json({ error: 'cadence must be "daily" or "weekly"' }, 400)
        }

        const result = await claimMission(userId, missionId, cadence)
        return c.json({ success: true, coinsAwarded: result.coinsAwarded })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to claim mission'
        return c.json({ error: message }, 400)
    }
})

// ─── GET /api/achievements ────────────────────────────────────────────────────

engagementRouter.get('/api/achievements', async (c) => {
    const { userId } = context
    if (!userId) return c.json({ error: 'User ID required' }, 400)

    try {
        const unlocked = await getUnlockedAchievements(userId)
        const unlockedMap = new Map(unlocked.map((u) => [u.id, u.unlockedAt]))

        const achievements = ACHIEVEMENT_DEFS.map((def) => {
            const unlockedAt = unlockedMap.get(def.id)
            const isUnlocked = unlockedAt !== undefined
            return {
                ...def,
                unlocked: isUnlocked,
                ...(isUnlocked && { unlockedAt }),
                progressPercent: isUnlocked ? 100 : 0,
            }
        })

        return c.json({ achievements })
    } catch (error) {
        console.error('Error fetching achievements:', error)
        return c.json({ error: 'Failed to fetch achievements' }, 500)
    }
})
