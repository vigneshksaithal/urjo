import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit, runWithContext } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { tryMarkUserMentioned } from '../lib/notify'
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

// ─── Mention Scheduler Tests ──────────────────────────────────────────────────

test('mention step only runs at 16:00 UTC — skipped at other hours', async () => {
    // Mock time to 20:00 UTC (not 16:00)
    const nonMentionHour = new Date('2025-06-01T20:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(nonMentionHour)

    mockRedditApis('t3_mention_skip1')

    // Seed an opted-in user who completed yesterday
    await withCtx(async () => {
        await redis.zAdd('notify:optin', { member: 't2_mentionuser1', score: Date.now() })
        const yesterday = new Date('2025-05-31T00:00:00Z').getTime()
        await redis.zAdd('analytics:user:t2_mentionuser1:completion_dates', {
            member: '2025-05-31',
            score: yesterday,
        })
    })

    const callsBefore = vi.mocked(reddit.submitComment).mock.calls.length
    await withCtx(() => schedulerRequest())

    // Only sticky + analytics reply — no mention comment
    const mentionCalls = vi.mocked(reddit.submitComment).mock.calls
        .slice(callsBefore)
        .filter((call) => {
            const arg = call[0] as { text: string }
            return arg.text.includes('u/') && arg.text.includes('streak')
        })
    expect(mentionCalls).toHaveLength(0)

    vi.useRealTimers()
})

test('mention step posts comment for opted-in user who completed yesterday at 16:00 UTC', async () => {
    // Mock time to 16:00 UTC
    const mentionHour = new Date('2025-06-02T16:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(mentionHour)

    mockRedditApis('t3_mention_post1')

    // Seed opted-in user with yesterday completion
    await withCtx(async () => {
        await redis.zAdd('notify:optin', { member: 't2_mentionuser2', score: Date.now() })
        const yesterday = new Date('2025-06-01T00:00:00Z').getTime()
        await redis.zAdd('analytics:user:t2_mentionuser2:completion_dates', {
            member: '2025-06-01',
            score: yesterday,
        })
        // Seed streak
        await redis.set('user:t2_mentionuser2:streak:current', '5')
    })

    // Mock getUserById for username resolution
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'mentionuser2' } as never)

    await withCtx(() => schedulerRequest())

    // Find the mention comment call
    const mentionCall = vi.mocked(reddit.submitComment).mock.calls.find((call) => {
        const arg = call[0] as { text: string }
        return arg.text.includes('u/mentionuser2') && arg.text.includes('streak')
    })

    expect(mentionCall).toBeDefined()
    const text = (mentionCall![0] as { text: string }).text
    expect(text).toContain('u/mentionuser2')
    expect(text).toContain('streak')
    expect(text).toContain('https://reddit.com/comments/')

    vi.useRealTimers()
})

test('mention dedup key prevents double-mention on second scheduler run', async () => {
    const mentionHour = new Date('2025-06-03T16:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(mentionHour)

    mockRedditApis('t3_mention_dedup1')

    await withCtx(async () => {
        await redis.zAdd('notify:optin', { member: 't2_mentionuser3', score: Date.now() })
        const yesterday = new Date('2025-06-02T00:00:00Z').getTime()
        await redis.zAdd('analytics:user:t2_mentionuser3:completion_dates', {
            member: '2025-06-02',
            score: yesterday,
        })
        await redis.set('user:t2_mentionuser3:streak:current', '3')
        // Pre-set the dedup key to simulate already-mentioned
        await redis.set('notify:mentioned:2025-06-03:t2_mentionuser3', '1')
    })

    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'mentionuser3' } as never)

    await withCtx(() => schedulerRequest())

    // No mention comment should be posted since dedup key exists
    const mentionCalls = vi.mocked(reddit.submitComment).mock.calls.filter((call) => {
        const arg = call[0] as { text: string }
        return arg.text.includes('u/mentionuser3') && arg.text.includes('streak')
    })
    expect(mentionCalls).toHaveLength(0)

    vi.useRealTimers()
})

