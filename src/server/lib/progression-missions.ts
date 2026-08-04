import { DAILY_MISSION_TEMPLATES } from '../../shared/engagement-constants'
import type { MissionTemplate } from '../../shared/engagement-types'
import { selectDailyMissions } from './missions'

const VERIFIED_MISSION_TYPES = new Set([
    'solve_n_puzzles',
    'solve_grid_size',
    'maintain_streak',
])

export const getVerifiedDailyMissions = (date: string): MissionTemplate[] => {
    const eligible = DAILY_MISSION_TEMPLATES.filter((template) =>
        VERIFIED_MISSION_TYPES.has(template.type) && template.id !== 'daily_grid_4',
    )
    return selectDailyMissions(date, eligible)
}
