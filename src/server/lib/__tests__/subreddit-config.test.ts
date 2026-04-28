/**
 * Unit tests for subreddit config CRUD and installation tracking
 * Requirements: 4.1, 9.1
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/redis'
import { runWithContext } from '@devvit/web/server'
import { expect } from 'vitest'

import {
    getSubredditConfig,
    updateSubredditConfig,
    recordInstallation,
} from '../subreddit-config'

// ─── Helper: run with Devvit context (uses @devvit/web/server's context) ──────

const withCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithContext(
        { subredditId: 't5_testsub', subredditName: 'testsub', userId: 't2_testuser' } as Parameters<typeof runWithContext>[0],
        fn
    )

// ─── getSubredditConfig: creates defaults for new subreddit ───────────────────

const testDefaults = createDevvitTest({ subredditId: 't5_newsub' })

testDefaults('getSubredditConfig creates defaults for new subreddit', async () => {
    const config = await withCtx(() => getSubredditConfig('t5_newsub'))

    expect(config.postFrequency).toBe('twice_daily')
    expect(config.defaultGridSize).toBe(4)
    expect(config.brandingEmoji).toBe('🧩')
    expect(config.welcomeMessage).toBe('Welcome to Urjo!')

    // Verify defaults were persisted to Redis
    const stored = await redis.hGetAll('subreddit:t5_newsub:config')
    expect(stored['postFrequency']).toBe('twice_daily')
    expect(stored['defaultGridSize']).toBe('4')
})

// ─── getSubredditConfig: returns existing config ──────────────────────────────

const testExisting = createDevvitTest({ subredditId: 't5_existing' })

testExisting('getSubredditConfig returns existing config', async () => {
    // Pre-populate config
    await redis.hSet('subreddit:t5_existing:config', {
        postFrequency: 'once_daily',
        defaultGridSize: '6',
        brandingEmoji: '🎮',
        welcomeMessage: 'Hello gamers!',
    })

    const config = await withCtx(() => getSubredditConfig('t5_existing'))

    expect(config.postFrequency).toBe('once_daily')
    expect(config.defaultGridSize).toBe(6)
    expect(config.brandingEmoji).toBe('🎮')
    expect(config.welcomeMessage).toBe('Hello gamers!')
})

// ─── updateSubredditConfig: merges partial updates ────────────────────────────

const testUpdate = createDevvitTest({ subredditId: 't5_updatesub' })

testUpdate('updateSubredditConfig merges partial updates', async () => {
    // Create initial config
    await withCtx(() => getSubredditConfig('t5_updatesub'))

    // Update only postFrequency and brandingEmoji
    const updated = await withCtx(() => updateSubredditConfig('t5_updatesub', {
        postFrequency: 'thrice_daily',
        brandingEmoji: '🎯',
    }))

    expect(updated.postFrequency).toBe('thrice_daily')
    expect(updated.brandingEmoji).toBe('🎯')
    // Unchanged fields should retain defaults
    expect(updated.defaultGridSize).toBe(4)
    expect(updated.welcomeMessage).toBe('Welcome to Urjo!')

    // Verify persistence
    const stored = await redis.hGetAll('subreddit:t5_updatesub:config')
    expect(stored['postFrequency']).toBe('thrice_daily')
    expect(stored['brandingEmoji']).toBe('🎯')
    expect(stored['defaultGridSize']).toBe('4')
})

// ─── updateSubredditConfig: validates invalid frequency ───────────────────────

const testInvalidFreq = createDevvitTest({ subredditId: 't5_invalidsub' })

testInvalidFreq('updateSubredditConfig ignores invalid postFrequency', async () => {
    await withCtx(() => getSubredditConfig('t5_invalidsub'))

    const updated = await withCtx(() => updateSubredditConfig('t5_invalidsub', {
        postFrequency: 'invalid_freq' as never,
    }))

    // Should keep the default since the update value is invalid
    expect(updated.postFrequency).toBe('twice_daily')
})

// ─── updateSubredditConfig: validates invalid grid size ───────────────────────

const testInvalidGrid = createDevvitTest({ subredditId: 't5_invalidgrid' })

testInvalidGrid('updateSubredditConfig ignores invalid defaultGridSize', async () => {
    await withCtx(() => getSubredditConfig('t5_invalidgrid'))

    const updated = await withCtx(() => updateSubredditConfig('t5_invalidgrid', {
        defaultGridSize: 5 as never,
    }))

    expect(updated.defaultGridSize).toBe(4)
})

// ─── recordInstallation: stores metadata and adds to sorted set ───────────────

const testInstall = createDevvitTest({ subredditId: 't5_installsub' })

testInstall('recordInstallation stores metadata and adds to sorted set', async () => {
    await withCtx(() => recordInstallation('t5_installsub', 'puzzlegames', 't2_moduser'))

    // Check sorted set
    const installations = await redis.zRange('installations:all', 0, -1, { by: 'rank' })
    const entry = installations.find((e) => e.member === 't5_installsub')
    expect(entry).toBeDefined()
    expect(entry!.score).toBeGreaterThan(0)

    // Check metadata hash
    const meta = await redis.hGetAll('installation:t5_installsub')
    expect(meta['subredditName']).toBe('puzzlegames')
    expect(meta['installedBy']).toBe('t2_moduser')
    expect(meta['installedAt']).toBeDefined()
    expect(parseInt(meta['installedAt']!, 10)).toBeGreaterThan(0)
})

// ─── recordInstallation: timestamp matches sorted set score ───────────────────

const testInstallTimestamp = createDevvitTest({ subredditId: 't5_timesub' })

testInstallTimestamp('recordInstallation timestamp matches sorted set score', async () => {
    const before = Date.now()
    await withCtx(() => recordInstallation('t5_timesub', 'timesub', 't2_admin'))
    const after = Date.now()

    const installations = await redis.zRange('installations:all', 0, -1, { by: 'rank' })
    const entry = installations.find((e) => e.member === 't5_timesub')
    expect(entry).toBeDefined()
    expect(entry!.score).toBeGreaterThanOrEqual(before)
    expect(entry!.score).toBeLessThanOrEqual(after)

    const meta = await redis.hGetAll('installation:t5_timesub')
    const installedAt = parseInt(meta['installedAt']!, 10)
    expect(installedAt).toBe(entry!.score)
})