test('user not in opt-in set is not mentioned', async () => {
    const mentionHour = new Date('2025-06-04T16:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(mentionHour)

    mockRedditApis('t3_mention_nooptin1')

    await withCtx(async () => {
        // User has completion but is NOT opted in
        const yesterday = new Date('2025-06-03T00:00:00Z').getTime()
        await redis.zAdd('analytics:user:t2_nooptin1:completion_dates', {
            member: '2025-06-03',
            score: yesterday,
        })
        await redis.set('user:t2_nooptin1:streak:current', '2')
    })

    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'nooptin1' } as never)

    await withCtx(() => schedulerRequest())

    const mentionCalls = vi.mocked(reddit.submitComment).mock.calls.filter((call) => {
        const arg = call[0] as { text: string }
        return arg.text.includes('u/nooptin1') && arg.text.includes('streak')
    })
    expect(mentionCalls).toHaveLength(0)

    vi.useRealTimers()
})

test('user not in yesterday completers is not mentioned', async () => {
    const mentionHour = new Date('2025-06-05T16:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(mentionHour)

    mockRedditApis('t3_mention_nocomplete1')

    await withCtx(async () => {
        // User is opted in but did NOT complete yesterday (completed 2 days ago)
        await redis.zAdd('notify:optin', { member: 't2_nocomplete1', score: Date.now() })
        const twoDaysAgo = new Date('2025-06-03T00:00:00Z').getTime()
        await redis.zAdd('analytics:user:t2_nocomplete1:completion_dates', {
            member: '2025-06-03',
            score: twoDaysAgo,
        })
        await redis.set('user:t2_nocomplete1:streak:current', '1')
    })

    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'nocomplete1' } as never)

    await withCtx(() => schedulerRequest())

    const mentionCalls = vi.mocked(reddit.submitComment).mock.calls.filter((call) => {
        const arg = call[0] as { text: string }
        return arg.text.includes('u/nocomplete1') && arg.text.includes('streak')
    })
    expect(mentionCalls).toHaveLength(0)

    vi.useRealTimers()
})

