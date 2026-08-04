import { describe, expect, it } from 'vitest'

import { getVerifiedDailyMissions } from '../progression-missions'

describe('getVerifiedDailyMissions', () => {
    it('returns the same three missions for the same UTC date', () => {
        expect(getVerifiedDailyMissions('2026-07-15')).toEqual(
            getVerifiedDailyMissions('2026-07-15'),
        )
        expect(getVerifiedDailyMissions('2026-07-15')).toHaveLength(3)
    })

    it('uses only server-verifiable missions and does not push another 4×4', () => {
        const missions = getVerifiedDailyMissions('2026-07-15')
        const safeTypes = ['solve_n_puzzles', 'solve_grid_size', 'maintain_streak']

        expect(missions.every((mission) => safeTypes.includes(mission.type))).toBe(true)
        expect(missions.some((mission) => mission.id === 'daily_grid_4')).toBe(false)
    })
})
