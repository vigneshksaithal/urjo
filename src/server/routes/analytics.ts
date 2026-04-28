/**
 * Analytics API Routes
 * Mod-protected endpoints for daily metrics and dashboard data.
 */

import { Hono } from 'hono'

import { getDailyMetrics } from '../lib/analytics'
import { computeDashboard } from '../lib/dashboard'
import { requireModerator } from '../lib/moderator'

const HTTP_STATUS_INTERNAL_ERROR = 500

export const analyticsRouter = new Hono()

// All analytics routes require moderator auth
analyticsRouter.use('/api/analytics/*', requireModerator())

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

// ─── GET /api/analytics/daily ──────────────────────────────────────────────────

analyticsRouter.get('/api/analytics/daily', async (c) => {
    try {
        const dates = getLastNDates(30)
        const metrics = await Promise.all(dates.map((d) => getDailyMetrics(d)))

        return c.json({ status: 'success', data: metrics })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})

// ─── GET /api/analytics/dashboard ──────────────────────────────────────────────

analyticsRouter.get('/api/analytics/dashboard', async (c) => {
    try {
        const dates = getLastNDates(14)
        const dashboards = await Promise.all(dates.map((d) => computeDashboard(d)))

        return c.json({ status: 'success', data: dashboards })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})
