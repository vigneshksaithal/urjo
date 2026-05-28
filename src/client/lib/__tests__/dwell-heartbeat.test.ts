/**
 * Tests for client-side dwell heartbeat pure logic and side-effecting driver.
 *
 * The pure functions (clampFrameDeltaMs, accumulateFrame, generateSessionId)
 * are covered with unit + property tests. The driver (startHeartbeat) is
 * tested with stubbed rAF / fetch so we can step time deterministically.
 */

import { describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'

import {
    accumulateFrame,
    clampFrameDeltaMs,
    createAccumulator,
    generateSessionId,
    SESSION_HEADER,
    startHeartbeat,
    TICK_INTERVAL_MS,
} from '../dwell-heartbeat'

// ─── clampFrameDeltaMs ────────────────────────────────────────────────────────

describe('clampFrameDeltaMs', () => {
    it('passes through small foreground deltas (~16ms)', () => {
        expect(clampFrameDeltaMs(16)).toBe(16)
        expect(clampFrameDeltaMs(33)).toBe(33)
    })

    it('returns 0 for non-positive or non-finite deltas', () => {
        expect(clampFrameDeltaMs(0)).toBe(0)
        expect(clampFrameDeltaMs(-5)).toBe(0)
        expect(clampFrameDeltaMs(NaN)).toBe(0)
        expect(clampFrameDeltaMs(Infinity)).toBe(0)
    })

    it('returns 0 for suspended-tab time jumps (> 1500ms)', () => {
        expect(clampFrameDeltaMs(1501)).toBe(0)
        expect(clampFrameDeltaMs(60_000)).toBe(0)
    })

    it('property: result is always within [0, 1500]', () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.float(), fc.integer(), fc.constant(NaN), fc.constant(Infinity)),
                (delta) => {
                    const out = clampFrameDeltaMs(delta)
                    expect(out).toBeGreaterThanOrEqual(0)
                    expect(out).toBeLessThanOrEqual(1500)
                },
            ),
            { numRuns: 200 },
        )
    })
})

// ─── accumulateFrame ──────────────────────────────────────────────────────────

describe('accumulateFrame', () => {
    it('does not flush before the interval is reached', () => {
        const step = accumulateFrame(createAccumulator(), 16)
        expect(step.flushSeconds).toBe(0)
        expect(step.state.pendingMs).toBe(16)
        expect(step.capped).toBe(false)
    })

    it('flushes whole seconds once accumulated past TICK_INTERVAL_MS', () => {
        // Simulate frames totaling 5000ms in 16ms ticks.
        let state = createAccumulator()
        let totalFlushed = 0
        for (let i = 0; i < 313; i++) {
            const step = accumulateFrame(state, 16)
            state = step.state
            totalFlushed += step.flushSeconds
        }
        // 313 * 16 = 5008 ms, ≥ 5000 → flushes 5s once
        expect(totalFlushed).toBe(5)
        // Pending remainder is 8ms (5008 - 5000)
        expect(state.pendingMs).toBe(8)
    })

    it('drops suspended-tab gaps so they do not credit dwell', () => {
        const step = accumulateFrame(createAccumulator(), 30_000)
        expect(step.flushSeconds).toBe(0)
        expect(step.state.pendingMs).toBe(0)
    })

    it('signals capped=true when totalMs reaches 60s', () => {
        let state = createAccumulator()
        let lastStep = accumulateFrame(state, 1000)
        // Push 60s of accumulated time in 1s chunks.
        for (let i = 0; i < 60; i++) {
            lastStep = accumulateFrame(state, 1000)
            state = lastStep.state
        }
        expect(lastStep.capped).toBe(true)
    })

    it('property: pendingMs is always < intervalMs after a step', () => {
        fc.assert(
            fc.property(
                fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 50 }),
                (deltas) => {
                    let state = createAccumulator()
                    for (const d of deltas) {
                        state = accumulateFrame(state, d).state
                    }
                    expect(state.pendingMs).toBeLessThan(TICK_INTERVAL_MS)
                    expect(state.pendingMs).toBeGreaterThanOrEqual(0)
                },
            ),
            { numRuns: 100 },
        )
    })
})

// ─── generateSessionId ────────────────────────────────────────────────────────

describe('generateSessionId', () => {
    it('returns a non-empty string', () => {
        const id = generateSessionId()
        expect(typeof id).toBe('string')
        expect(id.length).toBeGreaterThan(0)
        expect(id.length).toBeLessThanOrEqual(64) // server-side header cap
    })

    it('returns distinct ids on repeated calls', () => {
        const ids = new Set<string>()
        for (let i = 0; i < 50; i++) ids.add(generateSessionId())
        expect(ids.size).toBe(50)
    })
})

// ─── startHeartbeat (driver) ──────────────────────────────────────────────────

