import { writable } from 'svelte/store'

// ─── Types ────────────────────────────────────────────────────────────────────

export type HintKind = 'numberConstraint' | 'adjacencyViolation'

export type HintShownState = {
    numberConstraintShown: boolean
    adjacencyViolationShown: boolean
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const hintShownStore = writable<HintShownState>({
    numberConstraintShown: false,
    adjacencyViolationShown: false,
})

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Sets the in-session shown flag for the given hint kind.
 * Idempotent — calling multiple times has no additional effect.
 */
export const markShown = (kind: HintKind): void => {
    if (kind === 'numberConstraint') {
        hintShownStore.update((s) => ({ ...s, numberConstraintShown: true }))
    } else {
        hintShownStore.update((s) => ({ ...s, adjacencyViolationShown: true }))
    }
}

/**
 * Initializes the store from the server's `hintsDismissed` GameState field.
 * A server-side dismissal means the hint has already been shown and should
 * not appear again — treat it as shown for the duration of this session.
 */
export const hydrateFromServer = (hintsDismissed: {
    numberConstraint: boolean
    adjacencyViolation: boolean
}): void => {
    hintShownStore.set({
        numberConstraintShown: hintsDismissed.numberConstraint,
        adjacencyViolationShown: hintsDismissed.adjacencyViolation,
    })
}

/**
 * Persists the hint dismissal to the server via POST /api/game/hints/dismiss.
 * Fire-and-forget — failures are silently ignored so gameplay is never blocked.
 * The client-side session flag (set via markShown) prevents re-display within
 * the same session even if the server call fails.
 */
export const dismissPersistent = async (kind: HintKind): Promise<void> => {
    try {
        await fetch('/api/game/hints/dismiss', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind }),
        })
    } catch {
        // Non-blocking: hint will reappear next session if the server call fails,
        // but the in-session flag prevents re-display within the current session.
    }
}

/**
 * Resets both shown flags to false. Call on new puzzle load or session reset.
 */
export const resetHints = (): void => {
    hintShownStore.set({
        numberConstraintShown: false,
        adjacencyViolationShown: false,
    })
}
