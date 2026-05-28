/**
 * Reddit QE Drift Detection.
 *
 * Reddit's "Qualified Engagers" is the canonical ledger we get judged on.
 * Our internal DQP is a leading indicator that must reconcile to it. This
 * module owns:
 *   - persistence of mod-uploaded Reddit QE numbers (since there's no
 *     public Reddit API for the metric, a moderator pastes it in)
 *   - per-sub drift computation (|DQP − QE| / QE)
 *   - severity tiering (none / slack / P2 / P1) per the design doc §I
 *   - structured alert records readable by a webhook or dashboard
 *
 * Severity bands (from the metrics design doc):
 *   <10%       no action
 *   10-25%     SLACK ticket — freeze experiments in that sub
 *   >25%       P2 page — Raj investigates within 24h
 *   >50%       P1 page — Raj + Priya, roadmap freeze
 *
 * "Deploy-correlated" auto-elevation is left as a TODO: it requires a
 * deploy log we don't currently emit. Documented in §K of the design doc.
 */

import { redis } from '@devvit/web/server'

import { dqpKeys, readGlobalDQP, readPerSubDQP } from './qualified'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum sample size below which drift is not actionable. */
export const MIN_DRIFT_SAMPLE = 50

/** Number of top subs to evaluate for drift. */
export const DRIFT_TOP_N = 10

/** TTLs */
const QE_TTL_SECONDS = 90 * 86400
const DRIFT_RECORD_TTL_SECONDS = 90 * 86400

// ─── Pure: severity tiering ───────────────────────────────────────────────────

export type DriftSeverity = 'none' | 'slack' | 'p2' | 'p1'

export type DriftBand = {
    severity: DriftSeverity
    label: string
    /** Minimum drift fraction (inclusive) for this band. */
    minDrift: number
    /** Optional max drift fraction (exclusive) — null means "to infinity". */
    maxDrift: number | null
}

export const DRIFT_BANDS: readonly DriftBand[] = [
    { severity: 'p1', label: 'P1: drift > 50% — page Raj + Priya, freeze roadmap', minDrift: 0.50, maxDrift: null },
    { severity: 'p2', label: 'P2: drift > 25% — page Raj, investigate within 24h', minDrift: 0.25, maxDrift: 0.50 },
    { severity: 'slack', label: 'SLACK: drift 10-25% — freeze experiments in this sub', minDrift: 0.10, maxDrift: 0.25 },
    { severity: 'none', label: 'OK: drift < 10%', minDrift: 0, maxDrift: 0.10 },
] as const

/**
 * Pure: classify a drift fraction into a severity band.
 * Drift can be NaN/Infinity if QE is 0 — those callers should pre-check
 * and skip; we still defend by treating non-finite as 'none'.
 */
export const classifyDrift = (drift: number): DriftBand => {
    if (!Number.isFinite(drift)) {
        return DRIFT_BANDS.find((b) => b.severity === 'none')!
    }
    const abs = Math.abs(drift)
    for (const band of DRIFT_BANDS) {
        const aboveMin = abs >= band.minDrift
        const belowMax = band.maxDrift === null || abs < band.maxDrift
        if (aboveMin && belowMax) return band
    }
    return DRIFT_BANDS[DRIFT_BANDS.length - 1]!
}

/**
 * Pure: compute drift fraction.
 *
 * Returns:
 *   - null when redditQE is below MIN_DRIFT_SAMPLE (sample too small to
 *     act on; reporting drift on tiny populations leads to false alarms)
 *   - the absolute drift fraction otherwise
 */
export const computeDrift = (
    ourDQP: number,
    redditQE: number,
    minSample: number = MIN_DRIFT_SAMPLE,
): number | null => {
    if (redditQE < minSample) return null
    return Math.abs(ourDQP - redditQE) / redditQE
}

// ─── Redis Keys ───────────────────────────────────────────────────────────────

const qeGlobalKey = (date: string): string => `qe:reddit:${date}`
const qePerSubKey = (date: string, subredditId: string): string =>
    `qe:reddit:${date}:${subredditId}`
