/**
 * Second-Puzzle Rate (S2R) — server-side instrumentation.
 *
 * Definition (from the metrics design doc, §B.3):
 *   Of users who completed puzzle #1 in a session, % who started puzzle #2
 *   within 60 seconds. Bucketed by (skillLevel × difficulty).
 *
 * Storage:
 *   - s2r:session:{sessionId}            HASH {bucket, eligibleAtMs, postId}
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

import { isMeasurementId } from '../../shared/measurement-contract'
import {
    buildMeasurementKey,
    selectMeasurementReadVersion,
    selectMeasurementWriteVersions,
} from './measurement-schema'
import type { MeasurementVersion } from './measurement-schema'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Eligibility window for a "started puzzle 2" event (ms). */
export const S2R_ELIGIBILITY_WINDOW_MS = 60_000

/** TTL on the per-session eligibility hash. Slightly > the window so race-
 *  condition reads at ~58s don't miss the key. */
const S2R_SESSION_TTL_SECONDS = 90

/** TTL on per-day bucket counters — 35 days for D7 read horizon. */
const S2R_COUNTER_TTL_SECONDS = 35 * 86400

/** A page session should never span two days; keep the first-completion
 * marker for two days so retries cannot create a second denominator. */
const S2R_FIRST_COMPLETION_TTL_SECONDS = 2 * 86400

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
const v2SessionKey = (sessionId: string): string => `s2r:v2:session:${sessionId}`
const v2FirstCompletionKey = (sessionId: string): string =>
    `s2r:v2:first-completion:${sessionId}`
const v2ConversionKey = (sessionId: string): string => `s2r:v2:converted:${sessionId}`
const eligibleCounterKey = (
    date: string,
    bucket: string,
    version: MeasurementVersion = 'v1',
): string => buildMeasurementKey('s2r', version, date, bucket, 'eligible')
const convertedCounterKey = (
    date: string,
    bucket: string,
    version: MeasurementVersion = 'v1',
): string => buildMeasurementKey('s2r', version, date, bucket, 'converted')

const incrementCounter = async (key: string): Promise<void> => {
    await redis.incrBy(key, 1)
    await redis.expire(key, S2R_COUNTER_TTL_SECONDS)
}

const incrementVersionedCounters = async (
    date: string,
    bucket: string,
    type: 'eligible' | 'converted',
): Promise<void> => {
    const versions = selectMeasurementWriteVersions(date)
    await Promise.all(versions.map((version) => {
        const key = type === 'eligible'
            ? eligibleCounterKey(date, bucket, version)
            : convertedCounterKey(date, bucket, version)
        return incrementCounter(key)
    }))
}

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
    _userId: string,
    postId: string,
): Promise<void> => {
    const bucket = bucketKey(skillLevel, difficulty)

    await redis.incrBy(eligibleCounterKey(date, bucket), 1)
    await redis.expire(eligibleCounterKey(date, bucket), S2R_COUNTER_TTL_SECONDS)

    if (sessionId === null) return

    await redis.hSet(sessionKey(sessionId), {
        bucket,
        eligibleAtMs: Date.now().toString(),
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

// ─── V2: first-completion → next-attempt action ─────────────────────────────

export type MarkS2RFirstCompletionInput = {
    sessionId: string
    date: string
    skillLevel: number
    difficulty: Difficulty
    postId: string
    contentId: string
    attemptId: string
    now?: number
}

export type ConvertS2RFirstActionInput = {
    sessionId: string
    postId: string
    contentId: string
    attemptId: string
    now?: number
}

const hasValidMeasurementIds = (values: string[]): boolean =>
    values.every((value) => isMeasurementId(value))

const isValidFirstCompletion = (input: MarkS2RFirstCompletionInput): boolean =>
    Number.isFinite(input.now ?? Date.now())
    && isDifficulty(input.difficulty)
    && hasValidMeasurementIds([
        input.sessionId,
        input.postId,
        input.contentId,
        input.attemptId,
    ])

const isValidFirstAction = (input: ConvertS2RFirstActionInput): boolean =>
    Number.isFinite(input.now ?? Date.now())
    && hasValidMeasurementIds([
        input.sessionId,
        input.postId,
        input.contentId,
        input.attemptId,
    ])

const claimOnce = async (key: string): Promise<boolean> => {
    const expiration = new Date(Date.now() + S2R_FIRST_COMPLETION_TTL_SECONDS * 1000)
    return await redis.set(key, '1', { nx: true, expiration }) !== ''
}

const writeV2EligibilityState = async (
    input: MarkS2RFirstCompletionInput,
    bucket: string,
): Promise<void> => {
    const key = v2SessionKey(input.sessionId)
    await redis.hSet(key, {
        bucket,
        date: input.date,
        eligibleAtMs: (input.now ?? Date.now()).toString(),
        initialAttemptId: input.attemptId,
        initialContentId: input.contentId,
        postId: input.postId,
    })
    await redis.expire(key, S2R_SESSION_TTL_SECONDS)
}

/**
 * Count the first verified completion in a page session. During the rollout
 * window the aggregate is written to both schemas, while state stays v2-only.
 */
export const markS2RFirstCompletion = async (
    input: MarkS2RFirstCompletionInput,
): Promise<boolean> => {
    if (!isValidFirstCompletion(input)) return false
    selectMeasurementWriteVersions(input.date)

    const claimed = await claimOnce(v2FirstCompletionKey(input.sessionId))
    if (!claimed) return false

    const bucket = bucketKey(input.skillLevel, input.difficulty)
    await writeV2EligibilityState(input, bucket)
    await incrementVersionedCounters(input.date, bucket, 'eligible')
    return true
}

type V2EligibilityState = {
    bucket: string
    date: string
    eligibleAtMs: string
    initialAttemptId: string
}

const readV2EligibilityState = async (
    sessionId: string,
): Promise<V2EligibilityState | null> => {
    const record = await redis.hGetAll(v2SessionKey(sessionId))
    if (
        record.bucket === undefined
        || record.date === undefined
        || record.eligibleAtMs === undefined
        || record.initialAttemptId === undefined
    ) return null
    return {
        bucket: record.bucket,
        date: record.date,
        eligibleAtMs: record.eligibleAtMs,
        initialAttemptId: record.initialAttemptId,
    }
}

/** Record the first action from the first distinct attempt within 60 seconds. */
export const tryConvertS2RFirstAction = async (
    input: ConvertS2RFirstActionInput,
): Promise<boolean> => {
    if (!isValidFirstAction(input)) return false

    const record = await readV2EligibilityState(input.sessionId)
    if (record === null || record.initialAttemptId === input.attemptId) return false

    const eligibleAtMs = Number(record.eligibleAtMs)
    const elapsedMs = (input.now ?? Date.now()) - eligibleAtMs
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > S2R_ELIGIBILITY_WINDOW_MS) {
        if (elapsedMs > S2R_ELIGIBILITY_WINDOW_MS) await redis.del(v2SessionKey(input.sessionId))
        return false
    }

    const claimed = await claimOnce(v2ConversionKey(input.sessionId))
    if (!claimed) return false

    await incrementVersionedCounters(record.date, record.bucket, 'converted')
    await redis.del(v2SessionKey(input.sessionId))
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
    const version = selectMeasurementReadVersion(date)
    const [eligible, converted] = await Promise.all([
        readCounter(eligibleCounterKey(date, bucket, version)),
        readCounter(convertedCounterKey(date, bucket, version)),
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
