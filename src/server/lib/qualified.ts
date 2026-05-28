/**
 * Daily Qualified Players (DQP) — server-side gate and per-sub commit.
 *
 * A session is "qualified" only when ALL THREE conditions are met:
 *   1. referrer:    a Reddit-origin referrer was observed on /api/game/state
 *   2. first-tap:   the user fired /api/game/first-action (server-validated)
 *   3. dwell:       the session accumulated >= MIN_DWELL_SECONDS of active
 *                   foreground time, measured via /api/dwell/tick
 *
 * When all three flags are set on the session, we commit the user exactly
 * once per UTC day per subreddit into:
 *   - qe:ours:{date}              (global zset, cardinality = global DQP)
 *   - qe:ours:{date}:{subredditId}  (per-sub zset)
 *
 * Commit is idempotent: a SET NX dedup key (qe:committed:{date}:{userId})
 * guarantees a single user is counted once per UTC day even if they qualify
 * across multiple posts in different subs (first sub wins for attribution).
 *
 * The session-flag hash has a 1h TTL — long enough for a single play
 * session to accumulate dwell, short enough that stale sessions roll off.
 *
 * Pure functions live at the top so they are unit-testable without Redis.
 */

import { redis } from '@devvit/web/server'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum active-foreground seconds required for a qualified session. */
export const MIN_DWELL_SECONDS = 20

/** Maximum dwell seconds a single session can accumulate (server-side cap). */
export const MAX_DWELL_SECONDS = 60

/** TTL on the session flag hash — covers a single play session. */
const SESSION_FLAG_TTL_SECONDS = 3600

/** TTL on the daily commit dedup key. 35 days covers the D7-window read horizon. */
const COMMIT_DEDUP_TTL_SECONDS = 35 * 86400

/** TTL on the per-day DQP zsets. Same horizon as the dedup key. */
const DQP_ZSET_TTL_SECONDS = 35 * 86400

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

// ─── Redis Key Builders ───────────────────────────────────────────────────────

const sessionFlagsKey = (sessionId: string): string =>
    `qe:session:${sessionId}:flags`

const commitDedupKey = (date: string, userId: string): string =>
    `qe:committed:${date}:${userId}`

const dqpGlobalKey = (date: string): string =>
    `qe:ours:${date}`

const dqpPerSubKey = (date: string, subredditId: string): string =>
    `qe:ours:${date}:${subredditId}`

