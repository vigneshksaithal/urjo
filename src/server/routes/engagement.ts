/**
 * Engagement API Routes
 * Handles achievements endpoint.
 */

import { Hono } from 'hono'
import { context } from '@devvit/web/server'
import { ACHIEVEMENT_DEFS } from '../../shared/engagement-constants'
import { getUnlockedAchievements } from '../lib/achievements'

export const engagementRouter = new Hono()

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
