import { describe, expect, it } from 'vitest'

import {
    ATTEMPT_ID_HEADER,
    CONTENT_ID_HEADER,
    EVENT_ID_HEADER,
    MEASUREMENT_SCHEMA_VERSION,
    SESSION_ID_HEADER,
    isMeasurementId,
    parseMeasurementHeaders,
} from '../measurement-contract'

describe('measurement contract', () => {
    it('publishes stable v2 header names', () => {
        expect(MEASUREMENT_SCHEMA_VERSION).toBe(2)
        expect(SESSION_ID_HEADER).toBe('x-urjo-session')
        expect(CONTENT_ID_HEADER).toBe('x-urjo-content')
        expect(ATTEMPT_ID_HEADER).toBe('x-urjo-attempt')
        expect(EVENT_ID_HEADER).toBe('x-urjo-event')
    })

    it('accepts bounded opaque identifiers and rejects unsafe values', () => {
        expect(isMeasurementId('session_abc-123')).toBe(true)
        expect(isMeasurementId('short')).toBe(false)
        expect(isMeasurementId('contains:delimiter')).toBe(false)
        expect(isMeasurementId('contains whitespace')).toBe(false)
        expect(isMeasurementId('a'.repeat(65))).toBe(false)
    })

    it('parses valid identifiers and nulls invalid or missing headers', () => {
        const headers = new Headers({
            [SESSION_ID_HEADER]: 'session_abc-123',
            [CONTENT_ID_HEADER]: 'content_abc-123',
            [ATTEMPT_ID_HEADER]: 'attempt_abc-123',
            [EVENT_ID_HEADER]: 'event_abc-123',
        })

        expect(parseMeasurementHeaders(headers)).toEqual({
            sessionId: 'session_abc-123',
            contentId: 'content_abc-123',
            attemptId: 'attempt_abc-123',
            eventId: 'event_abc-123',
        })

        headers.set(EVENT_ID_HEADER, 'invalid event')
        headers.delete(CONTENT_ID_HEADER)
        expect(parseMeasurementHeaders(headers)).toEqual({
            sessionId: 'session_abc-123',
            contentId: null,
            attemptId: 'attempt_abc-123',
            eventId: null,
        })
    })
})
