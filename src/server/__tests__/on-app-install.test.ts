import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit, runWithContext } from '@devvit/web/server'
import { expect, vi } from 'vitest'

import { app } from '../index'

const CTX = {
    userId: 't2_installer',
    subredditName: 'puzzlefans',
    subredditId: 't5_puzzlefans',
}

const withCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithContext(
        CTX as Parameters<typeof runWithContext>[0],
        fn,
    ) as Promise<T>

const installRequest = async (): Promise<Response> =>
    app.request('/internal/on-app-install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    })

const mockRedditApis = (postId = 't3_install1') => {
    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: postId } as never)
}

const test = createDevvitTest({
    userId: 't2_installer',
    subredditName: 'puzzlefans',
    subredditId: 't5_puzzlefans',
})

test('onAppInstall creates default subreddit config', async () => {
    mockRedditApis()

    await withCtx(() => installRequest())

    const config = await withCtx(() => redis.hGetAll('subreddit:t5_puzzlefans:config'))
    expect(config).toBeDefined()
    expect(config['postFrequency']).toBe('twice_daily')
    expect(config['defaultGridSize']).toBe('4')
    expect(config['brandingEmoji']).toBe('🧩')
    expect(config['welcomeMessage']).toBe('Welcome to Urjo!')
})

test('onAppInstall records installation in sorted set and metadata hash', async () => {
    mockRedditApis()

    await withCtx(() => installRequest())

    // Check sorted set entry
    const installations = await withCtx(() =>
        redis.zRange('installations:all', 0, -1, { by: 'rank' })
    )
    expect(installations.length).toBe(1)
    expect(installations[0]!.member).toBe('t5_puzzlefans')
    expect(installations[0]!.score).toBeGreaterThan(0)

    // Check metadata hash
    const meta = await withCtx(() => redis.hGetAll('installation:t5_puzzlefans'))
    expect(meta['subredditName']).toBe('puzzlefans')
    expect(meta['installedBy']).toBe('t2_installer')
    expect(meta['installedAt']).toBeDefined()
})

test('onAppInstall creates first puzzle post automatically', async () => {
    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_firstpost' } as never)

    const res = await withCtx(() => installRequest())

    expect(res.status).toBe(200)
    expect(reddit.submitCustomPost).toHaveBeenCalled()

    const body = await res.json()
    expect(body).toHaveProperty('navigateTo')
    expect(body.navigateTo).toContain('t3_firstpost')
})

test('onAppInstall sets roadmap:startDate if not already set', async () => {
    mockRedditApis()

    const before = await withCtx(() => redis.get('roadmap:startDate'))
    expect(before).toBeUndefined()

    await withCtx(() => installRequest())

    const after = await withCtx(() => redis.get('roadmap:startDate'))
    expect(after).toBeDefined()
    expect(after).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('onAppInstall does not overwrite existing roadmap:startDate', async () => {
    mockRedditApis()

    const existingDate = '2025-01-15'
    await withCtx(() => redis.set('roadmap:startDate', existingDate))

    await withCtx(() => installRequest())

    const after = await withCtx(() => redis.get('roadmap:startDate'))
    expect(after).toBe(existingDate)
})

test('onAppInstall returns error when post creation fails', async () => {
    vi.spyOn(reddit, 'submitCustomPost').mockRejectedValue(new Error('post creation failed'))

    const res = await withCtx(() => installRequest())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('message')
    expect(body.message).toBe('post creation failed')
})
