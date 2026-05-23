/**
 * Session-run multiplier: the heart of the "endless mode" loop.
 *
 * Every consecutive puzzle solved within a single session bumps the multiplier
 * up. We cap it at 2.0× so the economy stays sane, and we cap the input
 * sessionRun to a safe ceiling.
 *
 * Curve (rounded display values):
 *   1   → 1.00×  (no bonus on the first puzzle — it's the daily)
 *   2   → 1.10×
 *   3   → 1.20×
 *   5   → 1.40×
 *   10  → 1.70×
 *   20+ → 2.00× (cap)
 */

const SESSION_RUN_INPUT_MAX = 50

/** Maximum coin multiplier the run-again loop can ever apply. */
export const SESSION_RUN_MULTIPLIER_CAP = 2.0

/** Multiplier ceiling at which the player has "maxed" the run bonus. */
export const SESSION_RUN_FULL_BONUS_AT = 20

/**
 * Map a session run count to its coin multiplier.
 * Pure function; no side effects.
 */
export const getSessionRunMultiplier = (sessionRun: number): number => {
    if (!Number.isFinite(sessionRun)) return 1
    const clamped = Math.max(0, Math.min(sessionRun, SESSION_RUN_INPUT_MAX))

    // Run #1 is the entry puzzle — no bonus yet
    if (clamped <= 1) return 1

    // Linear ramp from 1 -> 2.0 over [1 .. SESSION_RUN_FULL_BONUS_AT]
    const progress = Math.min(1, (clamped - 1) / (SESSION_RUN_FULL_BONUS_AT - 1))
    const mul = 1 + progress * (SESSION_RUN_MULTIPLIER_CAP - 1)
    // Snap to two decimals so the displayed value is stable
    return Math.round(mul * 100) / 100
}

/**
 * Compute extra coins from the session-run multiplier given the base reward
 * already paid. Server uses this to top up the player's wallet without
 * mutating the existing CoinReward fields.
 *
 *   bonusCoins = round(baseReward * (multiplier - 1))
 */
export const getSessionRunBonusCoins = (
    baseReward: number,
    sessionRun: number,
): number => {
    const mul = getSessionRunMultiplier(sessionRun)
    if (mul <= 1) return 0
    return Math.max(0, Math.round(baseReward * (mul - 1)))
}
