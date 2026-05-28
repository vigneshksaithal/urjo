/**
 * Second-Puzzle Rate (S2R) — server-side instrumentation.
 *
 * Definition (from the metrics design doc, §B.3):
 *   Of users who completed puzzle #1 in a session, % who started puzzle #2
 *   within 60 seconds. Bucketed by (skillLevel × difficulty).
 *
 * Storage:
 *   - s2r:session:{sessionId}            HASH {bucket, eligibleAtMs, userId, postId}
 *                                        TTL 90s — slightly larger than the 60s
 *                                        eligibility window so a /state call at
 *                                        ~58s still finds the key.
 *   - s2r:{date}:{bucket}:eligible       counter (atomic incrBy)
 *   - s2r:{date}:{bucket}:converted      counter (atomic incrBy, only if
 *                                        within the 60s window)
 *
 * The bucket is `${skillBucket}:${difficulty}` where skillBucket maps the
 * 1–9 skill scale into 3 bands (low/mid/high). 3 × 4 difficulties = 12
 * buckets — matches the 9-bucket recommendation from §C with one extra
 * difficulty band ('diabolical') the design didn't account for.
 *
 * All writes are non-blocking; failures are caught at the call site and
 * never affect gameplay.
 */

import { redis } from '@devvit/web/server'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Eligibility window for a "started puzzle 2" event (ms). */
export const S2R_ELIGIBILITY_WINDOW_MS = 60_000

/** TTL on the per-session eligibility hash. Slightly > the window so race-
 *  condition reads at ~58s don't miss the key. */
const S2R_SESSION_TTL_SECONDS = 90

/** TTL on per-day bucket counters — 35 days for D7 read horizon. */
const S2R_COUNTER_TTL_SECONDS = 35 * 86400

// ─── Pure: bucketing ──────────────────────────────────────────────────────────

export type SkillBucket = 'low' | 'mid' | 'high'

export type Difficulty = 'easy' | 'medium' | 'hard' | 'diabolical'

export const isDifficulty = (value: unknown): value is Difficulty =>
    value === 'easy' || value === 'medium' || value === 'hard' || value === 'diabolical'

/**
 * Map a skill level (1–9) to a 3-band bucket.
 *   1–3  → low
 *   4–6  → mid
 *   7–9  → high
 *
 * Out-of-range or non-integer inputs fall back to 'mid' — which is what
 * the puzzle assignment defaults to in the rest of the codebase.
 */
export const skillToBucket = (skillLevel: number): SkillBucket => {
    if (!Number.isFinite(skillLevel)) return 'mid'
    const n = Math.floor(skillLevel)
    if (n <= 3) return 'low'
    if (n <= 6) return 'mid'
    return 'high'
}

/**
 * Build the canonical bucket key for a (skill, difficulty) pair.
 * The order matters — never reorder without a migration plan.
 */
export const bucketKey = (skillLevel: number, difficulty: Difficulty): string =>
    `${skillToBucket(skillLevel)}:${difficulty}`

// ─── Pure: rate computation ───────────────────────────────────────────────────

/**
 * Pure: compute S2R from eligible/converted counts.
 * Returns null when the denominator is 0 (no first-completions to measure
 * against — reporting "0%" of zero is misleading).
 */
export const computeS2RPure = (eligible: number, converted: number): number | null => {
    if (eligible <= 0) return null
    return Math.min(Math.max(converted / eligible, 0), 1)
}

// ─── Redis Keys ───────────────────────────────────────────────────────────────

const sessionKey = (sessionId: string): string => `s2r:session:${sessionId}`
const eligibleCounterKey = (date: string, bucket: string): string =>
    `s2r:${date}:${bucket}:eligible`
const convertedCounterKey = (date: string, bucket: string): string =>
    `s2r:${date}:${bucket}:converted`

// ─── Redis Mutators ───────────────────────────────────────────────────────────

/**
 * Mark a user as eligible for S2R conversion. Called immediately after a
 * successful puzzle completion.
 *
 * Atomic semantics:
 *   - Increments the bucket's eligible counter exactly once per call.
 *   - Overwrites any prior session-key contents (latest completion wins).
 *
 * Does NOT dedup against multiple back-to-back completions in the same
 * session — that's by design. If a user completes puzzle 2, we re-mark
 * eligibility so puzzle 3 has a chance to count. The denominator is
 * "completions that could plausibly start a next puzzle", not "first
 * completions per session".
 */
