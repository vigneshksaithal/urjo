/**
 * Social loop counters for share, challenge, and challenge-beat achievements.
 */

import { redis } from '@devvit/web/server'

export type SocialStats = {
    sharesCount: number
    challengesCreated: number
    challengeBeats: number
}

const SOCIAL_COUNTER_DEFAULTS: SocialStats = {
    sharesCount: 0,
    challengesCreated: 0,
    challengeBeats: 0,
}

const socialKey = (userId: string): string =>
    `user:${userId}:social`

export const getSocialStats = async (userId: string): Promise<SocialStats> => {
    const raw = await redis.hGetAll(socialKey(userId))

    return {
        sharesCount: parseSocialCounter(raw['sharesCount']),
        challengesCreated: parseSocialCounter(raw['challengesCreated']),
        challengeBeats: parseSocialCounter(raw['challengeBeats']),
    }
}

export const incrementSharesCount = async (userId: string): Promise<number> =>
    redis.hIncrBy(socialKey(userId), 'sharesCount', 1)

export const incrementChallengesCreated = async (userId: string): Promise<number> =>
    redis.hIncrBy(socialKey(userId), 'challengesCreated', 1)

export const incrementChallengeBeats = async (userId: string): Promise<number> =>
    redis.hIncrBy(socialKey(userId), 'challengeBeats', 1)

const parseSocialCounter = (value: string | undefined): number => {
    if (value === undefined) return SOCIAL_COUNTER_DEFAULTS.sharesCount

    const parsed = parseInt(value, 10)
    return Number.isNaN(parsed) ? 0 : parsed
}
