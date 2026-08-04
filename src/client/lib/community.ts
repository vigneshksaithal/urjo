export type CommunityStatus = { joinedViaUrjo: boolean }
export type CommunityJoinResult = { joined: true; subredditName: string }

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type JsonRecord = Record<string, unknown>

export const loadCommunityStatus = async (
    fetcher: Fetcher = fetch,
): Promise<CommunityStatus> => {
    const response = await fetcher('/api/community/status')
    const data = await readSuccessData(response)
    if (!isRecord(data) || typeof data.joinedViaUrjo !== 'boolean') {
        throw new Error('Community status is unavailable')
    }
    return { joinedViaUrjo: data.joinedViaUrjo }
}

export const joinCommunity = async (
    fetcher: Fetcher = fetch,
): Promise<CommunityJoinResult> => {
    const response = await fetcher('/api/community/join', { method: 'POST' })
    const data = await readSuccessData(response)
    if (
        !isRecord(data) ||
        data.joined !== true ||
        typeof data.subredditName !== 'string' ||
        data.subredditName.length === 0
    ) throw new Error('Community Join could not be verified')
    return { joined: true, subredditName: data.subredditName }
}

const readSuccessData = async (response: Response): Promise<unknown> => {
    const payload = await response.json().catch(() => null) as unknown
    if (!isRecord(payload)) throw new Error('Community service returned an invalid response')
    if (!response.ok || payload.status !== 'success') {
        const message = typeof payload.message === 'string'
            ? payload.message
            : 'Unable to join r/urjo'
        throw new Error(message)
    }
    return payload.data
}

const isRecord = (value: unknown): value is JsonRecord =>
    typeof value === 'object' && value !== null
