/**
 * Presence API Routes
 * Handles social presence heartbeats for active player tracking.
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { context, reddit } from '@devvit/web/server'

import { heartbeat } from '../lib/presence'
import type { PresenceData, PresencePlayer } from '../../shared/race-types'

const HTTP_STATUS_BAD_REQUEST = 400
const HTTP_STATUS_INTERNAL_ERROR = 500

export const presenceRouter = new Hono()

/**
 * Resolve username for a userId, falling back to the userId itself on failure.
 * Non-blocking: if Reddit API fails, the userId is used as the display name.
 */
const resolveUsername = async (userId: string): Promise<string> => {
    try {
        const user = await reddit.getUserById(userId as `t2_${string}`)
        return user?.username ?? userId
    } catch {
        return userId
    }
}

/**
 * Resolve usernames for all players in parallel.
 * Each resolution is independent — one failure doesn't block others.
 */
const resolvePlayerUsernames = async (players: PresencePlayer[]): Promise<PresencePlayer[]> =>
    Promise.all(
        players.map(async (player) => ({
            ...player,
            username: await resolveUsername(player.userId),
        }))
    )

// ─── POST /api/presence/heartbeat ────────────────────────────────────────────

const heartbeatHandler = async (c: Context): Promise<Response> => {
    const { userId } = context

    if (!userId) {
        return c.json({ status: 'error', message: 'User must be logged in' }, HTTP_STATUS_BAD_REQUEST)
    }

    try {
        const body = await c.req.json().catch(() => null)
        if (!body || typeof body !== 'object') {
            return c.json({ status: 'error', message: 'Invalid request body' }, HTTP_STATUS_BAD_REQUEST)
        }

        const { postId } = body as Record<string, unknown>
        if (typeof postId !== 'string' || postId.length === 0) {
            return c.json(
                { status: 'error', message: 'postId is required' },
                HTTP_STATUS_BAD_REQUEST,
            )
        }

        const presenceData = await heartbeat(postId, userId)

        // Resolve usernames for active players (non-blocking per player)
        const playersWithUsernames = await resolvePlayerUsernames(presenceData.players)

        const response: PresenceData = {
            activeCount: presenceData.activeCount,
            players: playersWithUsernames,
            racingCount: presenceData.racingCount,
        }

        return c.json(response)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
}

presenceRouter.post('/api/presence/heartbeat', heartbeatHandler)
