/**
 * Engagement Growth System Types
 * Shared between client and server
 */

// ─── Mission Types (for daily post comment preview) ─────────────────────────────

/** Mission cadence — daily resets each UTC day, weekly resets each UTC Monday */
export type MissionCadence = 'daily' | 'weekly'

/** Mission template type identifiers */
export type MissionType =
    | 'solve_n_puzzles'
    | 'solve_under_time'
    | 'solve_zero_mistakes'
    | 'solve_grid_size'
    | 'maintain_streak'
    | 'earn_n_coins'
    | 'solve_each_grid'
    | 'achieve_speed_solves'
    | 'complete_daily_missions'
    | 'solve_difficulty_level'

/** Mission template definition (stored in constants) */
export type MissionTemplate = {
    readonly id: string
    readonly type: MissionType
    readonly descriptionTemplate: string
    readonly targetValue: number
    readonly coinReward: number
    readonly cadence: MissionCadence
}

// ─── Achievement Types ─────────────────────────────────────────────────────────

/** Achievement category */
export type AchievementCategory =
    | 'solve_count'
    | 'streak'
    | 'speed'
    | 'economy'
    | 'mastery'
    | 'social'

/** Achievement definition (stored in constants) */
export type AchievementDef = {
    readonly id: string
    readonly category: AchievementCategory
    readonly label: string
    readonly emoji: string
    readonly description: string
    readonly thresholdValue: number
    readonly coinBonus: number
}

/** Achievement unlock record */
export type AchievementUnlock = {
    id: string
    unlockedAt: number
}

/** User stats input for achievement checking */
export type UserStats = {
    totalSolves: number
    currentStreak: number
    longestStreak: number
    speedSolves: number
    totalCoinsEarned: number
    maxGridLevel: number
    allGridsMaxed: boolean
    sharesCount: number
    challengesCreated: number
    challengeBeats: number
}

// ─── Flair Types ───────────────────────────────────────────────────────────────

/** Flair tier */
export type FlairTier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'master'

/** Flair tier definition */
export type FlairTierDef = {
    readonly tier: FlairTier
    readonly minAchievements: number
    readonly maxAchievements: number
    readonly emoji: string
    readonly label: string
}

// ─── Variable Reward Types ─────────────────────────────────────────────────────

/** Mystery box reward type */
export type MysteryBoxRewardType = 'coins' | 'streak_freeze' | 'cosmetic_title'

/** Mystery box reward */
export type MysteryBoxReward = {
    type: MysteryBoxRewardType
    value: number
    titleId?: string | undefined
}

/** Variable reward result from a puzzle completion */
export type VariableRewardResult = {
    bonusMultiplier: number | null
    mysteryBox: MysteryBoxReward | null
}

// ─── Completion Response Extension ─────────────────────────────────────────────

/** Extended completion response fields for engagement data */
export type EngagementCompletionData = {
    variableReward: VariableRewardResult
    newAchievements: AchievementDef[]
    streakMilestone: { threshold: number; bonus: number } | null
}

// ─── Community Highlight Types ─────────────────────────────────────────────────

/** Data for building the "Yesterday's Stars" highlight comment */
export type HighlightData = {
    topStreak: { username: string; titleEmoji: string; streak: number } | null
    fastestSolves: {
        gridSize: number
        username: string
        titleEmoji: string
        timeTaken: number
    }[]
    mostCoins: { username: string; titleEmoji: string; coins: number } | null
}

/** Data for building the "Player of the Week" highlight comment */
export type WeeklyHighlightData = {
    topPlayer: { username: string; titleEmoji: string; completions: number } | null
    isoWeek: string
}
