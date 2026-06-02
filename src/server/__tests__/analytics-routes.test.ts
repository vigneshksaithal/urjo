/**
 * Integration tests for analytics API routes.
 * Tests mod-protected daily metrics and dashboard endpoints.
 * Requirements: 3.9, 6.6
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit as webReddit, runWithContext } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { app } from '../index'

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

// ─── GET /api/analytics/rewards — canonical Reddit rewards status ────────────

const testRewardsStatus = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testRewardsStatus('GET /api/analytics/rewards returns canonical Reddit rewards status', async () => {
    await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        async () => {
            await seedModCache('t5_testsub', 't2_moduser')
            await redis.hSet('rewards:qe:2026-06-01', {
                date: '2026-06-01',
                qualifiedInstalls: '0',
                qualifiedEngagers: '2586',
                qualifiedEngagersLoggedIn: '2586',
                qualifiedEngagersLoggedOut: '0',
                qualifiedEngagers7d: '1742.7',
                qualifiedEngagers7dLoggedIn: '1741.6',
                qualifiedEngagers7dLoggedOut: '1.3',
                qualifiedEngagers14d: '1193.4',
                qualifiedEngagers14dLoggedIn: '1192.4',
                qualifiedEngagers14dLoggedOut: '1.1',
                tierEligibility: 'Tier 2',
            })
            await redis.set('rewards:qe:latest', '2026-06-01')
        },
    )

    const res = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/analytics/rewards'),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; data: { canonicalSource: string; gapToTier3: number } }
    expect(body.status).toBe('success')
    expect(body.data.canonicalSource).toBe('reddit')
    expect(body.data.gapToTier3).toBeCloseTo(8257.3)
})
