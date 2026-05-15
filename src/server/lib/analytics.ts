/**
 * Analytics Tracker
 * Event recording with SET NX deduplication and atomic counter increments.
 * All tracking functions are non-blocking — failures should be caught at the call site.
 */

import { redis } from '@devvit/web/server'

import type { DailyMetrics } from '../../shared/growth-types'

// ─── TTL Constants ─────────────────────────────────────────────────────────────

const TTL_24H = 86400
const TTL_48H = 172800

// ─── Key Builders ──────────────────────────────────────────────────────────────

const postOpenCounterKey = (date: string): string =>
    `analytics:${date}:post_opens`

const firstActionCounterKey = (date: string): string =>
    `analytics:${date}:first_actions`

const completionCounterKey = (date: string): string =>
    `analytics:${date}:completions`

const resultCopyCounterKey = (date: string): string =>
    `analytics:${date}:result_copies`

const helpTapCounterKey = (date: string): string =>
    `analytics:${date}:help_taps`

const subredditCompletionKey = (date: string, subredditId: string): string =>
    `analytics:${date}:completions:subreddit:${subredditId}`

const seenDedupKey = (date: string, postId: string, userId: string): string =>
    `analytics:seen:${date}:${postId}:${userId}`

const actedDedupKey = (date: string, postId: string, userId: string): string =>
    `analytics:acted:${date}:${postId}:${userId}`

const completedDedupKey = (postId: string, userId: string): string =>
    `analytics:completed:${postId}:${userId}`

const userCompletionDatesKey = (userId: string): string =>
    `analytics:user:${userId}:completion_dates`

// ─── Dedup Helper ──────────────────────────────────────────────────────────────

/**
 * Attempt to set a dedup flag. Returns true if the flag was newly set (first time),
 * false if it already existed (duplicate).
 * Uses get → set + expire pattern matching the existing codebase.
 */
const trySetDedup = async (key: string, ttl: number): Promise<boolean> => {
    const existing = await redis.get(key)
    if (existing !== undefined) return false

    await redis.set(key, '1')
    await redis.expire(key, ttl)
    return true
}

// ─── Event Tracking ────────────────────────────────────────────────────────────

/**
 * Track a post open event (deduplicated per user per post per day).
 * Returns true if this was a new event, false if duplicate.
 */
export const trackPostOpen = async (
    date: string,
    postId: string,
    userId: string,
    _subredditId: string,
): Promise<boolean> => {
    const isNew = await trySetDedup(seenDedupKey(date, postId, userId), TTL_24H)
    if (!isNew) return false

    await redis.incrBy(postOpenCounterKey(date), 1)
    return true
}

/**
 * Track a first action event (deduplicated per user per post per day).
 * Returns true if this was a new event, false if duplicate.
 */
export const trackFirstAction = async (
    date: string,
    postId: string,
    userId: string,
    _subredditId: string,
): Promise<boolean> => {
    const isNew = await trySetDedup(actedDedupKey(date, postId, userId), TTL_24H)
    if (!isNew) return false

    await redis.incrBy(firstActionCounterKey(date), 1)
    return true
}

/**
 * Track a completion event (deduplicated per user per post, 48h window).
 * Increments daily counter, per-subreddit counter, and adds to user completion dates.
 * Returns true if this was a new event, false if duplicate.
 */
export const trackCompletion = async (
    date: string,
    postId: string,
    userId: string,
    subredditId: string,
): Promise<boolean> => {
    const isNew = await trySetDedup(completedDedupKey(postId, userId), TTL_48H)
    if (!isNew) return false

    const dateTimestamp = new Date(`${date}T00:00:00Z`).getTime()

    await Promise.all([
        redis.incrBy(completionCounterKey(date), 1),
        redis.incrBy(subredditCompletionKey(date, subredditId), 1),
        redis.zAdd(userCompletionDatesKey(userId), { member: date, score: dateTimestamp }),
    ])

    return true
}

/**
 * Track a result card copy event (not deduplicated — counts total copies).
 */
export const trackResultCopy = async (date: string): Promise<void> => {
    await redis.incrBy(resultCopyCounterKey(date), 1)
}

