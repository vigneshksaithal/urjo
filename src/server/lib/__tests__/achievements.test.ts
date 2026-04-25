/**
 * Tests for pure achievement logic and Redis persistence.
 * Pure function tests use plain vitest; Redis tests use createDevvitTest.
 */

import { describe, it, expect, vi } from 'vitest'
import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { reddit } from '@devvit/reddit'
import {
    checkAchievements,
    getFlairTier,
    formatFlair,
    checkStreakMilestone,
    getUnlockedAchievements,
    unlockAchievements,
} from '../achievements'
import type { UserStats, AchievementUnlock } from '../../../shared/engagement-types'
import { ACHIEVEMENT_DEFS, FLAIR_TIER_DEFS } from '../../../shared/engagement-constants'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeStats = (overrides: Partial<UserStats> = {}): UserStats => ({
    totalSolves: 0,
    currentStreak: 0,
    longestStreak: 0,
    speedSolves: 0,
    totalCoinsEarned: 0,
    maxGridLevel: 0,
    allGridsMaxed: false,
    sharesCount: 0,
    challengesCreated: 0,
    challengeBeats: 0,
    ...overrides,
})

// ─── checkAchievements ────────────────────────────────────────────────────────

describe('checkAchievements', () => {
    it('returns empty array when no thresholds met', () => {
        const result = checkAchievements(makeStats(), [])
        expect(result).toEqual([])
    })

    it('returns achievement when threshold is met', () => {
        const result = checkAchievements(makeStats({ totalSolves: 10 }), [])
        const ids = result.map((a) => a.id)
        expect(ids).toContain('solve_10')
    })

    it('never returns already-unlocked achievements', () => {
        const result = checkAchievements(makeStats({ totalSolves: 10 }), ['solve_10'])
        const ids = result.map((a) => a.id)
        expect(ids).not.toContain('solve_10')
    })

    it('returns multiple achievements when multiple thresholds met', () => {
        const result = checkAchievements(makeStats({ totalSolves: 50 }), [])
        const ids = result.map((a) => a.id)
        expect(ids).toContain('solve_10')
        expect(ids).toContain('solve_50')
    })

    it('handles all categories correctly', () => {
        const stats = makeStats({
            totalSolves: 10,
            currentStreak: 7,
            longestStreak: 7,
            speedSolves: 10,
            totalCoinsEarned: 1000,
            maxGridLevel: 4,
            allGridsMaxed: true,
            sharesCount: 5,
            challengesCreated: 5,
            challengeBeats: 10,
        })
        const result = checkAchievements(stats, [])
        const ids = result.map((a) => a.id)

        expect(ids).toContain('solve_10')
        expect(ids).toContain('streak_7')
        expect(ids).toContain('speed_10')
        expect(ids).toContain('economy_1000')
        expect(ids).toContain('mastery_any_grid')
        expect(ids).toContain('mastery_all_grids')
        expect(ids).toContain('social_shares_5')
        expect(ids).toContain('social_challenges_5')
        expect(ids).toContain('social_beats_10')
    })
})

// ─── getFlairTier ─────────────────────────────────────────────────────────────

describe('getFlairTier', () => {
    it('returns bronze for count 1', () => {
        expect(getFlairTier(1).tier).toBe('bronze')
    })

    it('returns bronze for count 3', () => {
        expect(getFlairTier(3).tier).toBe('bronze')
    })

    it('returns silver for count 4', () => {
        expect(getFlairTier(4).tier).toBe('silver')
    })

    it('returns silver for count 7', () => {
        expect(getFlairTier(7).tier).toBe('silver')
    })

    it('returns gold for count 8', () => {
        expect(getFlairTier(8).tier).toBe('gold')
    })

    it('returns gold for count 12', () => {
        expect(getFlairTier(12).tier).toBe('gold')
    })

    it('returns diamond for count 13', () => {
        expect(getFlairTier(13).tier).toBe('diamond')
    })

    it('returns diamond for count 17', () => {
        expect(getFlairTier(17).tier).toBe('diamond')
    })

    it('returns master for count 18', () => {
        expect(getFlairTier(18).tier).toBe('master')
    })

    it('returns master for count 100', () => {
        expect(getFlairTier(100).tier).toBe('master')
    })

    it('returns bronze for count 0 (below bronze, default to bronze)', () => {
        expect(getFlairTier(0).tier).toBe('bronze')
    })
})

// ─── formatFlair ──────────────────────────────────────────────────────────────

describe('formatFlair', () => {
    it('returns correctly formatted string', () => {
        const tier = FLAIR_TIER_DEFS.find((t) => t.tier === 'gold')!
        const result = formatFlair(tier, '⚡', 'Speed Demon')
        expect(result).toBe('🥇 ⚡ Speed Demon')
    })

    it('formats with bronze tier', () => {
        const tier = FLAIR_TIER_DEFS.find((t) => t.tier === 'bronze')!
        const result = formatFlair(tier, '🧩', 'Puzzler')
        expect(result).toBe('🥉 🧩 Puzzler')
    })
})

// ─── checkStreakMilestone ─────────────────────────────────────────────────────

