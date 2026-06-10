/**
 * Streak Reward Curve
 *
 * The old reward model was linear (COIN_STREAK_MULTIPLIER × streak), which
 * meant Day 1 paid +2 and Day 30 paid +60 — a flat slope with no inflection
 * points the player can look forward to. CoC, Snapchat, and Duolingo all
 * front-load punishment-resistant rewards and back-load big jackpots.
 *
 * The new curve has visible "milestone bumps" where the daily bonus jumps:
 *   Day 1     → +2   (intro)
 *   Day 2     → +4
 *   Day 3     → +8   (first reward bump — celebrates "I came back twice")
 *   Day 4-6   → +10
 *   Day 7     → +20  (week milestone bump)
 *   Day 8-13  → +20
 *   Day 14    → +35  (fortnight bump)
 *   Day 30    → +60  (monthly bump)
 *   Day 60+   → +80
 *   Day 100+  → +120
 *   Day 365+  → +200 (cap)
 *
 * In addition, every 7 consecutive days the player receives one free
 * Streak Freeze (capped at MAX_STREAK_FREEZES). The grant is server-side,
 * idempotent per ISO week, awarded by updateStreak.
 */

export type StreakReward = {
    /** Daily coin bonus the player will earn on this streak day */
    coinBonus: number
    /** Streak day number (1-based) */
    day: number
    /** True if this day is a milestone (where the bonus jumps) */
    isMilestone: boolean
    /** Short label for the next-tier preview UI */
    label: string
}

/** Stepped reward curve — explicit table, easy to tune. */
const STREAK_TIERS: ReadonlyArray<{ minDay: number; bonus: number; label: string }> = [
    { minDay: 1, bonus: 2, label: 'Day 1' },
    { minDay: 2, bonus: 4, label: 'Day 2' },
    { minDay: 3, bonus: 8, label: 'Day 3 bump' },
    { minDay: 4, bonus: 10, label: 'Day 4' },
    { minDay: 7, bonus: 20, label: 'Week 1!' },
    { minDay: 14, bonus: 35, label: 'Fortnight!' },
    { minDay: 30, bonus: 60, label: 'Monthly!' },
    { minDay: 60, bonus: 80, label: 'Two months' },
    { minDay: 100, bonus: 120, label: '💯 Century!' },
    { minDay: 365, bonus: 200, label: 'Year-long flame' },
] as const

/**
 * Get the daily streak bonus for a given streak day (clamped to >= 1).
 * Pure function.
 */
export const getStreakBonusForDay = (day: number): number => {
    if (!Number.isFinite(day) || day < 1) return 0
    let last = 0
    for (const tier of STREAK_TIERS) {
        if (day >= tier.minDay) {
            last = tier.bonus
        } else {
            break
        }
    }
    return last
}

/**
 * Build the next-streak forecast — useful for the result-screen "🔥 Return
 * tomorrow → Day N · +X bonus" hook. Also flags whether tomorrow is a
 * milestone bump so the UI can highlight it more prominently.
 */
export const forecastNextStreak = (currentStreak: number): StreakReward => {
    const nextDay = Math.max(1, currentStreak + 1)
    const nextBonus = getStreakBonusForDay(nextDay)
    const todayBonus = getStreakBonusForDay(currentStreak)
    const isMilestone = nextBonus > todayBonus
    const tier = STREAK_TIERS.find((t) => t.minDay === nextDay)
    return {
        day: nextDay,
        coinBonus: nextBonus,
        isMilestone,
        label: tier?.label ?? `Day ${nextDay}`,
    }
}

/**
 * Free Streak Freeze grant cadence (in days). Every N consecutive streak
 * days the player gets one free freeze (capped externally).
 */
export const FREE_STREAK_FREEZE_CADENCE_DAYS = 7
