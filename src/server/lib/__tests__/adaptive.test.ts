import { describe, it, expect } from 'vitest'
import {
    calculatePerformanceScore,
    calculateSkipScore,
    calculateAverageScore,
    determineSkillLevel,
    shouldForceDemotion,
    addGameRecord,
    parseHistory,
} from '../adaptive'
import {
    MIN_SKILL_LEVEL,
    MAX_SKILL_LEVEL,
    HISTORY_SIZE,
    CONSECUTIVE_SKIP_THRESHOLD,
    PROMOTE_WINDOW,
    DEMOTE_WINDOW,
} from '../../../shared/constants'
import type { GameRecord } from '../../../shared/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeRecord = (level: number, timeTaken: number, skipped = false): GameRecord => ({
    level,
    timeTaken,
    timestamp: Date.now(),
    skipped,
})

const fastHistory = (level: number, count: number): GameRecord[] =>
    Array.from({ length: count }, () => makeRecord(level, 0))

const slowHistory = (level: number, count: number): GameRecord[] =>
    Array.from({ length: count }, () => makeRecord(level, 10000))

// ─── calculatePerformanceScore ────────────────────────────────────────────────

describe('calculatePerformanceScore', () => {
    it('returns 1.0 for instant solve with 0 mistakes (timeTaken=0)', () => {
        expect(calculatePerformanceScore(0, 1)).toBe(1.0)
    })

    it('returns 0.5 when timeTaken equals expectedTime (level 1: expectedTime=45)', () => {
        expect(calculatePerformanceScore(45, 1)).toBe(0.5)
    })

    it('returns 0.0 when timeTaken equals 2 * expectedTime (level 1: timeTaken=90)', () => {
        expect(calculatePerformanceScore(90, 1)).toBe(0.0)
    })

    it('returns 0.0 (clamped) when timeTaken > 2 * expectedTime (level 1: timeTaken=100)', () => {
        expect(calculatePerformanceScore(100, 1)).toBe(0.0)
    })

    it('reduces score by 0.20 per mistake', () => {
        // instant solve → timeScore=1.0; 1 mistake → 1.0 - 0.20 = 0.80
        expect(calculatePerformanceScore(0, 1, 1)).toBeCloseTo(0.80)
        // instant solve; 2 mistakes → 1.0 - 0.40 = 0.60
        expect(calculatePerformanceScore(0, 1, 2)).toBeCloseTo(0.60)
    })

    it('clamps to 0 when penalty exceeds time score', () => {
        // timeTaken=90 → timeScore=0.0; any mistakes → still 0
        expect(calculatePerformanceScore(90, 1, 3)).toBe(0.0)
        // timeTaken=45 → timeScore=0.5; 3 mistakes → 0.5 - 0.60 = clamped to 0
        expect(calculatePerformanceScore(45, 1, 3)).toBe(0.0)
    })

    it('mistake penalty is capped at 1.0 total (5 mistakes = -1.0 max, not -1.25)', () => {
        // Even 6 mistakes: penalty capped at 1.0, so result = max(0, timeScore - 1.0) = 0
        expect(calculatePerformanceScore(0, 1, 6)).toBe(0.0)
    })
})

// ─── calculateSkipScore ───────────────────────────────────────────────────────

describe('calculateSkipScore', () => {
    it('returns a value in [-0.5, -0.2] for timeSpent=0, level=1', () => {
        const score = calculateSkipScore(0, 1)
        expect(score).toBeGreaterThanOrEqual(-0.5)
        expect(score).toBeLessThanOrEqual(-0.2)
    })

    it('returns a value in [-0.5, -0.2] for timeSpent=expectedTime, level=1', () => {
        const score = calculateSkipScore(45, 1)
        expect(score).toBeGreaterThanOrEqual(-0.5)
        expect(score).toBeLessThanOrEqual(-0.2)
    })

    it('returns -0.5 for instant skip (timeSpent=0) — quicknessFactor=1', () => {
        expect(calculateSkipScore(0, 1)).toBe(-0.5)
    })

    it('returns -0.2 for slow skip (timeSpent >= expectedTime * 0.5)', () => {
        // level 1: expectedTime=45, threshold=22.5; timeSpent=23 → quicknessFactor=0
        expect(calculateSkipScore(23, 1)).toBe(-0.2)
    })
})

// ─── calculateAverageScore ────────────────────────────────────────────────────

describe('calculateAverageScore', () => {
    it('returns 0.5 for empty history array', () => {
        expect(calculateAverageScore([])).toBe(0.5)
    })
})

// ─── determineSkillLevel ──────────────────────────────────────────────────────

