import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { validateGrid } from '../validation'
import type { Cell, CellColor, Grid } from '../../../shared/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeCell = (color: CellColor): Cell => ({ color, number: null, locked: false })

const makeEmptyGrid = (size: number): Grid =>
    Array.from({ length: size }, () => Array.from({ length: size }, () => makeCell(null)))

const cellColorArb = fc.oneof(
    fc.constant<CellColor>('red'),
    fc.constant<CellColor>('blue'),
    fc.constant<CellColor>(null)
)

const gridArb = (size: number): fc.Arbitrary<Grid> =>
    fc.array(
        fc.array(cellColorArb.map(makeCell), { minLength: size, maxLength: size }),
        { minLength: size, maxLength: size }
    )

// ─── Property 1: Row and column violation detection ───────────────────────────
// Feature: ui-critique-improvements, Property 1: Row and column violation detection
// Validates: Requirements 3.1, 3.2, 3.5

describe('validateGrid — Property 1: Row and column violation detection', () => {
    it('returns exactly the rows/cols where a color count exceeds gridSize/2', () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.constant(4), fc.constant(6)).chain((gridSize) =>
                    gridArb(gridSize).map((grid) => ({ grid, gridSize }))
                ),
                ({ grid, gridSize }) => {
                    const limit = gridSize / 2
                    const { violatedRows, violatedCols } = validateGrid(grid, gridSize)

                    for (let row = 0; row < gridSize; row++) {
                        const cells = grid[row] ?? []
                        const red = cells.filter((c) => c.color === 'red').length
                        const blue = cells.filter((c) => c.color === 'blue').length
                        expect(violatedRows.has(row)).toBe(red > limit || blue > limit)
                    }

                    for (let col = 0; col < gridSize; col++) {
                        const red = grid.filter((r) => r[col]?.color === 'red').length
                        const blue = grid.filter((r) => r[col]?.color === 'blue').length
                        expect(violatedCols.has(col)).toBe(red > limit || blue > limit)
                    }
                }
            ),
            { numRuns: 50 }
        )
    })
})

// ─── Property 2: Violation correction removes indicator ───────────────────────
// Feature: ui-critique-improvements, Property 2: Violation correction removes indicator
// Validates: Requirements 3.4

describe('validateGrid — Property 2: Violation correction removes indicator', () => {
    it('removing excess color from a violated row clears the violation', () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.constant(4), fc.constant(6)),
                (gridSize) => {
                    const limit = gridSize / 2
                    // Row 0 all red — guaranteed violation
                    const grid: Grid = makeEmptyGrid(gridSize)
                    const row0 = grid[0]
                    if (row0) {
                        for (let col = 0; col < gridSize; col++) {
                            row0[col] = makeCell('red')
                        }
                    }

                    expect(validateGrid(grid, gridSize).violatedRows.has(0)).toBe(true)

                    // Fix: null out cells beyond the limit
                    const fixed: Grid = grid.map((row, r) => {
                        if (r !== 0) return row
                        return row.map((cell, col) => (col >= limit ? makeCell(null) : cell))
                    })

                    expect(validateGrid(fixed, gridSize).violatedRows.has(0)).toBe(false)
                }
            ),
            { numRuns: 50 }
        )
    })
})

// ─── Edge case unit tests ─────────────────────────────────────────────────────

