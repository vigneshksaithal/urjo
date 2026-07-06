import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
    serializeResultCard,
    serializeResultComment,
    parseResultCard,
} from '../result-card'
import type { ResultCardData } from '../growth-types'

describe('result-card', () => {
    // ─── serializeResultCard ───────────────────────────────────────────────────

    describe('serializeResultCard', () => {
        it('produces the correct format for a 4×4 grid', () => {
            const data: ResultCardData = {
                puzzleNumber: 42,
                gridSize: 4,
                skillLevel: 3,
                colorGrid: [
                    ['red', 'blue', 'red', 'blue'],
                    ['blue', 'red', 'blue', 'red'],
                    ['red', 'blue', 'red', 'blue'],
                    ['blue', 'red', 'blue', 'red'],
                ],
                timeTaken: 23,
                mistakes: 0,
                streak: 5,
            }

            const result = serializeResultCard(data)

            expect(result).toBe(
                'Urjo #42 🧩 4×4 ⭐3\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '⏱️ 23s | 🎯 0 mistakes | 🔥 5 streak\n' +
                'Play at r/urjo'
            )
        })

        it('produces the correct format for a 6×6 grid', () => {
            const row: ('red' | 'blue')[] = ['red', 'blue', 'red', 'blue', 'red', 'blue']
            const data: ResultCardData = {
                puzzleNumber: 100,
                gridSize: 6,
                skillLevel: 7,
                colorGrid: Array.from({ length: 6 }, () => [...row]),
                timeTaken: 120,
                mistakes: 3,
                streak: 0,
            }

            const result = serializeResultCard(data)
            const lines = result.split('\n')

            expect(lines[0]).toBe('Urjo #100 🧩 6×6 ⭐7')
            expect(lines).toHaveLength(6 + 3) // header + 6 rows + stats + footer
            expect(lines[7]).toBe('⏱️ 120s | 🎯 3 mistakes | 🔥 0 streak')
            expect(lines[8]).toBe('Play at r/urjo')
        })

        it('produces the correct format for an 8×8 grid', () => {
            const row: ('red' | 'blue')[] = ['blue', 'red', 'blue', 'red', 'blue', 'red', 'blue', 'red']
            const data: ResultCardData = {
                puzzleNumber: 1,
                gridSize: 8,
                skillLevel: 9,
                colorGrid: Array.from({ length: 8 }, () => [...row]),
                timeTaken: 9999,
                mistakes: 99,
                streak: 9999,
            }

            const result = serializeResultCard(data)
            const lines = result.split('\n')

            expect(lines[0]).toBe('Urjo #1 🧩 8×8 ⭐9')
            expect(lines).toHaveLength(8 + 3) // header + 8 rows + stats + footer
            expect(lines[9]).toBe('⏱️ 9999s | 🎯 99 mistakes | 🔥 9999 streak')
            expect(lines[10]).toBe('Play at r/urjo')
        })
    })

    describe('serializeResultComment', () => {
        it('prepends a custom message above the generated card', () => {
            const data: ResultCardData = {
                puzzleNumber: 42,
                gridSize: 4,
                skillLevel: 3,
                colorGrid: [
                    ['red', 'blue', 'red', 'blue'],
                    ['blue', 'red', 'blue', 'red'],
                    ['red', 'blue', 'red', 'blue'],
                    ['blue', 'red', 'blue', 'red'],
                ],
                timeTaken: 23,
                mistakes: 0,
                streak: 5,
            }

            const result = serializeResultComment(data, 'Big win today!')

            expect(result).toBe(
                'Big win today!\n\n' +
                'Urjo #42 🧩 4×4 ⭐3\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '⏱️ 23s | 🎯 0 mistakes | 🔥 5 streak\n' +
                'Play at r/urjo'
            )
        })

        it('falls back to the plain result card when the message is blank', () => {
            const data: ResultCardData = {
                puzzleNumber: 5,
                gridSize: 4,
                skillLevel: 1,
                colorGrid: [
                    ['red', 'red', 'blue', 'blue'],
                    ['blue', 'blue', 'red', 'red'],
                    ['red', 'red', 'blue', 'blue'],
                    ['blue', 'blue', 'red', 'red'],
                ],
                timeTaken: 9,
                mistakes: 1,
                streak: 2,
            }

            expect(serializeResultComment(data, '   ')).toBe(serializeResultCard(data))
        })
    })

    // ─── parseResultCard ───────────────────────────────────────────────────────

    describe('parseResultCard', () => {
        it('parses a valid 4×4 result card', () => {
            const text =
                'Urjo #42 🧩 4×4 ⭐3\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '⏱️ 23s | 🎯 0 mistakes | 🔥 5 streak\n' +
                'Play at r/urjo'

            const result = parseResultCard(text)

            expect(result).toStrictEqual({
                puzzleNumber: 42,
                gridSize: 4,
                skillLevel: 3,
                colorGrid: [
                    ['red', 'blue', 'red', 'blue'],
                    ['blue', 'red', 'blue', 'red'],
                    ['red', 'blue', 'red', 'blue'],
                    ['blue', 'red', 'blue', 'red'],
                ],
                timeTaken: 23,
                mistakes: 0,
                streak: 5,
            })
        })

        it('returns null for empty string', () => {
            expect(parseResultCard('')).toBeNull()
        })

        it('returns null for random text', () => {
            expect(parseResultCard('hello world')).toBeNull()
        })

        it('returns null for invalid grid size (5×5)', () => {
            const text =
                'Urjo #1 🧩 5×5 ⭐1\n' +
                '🟥🟦🟥🟦🟥\n' +
                '🟦🟥🟦🟥🟦\n' +
                '🟥🟦🟥🟦🟥\n' +
                '🟦🟥🟦🟥🟦\n' +
                '🟥🟦🟥🟦🟥\n' +
                '⏱️ 10s | 🎯 0 mistakes | 🔥 1 streak\n' +
                'Play at r/urjo'

            expect(parseResultCard(text)).toBeNull()
        })

        it('returns null for skill level out of range (0)', () => {
            const text =
                'Urjo #1 🧩 4×4 ⭐0\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '⏱️ 10s | 🎯 0 mistakes | 🔥 1 streak\n' +
                'Play at r/urjo'

            expect(parseResultCard(text)).toBeNull()
        })

        it('returns null for skill level out of range (10)', () => {
            const text =
                'Urjo #1 🧩 4×4 ⭐10\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '⏱️ 10s | 🎯 0 mistakes | 🔥 1 streak\n' +
                'Play at r/urjo'

            expect(parseResultCard(text)).toBeNull()
        })

        it('returns null for mismatched grid dimensions in header', () => {
            const text =
                'Urjo #1 🧩 4×6 ⭐1\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '⏱️ 10s | 🎯 0 mistakes | 🔥 1 streak\n' +
                'Play at r/urjo'

            expect(parseResultCard(text)).toBeNull()
        })

        it('returns null when grid row count does not match gridSize', () => {
            // Header says 4×4 but only 3 grid rows
            const text =
                'Urjo #1 🧩 4×4 ⭐1\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '🟥🟦🟥🟦\n' +
                '⏱️ 10s | 🎯 0 mistakes | 🔥 1 streak\n' +
                'Play at r/urjo'

            expect(parseResultCard(text)).toBeNull()
        })

        it('returns null when grid row width does not match gridSize', () => {
            // Header says 4×4 but rows have 3 cells
            const text =
                'Urjo #1 🧩 4×4 ⭐1\n' +
                '🟥🟦🟥\n' +
                '🟦🟥🟦\n' +
                '🟥🟦🟥\n' +
                '🟦🟥🟦\n' +
                '⏱️ 10s | 🎯 0 mistakes | 🔥 1 streak\n' +
                'Play at r/urjo'

            expect(parseResultCard(text)).toBeNull()
        })

        it('returns null for non-emoji characters in grid', () => {
            const text =
                'Urjo #1 🧩 4×4 ⭐1\n' +
                '🟥🟦XX\n' +
                '🟦🟥🟦🟥\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '⏱️ 10s | 🎯 0 mistakes | 🔥 1 streak\n' +
                'Play at r/urjo'

            expect(parseResultCard(text)).toBeNull()
        })

        it('returns null for missing footer', () => {
            const text =
                'Urjo #1 🧩 4×4 ⭐1\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '⏱️ 10s | 🎯 0 mistakes | 🔥 1 streak'

            expect(parseResultCard(text)).toBeNull()
        })

        it('returns null for wrong footer', () => {
            const text =
                'Urjo #1 🧩 4×4 ⭐1\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '⏱️ 10s | 🎯 0 mistakes | 🔥 1 streak\n' +
                'Play at r/wrong'

            expect(parseResultCard(text)).toBeNull()
        })

        it('returns null for missing stats line', () => {
            const text =
                'Urjo #1 🧩 4×4 ⭐1\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                'Play at r/urjo'

            expect(parseResultCard(text)).toBeNull()
        })

        it('returns null for truncated card (too few lines)', () => {
            const text = 'Urjo #1 🧩 4×4 ⭐1\n🟥🟦🟥🟦'
            expect(parseResultCard(text)).toBeNull()
        })

        it('parses a card preceded by a custom message (as produced by serializeResultComment)', () => {
            const text =
                'Big win today!\n\n' +
                'Urjo #42 🧩 4×4 ⭐3\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '⏱️ 23s | 🎯 0 mistakes | 🔥 5 streak\n' +
                'Play at r/urjo'

            const result = parseResultCard(text)

            expect(result).toStrictEqual({
                puzzleNumber: 42,
                gridSize: 4,
                skillLevel: 3,
                colorGrid: [
                    ['red', 'blue', 'red', 'blue'],
                    ['blue', 'red', 'blue', 'red'],
                    ['red', 'blue', 'red', 'blue'],
                    ['blue', 'red', 'blue', 'red'],
                ],
                timeTaken: 23,
                mistakes: 0,
                streak: 5,
            })
        })

        it('parses a card preceded by a multi-line custom message', () => {
            const text =
                'Line one\nLine two\n\n' +
                'Urjo #1 🧩 4×4 ⭐1\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '🟥🟦🟥🟦\n' +
                '🟦🟥🟦🟥\n' +
                '⏱️ 10s | 🎯 0 mistakes | 🔥 1 streak\n' +
                'Play at r/urjo'

            expect(parseResultCard(text)?.puzzleNumber).toBe(1)
        })
    })

    // ─── Round-trip ────────────────────────────────────────────────────────────

    describe('round-trip', () => {
        it('serialize then parse recovers the original data for 4×4', () => {
            const data: ResultCardData = {
                puzzleNumber: 42,
                gridSize: 4,
                skillLevel: 3,
                colorGrid: [
                    ['red', 'blue', 'red', 'blue'],
                    ['blue', 'red', 'blue', 'red'],
                    ['red', 'blue', 'red', 'blue'],
                    ['blue', 'red', 'blue', 'red'],
                ],
                timeTaken: 23,
                mistakes: 0,
                streak: 5,
            }

            const serialized = serializeResultCard(data)
            const parsed = parseResultCard(serialized)

            expect(parsed).toStrictEqual(data)
        })

        it('serialize then parse recovers the original data for 6×6', () => {
            const data: ResultCardData = {
                puzzleNumber: 999,
                gridSize: 6,
                skillLevel: 5,
                colorGrid: Array.from({ length: 6 }, (_, i) =>
                    Array.from({ length: 6 }, (_, j) =>
                        (i + j) % 2 === 0 ? 'red' as const : 'blue' as const
                    )
                ),
                timeTaken: 60,
                mistakes: 2,
                streak: 10,
            }

            const serialized = serializeResultCard(data)
            const parsed = parseResultCard(serialized)

            expect(parsed).toStrictEqual(data)
        })

        it('serialize then parse recovers the original data for 8×8', () => {
            const data: ResultCardData = {
                puzzleNumber: 1,
                gridSize: 8,
                skillLevel: 9,
                colorGrid: Array.from({ length: 8 }, () =>
                    Array.from({ length: 8 }, () => 'blue' as const)
                ),
                timeTaken: 1,
                mistakes: 0,
                streak: 0,
            }

            const serialized = serializeResultCard(data)
            const parsed = parseResultCard(serialized)

            expect(parsed).toStrictEqual(data)
        })

        it('serialize then parse recovers the original data when a custom message is included', () => {
            const data: ResultCardData = {
                puzzleNumber: 7,
                gridSize: 4,
                skillLevel: 2,
                colorGrid: [
                    ['red', 'blue', 'red', 'blue'],
                    ['blue', 'red', 'blue', 'red'],
                    ['red', 'blue', 'red', 'blue'],
                    ['blue', 'red', 'blue', 'red'],
                ],
                timeTaken: 15,
                mistakes: 1,
                streak: 3,
            }

            const serialized = serializeResultComment(data, 'What a puzzle!')
            const parsed = parseResultCard(serialized)

            expect(parsed).toStrictEqual(data)
        })
    })
})

