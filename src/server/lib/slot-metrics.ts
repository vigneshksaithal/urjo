import { redis } from '@devvit/web/server'

export const SCHEDULED_SLOT_EVENT_TYPES = [
    'opens',
    'firstActions',
    'completions',
] as const

export type ScheduledSlotEvent = typeof SCHEDULED_SLOT_EVENT_TYPES[number]

export type ScheduledSlotMetrics = {
    date: string
    audience: 'signed-in'
    slotKey: string
    gridSize: 6 | 8
    opens: number
    firstActions: number
    completions: number
    actionRate: number | null
    completionRate: number | null
    openToCompletionRate: number | null
}

const METRICS_TTL_SECONDS = 45 * 24 * 60 * 60
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SLOT_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const metricsKey = (date: string): string => `metrics:${date}:scheduled-slots`

const metricField = (
    slotKey: string,
    gridSize: 6 | 8,
    event: ScheduledSlotEvent,
): string => `${slotKey}|${gridSize}|${event}`

export const recordScheduledSlotEvent = async (
    date: string,
    postId: string,
    event: ScheduledSlotEvent,
): Promise<boolean> => {
    if (!ISO_DATE_PATTERN.test(date) || !SCHEDULED_SLOT_EVENT_TYPES.includes(event)) return false
    const meta = await redis.hGetAll(`game:${postId}:meta`)
    const slotKey = meta.scheduledSlotKey
    const rawGridSize = Number(meta.scheduledGridSize)
    if (
        typeof slotKey !== 'string' ||
        !SLOT_KEY_PATTERN.test(slotKey) ||
        (rawGridSize !== 6 && rawGridSize !== 8)
    ) return false

    const key = metricsKey(date)
    await redis.hIncrBy(key, metricField(slotKey, rawGridSize, event), 1)
    await redis.expire(key, METRICS_TTL_SECONDS)
    return true
}

export const readScheduledSlotMetrics = async (
    date: string,
): Promise<ScheduledSlotMetrics[]> => {
    if (!ISO_DATE_PATTERN.test(date)) return []
    const fields = await redis.hGetAll(metricsKey(date))
    const aggregates = new Map<string, ScheduledSlotMetrics>()

    for (const [field, rawCount] of Object.entries(fields)) {
        const parsed = parseField(field)
        if (parsed === null) continue
        const key = `${parsed.slotKey}|${parsed.gridSize}`
        const current = aggregates.get(key) ?? emptyMetrics(date, parsed.slotKey, parsed.gridSize)
        aggregates.set(key, {
            ...current,
            [parsed.event]: parseCount(rawCount),
        })
    }

    return [...aggregates.values()]
        .map(withRates)
        .sort((left, right) => left.slotKey.localeCompare(right.slotKey))
}

const parseField = (field: string): {
    slotKey: string
    gridSize: 6 | 8
    event: ScheduledSlotEvent
} | null => {
    const [slotKey, rawGridSize, rawEvent, extra] = field.split('|')
    const gridSize = Number(rawGridSize)
    if (
        extra !== undefined ||
        typeof slotKey !== 'string' ||
        !SLOT_KEY_PATTERN.test(slotKey) ||
        (gridSize !== 6 && gridSize !== 8) ||
        !SCHEDULED_SLOT_EVENT_TYPES.includes(rawEvent as ScheduledSlotEvent)
    ) return null

    return { slotKey, gridSize, event: rawEvent as ScheduledSlotEvent }
}

const emptyMetrics = (
    date: string,
    slotKey: string,
    gridSize: 6 | 8,
): ScheduledSlotMetrics => ({
    date,
    audience: 'signed-in',
    slotKey,
    gridSize,
    opens: 0,
    firstActions: 0,
    completions: 0,
    actionRate: null,
    completionRate: null,
    openToCompletionRate: null,
})

const withRates = (metrics: ScheduledSlotMetrics): ScheduledSlotMetrics => ({
    ...metrics,
    actionRate: metrics.opens > 0 ? metrics.firstActions / metrics.opens : null,
    completionRate: metrics.firstActions > 0
        ? metrics.completions / metrics.firstActions
        : null,
    openToCompletionRate: metrics.opens > 0 ? metrics.completions / metrics.opens : null,
})

const parseCount = (raw: string | undefined): number => {
    const value = parseInt(raw ?? '0', 10)
    return Number.isNaN(value) || value < 0 ? 0 : value
}
