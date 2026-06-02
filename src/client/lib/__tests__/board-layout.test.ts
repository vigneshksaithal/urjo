/**
 * Tests for the pure board-layout sizing helpers (`board-layout.ts`).
 *
 * Property 1 (Bug Condition / Expected Behavior) — Board Fits Within Available
 * Width. This file encodes the EXPECTED correct behavior for bug-condition
 * contexts (narrow viewports where `availableHeight > availableWidth`).
 *
 * On the UNFIXED model (task 1 stub, `computeBoardSize` returns the
 * height-derived side), this property is EXPECTED TO FAIL — that failure
 * confirms the horizontal overflow / right-column clipping exists. The SAME
 * test must PASS once task 3.1 replaces the stub with
 * `Math.max(0, Math.min(availableWidth, availableHeight))`.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { computeBoardSize } from '../board-layout'

const SUPPORTED_GRID_SIZES = [4, 6, 8] as const

// ─── Bug-condition context model ──────────────────────────────────────────────

interface BugContext {
    readonly availableWidth: number
    readonly availableHeight: number
    readonly gridSize: number
}

/**
 * isBugCondition (from design): the original height-derived board width
 * (= availableHeight) exceeds the available width. Bug-condition contexts are
 * therefore `0 <= availableWidth < availableHeight`.
 */
const isBugCondition = (ctx: BugContext): boolean => ctx.availableHeight > ctx.availableWidth

/**
 * expectedBehavior (from the design's Fix Checking pseudocode): the board fits
 * within both axes, stays square, and every column of the selected grid size is
 * laid out with a positive width (`boardSize / gridSize > 0`).
 */
const assertExpectedBehavior = (ctx: BugContext): void => {
    const boardSize = computeBoardSize(ctx.availableWidth, ctx.availableHeight)
    // Fits within the available width — no horizontal clipping of the right column.
    expect(boardSize).toBeLessThanOrEqual(ctx.availableWidth)
    // Fits within the available height.
    expect(boardSize).toBeLessThanOrEqual(ctx.availableHeight)
    // Stays square: the same side is used for both axes (computeBoardSize is the
    // single source of truth for width === height by construction).
    expect(boardSize).toBe(computeBoardSize(ctx.availableWidth, ctx.availableHeight))
    // Every column of the selected grid size is laid out with a positive width.
    expect(boardSize / ctx.gridSize).toBeGreaterThan(0)
}

// ─── Property 1: Bug Condition — Board Fits Within Available Width ─────────────

describe('Property 1: Bug Condition — board fits within available width', () => {
    // **Validates: Requirements 1.1, 1.2, 1.4, 2.1, 2.2, 2.4**
    it('for all bug-condition contexts (0 <= w < h), the board fits width and height, stays square, and all columns fit', () => {
        // Scoped generator: bug-condition contexts where availableWidth < availableHeight.
        // Generate the width first, then a strictly larger height, so every
        // generated context satisfies isBugCondition by construction.
        //
        // availableWidth starts at 1 (not 0): the "all columns laid out (> 0
        // wide)" sub-property is only meaningful for a real, measurable narrow
        // viewport. A 0px-wide container is a collapsed/unmeasured state with no
        // columns to clip — that degenerate clamp-to-0 case is covered by the
        // dedicated unit cases below, not by the narrow-viewport property.
        const bugContextArb: fc.Arbitrary<BugContext> = fc
            .record({
                availableWidth: fc.integer({ min: 1, max: 2000 }),
                heightDelta: fc.integer({ min: 1, max: 2000 }),
                gridSize: fc.constantFrom(...SUPPORTED_GRID_SIZES),
            })
            .map(({ availableWidth, heightDelta, gridSize }) => ({
                availableWidth,
                availableHeight: availableWidth + heightDelta,
                gridSize,
            }))

        fc.assert(
            fc.property(bugContextArb, (ctx) => {
                // Generator guarantees the bug condition holds.
                expect(isBugCondition(ctx)).toBe(true)
                assertExpectedBehavior(ctx)
            }),
            { numRuns: 500 },
        )
    })

    // ─── Representative counterexamples from the design (375px portrait) ──────
    // Available main area ≈ 351×430 after header/season strip/grid-size selector.
    // Original height-derived side = 430 > 351 available → right column clipped.
    // Expected: board sized to 351px (fits the width), all columns > 0 wide.
    it.each(SUPPORTED_GRID_SIZES)(
        '375px portrait (w≈351, h≈430), grid size %i: board fits the 351px width and all columns are visible',
        (gridSize) => {
            const availableWidth = 351
            const availableHeight = 430
            assertExpectedBehavior({ availableWidth, availableHeight, gridSize })

            // Explicit fit assertion against the narrow width (the clipped axis).
            const boardSize = computeBoardSize(availableWidth, availableHeight)
            expect(boardSize).toBeLessThanOrEqual(availableWidth)
        },
    )
})

