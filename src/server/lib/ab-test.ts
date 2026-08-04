/**
 * A/B/C Inline Onboarding Experiment
 *
 * Deterministic variant assignment via djb2 hash — no Redis reads on hot path.
 * A/B are direct-play controls; C adds guidance over the playable board.
 * Per-variant funnel counters: opens, first_actions, completions.
 *
 * Redis key schema:
 *   analytics:{date}:variant:{A|B|C}:opens
 *   analytics:{date}:variant:{A|B|C}:first_actions
 *   analytics:{date}:variant:{A|B|C}:completions
 *   analytics:variant_seen:{date}:{postId}:{userId}  (dedup, TTL 24h)
 */

import { redis } from '@devvit/web/server'

import { registerUserDynamicKey } from './account-deletion'

export type Variant = 'A' | 'B' | 'C'

const VARIANTS: readonly Variant[] = ['A', 'B', 'C'] as const

// ─── Variant Assignment ───────────────────────────────────────────────────────

/**
 * djb2 hash — uniform distribution on base36-encoded Reddit userIds.
 * Sequential user-id issuance means naive mod 3 on the raw integer clusters
 * assignments; djb2 scrambles the bits for even distribution immediately.
 */
const djb2 = (s: string): number => {
    let h = 5381
    for (let i = 0; i < s.length; i++) {
        h = Math.imul(33, h) ^ s.charCodeAt(i)
    }
    return h >>> 0
}

/**
 * Assign a user to a variant deterministically.
 * Same input always returns the same variant. Zero Redis reads.
 * To rotate the experiment, append a salt: `djb2(userId + ':v2')`.
 */
export const assignVariant = (userId: string): Variant =>
    VARIANTS[djb2(userId) % 3] ?? 'A'

// ─── TTL Constants ────────────────────────────────────────────────────────────

/** 45-day retention — matches existing metrics counter TTL. */
const COUNTER_TTL = 45 * 86400
/** 24-hour dedup window — one open event per user per post per day. */
const DEDUP_TTL = 86400

// ─── Key Builders ─────────────────────────────────────────────────────────────

const variantOpenKey = (date: string, v: Variant): string =>
    `analytics:${date}:variant:${v}:opens`

const variantFirstActionKey = (date: string, v: Variant): string =>
    `analytics:${date}:variant:${v}:first_actions`

const variantCompletionKey = (date: string, v: Variant): string =>
    `analytics:${date}:variant:${v}:completions`

const variantOpenDedupKey = (date: string, postId: string, userId: string): string =>
    `analytics:variant_seen:${date}:${postId}:${userId}`

// ─── Dedup Helper ─────────────────────────────────────────────────────────────

const trySetDedup = async (key: string, ttl: number): Promise<boolean> => {
    const existing = await redis.get(key)
    if (existing !== undefined) return false
    await redis.set(key, '1')
    await redis.expire(key, ttl)
    return true
}

// ─── Tracking ─────────────────────────────────────────────────────────────────

/** Track one open per user per post per day for the assigned variant. */
export const trackVariantOpen = async (
    date: string,
    postId: string,
    userId: string,
    variant: Variant,
): Promise<void> => {
    const dedupKey = variantOpenDedupKey(date, postId, userId)
    await registerUserDynamicKey(userId, dedupKey)
    const isNew = await trySetDedup(dedupKey, DEDUP_TTL)
    if (!isNew) return
    await redis.incrBy(variantOpenKey(date, variant), 1)
    await redis.expire(variantOpenKey(date, variant), COUNTER_TTL)
}

/**
 * Track first game-cell action per variant.
 * Caller is responsible for calling only when trackFirstAction returns isNew=true.
 */
export const trackVariantFirstAction = async (date: string, variant: Variant): Promise<void> => {
    await redis.incrBy(variantFirstActionKey(date, variant), 1)
    await redis.expire(variantFirstActionKey(date, variant), COUNTER_TTL)
}

/**
 * Track puzzle completion per variant.
 * Caller is responsible for calling only when trackCompletion returns isNew=true.
 */
export const trackVariantCompletion = async (date: string, variant: Variant): Promise<void> => {
    await redis.incrBy(variantCompletionKey(date, variant), 1)
    await redis.expire(variantCompletionKey(date, variant), COUNTER_TTL)
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export type VariantMetrics = {
    variant: Variant
    opens: number
    firstActions: number
    completions: number
    /** firstActions / opens — null when opens === 0. */
    firstActionRate: number | null
    /** completions / firstActions — null when firstActions === 0. */
    completionRate: number | null
}

const parseCount = (raw: string | undefined): number => {
    if (raw === undefined) return 0
    const n = parseInt(raw, 10)
    return Number.isNaN(n) ? 0 : n
}

const safeRate = (num: number, denom: number): number | null =>
    denom === 0 ? null : num / denom

/** Read per-variant funnel metrics for a single UTC date (9 parallel gets). */
export const readVariantMetrics = async (date: string): Promise<VariantMetrics[]> => {
    const keys = VARIANTS.flatMap((v) => [
        variantOpenKey(date, v),
        variantFirstActionKey(date, v),
        variantCompletionKey(date, v),
    ])
    const values = await Promise.all(keys.map((k) => redis.get(k)))

    return VARIANTS.map((v, i) => {
        const opens = parseCount(values[i * 3])
        const firstActions = parseCount(values[i * 3 + 1])
        const completions = parseCount(values[i * 3 + 2])
        return {
            variant: v,
            opens,
            firstActions,
            completions,
            firstActionRate: safeRate(firstActions, opens),
            completionRate: safeRate(completions, firstActions),
        }
    })
}
