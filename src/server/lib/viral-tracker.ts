/**
 * Viral Tracker — Recording & Computation Functions
 *
 * Redis recording functions for viral loop events (shares, completions,
 * attributions, cycle times) plus stateless computation helpers.
 * All recording functions are non-blocking — failures should be caught at the call site.
 */

import { redis } from '@devvit/web/server'

import type {
    ChannelMetrics,
    InviteChannel,
    PerChannelMetrics,
} from '../../shared/growth-types'

// ─── TTL Constants ─────────────────────────────────────────────────────────────

const TTL_48H = 172_800
const TTL_90D = 7_776_000

// ─── Cardinality & Cap Constants ───────────────────────────────────────────────

const CYCLE_TIME_CAP_SECONDS = 172_800
const CYCLE_TIME_MAX_MEMBERS = 200

const INVITE_CHANNELS: readonly InviteChannel[] = [
    'challenge_post',
    'result_comment',
    'result_copy',
] as const

// ─── Key Builders ──────────────────────────────────────────────────────────────

const completersKey = (date: string): string =>
    `viral:${date}:completers`

const sharersKey = (date: string): string =>
    `viral:${date}:sharers`

const shareDedupKey = (date: string, userId: string): string =>
    `viral:dedup:share:${date}:${userId}`

const channelOpenDedupKey = (date: string, channel: InviteChannel, userId: string): string =>
    `viral:dedup:channel_open:${date}:${channel}:${userId}`

const channelConversionDedupKey = (channel: InviteChannel, userId: string): string =>
    `viral:dedup:channel_conversion:${channel}:${userId}`

const challengeCreatedAtKey = (postId: string): string =>
    `viral:challenge:${postId}:created_at`

const cycleTimesKey = (date: string): string =>
    `viral:${date}:cycle_times`

const attributionKey = (userId: string): string =>
    `viral:attribution:${userId}`

const channelOpensKey = (date: string, channel: InviteChannel): string =>
    `viral:${date}:channel:${channel}:opens`

const channelConversionsKey = (date: string, channel: InviteChannel): string =>
    `viral:${date}:channel:${channel}:conversions`

const trySetDedup = async (key: string, ttl: number): Promise<boolean> => {
    const existing = await redis.get(key)
    if (existing !== undefined) return false

    await redis.set(key, '1')
    await redis.expire(key, ttl)
    return true
}

// ─── Redis Recording Functions ─────────────────────────────────────────────────

/**
 * Record a user as a completer for share rate calculation.
 * Sorted set membership handles deduplication — adding the same userId
 * twice just updates the score.
 */
export const recordCompleter = async (date: string, userId: string): Promise<void> => {
    const key = completersKey(date)
    await redis.zAdd(key, { member: userId, score: Date.now() })
    await redis.expire(key, TTL_90D)
}

/**
 * Record a user as a sharer (any channel) for share rate calculation.
 * Uses a separate dedup key to prevent multiple Redis writes on repeated
 * share actions within the same day.
 */
export const recordSharer = async (date: string, userId: string): Promise<void> => {
    const isNew = await trySetDedup(shareDedupKey(date, userId), TTL_48H)
    if (!isNew) return

    const key = sharersKey(date)
    await redis.zAdd(key, { member: userId, score: Date.now() })
    await redis.expire(key, TTL_90D)
}

/**
 * Record a challenge post creation timestamp.
 * Stored for cycle time computation (elapsed = completion_ts - creation_ts).
 */
export const recordChallengeCreation = async (
    _date: string,
    postId: string,
    timestampMs: number,
): Promise<void> => {
    const key = challengeCreatedAtKey(postId)
    await redis.set(key, timestampMs.toString())
    await redis.expire(key, TTL_48H)
}

/**
 * Record a new player's cycle time (elapsed seconds from challenge creation to completion).
 * Enforces a 172800s (48h) cap and 200-member cardinality limit.
 * Discards silently if cap exceeded or set is full.
 */
