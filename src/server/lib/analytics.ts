/**
 * Analytics Tracker
 * Event recording with SET NX deduplication and atomic counter increments.
 * All tracking functions are non-blocking — failures should be caught at the call site.
 */

import { redis } from '@devvit/web/server'

import type { DailyMetrics, GrowthLoopMetrics } from '../../shared/growth-types'
import { readViralMetricsForDate } from './viral-tracker'

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

const resultCommentCounterKey = (date: string): string =>
    `analytics:${date}:result_comments`

const challengePostCounterKey = (date: string): string =>
    `analytics:${date}:challenge_posts`

const challengeOpenCounterKey = (date: string): string =>
    `analytics:${date}:challenge_opens`

const challengeCompletionCounterKey = (date: string): string =>
    `analytics:${date}:challenge_completions`

const newPlayerChallengeCompletionCounterKey = (date: string): string =>
    `analytics:${date}:new_player_challenge_completions`

const notifyOptInCounterKey = (date: string): string =>
    `analytics:${date}:notify_opt_ins`

const subscribeTapCounterKey = (date: string): string =>
    `analytics:${date}:subscribe_taps`

const subredditCompletionKey = (date: string, subredditId: string): string =>
    `analytics:${date}:completions:subreddit:${subredditId}`

const dailyActiveEngagersKey = (date: string): string =>
    `analytics:${date}:daily_active_engagers`

const completionUsersKey = (date: string): string =>
    `analytics:${date}:completion_users`

const challengeNewCompletionUsersKey = (date: string): string =>
    `analytics:${date}:challenge_new_completion_users`

const challengePostCreatorsKey = (date: string): string =>
    `analytics:${date}:challenge_post_creators`

const challengePostIdsKey = (date: string): string =>
    `analytics:${date}:challenge_post_ids`

const seenDedupKey = (date: string, postId: string, userId: string): string =>
    `analytics:seen:${date}:${postId}:${userId}`

const actedDedupKey = (date: string, postId: string, userId: string): string =>
    `analytics:acted:${date}:${postId}:${userId}`

const completedDedupKey = (postId: string, userId: string): string =>
    `analytics:completed:${postId}:${userId}`

const challengeOpenedDedupKey = (date: string, postId: string, userId: string): string =>
    `analytics:challenge_opened:${date}:${postId}:${userId}`

const challengeCompletedDedupKey = (postId: string, userId: string): string =>
    `analytics:challenge_completed:${postId}:${userId}`

const userCompletionDatesKey = (userId: string): string =>
    `analytics:user:${userId}:completion_dates`

const raceJoinsCounterKey = (date: string): string =>
    `analytics:${date}:race:joins`

const raceMatchesCounterKey = (date: string): string =>
    `analytics:${date}:race:matches`

const raceCompletionsCounterKey = (date: string): string =>
    `analytics:${date}:race:completions`

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

const dateToTimestamp = (date: string): number =>
    new Date(`${date}T00:00:00Z`).getTime()

const addDays = (date: string, days: number): string => {
    const value = new Date(`${date}T00:00:00Z`)
    value.setUTCDate(value.getUTCDate() + days)
    const iso = value.toISOString().split('T')[0]
    if (iso === undefined) throw new Error(`Failed to format date from ${date} + ${days} days`)
    return iso
}