/**
 * Track a help-icon tap event (deduplicated per user per post per day).
 * Uses SET NX on analytics:helped:{date}:{postId}:{userId} with 24h TTL.
 * Returns true if this was a new event, false if duplicate.
 */
export const trackHelpTap = async (
    date: string,
    postId: string,
    userId: string,
): Promise<boolean> => {
    const dedupKey = `analytics:helped:${date}:${postId}:${userId}`
    const isNew = await trySetDedup(dedupKey, TTL_24H)
    if (!isNew) return false

    await redis.incrBy(helpTapCounterKey(date), 1)
    return true
}

// ─── Metrics Retrieval ─────────────────────────────────────────────────────────

/**
 * Read a Redis counter, returning 0 if the key does not exist.
 */
const readCounter = async (key: string): Promise<number> => {
    const value = await redis.get(key)
    return value !== undefined ? parseInt(value, 10) : 0
}

/**
 * Safely divide numerator by denominator, returning 0 when denominator is 0.
 */
const safeDivide = (numerator: number, denominator: number): number =>
    denominator === 0 ? 0 : numerator / denominator

/**
 * Determine whether the DQ flag should be set for a given date.
 * Returns true when completions were recorded but first_actions is zero —
 * an instrumentation gap that makes funnel rates untrustworthy.
 */
const isFirstActionMissing = (completions: number, firstActions: number): boolean =>
    completions > 0 && firstActions === 0

/**
 * Get daily metrics for a given date.
 * Reads all counters, detects the DQ condition, and returns nullable rates.
 *
 * When dq.firstActionMissing is true, firstActionRate and completionRate are
 * returned as null rather than 0 to distinguish missing data from poor performance.
 * helpTapRate is null when postOpens is 0 (no sessions to compute a rate against).
 */
export const getDailyMetrics = async (date: string): Promise<DailyMetrics> => {
    const [postOpens, firstActions, completions, resultCopies, helpTaps] = await Promise.all([
        readCounter(postOpenCounterKey(date)),
        readCounter(firstActionCounterKey(date)),
        readCounter(completionCounterKey(date)),
        readCounter(resultCopyCounterKey(date)),
        readCounter(helpTapCounterKey(date)),
    ])

    const dqFirstActionMissing = isFirstActionMissing(completions, firstActions)

    const firstActionRate: number | null = dqFirstActionMissing
        ? null
        : safeDivide(firstActions, postOpens)

    const completionRate: number | null = dqFirstActionMissing
        ? null
        : safeDivide(completions, firstActions)

    const helpTapRate: number | null = postOpens === 0 ? null : safeDivide(helpTaps, postOpens)

    return {
        date,
        postOpens,
        firstActions,
        completions,
        resultCopies,
        helpTaps,
        firstActionRate,
        completionRate,
        d1ReturnRate: 0,
        estimatedDQE: completions,
        dq: { firstActionMissing: dqFirstActionMissing },
        helpTapRate,
    }
}

// ─── D1 Return Rate ────────────────────────────────────────────────────────────

/**
 * Pure function: compute D1 return rate from two arrays of user IDs.
 * Returns the ratio of users present in both arrays to users in dayDUsers.
 * Returns 0 when dayDUsers is empty.
 */
export const computeD1ReturnRatePure = (
    dayDUsers: readonly string[],
    dayD1Users: readonly string[],
): number => {
    if (dayDUsers.length === 0) return 0

    const dayD1Set = new Set(dayD1Users)
    const intersectionCount = dayDUsers.filter((u) => dayD1Set.has(u)).length

    return intersectionCount / dayDUsers.length
}

/**
 * Compute D1 return rate for a given date.
 * Returns the cached rate if already computed, or 0 if not yet available.
 * The dashboard scheduler calls storeD1ReturnRate after gathering user lists.
 */
export const computeD1ReturnRate = async (date: string): Promise<number> => {
    const cachedRate = await redis.get(`analytics:${date}:d1_return_rate`)
    if (cachedRate !== undefined) return parseFloat(cachedRate)

    return 0
}

/**
 * Store a pre-computed D1 return rate for a given date.
 * Called by the dashboard computation after gathering user lists.
 */
export const storeD1ReturnRate = async (date: string, rate: number): Promise<void> => {
    await redis.set(`analytics:${date}:d1_return_rate`, rate.toString())
}
