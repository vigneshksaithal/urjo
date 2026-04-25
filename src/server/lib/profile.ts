import type { InvestmentScoreBreakdown, InvestmentScoreInput } from '../../shared/engagement-types'

/**
 * Calculates the investment score breakdown for a user.
 * Pure function — no side effects.
 */
export const calculateInvestmentScore = (data: InvestmentScoreInput): InvestmentScoreBreakdown => {
    const titlesScore = data.titlesOwned * 100
    const achievementsScore = data.achievementsUnlocked * 50
    const currentStreakScore = data.currentStreak * 10
    const longestStreakScore = data.longestStreak * 5
    const totalScore =
        data.totalCoinsEarned + titlesScore + achievementsScore + currentStreakScore + longestStreakScore

    return {
        totalCoinsEarned: data.totalCoinsEarned,
        titlesOwned: data.titlesOwned,
        titlesScore,
        achievementsUnlocked: data.achievementsUnlocked,
        achievementsScore,
        currentStreak: data.currentStreak,
        currentStreakScore,
        longestStreak: data.longestStreak,
        longestStreakScore,
        totalScore,
    }
}

/**
 * Calculates the rank percentile of a user score against all scores.
 * Returns the percentage of users whose score is <= userScore.
 * Bounded [0, 100], rounded to 1 decimal place.
 * Pure function — no side effects.
 */
export const calculateRankPercentile = (userScore: number, allScores: number[]): number => {
    if (allScores.length === 0) return 0

    const countAtOrBelow = allScores.filter((score) => score <= userScore).length
    const percentile = (countAtOrBelow / allScores.length) * 100

    return Math.min(100, Math.max(0, Math.round(percentile * 10) / 10))
}