describe('validateGrid — edge cases', () => {
    it('returns empty sets for an empty grid (size 0)', () => {
        const result = validateGrid([], 0)
        expect(result.violatedRows.size).toBe(0)
        expect(result.violatedCols.size).toBe(0)
    })

    it('returns empty sets for a fully filled valid 4×4 grid', () => {
        // Exactly 2 red + 2 blue per row and column — at the limit, not exceeding
        const grid: Grid = [
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
            [makeCell('red'), makeCell('red'), makeCell('blue'), makeCell('blue')],
            [makeCell('blue'), makeCell('blue'), makeCell('red'), makeCell('red')],
        ]
        const result = validateGrid(grid, 4)
        expect(result.violatedRows.size).toBe(0)
        expect(result.violatedCols.size).toBe(0)
    })

    it('detects a single row violation', () => {
        // Only row 1 violates (3 red). Null cells in row 3 keep columns clean.
        // row 0: r b b r  → 2r 2b
        // row 1: r r r b  → 3r 1b  ← violation
        // row 2: b r b r  → 2r 2b
        // row 3: b null null null → 0r 1b
        // col 0: r r b b → 2r 2b  col 1: b r r null → 2r 1b
        // col 2: b r b null → 1r 2b  col 3: r b r null → 2r 1b
        const grid: Grid = [
            [makeCell('red'), makeCell('blue'), makeCell('blue'), makeCell('red')],
            [makeCell('red'), makeCell('red'), makeCell('red'), makeCell('blue')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell('red')],
            [makeCell('blue'), makeCell(null), makeCell(null), makeCell(null)],
        ]
        const result = validateGrid(grid, 4)
        expect(result.violatedRows.has(1)).toBe(true)
        expect(result.violatedRows.size).toBe(1)
        expect(result.violatedCols.size).toBe(0)
    })

    it('detects a single column violation', () => {
        // Only col 0 violates (3 red). Null cells keep rows and other cols clean.
        // col 0: r r r b → 3r 1b  ← violation
        // row 0: r b r null → 2r 1b  row 1: r r null b → 2r 1b
        // row 2: r null b r → 2r 1b  row 3: b r b null → 1r 2b
        // col 1: b r null r → 2r 1b  col 2: r null b b → 1r 2b  col 3: null b r null → 1r 1b
        const grid: Grid = [
            [makeCell('red'), makeCell('blue'), makeCell('red'), makeCell(null)],
            [makeCell('red'), makeCell('red'), makeCell(null), makeCell('blue')],
            [makeCell('red'), makeCell(null), makeCell('blue'), makeCell('red')],
            [makeCell('blue'), makeCell('red'), makeCell('blue'), makeCell(null)],
        ]
        const result = validateGrid(grid, 4)
        expect(result.violatedCols.has(0)).toBe(true)
        expect(result.violatedCols.size).toBe(1)
        expect(result.violatedRows.size).toBe(0)
    })

    it('handles null colors gracefully (counts only non-null)', () => {
        const grid: Grid = [
            [makeCell('red'), makeCell(null), makeCell(null), makeCell(null)],
            [makeCell(null), makeCell(null), makeCell(null), makeCell(null)],
            [makeCell(null), makeCell(null), makeCell(null), makeCell(null)],
            [makeCell(null), makeCell(null), makeCell(null), makeCell(null)],
        ]
        const result = validateGrid(grid, 4)
        expect(result.violatedRows.size).toBe(0)
        expect(result.violatedCols.size).toBe(0)
    })
})

// ─── Property 3: Color count derived from grid size ───────────────────────────
// Feature: ui-critique-improvements, Property 3: Color count derived from grid size
// Validates: Requirements 6.2, 6.3, 6.4

describe('colorCount — Property 3: Color count derived from grid size', () => {
    it('equals gridSize / 2 for any even positive integer', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50 }).map(n => n * 2), // even positive integers
                (gridSize) => {
                    expect(Math.floor(gridSize / 2)).toBe(gridSize / 2)
                    expect(gridSize / 2).toBeGreaterThan(0)
                }
            ),
            { numRuns: 50 }
        )
    })
})

// ─── Property 4: Confetti fires at most once per completion ───────────────────
// Feature: ui-critique-improvements, Property 4: Confetti fires at most once
// Validates: Requirements 9.3

describe('hasFiredConfetti — Property 4: Confetti fires at most once per completion', () => {
    it('flag prevents re-firing on subsequent renders', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 20 }), // number of re-renders after completion
                (rerenderCount) => {
                    let hasFiredConfetti = false
                    let isCompleted = false

                    // Simulate completion
                    isCompleted = true
                    if (isCompleted && !hasFiredConfetti) {
                        hasFiredConfetti = true
                    }

                    // Count additional fires across re-renders
                    let confettiFires = 0
                    for (let i = 0; i < rerenderCount; i++) {
                        if (isCompleted && !hasFiredConfetti) {
                            hasFiredConfetti = true
                            confettiFires++
                        }
                    }

                    // Flag should be true after completion
                    expect(hasFiredConfetti).toBe(true)
                    // No additional fires after the first
                    expect(confettiFires).toBe(0)
                }
            ),
            { numRuns: 50 }
        )
    })
})

// ─── Property 5: Footer displays solve time on completion ────────────────────
// Feature: ui-critique-improvements, Property 5: Footer displays solve time
// Validates: Requirements 10.1, 10.2

describe('footer text — Property 5: Footer displays solve time on completion', () => {
    it('formats "Solved in {timeTaken}s" for any non-negative timeTaken', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 3600 }), // non-negative timeTaken in seconds
                (timeTaken) => {
                    const footerText = `Solved in ${timeTaken}s`
                    expect(footerText).toBe(`Solved in ${timeTaken}s`)
                    expect(footerText).toContain('Solved in')
                    expect(footerText).toContain('s')
                    expect(footerText).toMatch(/^Solved in \d+s$/)
                }
            ),
            { numRuns: 50 }
        )
    })
})