describe('Feature: urjo-growth-roadmap, Property 1: Result Card Round-Trip', () => {
    /**
     * Property 1: Result Card Round-Trip
     * For any valid ResultCardData object, parseResultCard(serializeResultCard(data))
     * produces an object deeply equal to the original input.
     *
     * **Validates: Requirements 1.7, 11.4**
     */

    // Generate gridSize first, then use it for both the gridSize field and colorGrid dimensions.
    // The .map() at the end spreads into a fresh object to restore the standard prototype
    // (fast-check's .chain() produces objects with __proto__: null).
    const resultCardDataArb = fc.constantFrom(4, 6, 8).chain((size) =>
        fc.record({
            puzzleNumber: fc.integer({ min: 1, max: 99999 }),
            gridSize: fc.constant(size) as fc.Arbitrary<4 | 6 | 8>,
            skillLevel: fc.integer({ min: 1, max: 9 }),
            colorGrid: fc.array(
                fc.array(fc.constantFrom('red' as const, 'blue' as const), { minLength: size, maxLength: size }),
                { minLength: size, maxLength: size }
            ),
            timeTaken: fc.integer({ min: 1, max: 9999 }),
            mistakes: fc.integer({ min: 0, max: 99 }),
            streak: fc.integer({ min: 0, max: 9999 }),
        }).map((r) => ({ ...r }))
    )

    it('parseResultCard(serializeResultCard(data)) deeply equals the original input', () => {
        fc.assert(
            fc.property(resultCardDataArb, (data) => {
                const serialized = serializeResultCard(data)
                const parsed = parseResultCard(serialized)
                expect(parsed).toStrictEqual(data)
            }),
            { numRuns: 100 }
        )
    })
})

