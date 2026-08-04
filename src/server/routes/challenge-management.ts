import { context, redis, reddit } from '@devvit/web/server'
import type { Context } from 'hono'
import { Hono } from 'hono'

import { isValidGridSize, type GridSize } from '../../shared/constants'
import { registerUserDynamicKey } from '../lib/account-deletion'

const HTTP_STATUS_BAD_REQUEST = 400
const HTTP_STATUS_UNAUTHORIZED = 401
const HTTP_STATUS_FORBIDDEN = 403
const HTTP_STATUS_CONFLICT = 409
const HTTP_STATUS_BAD_GATEWAY = 502
const HTTP_STATUS_INTERNAL_ERROR = 500
const REMOVAL_CLAIM_TTL_MS = 2 * 60 * 1000
const POST_ID_PATTERN = /^t3_[a-zA-Z0-9_]{1,64}$/

type ChallengeEntry = {
    postId: string
    postUrl: string
    createdAt: string
    gridSize: GridSize | null
    targetTime: number | null
    kind: 'challenge' | 'level'
}

type OwnershipState = 'missing' | 'owned' | 'forbidden'

export const challengeManagementRouter = new Hono()

const listChallengesHandler = async (c: Context): Promise<Response> => {
    const { userId } = context
    if (!userId) return unauthorized(c)

    try {
        const challenges = await listOwnedChallenges(userId)
        return c.json({ status: 'success', data: { challenges } })
    } catch (error) {
        console.error('[ChallengeManagement] Failed to list challenges:', error)
        return c.json(
            { status: 'error', message: 'Unable to load rival posts' },
            HTTP_STATUS_INTERNAL_ERROR,
        )
    }
}

const removeChallengeHandler = async (c: Context): Promise<Response> => {
    const { userId } = context
    if (!userId) return unauthorized(c)

    const postId = parsePostId(c.req.param('postId'))
    if (postId === null) {
        return c.json({ status: 'error', message: 'Invalid rival post ID' }, HTTP_STATUS_BAD_REQUEST)
    }

    try {
        return await removeOwnedChallenge(c, userId, postId)
    } catch (error) {
        console.error('[ChallengeManagement] Failed to remove challenge:', error)
        return c.json(
            { status: 'error', message: 'Unable to remove rival post' },
            HTTP_STATUS_INTERNAL_ERROR,
        )
    }
}

challengeManagementRouter.get('/api/challenges/mine', listChallengesHandler)
challengeManagementRouter.delete('/api/challenges/:postId', removeChallengeHandler)

const listOwnedChallenges = async (userId: string): Promise<ChallengeEntry[]> => {
    const entries = await redis.zRange(createdChallengesKey(userId), 0, -1, {
        by: 'rank',
        reverse: true,
    })
    const challenges = await Promise.all(
        entries.map((entry) => buildChallengeEntry(userId, entry.member, entry.score)),
    )
    return challenges.filter((entry): entry is ChallengeEntry => entry !== null)
}

const buildChallengeEntry = async (
    userId: string,
    postId: string,
    indexCreatedAt: number,
): Promise<ChallengeEntry | null> => {
    if (parsePostId(postId) === null) return null
    const [meta, puzzle] = await Promise.all([
        redis.hGetAll(`game:${postId}:meta`),
        redis.hGetAll(`game:${postId}:puzzle`),
    ])
    if (!isOwnedChallengeRecord(userId, meta, puzzle)) return null

    const createdAt = parseTimestamp(meta['createdAt']) ?? indexCreatedAt
    return {
        postId,
        postUrl: challengePostUrl(postId),
        createdAt: toIsoTimestamp(createdAt),
        gridSize: parseGridSize(puzzle['gridSize']),
        targetTime: parsePositiveInteger(puzzle['challengeScore']),
        kind: meta['creatorContentType'] === 'level' ? 'level' : 'challenge',
    }
}

