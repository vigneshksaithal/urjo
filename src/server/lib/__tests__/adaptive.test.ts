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
    HISTORY_SIZE,
    CONSECUTIVE_SKIP_THRESHOLD,
    PER_GRID_MAX_LEVEL,
} from '../../../shared/constants'
import type { GameRecord } from '../../../shared/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeRecord = (
    level: number,
    timeTaken: number,
    skipped = false,
    mistakes = 0,
    gridSize: 4 | 6 | 8 = 4,
): GameRecord => ({
    level,
    timeTaken,
    timestamp: Date.now(),
    skipped,
    mistakes,
    gridSize,
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

    it('promotes after 8 comfortable solves at the current level', () => {
        expect(determineSkillLevel(1, fastHistory(1, 8))).toBe(2)
    })

    it('does NOT promote with only 7 comfortable solves', () => {
        expect(determineSkillLevel(1, fastHistory(1, 7))).toBe(1)
    })

    it('demotes when the last 4 solves are sustained struggles', () => {
        expect(determineSkillLevel(3, slowHistory(3, 4))).toBe(2)
    })

    it('demotes immediately after 2 consecutive skips', () => {
        const history = [
            makeRecord(3, 10, false),
            makeRecord(3, 0, true),
            makeRecord(3, 0, true),
        ]
        expect(determineSkillLevel(3, history)).toBe(2)
    })

    it('does NOT promote if recent mistakes drag the weighted average below the comfort threshold', () => {
        const history = [
            makeRecord(2, 0, false, 0),
            makeRecord(2, 0, false, 0),
            makeRecord(2, 0, false, 0),
            makeRecord(2, 0, false, 0),
            makeRecord(2, 0, false, 0),
            makeRecord(2, 105, false, 1),
            makeRecord(2, 105, false, 1),
            makeRecord(2, 105, false, 1),
        ]
        expect(determineSkillLevel(2, history)).toBe(2)
    })

    it('does NOT demote beyond MAX_SKILL_LEVEL (level 9)', () => {
        expect(determineSkillLevel(9, fastHistory(9, 8))).toBe(9)
    })

    it('does NOT demote below MIN_SKILL_LEVEL (level 1)', () => {
        expect(determineSkillLevel(1, slowHistory(1, 4))).toBe(1)
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
     * For any currentLevel in [1, PER_GRID_MAX_LEVEL] and any GameRecord array,
     * result is in [MIN_SKILL_LEVEL, PER_GRID_MAX_LEVEL]
     * Validates: Requirements 3.7, 3.8
     */
    it('determineSkillLevel always returns a level in [MIN_SKILL_LEVEL, PER_GRID_MAX_LEVEL]', () => {
        const levels = [1, 2, 3, 4]
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
                expect(result).toBeLessThanOrEqual(PER_GRID_MAX_LEVEL)
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

// ─── Task 4.6: Per-grid adaptive tests ───────────────────────────────────────

describe('calculatePerformanceScore — per-grid expected times', () => {
    /**
     * Validates: Requirements 5.4, 5.5
     * 6×6 level 1 has expectedTime=120 (not 45 like 4×4 level 1).
     * Solving in 120s on 6×6 level 1 should score 0.5 (at expected time).
     * Solving in 120s on 4×4 level 1 should score 0.0 (2× expected time of 45 = 90, so 120 > 90 → 0).
     */
    it('uses 6×6 expectedTime=120 for level 1 (not 4×4 expectedTime=45)', () => {
        // At timeTaken=120 on 6×6 level 1: score = 1 - 120/(120*2) = 1 - 0.5 = 0.5
        expect(calculatePerformanceScore(120, 1, 0, 6)).toBeCloseTo(0.5)
        // At timeTaken=120 on 4×4 level 1: score = max(0, 1 - 120/(45*2)) = max(0, 1 - 1.33) = 0
        expect(calculatePerformanceScore(120, 1, 0, 4)).toBe(0.0)
    })

    it('uses 8×8 expectedTime=300 for level 1', () => {
        // At timeTaken=300 on 8×8 level 1: score = 1 - 300/(300*2) = 0.5
        expect(calculatePerformanceScore(300, 1, 0, 8)).toBeCloseTo(0.5)
        // At timeTaken=300 on 4×4 level 1: score = max(0, 1 - 300/90) = 0
        expect(calculatePerformanceScore(300, 1, 0, 4)).toBe(0.0)
    })

    it('defaults to 4×4 grid when gridSize is omitted (backward compatibility)', () => {
        // timeTaken=45 on 4×4 level 1 → score = 1 - 45/90 = 0.5
        expect(calculatePerformanceScore(45, 1)).toBeCloseTo(0.5)
        expect(calculatePerformanceScore(45, 1, 0, 4)).toBeCloseTo(0.5)
    })
})

describe('calculateSkipScore — per-grid expected times', () => {
    /**
     * Validates: Requirements 5.4, 5.5
     * 6×6 level 1 has expectedTime=120; threshold for slow skip = 120 * 0.5 = 60s.
     */
    it('uses 6×6 expectedTime=120 for skip threshold at level 1', () => {
        // timeSpent=60 on 6×6 level 1: quicknessFactor = max(0, 1 - 60/60) = 0 → score = -0.2
        expect(calculateSkipScore(60, 1, 6)).toBe(-0.2)
        // timeSpent=0 on 6×6 level 1: quicknessFactor = 1 → score = -0.5
        expect(calculateSkipScore(0, 1, 6)).toBe(-0.5)
    })

    it('defaults to 4×4 grid when gridSize is omitted (backward compatibility)', () => {
        // timeSpent=0 on 4×4 level 1 → -0.5
        expect(calculateSkipScore(0, 1)).toBe(-0.5)
        expect(calculateSkipScore(0, 1, 4)).toBe(-0.5)
    })
})

describe('determineSkillLevel — capped at PER_GRID_MAX_LEVEL (4)', () => {
    /**
     * Validates: Requirements 5.5
     * determineSkillLevel should not promote beyond PER_GRID_MAX_LEVEL=4.
     */
    it('does NOT promote beyond PER_GRID_MAX_LEVEL=4', () => {
        // At level 4 with many fast solves, should stay at 4
        const result = determineSkillLevel(4, fastHistory(4, 8))
        expect(result).toBe(4)
        expect(result).toBeLessThanOrEqual(PER_GRID_MAX_LEVEL)
    })

    it('promotes from level 3 to level 4 with sustained fast solves', () => {
        const result = determineSkillLevel(3, fastHistory(3, 8))
        expect(result).toBe(4)
    })

    it('demotes from level 4 to level 3 with sustained slow solves', () => {
        const result = determineSkillLevel(4, slowHistory(4, 4))
        expect(result).toBe(3)
    })
})
