import { runWithContext } from '@devvit/server'
import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit } from '@devvit/web/server'
import { expect, vi } from 'vitest'

import { deleteUserData } from '../../lib/account-deletion'
import { communityRouter } from '../community'

const USER_ID = 't2_joiner'
const test = createDevvitTest({
    userId: USER_ID,
    subredditName: 'urjo',
    subredditId: 't5_urjo',
})

const requestJoin = (): Promise<Response> => communityRouter.request('/api/community/join', {
    method: 'POST',
})

test('community status reports only an Urjo-recorded successful Join action', async () => {
    const before = await communityRouter.request('/api/community/status')
    expect(await before.json()).toEqual({
        status: 'success',
        data: { joinedViaUrjo: false },
    })

    vi.spyOn(reddit, 'subscribeToCurrentSubreddit').mockResolvedValue(undefined)
    await requestJoin()

    const after = await communityRouter.request('/api/community/status')
    expect(await after.json()).toEqual({
        status: 'success',
        data: { joinedViaUrjo: true },
    })
})

test('account deletion clears the Urjo-recorded Join state', async () => {
    vi.spyOn(reddit, 'subscribeToCurrentSubreddit').mockResolvedValue(undefined)
    await requestJoin()

    await deleteUserData(USER_ID)

    const response = await communityRouter.request('/api/community/status')
    await expect(response.json()).resolves.toEqual({
        status: 'success',
        data: { joinedViaUrjo: false },
    })
})

test('community join requires a signed-in Reddit user', async () => {
    const subscribe = vi.spyOn(reddit, 'subscribeToCurrentSubreddit')
    const response = await runWithContext(
        { subredditName: 'urjo', subredditId: 't5_urjo' },
        requestJoin,
    )

    expect(response.status).toBe(401)
    expect(subscribe).not.toHaveBeenCalled()
})

test('community join is an explicit user-scoped subscribe action', async () => {
    const subscribe = vi.spyOn(reddit, 'subscribeToCurrentSubreddit').mockResolvedValue(undefined)

    const response = await requestJoin()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
        status: 'success',
        data: { joined: true, subredditName: 'urjo' },
    })
    expect(subscribe).toHaveBeenCalledOnce()
})

test('successful repeated taps count once per user and UTC day', async () => {
    vi.spyOn(reddit, 'subscribeToCurrentSubreddit').mockResolvedValue(undefined)

    await requestJoin()
    await requestJoin()

    const today = new Date().toISOString().split('T')[0] ?? ''
    expect(await redis.get(`analytics:${today}:subscribe_taps`)).toBe('1')
})

test('a Reddit failure does not claim success or increment the metric', async () => {
    vi.spyOn(reddit, 'subscribeToCurrentSubreddit').mockRejectedValue(new Error('permission pending'))

    const response = await requestJoin()

    expect(response.status).toBe(502)
    const today = new Date().toISOString().split('T')[0] ?? ''
    expect(await redis.get(`analytics:${today}:subscribe_taps`)).toBeUndefined()
})