const trackDailyActiveEngager = async (date: string, userId: string): Promise<void> => {
    await redis.zAdd(dailyActiveEngagersKey(date), {
        member: userId,
        score: Date.now(),
    })
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

    await Promise.all([
        redis.incrBy(firstActionCounterKey(date), 1),
        trackDailyActiveEngager(date, userId),
    ])
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

    const dateTimestamp = dateToTimestamp(date)

    await Promise.all([
        redis.incrBy(completionCounterKey(date), 1),
        redis.incrBy(subredditCompletionKey(date, subredditId), 1),
        redis.zAdd(completionUsersKey(date), { member: userId, score: dateTimestamp }),
        redis.zAdd(userCompletionDatesKey(userId), { member: date, score: dateTimestamp }),
        trackDailyActiveEngager(date, userId),
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
 * Track an explicit Reddit result comment. This is a stronger engagement signal
 * than copying/rendering the result card because it creates public post activity.
 */
export const trackResultComment = async (date: string, userId: string): Promise<void> => {
    await Promise.all([
        redis.incrBy(resultCommentCounterKey(date), 1),
        trackDailyActiveEngager(date, userId),
    ])
}

/**
 * Track an explicitly created Rival Challenge post.
 */
export const trackChallengePostCreated = async (
    date: string,
    creatorId: string,
    postId: string,
): Promise<void> => {
    await Promise.all([
        redis.incrBy(challengePostCounterKey(date), 1),
        redis.zAdd(challengePostCreatorsKey(date), {
            member: creatorId,
            score: Date.now(),
        }),
        redis.zAdd(challengePostIdsKey(date), {
            member: postId,
            score: Date.now(),
        }),
        trackDailyActiveEngager(date, creatorId),
    ])
}

/**
 * Track a challenge post open, deduplicated per user/post/day.
 */
export const trackChallengeOpen = async (
    date: string,
    postId: string,
    userId: string,
): Promise<boolean> => {
    const isNew = await trySetDedup(challengeOpenedDedupKey(date, postId, userId), TTL_24H)
    if (!isNew) return false

    await Promise.all([
        redis.incrBy(challengeOpenCounterKey(date), 1),
        trackDailyActiveEngager(date, userId),
    ])
    return true
}

/**
 * Track a challenge completion, deduplicated per user/post.
 */
export const trackChallengeCompletion = async (
    date: string,
    postId: string,
    userId: string,
    isNewPlayer: boolean,
): Promise<boolean> => {
    const isNew = await trySetDedup(challengeCompletedDedupKey(postId, userId), TTL_48H)
    if (!isNew) return false

    const writes: Promise<unknown>[] = [
        redis.incrBy(challengeCompletionCounterKey(date), 1),
        trackDailyActiveEngager(date, userId),
    ]

    if (isNewPlayer) {
        writes.push(
            redis.incrBy(newPlayerChallengeCompletionCounterKey(date), 1),
            redis.zAdd(challengeNewCompletionUsersKey(date), {
                member: userId,
                score: dateToTimestamp(date),
            }),
        )
    }

    await Promise.all(writes)
    return true
}

export const trackNotifyOptIn = async (date: string, userId: string): Promise<void> => {
    await Promise.all([
        redis.incrBy(notifyOptInCounterKey(date), 1),
        trackDailyActiveEngager(date, userId),
    ])
}

export const trackSubscribeTap = async (date: string, userId: string): Promise<void> => {
    await Promise.all([
        redis.incrBy(subscribeTapCounterKey(date), 1),
        trackDailyActiveEngager(date, userId),
    ])
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

// ─── Race Analytics ────────────────────────────────────────────────────────────

/**
 * Track a race join event (player enters the race queue).
 * Not deduplicated — counts total joins.
 */
export const trackRaceJoin = async (
    date: string,
    _postId: string,
    _userId: string,
): Promise<void> => {
    await redis.incrBy(raceJoinsCounterKey(date), 1)
}

/**
 * Track a race match event (two players matched into a session).
 * Not deduplicated — counts total matches.
 */
export const trackRaceMatch = async (
    date: string,
    _postId: string,
    _sessionId: string,
): Promise<void> => {
    await redis.incrBy(raceMatchesCounterKey(date), 1)
}

/**
 * Track a race completion event (race finishes with a winner).
 * Not deduplicated — counts total completions.
 */
export const trackRaceComplete = async (
    date: string,
    _postId: string,
    _sessionId: string,
    _winnerId: string,
): Promise<void> => {
    await redis.incrBy(raceCompletionsCounterKey(date), 1)
}

// ─── Metrics Retrieval ─────────────────────────────────────────────────────────

/**
 * Read a Redis counter, returning 0 if the key does not exist.
 */
const readCounter = async (key: string): Promise<number> => {
    const value = await redis.get(key)
    return value !== undefined ? parseInt(value, 10) : 0
}

const readSortedSetMembers = async (key: string): Promise<string[]> => {
    const entries = await redis.zRange(key, 0, -1, { by: 'rank' })
    return entries.map((entry) => entry.member)
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

export type KFactorInput = {
    completions: number
    challengePosts: number
    newPlayerChallengeCompletions: number
    challengeD1RetainedShare: number
}

export const computeKFactorPure = ({
    completions,
    challengePosts,
    newPlayerChallengeCompletions,
    challengeD1RetainedShare,
}: KFactorInput): number => {
    if (completions <= 0 || challengePosts <= 0) return 0

    const challengePostsPerCompleter = safeDivide(challengePosts, completions)
    const newCompletersPerChallenge = safeDivide(newPlayerChallengeCompletions, challengePosts)

    return challengePostsPerCompleter * newCompletersPerChallenge * challengeD1RetainedShare
}

const readGrowthMetrics = async (date: string, completions: number): Promise<GrowthLoopMetrics> => {
    const [
        dailyActiveEngagers,
        resultComments,
        challengePosts,
        challengeOpens,
        challengeCompletions,
        newPlayerChallengeCompletions,
        notifyOptIns,
        subscribeTaps,
        challengeD1RetainedShare,
        viralMetrics,
        raceJoins,
        raceMatches,
        raceCompletions,
    ] = await Promise.all([
        readSortedSetMembers(dailyActiveEngagersKey(date)).then((members) => members.length),
        readCounter(resultCommentCounterKey(date)),
        readCounter(challengePostCounterKey(date)),
        readCounter(challengeOpenCounterKey(date)),
        readCounter(challengeCompletionCounterKey(date)),
        readCounter(newPlayerChallengeCompletionCounterKey(date)),
        readCounter(notifyOptInCounterKey(date)),
        readCounter(subscribeTapCounterKey(date)),
        computeChallengeReturnRateForDate(date, 1),
        readViralMetricsForDate(date),
        readCounter(raceJoinsCounterKey(date)),
        readCounter(raceMatchesCounterKey(date)),
        readCounter(raceCompletionsCounterKey(date)),
    ])

    // Win rate: completions / (matches * 2) — each match has 2 participants
    const raceWinRate = raceMatches > 0
        ? safeDivide(raceCompletions, raceMatches * 2)
        : null

    return {
        dailyActiveEngagers,
        resultComments,
        challengePosts,
        challengeOpens,
        challengeCompletions,
        newPlayerChallengeCompletions,
        notifyOptIns,
        subscribeTaps,
        challengePostsPerCompleter: safeDivide(challengePosts, completions),
        newCompletersPerChallenge: safeDivide(newPlayerChallengeCompletions, challengePosts),
        challengeD1RetainedShare,
        kFactor: computeKFactorPure({
            completions,
            challengePosts,
            newPlayerChallengeCompletions,
            challengeD1RetainedShare,
        }),
        shareRate: viralMetrics.shareRate,
        viralCycleTimeHours: viralMetrics.viralCycleTimeHours,
        perChannelMetrics: viralMetrics.perChannelMetrics,
        raceJoins,
        raceMatches,
        raceCompletions,
        raceWinRate,
        avgRaceDuration: null, // Not tracked yet — placeholder for future instrumentation
    }
}

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

    const [d1ReturnRate, d3ReturnRate, growth] = await Promise.all([
        computeD1ReturnRate(date),
        computeReturnRateForDate(date, 3),
        readGrowthMetrics(date, completions),
    ])

    return {
        date,
        postOpens,
        firstActions,
        completions,
        resultCopies,
        helpTaps,
        firstActionRate,
        completionRate,
        d1ReturnRate,
        d3ReturnRate,
        estimatedDQE: completions,
        dq: { firstActionMissing: dqFirstActionMissing },
        helpTapRate,
        growth,
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

export const computeReturnRateForDate = async (date: string, days: number): Promise<number> => {
    const returnDate = addDays(date, days)
    const [dayDUsers, returnUsers] = await Promise.all([
        readSortedSetMembers(completionUsersKey(date)),
        readSortedSetMembers(completionUsersKey(returnDate)),
    ])

    return computeD1ReturnRatePure(dayDUsers, returnUsers)
}

const computeChallengeReturnRateForDate = async (date: string, days: number): Promise<number> => {
    const returnDate = addDays(date, days)
    const [challengeCompleters, returnUsers] = await Promise.all([
        readSortedSetMembers(challengeNewCompletionUsersKey(date)),
        readSortedSetMembers(completionUsersKey(returnDate)),
    ])

    return computeD1ReturnRatePure(challengeCompleters, returnUsers)
}

/**
 * Compute D1 return rate for a given date.
 * Returns the cached rate if already computed, or 0 if not yet available.
 * The dashboard scheduler calls storeD1ReturnRate after gathering user lists.
 */
export const computeD1ReturnRate = async (date: string): Promise<number> => {
    const cachedRate = await redis.get(`analytics:${date}:d1_return_rate`)
    if (cachedRate !== undefined) {
        const parsed = parseFloat(cachedRate)
        if (!Number.isNaN(parsed)) return parsed
    }

    return computeReturnRateForDate(date, 1)
}

/**
 * Store a pre-computed D1 return rate for a given date.
 * Called by the dashboard computation after gathering user lists.
 */
export const storeD1ReturnRate = async (date: string, rate: number): Promise<void> => {
    await redis.set(`analytics:${date}:d1_return_rate`, rate.toString())
}
