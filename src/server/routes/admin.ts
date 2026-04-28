/**
 * Admin API Routes
 * Mod-protected endpoints for subreddit config, roadmap, and installations.
 */

import { Hono } from 'hono'
import { context, redis } from '@devvit/web/server'

import { getSubredditConfig, updateSubredditConfig } from '../lib/subreddit-config'
import { requireModerator } from '../lib/moderator'
import type { SubredditConfig, InstallationInfo } from '../../shared/growth-types'

const HTTP_STATUS_BAD_REQUEST = 400
const HTTP_STATUS_INTERNAL_ERROR = 500

export const adminRouter = new Hono()

// All admin routes require moderator auth
adminRouter.use('/api/admin/*', requireModerator())

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ROADMAP_START_DATE_KEY = 'roadmap:startDate'
const INSTALLATIONS_SET = 'installations:all'

/**
 * Build an array of ISO date strings for the last N days ending today.
 */
const getLastNDates = (days: number): string[] => {
    const now = new Date()
    const dates: string[] = []

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000)
        dates.push(d.toISOString().split('T')[0]!)
    }

    return dates
}

/**
 * Validate an ISO date string (YYYY-MM-DD format).
 */
const isValidISODate = (value: unknown): value is string => {
    if (typeof value !== 'string') return false
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

// ─── GET /api/admin/config ─────────────────────────────────────────────────────

adminRouter.get('/api/admin/config', async (c) => {
    const { subredditId } = context

    if (!subredditId) {
        return c.json({ status: 'error', message: 'Subreddit context required' }, HTTP_STATUS_INTERNAL_ERROR)
    }

    try {
        const config = await getSubredditConfig(subredditId)
        return c.json({ status: 'success', data: config })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})

// ─── POST /api/admin/config ────────────────────────────────────────────────────

adminRouter.post('/api/admin/config', async (c) => {
    const { subredditId } = context

    if (!subredditId) {
        return c.json({ status: 'error', message: 'Subreddit context required' }, HTTP_STATUS_INTERNAL_ERROR)
    }

    try {
        const body = await c.req.json().catch(() => null)
        if (!body || typeof body !== 'object') {
            return c.json({ status: 'error', message: 'Invalid request body' }, HTTP_STATUS_BAD_REQUEST)
        }

        const updates = body as Partial<SubredditConfig>
        const updated = await updateSubredditConfig(subredditId, updates)

        return c.json({ status: 'success', data: updated })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})

// ─── POST /api/admin/roadmap ───────────────────────────────────────────────────

adminRouter.post('/api/admin/roadmap', async (c) => {
    try {
        const body = await c.req.json().catch(() => null)
        if (!body || typeof body !== 'object') {
            return c.json({ status: 'error', message: 'Invalid request body' }, HTTP_STATUS_BAD_REQUEST)
        }

        const { startDate } = body as Record<string, unknown>
        if (!isValidISODate(startDate)) {
            return c.json({ status: 'error', message: 'Invalid startDate — expected YYYY-MM-DD format' }, HTTP_STATUS_BAD_REQUEST)
        }

        await redis.set(ROADMAP_START_DATE_KEY, startDate)

        return c.json({ status: 'success', data: { startDate } })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})

// ─── GET /api/admin/installations ──────────────────────────────────────────────

adminRouter.get('/api/admin/installations', async (c) => {
    try {
        const entries = await redis.zRange(INSTALLATIONS_SET, 0, -1, { by: 'rank' })

        const last7Dates = getLastNDates(7)

        const installations: InstallationInfo[] = await Promise.all(
            entries.map(async (entry) => {
                const subredditId = entry.member
                const meta = await redis.hGetAll(`installation:${subredditId}`)

                // Compute per-subreddit DQE estimates for last 7 days
                const dqeLast7Days = await Promise.all(
                    last7Dates.map(async (date) => {
                        const key = `analytics:${date}:completions:subreddit:${subredditId}`
                        const val = await redis.get(key)
                        return val !== undefined ? parseInt(val, 10) : 0
                    }),
                )

                return {
                    subredditId,
                    subredditName: meta?.subredditName ?? 'unknown',
                    installedAt: meta?.installedAt ? parseInt(meta.installedAt, 10) : 0,
                    installedBy: meta?.installedBy ?? 'unknown',
                    dqeLast7Days,
                }
            }),
        )

        return c.json({ status: 'success', data: installations })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})
