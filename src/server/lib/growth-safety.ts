/**
 * Guardrails for aggressive r/urjo growth loops.
 *
 * These helpers keep scheduler-generated posts and auto-challenges capped by
 * date, subreddit, and user so growth mechanics remain compliant and auditable.
 */

import { redis } from '@devvit/web/server'

import type { PostFrequency } from '../../shared/growth-types'

export type GrowthPostSlot = 'speed_window' | 'daily_puzzle' | 'evening_puzzle'

export type AutoChallengeClaim = {
    date: string
    subredditId: string
    userId: string
}

export const AUTO_CHALLENGE_DAILY_CAP = {
    perUser: 3,
    perSubreddit: 250,
} as const

const DAILY_SLOT_TTL_SECONDS = 48 * 3600

export const getGrowthPostSlot = (date: Date): GrowthPostSlot => {
    const hour = date.getUTCHours()
    if (hour === 8) return 'speed_window'
    if (hour === 23) return 'evening_puzzle'
    return 'daily_puzzle'
}

export const isGrowthPostSlotEnabled = (
    frequency: PostFrequency,
    slot: GrowthPostSlot,
): boolean => {
    if (slot === 'daily_puzzle') return true
    if (frequency === 'thrice_daily') return true
    return frequency === 'twice_daily' && slot === 'speed_window'
}

export const claimGrowthPostSlot = async (
    date: string,
    subredditId: string,
    slot: GrowthPostSlot,
): Promise<boolean> => claimDedup(growthPostSlotKey(date, subredditId, slot))

export const claimAutoChallengeSlot = async ({
    date,
    subredditId,
    userId,
}: AutoChallengeClaim): Promise<boolean> => {
    const userCount = await readCounter(autoChallengeUserKey(date, userId))
    if (userCount >= AUTO_CHALLENGE_DAILY_CAP.perUser) return false

    const subredditCount = await readCounter(autoChallengeSubredditKey(date, subredditId))
    if (subredditCount >= AUTO_CHALLENGE_DAILY_CAP.perSubreddit) return false

    await Promise.all([
        incrementDailyCounter(autoChallengeUserKey(date, userId)),
        incrementDailyCounter(autoChallengeSubredditKey(date, subredditId)),
    ])
    return true
}

const growthPostSlotKey = (
    date: string,
    subredditId: string,
    slot: GrowthPostSlot,
): string => `growth-post:${date}:${subredditId}:${slot}`

const autoChallengeUserKey = (date: string, userId: string): string =>
    `auto-challenge:${date}:user:${userId}`

const autoChallengeSubredditKey = (date: string, subredditId: string): string =>
    `auto-challenge:${date}:subreddit:${subredditId}`

const claimDedup = async (key: string): Promise<boolean> => {
    const existing = await redis.get(key)
    if (existing !== undefined) return false

    await redis.set(key, '1')
    await redis.expire(key, DAILY_SLOT_TTL_SECONDS)
    return true
}

const readCounter = async (key: string): Promise<number> => {
    const raw = await redis.get(key)
    if (raw === undefined) return 0
    const parsed = parseInt(raw, 10)
    return Number.isNaN(parsed) ? 0 : parsed
}

const incrementDailyCounter = async (key: string): Promise<void> => {
    await redis.incrBy(key, 1)
    await redis.expire(key, DAILY_SLOT_TTL_SECONDS)
}