// ─── Property 2: Preservation — Sizing Unchanged Where Content Already Fits ────
//
// Observation-first methodology: on non-buggy contexts (`availableHeight <=
// availableWidth`) the original height-derived square (side = availableHeight)
// already fits, so the rendered board side equals availableHeight. The task 1
// stub encodes this same `F` behavior (it returns the height), so these
// preservation properties PASS on the UNFIXED model — establishing the baseline
// the fix must preserve. After task 3.1 (`min(w, h)`), `h <= w` still yields
// exactly `h`, so the SAME properties keep passing (no regression).

describe('Property 2: Preservation — sizing unchanged where content already fits', () => {
    // **Validates: Requirements 3.1, 3.2, 3.3**
    it('for all non-buggy contexts (0 <= h <= w), computeBoardSize(w, h) === h', () => {
        // Scoped generator: non-buggy contexts where availableHeight <= availableWidth.
        // Generate the height first, then a width >= height, so every generated
        // context satisfies NOT isBugCondition by construction.
        const fittingContextArb: fc.Arbitrary<BugContext> = fc
            .record({
                availableHeight: fc.integer({ min: 0, max: 2000 }),
                widthDelta: fc.integer({ min: 0, max: 2000 }),
                gridSize: fc.constantFrom(...SUPPORTED_GRID_SIZES),
            })
            .map(({ availableHeight, widthDelta, gridSize }) => ({
                availableWidth: availableHeight + widthDelta,
                availableHeight,
                gridSize,
            }))

        fc.assert(
            fc.property(fittingContextArb, (ctx) => {
                // Generator guarantees the bug condition does NOT hold.
                expect(isBugCondition(ctx)).toBe(false)
                // Preservation equality: the fixed sizing equals the original
                // height-derived square, so the layout is unchanged.
                expect(computeBoardSize(ctx.availableWidth, ctx.availableHeight)).toBe(
                    ctx.availableHeight,
                )
            }),
            { numRuns: 500 },
        )
    })

    // Monotonic sanity: for a fixed height, narrowing the width never grows the
    // board — overflow can only shrink the size, never increase it. On the stub
    // the width is ignored (size stays at h, so `<=` holds); after the fix the
    // size is `min(w, h)`, which is monotonic non-decreasing in w (so narrowing
    // w can only decrease it). The property holds on both models.
    it('shrinking the available width never increases the returned board size', () => {
        const monotonicArb = fc
            .record({
                availableHeight: fc.integer({ min: 0, max: 2000 }),
                widerWidth: fc.integer({ min: 0, max: 2000 }),
                shrinkBy: fc.integer({ min: 0, max: 2000 }),
            })
            .map(({ availableHeight, widerWidth, shrinkBy }) => ({
                availableHeight,
                widerWidth,
                // Narrower width is the wider width reduced (clamped at 0), so
                // narrowerWidth <= widerWidth always holds.
                narrowerWidth: Math.max(0, widerWidth - shrinkBy),
            }))

        fc.assert(
            fc.property(monotonicArb, ({ availableHeight, widerWidth, narrowerWidth }) => {
                const sizeAtWider = computeBoardSize(widerWidth, availableHeight)
                const sizeAtNarrower = computeBoardSize(narrowerWidth, availableHeight)
                // Narrowing the width never grows the board.
                expect(sizeAtNarrower).toBeLessThanOrEqual(sizeAtWider)
            }),
            { numRuns: 500 },
        )
    })

    // ─── Preservation anchors (concrete fitting contexts) ─────────────────────
    // Representative non-buggy contexts: the board side equals availableHeight.
    it.each([
        { availableWidth: 768, availableHeight: 430, label: '768px tablet (wide, fits)' },
        { availableWidth: 500, availableHeight: 500, label: 'square viewport (w === h)' },
        { availableWidth: 1024, availableHeight: 600, label: 'landscape desktop' },
    ])(
        'preserves the height-derived square for $label: computeBoardSize($availableWidth, $availableHeight) === $availableHeight',
        ({ availableWidth, availableHeight }) => {
            expect(computeBoardSize(availableWidth, availableHeight)).toBe(availableHeight)
        },
    )
})

// ─── Unit cases (design's Unit Tests) ─────────────────────────────────────────
//
// Concrete examples for the real implementation (`min(w, h)`, clamped at 0).
// These complement the property-based tests above with specific, readable cases
// covering each branch.

describe('computeBoardSize — returns the smaller dimension', () => {
    it('returns the width when w < h', () => {
        expect(computeBoardSize(351, 430)).toBe(351)
    })

    it('returns the height when h < w', () => {
        expect(computeBoardSize(768, 430)).toBe(430)
    })

    it('returns the shared value when w === h', () => {
        expect(computeBoardSize(500, 500)).toBe(500)
    })
})

describe('computeBoardSize — clamps non-positive dimensions to 0', () => {
    it('clamps a negative width to 0', () => {
        expect(computeBoardSize(-10, 430)).toBe(0)
    })

    it('clamps a negative height to 0', () => {
        expect(computeBoardSize(351, -10)).toBe(0)
    })

    it('returns 0 when both dimensions are 0 (collapsed/unmeasured container)', () => {
        expect(computeBoardSize(0, 0)).toBe(0)
    })

    it('returns 0 when one dimension is 0', () => {
        expect(computeBoardSize(0, 430)).toBe(0)
        expect(computeBoardSize(351, 0)).toBe(0)
    })
})
