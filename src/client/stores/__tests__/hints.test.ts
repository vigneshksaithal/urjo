import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { get } from 'svelte/store'
import {
    hintShownStore,
    markShown,
    hydrateFromServer,
    dismissPersistent,
    resetHints,
} from '../hints'

// ─── Test isolation ───────────────────────────────────────────────────────────

beforeEach(() => {
    resetHints()
    vi.restoreAllMocks()
})

afterEach(() => {
    vi.restoreAllMocks()
})

// ─── Test 1: Initial state ────────────────────────────────────────────────────

describe('hintShownStore — initial state', () => {
    it('starts with both flags false', () => {
        const state = get(hintShownStore)
        expect(state.numberConstraintShown).toBe(false)
        expect(state.adjacencyViolationShown).toBe(false)
    })
})

// ─── Test 2: markShown ────────────────────────────────────────────────────────

describe('markShown', () => {
    it('sets numberConstraintShown to true when kind is numberConstraint', () => {
        markShown('numberConstraint')
        expect(get(hintShownStore).numberConstraintShown).toBe(true)
        expect(get(hintShownStore).adjacencyViolationShown).toBe(false)
    })

    it('sets adjacencyViolationShown to true when kind is adjacencyViolation', () => {
        markShown('adjacencyViolation')
        expect(get(hintShownStore).adjacencyViolationShown).toBe(true)
        expect(get(hintShownStore).numberConstraintShown).toBe(false)
    })

    it('is idempotent — calling twice does not change state', () => {
        markShown('numberConstraint')
        markShown('numberConstraint')
        expect(get(hintShownStore).numberConstraintShown).toBe(true)
    })

    it('can mark both hints shown independently', () => {
        markShown('numberConstraint')
        markShown('adjacencyViolation')
        const state = get(hintShownStore)
        expect(state.numberConstraintShown).toBe(true)
        expect(state.adjacencyViolationShown).toBe(true)
    })
})

// ─── Test 3: hydrateFromServer ────────────────────────────────────────────────

describe('hydrateFromServer', () => {
    it('sets numberConstraintShown when server flag is true', () => {
        hydrateFromServer({ numberConstraint: true, adjacencyViolation: false })
        expect(get(hintShownStore).numberConstraintShown).toBe(true)
        expect(get(hintShownStore).adjacencyViolationShown).toBe(false)
    })

    it('sets adjacencyViolationShown when server flag is true', () => {
        hydrateFromServer({ numberConstraint: false, adjacencyViolation: true })
        expect(get(hintShownStore).numberConstraintShown).toBe(false)
        expect(get(hintShownStore).adjacencyViolationShown).toBe(true)
    })

    it('sets both flags when both server flags are true', () => {
        hydrateFromServer({ numberConstraint: true, adjacencyViolation: true })
        const state = get(hintShownStore)
        expect(state.numberConstraintShown).toBe(true)
        expect(state.adjacencyViolationShown).toBe(true)
    })

    it('leaves both flags false when both server flags are false', () => {
        hydrateFromServer({ numberConstraint: false, adjacencyViolation: false })
        const state = get(hintShownStore)
        expect(state.numberConstraintShown).toBe(false)
        expect(state.adjacencyViolationShown).toBe(false)
    })

    it('overwrites any in-session markShown state with server truth', () => {
        // In-session flag was set, but server says not dismissed — reset to false
        markShown('numberConstraint')
        hydrateFromServer({ numberConstraint: false, adjacencyViolation: false })
        expect(get(hintShownStore).numberConstraintShown).toBe(false)
    })
})

// ─── Test 4: dismissPersistent ────────────────────────────────────────────────

