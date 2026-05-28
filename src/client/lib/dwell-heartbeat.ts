/**
 * Dwell Heartbeat — client-side active-foreground time accumulator.
 *
 * Wakes via requestAnimationFrame so it only ticks when the document is
 * actually in the foreground (browsers throttle/suspend rAF for hidden
 * tabs and backgrounded webviews — that gives us "active foreground" for
 * free, with no manual tab-visibility bookkeeping).
 *
 * Every TICK_INTERVAL_MS of accumulated active time, we POST the elapsed
 * delta to the server. The server caps the per-session total — see
 * lib/qualified.ts MAX_DWELL_SECONDS — so over-shooting on the client is
 * harmless.
 *
 * The pure logic (clamp, accumulate, decide-when-to-flush) lives below
 * and is unit-tested. The Svelte component drives `start()` from onMount
 * and `stop()` from onDestroy.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Flush a tick to the server every 5s of accumulated active time. */
export const TICK_INTERVAL_MS = 5_000

/** Server-side cap (mirrors qualified.ts MAX_DWELL_SECONDS). */
const SERVER_CAP_SECONDS = 60

/** Per-frame-pair max delta — guards against suspended-tab time jumps. */
const MAX_FRAME_DELTA_MS = 1_500

/** Header used to identify a play session across requests. */
export const SESSION_HEADER = 'x-urjo-session'

// ─── Pure Logic ───────────────────────────────────────────────────────────────

/**
 * Clamp a per-frame delta. rAF callbacks fire ~16ms apart in the
 * foreground, but a tab that was hidden and just resumed can produce a
 * very large delta — we treat anything over MAX_FRAME_DELTA_MS as a
 * suspension boundary and credit nothing for that gap.
 */
export const clampFrameDeltaMs = (deltaMs: number): number => {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0
    if (deltaMs > MAX_FRAME_DELTA_MS) return 0
    return deltaMs
}

/** Mutable accumulator state — exposed for tests. */
export type AccumulatorState = {
    /** Accumulated active-foreground ms not yet flushed to the server. */
    pendingMs: number
    /** Total ms ever accumulated this session (for cap-stop logic). */
    totalMs: number
}

export const createAccumulator = (): AccumulatorState => ({
    pendingMs: 0,
    totalMs: 0,
})

/** Result of a single accumulation step. */
export type AccumulationStep = {
    /** Updated accumulator. */
    state: AccumulatorState
    /** Whole seconds to flush to the server now (0 = nothing to send). */
    flushSeconds: number
    /** Whether we've reached the session cap and should stop ticking. */
    capped: boolean
}

/**
 * Pure step: fold a frame-delta into the accumulator and return whatever
 * whole seconds are ready to flush. Called once per rAF frame.
 */
export const accumulateFrame = (
    state: AccumulatorState,
    frameDeltaMs: number,
    intervalMs: number = TICK_INTERVAL_MS,
): AccumulationStep => {
    const safeDelta = clampFrameDeltaMs(frameDeltaMs)
    const nextPending = state.pendingMs + safeDelta
    const nextTotal = state.totalMs + safeDelta

    // Only flush in whole-second multiples once we've crossed the interval.
    if (nextPending < intervalMs) {
        return {
            state: { pendingMs: nextPending, totalMs: nextTotal },
            flushSeconds: 0,
            capped: nextTotal >= SERVER_CAP_SECONDS * 1000,
        }
    }

    const flushSeconds = Math.floor(nextPending / 1000)
    const remainderMs = nextPending - flushSeconds * 1000

    return {
        state: { pendingMs: remainderMs, totalMs: nextTotal },
        flushSeconds,
        capped: nextTotal >= SERVER_CAP_SECONDS * 1000,
    }
}

// ─── Session ID ──────────────────────────────────────────────────────────────

/**
 * Generate a fresh session id. Uses crypto.randomUUID when available,
 * falls back to a Math.random-based slug. Exported so tests can stub.
 */
export const generateSessionId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    // Fallback: 22-char base36 slug — well under the server's 64-char limit.
    const part = (): string => Math.random().toString(36).slice(2, 13)
    return `${part()}-${part()}`
}

// ─── Side-effecting Driver ───────────────────────────────────────────────────

export type HeartbeatHandle = {
    sessionId: string
    stop: () => void
}

type StartOptions = {
    /** Session id to use. Defaults to a freshly generated one. */
    sessionId?: string
    /** Test seam — defaults to globalThis.requestAnimationFrame. */
    requestFrame?: (cb: (timestamp: number) => void) => number
    /** Test seam — defaults to globalThis.cancelAnimationFrame. */
    cancelFrame?: (handle: number) => void
    /** Test seam — defaults to globalThis.fetch. */
    fetchImpl?: typeof fetch
}

/**
 * Begin emitting heartbeats. Idempotent guarantees:
 *   - the returned `stop()` is safe to call multiple times
 *   - calling stop() before the first frame still cleans up the rAF handle
 *   - once the session cap is reached, the loop self-terminates so we
 *     don't burn battery sending no-op ticks
 *
 * Network failures are silently swallowed — instrumentation must never
 * break gameplay (matches the project-wide pattern in fireOnce, etc.).
 */
export const startHeartbeat = (opts: StartOptions = {}): HeartbeatHandle => {
    const sessionId = opts.sessionId ?? generateSessionId()
    const requestFrame = opts.requestFrame ?? globalThis.requestAnimationFrame.bind(globalThis)
    const cancelFrame = opts.cancelFrame ?? globalThis.cancelAnimationFrame.bind(globalThis)
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis)

    let state = createAccumulator()
    let lastTimestamp: number | null = null
    let rafHandle: number | null = null
    let stopped = false

    const flushTick = (seconds: number): void => {
        if (seconds <= 0) return
        // Fire-and-forget — failures must not affect gameplay.
        void fetchImpl('/api/dwell/tick', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                [SESSION_HEADER]: sessionId,
            },
            body: JSON.stringify({ tickSeconds: seconds }),
        }).catch(() => {
            // Silently ignored.
        })
    }

    const onFrame = (timestamp: number): void => {
        if (stopped) return

        if (lastTimestamp !== null) {
            const delta = timestamp - lastTimestamp
            const step = accumulateFrame(state, delta)
            state = step.state

            if (step.flushSeconds > 0) {
                flushTick(step.flushSeconds)
            }

            if (step.capped) {
                stopped = true
                return
            }
        }

        lastTimestamp = timestamp
        rafHandle = requestFrame(onFrame)
    }

    rafHandle = requestFrame(onFrame)

    return {
        sessionId,
        stop: (): void => {
            if (stopped) return
            stopped = true
            if (rafHandle !== null) {
                cancelFrame(rafHandle)
                rafHandle = null
            }
        },
    }
}