test('comment failure for one user does not block remaining users', async () => {
    const mentionHour = new Date('2025-06-06T16:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(mentionHour)

    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_mention_fail1' } as never)

    await withCtx(async () => {
        // Two opted-in users who both completed yesterday
        await redis.zAdd('notify:optin', { member: 't2_failuser1', score: Date.now() })
        await redis.zAdd('notify:optin', { member: 't2_failuser2', score: Date.now() })
        const yesterday = new Date('2025-06-05T00:00:00Z').getTime()
        await redis.zAdd('analytics:user:t2_failuser1:completion_dates', {
            member: '2025-06-05',
            score: yesterday,
        })
        await redis.zAdd('analytics:user:t2_failuser2:completion_dates', {
            member: '2025-06-05',
            score: yesterday,
        })
        await redis.set('user:t2_failuser1:streak:current', '4')
        await redis.set('user:t2_failuser2:streak:current', '6')
    })

    let callCount = 0
    vi.spyOn(reddit, 'submitComment').mockImplementation(async (args) => {
        const arg = args as { text?: string; id: string }
        // Fail for failuser1's mention comment, succeed for everything else
        if (arg.text?.includes('u/failuser1') && arg.text?.includes('streak')) {
            throw new Error('Comment submission failed')
        }
        callCount++
        return { id: `t1_comment${callCount}` } as never
    })

    vi.spyOn(reddit, 'getUserById').mockImplementation(async (id: string) => {
        const names: Record<string, string> = {
            't2_failuser1': 'failuser1',
            't2_failuser2': 'failuser2',
        }
        return { username: names[id] ?? 'Unknown' } as never
    })

    // Scheduler should still return 200 — mention failures are non-blocking
    const res = await withCtx(() => schedulerRequest())
    expect(res.status).toBe(200)

    // failuser2 should still get a mention comment despite failuser1 failing
    const mentionCalls = vi.mocked(reddit.submitComment).mock.calls.filter((call) => {
        const arg = call[0] as { text: string }
        return arg.text.includes('u/failuser2') && arg.text.includes('streak')
    })
    expect(mentionCalls).toHaveLength(1)

    vi.useRealTimers()
})

// ─── Property 11: Mention Scheduler Idempotence ───────────────────────────────

/**
 * **Validates: Requirements 15.9, 15.10, 15.11**
 *
 * Property 11: Mention Scheduler Idempotence
 *
 * For all Daily_Mention_Batch sets B and all users U in B, the count of
 * comments posted for U on a given date D is exactly 1, regardless of how
 * many times the scheduler runs that day.
 *
 * For all users U not in Yesterday_Completer_Set(D-1), the comment count
 * for U on D is 0 (eligibility property).
 *
 * For all users U not in Notify_Opt_In_Set, the comment count for U on D
 * is 0 (consent property).
 *
 * The dedup mechanism is tryMarkUserMentioned (SET NX pattern): it returns
 * true only on the first call for a given (date, userId) pair, and false on
 * every subsequent call. The scheduler skips comment submission when the
 * claim returns false. This property test verifies that invariant directly.
 */

const testProperty11Dedup = createDevvitTest()

testProperty11Dedup(
    'Property 11 — tryMarkUserMentioned returns true exactly once per (date, userId) across N calls',
    async () => {
        /**
         * For all (date, userId) pairs and all run counts N ≥ 1:
         * - The first call returns true (comment would be posted)
         * - All subsequent calls return false (comment would be skipped)
         * - The total number of true results equals exactly 1
         */
        const dateArb = fc.stringMatching(/^2025-\d{2}-\d{2}$/)
        const userIdArb = fc.stringMatching(/^t2_[a-z0-9]{4,12}$/)
        const runCountArb = fc.integer({ min: 1, max: 10 })

        await fc.assert(
            fc.asyncProperty(dateArb, userIdArb, runCountArb, async (date, userId, runCount) => {
                // Simulate N scheduler runs for the same (date, userId)
                const results: boolean[] = []
                for (let i = 0; i < runCount; i++) {
                    results.push(await tryMarkUserMentioned(date, userId))
                }

                // Exactly one run claims the slot (the first)
                const trueCount = results.filter(Boolean).length
                expect(trueCount).toBe(1)

                // The first result is always true
                expect(results[0]).toBe(true)

                // All subsequent results are false
                for (let i = 1; i < runCount; i++) {
                    expect(results[i]).toBe(false)
                }
            }),
            { numRuns: 150 },
        )
    },
)

const testProperty11SchedulerRuns = createDevvitTest({
    userId: 't2_testuser',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
})

testProperty11SchedulerRuns(
    'Property 11 — scheduler running twice at 16:00 UTC posts exactly 1 mention comment per user in batch',
    async () => {
        /**
         * Integration-level verification: seed a fixed batch of opted-in completers,
         * run the scheduler twice, and assert each user receives exactly 1 mention.
         *
         * The dedup invariant is enforced by tryMarkUserMentioned (SET NX): the
         * second scheduler run finds the dedup key already set and skips posting.
         */
        const mentionHour = new Date('2025-07-10T16:00:00Z')
        vi.useFakeTimers()
        vi.setSystemTime(mentionHour)

        const userIds = ['t2_prop11a', 't2_prop11b', 't2_prop11c']

        // Seed: all users opted in and completed yesterday (2025-07-09)
        await withCtx(async () => {
            for (const userId of userIds) {
                await redis.zAdd('notify:optin', { member: userId, score: Date.now() })
                await redis.zAdd(`analytics:user:${userId}:completion_dates`, {
                    member: '2025-07-09',
                    score: new Date('2025-07-09T00:00:00Z').getTime(),
                })
                await redis.set(`user:${userId}:streak:current`, '4')
            }
        })

        vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_prop11post' } as never)
        vi.spyOn(reddit, 'getUserById').mockImplementation(async (id: string) => {
            const name = id.replace('t2_', '')
            return { username: name } as never
        })

        // Track mention comment counts per user across both scheduler runs
        const mentionCommentCounts: Record<string, number> = {}
        for (const userId of userIds) {
            mentionCommentCounts[userId] = 0
        }

        vi.spyOn(reddit, 'submitComment').mockImplementation(async (args) => {
            const arg = args as { text?: string; id: string }
            if (arg.text?.includes('streak')) {
                for (const userId of userIds) {
                    const username = userId.replace('t2_', '')
                    if (arg.text.includes(`u/${username}`)) {
                        mentionCommentCounts[userId] = (mentionCommentCounts[userId] ?? 0) + 1
                    }
                }
            }
            return { id: 't1_prop11comment' } as never
        })

        // First scheduler run — all users in batch should receive a mention
        const res1 = await withCtx(() => schedulerRequest())
        expect(res1.status).toBe(200)

        // Second scheduler run — dedup keys are set; no new mentions should be posted
        const res2 = await withCtx(() => schedulerRequest())
        expect(res2.status).toBe(200)

        // Each user must have received exactly 1 mention comment across both runs
        for (const userId of userIds) {
            expect(mentionCommentCounts[userId]).toBe(1)
        }

        vi.useRealTimers()
    },
)