describe('determineSkillLevel', () => {
    it('returns currentLevel unchanged for empty history', () => {
        expect(determineSkillLevel(3, [])).toBe(3)
    })

    it('promotes (currentLevel + 1) when sustained fast solves exceed PROMOTE_WINDOW', () => {
        // Need PROMOTE_WINDOW (15) fast solves to trigger promotion at level 1
        expect(determineSkillLevel(1, fastHistory(1, PROMOTE_WINDOW))).toBe(2)
    })

    it('does NOT promote with fewer than PROMOTE_WINDOW games', () => {
        // Only 5 fast solves — not enough to promote
        expect(determineSkillLevel(1, fastHistory(1, 5))).toBe(1)
    })

    it('demotes (currentLevel - 1) when last DEMOTE_WINDOW games are very slow', () => {
        // Need DEMOTE_WINDOW (5) very slow solves to trigger demotion at level 3
        expect(determineSkillLevel(3, slowHistory(3, DEMOTE_WINDOW))).toBe(2)
    })

    it('does NOT demote beyond MAX_SKILL_LEVEL (level 9)', () => {
        expect(determineSkillLevel(9, fastHistory(9, PROMOTE_WINDOW))).toBe(9)
    })

    it('does NOT demote below MIN_SKILL_LEVEL (level 1)', () => {
        expect(determineSkillLevel(1, slowHistory(1, DEMOTE_WINDOW))).toBe(1)
    })
})

// ─── shouldForceDemotion ──────────────────────────────────────────────────────

describe('shouldForceDemotion', () => {
    it('returns true when consecutiveSkips >= CONSECUTIVE_SKIP_THRESHOLD (2)', () => {
        expect(shouldForceDemotion(CONSECUTIVE_SKIP_THRESHOLD)).toBe(true)
        expect(shouldForceDemotion(CONSECUTIVE_SKIP_THRESHOLD + 1)).toBe(true)
    })

    it('returns false when consecutiveSkips < CONSECUTIVE_SKIP_THRESHOLD', () => {
        expect(shouldForceDemotion(CONSECUTIVE_SKIP_THRESHOLD - 1)).toBe(false)
        expect(shouldForceDemotion(0)).toBe(false)
    })
})

// ─── addGameRecord ────────────────────────────────────────────────────────────

describe('addGameRecord', () => {
    it('caps history at HISTORY_SIZE (20): adding a 21st record drops the oldest', () => {
        const history = Array.from({ length: HISTORY_SIZE }, (_, i) => makeRecord(1, i))
        const newRecord = makeRecord(1, 99)
        const result = addGameRecord(history, newRecord)
        expect(result).toHaveLength(HISTORY_SIZE)
    })

    it('returns a new array containing the new record', () => {
        const history = [makeRecord(1, 5)]
        const newRecord = makeRecord(2, 10)
        const result = addGameRecord(history, newRecord)
        expect(result).toContain(newRecord)
    })

    it('does not mutate the original history array', () => {
        const history = [makeRecord(1, 5)]
        const original = [...history]
        addGameRecord(history, makeRecord(2, 10))
        expect(history).toEqual(original)
    })
})

// ─── parseHistory ─────────────────────────────────────────────────────────────

describe('parseHistory', () => {
    it('returns [] for null', () => {
        expect(parseHistory(null)).toEqual([])
    })

    it('returns [] for undefined', () => {
        expect(parseHistory(undefined)).toEqual([])
    })

    it('returns [] for empty string', () => {
        expect(parseHistory('')).toEqual([])
    })

    it('returns [] for invalid JSON', () => {
        expect(parseHistory('not-json')).toEqual([])
    })

    it('returns [] for valid JSON that is not an array: object', () => {
        expect(parseHistory('{"key":"val"}')).toEqual([])
    })

    it('returns [] for valid JSON number', () => {
        expect(parseHistory('42')).toEqual([])
    })

    it('filters out invalid entries from a mixed array', () => {
        const valid: GameRecord = { level: 1, timeTaken: 5, timestamp: 1000 }
        const mixed = JSON.stringify([valid, { bad: true }, null, 42, 'string'])
        const result = parseHistory(mixed)
        expect(result).toHaveLength(1)
        expect(result[0]).toEqual(valid)
    })

    it('returns valid GameRecord array for a well-formed JSON array', () => {
        const records: GameRecord[] = [
            { level: 1, timeTaken: 5, timestamp: 1000 },
            { level: 2, timeTaken: 15, timestamp: 2000, skipped: true },
        ]
        const result = parseHistory(JSON.stringify(records))
        expect(result).toEqual(records)
    })
})

// ─── Property 2: Performance score bounded output (Task 3.4) ─────────────────

describe('Performance score bounded output — Property 2', () => {
    /**
     * Property 2: Performance score bounded output
     * For any positive timeTaken, valid level in [1, 6], and any mistakes >= 0, result is in [0.0, 1.0]
     * Validates: Requirement 3.4
     */
    it('calculatePerformanceScore always returns a value in [0.0, 1.0]', () => {
        const times = [0, 1, 5, 10, 20, 50, 100, 1000]
        const levels = [1, 2, 3, 4, 5, 6]
        const mistakeCounts = [0, 1, 2, 3, 5, 10]
        for (const level of levels) {
            for (const timeTaken of times) {
                for (const mistakes of mistakeCounts) {
                    const score = calculatePerformanceScore(timeTaken, level, mistakes)
                    expect(score).toBeGreaterThanOrEqual(0.0)
                    expect(score).toBeLessThanOrEqual(1.0)
                }
            }
        }
    })
})

