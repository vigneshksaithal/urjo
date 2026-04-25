import { describe, it, expect } from 'vitest'
import { calculateInvestmentScore, calculateRankPercentile } from '../profile'

// ─── calculateInvestmentScore ─────────────────────────────────────────────────

describe('calculateInvestmentScore', () => {
    it('returns totalScore of 0 when all inputs are zero', () => {
        const result = calculateInvestmentScore({
            totalCoinsEarned: 0,
            titlesOwned: 0,
            achievementsUnlocked: 0,
            currentStreak: 0,
            longestStreak: 0,
        })
        expect(result.totalScore).toBe(0)
    })

    it('returns correct totalScore for known inputs', () => {
        // totalCoinsEarned=100, titlesOwned=2 (200), achievementsUnlocked=3 (150),
        // currentStreak=4 (40), longestStreak=5 (25) → total = 100+200+150+40+25 = 515
        const result = calculateInvestmentScore({
            totalCoinsEarned: 100,
            titlesOwned: 2,
            achievementsUnlocked: 3,
            currentStreak: 4,
            longestStreak: 5,
        })
        expect(result.totalScore).toBe(515)
    })

    it('titlesScore equals titlesOwned * 100', () => {
        const result = calculateInvestmentScore({
            totalCoinsEarned: 0,
            titlesOwned: 7,
            achievementsUnlocked: 0,
            currentStreak: 0,
            longestStreak: 0,
        })
        expect(result.titlesScore).toBe(700)
    })

    it('achievementsScore equals achievementsUnlocked * 50', () => {
        const result = calculateInvestmentScore({
            totalCoinsEarned: 0,
            titlesOwned: 0,
            achievementsUnlocked: 6,
            currentStreak: 0,
            longestStreak: 0,
        })
        expect(result.achievementsScore).toBe(300)
    })

    it('currentStreakScore equals currentStreak * 10', () => {
        const result = calculateInvestmentScore({
            totalCoinsEarned: 0,
            titlesOwned: 0,
            achievementsUnlocked: 0,
            currentStreak: 9,
            longestStreak: 0,
        })
        expect(result.currentStreakScore).toBe(90)
    })

    it('longestStreakScore equals longestStreak * 5', () => {
        const result = calculateInvestmentScore({
            totalCoinsEarned: 0,
            titlesOwned: 0,
            achievementsUnlocked: 0,
            currentStreak: 0,
            longestStreak: 8,
        })
        expect(result.longestStreakScore).toBe(40)
    })

    it('passes through input values to breakdown fields', () => {
        const input = {
            totalCoinsEarned: 500,
            titlesOwned: 3,
            achievementsUnlocked: 4,
            currentStreak: 10,
            longestStreak: 20,
        }
        const result = calculateInvestmentScore(input)
        expect(result.totalCoinsEarned).toBe(500)
        expect(result.titlesOwned).toBe(3)
        expect(result.achievementsUnlocked).toBe(4)
        expect(result.currentStreak).toBe(10)
        expect(result.longestStreak).toBe(20)
    })
})

// ─── calculateRankPercentile ──────────────────────────────────────────────────

describe('calculateRankPercentile', () => {
    it('returns 0 when allScores is empty', () => {
        expect(calculateRankPercentile(100, [])).toBe(0)
    })

    it('returns 100 when user has the highest score', () => {
        expect(calculateRankPercentile(200, [50, 100, 150, 200])).toBe(100)
    })

    it('returns 50 when user is at the median', () => {
        // 2 out of 4 scores are <= 50: [10, 50] → 50%
        expect(calculateRankPercentile(50, [10, 50, 100, 200])).toBe(50)
    })

    it('is bounded at 0 when user score is below all scores', () => {
        const result = calculateRankPercentile(0, [10, 20, 30])
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThanOrEqual(100)
    })

    it('is bounded at 100 when user score is above all scores', () => {
        const result = calculateRankPercentile(999, [10, 20, 30])
        expect(result).toBe(100)
        expect(result).toBeLessThanOrEqual(100)
    })

    it('higher score yields >= percentile than lower score', () => {
        const scores = [10, 20, 30, 40, 50]
        const lower = calculateRankPercentile(20, scores)
        const higher = calculateRankPercentile(40, scores)
        expect(higher).toBeGreaterThanOrEqual(lower)
    })
})
