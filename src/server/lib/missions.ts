/**
 * Mission Selection for Daily Post Comments
 * Deterministic mission selection for "Today's Missions" preview.
 */

import type { MissionTemplate } from '../../shared/engagement-types'

// ─── Deterministic Hash ────────────────────────────────────────────────────────

/** djb2 string hash — deterministic, fast, no crypto needed */
const djb2Hash = (str: string): number => {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + (str.charCodeAt(i) ?? 0)) | 0
    }
    return Math.abs(hash)
}

// ─── Mission Selection ─────────────────────────────────────────────────────────

/**
 * Select 3 daily missions deterministically from the template pool.
 * Same date + same templates → same result every time.
 * Used for the "Today's Missions" section in daily puzzle post comments.
 */
export const selectDailyMissions = (
    date: string,
    templates: readonly MissionTemplate[]
): MissionTemplate[] => {
    const dailyTemplates = templates.filter((t) => t.cadence === 'daily')
    return selectMissions(date, dailyTemplates, 3)
}

/**
 * Deterministic selection of `count` unique missions from a filtered pool.
 * Uses the seed hash to pick indices without replacement.
 */
const selectMissions = (
    seed: string,
    pool: readonly MissionTemplate[],
    count: number
): MissionTemplate[] => {
    if (pool.length === 0) return []
    const actualCount = Math.min(count, pool.length)

    const hash = djb2Hash(seed)
    const selected: MissionTemplate[] = []
    const remaining = [...pool]

    for (let i = 0; i < actualCount; i++) {
        // Derive a sub-hash for each pick to avoid clustering
        const subHash = djb2Hash(`${seed}:${i}:${hash}`)
        const index = subHash % remaining.length
        const picked = remaining[index]
        if (picked === undefined) break
        selected.push(picked)
        remaining.splice(index, 1)
    }

    return selected
}
