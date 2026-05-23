/**
 * Session-run store.
 *
 * Tracks how many puzzles the player has solved consecutively WITHOUT closing
 * the app. This is the Subway-Surfers "Run Again" loop: every continued run
 * within a session multiplies the next-puzzle reward, and the count itself is
 * displayed prominently so the player feels momentum.
 *
 * - Persisted to sessionStorage so a transient reload (refresh, navigation
 *   within the post) doesn't erase the streak.
 * - Cleared automatically when the browser tab closes (sessionStorage scope)
 *   so a "fresh open tomorrow" starts cleanly at 1.
 * - Capped at SESSION_RUN_MAX so the multiplier doesn't run away.
 */

import { writable } from 'svelte/store'

const STORAGE_KEY = 'urjo:sessionRun'
const SESSION_RUN_MAX = 50

const readInitial = (): number => {
    if (typeof sessionStorage === 'undefined') return 0
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw === null) return 0
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n >= 0 ? Math.min(n, SESSION_RUN_MAX) : 0
}

const persist = (value: number): void => {
    if (typeof sessionStorage === 'undefined') return
    try {
        sessionStorage.setItem(STORAGE_KEY, String(value))
    } catch {
        // Quota errors / private mode — non-critical
    }
}

export const sessionRunStore = writable<number>(readInitial())

/**
 * Increment the session run counter (called after each completed puzzle).
 * Returns the new value.
 */
export const incrementSessionRun = (): number => {
    let next = 0
    sessionRunStore.update((v) => {
        next = Math.min(v + 1, SESSION_RUN_MAX)
        persist(next)
        return next
    })
    return next
}

/**
 * Read the current session run synchronously without subscribing.
 */
export const getSessionRun = (): number => {
    if (typeof sessionStorage === 'undefined') return 0
    return readInitial()
}

/**
 * Reset the counter — used when a player explicitly bails out (rare) or when
 * the session is determined invalid (e.g. day rollover).
 */
export const resetSessionRun = (): void => {
    sessionRunStore.set(0)
    persist(0)
}

/**
 * Compute the session-run coin multiplier on the CLIENT side (for display
 * preview only). The server is the source of truth — see
 * src/shared/session-run.ts and the /api/game/complete handler.
 */
export { getSessionRunMultiplier } from '../../shared/session-run'
