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

describe('Grid size validation — Property 1: Grid size validation rejects all non-standard sizes', () => {
    /**
     * Feature: grid-size-selector, Property 1: Grid size validation rejects all non-standard sizes
     * Validates: Requirements 1.4
     */

    it('returns true for all valid grid sizes (4, 6, 8)', () => {
        expect(isValidGridSize(4)).toBe(true)
        expect(isValidGridSize(6)).toBe(true)
        expect(isValidGridSize(8)).toBe(true)
    })

    it('rejects arbitrary integers that are not 4, 6, or 8', () => {
        fc.assert(
            fc.property(
                fc.integer().filter((n) => n !== 4 && n !== 6 && n !== 8),
                (n) => {
                    expect(isValidGridSize(n)).toBe(false)
                }
            ),
            { numRuns: 100 }
        )
    })

    it('rejects arbitrary strings', () => {
        fc.assert(
            fc.property(fc.string(), (s) => {
                expect(isValidGridSize(s)).toBe(false)
            }),
            { numRuns: 100 }
        )
    })

    it('rejects null and undefined', () => {
        expect(isValidGridSize(null)).toBe(false)
        expect(isValidGridSize(undefined)).toBe(false)
    })

    it('rejects arbitrary objects', () => {
        fc.assert(
            fc.property(fc.object(), (obj) => {
                expect(isValidGridSize(obj)).toBe(false)
            }),
            { numRuns: 100 }
        )
    })

    it('rejects any non-standard value across mixed arbitrary types', () => {
        const nonStandardArb = fc.oneof(
            fc.integer().filter((n) => n !== 4 && n !== 6 && n !== 8),
            fc.string(),
            fc.boolean(),
            fc.double().filter((n) => !Number.isInteger(n)),
            fc.constant(null),
            fc.constant(undefined),
            fc.object(),
            fc.array(fc.integer()),
        )

        fc.assert(
            fc.property(nonStandardArb, (value) => {
                expect(isValidGridSize(value)).toBe(false)
            }),
            { numRuns: 100 }
        )
    })
})

describe('Per-grid ladder completeness — Property 2: Per-grid ladder completeness and ordering', () => {
    /**
     * Feature: grid-size-selector, Property 2: Per-grid ladder completeness and ordering
     * Validates: Requirements 2.1, 2.5
     *
     * Exhaustive test over VALID_GRID_SIZES (4, 6, 8).
     */

    const EXPECTED_DIFFICULTIES = ['easy', 'medium', 'hard', 'diabolical'] as const

    it('each valid grid size has exactly 4 entries in PER_GRID_LADDER', () => {
        for (const gridSize of VALID_GRID_SIZES) {
            const ladder = PER_GRID_LADDER[gridSize]
            expect(ladder).toHaveLength(4)
        }
    })

    it('levels are 1–4 in order for each valid grid size', () => {
        for (const gridSize of VALID_GRID_SIZES) {
            const ladder = PER_GRID_LADDER[gridSize]
            ladder.forEach((entry, index) => {
                expect(entry.level).toBe(index + 1)
            })
        }
    })

    it('difficulties are in order [easy, medium, hard, diabolical] for each valid grid size', () => {
        for (const gridSize of VALID_GRID_SIZES) {
            const ladder = PER_GRID_LADDER[gridSize]
            ladder.forEach((entry, index) => {
                expect(entry.difficulty).toBe(EXPECTED_DIFFICULTIES[index])
            })
        }
    })

    it('each entry has a positive expectedTime for each valid grid size', () => {
        for (const gridSize of VALID_GRID_SIZES) {
            const ladder = PER_GRID_LADDER[gridSize]
            for (const entry of ladder) {
                expect(entry.expectedTime).toBeGreaterThan(0)
            }
        }
    })

    it('expectedTime is strictly increasing with level for each valid grid size', () => {
        for (const gridSize of VALID_GRID_SIZES) {
            const ladder = PER_GRID_LADDER[gridSize]
            for (let i = 1; i < ladder.length; i++) {
                expect(ladder[i]!.expectedTime).toBeGreaterThan(ladder[i - 1]!.expectedTime)
            }
        }
    })

    it('each entry has the correct gridSize field matching the ladder key', () => {
        for (const gridSize of VALID_GRID_SIZES) {
            const ladder = PER_GRID_LADDER[gridSize]
            for (const entry of ladder) {
                expect(entry.gridSize).toBe(gridSize)
            }
        }
    })
})

describe('Skill level clamping within grid bounds — Property 3', () => {
    /**
     * Feature: grid-size-selector, Property 3: Skill level clamping within grid bounds
     * For any valid grid size and any integer level (including values below 1 and above 4),
     * getGridLevelConfig(gridSize, level) SHALL return a config with level clamped to
     * the range [1, PER_GRID_MAX_LEVEL].
     * Validates: Requirements 5.5
     */
    it('getGridLevelConfig always returns a level in [PER_GRID_MIN_LEVEL, PER_GRID_MAX_LEVEL] for any integer input', () => {
        const gridSizeArb = fc.constantFrom(...VALID_GRID_SIZES)
        const levelArb = fc.integer({ min: -10, max: 100 })

        fc.assert(
            fc.property(gridSizeArb, levelArb, (gridSize, level) => {
                const config = getGridLevelConfig(gridSize, level)
                expect(config.level).toBeGreaterThanOrEqual(PER_GRID_MIN_LEVEL)
                expect(config.level).toBeLessThanOrEqual(PER_GRID_MAX_LEVEL)
            }),
            { numRuns: 100 }
        )
    })
})