const qeUploadedSubsKey = (date: string): string =>
    `qe:reddit:${date}:_subs`
const driftRecordKey = (date: string, subredditId: string): string =>
    `drift:${date}:${subredditId}`
const driftIndexKey = (date: string): string =>
    `drift:${date}:_index`

// ─── Upload (called by /api/admin/qe/upload) ──────────────────────────────────

export type RedditQEUpload = {
    /** UTC date the QE numbers cover (YYYY-MM-DD). */
    date: string
    /** Global qualified-engager count Reddit reported for the day. */
    global: number
    /** Per-subreddit breakdown, keyed by subredditId (t5_*). Optional. */
    perSub?: Record<string, number>
}

export type RedditQEUploadResult = {
    date: string
    globalStored: number
    perSubStored: number
}

const isPositiveInt = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 && Number.isInteger(n)

const isISODate = (s: unknown): s is string =>
    typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/**
 * Validate an upload payload. Returns null if valid; an error message
 * otherwise. Pure — testable without Redis.
 */
export const validateRedditQEUpload = (payload: unknown): string | null => {
    if (payload === null || typeof payload !== 'object') return 'Payload must be an object'
    const p = payload as Record<string, unknown>
    if (!isISODate(p.date)) return 'date must be YYYY-MM-DD'
    if (!isPositiveInt(p.global)) return 'global must be a non-negative integer'
    if (p.perSub !== undefined) {
        if (typeof p.perSub !== 'object' || p.perSub === null) {
            return 'perSub must be an object keyed by subredditId'
        }
        for (const [subId, count] of Object.entries(p.perSub)) {
            if (!subId.startsWith('t5_')) return `perSub key '${subId}' must start with t5_`
            if (!isPositiveInt(count)) return `perSub.${subId} must be a non-negative integer`
        }
    }
    return null
}

/**
 * Persist a Reddit QE upload. Overwrites any prior value for the same
 * (date) — late-arriving Reddit reports fully replace earlier ones.
 */
