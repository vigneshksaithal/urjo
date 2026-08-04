/**
 * Daily Qualified Players (DQP) — server-side gate and per-sub commit.
 *
 * A session is "qualified" only when ALL THREE conditions are met:
 *   1. referrer:    a Reddit-origin referrer was observed on /api/game/state
 *   2. first-tap:   the user fired /api/game/first-action (server-validated)
 *   3. dwell:       the session accumulated >= MIN_DWELL_SECONDS of active
 *                   foreground time, measured via /api/dwell/tick
 *
 * When all three flags are set on the session, we commit a bounded analytics
 * record for the UTC day. DQP is estimated from a fixed-size daily membership
 * filter, and retention is estimated from a capped deterministic cohort sample.
 *
 * The session-flag hash has a 1h TTL — long enough for a single play
 * session to accumulate dwell, short enough that stale sessions roll off.
 *
 * Pure functions live at the top so they are unit-testable without Redis.
 */

import { redis } from '@devvit/web/server'

import type { QualifiedSummary } from '../../shared/growth-types'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum active-foreground seconds required for a qualified session. */
export const MIN_DWELL_SECONDS = 20

/** Maximum dwell seconds a single session can accumulate (server-side cap). */
export const MAX_DWELL_SECONDS = 60

/** TTL on the session flag hash — covers a single play session. */
const SESSION_FLAG_TTL_SECONDS = 3600

/** TTL on bounded DQP/retention analytics. 35 days covers the D7 read horizon. */
export const DQP_RETENTION_TTL_SECONDS = 35 * 86400

/**
 * Daily Bloom-style membership filter size. 2^24 bits = 2 MiB/day, or about
 * 70 MiB for the 35-day retention horizon.
 */
const DQP_FILTER_BITS = 16_777_216

/** Number of bit positions set/tested for each qualified user token. */
const DQP_FILTER_HASHES = 3

/** Maximum sampled cohort members retained per day. */
export const DQP_RETENTION_SAMPLE_CAP = 5_000

/** Suppress retention when the sampled cohort is too small to act on. */
export const DQP_RETENTION_MIN_SAMPLE = 400

const FNV64_OFFSET = 0xcbf29ce484222325n
const FNV64_PRIME = 0x100000001b3n
const UINT64_MASK = 0xffffffffffffffffn
const SCORE_MASK_53 = (1n << 53n) - 1n

/** Header used by the client to identify a single play session. */
export const SESSION_HEADER = 'x-urjo-session'

// ─── Pure Functions ───────────────────────────────────────────────────────────

/**
 * Decide whether a referer URL counts as a Reddit-origin referrer.
 *
 * Accepts (case-insensitive):
 *   - https://www.reddit.com/...
 *   - https://reddit.com/...
 *   - https://*.reddit.com/...   (e.g. m.reddit.com, old.reddit.com, np.reddit.com)
 *   - https://redditmedia.com/...
 *   - https://redd.it/...
 *
 * Rejects null/empty/non-Reddit referrers. Devvit may also pass the value
 * through with no `https://` prefix in some webview environments — we accept
 * a host-only value too as long as it ends in `.reddit.com` or `reddit.com`.
 */
export const isRedditReferrer = (referer: string | null | undefined): boolean => {
    if (referer === null || referer === undefined) return false
    if (referer.length === 0) return false

    const lower = referer.toLowerCase().trim()
    if (lower.length === 0) return false

    // URL form
    try {
        const parsed = new URL(lower)
        return isRedditHost(parsed.hostname)
    } catch {
        // Not a parseable URL — fall through to host-only check
    }

    // Host-only form (no scheme)
    return isRedditHost(lower.split('/')[0] ?? '')
}

const REDDIT_HOST_SUFFIXES = ['reddit.com', 'redditmedia.com', 'redd.it'] as const

const isRedditHost = (host: string): boolean => {
    if (host.length === 0) return false
    return REDDIT_HOST_SUFFIXES.some((suffix) =>
        host === suffix || host.endsWith(`.${suffix}`),
    )
}

/** Result of evaluating the AND-gate against a session-flag hash. */
export type GateEvaluation = {
    /** All three conditions are met. */
    qualified: boolean
    /** Individual flag breakdown — useful for debugging and tests. */
    flags: {
        referrer: boolean
        firstTap: boolean
        dwellOk: boolean
    }
    /** Accumulated dwell seconds at evaluation time. */
    dwellSeconds: number
}

