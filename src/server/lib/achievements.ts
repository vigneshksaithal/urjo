/**
 * Achievement Checking, Flair Tier Logic, and Redis Persistence
 * Pure functions for achievement checking and flair formatting,
 * plus Redis persistence for unlocking achievements and updating flair.
 */

import { redis, reddit, context } from '@devvit/web/server'
import type { AchievementDef, AchievementUnlock, FlairTierDef, UserStats } from '../../shared/engagement-types'
import { ACHIEVEMENT_DEFS, FLAIR_TIER_DEFS, STREAK_MILESTONES } from '../../shared/engagement-constants'
import { getTitleById } from '../../shared/constants'

// ─── Milestone Achievement ID Map ──────────────────────────────────────────────

/** Maps streak threshold to its achievement ID */
const STREAK_MILESTONE_IDS: Record<number, string> = {
    7: 'streak_7',
    30: 'streak_30',
    100: 'streak_100',
    365: 'streak_365',
}

// ─── Pure Functions ────────────────────────────────────────────────────────────

/**
 * Check which achievements a user qualifies for but hasn't unlocked yet.
 * Pure function — no side effects.
 */
export const checkAchievements = (stats: UserStats, unlocked: string[]): AchievementDef[] => {
    const unlockedSet = new Set(unlocked)
    return ACHIEVEMENT_DEFS.filter((def) => !unlockedSet.has(def.id) && meetsThreshold(def, stats))
}

/** Determine if a user's stats meet an achievement's threshold. */
const meetsThreshold = (def: AchievementDef, stats: UserStats): boolean => {
    switch (def.category) {
        case 'solve_count':
            return stats.totalSolves >= def.thresholdValue

        case 'streak':
            return Math.max(stats.currentStreak, stats.longestStreak) >= def.thresholdValue

        case 'speed':
            return stats.speedSolves >= def.thresholdValue

        case 'economy':
            return stats.totalCoinsEarned >= def.thresholdValue

        case 'mastery':
            if (def.id === 'mastery_all_grids') return stats.allGridsMaxed === true
            // mastery_any_grid
            return stats.maxGridLevel >= def.thresholdValue

        case 'social':
            if (def.id === 'social_shares_5') return stats.sharesCount >= def.thresholdValue
            if (def.id === 'social_challenges_5') return stats.challengesCreated >= def.thresholdValue
            if (def.id === 'social_beats_10') return stats.challengeBeats >= def.thresholdValue
            return false
    }
}

/**
 * Map an achievement count to a flair tier.
 * For count 0, returns bronze (the lowest tier) as the default.
 * Pure function — no side effects.
 */
export const getFlairTier = (achievementCount: number): FlairTierDef => {
    // Find the highest tier the user qualifies for
    const matching = FLAIR_TIER_DEFS.filter((t) => achievementCount >= t.minAchievements)
    if (matching.length === 0) {
        // Below bronze — return bronze as the default tier
        return FLAIR_TIER_DEFS[0]!
    }
    // Return the highest matching tier (last in the sorted array)
    return matching[matching.length - 1]!
}

/**
 * Format a flair string from tier, title emoji, and title label.
 * Returns `{tierEmoji} {titleEmoji} {titleLabel}`.
 * Pure function — no side effects.
 */
export const formatFlair = (tier: FlairTierDef, titleEmoji: string, titleLabel: string): string =>
    `${tier.emoji} ${titleEmoji} ${titleLabel}`

/**
 * Check if the current streak hits a milestone not yet unlocked.
 * Returns the HIGHEST qualifying milestone, or null if none.
 * Pure function — no side effects.
 */
export const checkStreakMilestone = (
    currentStreak: number,
    unlockedAchievements: string[]
): { threshold: number; bonus: number } | null => {
    const unlockedSet = new Set(unlockedAchievements)

    // Find all milestones the user qualifies for but hasn't unlocked
    const qualifying = STREAK_MILESTONES.filter((m) => {
        const achievementId = STREAK_MILESTONE_IDS[m.threshold]
        return currentStreak >= m.threshold && achievementId !== undefined && !unlockedSet.has(achievementId)
    })

    if (qualifying.length === 0) return null

    // Return the highest qualifying milestone (largest threshold)
    return qualifying[qualifying.length - 1] ?? null
}

// ─── Redis Persistence ─────────────────────────────────────────────────────────

/**
 * Read all unlocked achievements for a user from Redis.
 * Returns empty array if no achievements have been stored yet.
 */
export const getUnlockedAchievements = async (userId: string): Promise<AchievementUnlock[]> => {
    const raw = await redis.get(`user:${userId}:achievements`)
    if (raw === undefined) return []
    return JSON.parse(raw) as AchievementUnlock[]
}

/**
 * Persist new achievement unlocks, award coin bonuses, update flair tier,
 * and optionally update Reddit flair for opted-in users.
 * Does nothing if newAchievements is empty.
 */
export const unlockAchievements = async (
    userId: string,
    newAchievements: AchievementDef[]
): Promise<void> => {
    if (newAchievements.length === 0) return

    // Merge with existing unlocks
    const existing = await getUnlockedAchievements(userId)
    const now = Date.now()
    const newUnlocks: AchievementUnlock[] = newAchievements.map((a) => ({
        id: a.id,
        unlockedAt: now,
    }))
    const merged = [...existing, ...newUnlocks]

    // Persist updated achievements list
    await redis.set(`user:${userId}:achievements`, JSON.stringify(merged))

    // Award coin bonuses for each new achievement
    const totalBonus = newAchievements.reduce((sum, a) => sum + a.coinBonus, 0)
    const economyKey = `user:${userId}:economy`
    await Promise.all([
        redis.hIncrBy(economyKey, 'coins', totalBonus),
        redis.hIncrBy(economyKey, 'totalCoins', totalBonus),
    ])

    // Update flair tier based on total achievement count
    const newTier = getFlairTier(merged.length)
    await redis.set(`user:${userId}:flairTier`, newTier.tier)

    // Update Reddit flair only for opted-in users
    const optIn = await redis.get(`user:${userId}:flairOptIn`)
    if (optIn !== 'true') return

    await updateRedditFlair(userId, newTier)
}

/** Update the user's Reddit flair with their current tier and equipped title. */
const updateRedditFlair = async (userId: string, tier: FlairTierDef): Promise<void> => {
    const economyKey = `user:${userId}:economy`
    const equippedTitleId = await redis.hGet(economyKey, 'equippedTitle')
    const titleId = equippedTitleId ?? 'puzzler'
    const titleDef = getTitleById(titleId)

    const titleEmoji = titleDef?.emoji ?? '🧩'
    const titleLabel = titleDef?.label ?? 'Puzzler'
    const flairText = formatFlair(tier, titleEmoji, titleLabel)

    const user = await reddit.getCurrentUser()
    if (!user) return

    await reddit.setUserFlair({
        subredditName: context.subredditName,
        username: user.username,
        text: flairText,
    })
}
