/**
 * Unit tests for moderator middleware and cached moderator check
 * Requirements: 13.1, 13.3, 13.4, 13.5
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/redis'
import { reddit as webReddit, runWithContext } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { Hono } from 'hono'

import { requireModerator, isModeratorCached } from '../moderator'

// ─── Test app with moderator middleware ───────────────────────────────────────

const createTestApp = (): Hono => {
    const testApp = new Hono()
    testApp.use('/api/admin/*', requireModerator())
    testApp.get('/api/admin/config', (c) => c.json({ status: 'success', data: 'admin-data' }))
    return testApp
}

// ─── Helper: run with Devvit context (uses @devvit/web/server's context) ──────

const withCtx = <T>(
    overrides: { userId?: string; subredditId?: string; subredditName?: string },
    fn: () => Promise<T>
): Promise<T> =>
    runWithContext(
        {
            userId: overrides.userId,
            subredditId: overrides.subredditId ?? 't5_testsub',
            subredditName: overrides.subredditName ?? 'testsub',
        } as Parameters<typeof runWithContext>[0],
        fn
    )

// ─── requireModerator middleware: 401 when no userId ──────────────────────────

const test401 = createDevvitTest({ subredditName: 'testsub', subredditId: 't5_testsub' })

test401('requireModerator returns 401 when no userId in context', async () => {
    const testApp = createTestApp()

    const res = await withCtx(
        { userId: undefined, subredditId: 't5_testsub', subredditName: 'testsub' },
        () => testApp.request('/api/admin/config')
    )

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Authentication required')
})

// ─── requireModerator middleware: 403 when non-moderator ──────────────────────

const test403 = createDevvitTest({
    userId: 't2_nonmod',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

test403('requireModerator returns 403 when user is not a moderator', async () => {
    const testApp = createTestApp()

    // Mock getUserById and getModerators on the web/server reddit (same instance source code uses)
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'nonmod_user' } as never)
    vi.spyOn(webReddit, 'getModerators').mockReturnValue({
        all: () => Promise.resolve([]),
    } as never)

    const res = await withCtx(
        { userId: 't2_nonmod', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => testApp.request('/api/admin/config')
    )

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Moderator access required')

    vi.restoreAllMocks()
})

// ─── requireModerator middleware: passes through for moderator ─────────────────

const testPass = createDevvitTest({
    userId: 't2_moduser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testPass('requireModerator passes through for moderator', async () => {
    const testApp = createTestApp()

    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'mod_user' } as never)
    vi.spyOn(webReddit, 'getModerators').mockReturnValue({
        all: () => Promise.resolve([{ username: 'mod_user' }]),
    } as never)

    const res = await withCtx(
        { userId: 't2_moduser', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => testApp.request('/api/admin/config')
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'success', data: 'admin-data' })

    vi.restoreAllMocks()
})

// ─── Moderator cache: cached result avoids Reddit API call ────────────────────

const testCache = createDevvitTest({
    userId: 't2_cachedmod',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testCache('isModeratorCached uses cached result and avoids Reddit API call', async () => {
    // Pre-populate cache using the nested redis context
    const { redis: webRedis } = await import('@devvit/web/server')
    await withCtx(
        { userId: 't2_cachedmod', subredditId: 't5_testsub', subredditName: 'testsub' },
        async () => {
            await webRedis.set('mod:t5_testsub:t2_cachedmod', '1')
            await webRedis.expire('mod:t5_testsub:t2_cachedmod', 300)
        }
    )

    const getModSpy = vi.spyOn(webReddit, 'getModerators')

    const result = await withCtx(
        { userId: 't2_cachedmod', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => isModeratorCached('t5_testsub', 't2_cachedmod')
    )

    expect(result).toBe(true)
    expect(getModSpy).not.toHaveBeenCalled()

    vi.restoreAllMocks()
})

// ─── Moderator cache: cached "not mod" result ─────────────────────────────────

const testCacheNotMod = createDevvitTest({
    userId: 't2_notmod',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testCacheNotMod('isModeratorCached returns false from cached "0" value', async () => {
    const { redis: webRedis } = await import('@devvit/web/server')
    await withCtx(
        { userId: 't2_notmod', subredditId: 't5_testsub', subredditName: 'testsub' },
        async () => {
            await webRedis.set('mod:t5_testsub:t2_notmod', '0')
            await webRedis.expire('mod:t5_testsub:t2_notmod', 300)
        }
    )

    const getModSpy = vi.spyOn(webReddit, 'getModerators')

    const result = await withCtx(
        { userId: 't2_notmod', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => isModeratorCached('t5_testsub', 't2_notmod')
    )

    expect(result).toBe(false)
    expect(getModSpy).not.toHaveBeenCalled()

    vi.restoreAllMocks()
})

// ─── Moderator cache: no cache triggers fresh API check ───────────────────────

const testNoCache = createDevvitTest({
    userId: 't2_freshmod',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testNoCache('isModeratorCached calls Reddit API when no cache exists', async () => {
    vi.spyOn(webReddit, 'getUserById').mockResolvedValue({ username: 'fresh_mod' } as never)
    vi.spyOn(webReddit, 'getModerators').mockReturnValue({
        all: () => Promise.resolve([{ username: 'fresh_mod' }]),
    } as never)

    const result = await withCtx(
        { userId: 't2_freshmod', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => isModeratorCached('t5_testsub', 't2_freshmod')
    )

    expect(result).toBe(true)

    // Verify cache was written
    const { redis: webRedis } = await import('@devvit/web/server')
    const cached = await withCtx(
        { userId: 't2_freshmod', subredditId: 't5_testsub', subredditName: 'testsub' },
        () => webRedis.get('mod:t5_testsub:t2_freshmod')
    )
    expect(cached).toBe('1')

    vi.restoreAllMocks()
})