/**
 * Evaluate the qualification AND-gate against the raw session-flag fields.
 *
 * Pure: takes a record (typically the result of redis.hGetAll) and returns
 * a structured judgement. Treats missing/empty fields as "not satisfied".
 * Never reads Redis itself — callers compose this with persistence helpers.
 */
export const evaluateGate = (
    flags: Readonly<Record<string, string | undefined>>,
    minDwellSeconds: number = MIN_DWELL_SECONDS,
): GateEvaluation => {
    const referrer = flags.referrer === '1'
    const firstTap = flags.firstTap === '1'
    const dwellSeconds = parseDwellSeconds(flags.dwellSeconds)
    const dwellOk = dwellSeconds >= minDwellSeconds

    return {
        qualified: referrer && firstTap && dwellOk,
        flags: { referrer, firstTap, dwellOk },
        dwellSeconds,
    }
}

const parseDwellSeconds = (raw: string | undefined): number => {
    if (raw === undefined) return 0
    const parsed = parseInt(raw, 10)
    if (Number.isNaN(parsed) || parsed < 0) return 0
    return Math.min(parsed, MAX_DWELL_SECONDS)
}

/**
 * Clamp a tick increment to a valid range. Tick payloads come from the
 * client and must not be trusted unbounded.
 */
export const clampTickSeconds = (raw: unknown, maxPerTick: number = 10): number => {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0
    return Math.min(Math.floor(raw), maxPerTick)
}

const hash64 = (value: string): bigint => {
    let hash = FNV64_OFFSET
    for (let i = 0; i < value.length; i++) {
        hash ^= BigInt(value.charCodeAt(i))
        hash = (hash * FNV64_PRIME) & UINT64_MASK
    }
    return hash
}

const userToken = (userId: string): string =>
    hash64(`urjo:dqp:token:${userId}`).toString(36)

const sampleScore = (token: string): number =>
    Number(hash64(`urjo:dqp:sample:${token}`) & SCORE_MASK_53)

const filterPositions = (token: string): number[] =>
    Array.from({ length: DQP_FILTER_HASHES }, (_, index) =>
        Number(hash64(`urjo:dqp:filter:${index}:${token}`) % BigInt(DQP_FILTER_BITS)),
    )

const estimateCardinality = (bitsSet: number): number => {
    if (bitsSet <= 0) return 0
    const clampedBits = Math.min(bitsSet, DQP_FILTER_BITS - 1)
    const emptyShare = 1 - clampedBits / DQP_FILTER_BITS
    return Math.round(-(DQP_FILTER_BITS / DQP_FILTER_HASHES) * Math.log(emptyShare))
}

const clampRate = (value: number): number =>
    Math.min(Math.max(value, 0), 1)

