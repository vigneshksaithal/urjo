/**
 * Weekend Event — rotating "double-down" hook.
 *
 * Active Saturday and Sunday UTC. Provides a flat coin multiplier on every
 * solve, plus an end-of-event countdown that creates the FOMO clock the game
 * has previously been missing (CoC builder timers, Subway Surfers daily
 * challenge timers — both run their own "ends in" string at all times).
 *
 * Pure functions only — server reads the multiplier when awarding coins, and
 * /api/game/state surfaces the active event payload to the client for the
 * persistent banner + countdown.
 */

export type WeekendEvent = {
    /** Whether a weekend event is currently active */
    active: boolean
    /** Coin multiplier to apply to bonus coins (1.0 means no event) */
    multiplier: number
    /** Display name shown in the banner */
    name: string
    /** Short emoji marker */
    emoji: string
    /** ISO timestamp (ms) when the event ends. Null when inactive. */
    endsAtMs: number | null
    /** Pre-computed remaining time bucket — useful when the client only wants
     *  a coarse "ends in 18h" value without re-running the date math. */
    hoursLeft: number | null
}

const MS_PER_HOUR = 3600_000

/** Coin multiplier applied during the weekend event. */
export const WEEKEND_EVENT_MULTIPLIER = 1.5

/**
 * Compute the active weekend event for a given Date.
 *
 * Pure: no side effects, no I/O. Saturday (getUTCDay() === 6) and Sunday (0)
 * count as weekend; the event ends at Monday 00:00 UTC.
 */
export const getActiveWeekendEvent = (now: Date = new Date()): WeekendEvent => {
    const dow = now.getUTCDay() // 0 = Sun, 6 = Sat

    if (dow !== 0 && dow !== 6) {
        return {
            active: false,
            multiplier: 1.0,
            name: 'Weekend Boost',
            emoji: '🎉',
            endsAtMs: null,
            hoursLeft: null,
        }
    }

    // Compute end-of-event = next Monday 00:00 UTC
    const daysUntilMonday = dow === 6 ? 2 : 1 // Sat->Mon=2, Sun->Mon=1
    const endsAt = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + daysUntilMonday,
        0, 0, 0, 0,
    ))

    const hoursLeft = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / MS_PER_HOUR))

    return {
        active: true,
        multiplier: WEEKEND_EVENT_MULTIPLIER,
        name: 'Weekend Boost',
        emoji: '🎉',
        endsAtMs: endsAt.getTime(),
        hoursLeft,
    }
}

/**
 * Compute coin top-up from a weekend event multiplier given the base reward.
 * Returns 0 if the event is inactive or the multiplier is <= 1.
 */
export const getWeekendEventBonusCoins = (
    baseReward: number,
    event: Pick<WeekendEvent, 'active' | 'multiplier'>,
): number => {
    if (!event.active || event.multiplier <= 1) return 0
    return Math.max(0, Math.round(baseReward * (event.multiplier - 1)))
}
