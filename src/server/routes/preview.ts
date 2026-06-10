/**
 * Inline Preview Route
 * Serves the data the `default` entrypoint webview (feed splash) needs to
 * render a real puzzle backdrop, a battle-style prompt, and — for challenge
 * posts — the creator's avatar. Public, read-only, works for logged-out users.
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { context, redis, reddit } from '@devvit/web/server'
import { buildPreviewState } from '../lib/preview'
import { fetchUsername } from '../lib/helpers'

const HTTP_STATUS_BAD_REQUEST = 400
const HTTP_STATUS_NOT_FOUND = 404
const HTTP_STATUS_INTERNAL_ERROR = 500

export const previewRouter = new Hono()

/**
 * Resolve the challenger's username and snoovatar URL for a challenge post.
 * Prefers values precomputed at post-creation time (stored on the puzzle hash)
 * so the common path makes zero live Reddit calls. Falls back to a live lookup
 * only for legacy posts created before precomputation existed. Avatar lookup is
 * best-effort — a missing snoovatar must not fail the route.
 */
const resolveChallenger = async (
    puzzle: Record<string, string>,
): Promise<{ username: string | null; avatarUrl: string | null }> => {
    const storedUsername = puzzle.challengeByUsername
    const storedAvatar = puzzle.challengeByAvatar

    if (storedUsername) {
        return {
            username: storedUsername === 'Anon' ? null : storedUsername,
            avatarUrl: storedAvatar ? storedAvatar : null,
        }
    }

    const challengerId = puzzle.challengeBy
    if (!challengerId) return { username: null, avatarUrl: null }

    const username = await fetchUsername(challengerId)
    if (!username || username === 'Anon') {
        return { username: null, avatarUrl: null }
    }
    try {
        const avatarUrl = await reddit.getSnoovatarUrl(username)
        return { username, avatarUrl: avatarUrl ?? null }
    } catch {
        return { username, avatarUrl: null }
    }
}

const previewHandler = async (c: Context): Promise<Response> => {
    const { postId } = context
    if (!postId) {
        return c.json({ status: 'error', message: 'Post ID is required' }, HTTP_STATUS_BAD_REQUEST)
    }

    try {
        const puzzle = await redis.hGetAll(`game:${postId}:puzzle`)
        if (!puzzle || !puzzle.colors) {
            return c.json({ status: 'error', message: 'Puzzle not found' }, HTTP_STATUS_NOT_FOUND)
        }

        const challenger = puzzle.challengeBy
            ? await resolveChallenger(puzzle)
            : { username: null, avatarUrl: null }

        const state = buildPreviewState({
            puzzle,
            challengerUsername: challenger.username,
            avatarUrl: challenger.avatarUrl,
        })
        if (!state) {
            return c.json({ status: 'error', message: 'Puzzle not found' }, HTTP_STATUS_NOT_FOUND)
        }

        return c.json({ status: 'success', data: state })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load preview'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
}

previewRouter.get('/api/preview', previewHandler)
