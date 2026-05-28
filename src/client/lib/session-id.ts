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

import { generateSessionId, SESSION_HEADER } from './dwell-heartbeat'

let cachedSessionId: string | null = null

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

/**
 * Test seam — reset the cached id so tests can simulate a fresh page load.
 */
export const resetSessionIdForTests = (): void => {
    cachedSessionId = null
}

/**
 * Convenience: build a Headers object pre-stamped with `Content-Type` and
 * the session id. Centralizes the header name so it doesn't drift across
 * call sites.
 */
export const sessionHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
    'Content-Type': 'application/json',
    [SESSION_HEADER]: getSessionId(),
    ...extra,
})