describe('dismissPersistent', () => {
    it('POSTs to /api/game/hints/dismiss with the correct kind', async () => {
        const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ dismissed: true }), { status: 200 })
        )

        await dismissPersistent('numberConstraint')

        expect(mockFetch).toHaveBeenCalledWith('/api/game/hints/dismiss', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'numberConstraint' }),
        })
    })

    it('POSTs with adjacencyViolation kind', async () => {
        const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ dismissed: true }), { status: 200 })
        )

        await dismissPersistent('adjacencyViolation')

        expect(mockFetch).toHaveBeenCalledWith('/api/game/hints/dismiss', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'adjacencyViolation' }),
        })
    })

    it('does not throw when the request fails — fire-and-forget', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

        // Should not throw
        await expect(dismissPersistent('numberConstraint')).resolves.toBeUndefined()
    })

    it('does not throw when the server returns a non-2xx response', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ error: 'Server error' }), { status: 500 })
        )

        await expect(dismissPersistent('adjacencyViolation')).resolves.toBeUndefined()
    })
})

// ─── Test 5: resetHints ───────────────────────────────────────────────────────

describe('resetHints', () => {
    it('resets both flags to false', () => {
        markShown('numberConstraint')
        markShown('adjacencyViolation')
        resetHints()
        const state = get(hintShownStore)
        expect(state.numberConstraintShown).toBe(false)
        expect(state.adjacencyViolationShown).toBe(false)
    })
})

// ─── Property 6: Hint Display Idempotence Per Session ─────────────────────────
// Feature: funnel-truth-and-trigger, Property 6: Hint Display Idempotence Per Session
// **Validates: Requirements 8.7, 9.6**

import * as fc from 'fast-check'

describe('Property 6: Hint Display Idempotence Per Session', () => {
    it('numberConstraintShown is at most true (displayed at most 1 time) for all N taps', () => {
        // **Validates: Requirements 8.7, 9.6**
        // For all sequences of N cell taps within a single session, the number of
        // times Hint_Number_Constraint is displayed is at most 1.
        // markShown('numberConstraint') models each tap that would trigger the hint.
        // The store flag can only ever be false → true, never increment beyond 1.
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50 }),
                (n) => {
                    resetHints()

                    // Simulate N taps that each attempt to trigger the numberConstraint hint
                    for (let i = 0; i < n; i++) {
                        markShown('numberConstraint')
                    }

                    // The flag is boolean — true means shown exactly once, never more
                    const state = get(hintShownStore)
                    expect(state.numberConstraintShown).toBe(true)
                    // adjacencyViolation must remain unaffected
                    expect(state.adjacencyViolationShown).toBe(false)
                }
            ),
            { numRuns: 100 }
        )
    })

    it('adjacencyViolationShown is at most true (displayed at most 1 time) for all N mutations', () => {
        // **Validates: Requirements 8.7, 9.6**
        // For all sequences of N cell mutations within a single session, the number
        // of times Hint_Adjacency_Violation caption is displayed is at most 1.
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50 }),
                (n) => {
                    resetHints()

                    // Simulate N mutations that each attempt to trigger the adjacencyViolation hint
                    for (let i = 0; i < n; i++) {
                        markShown('adjacencyViolation')
                    }

                    const state = get(hintShownStore)
                    expect(state.adjacencyViolationShown).toBe(true)
                    // numberConstraint must remain unaffected
                    expect(state.numberConstraintShown).toBe(false)
                }
            ),
            { numRuns: 100 }
        )
    })

    it('both hint types are each displayed at most 1 time across mixed tap sequences', () => {
        // **Validates: Requirements 8.7, 9.6**
        // For all mixed sequences of N taps triggering both hint types, each hint
        // type is displayed at most 1 time — the store is a boolean latch, not a counter.
        fc.assert(
            fc.property(
                fc.array(
                    fc.constantFrom('numberConstraint' as const, 'adjacencyViolation' as const),
                    { minLength: 1, maxLength: 50 }
                ),
                (taps) => {
                    resetHints()

                    for (const kind of taps) {
                        markShown(kind)
                    }

                    const state = get(hintShownStore)
                    const numberConstraintTaps = taps.filter((k) => k === 'numberConstraint').length
                    const adjacencyViolationTaps = taps.filter((k) => k === 'adjacencyViolation').length

                    // Each flag is true iff at least one tap of that kind occurred — never more than once
                    expect(state.numberConstraintShown).toBe(numberConstraintTaps > 0)
                    expect(state.adjacencyViolationShown).toBe(adjacencyViolationTaps > 0)
                }
            ),
            { numRuns: 100 }
        )
    })
})
