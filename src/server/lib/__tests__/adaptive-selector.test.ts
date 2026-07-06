import { describe, expect, it } from 'vitest'
import {
    calculateComfortIndex,
    getAdaptiveSizeMix,
    selectAdaptivePuzzleState,
    type AdaptiveHistoryRecord,
} from '../adaptive-selector'

const record = (
    gridSize: 4 | 6 | 8,
    level: number,
    {
        timeTaken = 0,
        mistakes = 0,
        skipped = false,
        source = 'adaptive',
        timestamp = Date.now(),
    }: Partial<AdaptiveHistoryRecord> = {},
): AdaptiveHistoryRecord => ({
    gridSize,
    level,
    timeTaken,
    mistakes,
    skipped,
    source,
    timestamp,
})

describe('getAdaptiveSizeMix', () => {
    it('uses the early-game mix for path levels 1-3', () => {
        expect(getAdaptiveSizeMix(1)).toEqual({ 4: 0.4, 6: 0.5, 8: 0.1 })
        expect(getAdaptiveSizeMix(3)).toEqual({ 4: 0.4, 6: 0.5, 8: 0.1 })
    })

    it('uses the late-game mix for path levels 21+', () => {
        expect(getAdaptiveSizeMix(21)).toEqual({ 4: 0.1, 6: 0.4, 8: 0.5 })
    })
})

describe('calculateComfortIndex', () => {
    it('double-weights the newest 3 adaptive outcomes', () => {
        const history: AdaptiveHistoryRecord[] = [
            record(4, 1, { timeTaken: 90, timestamp: 1 }),
            record(4, 1, { timeTaken: 90, timestamp: 2 }),
            record(4, 1, { timeTaken: 90, timestamp: 3 }),
            record(4, 1, { timeTaken: 90, timestamp: 4 }),
            record(4, 1, { timeTaken: 90, timestamp: 5 }),
            record(4, 1, { timeTaken: 0, timestamp: 6 }),
            record(4, 1, { timeTaken: 0, timestamp: 7 }),
            record(4, 1, { timeTaken: 0, timestamp: 8 }),
        ]

        expect(calculateComfortIndex(history)).toBeCloseTo(6 / 11, 5)
    })
})

describe('selectAdaptivePuzzleState', () => {
    it('forces a recovery pick after 2 struggles in the last 5 adaptive puzzles', () => {
        const adaptiveHistory: AdaptiveHistoryRecord[] = [
            record(6, 2, { timeTaken: 110, timestamp: 1 }),
            record(8, 2, { timeTaken: 600, mistakes: 8, timestamp: 2 }),
            record(8, 2, { skipped: true, timeTaken: 0, timestamp: 3 }),
            record(8, 2, { timeTaken: 310, timestamp: 4 }),
            record(8, 2, { timeTaken: 320, timestamp: 5 }),
        ]

        const result = selectAdaptivePuzzleState({
            pathLevel: 18,
            perGridLevels: { 4: 2, 6: 2, 8: 2 },
            adaptiveHistory,
            currentStreak: 2,
            sessionRun: 1,
            isFirstPuzzleOfDay: false,
            isReentry: false,
        }, () => 0.99)

        expect(result.gridSize).not.toBe(8)
    })

    it('never escalates both grid size and per-grid level in the same jump', () => {
        const result = selectAdaptivePuzzleState({
            pathLevel: 25,
            perGridLevels: { 4: 2, 6: 2, 8: 4 },
            adaptiveHistory: [record(6, 2, { timeTaken: 80, timestamp: 1 })],
            currentStreak: 1,
            sessionRun: 1,
            isFirstPuzzleOfDay: false,
            isReentry: false,
        }, () => 0.95)

        expect(result.gridSize).not.toBe(8)
    })

    it('respects a manual override when one is active', () => {
        const result = selectAdaptivePuzzleState({
            pathLevel: 12,
            perGridLevels: { 4: 1, 6: 2, 8: 3 },
            adaptiveHistory: [record(6, 2, { timeTaken: 60, timestamp: 1 })],
            currentStreak: 10,
            sessionRun: 5,
            isFirstPuzzleOfDay: false,
            isReentry: false,
            manualOverride: 8,
        }, () => 0.1)

        expect(result).toEqual({ gridSize: 8, level: 3, source: 'manual' })
    })
})