const addDaysISO = (date: string, days: number): string => {
    const d = new Date(`${date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    const iso = d.toISOString().split('T')[0]
    if (iso === undefined) throw new Error(`failed to add ${days}d to ${date}`)
    return iso
}

const todayISO = (now: Date = new Date()): string => {
    const iso = now.toISOString().split('T')[0]
    if (iso === undefined) throw new Error('failed to format today')
    return iso
}

// ─── Redis Key Builders ───────────────────────────────────────────────────────

const sessionFlagsKey = (sessionId: string): string =>
    `qe:session:${sessionId}:flags`

const dqpGlobalKey = (date: string): string =>
    `qe:ours:${date}`

const dqpPerSubKey = (date: string, subredditId: string): string =>
    `qe:ours:${date}:${subredditId}`

const dqpFilterKey = (date: string): string =>
    `qe:filter:${date}`

const dqpFilterBitsSetKey = (date: string): string =>
    `qe:filter:${date}:bits_set`

const dqpSampleKey = (date: string): string =>
    `qe:sample:${date}`

const dqpCountKey = (date: string): string =>
    `qe:count:${date}`

const dqpPerSubCountKey = (date: string, subredditId: string): string =>
    `qe:count:${date}:${subredditId}`

const qualifiedPlaytimeKey = (date: string): string =>
    `qe:playtime:${date}`

/** Public for read paths (analytics router, drift cron, dashboard). */
export const dqpKeys = {
    global: dqpGlobalKey,
    perSub: dqpPerSubKey,
    filter: dqpFilterKey,
    sample: dqpSampleKey,
    playtime: qualifiedPlaytimeKey,
} as const

// ─── Session Helpers ──────────────────────────────────────────────────────────

/**
 * Pull the session id from the standard `x-urjo-session` header.
 * Returns null when the header is missing, empty, or implausibly long.
 *
 * The header value is treated as opaque — we never parse it — but we do
 * length-check it so a malicious caller can't blow up Redis key sizes.
 */
export const getSessionIdFromHeader = (headers: Headers): string | null => {
    const raw = headers.get(SESSION_HEADER)
    if (raw === null) return null
    const trimmed = raw.trim()
    if (trimmed.length === 0 || trimmed.length > 64) return null
    return trimmed
}

// ─── Redis Mutators ───────────────────────────────────────────────────────────

/**
 * Capture the referrer flag and the user-scoped attribution for a session.
 *
 * Called from /api/game/state. Sets:
 *   - referrer = '1'  if the referer header is Reddit-origin
 *   - subredditId / firstSeenMs   on first capture only
 *
 * Idempotent: re-capture with a different referrer does NOT clear an
 * already-set flag. Once a Reddit referrer is seen, we keep that signal.
 */
export const captureReferrer = async (
    sessionId: string,
    _userId: string,
    subredditId: string | undefined,
    referer: string | null | undefined,
): Promise<void> => {
    const key = sessionFlagsKey(sessionId)
    const isReddit = isRedditReferrer(referer)

    const existing = await redis.hGetAll(key)
    const fields: Record<string, string> = {}

    if (existing.firstSeenMs === undefined) {
        fields.firstSeenMs = Date.now().toString()
    }
    if (subredditId !== undefined && existing.subredditId === undefined) {
        fields.subredditId = subredditId
    }
    if (isReddit && existing.referrer !== '1') {
        fields.referrer = '1'
    }

    if (Object.keys(fields).length > 0) {
        await redis.hSet(key, fields)
    }
    await redis.expire(key, SESSION_FLAG_TTL_SECONDS)
}

/**
 * Add `tickSeconds` to the session's accumulated dwell, then evaluate the
 * gate. If qualified, commit the bounded DQP/playtime analytics record.
 *
 * Returns the post-write evaluation so callers can short-circuit further
 * heartbeats once committed.
 */
export const recordDwellTick = async (
    sessionId: string,
    userId: string,
    tickSeconds: number,
    date: string,
): Promise<GateEvaluation> => {
    const key = sessionFlagsKey(sessionId)
    const clamped = clampTickSeconds(tickSeconds)

    const existing = await redis.hGetAll(key)
    const currentDwell = parseDwellSeconds(existing.dwellSeconds)
    const nextDwell = Math.min(currentDwell + clamped, MAX_DWELL_SECONDS)

    const fields: Record<string, string> = {
        dwellSeconds: nextDwell.toString(),
    }
    await redis.hSet(key, fields)
    await redis.expire(key, SESSION_FLAG_TTL_SECONDS)

    const merged = { ...existing, ...fields }
    const evaluation = evaluateGate(merged)

    if (evaluation.qualified) {
        const subredditId = existing.subredditId
        await commitQualifiedUser(date, userId, subredditId)
        await recordQualifiedPlaytime(date, key, existing, evaluation.dwellSeconds)
    }

    return evaluation
}

/**
 * Mark first-tap on the session and commit if all three flags are now set.
 *
 * Called from /api/game/first-action. Subreddit attribution is taken from
 * the session-flag hash (set by captureReferrer) when available; the route
 * layer's subredditId is used as a fallback so a session that taps before
 * a referrer was observed still has an attribution path if it qualifies
 * later.
 */
export const markFirstTapAndCommit = async (
    sessionId: string,
    date: string,
    userId: string,
    subredditId: string | undefined,
): Promise<GateEvaluation> => {
    const key = sessionFlagsKey(sessionId)
    const existing = await redis.hGetAll(key)

    const fields: Record<string, string> = { firstTap: '1' }
    if (subredditId !== undefined && existing.subredditId === undefined) {
        fields.subredditId = subredditId
    }

    await redis.hSet(key, fields)
    await redis.expire(key, SESSION_FLAG_TTL_SECONDS)

    const merged = { ...existing, ...fields }
    const evaluation = evaluateGate(merged)

    if (evaluation.qualified) {
        const attributedSub = existing.subredditId ?? subredditId
        await commitQualifiedUser(date, userId, attributedSub)
        await recordQualifiedPlaytime(date, key, existing, evaluation.dwellSeconds)
    }

    return evaluation
}

type BitfieldRest = Parameters<typeof redis.bitfield> extends [string, ...infer Rest]
    ? Rest
    : never

const runBitfield = async (key: string, commands: readonly (string | number)[]): Promise<number[]> =>
    redis.bitfield(key, ...(commands as BitfieldRest))

const setMembershipBits = async (date: string, token: string): Promise<number> => {
    const key = dqpFilterKey(date)
    const commands = filterPositions(token).flatMap((position) => ['set', 'u1', position, 1])
    const previousValues = await runBitfield(key, commands)
    const newlySetBits = previousValues.filter((value) => value === 0).length

    await redis.expire(key, DQP_RETENTION_TTL_SECONDS)
    if (newlySetBits > 0) {
        await redis.incrBy(dqpFilterBitsSetKey(date), newlySetBits)
        await redis.expire(dqpFilterBitsSetKey(date), DQP_RETENTION_TTL_SECONDS)
    }

    return newlySetBits
}

const addToRetentionSample = async (date: string, token: string): Promise<void> => {
    const key = dqpSampleKey(date)
    await redis.zAdd(key, { member: token, score: sampleScore(token) })
    await redis.expire(key, DQP_RETENTION_TTL_SECONDS)

    const count = await redis.zCard(key)
    if (count > DQP_RETENTION_SAMPLE_CAP) {
        await redis.zRemRangeByRank(key, DQP_RETENTION_SAMPLE_CAP, -1)
    }
}

const readCounter = async (key: string): Promise<number> => {
    const raw = await redis.get(key)
    if (raw === undefined) return 0
    const parsed = parseInt(raw, 10)
    return Number.isNaN(parsed) ? 0 : parsed
}

type PlaytimeBucket = 'b20_29' | 'b30_44' | 'b45_60'

const playtimeBucket = (seconds: number): PlaytimeBucket => {
    if (seconds < 30) return 'b20_29'
    if (seconds < 45) return 'b30_44'
    return 'b45_60'
}

const parseRecordedPlaytime = (raw: string | undefined): number => {
    if (raw === undefined) return 0
    const parsed = parseInt(raw, 10)
    if (Number.isNaN(parsed) || parsed < 0) return 0
    return Math.min(parsed, MAX_DWELL_SECONDS)
}

const isPlaytimeBucket = (value: string | undefined): value is PlaytimeBucket =>
    value === 'b20_29' || value === 'b30_44' || value === 'b45_60'

const recordQualifiedPlaytime = async (
    date: string,
    sessionKey: string,
    existingFlags: Readonly<Record<string, string | undefined>>,
    dwellSeconds: number,
): Promise<void> => {
    const previousSeconds = parseRecordedPlaytime(existingFlags.playtimeRecordedSeconds)
    const nextSeconds = Math.max(previousSeconds, dwellSeconds)
    const deltaSeconds = nextSeconds - previousSeconds
    if (deltaSeconds <= 0) return

    const key = qualifiedPlaytimeKey(date)
    const nextBucket = playtimeBucket(nextSeconds)
    const previousBucket = isPlaytimeBucket(existingFlags.playtimeBucket)
        ? existingFlags.playtimeBucket
        : null

    const writes: Promise<unknown>[] = [
        redis.hIncrBy(key, 'totalSeconds', deltaSeconds),
        redis.hSet(sessionKey, {
            playtimeRecordedSeconds: nextSeconds.toString(),
            playtimeBucket: nextBucket,
        }),
        redis.expire(key, DQP_RETENTION_TTL_SECONDS),
    ]

    if (previousSeconds === 0) {
        writes.push(redis.hIncrBy(key, 'qualifiedSessions', 1))
    }
    if (previousBucket !== nextBucket) {
        if (previousBucket !== null) writes.push(redis.hIncrBy(key, previousBucket, -1))
        writes.push(redis.hIncrBy(key, nextBucket, 1))
    }

    await Promise.all(writes)
}

/**
 * Commit a bounded DQP observation. Returns false when the daily membership
 * filter already looked set for this user token; because this is a compact
 * probabilistic filter, rare false duplicates are expected and acceptable.
 */
export const commitQualifiedUser = async (
    date: string,
    userId: string,
    subredditId: string | undefined,
): Promise<boolean> => {
    const token = userToken(userId)
    const newlySetBits = await setMembershipBits(date, token)
    await addToRetentionSample(date, token)

    if (newlySetBits === 0) return false

    const writes: Promise<unknown>[] = [
        redis.incrBy(dqpCountKey(date), 1),
        redis.expire(dqpCountKey(date), DQP_RETENTION_TTL_SECONDS),
    ]
    if (subredditId !== undefined && subredditId.length > 0) {
        writes.push(
            redis.incrBy(dqpPerSubCountKey(date, subredditId), 1),
            redis.expire(dqpPerSubCountKey(date, subredditId), DQP_RETENTION_TTL_SECONDS),
        )
    }
    await Promise.all(writes)

    return true
}

// ─── Read Helpers ─────────────────────────────────────────────────────────────

/** Estimated global DQP for the given UTC date. Falls back to legacy zsets. */
export const readGlobalDQP = async (date: string): Promise<number> => {
    const bitsSet = await readCounter(dqpFilterBitsSetKey(date))
    if (bitsSet > 0) return estimateCardinality(bitsSet)

    const boundedCount = await readCounter(dqpCountKey(date))
    if (boundedCount > 0) return boundedCount

    return redis.zCard(dqpGlobalKey(date))
}

/** Estimated per-sub DQP for the given (date, subredditId). Falls back to legacy zsets. */
export const readPerSubDQP = async (date: string, subredditId: string): Promise<number> => {
    const boundedCount = await readCounter(dqpPerSubCountKey(date, subredditId))
    if (boundedCount > 0) return boundedCount
    return redis.zCard(dqpPerSubKey(date, subredditId))
}

/** Aggregated active-foreground play time for qualified sessions on a UTC date. */
export type QualifiedPlaytime = {
    /** Number of qualified sessions that contributed play time. */
    qualifiedSessions: number
    /** Total active-foreground seconds across all qualified sessions. */
    totalSeconds: number
    /** Mean seconds per qualified session, or null when there are none. */
    averageSeconds: number | null
    /** Session counts bucketed by duration band. */
    buckets: {
        /** 20–29s sessions. */
        b20_29: number
        /** 30–44s sessions. */
        b30_44: number
        /** 45–60s sessions. */
        b45_60: number
    }
}

const parseCountField = (raw: string | undefined): number => {
    if (raw === undefined) return 0
    const parsed = parseInt(raw, 10)
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

/** Read the qualified-session play-time histogram for a UTC date. */
export const readQualifiedPlaytime = async (date: string): Promise<QualifiedPlaytime> => {
    const raw = await redis.hGetAll(qualifiedPlaytimeKey(date))
    const qualifiedSessions = parseCountField(raw.qualifiedSessions)
    const totalSeconds = parseCountField(raw.totalSeconds)
    return {
        qualifiedSessions,
        totalSeconds,
        averageSeconds: qualifiedSessions > 0 ? totalSeconds / qualifiedSessions : null,
        buckets: {
            b20_29: parseCountField(raw.b20_29),
            b30_44: parseCountField(raw.b30_44),
            b45_60: parseCountField(raw.b45_60),
        },
    }
}

/** Read all userIds in the global DQP zset for a date — used by D7 retention. */
export const readGlobalDQPMembers = async (date: string): Promise<string[]> => {
    const entries = await redis.zRange(dqpGlobalKey(date), 0, -1, { by: 'rank' })
    return entries.map((e) => e.member)
}

/** Read all userIds in the per-sub DQP zset for (date, sub) — used by D7 per-sub retention. */
export const readPerSubDQPMembers = async (date: string, subredditId: string): Promise<string[]> => {
    const entries = await redis.zRange(dqpPerSubKey(date, subredditId), 0, -1, { by: 'rank' })
    return entries.map((e) => e.member)
}


// ─── D7 Qualified Retention ───────────────────────────────────────────────────

/**
 * Pure: compute retention from a cohort and a return-day member list.
 *
 * `cohortUsers`     = userIds who qualified on day D
 * `returnedUsers`   = userIds who qualified on the return day
 *
 * Returns the fraction of the cohort that returned, or null if the cohort
 * is empty (we cannot divide by zero, and reporting "0% retention of 0
 * users" is misleading — null lets the UI render "—").
 */
export const computeD7Pure = (
    cohortUsers: readonly string[],
    returnedUsers: readonly string[],
): number | null => {
    if (cohortUsers.length === 0) return null
    const returnedSet = new Set(returnedUsers)
    const intersection = cohortUsers.filter((u) => returnedSet.has(u)).length
    return intersection / cohortUsers.length
}

/**
 * Whether the D7 return window for `cohortDate` has fully closed.
 *
 * The window is "fully closed" when today (UTC) is strictly after
 * cohortDate + 7 — i.e. the D+7 follow-up day has ended and its
 * bounded analytics record is final.
 */
export const isD7WindowClosed = (cohortDate: string, now: Date = new Date()): boolean =>
    todayISO(now) > addDaysISO(cohortDate, 7)

const isReturnWindowClosed = (
    cohortDate: string,
    days: number,
    now: Date = new Date(),
): boolean =>
    todayISO(now) > addDaysISO(cohortDate, days)

export type RetentionEstimate = {
    rate: number | null
    sampleSize: number
    matchedSample: number
    rawRate: number | null
    falsePositiveRate: number
}

const readSampleTokens = async (date: string): Promise<string[]> => {
    const entries = await redis.zRange(dqpSampleKey(date), 0, -1, { by: 'rank' })
    return entries.map((entry) => entry.member)
}

const tokenExistsInFilter = async (date: string, token: string): Promise<boolean> => {
    const commands = filterPositions(token).flatMap((position) => ['get', 'u1', position])
    const values = await runBitfield(dqpFilterKey(date), commands)
    return values.length === DQP_FILTER_HASHES && values.every((value) => value === 1)
}

const readFilterFalsePositiveRate = async (date: string): Promise<number> => {
    const bitsSet = await readCounter(dqpFilterBitsSetKey(date))
    if (bitsSet <= 0) {
        const legacyCount = await redis.zCard(dqpGlobalKey(date))
        return legacyCount > 0 ? 0 : 0
    }
    const fillRate = bitsSet / DQP_FILTER_BITS
    return Math.pow(fillRate, DQP_FILTER_HASHES)
}

const computeLegacyExactRetention = async (
    cohortDate: string,
    days: number,
    subredditId?: string,
): Promise<RetentionEstimate> => {
    const cohort = subredditId === undefined
        ? await readGlobalDQPMembers(cohortDate)
        : await readPerSubDQPMembers(cohortDate, subredditId)
    if (cohort.length === 0) {
        return { rate: null, sampleSize: 0, matchedSample: 0, rawRate: null, falsePositiveRate: 0 }
    }

    const returnUsers = await readGlobalDQPMembers(addDaysISO(cohortDate, days))
    const rate = computeD7Pure(cohort, returnUsers)
    const matchedSample = rate === null ? 0 : Math.round(rate * cohort.length)
    return {
        rate,
        sampleSize: cohort.length,
        matchedSample,
        rawRate: rate,
        falsePositiveRate: 0,
    }
}

const computeRetentionEstimate = async (
    cohortDate: string,
    days: number,
    now: Date,
    minSampleSize: number,
): Promise<RetentionEstimate> => {
    if (!isReturnWindowClosed(cohortDate, days, now)) {
        return { rate: null, sampleSize: 0, matchedSample: 0, rawRate: null, falsePositiveRate: 0 }
    }

    const sampleExists = await redis.zCard(dqpSampleKey(cohortDate))
    if (sampleExists === 0) {
        return computeLegacyExactRetention(cohortDate, days)
    }

    const tokens = await readSampleTokens(cohortDate)
    const returnDate = addDaysISO(cohortDate, days)
    const matchedChecks = await Promise.all(
        tokens.map((token) => tokenExistsInFilter(returnDate, token)),
    )
    const matchedSample = matchedChecks.filter(Boolean).length
    const rawRate = matchedSample / tokens.length
    const falsePositiveRate = await readFilterFalsePositiveRate(returnDate)
    const adjustedRate = falsePositiveRate >= 1
        ? rawRate
        : clampRate((rawRate - falsePositiveRate) / (1 - falsePositiveRate))

    return {
        rate: tokens.length < minSampleSize ? null : adjustedRate,
        sampleSize: tokens.length,
        matchedSample,
        rawRate,
        falsePositiveRate,
    }
}

export const computeGlobalD1RetentionEstimate = async (
    cohortDate: string,
    now: Date = new Date(),
    minSampleSize: number = DQP_RETENTION_MIN_SAMPLE,
): Promise<RetentionEstimate> =>
    computeRetentionEstimate(cohortDate, 1, now, minSampleSize)

/**
 * Compute D7 retention for the global cohort on `cohortDate`.
 *
 * Returns null when:
 *   - the window has not closed yet (would systematically under-report)
 *   - the cohort is empty
 *
 * Otherwise returns a value in [0, 1].
 */
export const computeGlobalD7Retention = async (
    cohortDate: string,
    now: Date = new Date(),
    minSampleSize: number = DQP_RETENTION_MIN_SAMPLE,
): Promise<number | null> => {
    const estimate = await computeGlobalD7RetentionEstimate(cohortDate, now, minSampleSize)
    return estimate.rate
}

export const computeGlobalD7RetentionEstimate = async (
    cohortDate: string,
    now: Date = new Date(),
    minSampleSize: number = DQP_RETENTION_MIN_SAMPLE,
): Promise<RetentionEstimate> =>
    computeRetentionEstimate(cohortDate, 7, now, minSampleSize)

/**
 * Compute D7 retention for a specific subreddit cohort.
 *
 * Legacy fallback for pre-rollout exact per-sub D7. New bounded cohorts
 * return null because exact per-sub retention is no longer a core metric.
 */
export const computePerSubD7Retention = async (
    cohortDate: string,
    subredditId: string,
    now: Date = new Date(),
    minSampleSize: number = DQP_RETENTION_MIN_SAMPLE,
): Promise<number | null> => {
    if (!isD7WindowClosed(cohortDate, now)) return null

    const hasBoundedSample = await redis.zCard(dqpSampleKey(cohortDate))
    if (hasBoundedSample > 0) return null

    const cohort = await readPerSubDQPMembers(cohortDate, subredditId)
    if (cohort.length < minSampleSize) return null
    if (cohort.length === 0) return null

    const returnUsers = await readGlobalDQPMembers(addDaysISO(cohortDate, 7))
    return computeD7Pure(cohort, returnUsers)
}

// ─── Dashboard Summary ──────────────────────────────────────────────────────────

/**
 * Assemble the bounded qualified-engagement summary for the in-app dashboard.
 *
 * Each metric is read from the most recent cohort whose window has matured,
 * so the dashboard never shows a value that is still being collected:
 *   - DQP / play time: yesterday (the last fully-elapsed UTC day)
 *   - D1 retention:    the cohort two days back (its D+1 day has closed)
 *   - D7 retention:    the cohort eight days back (its D+7 day has closed)
 */
export const buildQualifiedSummary = async (
    now: Date = new Date(),
    minSampleSize: number = DQP_RETENTION_MIN_SAMPLE,
): Promise<QualifiedSummary> => {
    const today = todayISO(now)
    const dqpDate = addDaysISO(today, -1)
    const d1Date = addDaysISO(today, -2)
    const d7Date = addDaysISO(today, -8)

    const [dqp, playtime, d1, d7] = await Promise.all([
        readGlobalDQP(dqpDate),
        readQualifiedPlaytime(dqpDate),
        computeGlobalD1RetentionEstimate(d1Date, now, minSampleSize),
        computeGlobalD7RetentionEstimate(d7Date, now, minSampleSize),
    ])

    return {
        dqpDate,
        dqp,
        d1Date,
        d1Retention: d1.rate,
        d1SampleSize: d1.sampleSize,
        d7Date,
        d7Retention: d7.rate,
        d7SampleSize: d7.sampleSize,
        qualifiedSessions: playtime.qualifiedSessions,
        averagePlaySeconds: playtime.averageSeconds,
        playtimeBuckets: playtime.buckets,
    }
}
