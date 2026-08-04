import { context, reddit, redis, scheduler } from '@devvit/web/server'
import type { TaskRequest, TaskResponse } from '@devvit/web/server'
import type { Context } from 'hono'
import { Hono } from 'hono'

import { isUrjoBlitzEventId } from '../../shared/urjo-blitz'
import {
    URJO_BLITZ_RETENTION_SECONDS,
    UrjoBlitzInactiveError,
    closeUrjoBlitz,
    getUrjoBlitzState,
    joinUrjoBlitz,
    startUrjoBlitz,
} from '../lib/urjo-blitz'

const HTTP_STATUS_BAD_REQUEST = 400
const HTTP_STATUS_UNAUTHORIZED = 401
const HTTP_STATUS_CONFLICT = 409
const HTTP_STATUS_INTERNAL_ERROR = 500
const CLOSE_TASK_NAME = 'urjo-blitz-close'

type CloseTaskBody = TaskRequest & { data?: { eventId?: unknown } }

export const urjoBlitzRouter = new Hono()

urjoBlitzRouter.get('/api/urjo-blitz', async (c) => {
    try {
        const state = await getUrjoBlitzState(context.userId ?? null)
        return c.json({ status: 'success', data: state })
    } catch (error) {
        return internalError(c, error)
    }
})

urjoBlitzRouter.post('/api/urjo-blitz/join', async (c) => {
    const userId = context.userId
    if (userId === undefined) {
        return c.json({ status: 'error', message: 'Log in to join Urjo Blitz' }, HTTP_STATUS_UNAUTHORIZED)
    }

    try {
        const user = await reddit.getUserById(userId as `t2_${string}`)
        if (user?.username === undefined) throw new Error('Unable to resolve Reddit username')
        const result = await joinUrjoBlitz(userId, user.username)
        return c.json({ status: 'success', data: result })
    } catch (error) {
        if (error instanceof UrjoBlitzInactiveError) {
            return c.json({ status: 'error', message: error.message }, HTTP_STATUS_CONFLICT)
        }
        return internalError(c, error)
    }
})

urjoBlitzRouter.post('/internal/scheduler/urjo-blitz-start', async (c) => {
    await c.req.json<TaskRequest>().catch(() => null)
    try {
        const result = await startUrjoBlitz()
        if (result.event.status === 'active') await ensureCloseJob(result.event.eventId, result.event.endAt)
        return c.json<TaskResponse>({ status: 'ok' })
    } catch (error) {
        return taskError(c, error)
    }
})

urjoBlitzRouter.post('/internal/scheduler/urjo-blitz-close', async (c) => {
    const body = await c.req.json<CloseTaskBody>().catch(() => null)
    const eventId = body?.data?.eventId
    if (!isUrjoBlitzEventId(eventId)) {
        return c.json<TaskResponse>(
            { status: 'error', message: 'Valid eventId is required' },
            HTTP_STATUS_BAD_REQUEST,
        )
    }

    try {
        await closeUrjoBlitz(eventId)
        return c.json<TaskResponse>({ status: 'ok' })
    } catch (error) {
        return taskError(c, error)
    }
})

const ensureCloseJob = async (eventId: string, endAt: string): Promise<void> => {
    const key = `blitz:event:${eventId}:close-job`
    if (await redis.get(key) !== undefined) return

    const jobId = await scheduler.runJob({
        name: CLOSE_TASK_NAME,
        data: { eventId },
        runAt: new Date(endAt),
    })
    await redis.set(key, jobId)
    await redis.expire(key, URJO_BLITZ_RETENTION_SECONDS)
}

const taskError = (c: Context, error: unknown): Response => {
    const message = error instanceof Error ? error.message : 'Urjo Blitz task failed'
    return c.json<TaskResponse>({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
}

const internalError = (c: Context, error: unknown): Response => {
    const message = error instanceof Error ? error.message : 'Urjo Blitz request failed'
    return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
}