const removeOwnedChallenge = async (
    c: Context,
    userId: string,
    postId: `t3_${string}`,
): Promise<Response> => {
    const ownership = await getOwnershipState(userId, postId)
    if (ownership === 'missing') return alreadyRemoved(c, postId)
    if (ownership === 'forbidden') {
        return c.json(
            { status: 'error', message: 'This rival post is not owned by your Urjo account' },
            HTTP_STATUS_FORBIDDEN,
        )
    }

    const claimed = await claimRemoval(userId, postId)
    if (!claimed) {
        return c.json(
            { status: 'error', message: 'This rival post removal is already in progress' },
            HTTP_STATUS_CONFLICT,
        )
    }
    return removeFromReddit(c, userId, postId)
}

const removeFromReddit = async (
    c: Context,
    userId: string,
    postId: `t3_${string}`,
): Promise<Response> => {
    try {
        await reddit.remove(postId, false)
    } catch (error) {
        console.error('[ChallengeManagement] Reddit removal failed:', error)
        await redis.del(removalClaimKey(userId, postId)).catch(() => undefined)
        return c.json({
            status: 'error',
            message: 'Reddit could not remove this rival post. You can manage it directly on Reddit.',
            postUrl: challengePostUrl(postId),
        }, HTTP_STATUS_BAD_GATEWAY)
    }

    await cleanupChallengeRecords(userId, postId)
    return c.json({
        status: 'success',
        data: { postId, state: 'removed', alreadyRemoved: false },
    })
}

const getOwnershipState = async (
    userId: string,
    postId: string,
): Promise<OwnershipState> => {
    const indexed = await redis.zScore(createdChallengesKey(userId), postId)
    if (indexed === undefined) return 'missing'

    const [creatorId, challengeBy] = await Promise.all([
        redis.hGet(`game:${postId}:meta`, 'challengeCreatorId'),
        redis.hGet(`game:${postId}:puzzle`, 'challengeBy'),
    ])
    return creatorId === userId && challengeBy === userId ? 'owned' : 'forbidden'
}

const cleanupChallengeRecords = async (userId: string, postId: string): Promise<void> => {
    await redis.del(
        `game:${postId}:puzzle`,
        `game:${postId}:meta`,
        `game:${postId}:stats`,
        `game:${postId}:preview`,
        `challenge:${postId}:beat_events`,
        `viral:challenge:${postId}:created_at`,
        `referral:${postId}:count`,
        `preview:updated:${postId}`,
    )
    await redis.zRem(createdChallengesKey(userId), [postId])
    await redis.del(removalClaimKey(userId, postId))
}

const claimRemoval = async (userId: string, postId: string): Promise<boolean> => {
    const key = removalClaimKey(userId, postId)
    await registerUserDynamicKey(userId, key)
    const result = await redis.set(key, '1', {
        nx: true,
        expiration: new Date(Date.now() + REMOVAL_CLAIM_TTL_MS),
    })
    return result === 'OK'
}

const alreadyRemoved = (c: Context, postId: string): Response => c.json({
    status: 'success',
    data: { postId, state: 'removed', alreadyRemoved: true },
})

const unauthorized = (c: Context): Response => c.json(
    { status: 'error', message: 'Sign in to manage your rival posts' },
    HTTP_STATUS_UNAUTHORIZED,
)

const isOwnedChallengeRecord = (
    userId: string,
    meta: Record<string, string>,
    puzzle: Record<string, string>,
): boolean => meta['challengeCreatorId'] === userId && puzzle['challengeBy'] === userId

const parsePostId = (value: string | undefined): `t3_${string}` | null =>
    value !== undefined && POST_ID_PATTERN.test(value) ? value as `t3_${string}` : null

const parseTimestamp = (value: string | undefined): number | null => {
    if (value === undefined) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

const toIsoTimestamp = (value: number): string => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString()
}

const parsePositiveInteger = (value: string | undefined): number | null => {
    if (value === undefined) return null
    const parsed = parseInt(value, 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const parseGridSize = (value: string | undefined): GridSize | null => {
    const parsed = parsePositiveInteger(value)
    return isValidGridSize(parsed) ? parsed : null
}

const createdChallengesKey = (userId: string): string =>
    `user:${userId}:createdChallenges`

const removalClaimKey = (userId: string, postId: string): string =>
    `user:${userId}:challenge-removal:${postId}`

const challengePostUrl = (postId: string): string =>
    `https://reddit.com/comments/${postId.replace(/^t3_/, '')}`
