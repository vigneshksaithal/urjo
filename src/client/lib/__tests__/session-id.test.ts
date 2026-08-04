import { describe, expect, it } from 'vitest'

import {
    createEventId,
    getAttemptId,
    getSessionId,
    measurementHeaders,
    renewAttemptId,
} from '../session-id'
import {
    ATTEMPT_ID_HEADER,
    CONTENT_ID_HEADER,
    EVENT_ID_HEADER,
    SESSION_ID_HEADER,
    isMeasurementId,
} from '../../../shared/measurement-contract'

describe('measurement ID lifecycle', () => {
    it('keeps one session ID for the page lifetime', () => {
        expect(getSessionId()).toBe(getSessionId())
        expect(isMeasurementId(getSessionId())).toBe(true)
    })

    it('keeps an attempt stable until explicitly renewed', () => {
        const first = getAttemptId()
        expect(getAttemptId()).toBe(first)

        const second = renewAttemptId()
        expect(second).not.toBe(first)
        expect(getAttemptId()).toBe(second)
    })

    it('creates a fresh event ID for every event', () => {
        const first = createEventId()
        const second = createEventId()
        expect(first).not.toBe(second)
        expect(isMeasurementId(first)).toBe(true)
        expect(isMeasurementId(second)).toBe(true)
    })

    it('builds a complete header set for an attempt event', () => {
        const headers = measurementHeaders('content_abc-123')
        expect(headers[SESSION_ID_HEADER]).toBe(getSessionId())
        expect(headers[CONTENT_ID_HEADER]).toBe('content_abc-123')
        expect(headers[ATTEMPT_ID_HEADER]).toBe(getAttemptId())
        expect(isMeasurementId(headers[EVENT_ID_HEADER])).toBe(true)
        expect(headers['Content-Type']).toBe('application/json')
    })
})
