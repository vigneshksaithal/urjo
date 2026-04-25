/**
 * Tests for referral tracking logic.
 * All tests use createDevvitTest for in-memory Redis isolation.
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { expect } from 'vitest'
import { checkAndAwardReferral } from '../referrals'
import { REFERRAL_BONUS, REFERRAL_CAP_PER_POST } from '../../../shared/engagement-constants'

// ─── not_new_player guard ─────────────────────────────────────────────────────

const testNotNew = createDevvitTest()

testNotNew('returns { awarded: false, reason: "not_new_player" } when totalSolves > 0', async () => {
    await redis.hSet('user:player1:economy', { totalSolves: '5' })
    const result = await checkAndAwardReferral('post1', 'player1', 'creator1')
    expect(result).toEqual({ awarded: false, reason: 'not_new_player' })
})

// ─── successful award ─────────────────────────────────────────────────────────

const testNewPlayer = createDevvitTest()

testNewPlayer('returns { awarded: true } for a genuine new player (totalSolves = 0)', async () => {
    // totalSolves defaults to 0 (key absent)
    const result = await checkAndAwardReferral('post1', 'player1', 'creator1')
    expect(result).toEqual({ awarded: true })
})

const testCoins = createDevvitTest()

testCoins('awards REFERRAL_BONUS coins to challenge creator on success', async () => {
    await checkAndAwardReferral('post1', 'player1', 'creator1')

    const coins = await redis.hGet('user:creator1:economy', 'coins')
    const totalCoins = await redis.hGet('user:creator1:economy', 'totalCoins')

    expect(parseInt(coins ?? '0', 10)).toBe(REFERRAL_BONUS)
    expect(parseInt(totalCoins ?? '0', 10)).toBe(REFERRAL_BONUS)
})

const testTotalReferrals = createDevvitTest()

testTotalReferrals('increments totalReferrals on creator economy hash', async () => {
    await checkAndAwardReferral('post1', 'player1', 'creator1')

    const totalReferrals = await redis.hGet('user:creator1:economy', 'totalReferrals')
    expect(parseInt(totalReferrals ?? '0', 10)).toBe(1)
})

const testDedupKey = createDevvitTest()

testDedupKey('sets dedup key referral:{postId}:{newPlayerId} to "true"', async () => {
    await checkAndAwardReferral('post1', 'player1', 'creator1')

    const dedupValue = await redis.get('referral:post1:player1')
    expect(dedupValue).toBe('true')
})

// ─── already_referred guard ───────────────────────────────────────────────────

const testAlreadyReferred = createDevvitTest()

testAlreadyReferred('returns { awarded: false, reason: "already_referred" } on duplicate attempt', async () => {
    // First attempt succeeds
    await checkAndAwardReferral('post1', 'player1', 'creator1')
    // Second attempt is a duplicate
    const result = await checkAndAwardReferral('post1', 'player1', 'creator1')
    expect(result).toEqual({ awarded: false, reason: 'already_referred' })
})

// ─── cap_reached guard ────────────────────────────────────────────────────────

const testCapReached = createDevvitTest()

testCapReached('returns { awarded: false, reason: "cap_reached" } when totalReferrals >= 10', async () => {
    await redis.hSet('user:creator1:economy', { totalReferrals: String(REFERRAL_CAP_PER_POST) })
    const result = await checkAndAwardReferral('post1', 'player1', 'creator1')
    expect(result).toEqual({ awarded: false, reason: 'cap_reached' })
})

// ─── Property 15: Referral Cap Enforcement ────────────────────────────────────

/**
 * Property 15: Referral Cap Enforcement
 * Simulate 11 referral attempts on a single post — only first 10 succeed.
 * Validates: Requirements 8.4, 8.5
 */
const testCapEnforcement = createDevvitTest()

testCapEnforcement(
    'Property 15: only first 10 of 11 referral attempts succeed (cap enforcement)',
    async () => {
        const postId = 'post_cap_test'
        const creatorId = 'creator_cap'
        const results: Array<{ awarded: boolean; reason?: string }> = []

        for (let i = 0; i < 11; i++) {
            // Each attempt is from a distinct new player
            const playerId = `new_player_${i}`
            const result = await checkAndAwardReferral(postId, playerId, creatorId)
            results.push(result)
        }

        const awarded = results.filter((r) => r.awarded)
        const capReached = results.filter((r) => !r.awarded && r.reason === 'cap_reached')

        expect(awarded).toHaveLength(REFERRAL_CAP_PER_POST)
        expect(capReached).toHaveLength(1)

        // Verify creator received exactly REFERRAL_CAP_PER_POST * REFERRAL_BONUS coins
        const coins = await redis.hGet(`user:${creatorId}:economy`, 'coins')
        expect(parseInt(coins ?? '0', 10)).toBe(REFERRAL_CAP_PER_POST * REFERRAL_BONUS)
    }
)
