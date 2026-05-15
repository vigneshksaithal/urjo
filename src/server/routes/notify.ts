/**
 * Notify API Routes
 * Handles opt-in and opt-out for the Tomorrow-Trigger daily mention feature.
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 19.1
 */

import { Hono } from 'hono'
import { context } from '@devvit/web/server'
import { addOptIn, removeOptIn } from '../lib/notify'

const HTTP_STATUS_UNAUTHORIZED = 401

export const notifyRouter = new Hono()

// ─── POST /api/game/notify/opt-in ─────────────────────────────────────────────

notifyRouter.post('/api/game/notify/opt-in', async (c) => {
    const { userId } = context

    if (!userId) {
        return c.json({ error: 'Authentication required' }, HTTP_STATUS_UNAUTHORIZED)
    }

    try {
        await addOptIn(userId)
        return c.json({ optedIn: true })
    } catch (error) {
        console.error('[Notify] Opt-in failed:', error)
        return c.json({ error: 'Failed to opt in' }, 500)
    }
})

// ─── POST /api/game/notify/opt-out ────────────────────────────────────────────

notifyRouter.post('/api/game/notify/opt-out', async (c) => {
    const { userId } = context

    if (!userId) {
        return c.json({ error: 'Authentication required' }, HTTP_STATUS_UNAUTHORIZED)
    }

    try {
        await removeOptIn(userId)
        return c.json({ optedIn: false })
    } catch (error) {
        console.error('[Notify] Opt-out failed:', error)
        return c.json({ error: 'Failed to opt out' }, 500)
    }
})
