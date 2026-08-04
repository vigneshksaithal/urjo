import type { UrjoBlitzState } from '../../shared/urjo-blitz'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type JsonRecord = Record<string, unknown>

export const loadUrjoBlitz = async (
    fetcher: Fetcher = fetch,
): Promise<UrjoBlitzState> => {
    const response = await fetcher('/api/urjo-blitz')
    const data = await readSuccessData(response)
    if (!isUrjoBlitzState(data)) throw new Error('Urjo Blitz is unavailable')
    return data
}

export const joinUrjoBlitz = async (
    fetcher: Fetcher = fetch,
): Promise<UrjoBlitzState> => {
    const response = await fetcher('/api/urjo-blitz/join', { method: 'POST' })
    await readSuccessData(response)
    return loadUrjoBlitz(fetcher)
}

export const formatBlitzRemaining = (endAt: string, nowMs = Date.now()): string => {
    const remainingSeconds = Math.ceil((Date.parse(endAt) - nowMs) / 1_000)
    if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return 'Ended'

    if (remainingSeconds < 3_600) {
        const minutes = Math.floor(remainingSeconds / 60)
        const seconds = remainingSeconds % 60
        return `${minutes}m ${String(seconds).padStart(2, '0')}s`
    }

    const hours = Math.floor(remainingSeconds / 3_600)
    const minutes = Math.floor((remainingSeconds % 3_600) / 60)
    return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

const readSuccessData = async (response: Response): Promise<unknown> => {
    const payload = await response.json().catch(() => null) as unknown
    if (!isRecord(payload)) throw new Error('Urjo Blitz returned an invalid response')
    if (!response.ok || payload.status !== 'success') {
        const message = typeof payload.message === 'string'
            ? payload.message
            : 'Urjo Blitz is unavailable'
        throw new Error(message)
    }
    return payload.data
}

const isUrjoBlitzState = (value: unknown): value is UrjoBlitzState => {
    if (!isRecord(value) || !Array.isArray(value.leaderboard)) return false
    const eventIsValid = value.event === null || isEvent(value.event)
    const viewerIsValid = value.viewer === null || isViewer(value.viewer)
    return eventIsValid && viewerIsValid && value.leaderboard.every(isLeaderboardEntry)
}

const isEvent = (value: unknown): boolean => {
    if (!isRecord(value)) return false
    return typeof value.eventId === 'string'
        && (value.status === 'active' || value.status === 'closed')
        && typeof value.startAt === 'string'
        && typeof value.endAt === 'string'
        && typeof value.updatedAt === 'string'
        && isNonNegativeInteger(value.participantCount)
        && isNonNegativeInteger(value.completionCount)
}

const isViewer = (value: unknown): boolean => {
    if (!isRecord(value)) return false
    const rankIsValid = value.rank === null || isPositiveInteger(value.rank)
    return typeof value.joined === 'boolean'
        && rankIsValid
        && isNonNegativeInteger(value.score)
}

const isLeaderboardEntry = (value: unknown): boolean => {
    if (!isRecord(value)) return false
    return isPositiveInteger(value.rank)
        && typeof value.username === 'string'
        && value.username.length > 0
        && isNonNegativeInteger(value.score)
}

const isRecord = (value: unknown): value is JsonRecord =>
    typeof value === 'object' && value !== null

const isNonNegativeInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0

const isPositiveInteger = (value: unknown): value is number =>
    isNonNegativeInteger(value) && value > 0
