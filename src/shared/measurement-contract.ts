export const MEASUREMENT_SCHEMA_VERSION = 2 as const

export const SESSION_ID_HEADER = 'x-urjo-session'
export const CONTENT_ID_HEADER = 'x-urjo-content'
export const ATTEMPT_ID_HEADER = 'x-urjo-attempt'
export const EVENT_ID_HEADER = 'x-urjo-event'

const MEASUREMENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export const isMeasurementId = (value: unknown): value is string =>
    typeof value === 'string' && MEASUREMENT_ID_PATTERN.test(value)

export type ParsedMeasurementHeaders = {
    sessionId: string | null
    contentId: string | null
    attemptId: string | null
    eventId: string | null
}

const readMeasurementHeader = (headers: Headers, name: string): string | null => {
    const value = headers.get(name)
    return isMeasurementId(value) ? value : null
}

export const parseMeasurementHeaders = (headers: Headers): ParsedMeasurementHeaders => ({
    sessionId: readMeasurementHeader(headers, SESSION_ID_HEADER),
    contentId: readMeasurementHeader(headers, CONTENT_ID_HEADER),
    attemptId: readMeasurementHeader(headers, ATTEMPT_ID_HEADER),
    eventId: readMeasurementHeader(headers, EVENT_ID_HEADER),
})
