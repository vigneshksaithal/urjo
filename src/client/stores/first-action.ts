import { writable } from 'svelte/store'

import { sessionHeaders } from '../lib/session-id'
import type { FirstActionSource } from '../../shared/first-action'

export type { FirstActionSource } from '../../shared/first-action'

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Session-scoped latch that ensures at most one POST to /api/game/first-action
 * per (postId, page-load) session.
 *
 * The latch is set synchronously before the fetch so that rapid concurrent
 * calls (e.g. fast cell taps) cannot race past the guard.
 */
export const firstActionLatchStore = writable<{ latched: boolean }>({ latched: false })

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Fire the first-action POST exactly once per session.
 *
 * Checks the latch synchronously, sets it to true, then POSTs fire-and-forget.
 * Failures are silently swallowed — gameplay must never be blocked (Req 1.4).
 *
 * Sends the per-page-load session id via the `x-urjo-session` header so the
 * server-side DQP gate can correlate this tap with referrer + dwell.
 */
export const fireOnce = async (
    postId: string,
    source: FirstActionSource = 'unknown',
): Promise<void> => {
    let alreadyLatched = false

    firstActionLatchStore.update((state) => {
        if (state.latched) {
            alreadyLatched = true
            return state
        }
        return { latched: true }
    })

    if (alreadyLatched) return

    try {
        await fetch('/api/game/first-action', {
            method: 'POST',
            headers: sessionHeaders(),
            body: JSON.stringify({ postId, source }),
        })
    } catch {
        // Fire-and-forget: failures do not affect gameplay (Req 1.4)
    }
}

/**
 * Reset the latch for a new puzzle session.
 *
 * Call on: loadGame, handleNextChallenge, handleRestart, handleGridSizeChange.
 */
export const resetLatch = (): void => {
    firstActionLatchStore.set({ latched: false })
}
