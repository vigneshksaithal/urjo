import type { GridSize } from './constants'

export const URJO_BLITZ_CHANNEL = 'urjo_blitz_live'

export type UrjoBlitzStatus = 'active' | 'closed'

export type UrjoBlitzEvent = {
    eventId: string
    status: UrjoBlitzStatus
    startAt: string
    endAt: string
    updatedAt: string
    participantCount: number
    completionCount: number
}

export type UrjoBlitzLeaderboardEntry = {
    rank: number
    username: string
    score: number
}

export type UrjoBlitzViewer = {
    joined: boolean
    rank: number | null
    score: number
}

export type UrjoBlitzState = {
    event: UrjoBlitzEvent | null
    leaderboard: UrjoBlitzLeaderboardEntry[]
    viewer: UrjoBlitzViewer | null
}

export type UrjoBlitzSummaryEvent = {
    type: 'urjo-blitz-summary'
    eventId: string
    status: UrjoBlitzStatus
    participantCount: number
    completionCount: number
    updatedAt: string
}

export const getUrjoBlitzEventId = (date: Date): string => {
    if (!Number.isFinite(date.getTime())) throw new Error('Urjo Blitz date is invalid')

    const thursday = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 4 - (date.getUTCDay() || 7),
    ))
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
    const elapsedDays = Math.floor((thursday.getTime() - yearStart.getTime()) / 86_400_000)
    const week = Math.ceil((elapsedDays + 1) / 7)
    return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export const isUrjoBlitzEventId = (value: unknown): value is string =>
    typeof value === 'string' && /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(value)

export const getUrjoBlitzPoints = (gridSize: number): number => {
    const points: Partial<Record<GridSize, number>> = { 4: 1, 6: 2, 8: 3 }
    const value = points[gridSize as GridSize]
    if (value === undefined) throw new Error('Unsupported Urjo Blitz grid size')
    return value
}
