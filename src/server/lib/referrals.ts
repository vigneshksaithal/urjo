/**
 * Referral Tracking Logic
 * Awards coins to challenge creators when new players complete their challenges.
 */

import { redis } from '@devvit/web/server'
import { REFERRAL_BONUS, REFERRAL_CAP_PER_POST } from '../../shared/engagement-constants'

type ReferralResult = { awarded: boolean; reason?: string }

const dedupKey = (postId: string, newPlayerId: string): string =>
    `referral:${postId}:${newPlayerId}`

const economyKey = (userId: string): string =>
    `user:${userId}:economy`

/**
 * Check eligibility and award referral bonus to challenge creator.
 * Guards (in order): new player check → dedup check → cap check → award.
 */
export const checkAndAwardReferral = async (
    postId: string,
    newPlayerId: string,
    challengeCreatorId: string
): Promise<ReferralResult> => {
    const totalSolvesStr = await redis.hGet(economyKey(newPlayerId), 'totalSolves')
    const totalSolves = parseInt(totalSolvesStr ?? '0', 10)
    if (totalSolves > 0) {
        return { awarded: false, reason: 'not_new_player' }
    }

    const alreadyReferred = await redis.get(dedupKey(postId, newPlayerId))
    if (alreadyReferred !== undefined) {
        return { awarded: false, reason: 'already_referred' }
    }

    const totalReferralsStr = await redis.hGet(economyKey(challengeCreatorId), 'totalReferrals')
    const totalReferrals = parseInt(totalReferralsStr ?? '0', 10)
    if (totalReferrals >= REFERRAL_CAP_PER_POST) {
        return { awarded: false, reason: 'cap_reached' }
    }

    await redis.set(dedupKey(postId, newPlayerId), 'true')
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