describe('startHeartbeat', () => {
    /**
     * Build a deterministic rAF stub that drains queued frames when we
     * call drain(). Each drain delivers the next timestamp from `times`.
     */
    const makeRafHarness = (times: number[]): {
        requestFrame: (cb: (t: number) => void) => number
        cancelFrame: (h: number) => void
        drainAll: () => void
        cancellations: number
    } => {
        const queue: Array<(t: number) => void> = []
        let nextHandle = 1
        let cancellations = 0
        let i = 0

        const requestFrame = (cb: (t: number) => void): number => {
            queue.push(cb)
            return nextHandle++
        }
        const cancelFrame = (_h: number): void => {
            cancellations++
        }
        const drainAll = (): void => {
            // Drain until queue is empty AND no new frames are scheduled.
            while (queue.length > 0 && i < times.length) {
                const cb = queue.shift()
                if (cb !== undefined) {
                    const t = times[i] ?? times[times.length - 1] ?? 0
                    i++
                    cb(t)
                }
            }
        }
        return {
            requestFrame,
            cancelFrame,
            drainAll,
            get cancellations(): number { return cancellations },
        }
    }

    it('emits a single tick after ~5s of accumulated frames', () => {
        // 0 → 16 → 32 → ... → 5008 ms (314 frames of ~16ms each)
        const times = [0]
        for (let i = 0; i < 314; i++) times.push(times[times.length - 1]! + 16)

        const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
        const harness = makeRafHarness(times)

        const handle = startHeartbeat({
            sessionId: 'sess-test',
            requestFrame: harness.requestFrame,
            cancelFrame: harness.cancelFrame,
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })
        harness.drainAll()
        handle.stop()

        // Exactly one fetch call, with sessionId header and tickSeconds=5.
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        const [url, init] = fetchImpl.mock.calls[0]!
        expect(url).toBe('/api/dwell/tick')
        const headers = (init as RequestInit).headers as Record<string, string>
        expect(headers[SESSION_HEADER]).toBe('sess-test')
        const body = JSON.parse((init as RequestInit).body as string)
        expect(body.tickSeconds).toBe(5)
    })

    it('stops scheduling new frames once the session cap is reached', () => {
        // Realistic 16ms frame intervals — 60s of foreground = 60_000ms = ~3750 frames.
        // Each 5s of accumulation flushes one tick; cap at 60s = 12 ticks total.
        const FRAME_MS = 16
        const FRAMES_TO_CAP = Math.ceil(60_000 / FRAME_MS) + 5 // small buffer
        const times: number[] = [0]
        for (let i = 0; i < FRAMES_TO_CAP; i++) {
            times.push(times[times.length - 1]! + FRAME_MS)
        }

        const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
        const harness = makeRafHarness(times)

        const handle = startHeartbeat({
            sessionId: 'sess-cap',
            requestFrame: harness.requestFrame,
            cancelFrame: harness.cancelFrame,
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })
        harness.drainAll()

        // Stop after cap should be a no-op (handle already self-terminated).
        handle.stop()

        // 60s of foreground / 5s per tick = 12 ticks before the cap stops the loop.
        expect(fetchImpl).toHaveBeenCalledTimes(12)
    })

    it('stop() before any frame fires cancels the pending rAF handle', () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
        const harness = makeRafHarness([0, 16])

        const handle = startHeartbeat({
            requestFrame: harness.requestFrame,
            cancelFrame: harness.cancelFrame,
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })
        handle.stop()
        harness.drainAll()

        expect(fetchImpl).not.toHaveBeenCalled()
        expect(harness.cancellations).toBe(1)
    })

    it('stop() is idempotent', () => {
        const harness = makeRafHarness([0, 16])
        const handle = startHeartbeat({
            requestFrame: harness.requestFrame,
            cancelFrame: harness.cancelFrame,
            fetchImpl: vi.fn().mockResolvedValue(new Response(null)) as unknown as typeof fetch,
        })
        handle.stop()
        handle.stop()
        handle.stop()
        expect(harness.cancellations).toBe(1)
    })

    it('swallows fetch failures without throwing', async () => {
        const times = [0]
        for (let i = 0; i < 314; i++) times.push(times[times.length - 1]! + 16)

        const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'))
        const harness = makeRafHarness(times)

        // Spawning the heartbeat with a rejecting fetch must not throw.
        expect(() => {
            const handle = startHeartbeat({
                requestFrame: harness.requestFrame,
                cancelFrame: harness.cancelFrame,
                fetchImpl: fetchImpl as unknown as typeof fetch,
            })
            harness.drainAll()
            handle.stop()
        }).not.toThrow()

        // Allow the swallowed promise to settle so the test runner doesn't flag it.
        await new Promise((r) => setTimeout(r, 0))
    })
})