export const storeRedditQEUpload = async (
    upload: RedditQEUpload,
): Promise<RedditQEUploadResult> => {
    await redis.set(qeGlobalKey(upload.date), upload.global.toString())
    await redis.expire(qeGlobalKey(upload.date), QE_TTL_SECONDS)

    const perSub = upload.perSub ?? {}
    const writes: Promise<unknown>[] = []
    const subIds: string[] = []
    for (const [subId, count] of Object.entries(perSub)) {
        writes.push(redis.set(qePerSubKey(upload.date, subId), count.toString()))
        writes.push(redis.expire(qePerSubKey(upload.date, subId), QE_TTL_SECONDS))
        writes.push(redis.zAdd(qeUploadedSubsKey(upload.date), { member: subId, score: Date.now() }))
        subIds.push(subId)
    }
    if (writes.length > 0) {
        await redis.expire(qeUploadedSubsKey(upload.date), QE_TTL_SECONDS)
        await Promise.all(writes)
    }

    return {
        date: upload.date,
        globalStored: upload.global,
        perSubStored: subIds.length,
    }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

const readCounter = async (key: string): Promise<number | null> => {
    const raw = await redis.get(key)
    if (raw === undefined) return null
    const parsed = parseInt(raw, 10)
    return Number.isNaN(parsed) ? null : parsed
}

export const readRedditQEGlobal = async (date: string): Promise<number | null> =>
    readCounter(qeGlobalKey(date))

export const readRedditQEPerSub = async (
    date: string,
    subredditId: string,
): Promise<number | null> => readCounter(qePerSubKey(date, subredditId))

const readUploadedSubs = async (date: string): Promise<string[]> => {
    const entries = await redis.zRange(qeUploadedSubsKey(date), 0, -1, { by: 'rank' })
    return entries.map((e) => e.member)
}

// ─── Drift evaluation ─────────────────────────────────────────────────────────

export type DriftRecord = {
    date: string
    /** '_global' for the global drift, otherwise a t5_* subredditId. */
    scope: string
    ourDQP: number
    redditQE: number
    /** Null when sample below MIN_DRIFT_SAMPLE — record is still written. */
    drift: number | null
    severity: DriftSeverity
    severityLabel: string
    computedAtMs: number
}

const buildDriftRecord = (
    date: string,
    scope: string,
    ourDQP: number,
    redditQE: number,
): DriftRecord => {
    const drift = computeDrift(ourDQP, redditQE)
    const band = drift === null
        ? DRIFT_BANDS.find((b) => b.severity === 'none')!
        : classifyDrift(drift)
    return {
        date,
        scope,
        ourDQP,
        redditQE,
        drift,
        severity: drift === null ? 'none' : band.severity,
        severityLabel: drift === null
            ? `OK: sample below ${MIN_DRIFT_SAMPLE} — drift not actionable`
            : band.label,
        computedAtMs: Date.now(),
    }
}

/**
 * Run a drift check for `date`. Returns all drift records (one per scope)
 * and persists them so a future read or dashboard can replay them.
 *
 * The cron entry-point (see /internal/scheduler/drift-check) calls this
 * with `yesterday` and emits structured logs for any non-'none' severity.
 */
export const runDriftCheck = async (date: string): Promise<DriftRecord[]> => {
    const [globalQE, ourGlobal, uploadedSubs] = await Promise.all([
        readRedditQEGlobal(date),
        readGlobalDQP(date),
        readUploadedSubs(date),
    ])

    const records: DriftRecord[] = []

    if (globalQE !== null) {
        records.push(buildDriftRecord(date, '_global', ourGlobal, globalQE))
    }

    // Top-N subs: rank by mod-uploaded QE descending.
    const subQEs: Array<{ subId: string; qe: number }> = []
    for (const subId of uploadedSubs) {
        const qe = await readRedditQEPerSub(date, subId)
        if (qe !== null) subQEs.push({ subId, qe })
    }
    subQEs.sort((a, b) => b.qe - a.qe)

    const topSubs = subQEs.slice(0, DRIFT_TOP_N)
    for (const { subId, qe } of topSubs) {
        const ours = await readPerSubDQP(date, subId)
        records.push(buildDriftRecord(date, subId, ours, qe))
    }

    // Persist records and an index for downstream readers.
    const writes: Promise<unknown>[] = []
    for (const rec of records) {
        const key = driftRecordKey(rec.date, rec.scope)
        writes.push(redis.set(key, JSON.stringify(rec)))
        writes.push(redis.expire(key, DRIFT_RECORD_TTL_SECONDS))
        writes.push(redis.zAdd(driftIndexKey(rec.date), { member: rec.scope, score: rec.computedAtMs }))
    }
    if (writes.length > 0) {
        writes.push(redis.expire(driftIndexKey(date), DRIFT_RECORD_TTL_SECONDS))
        await Promise.all(writes)
    }

    return records
}

/** Read all persisted drift records for a date. */
export const readDriftRecords = async (date: string): Promise<DriftRecord[]> => {
    const indexEntries = await redis.zRange(driftIndexKey(date), 0, -1, { by: 'rank' })
    const scopes = indexEntries.map((e) => e.member)
    const records = await Promise.all(
        scopes.map(async (scope) => {
            const raw = await redis.get(driftRecordKey(date, scope))
            if (raw === undefined) return null
            try {
                return JSON.parse(raw) as DriftRecord
            } catch {
                return null
            }
        }),
    )
    return records.filter((r): r is DriftRecord => r !== null)
}

/**
 * Pretty-print a drift record for log emission. Webhooks (PagerDuty,
 * Slack) parse these lines via a simple regex; keep the format stable.
 */
export const formatDriftLogLine = (rec: DriftRecord): string => {
    const driftStr = rec.drift === null ? 'n/a' : `${(rec.drift * 100).toFixed(1)}%`
    return `[DRIFT] ${rec.severity.toUpperCase()} date=${rec.date} scope=${rec.scope} dqp=${rec.ourDQP} redditQE=${rec.redditQE} drift=${driftStr} :: ${rec.severityLabel}`
}

// Re-export the qualified key builders so the drift cron can be tested
// without re-wiring imports.
export const _internalKeysForTest = { dqpKeys } as const
