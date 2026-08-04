/**
 * Per-page-load session id, shared across all client modules.
 *
 * The DQP gate (server-side) ties referrer + first-tap + dwell into a
 * single qualified-session record by this id. Every fetch the client
 * makes during the session must send it as the `x-urjo-session` header.
 *
 * The id is generated lazily on first read so server-side imports
 * (e.g. unit tests for stores) don't crash when `crypto.randomUUID` is
 * unavailable; it's only minted when the running webview actually needs
 * it.
 */

import {
    ATTEMPT_ID_HEADER,
    CONTENT_ID_HEADER,
    EVENT_ID_HEADER,
    SESSION_ID_HEADER,
    isMeasurementId,
} from '../../shared/measurement-contract'
import { generateSessionId } from './dwell-heartbeat'

let cachedSessionId: string | null = null
let cachedAttemptId: string | null = null

/**
 * Get (and lazily mint) the per-page-load session id. Stable for the
 * lifetime of the page, regenerated only on full reload.
 */
export const getSessionId = (): string => {
    if (cachedSessionId === null) {
        cachedSessionId = generateSessionId()
    }
    return cachedSessionId
}

export const getAttemptId = (): string => {
    if (cachedAttemptId === null) {
        cachedAttemptId = generateSessionId()
    }
    return cachedAttemptId
}

export const renewAttemptId = (): string => {
    cachedAttemptId = generateSessionId()
    return cachedAttemptId
}

export const createEventId = (): string => generateSessionId()

/**
 * Convenience: build a Headers object pre-stamped with `Content-Type` and
 * the session id. Centralizes the header name so it doesn't drift across
 * call sites.
 */
export const sessionHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
    'Content-Type': 'application/json',
    [SESSION_ID_HEADER]: getSessionId(),
    ...extra,
})

export const measurementHeaders = (
    contentId: string,
    extra: Record<string, string> = {},
): Record<string, string> => {
    if (!isMeasurementId(contentId)) throw new Error('Invalid measurement content ID')

    return {
        'Content-Type': 'application/json',
        [SESSION_ID_HEADER]: getSessionId(),
        [CONTENT_ID_HEADER]: contentId,
        [ATTEMPT_ID_HEADER]: getAttemptId(),
        [EVENT_ID_HEADER]: createEventId(),
        ...extra,
    }
}
