import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { get } from 'svelte/store'
import * as fc from 'fast-check'

// ─── Module under test ────────────────────────────────────────────────────────
// Imported after mocking fetch so the module sees the mock
import { firstActionLatchStore, fireOnce, resetLatch } from '../first-action'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockFetch = (): ReturnType<typeof vi.fn> => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ tracked: true }), { status: 200 })
    )
    return spy
}

// ─── Test isolation ───────────────────────────────────────────────────────────

beforeEach(() => {
    resetLatch()
})

afterEach(() => {
    vi.restoreAllMocks()
})

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('firstActionLatchStore — initial state', () => {
    it('starts with latched: false', () => {
        expect(get(firstActionLatchStore)).toEqual({ latched: false })
    })
})

describe('fireOnce', () => {
    it('sets latched to true after first call', async () => {
        mockFetch()
        await fireOnce('t3_abc123')
        expect(get(firstActionLatchStore)).toEqual({ latched: true })
    })

    it('POSTs to /api/game/first-action on first call', async () => {
        const spy = mockFetch()
        await fireOnce('t3_abc123')
        expect(spy).toHaveBeenCalledOnce()
        expect(spy).toHaveBeenCalledWith('/api/game/first-action', expect.objectContaining({
            method: 'POST',
        }))
    })

    it('does NOT POST on second call when latch is set', async () => {
        const spy = mockFetch()
        await fireOnce('t3_abc123')
        await fireOnce('t3_abc123')
        expect(spy).toHaveBeenCalledOnce()
    })

    it('does NOT POST on any subsequent call after latch is set', async () => {
        const spy = mockFetch()
        await fireOnce('t3_abc123')
        await fireOnce('t3_abc123')
        await fireOnce('t3_abc123')
        await fireOnce('t3_abc123')
        expect(spy).toHaveBeenCalledOnce()
    })

    it('leaves gameplay unaffected when POST fails (fire-and-forget)', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))
        // Should not throw
        await expect(fireOnce('t3_abc123')).resolves.toBeUndefined()
        // Latch is still set even on failure — prevents retry within session
        expect(get(firstActionLatchStore)).toEqual({ latched: true })
    })

    it('leaves gameplay unaffected when POST returns 5xx', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('Internal Server Error', { status: 500 })
        )
        await expect(fireOnce('t3_abc123')).resolves.toBeUndefined()
        expect(get(firstActionLatchStore)).toEqual({ latched: true })
    })

    it('sends postId in the request body', async () => {
        const spy = mockFetch()
        await fireOnce('t3_xyz789')
        const [, init] = spy.mock.calls[0] as [string, RequestInit]
        const body = JSON.parse(init.body as string) as Record<string, unknown>
        expect(body['postId']).toBe('t3_xyz789')
    })

    it('sends source in the request body', async () => {
        const spy = mockFetch()
        await fireOnce('t3_xyz789', 'play')
        const [, init] = spy.mock.calls[0] as [string, RequestInit]
        const body = JSON.parse(init.body as string) as Record<string, unknown>
        expect(body['source']).toBe('play')
    })
})

describe('resetLatch', () => {
    it('resets latched to false', async () => {
        mockFetch()
        await fireOnce('t3_abc123')
        expect(get(firstActionLatchStore)).toEqual({ latched: true })
        resetLatch()
        expect(get(firstActionLatchStore)).toEqual({ latched: false })
    })

    it('allows fireOnce to POST again after reset', async () => {
        const spy = mockFetch()
        await fireOnce('t3_abc123')
        resetLatch()
        await fireOnce('t3_abc123')
        expect(spy).toHaveBeenCalledTimes(2)
    })

    it('is idempotent — calling reset multiple times stays false', () => {
        resetLatch()
        resetLatch()
        resetLatch()
        expect(get(firstActionLatchStore)).toEqual({ latched: false })
    })
})

// ─── Property 1: First-Action Client Idempotence ──────────────────────────────
// Feature: funnel-truth-and-trigger, Property 1: First-Action Idempotence
// **Validates: Requirements 1.6, 2.4**

describe('Property 1: First-Action Client Idempotence', () => {
    it('count of POSTs equals min(1, N) for all N cell mutations in a session', () => {
        // **Validates: Requirements 1.6, 2.4**
        // For all sequences of N cell mutations within a single (postId, page-load)
        // session, the count of POSTs to /api/game/first-action equals min(1, N).
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 20 }),
                fc.string({ minLength: 1, maxLength: 20 }),
                (n, postId) => {
                    // Reset to simulate a fresh page-load session
                    resetLatch()
                    vi.restoreAllMocks()

                    let callCount = 0
                    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
                        callCount++
                        return new Response(JSON.stringify({ tracked: true }), { status: 200 })
                    })

                    // Simulate N cell mutations synchronously (fire-and-forget, no await needed
                    // for the latch check — the latch is set synchronously before the fetch)
                    for (let i = 0; i < n; i++) {
                        // fireOnce is async but the latch is set synchronously before fetch
                        // We call without await to simulate rapid cell taps
                        void fireOnce(postId)
                    }

                    // The latch is set on the first call, so only 1 POST should be issued
                    expect(callCount).toBe(Math.min(1, n))
                }
            ),
            { numRuns: 100 }
        )
    })
})
