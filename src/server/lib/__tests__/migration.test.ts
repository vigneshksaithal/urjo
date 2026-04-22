/**
 * Tests for src/server/lib/migration.ts
 * Covers unit tests (task 2.5) and property tests (task 2.4 — Property 6).
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { mapOldLevelToGrid, isUserMigrated, migrateUserToPerGrid } from '../migration'
import { getGridSizePreference, getGridSkillLevel } from '../helpers'

// ─── mapOldLevelToGrid (pure) ─────────────────────────────────────────────────

describe('mapOldLevelToGrid', () => {
    it('maps level 1 → (4, 1)', () => {
        expect(mapOldLevelToGrid(1)).toEqual({ gridSize: 4, level: 1 })
    })

    it('maps level 2 → (4, 2)', () => {
        expect(mapOldLevelToGrid(2)).toEqual({ gridSize: 4, level: 2 })
    })

    it('maps level 3 → (4, 3)', () => {
        expect(mapOldLevelToGrid(3)).toEqual({ gridSize: 4, level: 3 })
    })

    it('maps level 4 → (6, 1)', () => {
        expect(mapOldLevelToGrid(4)).toEqual({ gridSize: 6, level: 1 })
    })

    it('maps level 5 → (6, 2)', () => {
        expect(mapOldLevelToGrid(5)).toEqual({ gridSize: 6, level: 2 })
    })

    it('maps level 6 → (6, 3)', () => {
        expect(mapOldLevelToGrid(6)).toEqual({ gridSize: 6, level: 3 })
    })

    it('maps level 7 → (8, 1)', () => {
        expect(mapOldLevelToGrid(7)).toEqual({ gridSize: 8, level: 1 })
    })

    it('maps level 8 → (8, 2)', () => {
        expect(mapOldLevelToGrid(8)).toEqual({ gridSize: 8, level: 2 })
    })

    it('maps level 9 → (8, 3)', () => {
        expect(mapOldLevelToGrid(9)).toEqual({ gridSize: 8, level: 3 })
    })

    it('clamps values below 1 to level 1 → (4, 1)', () => {
        expect(mapOldLevelToGrid(0)).toEqual({ gridSize: 4, level: 1 })
        expect(mapOldLevelToGrid(-5)).toEqual({ gridSize: 4, level: 1 })
    })

    it('clamps values above 9 to level 9 → (8, 3)', () => {
        expect(mapOldLevelToGrid(10)).toEqual({ gridSize: 8, level: 3 })
        expect(mapOldLevelToGrid(100)).toEqual({ gridSize: 8, level: 3 })
    })
})

// ─── Property 6: Migration mapping round-trip consistency ─────────────────────
// Validates: Requirements 8.1, 8.2, 8.3

describe('Property 6: Migration mapping round-trip consistency', () => {
    it('for any old level in [1,9]: gridSize ∈ {4,6,8}, perGridLevel ∈ [1,3], deterministic, correct bucket', () => {
        /**
         * **Validates: Requirements 8.1, 8.2, 8.3**
         *
         * For any old skill level in [1, 9]:
         * (a) gridSize is one of {4, 6, 8}
         * (b) perGridLevel is in [1, 3]
         * (c) mapping is deterministic
         * (d) levels 1–3 → gridSize 4, levels 4–6 → gridSize 6, levels 7–9 → gridSize 8
         */
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 9 }), (oldLevel) => {
                const result = mapOldLevelToGrid(oldLevel)

                // (a) gridSize must be one of {4, 6, 8}
                expect([4, 6, 8]).toContain(result.gridSize)

                // (b) perGridLevel must be in [1, 3]
                expect(result.level).toBeGreaterThanOrEqual(1)
                expect(result.level).toBeLessThanOrEqual(3)

                // (c) deterministic — same input always produces same output
                const result2 = mapOldLevelToGrid(oldLevel)
                expect(result).toEqual(result2)

                // (d) correct bucket assignment
                if (oldLevel <= 3) {
                    expect(result.gridSize).toBe(4)
                } else if (oldLevel <= 6) {
                    expect(result.gridSize).toBe(6)
                } else {
                    expect(result.gridSize).toBe(8)
                }
            }),
            { numRuns: 100 },
        )
    })
})

// ─── isUserMigrated ───────────────────────────────────────────────────────────

