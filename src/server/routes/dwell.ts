/**
 * Dwell API Routes
 *
 * Single endpoint: POST /api/dwell/tick
 *
 * The client posts elapsed active-foreground seconds every 5s. The server
 * accumulates these into the session-flag hash, evaluates the DQP gate,
 * and commits bounded analytics when all three flags
 * (referrer + first-tap + dwell ≥ 20s) are satisfied.
 *
 * The route is intentionally trivial — all logic lives in lib/qualified.ts
 * and the analytics flow stays a single source of truth.
 */

import { Hono } from 'hono'
import { context } from '@devvit/web/server'

import { getTodayUTC } from '../lib/helpers'
import {
    clampTickSeconds,
    getSessionIdFromHeader,
    recordDwellTick,
} from '../lib/qualified'
import { recordPlaytimeTick } from '../lib/metrics'

const HTTP_STATUS_BAD_REQUEST = 400

export const dwellRouter = new Hono()

dwellRouter.post('/api/dwell/tick', async (c) => {
    const { userId } = context

    if (!userId) return c.json({ error: 'User ID is required' }, HTTP_STATUS_BAD_REQUEST)

    const sessionId = getSessionIdFromHeader(c.req.raw.headers)
    if (sessionId === null) {
        return c.json({ error: 'Missing or invalid x-urjo-session header' }, HTTP_STATUS_BAD_REQUEST)
    }

    const body = await c.req.json().catch(() => null)
    if (body === null || typeof body !== 'object') {
        return c.json({ error: 'Invalid request body' }, HTTP_STATUS_BAD_REQUEST)
    }

    const tickSeconds = clampTickSeconds((body as Record<string, unknown>).tickSeconds)
    if (tickSeconds === 0) {
        // No-op tick — accept but skip the Redis write.
        return c.json({ qualified: false, dwellSeconds: 0, tickSeconds: 0 })
    }

    try {
        const today = getTodayUTC()
        await recordPlaytimeTick(today, sessionId, tickSeconds)
        const evaluation = await recordDwellTick(sessionId, userId, tickSeconds, today)
        return c.json({
            qualified: evaluation.qualified,
            dwellSeconds: evaluation.dwellSeconds,
            tickSeconds,
        })
    } catch (error) {
        console.error('[Dwell] Tick recording failed (non-critical):', error)
        // Never let instrumentation block the client — return 200 with neutral payload.
        return c.json({ qualified: false, dwellSeconds: 0, tickSeconds })
    }
})
