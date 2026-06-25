/**
 * Analytics API Routes
 * Mod-protected endpoints for daily metrics and dashboard data.
 */

import { Hono } from 'hono'

import { getDailyMetrics } from '../lib/analytics'
import { getSimpleMetrics } from '../lib/metrics'
import { computeDashboard } from '../lib/dashboard'
import { requireModerator } from '../lib/moderator'

const HTTP_STATUS_INTERNAL_ERROR = 500
const HTTP_STATUS_BAD_REQUEST = 400

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

// ─── GET /api/analytics/metrics ───────────────────────────────────────────────

/**
 * The simplified report: the six product metrics (opens, views, completions,
 * play time, D1, D7) for the last N days (default 14, max 30). This is the
 * single surface the in-app dashboard consumes.
 */
analyticsRouter.get('/api/analytics/metrics', async (c) => {
    try {
        const daysParam = parseInt(c.req.query('days') ?? '14', 10)
        const days = Number.isNaN(daysParam) ? 14 : Math.min(Math.max(daysParam, 1), 30)
        const dates = getLastNDates(days)
        const data = await Promise.all(dates.map((d) => getSimpleMetrics(d)))
        return c.json({ status: 'success', data })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})

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

// ─── GET /api/analytics/qualified-summary ──────────────────────────────────────

/**
 * Bounded server-validated qualified-engagement summary for the in-app
 * dashboard: estimated DQP, D1/D7 retention, and qualified play time, each
 * read from the most recent matured cohort. All figures are estimates.
 */
analyticsRouter.get('/api/analytics/qualified-summary', async (c) => {
    try {
        const data = await buildQualifiedSummary()
        return c.json({ status: 'success', data })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})


// ─── GET /api/analytics/variants ──────────────────────────────────────────────

/**
 * Per-variant funnel metrics for the A/B/C first-screen experiment.
 * Returns opens, screen_taps (A/B only), first_actions, and completions
 * plus derived rates for a single UTC date (default: today).
 */
analyticsRouter.get('/api/analytics/variants', async (c) => {
    try {
        const date = c.req.query('date') ?? new Date().toISOString().split('T')[0]!
        const data = await readVariantMetrics(date)
        return c.json({ status: 'success', data })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})

// ─── New scorecard endpoints (DQP / D7 / S2R / Drift) ──────────────────────────

import { readVariantMetrics } from '../lib/ab-test'
import { buildScorecard, formatScorecardMarkdown } from '../lib/scorecard'
import {
    buildQualifiedSummary,
    computeGlobalD1RetentionEstimate,
    computeGlobalD7RetentionEstimate,
    computePerSubD7Retention,
    readGlobalDQP,
    readPerSubDQP,
} from '../lib/qualified'
import { readS2RAllBuckets, readS2RGlobal } from '../lib/s2r'

const isISODate = (value: unknown): value is string =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

/**
 * GET /api/analytics/scorecard?date=YYYY-MM-DD&format=json|markdown
 *
 * The 80/20 honest report. Returns DQP, per-sub vector, D7 retention,
 * S2R, and Reddit-QE drift. Default format=json; pass format=markdown
 * to get the same content rendered as the Reddit-comment payload.
 */
analyticsRouter.get('/api/analytics/scorecard', async (c) => {
    const date = c.req.query('date')
    if (!isISODate(date)) {
        return c.json({ status: 'error', message: 'Query param `date` must be YYYY-MM-DD' }, HTTP_STATUS_BAD_REQUEST)
    }
    try {
        const data = await buildScorecard(date)
        const format = c.req.query('format') ?? 'json'
        if (format === 'markdown') {
            return c.text(formatScorecardMarkdown(data))
        }
        return c.json({ status: 'success', data })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})

/**
 * GET /api/analytics/dqp?date=YYYY-MM-DD&sub=t5_xxx
 *
 * Returns bounded-estimate DQP for a date. Global responses include
 * estimated exact-day D1/D7 retention and sample sizes.
 */
analyticsRouter.get('/api/analytics/dqp', async (c) => {
    const date = c.req.query('date')
    if (!isISODate(date)) {
        return c.json({ status: 'error', message: 'Query param `date` must be YYYY-MM-DD' }, HTTP_STATUS_BAD_REQUEST)
    }
    const sub = c.req.query('sub')

    try {
        if (sub !== undefined && sub.length > 0) {
            if (!sub.startsWith('t5_')) {
                return c.json({ status: 'error', message: '`sub` must start with t5_' }, HTTP_STATUS_BAD_REQUEST)
            }
            const [dqp, d7] = await Promise.all([
                readPerSubDQP(date, sub),
                computePerSubD7Retention(date, sub),
            ])
            return c.json({
                status: 'success',
                data: {
                    date,
                    sub,
                    dqp,
                    dqpEstimated: true,
                    retentionEstimated: true,
                    d7Retention: d7,
                },
            })
        }
        const [dqp, d1, d7] = await Promise.all([
            readGlobalDQP(date),
            computeGlobalD1RetentionEstimate(date),
            computeGlobalD7RetentionEstimate(date),
        ])
        return c.json({
            status: 'success',
            data: {
                date,
                sub: '_global',
                dqp,
                dqpEstimated: true,
                retentionEstimated: true,
                d1Retention: d1.rate,
                d1SampleSize: d1.sampleSize,
                d7Retention: d7.rate,
                d7SampleSize: d7.sampleSize,
            },
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})

/**
 * GET /api/analytics/s2r?date=YYYY-MM-DD
 *
 * Returns the global S2R rate plus the per-bucket breakdown.
 */
analyticsRouter.get('/api/analytics/s2r', async (c) => {
    const date = c.req.query('date')
    if (!isISODate(date)) {
        return c.json({ status: 'error', message: 'Query param `date` must be YYYY-MM-DD' }, HTTP_STATUS_BAD_REQUEST)
    }
    try {
        const [global, buckets] = await Promise.all([
            readS2RGlobal(date),
            readS2RAllBuckets(date),
        ])
        return c.json({ status: 'success', data: { date, global, buckets } })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
})