const testNotMigrated = createDevvitTest({ userId: 't2_testuser' })

testNotMigrated('isUserMigrated returns false for new user', async () => {
    const migrated = await isUserMigrated('t2_testuser')
    expect(migrated).toBe(false)
})

const testMigratedFlag = createDevvitTest({ userId: 't2_testuser' })

testMigratedFlag('isUserMigrated returns true when flag is set', async () => {
    await redis.set('user:t2_testuser:gridMigrated', 'true')
    const migrated = await isUserMigrated('t2_testuser')
    expect(migrated).toBe(true)
})

// ─── migrateUserToPerGrid ─────────────────────────────────────────────────────

const testMigrateLevel1 = createDevvitTest({ userId: 't2_testuser' })

testMigrateLevel1('migrates level 1 → gridSize 4, perGridLevel 1', async () => {
    await redis.set('user:t2_testuser:skillLevel', '1')
    const result = await migrateUserToPerGrid('t2_testuser')
    expect(result).toEqual({ gridSize: 4, level: 1 })
    expect(await getGridSizePreference('t2_testuser')).toBe(4)
    expect(await getGridSkillLevel('t2_testuser', 4)).toBe(1)
    expect(await isUserMigrated('t2_testuser')).toBe(true)
})

const testMigrateLevel5 = createDevvitTest({ userId: 't2_testuser' })

testMigrateLevel5('migrates level 5 → gridSize 6, perGridLevel 2', async () => {
    await redis.set('user:t2_testuser:skillLevel', '5')
    const result = await migrateUserToPerGrid('t2_testuser')
    expect(result).toEqual({ gridSize: 6, level: 2 })
    expect(await getGridSizePreference('t2_testuser')).toBe(6)
    expect(await getGridSkillLevel('t2_testuser', 6)).toBe(2)
})

const testMigrateLevel9 = createDevvitTest({ userId: 't2_testuser' })

testMigrateLevel9('migrates level 9 → gridSize 8, perGridLevel 3', async () => {
    await redis.set('user:t2_testuser:skillLevel', '9')
    const result = await migrateUserToPerGrid('t2_testuser')
    expect(result).toEqual({ gridSize: 8, level: 3 })
    expect(await getGridSizePreference('t2_testuser')).toBe(8)
    expect(await getGridSkillLevel('t2_testuser', 8)).toBe(3)
})

const testMigrateNoSkillLevel = createDevvitTest({ userId: 't2_testuser' })

testMigrateNoSkillLevel('migrates user with no old skill level — defaults to level 1 → (4, 1)', async () => {
    // No skillLevel key set — should default to DEFAULT_SKILL_LEVEL (1)
    const result = await migrateUserToPerGrid('t2_testuser')
    expect(result).toEqual({ gridSize: 4, level: 1 })
    expect(await getGridSizePreference('t2_testuser')).toBe(4)
    expect(await getGridSkillLevel('t2_testuser', 4)).toBe(1)
})

const testMigrateAlreadyMigrated = createDevvitTest({ userId: 't2_testuser' })

testMigrateAlreadyMigrated('already-migrated user is a no-op — returns current state', async () => {
    // Set up a previously migrated state
    await redis.set('user:t2_testuser:gridMigrated', 'true')
    await redis.set('user:t2_testuser:gridSizePreference', '6')
    await redis.set('user:t2_testuser:skillLevel:6', '3')

    // Change the old skill level to something different — should be ignored
    await redis.set('user:t2_testuser:skillLevel', '9')

    const result = await migrateUserToPerGrid('t2_testuser')
    expect(result).toEqual({ gridSize: 6, level: 3 })
    // Preference and per-grid level should remain unchanged
    expect(await getGridSizePreference('t2_testuser')).toBe(6)
    expect(await getGridSkillLevel('t2_testuser', 6)).toBe(3)
})

const testMigrateIdempotent = createDevvitTest({ userId: 't2_testuser' })

testMigrateIdempotent('migration flag prevents re-migration on second call', async () => {
    await redis.set('user:t2_testuser:skillLevel', '3')
    await migrateUserToPerGrid('t2_testuser')

    // Change old skill level after first migration
    await redis.set('user:t2_testuser:skillLevel', '7')

    // Second call should not re-migrate
    const result = await migrateUserToPerGrid('t2_testuser')
    expect(result).toEqual({ gridSize: 4, level: 3 })
})
