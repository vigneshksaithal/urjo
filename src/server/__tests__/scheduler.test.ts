import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { app } from '../index'

const test = createDevvitTest({ userId: 't2_testuser', subredditName: 'testsub' })

test('POST /internal/scheduler/daily-puzzle returns 200 with ok status', async () => {
    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_sched1' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue(undefined as never)

    const res = await app.request('/internal/scheduler/daily-puzzle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
})

test('POST /internal/scheduler/daily-puzzle increments puzzleCounter', async () => {
    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_sched2' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue(undefined as never)

    await app.request('/internal/scheduler/daily-puzzle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    })

    const counter = await redis.get('stats:puzzleCounter')
    expect(Number(counter)).toBeGreaterThan(0)
})

test('POST /internal/scheduler/daily-puzzle creates a post with puzzle number in title', async () => {
    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_sched3' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue(undefined as never)

    await app.request('/internal/scheduler/daily-puzzle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    })

    expect(reddit.submitCustomPost).toHaveBeenCalledWith(
        expect.objectContaining({
            title: expect.stringMatching(/Urjo #\d+/),
        })
    )
})
