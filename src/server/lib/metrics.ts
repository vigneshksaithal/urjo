/**
 * Simplified metrics — the small, intentional analytics surface.
 *
 * Six product metrics per UTC day, per subreddit install:
 *   opens, views (opened-no-action), completions, play time, D1, D7 retention.
 *
 * Storage is deliberately minimal: two daily counters (opens, first actions —
 * the latter owned by lib/analytics), one completions counter, and one
 * play-time hash. Retention reuses the exact completer-cohort computation in
 * lib/analytics rather than storing a second cohort structure.
 *
 * Pure functions live at the top so they are unit-testable without Redis.
 *
 * COUPLING (do not break in cleanup): this module reads counter keys and the
 * completer cohort owned by lib/analytics —
 *   - `analytics:{date}:first_actions`   (written by analytics.trackFirstAction)
 *   - `analytics:{date}:completions`      (written by analytics.trackCompletion)
 *   - completer-cohort retention via analytics.computeReturnRateForDate
 * So `analytics.ts` and the first-action/completion wiring in routes/game.ts
 * MUST stay even if the rest of the legacy analytics pipeline is deleted, or
 * views/completions/retention will silently zero out.
 */

import { redis } from '@devvit/web/server'

import type { SimpleMetrics } from '../../shared/metrics-types'
import { computeReturnRateForDate } from './analytics'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Retain raw daily counters long enough to back a 30-day report plus the D7 window. */
const COUNTER_TTL_SECONDS = 45 * 86400

/** Dedup flags for a single UTC day self-expire after the day is well over. */
const DEDUP_TTL_SECONDS = 2 * 86400

/** Upper bound on a single play-time tick (seconds) — client values are untrusted. */
const MAX_TICK_SECONDS = 10

// ─── Pure Functions ─────────────────────────────────────────────────────────

/** Opens that never converted to a first action, floored at zero. */
export const computeViews = (opens: number, firstActions: number): number =>
    Math.max(0, opens - firstActions)

/** Clamp an untrusted client tick into [0, MAX_TICK_SECONDS]. */
const clampTick = (raw: number): number => {
    if (!Number.isFinite(raw) || raw <= 0) return 0
    return Math.min(Math.floor(raw), MAX_TICK_SECONDS)
}

// ─── Key Builders ─────────────────────────────────────────────────────────────

const opensKey = (date: string): string =>
    `metrics:${date}:opens`

const openDedupKey = (date: string, postId: string, identity: string): string =>
    `metrics:opened:${date}:${postId}:${identity}`

const firstActionsKey = (date: string): string =>
    `analytics:${date}:first_actions`

const completionsKey = (date: string): string =>
    `analytics:${date}:completions`

const playtimeKey = (date: string): string =>
    `metrics:${date}:playtime`

const playtimeSessionKey = (date: string, sessionId: string): string =>
    `metrics:pt-counted:${date}:${sessionId}`

// ─── Redis Helpers ────────────────────────────────────────────────────────────

const readCounter = async (key: string): Promise<number> => {
    const raw = await redis.get(key)
    if (raw === undefined) return 0
    const parsed = parseInt(raw, 10)
    return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Set a dedup flag. Returns true if newly set (first time), false if it existed.
 * Mirrors the get → set + expire pattern used across the codebase (no SET NX).
 */
const trySetDedup = async (key: string, ttl: number): Promise<boolean> => {
    const existing = await redis.get(key)
    if (existing !== undefined) return false
    await redis.set(key, '1')
    await redis.expire(key, ttl)
    return true
}

// ─── Tracking ─────────────────────────────────────────────────────────────────

/**
 * Track a post open, deduped per (date, postId, identity). `identity` is the
 * userId for logged-in users, or the session id for logged-out users.
 * Returns true if this open was newly counted, false if a duplicate.
 */
export const trackOpen = async (
    date: string,
    postId: string,
    identity: string,
): Promise<boolean> => {
    const isNew = await trySetDedup(openDedupKey(date, postId, identity), DEDUP_TTL_SECONDS)
    if (!isNew) return false

    await redis.incrBy(opensKey(date), 1)
    await redis.expire(opensKey(date), COUNTER_TTL_SECONDS)
    return true
}

/**
 * Add active-foreground seconds for a session to the day's play-time total.
 * Counts the session toward the session tally exactly once.
 */
export const recordPlaytimeTick = async (
    date: string,
    sessionId: string,
    tickSeconds: number,
): Promise<void> => {
    const clamped = clampTick(tickSeconds)
    if (clamped === 0) return

    const key = playtimeKey(date)
    await redis.hIncrBy(key, 'totalSeconds', clamped)

    const firstTickForSession = await trySetDedup(
        playtimeSessionKey(date, sessionId),
        DEDUP_TTL_SECONDS,
    )
    if (firstTickForSession) {
        await redis.hIncrBy(key, 'sessions', 1)
    }
    await redis.expire(key, COUNTER_TTL_SECONDS)
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export type Playtime = {
    totalSeconds: number
    sessions: number
    averageSeconds: number | null
}

const parseField = (raw: string | undefined): number => {
    if (raw === undefined) return 0
    const parsed = parseInt(raw, 10)
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

/** Read the day's play-time aggregate. */
export const readPlaytime = async (date: string): Promise<Playtime> => {
    const raw = await redis.hGetAll(playtimeKey(date))
    const totalSeconds = parseField(raw.totalSeconds)
    const sessions = parseField(raw.sessions)
    return {
        totalSeconds,
        sessions,
        averageSeconds: sessions > 0 ? totalSeconds / sessions : null,
    }
}

/**
 * Assemble the six simplified metrics for a UTC date.
 *
 * D1/D7 retention reuse the exact completer-cohort computation and return
 * null while their return window is still open.
 */
export const getSimpleMetrics = async (
    date: string,
    now: Date = new Date(),
): Promise<SimpleMetrics> => {
    const [opens, firstActions, completions, playtime, d1Retention, d7Retention] =
        await Promise.all([
            readCounter(opensKey(date)),
            readCounter(firstActionsKey(date)),
            readCounter(completionsKey(date)),
            readPlaytime(date),
            computeReturnRateForDate(date, 1, now),
            computeReturnRateForDate(date, 7, now),
        ])

    return {
        date,
        opens,
        views: computeViews(opens, firstActions),
        completions,
        averagePlaySeconds: playtime.averageSeconds,
        sessions: playtime.sessions,
        d1Retention,
        d7Retention,
    }
}
