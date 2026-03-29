import { describe, it, expect } from 'vitest'
import {
    getLevelConfig,
    getTitleById,
    DIFFICULTY_LADDER,
    MIN_SKILL_LEVEL,
    MAX_SKILL_LEVEL,
} from '../constants'

describe('getLevelConfig', () => {
    it('returns correct config for each level 1–6', () => {
        for (const expected of DIFFICULTY_LADDER) {
            const config = getLevelConfig(expected.level)
            expect(config.level).toBe(expected.level)
            expect(config.gridSize).toBe(expected.gridSize)
            expect(config.difficulty).toBe(expected.difficulty)
            expect(config.expectedTime).toBe(expected.expectedTime)
        }
    })

    it('clamps level 0 to level 1 config', () => {
        expect(getLevelConfig(0).level).toBe(1)
    })

    it('clamps level -5 to level 1 config', () => {
        expect(getLevelConfig(-5).level).toBe(1)
    })

    it('clamps level 10 to level 9 config (MAX_SKILL_LEVEL)', () => {
        expect(getLevelConfig(10).level).toBe(MAX_SKILL_LEVEL)
    })

    it('clamps level 99 to level 9 config (MAX_SKILL_LEVEL)', () => {
        expect(getLevelConfig(99).level).toBe(MAX_SKILL_LEVEL)
    })
})

describe('getTitleById', () => {
    it('returns correct TitleDef for "puzzler"', () => {
        const title = getTitleById('puzzler')
        expect(title).toBeDefined()
        expect(title?.id).toBe('puzzler')
        expect(title?.emoji).toBe('🧩')
        expect(title?.label).toBe('Puzzler')
        expect(title?.cost).toBe(0)
    })

    it('returns correct TitleDef for "streak_lord"', () => {
        const title = getTitleById('streak_lord')
        expect(title).toBeDefined()
        expect(title?.id).toBe('streak_lord')
        expect(title?.emoji).toBe('🔥')
        expect(title?.label).toBe('Streak Lord')
        expect(title?.cost).toBe(100)
    })

    it('returns undefined for unknown ID', () => {
        expect(getTitleById('nonexistent')).toBeUndefined()
    })
})

describe('Level config clamping — Property 1', () => {
    /**
     * Property 1: Level config clamping
     * For any integer level, getLevelConfig(level).level is in [MIN_SKILL_LEVEL, MAX_SKILL_LEVEL]
     * Validates: Requirement 3.1
     */
    it('getLevelConfig always returns a level in [MIN_SKILL_LEVEL, MAX_SKILL_LEVEL] for any integer input', () => {
        for (let level = -100; level <= 100; level++) {
            const config = getLevelConfig(level)
            expect(config.level).toBeGreaterThanOrEqual(MIN_SKILL_LEVEL)
            expect(config.level).toBeLessThanOrEqual(MAX_SKILL_LEVEL)
        }
    })
})
