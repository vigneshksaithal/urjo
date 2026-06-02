/**
 * Integration tests for admin API routes.
 * Tests mod-protected config, roadmap, and installations endpoints.
 * Requirements: 4.3, 9.3, 10.5
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit as webReddit, runWithContext } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { app } from '../index'
import type { SubredditConfig } from '../../shared/growth-types'

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

const seedModCache = async (subredditId: string, userId: string): Promise<void> => {
    await redis.set(`mod:${subredditId}:${userId}`, '1')
    await redis.expire(`mod:${subredditId}:${userId}`, 300)
}

// ─── POST /api/admin/config — 403 for non-moderator ──────────────────────────

const testConfigForbidden = createDevvitTest({
    userId: 't2_nonmod',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testConfigForbidden('POST /api/admin/config returns 403 for non-moderator', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'nonmod_user' } as never)
    vi.spyOn(webReddit, 'getModerators').mockReturnValue({
        all: () => Promise.resolve([]),
    } as never)

    const res = await withCtx(
        { userId: 't2_nonmod', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/admin/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postFrequency: 'once_daily' }),
        }),
    )

    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Moderator access required')

    vi.restoreAllMocks()
})

// ─── POST /api/admin/config — updates config for moderator ────────────────────

const testConfigUpdate = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testConfigUpdate('POST /api/admin/config updates config for moderator', async () => {
    await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => seedModCache('t5_testsub', 't2_moduser'),
    )

    const res = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/admin/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postFrequency: 'once_daily', brandingEmoji: '🎮' }),
        }),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; data: SubredditConfig }
    expect(body.status).toBe('success')
    expect(body.data.postFrequency).toBe('once_daily')
    expect(body.data.brandingEmoji).toBe('🎮')
    // Defaults preserved for unset fields
    expect(body.data.defaultGridSize).toBe(4)
    expect(body.data.welcomeMessage).toBe('Welcome to Urjo!')
})

// ─── GET /api/admin/config — returns current config ───────────────────────────

const testConfigGet = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testConfigGet('GET /api/admin/config returns current subreddit config', async () => {
    await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => seedModCache('t5_testsub', 't2_moduser'),
    )

    const res = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/admin/config'),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; data: SubredditConfig }
    expect(body.status).toBe('success')
    expect(body.data).toHaveProperty('postFrequency')
    expect(body.data).toHaveProperty('defaultGridSize')
    expect(body.data).toHaveProperty('brandingEmoji')
    expect(body.data).toHaveProperty('welcomeMessage')
})

// ─── GET /api/admin/installations — returns installation list ─────────────────

const testInstallations = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testInstallations('GET /api/admin/installations returns installation list', async () => {
    await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        async () => {
            await seedModCache('t5_testsub', 't2_moduser')

            // Seed an installation
            await redis.zAdd('installations:all', { member: 't5_sub1', score: Date.now() })
            await redis.hSet('installation:t5_sub1', {
                subredditName: 'puzzles',
                installedAt: Date.now().toString(),
                installedBy: 't2_moduser',
            })
        },
    )

    const res = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/admin/installations'),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; data: Array<{ subredditId: string; subredditName: string }> }
    expect(body.status).toBe('success')
    expect(body.data.length).toBeGreaterThanOrEqual(1)

    const installation = body.data.find((i) => i.subredditId === 't5_sub1')
    expect(installation).toBeDefined()
    expect(installation!.subredditName).toBe('puzzles')
    expect(installation!).toHaveProperty('dqeLast7Days')
})

// ─── POST /api/admin/roadmap — sets roadmap start date ────────────────────────

const testRoadmap = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testRoadmap('POST /api/admin/roadmap sets roadmap start date', async () => {
    await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => seedModCache('t5_testsub', 't2_moduser'),
    )

    const res = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/admin/roadmap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: '2025-01-15' }),
        }),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; data: { startDate: string } }
    expect(body.status).toBe('success')
    expect(body.data.startDate).toBe('2025-01-15')

    // Verify it was persisted
    const stored = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => redis.get('roadmap:startDate'),
    )
    expect(stored).toBe('2025-01-15')
})

// ─── POST /api/admin/roadmap — rejects invalid date ──────────────────────────

const testRoadmapInvalid = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testRoadmapInvalid('POST /api/admin/roadmap returns 400 for invalid date', async () => {
    await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => seedModCache('t5_testsub', 't2_moduser'),
    )

    const res = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/admin/roadmap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: 'not-a-date' }),
        }),
    )

    expect(res.status).toBe(400)
})

// ─── POST /api/admin/qe/csv-upload — ingests Reddit rewards CSV ──────────────

const testRewardsCsvUpload = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testRewardsCsvUpload('POST /api/admin/qe/csv-upload ingests Reddit rewards CSV', async () => {
    await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => seedModCache('t5_testsub', 't2_moduser'),
    )

    const csv = [
        'Date,Qualified Installs,Qualified Engagers,Qualified Engagers (Logged-in),Qualified Engagers (Logged-out),Qualified Engagers (7 day average),Qualified Engagers (7 day average, logged-in),Qualified Engagers (7 day average, logged-out),Qualified Engagers (14 day average),Qualified Engagers (14 day average, logged-in),Qualified Engagers (14 day average, logged-out),Tier Eligibility',
        '2026-06-01,0,2586,2586,0,1742.7,1741.6,1.3,1193.4,1192.4,1.1,Tier 2',
    ].join('\n')

    const res = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => app.request('/api/admin/qe/csv-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csv }),
        }),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; data: { rowsStored: number; latest: { date: string } } }
    expect(body.status).toBe('success')
    expect(body.data.rowsStored).toBe(1)
    expect(body.data.latest.date).toBe('2026-06-01')
})
