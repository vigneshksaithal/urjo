/**
 * Referral Tracking Logic
 * Awards coins to challenge creators when new players complete their challenges.
 */

import { redis } from '@devvit/web/server'
import { REFERRAL_BONUS, REFERRAL_CAP_PER_POST } from '../../shared/engagement-constants'

type ReferralResult = { awarded: boolean; reason?: string }

type ReferralOptions = {
    newPlayerTotalSolves?: number
}

const dedupKey = (postId: string, newPlayerId: string): string =>
    `referral:${postId}:${newPlayerId}`

const economyKey = (userId: string): string =>
    `user:${userId}:economy`

const referralCountKey = (postId: string): string =>
    `referral:${postId}:count`

/**
 * Check eligibility and award referral bonus to challenge creator.
 * Guards (in order): new player check → dedup check → cap check → award.
 */
export const checkAndAwardReferral = async (
    postId: string,
    newPlayerId: string,
    challengeCreatorId: string,
    options: ReferralOptions = {}
): Promise<ReferralResult> => {
    if (newPlayerId === challengeCreatorId) {
        return { awarded: false, reason: 'self_referral' }
    }

    const totalSolves = await getNewPlayerSolveCount(newPlayerId, options)
    if (totalSolves > 0) {
        return { awarded: false, reason: 'not_new_player' }
    }

    const alreadyReferred = await redis.get(dedupKey(postId, newPlayerId))
    if (alreadyReferred !== undefined) {
        return { awarded: false, reason: 'already_referred' }
    }

    const postReferralCount = await getPostReferralCount(postId)
    if (postReferralCount >= REFERRAL_CAP_PER_POST) {
        return { awarded: false, reason: 'cap_reached' }
    }

    await redis.set(dedupKey(postId, newPlayerId), 'true')
    await redis.incrBy(referralCountKey(postId), 1)

    const totalReferralsStr = await redis.hGet(economyKey(challengeCreatorId), 'totalReferrals')
    const totalReferrals = parseInt(totalReferralsStr ?? '0', 10)
    await redis.hSet(economyKey(challengeCreatorId), {
        totalReferrals: String(totalReferrals + 1),
    })

    const coinsStr = await redis.hGet(economyKey(challengeCreatorId), 'coins')
    const totalCoinsStr = await redis.hGet(economyKey(challengeCreatorId), 'totalCoins')
    const coins = parseInt(coinsStr ?? '0', 10)
    const totalCoins = parseInt(totalCoinsStr ?? '0', 10)

    await redis.hSet(economyKey(challengeCreatorId), {
        coins: String(coins + REFERRAL_BONUS),
        totalCoins: String(totalCoins + REFERRAL_BONUS),
    })

    return { awarded: true }
}

const getNewPlayerSolveCount = async (
    newPlayerId: string,
    options: ReferralOptions
): Promise<number> => {
    if (options.newPlayerTotalSolves !== undefined) {
        return options.newPlayerTotalSolves
    }

    const totalSolvesStr = await redis.hGet(economyKey(newPlayerId), 'totalSolves')
    return parseInt(totalSolvesStr ?? '0', 10)
}

const getPostReferralCount = async (postId: string): Promise<number> => {
    const count = await redis.get(referralCountKey(postId))
    if (count === undefined) return 0

    const parsed = parseInt(count, 10)
    return Number.isNaN(parsed) ? 0 : parsed
}
