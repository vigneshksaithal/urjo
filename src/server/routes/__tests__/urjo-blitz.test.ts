import { createDevvitTest } from '@devvit/test/server/vitest'
import { reddit, runWithContext, scheduler } from '@devvit/web/server'
import { expect, vi } from 'vitest'

import { startUrjoBlitz } from '../../lib/urjo-blitz'
import { urjoBlitzRouter } from '../urjo-blitz'

const USER_CONTEXT = {
    userId: 't2_alice',
    subredditId: 't5_testsub',
    subredditName: 'testsub',
}
const ANONYMOUS_CONTEXT = {
    subredditId: 't5_testsub',
    subredditName: 'testsub',
}
const FRIDAY = new Date('2026-07-17T18:00:00.000Z')

const withUser = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithContext(USER_CONTEXT as Parameters<typeof runWithContext>[0], fn)

const withoutUser = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithContext(ANONYMOUS_CONTEXT as Parameters<typeof runWithContext>[0], fn)

const test = createDevvitTest(USER_CONTEXT)

test('GET /api/urjo-blitz is public when no event exists', async () => {
    const response = await withoutUser(() => urjoBlitzRouter.request('/api/urjo-blitz'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
        status: 'success',
        data: { event: null, leaderboard: [], viewer: null },
    })
})

test('POST /api/urjo-blitz/join requires a logged-in explicit action', async () => {
    const response = await withoutUser(() => urjoBlitzRouter.request('/api/urjo-blitz/join', {
        method: 'POST',
    }))

    expect(response.status).toBe(401)
})

test('POST /api/urjo-blitz/join resolves identity on the server', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FRIDAY)
    await startUrjoBlitz(FRIDAY)
    vi.setSystemTime(new Date(FRIDAY.getTime() + 1_000))
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'Alice' } as never)

    const response = await withUser(() => urjoBlitzRouter.request('/api/urjo-blitz/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 't2_forged', username: 'Mallory' }),
    }))

    expect(response.status).toBe(200)
    expect(reddit.getUserById).toHaveBeenCalledWith('t2_alice')
    await expect(response.json()).resolves.toMatchObject({
        status: 'success',
        data: { joinedNow: true, event: { participantCount: 1 } },
    })

    vi.useRealTimers()
})

test('start scheduler creates one close job across retries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FRIDAY)
    const runJob = vi.spyOn(scheduler, 'runJob').mockResolvedValue('job-close-1')

    const first = await urjoBlitzRouter.request('/internal/scheduler/urjo-blitz-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    })
    const second = await urjoBlitzRouter.request('/internal/scheduler/urjo-blitz-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(runJob).toHaveBeenCalledTimes(1)
    expect(runJob).toHaveBeenCalledWith({
        name: 'urjo-blitz-close',
        data: { eventId: '2026-W29' },
        runAt: new Date('2026-07-19T18:00:00.000Z'),
    })

    vi.useRealTimers()
})

test('close scheduler rejects an invalid event id', async () => {
    const response = await urjoBlitzRouter.request('/internal/scheduler/urjo-blitz-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { eventId: '../unsafe' } }),
    })

    expect(response.status).toBe(400)
})

test('close scheduler idempotently closes the named event at its deadline', async () => {
    await startUrjoBlitz(FRIDAY)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-19T18:00:00.000Z'))

    const request = (): Promise<Response> => urjoBlitzRouter.request(
        '/internal/scheduler/urjo-blitz-close',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { eventId: '2026-W29' } }),
        },
    )
    const first = await request()
    const second = await request()

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    await expect(second.json()).resolves.toMatchObject({ status: 'ok' })

    vi.useRealTimers()
})
