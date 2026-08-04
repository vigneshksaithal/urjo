import { context, redis, reddit } from '@devvit/web/server'
import type { Context } from 'hono'
import { Hono } from 'hono'

import { trackSubscribeTap } from '../lib/analytics'
import { getTodayUTC } from '../lib/helpers'

const HTTP_STATUS_UNAUTHORIZED = 401
const HTTP_STATUS_BAD_REQUEST = 400
const HTTP_STATUS_BAD_GATEWAY = 502

export const communityRouter = new Hono()

communityRouter.get('/api/community/status', async (c: Context) => {
    const { userId } = context
    if (!userId) {
        return c.json({ status: 'error', message: 'Sign in to join r/urjo' }, HTTP_STATUS_UNAUTHORIZED)
    }

    const joinedViaUrjo = await redis.get(joinedKey(userId)) === 'true'
    return c.json({ status: 'success', data: { joinedViaUrjo } })
})

communityRouter.post('/api/community/join', async (c: Context) => {
    const { userId, subredditName } = context
    if (!userId) {
        return c.json({ status: 'error', message: 'Sign in to join r/urjo' }, HTTP_STATUS_UNAUTHORIZED)
    }
    if (!subredditName) {
        return c.json({ status: 'error', message: 'Subreddit context is unavailable' }, HTTP_STATUS_BAD_REQUEST)
    }

    try {
        await reddit.subscribeToCurrentSubreddit()
        await redis.set(joinedKey(userId), 'true')
        await trackSubscribeTap(getTodayUTC(), userId).catch((error) => {
            console.error('[Community] Join metric failed (non-critical):', error)
        })
        return c.json({
            status: 'success',
            data: { joined: true, subredditName },
        })
    } catch (error) {
        console.error('[Community] Join failed:', error)
        return c.json(
            { status: 'error', message: 'Reddit could not join r/urjo. Try again from the subreddit.' },
            HTTP_STATUS_BAD_GATEWAY,
        )
    }
})

const joinedKey = (userId: string): string => `user:${userId}:communityJoined`