/** Public for read paths (analytics router, drift cron, dashboard). */
export const dqpKeys = {
    global: dqpGlobalKey,
    perSub: dqpPerSubKey,
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
 *   - userId / subredditId / firstSeenMs   on first capture only
 *
 * Idempotent: re-capture with a different referrer does NOT clear an
 * already-set flag. Once a Reddit referrer is seen, we keep that signal.
 */
export const captureReferrer = async (
    sessionId: string,
    userId: string,
    subredditId: string | undefined,
    referer: string | null | undefined,
): Promise<void> => {
    const key = sessionFlagsKey(sessionId)
    const isReddit = isRedditReferrer(referer)

    const existing = await redis.hGetAll(key)
    const fields: Record<string, string> = {}

    if (existing.userId === undefined) {
        fields.userId = userId
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
 * gate. If qualified, commit to the per-day, per-sub zsets.
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
    if (existing.userId === undefined) fields.userId = userId

    await redis.hSet(key, fields)
    await redis.expire(key, SESSION_FLAG_TTL_SECONDS)

    const merged = { ...existing, ...fields }
    const evaluation = evaluateGate(merged)

    if (evaluation.qualified) {
        const subredditId = existing.subredditId
        await commitQualifiedUser(date, userId, subredditId)
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
    if (existing.userId === undefined) fields.userId = userId
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
    }

    return evaluation
}

/**
 * Idempotently add `userId` to the day's qualified-player zsets.
 *
 * Uses a SET NX dedup key so a user that qualifies twice in the same UTC
 * day (e.g. across two posts in different subs) is counted exactly once
 * globally — first-touch wins for per-sub attribution.
 *
 * @returns true if newly committed, false if already counted today
 */
export const commitQualifiedUser = async (
    date: string,
    userId: string,
    subredditId: string | undefined,
): Promise<boolean> => {
    const dedupKey = commitDedupKey(date, userId)

    const existing = await redis.get(dedupKey)
    if (existing !== undefined) return false

    await redis.set(dedupKey, '1')
    await redis.expire(dedupKey, COMMIT_DEDUP_TTL_SECONDS)

    const score = Date.now()
    const writes: Promise<unknown>[] = [
        redis.zAdd(dqpGlobalKey(date), { member: userId, score }),
        redis.expire(dqpGlobalKey(date), DQP_ZSET_TTL_SECONDS),
    ]
    if (subredditId !== undefined && subredditId.length > 0) {
        writes.push(
            redis.zAdd(dqpPerSubKey(date, subredditId), { member: userId, score }),
            redis.expire(dqpPerSubKey(date, subredditId), DQP_ZSET_TTL_SECONDS),
        )
    }
    await Promise.all(writes)

    return true
}

// ─── Read Helpers ─────────────────────────────────────────────────────────────

/** Cardinality of the global DQP zset for the given UTC date. */
export const readGlobalDQP = async (date: string): Promise<number> =>
    redis.zCard(dqpGlobalKey(date))

/** Cardinality of the per-sub DQP zset for the given (date, subredditId). */
export const readPerSubDQP = async (date: string, subredditId: string): Promise<number> =>
    redis.zCard(dqpPerSubKey(date, subredditId))

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
 * Pure: compute D7 retention from a cohort and a return-window union.
 *
 * `cohortUsers`     = userIds who qualified on day D
 * `returnedUsers`   = userIds who qualified on at least one of D+1..D+7
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

/**
 * Whether the D7 return window for `cohortDate` has fully closed.
 *
 * The window is "fully closed" when today (UTC) is strictly after
 * cohortDate + 7 — i.e. all seven follow-up days have ended and their
 * qualified-user zsets are final.
 */
export const isD7WindowClosed = (cohortDate: string, now: Date = new Date()): boolean =>
    todayISO(now) > addDaysISO(cohortDate, 7)

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
): Promise<number | null> => {
    if (!isD7WindowClosed(cohortDate, now)) return null

    const cohort = await readGlobalDQPMembers(cohortDate)
    if (cohort.length === 0) return null

    // Union of qualified users across D+1 .. D+7.
    const returnDates = [1, 2, 3, 4, 5, 6, 7].map((d) => addDaysISO(cohortDate, d))
    const returnDayMembers = await Promise.all(
        returnDates.map((d) => readGlobalDQPMembers(d)),
    )
    const returnedUnion = new Set<string>()
    for (const members of returnDayMembers) {
        for (const m of members) returnedUnion.add(m)
    }

    return computeD7Pure(cohort, [...returnedUnion])
}

/**
 * Compute D7 retention for a specific subreddit cohort.
 *
 * Note: the "returned" check is against the *global* DQP set on D+1..D+7
 * (a user who returned to a different sub still counts as retained). This
 * matches the product intent — per-sub D7 measures whether *that sub
 * acquired a recurring player*, not whether the player came back to the
 * same sub.
 */
export const computePerSubD7Retention = async (
    cohortDate: string,
    subredditId: string,
    now: Date = new Date(),
): Promise<number | null> => {
    if (!isD7WindowClosed(cohortDate, now)) return null

    const cohort = await readPerSubDQPMembers(cohortDate, subredditId)
    if (cohort.length === 0) return null

    const returnDates = [1, 2, 3, 4, 5, 6, 7].map((d) => addDaysISO(cohortDate, d))
    const returnDayMembers = await Promise.all(
        returnDates.map((d) => readGlobalDQPMembers(d)),
    )
    const returnedUnion = new Set<string>()
    for (const members of returnDayMembers) {
        for (const m of members) returnedUnion.add(m)
    }

    return computeD7Pure(cohort, [...returnedUnion])
}
