/**
 * Guardrails for aggressive r/urjo growth loops.
 *
 * These helpers keep scheduler-generated posts capped by
 * date and subreddit so growth mechanics remain compliant and auditable.
 */

import { redis } from '@devvit/web/server'

import type { PostFrequency } from '../../shared/growth-types'

export type GrowthPostSlot = 'speed_window' | 'daily_puzzle' | 'evening_puzzle'

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

const growthPostSlotKey = (
    date: string,
    subredditId: string,
    slot: GrowthPostSlot,
): string => `growth-post:${date}:${subredditId}:${slot}`

const claimDedup = async (key: string): Promise<boolean> => {
    const existing = await redis.get(key)
    if (existing !== undefined) return false

    await redis.set(key, '1')
    await redis.expire(key, DAILY_SLOT_TTL_SECONDS)
    return true
}