describe('Feature: urjo-growth-roadmap, Property 2: Invalid Result Card Strings Return Null', () => {
    /**
     * Property 2: Invalid Result Card Strings Return Null
     * For any string that does not conform to the result card format,
     * parseResultCard(text) returns null.
     *
     * **Validates: Requirements 11.5**
     */

    // Reuse the valid data generator for corruption strategies
    const validCardDataArb = fc.constantFrom(4, 6, 8).chain((size) =>
        fc.record({
            puzzleNumber: fc.integer({ min: 1, max: 99999 }),
            gridSize: fc.constant(size) as fc.Arbitrary<4 | 6 | 8>,
            skillLevel: fc.integer({ min: 1, max: 9 }),
            colorGrid: fc.array(
                fc.array(fc.constantFrom('red' as const, 'blue' as const), { minLength: size, maxLength: size }),
                { minLength: size, maxLength: size }
            ),
            timeTaken: fc.integer({ min: 1, max: 9999 }),
            mistakes: fc.integer({ min: 0, max: 99 }),
            streak: fc.integer({ min: 0, max: 9999 }),
        }).map((r) => ({ ...r }))
    )

    it('returns null for arbitrary random strings', () => {
        fc.assert(
            fc.property(fc.string(), (text) => {
                expect(parseResultCard(text)).toBeNull()
            }),
            { numRuns: 100 }
        )
    })

    it('returns null for multi-line lorem text', () => {
        fc.assert(
            fc.property(
                fc.array(fc.lorem({ maxCount: 5 }), { minLength: 1, maxLength: 10 }),
                (words) => {
                    const text = words.join('\n')
                    expect(parseResultCard(text)).toBeNull()
                }
            ),
            { numRuns: 100 }
        )
    })

    it('returns null for truncated valid cards (random substring)', () => {
        fc.assert(
            fc.property(
                validCardDataArb,
                fc.double({ min: 0, max: 1, noNaN: true }),
                fc.double({ min: 0, max: 1, noNaN: true }),
                (data, startFrac, lengthFrac) => {
                    const serialized = serializeResultCard(data)
                    // Take a strict substring (not the full string)
                    const maxStart = Math.max(0, serialized.length - 1)
                    const start = Math.floor(startFrac * maxStart)
                    const maxLen = serialized.length - start - 1 // ensure at least 1 char removed
                    if (maxLen <= 0) return // skip degenerate cases
                    const len = Math.max(1, Math.floor(lengthFrac * maxLen))
                    const truncated = serialized.slice(start, start + len)

                    // A strict substring of a valid card is never a valid card
                    if (truncated !== serialized) {
                        expect(parseResultCard(truncated)).toBeNull()
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    it('returns null for cards with corrupted headers', () => {
        fc.assert(
            fc.property(
                validCardDataArb,
                fc.string({ minLength: 1, maxLength: 50 }),
                (data, corruptHeader) => {
                    const serialized = serializeResultCard(data)
                    const lines = serialized.split('\n')
                    // Replace the header with a random string
                    lines[0] = corruptHeader
                    const corrupted = lines.join('\n')

                    // Only assert null if the corrupted header doesn't accidentally match the format
                    const headerRegex = /^Urjo #(\d+) 🧩 (\d+)×(\d+) ⭐(\d+)$/
                    if (!headerRegex.test(corruptHeader)) {
                        expect(parseResultCard(corrupted)).toBeNull()
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    it('returns null for cards with corrupted stats line', () => {
        fc.assert(
            fc.property(
                validCardDataArb,
                fc.string({ minLength: 1, maxLength: 50 }),
                (data, corruptStats) => {
                    const serialized = serializeResultCard(data)
                    const lines = serialized.split('\n')
                    // Stats line is at index 1 + gridSize
                    const statsIndex = 1 + data.gridSize
                    lines[statsIndex] = corruptStats
                    const corrupted = lines.join('\n')

                    const statsRegex = /^⏱️ (\d+)s \| 🎯 (\d+) mistakes \| 🔥 (\d+) streak$/
                    if (!statsRegex.test(corruptStats)) {
                        expect(parseResultCard(corrupted)).toBeNull()
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    it('returns null for cards with corrupted footer', () => {
        fc.assert(
            fc.property(
                validCardDataArb,
                fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s !== 'Play at r/urjo'),
                (data, corruptFooter) => {
                    const serialized = serializeResultCard(data)
                    const lines = serialized.split('\n')
                    // Footer is the last line
                    lines[lines.length - 1] = corruptFooter
                    const corrupted = lines.join('\n')

                    expect(parseResultCard(corrupted)).toBeNull()
                }
            ),
            { numRuns: 100 }
        )
    })
})