// ─── Property 3: Skip score bounded output (Task 3.5) ────────────────────────

describe('Skip score bounded output — Property 3', () => {
    /**
     * Property 3: Skip score bounded output
     * For any non-negative timeSpent and valid level in [1, 6], result is in [-0.5, -0.2]
     * Validates: Requirement 3.5
     */
    it('calculateSkipScore always returns a value in [-0.5, -0.2]', () => {
        const times = [0, 1, 5, 10, 20, 50, 100]
        const levels = [1, 2, 3, 4, 5, 6]
        for (const level of levels) {
            for (const timeSpent of times) {
                const score = calculateSkipScore(timeSpent, level)
                expect(score).toBeGreaterThanOrEqual(-0.5)
                expect(score).toBeLessThanOrEqual(-0.2)
            }
        }
    })
})

// ─── Property 4: Skill level never escapes valid range (Task 3.6) ─────────────

describe('Skill level never escapes valid range — Property 4', () => {
    /**
     * Property 4: Skill level never escapes valid range
     * For any currentLevel and any GameRecord array, result is in [MIN_SKILL_LEVEL, MAX_SKILL_LEVEL]
     * Validates: Requirements 3.7, 3.8
     */
    it('determineSkillLevel always returns a level in [MIN_SKILL_LEVEL, MAX_SKILL_LEVEL]', () => {
        const levels = [1, 2, 3, 4, 5, 6]
        const histories = [
            [],
            fastHistory(1, 3),
            slowHistory(1, 3),
            [makeRecord(1, 5), makeRecord(2, 100), makeRecord(3, 0)],
        ]
        for (const level of levels) {
            for (const history of histories) {
                const result = determineSkillLevel(level, history)
                expect(result).toBeGreaterThanOrEqual(MIN_SKILL_LEVEL)
                expect(result).toBeLessThanOrEqual(MAX_SKILL_LEVEL)
            }
        }
    })
})

// ─── Property 5: Force demotion threshold (Task 3.7) ─────────────────────────

describe('Force demotion threshold — Property 5', () => {
    /**
     * Property 5: Force demotion threshold
     * shouldForceDemotion(n) returns true iff n >= CONSECUTIVE_SKIP_THRESHOLD
     * Validates: Requirement 3.9
     */
    it('shouldForceDemotion returns true iff n >= CONSECUTIVE_SKIP_THRESHOLD', () => {
        for (let n = 0; n <= 10; n++) {
            expect(shouldForceDemotion(n)).toBe(n >= CONSECUTIVE_SKIP_THRESHOLD)
        }
    })
})

// ─── Property 6: History size cap (Task 3.8) ──────────────────────────────────

describe('History size cap — Property 6', () => {
    /**
     * Property 6: History size cap
     * addGameRecord(history, record) returns array with length <= HISTORY_SIZE containing the new record
     * Validates: Requirement 3.10
     */
    it('addGameRecord always returns length <= HISTORY_SIZE and contains the new record', () => {
        const newRecord = makeRecord(1, 42)
        for (let len = 0; len <= 10; len++) {
            const history = Array.from({ length: len }, (_, i) => makeRecord(1, i))
            const result = addGameRecord(history, newRecord)
            expect(result.length).toBeLessThanOrEqual(HISTORY_SIZE)
            expect(result).toContain(newRecord)
        }
    })
})

// ─── Property 7: Parse history robustness (Task 3.9) ─────────────────────────

describe('Parse history robustness — Property 7', () => {
    /**
     * Property 7: Parse history robustness and filtering
     * parseHistory(input) never throws and every element in the result matches GameRecord shape
     * Validates: Requirements 3.12, 3.13
     */
    it('parseHistory never throws for any input', () => {
        const inputs = [
            null,
            undefined,
            '',
            'not-json',
            '{"key":"val"}',
            '42',
            '[]',
            '[null, 1, "str", {}, {"level":1,"timeTaken":5,"timestamp":1000}]',
            '[{"level":2,"timeTaken":10,"timestamp":2000,"skipped":false}]',
        ]
        for (const input of inputs) {
            expect(() => parseHistory(input as string | null | undefined)).not.toThrow()
        }
    })

    it('every element in parseHistory result has level/timeTaken/timestamp as numbers', () => {
        const valid = JSON.stringify([
            { level: 1, timeTaken: 5, timestamp: 1000 },
            { level: 2, timeTaken: 15, timestamp: 2000, skipped: true },
        ])
        const result = parseHistory(valid)
        for (const record of result) {
            expect(typeof record.level).toBe('number')
            expect(typeof record.timeTaken).toBe('number')
            expect(typeof record.timestamp).toBe('number')
        }
    })
})
