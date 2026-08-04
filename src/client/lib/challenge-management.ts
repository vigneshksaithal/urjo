export type ManagedChallenge = {
    postId: string
    postUrl: string
    createdAt: string
    gridSize: 4 | 6 | 8 | null
    targetTime: number | null
    kind: 'challenge' | 'level'
}

export type ChallengeRemovalResult = {
    postId: string
    alreadyRemoved: boolean
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type JsonRecord = Record<string, unknown>

export class ChallengeRemovalError extends Error {
    readonly postUrl: string | null

    constructor(message: string, postUrl: string | null) {
        super(message)
        this.name = 'ChallengeRemovalError'
        this.postUrl = postUrl
    }
}

export const loadOwnedChallenges = async (
    fetcher: Fetcher = fetch,
): Promise<ManagedChallenge[]> => {
    const response = await fetcher('/api/challenges/mine')
    const data = await readSuccessData(response, 'Unable to load rival posts')
    if (!isRecord(data) || !Array.isArray(data.challenges)) {
        throw new Error('Rival post data is unavailable')
    }
    if (!data.challenges.every(isManagedChallenge)) {
        throw new Error('Rival post data is unavailable')
    }
    return data.challenges
}

export const removeOwnedChallenge = async (
    postId: string,
    fetcher: Fetcher = fetch,
): Promise<ChallengeRemovalResult> => {
    const response = await fetcher(`/api/challenges/${encodeURIComponent(postId)}`, {
        method: 'DELETE',
    })
    const payload = await readPayload(response)
    if (payload === null) {
        throw new ChallengeRemovalError('Unable to remove rival post', null)
    }
    if (!response.ok || payload.status !== 'success') {
        throwRemovalError(payload)
    }
    const data = payload.data
    if (!isRemovalResult(data) || data.postId !== postId) {
        throw new Error('Rival post removal could not be verified')
    }
    return { postId: data.postId, alreadyRemoved: data.alreadyRemoved }
}

const readSuccessData = async (response: Response, fallback: string): Promise<unknown> => {
    const payload = await readPayload(response)
    if (!response.ok || payload?.status !== 'success') {
        const message = typeof payload?.message === 'string' ? payload.message : fallback
        throw new Error(message)
    }
    return payload.data
}

const readPayload = async (response: Response): Promise<JsonRecord | null> => {
    const payload = await response.json().catch(() => null) as unknown
    return isRecord(payload) ? payload : null
}

const throwRemovalError = (payload: JsonRecord | null): never => {
    const message = typeof payload?.message === 'string'
        ? payload.message
        : 'Unable to remove rival post'
    const postUrl = isRedditPostUrl(payload?.postUrl) ? payload.postUrl : null
    throw new ChallengeRemovalError(message, postUrl)
}

const isManagedChallenge = (value: unknown): value is ManagedChallenge => {
    if (!isRecord(value)) return false
    const gridSize = value.gridSize
    const targetTime = value.targetTime
    return isPostId(value.postId)
        && isRedditPostUrl(value.postUrl)
        && isIsoTimestamp(value.createdAt)
        && (gridSize === null || gridSize === 4 || gridSize === 6 || gridSize === 8)
        && (targetTime === null || isPositiveInteger(targetTime))
        && (value.kind === 'challenge' || value.kind === 'level')
}

const isRemovalResult = (value: unknown): value is JsonRecord & {
    postId: string
    state: 'removed'
    alreadyRemoved: boolean
} => isRecord(value)
    && isPostId(value.postId)
    && value.state === 'removed'
    && typeof value.alreadyRemoved === 'boolean'

const isPostId = (value: unknown): value is string =>
    typeof value === 'string' && /^t3_[a-zA-Z0-9_]{1,64}$/.test(value)

const isRedditPostUrl = (value: unknown): value is string => {
    if (typeof value !== 'string') return false
    try {
        const url = new URL(value)
        const isRedditHost = url.hostname === 'reddit.com' || url.hostname === 'www.reddit.com'
        return url.protocol === 'https:' && isRedditHost && url.pathname.startsWith('/comments/')
    } catch {
        return false
    }
}

const isIsoTimestamp = (value: unknown): value is string =>
    typeof value === 'string' && Number.isFinite(Date.parse(value))

const isPositiveInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0

const isRecord = (value: unknown): value is JsonRecord =>
    typeof value === 'object' && value !== null
