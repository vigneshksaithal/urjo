/**
 * Regression-guard test for the difficulty-weighted-scoring rework.
 *
 * Feature: difficulty-weighted-scoring, Task 8.2: legacy scoring lookups removed
 *
 * This is the design's "grep-style assertion": it scans the scoring-relevant
 * source files and asserts the removed legacy identifiers can never silently
 * return to a scoring path. Pure Vitest test — reads files from disk, no Redis
 * or devvit context required.
 *
 * Validates: Requirements 1.2, 1.4, 1.5
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// This test lives in src/shared/__tests__, so the repo `src` root is two
// directories up. Resolve source paths relative to this file for portability.
const SRC_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Scoring-relevant source files that must not reference legacy lookups. */
const SCORING_SOURCE_FILES = [
    'shared/constants.ts',
    'server/lib/economy.ts',
    'server/lib/seasons.ts',
    'server/routes/game.ts',
] as const

/**
 * Legacy identifiers removed by tasks 8.1 / 5.1 / 7.1. Word-boundary matching
 * avoids false positives from longer identifiers (e.g. `getGridLevelConfig`
 * must not trip the `getLevelConfig` guard).
 */
const FORBIDDEN_IDENTIFIERS = [
    'COIN_BASE',
    'COINS_BY_LEVEL',
    'getCoinBaseForLevel',
    'PAR_TIME_MULTIPLIER',
    'getLevelConfig',
    'DIFFICULTY_LADDER',
    'PAR_TIME_BY_GRID_SIZE',
    'getParTimeForGrid',
] as const

describe('Feature: difficulty-weighted-scoring, Task 8.2: legacy scoring lookups removed', () => {
    for (const relativePath of SCORING_SOURCE_FILES) {
        const contents = readFileSync(path.join(SRC_ROOT, relativePath), 'utf8')

        for (const identifier of FORBIDDEN_IDENTIFIERS) {
            it(`${relativePath} does not reference legacy "${identifier}"`, () => {
                const pattern = new RegExp(`\\b${identifier}\\b`)
                expect(pattern.test(contents)).toBe(false)
            })
        }
    }
})
