import { context, reddit, redis } from '@devvit/web/server'
import type { Context } from 'hono'
import { Hono } from 'hono'

import { isValidGridSize } from '../../shared/constants'
import type { Difficulty, GridSize } from '../../shared/constants'
import type { SerializedPuzzle } from '../../shared/types'
import { buildCustomLevelPuzzle, validateCustomLevelSolution } from '../lib/custom-level'
import { registerUserDynamicKey } from '../lib/account-deletion'
import { toPublicPuzzle } from '../lib/public-puzzle'
import { createStickyComment } from '../post'

const HTTP_STATUS_BAD_REQUEST = 400
const HTTP_STATUS_UNAUTHORIZED = 401
const HTTP_STATUS_NOT_FOUND = 404
const HTTP_STATUS_INTERNAL_ERROR = 500
const DRAFT_TTL_MS = 30 * 60 * 1000
const DRAFT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DIFFICULTIES = ['easy', 'medium', 'hard', 'diabolical'] as const

type PreviewInput = {
    gridSize: GridSize
    difficulty: Difficulty
    solution: string
}

type PublishInput = {
    draftId: string
    title: string
}

export const customLevelsRouter = new Hono()

const previewCustomLevel = async (c: Context): Promise<Response> => {
    const userId = context.userId
    if (!userId) return unauthorized(c)

    try {
        const input = parsePreviewInput(await c.req.json().catch(() => null))
        if (input === null) return invalidRequest(c, 'Invalid level design')
        const validation = validateCustomLevelSolution(input.solution, input.gridSize)
        if (!validation.valid) return invalidRequest(c, validation.message)

        const puzzle = buildCustomLevelPuzzle(input)
        const draftId = await storeDraft(userId, puzzle)
        return c.json({ status: 'success', data: { draftId, puzzle: toPublicPuzzle(puzzle) } })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to preview this level'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
}

const publishCustomLevel = async (c: Context): Promise<Response> => {
    const { userId, subredditName } = context
    if (!userId) return unauthorized(c)
    if (!subredditName) return invalidRequest(c, 'No subreddit context')

    try {
        const input = parsePublishInput(await c.req.json().catch(() => null))
        if (input === null) return invalidRequest(c, 'Invalid publish request')
        const puzzle = await loadDraft(userId, input.draftId)
        if (puzzle === null) {
            return c.json({ status: 'error', message: 'Level preview expired' }, HTTP_STATUS_NOT_FOUND)
        }
        const postId = await createCustomLevelPost(userId, subredditName, input.title, puzzle)
        await redis.del(draftKey(userId, input.draftId))
        return c.json({
            status: 'success',
            data: { postId, postUrl: redditCommentsUrl(postId) },
        })
    } catch (error) {
        console.error('[CustomLevels] Publish failed:', error)
        return c.json(
            { status: 'error', message: 'Unable to publish this level' },
            HTTP_STATUS_INTERNAL_ERROR,
        )
    }
}

customLevelsRouter.post('/api/custom-levels/preview', previewCustomLevel)
customLevelsRouter.post('/api/custom-levels/publish', publishCustomLevel)

const parsePreviewInput = (raw: unknown): PreviewInput | null => {
    if (!raw || typeof raw !== 'object') return null
    const value = raw as Record<string, unknown>
    if (!isValidGridSize(value['gridSize'])) return null
    if (!isDifficulty(value['difficulty'])) return null
    if (typeof value['solution'] !== 'string') return null
    return {
        gridSize: value['gridSize'],
        difficulty: value['difficulty'],
        solution: value['solution'],
    }
}

const parsePublishInput = (raw: unknown): PublishInput | null => {
    if (!raw || typeof raw !== 'object') return null
    const value = raw as Record<string, unknown>
    if (typeof value['draftId'] !== 'string' || !DRAFT_ID_PATTERN.test(value['draftId'])) return null
    if (typeof value['title'] !== 'string') return null
    const title = value['title'].trim()
    return title.length > 0 && title.length <= 120
        ? { draftId: value['draftId'], title }
        : null
}

const storeDraft = async (userId: string, puzzle: SerializedPuzzle): Promise<string> => {
    const draftId = crypto.randomUUID()
    const key = draftKey(userId, draftId)
    await registerUserDynamicKey(userId, key)
    await redis.set(key, JSON.stringify(puzzle), {
        expiration: new Date(Date.now() + DRAFT_TTL_MS),
    })
    return draftId
}

const loadDraft = async (userId: string, draftId: string): Promise<SerializedPuzzle | null> => {
    const raw = await redis.get(draftKey(userId, draftId))
    if (raw === undefined) return null
    try {
        const value = JSON.parse(raw) as SerializedPuzzle
        return isValidGridSize(value.gridSize) && isDifficulty(value.difficulty)
            ? value
            : null
    } catch {
        return null
    }
}

const createCustomLevelPost = async (
    userId: string,
    subredditName: string,
    title: string,
    puzzle: SerializedPuzzle,
): Promise<`t3_${string}`> => {
    const post = await reddit.submitCustomPost({
        subredditName,
        title,
        textFallback: {
            text: `${title}\n\nA community-made ${puzzle.gridSize}×${puzzle.gridSize} Urjo level. Open the post to play.`,
        },
        runAs: 'USER',
        userGeneratedContent: { text: title },
        postData: { postType: 'urjo-puzzle' },
    })
    const postId = post.id as `t3_${string}`
    await persistCustomLevel(postId, userId, puzzle)
    await createStickyComment(postId).catch((error: unknown) => {
        console.error('[CustomLevels] Sticky comment failed:', error)
    })
    return postId
}

const persistCustomLevel = async (
    postId: string,
    userId: string,
    puzzle: SerializedPuzzle,
): Promise<void> => {
    const createdAt = Date.now()
    await Promise.all([
        redis.hSet(`game:${postId}:puzzle`, {
            ...serializePuzzle(puzzle),
            created: new Date(createdAt).toISOString(),
            challengeBy: userId,
            customLevel: 'true',
            lockedGridSize: puzzle.gridSize.toString(),
        }),
        redis.hSet(`game:${postId}:meta`, {
            postType: 'urjo-puzzle',
            challengeCreatorId: userId,
            creatorContentType: 'level',
            createdAt: createdAt.toString(),
            lockedGridSize: puzzle.gridSize.toString(),
        }),
        redis.hSet(`game:${postId}:stats`, { attempts: '0', beats: '0' }),
        redis.zAdd(`user:${userId}:createdChallenges`, { member: postId, score: createdAt }),
    ])
}

const serializePuzzle = (puzzle: SerializedPuzzle): Record<string, string> => ({
    colors: puzzle.colors,
    numbers: puzzle.numbers,
    solution: puzzle.solution,
    difficulty: puzzle.difficulty,
    gridSize: puzzle.gridSize.toString(),
})

const isDifficulty = (value: unknown): value is Difficulty =>
    typeof value === 'string' && DIFFICULTIES.includes(value as Difficulty)

const draftKey = (userId: string, draftId: string): string =>
    `user:${userId}:level-draft:${draftId}`

const redditCommentsUrl = (postId: string): string =>
    `https://reddit.com/comments/${postId.replace(/^t3_/, '')}`

const unauthorized = (c: Context): Response => c.json(
    { status: 'error', message: 'Sign in to create a level' },
    HTTP_STATUS_UNAUTHORIZED,
)

const invalidRequest = (c: Context, message: string): Response => c.json(
    { status: 'error', message },
    HTTP_STATUS_BAD_REQUEST,
)