describe('checkStreakMilestone', () => {
    it('returns null when streak is below all thresholds', () => {
        const result = checkStreakMilestone(5, [])
        expect(result).toBeNull()
    })

    it('returns correct milestone at threshold 7', () => {
        const result = checkStreakMilestone(7, [])
        expect(result).not.toBeNull()
        expect(result?.threshold).toBe(7)
        expect(result?.bonus).toBe(50)
    })

    it('returns null when milestone already unlocked', () => {
        const result = checkStreakMilestone(7, ['streak_7'])
        expect(result).toBeNull()
    })

    it('returns highest qualifying milestone when multiple qualify', () => {
        // streak of 30 qualifies for both 7 and 30
        const result = checkStreakMilestone(30, [])
        expect(result?.threshold).toBe(30)
        expect(result?.bonus).toBe(200)
    })

    it('returns next highest when lower milestones already unlocked', () => {
        // streak of 30, already have streak_7 — should return 30
        const result = checkStreakMilestone(30, ['streak_7'])
        expect(result?.threshold).toBe(30)
    })

    it('returns null when all qualifying milestones are unlocked', () => {
        const result = checkStreakMilestone(30, ['streak_7', 'streak_30'])
        expect(result).toBeNull()
    })

    it('returns milestone at threshold 100', () => {
        const result = checkStreakMilestone(100, ['streak_7', 'streak_30'])
        expect(result?.threshold).toBe(100)
        expect(result?.bonus).toBe(500)
    })

    it('returns milestone at threshold 365', () => {
        const result = checkStreakMilestone(365, ['streak_7', 'streak_30', 'streak_100'])
        expect(result?.threshold).toBe(365)
        expect(result?.bonus).toBe(1000)
    })
})

// ─── getUnlockedAchievements — Redis persistence ───────────────────────────────

describe('getUnlockedAchievements — persistence', () => {
    const testEmpty = createDevvitTest({ userId: 't2_testuser' })

    testEmpty('returns empty array when no achievements stored', async () => {
        const result = await getUnlockedAchievements('t2_testuser')
        expect(result).toEqual([])
    })

    const testStored = createDevvitTest({ userId: 't2_testuser' })

    testStored('returns stored achievements', async () => {
        const stored: AchievementUnlock[] = [
            { id: 'solve_10', unlockedAt: 1700000000000 },
            { id: 'streak_7', unlockedAt: 1700000001000 },
        ]
        await redis.set('user:t2_testuser:achievements', JSON.stringify(stored))

        const result = await getUnlockedAchievements('t2_testuser')
        expect(result).toEqual(stored)
    })
})

// ─── unlockAchievements — Redis persistence ────────────────────────────────────

describe('unlockAchievements — persistence', () => {
    const testPersist = createDevvitTest({ userId: 't2_testuser' })

    testPersist('persists new achievements to Redis', async () => {
        const newAchievements = ACHIEVEMENT_DEFS.filter((a) => a.id === 'solve_10')
        await unlockAchievements('t2_testuser', newAchievements as typeof ACHIEVEMENT_DEFS[number][])

        const raw = await redis.get('user:t2_testuser:achievements')
        expect(raw).toBeDefined()
        const parsed = JSON.parse(raw!) as AchievementUnlock[]
        expect(parsed).toHaveLength(1)
        expect(parsed[0]?.id).toBe('solve_10')
        expect(typeof parsed[0]?.unlockedAt).toBe('number')
    })

    const testCoins = createDevvitTest({ userId: 't2_testuser' })

    testCoins('awards coin bonuses for new achievements', async () => {
        const achievement = ACHIEVEMENT_DEFS.find((a) => a.id === 'solve_10')!
        await unlockAchievements('t2_testuser', [achievement])

        const coins = await redis.hGet('user:t2_testuser:economy', 'coins')
        const totalCoins = await redis.hGet('user:t2_testuser:economy', 'totalCoins')

        expect(parseInt(coins ?? '0', 10)).toBe(achievement.coinBonus)
        expect(parseInt(totalCoins ?? '0', 10)).toBe(achievement.coinBonus)
    })

    const testFlairTier = createDevvitTest({ userId: 't2_testuser' })

    testFlairTier('updates flair tier in Redis', async () => {
        // Unlock 4 achievements to reach silver tier
        const achievements = ACHIEVEMENT_DEFS.slice(0, 4)
        await unlockAchievements('t2_testuser', achievements as typeof ACHIEVEMENT_DEFS[number][])

        const tier = await redis.get('user:t2_testuser:flairTier')
        expect(tier).toBe('silver')
    })

    const testFlairOptIn = createDevvitTest({ userId: 't2_testuser', subredditName: 'testsub' })

    testFlairOptIn('updates Reddit flair for opted-in users', async () => {
        const spy = vi.spyOn(reddit, 'setUserFlair').mockResolvedValue(undefined as never)

        // Set up opt-in and equipped title
        await redis.set('user:t2_testuser:flairOptIn', 'true')
        await redis.hSet('user:t2_testuser:economy', { equippedTitle: 'puzzler' })

        const achievement = ACHIEVEMENT_DEFS.find((a) => a.id === 'solve_10')!
        await unlockAchievements('t2_testuser', [achievement])

        expect(spy).toHaveBeenCalledOnce()
        vi.restoreAllMocks()
    })

    const testFlairOptOut = createDevvitTest({ userId: 't2_testuser', subredditName: 'testsub' })

    testFlairOptOut('does NOT update Reddit flair for users not opted in', async () => {
        const spy = vi.spyOn(reddit, 'setUserFlair').mockResolvedValue(undefined as never)

        // No opt-in set
        const achievement = ACHIEVEMENT_DEFS.find((a) => a.id === 'solve_10')!
        await unlockAchievements('t2_testuser', [achievement])

        expect(spy).not.toHaveBeenCalled()
        vi.restoreAllMocks()
    })

    const testEmpty = createDevvitTest({ userId: 't2_testuser' })

    testEmpty('does nothing when newAchievements is empty', async () => {
        const spy = vi.spyOn(reddit, 'setUserFlair').mockResolvedValue(undefined as never)

        await unlockAchievements('t2_testuser', [])

        const raw = await redis.get('user:t2_testuser:achievements')
        expect(raw).toBeUndefined()
        expect(spy).not.toHaveBeenCalled()
        vi.restoreAllMocks()
    })
})
