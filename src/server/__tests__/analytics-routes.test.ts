/**
 * Integration tests for analytics API routes.
 * Tests mod-protected daily metrics and dashboard endpoints.
 * Requirements: 3.9, 6.6
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit as webReddit, runWithContext } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { app } from '../index'
import {
    captureReferrer,
    commitQualifiedUser,
    markFirstTapAndCommit,
    recordDwellTick,
} from '../lib/qualified'

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

/**
 * Pre-populate the moderator cache so the middleware passes without Reddit API calls.
 */
const seedModCache = async (subredditId: string, userId: string): Promise<void> => {
    await redis.set(`mod:${subredditId}:${userId}`, '1')
    await redis.expire(`mod:${subredditId}:${userId}`, 300)
}

// ─── GET /api/analytics/metrics — simplified six-metric report ────────────────

const testMetrics = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testMetrics('GET /api/analytics/metrics returns the six simplified metrics for a moderator', async () => {
    await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => seedModCache('t5_testsub', 't2_moduser'),
    )

    const res = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/analytics/metrics?days=7'),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as {
        status: string
        data: Array<{
            date: string
            opens: number
            views: number
            completions: number
            averagePlaySeconds: number | null
            sessions: number
            d1Retention: number | null
            d7Retention: number | null
        }>
    }
    expect(body.status).toBe('success')
    expect(body.data).toHaveLength(7)

    const first = body.data[0]!
    expect(first).toHaveProperty('opens')
    expect(first).toHaveProperty('views')
    expect(first).toHaveProperty('completions')
    expect(first).toHaveProperty('averagePlaySeconds')
    expect(first).toHaveProperty('d1Retention')
    expect(first).toHaveProperty('d7Retention')
})

const testMetricsForbidden = createDevvitTest({
    userId: 't2_nonmod',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testMetricsForbidden('GET /api/analytics/metrics returns 403 for non-moderator', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'nonmod_user' } as never)
    vi.spyOn(webReddit, 'getModerators').mockReturnValue({
        all: () => Promise.resolve([]),
    } as never)

    const res = await withCtx(
        { userId: 't2_nonmod', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/analytics/metrics'),
    )

    expect(res.status).toBe(403)
    vi.restoreAllMocks()
})

const testMetricsClamp = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testMetricsClamp('GET /api/analytics/metrics clamps the days param into [1,30]', async () => {
    await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => seedModCache('t5_testsub', 't2_moduser'),
    )

    const lengths = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        async () => {
            const lenFor = async (q: string): Promise<number> => {
                const res = await app.request(`/api/analytics/metrics${q}`)
                const body = await res.json() as { data: unknown[] }
                return body.data.length
            }
            return {
                zero: await lenFor('?days=0'),
                huge: await lenFor('?days=999'),
                nan: await lenFor('?days=abc'),
            }
        },
    )

    expect(lengths.zero).toBe(1)
    expect(lengths.huge).toBe(30)
    expect(lengths.nan).toBe(14)
})

// ─── GET /api/analytics/daily — 403 for non-moderator ─────────────────────────

const testDailyForbidden = createDevvitTest({
    userId: 't2_nonmod',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testDailyForbidden('GET /api/analytics/daily returns 403 for non-moderator', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'nonmod_user' } as never)
    vi.spyOn(webReddit, 'getModerators').mockReturnValue({
        all: () => Promise.resolve([]),
    } as never)

    const res = await withCtx(
        { userId: 't2_nonmod', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/analytics/daily'),
    )

    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Moderator access required')

    vi.restoreAllMocks()
})

// ─── GET /api/analytics/daily — returns metrics for moderator ─────────────────

const testDailySuccess = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testDailySuccess('GET /api/analytics/daily returns last 30 days of metrics for moderator', async () => {
    await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => seedModCache('t5_testsub', 't2_moduser'),
    )

    const res = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/analytics/daily'),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; data: Array<{ date: string; postOpens: number }> }
    expect(body.status).toBe('success')
    expect(body.data).toHaveLength(30)

    const first = body.data[0]!
    expect(first).toHaveProperty('date')
    expect(first).toHaveProperty('postOpens')
    expect(first).toHaveProperty('firstActions')
    expect(first).toHaveProperty('completions')
    expect(first).toHaveProperty('firstActionRate')
    expect(first).toHaveProperty('completionRate')
})

