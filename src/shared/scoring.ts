/**
 * Shared continuous-input scoring formulas.
 *
 * The 12 discrete difficulty buckets are hand-authored in the Unified_Ladder
 * (`PER_GRID_LADDER` in `constants.ts`). The genuinely continuous inputs —
 * solve time and daily solve count — use the thin pure formulas below, shared
 * by both the coin and season scoring systems so they stay consistent.
 */

/** Maximum coin speed bonus, scaled by Speed_Factor before the tier multiplier. */
export const MAX_SPEED_COIN_BONUS = 8

/** Per-solve linear decay step applied to repeated season-counted solves in a day. */
export const DAILY_DECAY_STEP = 0.1

/** Lower bound for Daily_Decay — repeated solves always award a positive floor. */
export const DAILY_DECAY_FLOOR = 0.4

/**
 * Continuous speed measure in [0, 1].
 * 0 when `timeTaken >= parTime`; approaches 1 as `timeTaken` -> 0.
 * Guards `parTime <= 0` and non-finite/negative inputs by returning 0.
 */
export const speedFactor = (timeTaken: number, parTime: number): number => {
    if (!Number.isFinite(parTime) || parTime <= 0) return 0
    if (!Number.isFinite(timeTaken) || timeTaken < 0) return 0
    const factor = (parTime - timeTaken) / parTime
    return Math.min(1, Math.max(0, factor))
}

/**
 * Daily diminishing-returns factor for the n-th season-counted solve.
 * `dailyDecay(n) = max(FLOOR, 1 - STEP * (n - 1))`, clamped to <= 1.0.
 * Non-finite or `n < 1` inputs are treated as the first solve (full value).
 */
export const dailyDecay = (dailySolveIndex: number): number => {
    const index = Number.isFinite(dailySolveIndex) && dailySolveIndex >= 1 ? dailySolveIndex : 1
    const decayed = 1 - DAILY_DECAY_STEP * (index - 1)
    return Math.min(1, Math.max(DAILY_DECAY_FLOOR, decayed))
}
