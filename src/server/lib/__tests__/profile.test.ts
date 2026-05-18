import { describe, it, expect } from 'vitest'
import { calculateInvestmentScore, calculateRankPercentile } from '../profile'

describe('calculateInvestmentScore', () => {
    it('calculates total score correctly based on all inputs', () => {
        const result = calculateInvestmentScore({
            totalCoinsEarned: 100,
            titlesOwned: 2,
            achievementsUnlocked: 3,
            currentStreak: 4,
            longestStreak: 5,
        })
        expect(result.totalScore).toBe(515) // 100 + 200 + 150 + 40 + 25
    })
})

describe('calculateRankPercentile', () => {
    it('returns median percentile for median score', () => {
        expect(calculateRankPercentile(50, [10, 50, 100, 200])).toBe(50)
    })
    it('bounds percentile between 0 and 100', () => {
        expect(calculateRankPercentile(0, [10, 20])).toBe(0)
        expect(calculateRankPercentile(999, [10, 20])).toBe(100)
    })
})