// ─── GET /api/analytics/dashboard — returns dashboard data with alerts ────────

const testDashboard = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testDashboard('GET /api/analytics/dashboard returns 14 days of dashboard data', async () => {
    await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => seedModCache('t5_testsub', 't2_moduser'),
    )

    const res = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/analytics/dashboard'),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; data: Array<{ date: string; alerts: unknown[]; rolling: object }> }
    expect(body.status).toBe('success')
    expect(body.data).toHaveLength(14)

    const entry = body.data[0]!
    expect(entry).toHaveProperty('date')
    expect(entry).toHaveProperty('daily')
    expect(entry).toHaveProperty('rolling')
    expect(entry).toHaveProperty('alerts')
    expect(entry).toHaveProperty('currentPhase')
    expect(entry).toHaveProperty('seasonParticipants')
})

// ─── GET /api/analytics/dqp — bounded estimate fields ────────────────────────

const testDQP = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testDQP('GET /api/analytics/dqp reports estimated DQP and retention sample sizes', async () => {
    const date = '2026-04-01'
    await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        async () => {
            await seedModCache('t5_testsub', 't2_moduser')
            await commitQualifiedUser(date, 't2_dqp_route', 't5_testsub')
        },
    )

    const res = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request(`/api/analytics/dqp?date=${date}`),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as {
        status: string
        data: {
            dqp: number
            dqpEstimated: boolean
            retentionEstimated: boolean
            d1Retention: number | null
            d1SampleSize: number
            d7Retention: number | null
            d7SampleSize: number
        }
    }
    expect(body.status).toBe('success')
    expect(body.data.dqp).toBe(1)
    expect(body.data.dqpEstimated).toBe(true)
    expect(body.data.retentionEstimated).toBe(true)
    expect(body.data.d1Retention).toBe(null)
    expect(body.data.d1SampleSize).toBe(1)
    expect(body.data.d7Retention).toBe(null)
    expect(body.data.d7SampleSize).toBe(1)
})

// ─── GET /api/analytics/qualified-summary — in-app dashboard summary ──────────

const testQualifiedSummary = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testQualifiedSummary('GET /api/analytics/qualified-summary reports yesterday DQP and play time', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!

    await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        async () => {
            await seedModCache('t5_testsub', 't2_moduser')
            await captureReferrer('sess-summary-route', 't2_summary_route', 't5_testsub', 'https://reddit.com/r/foo')
            await markFirstTapAndCommit('sess-summary-route', yesterday, 't2_summary_route', 't5_testsub')
            for (let i = 0; i < 6; i++) {
                await recordDwellTick('sess-summary-route', 't2_summary_route', 5, yesterday)
            }
        },
    )

    const res = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/analytics/qualified-summary'),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as {
        status: string
        data: {
            dqpDate: string
            dqp: number
            d1Date: string
            d7Date: string
            qualifiedSessions: number
            averagePlaySeconds: number | null
            playtimeBuckets: { b20_29: number; b30_44: number; b45_60: number }
        }
    }
    expect(body.status).toBe('success')
    expect(body.data.dqpDate).toBe(yesterday)
    expect(body.data.dqp).toBe(1)
    expect(body.data.qualifiedSessions).toBe(1)
    expect(body.data.averagePlaySeconds).toBe(30)
    expect(body.data.playtimeBuckets).toEqual({ b20_29: 0, b30_44: 1, b45_60: 0 })
})

// ─── GET /api/analytics/qualified-summary — 403 for non-moderator ─────────────

const testQualifiedSummaryForbidden = createDevvitTest({
    userId: 't2_nonmod',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testQualifiedSummaryForbidden('GET /api/analytics/qualified-summary returns 403 for non-moderator', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'nonmod_user' } as never)
    vi.spyOn(webReddit, 'getModerators').mockReturnValue({
        all: () => Promise.resolve([]),
    } as never)

    const res = await withCtx(
        { userId: 't2_nonmod', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/analytics/qualified-summary'),
    )

    expect(res.status).toBe(403)

    vi.restoreAllMocks()
})
