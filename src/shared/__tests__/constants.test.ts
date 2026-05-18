import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
    getLevelConfig,
    getTitleById,
    getDailyLoginBonus,
    isValidGridSize,
    getGridLevelConfig,
    DIFFICULTY_LADDER,
    MIN_SKILL_LEVEL,
    MAX_SKILL_LEVEL,
    DAILY_LOGIN_BONUS,
    PER_GRID_LADDER,
    PER_GRID_MAX_LEVEL,
    PER_GRID_MIN_LEVEL,
    VALID_GRID_SIZES,
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



describe('getDailyLoginBonus', () => {
    it('returns 5 coins for day 1', () => {
        expect(getDailyLoginBonus(1)).toBe(5)
    })

    it('returns 5 coins for day 2', () => {
        expect(getDailyLoginBonus(2)).toBe(5)
    })

    it('returns 10 coins for day 3', () => {
        expect(getDailyLoginBonus(3)).toBe(10)
    })

    it('returns 10 coins for day 4', () => {
        expect(getDailyLoginBonus(4)).toBe(10)
    })

    it('returns 25 coins for day 5', () => {
        expect(getDailyLoginBonus(5)).toBe(25)
    })

    it('returns 25 coins for day 10 (caps at day 5)', () => {
        expect(getDailyLoginBonus(10)).toBe(25)
    })

    it('returns 25 coins for day 100 (caps at day 5)', () => {
        expect(getDailyLoginBonus(100)).toBe(25)
    })

    it('returns 5 coins for day 0 (fallback)', () => {
        expect(getDailyLoginBonus(0)).toBe(5)
    })

    it('returns 5 coins for negative days (fallback)', () => {
        expect(getDailyLoginBonus(-1)).toBe(5)
    })
})

describe('DAILY_LOGIN_BONUS constant', () => {
    it('has correct values [5, 5, 10, 10, 25]', () => {
        expect(DAILY_LOGIN_BONUS).toEqual([5, 5, 10, 10, 25])
    })
})