export const markS2REligible = async (
    sessionId: string | null,
    date: string,
    skillLevel: number,
    difficulty: Difficulty,
    userId: string,
    postId: string,
): Promise<void> => {
    const bucket = bucketKey(skillLevel, difficulty)

    await redis.incrBy(eligibleCounterKey(date, bucket), 1)
    await redis.expire(eligibleCounterKey(date, bucket), S2R_COUNTER_TTL_SECONDS)

    if (sessionId === null) return

    await redis.hSet(sessionKey(sessionId), {
        bucket,
        eligibleAtMs: Date.now().toString(),
        userId,
        postId,
        date,
    })
    await redis.expire(sessionKey(sessionId), S2R_SESSION_TTL_SECONDS)
}

/**
 * Attempt to convert an eligible session into an S2R "started puzzle 2"
 * event. Called from /api/game/state when a fresh puzzle is loaded.
 *
 * The call is a no-op if:
 *   - the session has no eligibility record (never completed)
 *   - the eligibility window has expired (>60s since completion)
 *   - the same postId is being loaded (a refresh, not a new puzzle)
 *
 * The session key is deleted on a successful conversion so the same
 * eligibility cannot count twice.
 *
 * @returns true if a conversion was recorded, false otherwise
 */
export const tryConvertS2R = async (
    sessionId: string | null,
    currentPostId: string,
    now: number = Date.now(),
): Promise<boolean> => {
    if (sessionId === null) return false

    const record = await redis.hGetAll(sessionKey(sessionId))
    if (record.bucket === undefined || record.eligibleAtMs === undefined) return false

    const eligibleAtMs = parseInt(record.eligibleAtMs, 10)
    if (!Number.isFinite(eligibleAtMs)) return false

    if (now - eligibleAtMs > S2R_ELIGIBILITY_WINDOW_MS) {
        // Window expired; clean up the stale record.
        await redis.del(sessionKey(sessionId))
        return false
    }

    if (record.postId === currentPostId) {
        // Same post being re-loaded — not a "next puzzle" event.
        return false
    }

    const date = record.date ?? new Date(eligibleAtMs).toISOString().split('T')[0]
    if (date === undefined) return false

    await redis.incrBy(convertedCounterKey(date, record.bucket), 1)
    await redis.expire(convertedCounterKey(date, record.bucket), S2R_COUNTER_TTL_SECONDS)
    await redis.del(sessionKey(sessionId))

    return true
}

// ─── Reads ────────────────────────────────────────────────────────────────────

const readCounter = async (key: string): Promise<number> => {
    const raw = await redis.get(key)
    if (raw === undefined) return 0
    const parsed = parseInt(raw, 10)
    return Number.isNaN(parsed) ? 0 : parsed
}

export type S2RBucketSnapshot = {
    bucket: string
    eligible: number
    converted: number
    rate: number | null
}

/**
 * Read the S2R snapshot for a given (date, bucket).
 */
export const readS2RBucket = async (
    date: string,
    bucket: string,
): Promise<S2RBucketSnapshot> => {
    const [eligible, converted] = await Promise.all([
        readCounter(eligibleCounterKey(date, bucket)),
        readCounter(convertedCounterKey(date, bucket)),
    ])
    return { bucket, eligible, converted, rate: computeS2RPure(eligible, converted) }
}

/**
 * Read the global (across all buckets) S2R for a date.
 * Sums eligible + converted across all enumerated buckets.
 */
export const readS2RGlobal = async (date: string): Promise<S2RBucketSnapshot> => {
    const buckets: SkillBucket[] = ['low', 'mid', 'high']
    const difficulties: Difficulty[] = ['easy', 'medium', 'hard', 'diabolical']
    const allBuckets = buckets.flatMap((s) => difficulties.map((d) => `${s}:${d}`))

    const snapshots = await Promise.all(allBuckets.map((b) => readS2RBucket(date, b)))
    const eligible = snapshots.reduce((sum, s) => sum + s.eligible, 0)
    const converted = snapshots.reduce((sum, s) => sum + s.converted, 0)
    return {
        bucket: '_global',
        eligible,
        converted,
        rate: computeS2RPure(eligible, converted),
    }
}

/**
 * Read the per-bucket breakdown for a date. Useful for the operating
 * dashboard's bucket-level view (which buckets have flow-fit problems).
 */
export const readS2RAllBuckets = async (date: string): Promise<S2RBucketSnapshot[]> => {
    const buckets: SkillBucket[] = ['low', 'mid', 'high']
    const difficulties: Difficulty[] = ['easy', 'medium', 'hard', 'diabolical']
    const allBuckets = buckets.flatMap((s) => difficulties.map((d) => `${s}:${d}`))
    return Promise.all(allBuckets.map((b) => readS2RBucket(date, b)))
}
