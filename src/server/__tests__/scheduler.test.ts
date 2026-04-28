import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit, runWithContext } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { app } from '../index'

const CTX = {
    userId: 't2_testuser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
}

const withCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithContext(
        CTX as Parameters<typeof runWithContext>[0],
        fn,
    ) as Promise<T>

const schedulerRequest = async (): Promise<Response> =>
    app.request('/internal/scheduler/daily-puzzle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    })

const mockRedditApis = (postId = 't3_sched1') => {
    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: postId } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue({ id: 't1_sticky1' } as never)
}

const test = createDevvitTest({ userId: 't2_testuser', subredditName: 'testsub', subredditId: 't5_testsub' })

test('POST /internal/scheduler/daily-puzzle returns 200 with ok status', async () => {
    mockRedditApis('t3_sched1')

    const res = await withCtx(() => schedulerRequest())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
})

test('POST /internal/scheduler/daily-puzzle increments puzzleCounter', async () => {
    mockRedditApis('t3_sched2')

    await withCtx(() => schedulerRequest())

    const counter = await withCtx(() => redis.get('stats:puzzleCounter'))
    expect(Number(counter)).toBeGreaterThan(0)
})

test('POST /internal/scheduler/daily-puzzle creates a post with puzzle number in title', async () => {
    mockRedditApis('t3_sched3')

    await withCtx(() => schedulerRequest())

    expect(reddit.submitCustomPost).toHaveBeenCalledWith(
        expect.objectContaining({
            title: expect.stringMatching(/Urjo Puzzle #\d+/),
        })
    )
})

test('scheduler computes dashboard and posts analytics reply to sticky', async () => {
    mockRedditApis('t3_dash1')

    await withCtx(() => schedulerRequest())

    // submitComment should be called at least twice: sticky + analytics reply
    expect(reddit.submitComment).toHaveBeenCalledTimes(2)

    // The second call should be the analytics reply to the sticky comment
    const calls = vi.mocked(reddit.submitComment).mock.calls
    const analyticsCall = calls[1]
    expect(analyticsCall).toBeDefined()
    const analyticsArg = analyticsCall![0] as { id: string; text: string }
    expect(analyticsArg.text).toContain('Developer Analytics')
    expect(analyticsArg.text).toContain('| Metric | Value |')
})

test('scheduler uses subreddit config branding emoji in post title', async () => {
    mockRedditApis('t3_brand1')

    // Set a custom branding emoji in subreddit config
    await withCtx(() =>
        redis.hSet('subreddit:t5_testsub:config', {
            postFrequency: 'twice_daily',
            defaultGridSize: '4',
            brandingEmoji: '🎮',
            welcomeMessage: 'Welcome!',
        })
    )

    await withCtx(() => schedulerRequest())

    expect(reddit.submitCustomPost).toHaveBeenCalledWith(
        expect.objectContaining({
            title: expect.stringContaining('🎮'),
        })
    )
})

test('scheduler stores roadmap:startDate on first run', async () => {
    mockRedditApis('t3_roadmap1')

    // Ensure no start date exists
    const before = await withCtx(() => redis.get('roadmap:startDate'))
    expect(before).toBeUndefined()

    await withCtx(() => schedulerRequest())

    const after = await withCtx(() => redis.get('roadmap:startDate'))
    expect(after).toBeDefined()
    // Should be a valid ISO date string (YYYY-MM-DD)
    expect(after).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('scheduler does not overwrite existing roadmap:startDate', async () => {
    mockRedditApis('t3_roadmap2')

    const existingDate = '2025-01-01'
    await withCtx(() => redis.set('roadmap:startDate', existingDate))

    await withCtx(() => schedulerRequest())

    const after = await withCtx(() => redis.get('roadmap:startDate'))
    expect(after).toBe(existingDate)
})

test('scheduler analytics reply contains markdown table with DQE and rates', async () => {
    mockRedditApis('t3_analytics1')

    await withCtx(() => schedulerRequest())

    const calls = vi.mocked(reddit.submitComment).mock.calls
    // Find the analytics reply (contains 'Developer Analytics')
    const analyticsCall = calls.find((call) => {
        const arg = call[0] as { text: string }
        return arg.text.includes('Developer Analytics')
    })

    expect(analyticsCall).toBeDefined()
    const text = (analyticsCall![0] as { text: string }).text

    // Should contain markdown table headers and key metrics
    expect(text).toContain('| Metric | Value |')
    expect(text).toContain('DQE')
    expect(text).toContain('Phase')
})

test('scheduler posts season recap comment on Mondays', async () => {
    // Mock Date to be a Monday (UTC day 1)
    const monday = new Date('2025-01-06T16:00:00Z') // Jan 6, 2025 is a Monday
    vi.useFakeTimers()
    vi.setSystemTime(monday)

    mockRedditApis('t3_monday1')

    // Seed some season leaderboard data for the previous week (2025-W01)
    await withCtx(async () => {
        await redis.zAdd('season:2025-W01:leaderboard', { member: 't2_player1', score: 100 })
        await redis.zAdd('season:2025-W01:leaderboard', { member: 't2_player2', score: 80 })
        await redis.zAdd('season:2025-W01:leaderboard', { member: 't2_player3', score: 60 })
    })

    // Mock getUserById for username resolution in season recap
    vi.spyOn(reddit, 'getUserById').mockImplementation(async (id: string) => {
        const names: Record<string, string> = {
            't2_player1': 'Alice',
            't2_player2': 'Bob',
            't2_player3': 'Charlie',
        }
        return { username: names[id] ?? 'Unknown' } as never
    })

    await withCtx(() => schedulerRequest())

    // Should have at least 3 comments: sticky, analytics reply, season recap
    const calls = vi.mocked(reddit.submitComment).mock.calls
    const recapCall = calls.find((call) => {
        const arg = call[0] as { text: string }
        return arg.text.includes('Season Recap')
    })

    expect(recapCall).toBeDefined()
    const recapText = (recapCall![0] as { text: string }).text
    expect(recapText).toContain('Season Recap')
    expect(recapText).toContain('players competed')

    vi.useRealTimers()
})