export const recordCycleTime = async (date: string, elapsedSeconds: number): Promise<void> => {
    if (elapsedSeconds > CYCLE_TIME_CAP_SECONDS) return

    const key = cycleTimesKey(date)
    const cardinality = await redis.zCard(key)
    if (cardinality >= CYCLE_TIME_MAX_MEMBERS) return

    // Use timestamp as member to allow multiple entries with different scores
    const member = `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    await redis.zAdd(key, { member, score: elapsedSeconds })
    await redis.expire(key, TTL_48H)
}

/**
 * Record first-touch attribution for a new player.
 * Uses NX semantics — only sets if the key does not already exist,
 * preserving the first-touch channel immutably.
 */
export const recordAttribution = async (userId: string, channel: InviteChannel): Promise<void> => {
    const key = attributionKey(userId)
    const existing = await redis.get(key)
    if (existing !== undefined) return

    await redis.set(key, channel)
    await redis.expire(key, TTL_90D)
}

/**
 * Record a channel open event for conversion rate calculation.
 * Increments a per-channel daily counter once per user/channel/day.
 */
export const recordChannelOpen = async (
    date: string,
    channel: InviteChannel,
    userId: string,
): Promise<boolean> => {
    const isNew = await trySetDedup(channelOpenDedupKey(date, channel, userId), TTL_48H)
    if (!isNew) return false

    const key = channelOpensKey(date, channel)
    await redis.incrBy(key, 1)
    await redis.expire(key, TTL_90D)
    return true
}

/**
 * Record a channel conversion event.
 * Increments a per-channel daily counter once per attributed user.
 */
export const recordChannelConversion = async (
    date: string,
    channel: InviteChannel,
    userId: string,
): Promise<boolean> => {
    const isNew = await trySetDedup(channelConversionDedupKey(channel, userId), TTL_90D)
    if (!isNew) return false

    const key = channelConversionsKey(date, channel)
    await redis.incrBy(key, 1)
    await redis.expire(key, TTL_90D)
    return true
}

// ─── Redis Read Functions ──────────────────────────────────────────────────────

/**
 * Get the creation timestamp for a challenge post.
 * Returns null if the key does not exist or has expired.
 */
export const getChallengeCreationTimestamp = async (postId: string): Promise<number | null> => {
    const value = await redis.get(challengeCreatedAtKey(postId))
    if (value === undefined) return null
    const parsed = parseInt(value, 10)
    return Number.isNaN(parsed) ? null : parsed
}

/**
 * Get the first-touch attribution channel for a user.
 * Returns null if unattributed.
 */
export const getAttribution = async (userId: string): Promise<InviteChannel | null> => {
    const value = await redis.get(attributionKey(userId))
    if (value === undefined) return null
    return isInviteChannel(value) ? value : null
}

export type ViralMetricsForDate = {
    shareRate: number | null
    viralCycleTimeHours: number | null
    perChannelMetrics: PerChannelMetrics | null
}

export const readViralMetricsForDate = async (date: string): Promise<ViralMetricsForDate> => {
    const [completersCount, sharersCount, cycleTimeEntries, channelReads] = await Promise.all([
        redis.zCard(completersKey(date)),
        redis.zCard(sharersKey(date)),
        redis.zRange(cycleTimesKey(date), 0, -1, { by: 'rank' }),
        Promise.all(
            INVITE_CHANNELS.flatMap((channel) => [
                redis.get(channelOpensKey(date, channel)),
                redis.get(channelConversionsKey(date, channel)),
            ]),
        ),
    ])

    const medianSeconds = computeMedian(cycleTimeEntries.map((entry) => entry.score))
    const channelMetricsEntries: [InviteChannel, ChannelMetrics][] = INVITE_CHANNELS.map(
        (channel, idx) => {
            const opens = parseCounter(channelReads[idx * 2])
            const conversions = parseCounter(channelReads[idx * 2 + 1])
            return [channel, {
                opens,
                conversions,
                conversionRate: computeConversionRate(opens, conversions),
            }]
        },
    )

    const hasChannelData = channelMetricsEntries.some(
        ([, metrics]) => metrics.opens > 0 || metrics.conversions > 0,
    )

    return {
        shareRate: computeShareRate(completersCount, sharersCount),
        viralCycleTimeHours: medianSeconds !== null ? medianSeconds / 3600 : null,
        perChannelMetrics: hasChannelData
            ? Object.fromEntries(channelMetricsEntries) as PerChannelMetrics
            : null,
    }
}

// ─── Pure Computation Functions ────────────────────────────────────────────────

/**
 * Compute share rate from completer and sharer counts.
 * Returns sharers / completers clamped to [0, 1], or null when completers is 0.
 */
export const computeShareRate = (completers: number, sharers: number): number | null => {
    if (completers <= 0) return null
    const rate = sharers / completers
    return Math.min(Math.max(rate, 0), 1)
}

/**
 * Compute median from an array of numbers.
 * Returns the middle value for odd-length arrays, average of two middle values for even-length.
 * Returns null for empty arrays.
 */
export const computeMedian = (values: readonly number[]): number | null => {
    if (values.length === 0) return null

    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)

    if (sorted.length % 2 === 1) {
        return sorted[mid]!
    }

    return (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Compute conversion rate from opens and conversions.
 * Returns conversions / opens when opens > 0, null otherwise.
 * Does NOT clamp — conversions can theoretically exceed opens.
 */
export const computeConversionRate = (opens: number, conversions: number): number | null => {
    if (opens <= 0) return null
    return conversions / opens
}

/**
 * Compute rolling average with a minimum-3-day threshold.
 * Excludes nulls from both sum and divisor.
 * Returns null when fewer than 3 non-null values exist.
 */
export const computeViralRollingAverage = (values: readonly (number | null)[]): number | null => {
    const nonNull = values.filter((v): v is number => v !== null)
    if (nonNull.length < 3) return null

    const sum = nonNull.reduce((acc, v) => acc + v, 0)
    return sum / nonNull.length
}

const parseCounter = (value: string | undefined): number => {
    if (value === undefined) return 0
    const parsed = parseInt(value, 10)
    return Number.isNaN(parsed) ? 0 : parsed
}

const isInviteChannel = (value: string): value is InviteChannel =>
    (INVITE_CHANNELS as readonly string[]).includes(value)
