/**
 * Migration module: one-time migration of existing users from the old global
 * skill level to the new per-grid skill level system.
 */

import { redis } from '@devvit/web/server'
import type { GridSize } from '../../shared/constants'
import { getSkillLevel } from './helpers'
import { setGridSizePreference, setGridSkillLevel } from './helpers'

// ─── Pure mapping logic ───────────────────────────────────────────────────────

export type OldLevelMapping = {
    gridSize: GridSize
    level: number
}

/**
 * Map an old global skill level (1–9) to a (gridSize, perGridLevel) pair.
 * Old levels 1–3 → 4×4 levels 1–3
 * Old levels 4–6 → 6×6 levels 1–3
 * Old levels 7–9 → 8×8 levels 1–3
 *
 * Input is clamped to [1, 9] before mapping.
 */
export const mapOldLevelToGrid = (oldLevel: number): OldLevelMapping => {
    const clamped = Math.max(1, Math.min(9, oldLevel))

    if (clamped <= 3) {
        return { gridSize: 4, level: clamped }
    }
    if (clamped <= 6) {
        return { gridSize: 6, level: clamped - 3 }
    }
    return { gridSize: 8, level: clamped - 6 }
}

// ─── Migration flag ───────────────────────────────────────────────────────────

/**
 * Check whether a user has already been migrated to the per-grid system.
 */
export const isUserMigrated = async (userId: string): Promise<boolean> => {
    const flag = await redis.get(`user:${userId}:gridMigrated`)
    return flag === 'true'
}

// ─── Migration runner ─────────────────────────────────────────────────────────

/**
 * Migrate a user from the old global skill level to per-grid skill levels.
 *
 * Reads the old `user:{userId}:skillLevel` key (defaults to 1 if missing),
 * maps it to a (gridSize, perGridLevel) pair, then writes:
 *   - `user:{userId}:gridSizePreference`
 *   - `user:{userId}:skillLevel:{gridSize}`
 *   - `user:{userId}:gridMigrated` = "true"
 *
 * Returns the resulting (gridSize, level) pair.
 * If the user is already migrated, returns early without writing.
 */
export const migrateUserToPerGrid = async (userId: string): Promise<OldLevelMapping> => {
    const alreadyMigrated = await isUserMigrated(userId)
    if (alreadyMigrated) {
        // Return the current preference without re-migrating
        const storedPref = await redis.get(`user:${userId}:gridSizePreference`)
        const gridSize = storedPref !== undefined ? (parseInt(storedPref, 10) as GridSize) : 4
        const storedLevel = await redis.get(`user:${userId}:skillLevel:${gridSize}`)
        const level = storedLevel !== undefined ? parseInt(storedLevel, 10) : 1
        return { gridSize, level }
    }

    const oldLevel = await getSkillLevel(userId)
    const mapping = mapOldLevelToGrid(oldLevel)

    await setGridSizePreference(userId, mapping.gridSize)
    await setGridSkillLevel(userId, mapping.gridSize, mapping.level)
    await redis.set(`user:${userId}:gridMigrated`, 'true')

    return mapping
}
