/**
 * Honest Daily Scorecard.
 *
 * Replaces the old "Urjo Analytics" report — which over-reported "opens"
 * 10–40× vs Reddit's Qualified Engagers — with a tight retention-loop scorecard
 * built from bounded server-validated DQP, D1/D7 retention estimates, and
 * Second-Puzzle Rate, plus the most recent drift snapshot.
 *
 * Design doc reference: §A (North Star), §B (Scorecard), §I (Drift).
 *
 * The output is markdown safe to post under the daily-puzzle sticky
 * comment. Format is deliberately conservative — values that aren't yet
 * computable (D7 window open, S2R denominator zero) render as "—" rather
 * than 0, so the report can never be cited as "we have 0% retention" by
 * a skeptical mod.
 */

import { redis } from '@devvit/web/server'

import {
    computeGlobalD1RetentionEstimate,
    computeGlobalD7RetentionEstimate,
    isD7WindowClosed,
    readGlobalDQP,
    readPerSubDQP,
} from './qualified'
import { readS2RAllBuckets, readS2RGlobal, type S2RBucketSnapshot } from './s2r'
import {
    classifyDrift,
    computeDrift,
    readDriftRecords,
    readRedditQEGlobal,
    type DriftRecord,
} from './drift'

// ─── Pure: number formatting ──────────────────────────────────────────────────

/**
 * Format a percentage with 1 decimal place. Renders null as "—".
 * Pure — fully unit-testable.
 */
export const formatPercent = (value: number | null): string => {
    if (value === null || !Number.isFinite(value)) return '—'
    return `${(value * 100).toFixed(1)}%`
}

/** Format a count with thousands separator. Renders null as "—". */
export const formatCount = (value: number | null): string => {
    if (value === null || !Number.isFinite(value)) return '—'
    return Math.round(value).toLocaleString('en-US')
}

const dateLabel = (iso: string): string => iso // keep ISO; no locale shenanigans

const addDaysISO = (date: string, days: number): string => {
    const d = new Date(`${date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    const iso = d.toISOString().split('T')[0]
    if (iso === undefined) throw new Error(`failed to add ${days}d to ${date}`)
    return iso
}

// ─── Data Shape ───────────────────────────────────────────────────────────────

export type SubScorecardRow = {
    subredditId: string
    dqp: number
    /** Drift severity if a record exists for this sub on this date. */
    driftSeverity: DriftRecord['severity'] | null
    driftPct: number | null
}

export type ScorecardData = {
    /** UTC date the scorecard reflects (typically yesterday from the cron). */
    date: string
    /** Global DQP for that date. */
    dqpGlobal: number
    /** DQP is estimated from a bounded daily membership filter. */
    dqpEstimated: true
    /** Retention is estimated from the bounded cohort sample. */
    retentionEstimated: true
    /** Global exact-day D1 retention for that date. Null when window is open or sample too small. */
    d1Global: number | null
    /** Sample size used for D1. */
    d1SampleSize: number
    /** Global D7 retention for that date. Null when window is open. */
    d7Global: number | null
    /** Sample size used for D7. */
    d7SampleSize: number
    /** Whether the D7 window has closed for `date`. */
    d7WindowClosed: boolean
    /** Global S2R rate (across all buckets). */
    s2rGlobalRate: number | null
    /** Eligible / converted counts (for footnoting denominator). */
    s2rGlobalEligible: number
    s2rGlobalConverted: number
    /** Per-bucket S2R snapshots. */
    s2rByBucket: readonly S2RBucketSnapshot[]
    /** Per-sub rollup, sorted by DQP descending. Caller chooses Top-N. */
    perSub: readonly SubScorecardRow[]
    /** Drift snapshot for the date — global record, or null if none. */
    globalDrift: {
        redditQE: number | null
        ourDQP: number
        driftPct: number | null
        severity: DriftRecord['severity']
    }
}

// ─── Build ────────────────────────────────────────────────────────────────────

/**
 * Top-N subreddits to report. Per design doc §A, scalar-only rollup is
 * banned — we must always show breakdowns alongside totals.
 */
export const TOP_N_SUBS = 10

const dqpPerSubIndexKey = (date: string): string => `qe:ours:${date}:_subs`

/**
 * Maintain a small index of subredditIds known to have committed DQPs on
 * a date. This is populated lazily by `buildScorecard` from the drift
 * records and from explicit per-sub QE uploads (those are the subs we
 * have ground truth for). For Day 1 we keep it simple: read drift
 * records for the date, extract scope ≠ '_global', that's our list.
 */
const knownSubsForDate = async (date: string): Promise<string[]> => {
    // Try the index zset first (populated by future write paths).
    const indexed = await redis.zRange(dqpPerSubIndexKey(date), 0, -1, { by: 'rank' })
    if (indexed.length > 0) return indexed.map((e) => e.member)

    // Fallback: any scope ≠ '_global' that has a drift record.
    const records = await readDriftRecords(date)
    return records
        .filter((r) => r.scope !== '_global' && r.scope.startsWith('t5_'))
        .map((r) => r.scope)
}

/**
 * Build the full scorecard data for a UTC date. Pure-ish: reads from
 * Redis, writes nothing.
 */
export const buildScorecard = async (date: string): Promise<ScorecardData> => {
    const [
        dqpGlobal,
        d1Estimate,
        d7Estimate,
        s2rGlobal,
        s2rByBucket,
        redditQEGlobal,
        driftRecords,
        knownSubs,
    ] = await Promise.all([
        readGlobalDQP(date),
        computeGlobalD1RetentionEstimate(date),
        computeGlobalD7RetentionEstimate(date),
        readS2RGlobal(date),
        readS2RAllBuckets(date),
        readRedditQEGlobal(date),
        readDriftRecords(date),
        knownSubsForDate(date),
    ])

    // Per-sub rollup.
    const driftBySub = new Map(driftRecords.map((r) => [r.scope, r]))
    const perSubRowsRaw = await Promise.all(
        knownSubs.map(async (subredditId): Promise<SubScorecardRow> => {
            const dqp = await readPerSubDQP(date, subredditId)
            const drift = driftBySub.get(subredditId)
            return {
                subredditId,
                dqp,
                driftSeverity: drift?.severity ?? null,
                driftPct: drift?.drift ?? null,
            }
        }),
    )

    const perSub = [...perSubRowsRaw].sort((a, b) => b.dqp - a.dqp)

    // Global drift recomputed from current numbers (drift records may be stale).
    const globalDrift = (() => {
        if (redditQEGlobal === null) {
            return {
                redditQE: null,
                ourDQP: dqpGlobal,
                driftPct: null,
                severity: 'none' as const,
            }
        }
        const d = computeDrift(dqpGlobal, redditQEGlobal)
        return {
            redditQE: redditQEGlobal,
            ourDQP: dqpGlobal,
            driftPct: d,
            severity: d === null ? ('none' as const) : classifyDrift(d).severity,
        }
    })()

    return {
        date,
        dqpGlobal,
        dqpEstimated: true,
        retentionEstimated: true,
        d1Global: d1Estimate.rate,
        d1SampleSize: d1Estimate.sampleSize,
        d7Global: d7Estimate.rate,
        d7SampleSize: d7Estimate.sampleSize,
        d7WindowClosed: isD7WindowClosed(date),
        s2rGlobalRate: s2rGlobal.rate,
        s2rGlobalEligible: s2rGlobal.eligible,
        s2rGlobalConverted: s2rGlobal.converted,
        s2rByBucket,
        perSub,
        globalDrift,
    }
}

// ─── Format ───────────────────────────────────────────────────────────────────

/**
 * Render the scorecard as a Reddit-safe markdown string.
 *
 * Design constraints:
 *   - Every metric ties to a decision (per design doc §B).
 *   - Per-sub rollup is shown alongside the global so a mod can never
 *     read just the rollup (per §A: "scalar rollup never alone").
 *   - Open windows render as "—" with an explicit footnote.
 */
export const formatScorecardMarkdown = (data: ScorecardData): string => {
    const lines: string[] = []

    lines.push(`# Urjo Daily Scorecard — ${dateLabel(data.date)}`)
    lines.push('')
    lines.push('Retention loop metrics. One alert. Each one ties to a decision.')
    lines.push('')

    // ── Headline ──────────────────────────────────────────────────────────────
    lines.push('## Headline')
    lines.push('')
    lines.push('| Metric | Value | Window |')
    lines.push('|---|---|---|')
    lines.push(`| Daily Qualified Players (DQP, estimated) | ${formatCount(data.dqpGlobal)} | ${dateLabel(data.date)} |`)
    lines.push(
        `| Qualified D1 Retention (estimated) | ${formatPercent(data.d1Global)} | sample ${formatCount(data.d1SampleSize)} · cohort ${dateLabel(data.date)} → ${dateLabel(addDaysISO(data.date, 1))} |`,
    )
    lines.push(
        `| Qualified D7 Retention (estimated) | ${formatPercent(data.d7Global)} | ${data.d7WindowClosed
            ? `sample ${formatCount(data.d7SampleSize)} · cohort ${dateLabel(data.date)} → ${dateLabel(addDaysISO(data.date, 7))}`
            : `sample ${formatCount(data.d7SampleSize)} · cohort ${dateLabel(data.date)} (window open until ${dateLabel(addDaysISO(data.date, 8))})`
        } |`,
    )
    lines.push(
        `| Second-Puzzle Rate (S2R) | ${formatPercent(data.s2rGlobalRate)} | ${data.s2rGlobalConverted}/${data.s2rGlobalEligible} eligible completions |`,
    )
    lines.push('')

    // ── Reconciliation against Reddit QE ──────────────────────────────────────
    lines.push('## Reddit QE Reconciliation')
    lines.push('')
    if (data.globalDrift.redditQE === null) {
        lines.push('No Reddit QE upload recorded for this date — drift not computable.')
    } else {
        lines.push('| Scope | DQP (ours) | Reddit QE | Drift | Severity |')
        lines.push('|---|---|---|---|---|')
        lines.push(
            `| Global | ${formatCount(data.globalDrift.ourDQP)} | ${formatCount(data.globalDrift.redditQE)} | ${formatPercent(data.globalDrift.driftPct)} | ${data.globalDrift.severity.toUpperCase()} |`,
        )
        for (const sub of data.perSub.slice(0, TOP_N_SUBS)) {
            if (sub.driftPct === null && sub.driftSeverity === null) continue
            lines.push(
                `| ${sub.subredditId} | ${formatCount(sub.dqp)} | — | ${formatPercent(sub.driftPct)} | ${(sub.driftSeverity ?? 'none').toUpperCase()} |`,
            )
        }
    }
    lines.push('')

    // ── Per-sub vector (no scalar-only rollup) ────────────────────────────────
    lines.push(`## Top-${TOP_N_SUBS} Subreddits`)
    lines.push('')
    if (data.perSub.length === 0) {
        lines.push('_No per-sub data yet — DQP is being collected but no subreddit index has been populated._')
    } else {
        lines.push('| Subreddit | DQP |')
        lines.push('|---|---|')
        for (const sub of data.perSub.slice(0, TOP_N_SUBS)) {
            lines.push(`| ${sub.subredditId} | ${formatCount(sub.dqp)} |`)
        }
        const longTail = data.perSub.slice(TOP_N_SUBS)
        if (longTail.length > 0) {
            const longTailDQP = longTail.reduce((sum, s) => sum + s.dqp, 0)
            lines.push(`| _longtail (${longTail.length} subs)_ | ${formatCount(longTailDQP)} |`)
        }
    }
    lines.push('')

    // ── S2R bucket breakdown ──────────────────────────────────────────────────
    const bucketsWithData = data.s2rByBucket.filter((b) => b.eligible > 0)
    if (bucketsWithData.length > 0) {
        lines.push('## S2R by (Skill × Difficulty)')
        lines.push('')
        lines.push('| Bucket | Eligible | Converted | Rate |')
        lines.push('|---|---|---|---|')
        for (const b of bucketsWithData) {
            lines.push(`| ${b.bucket} | ${b.eligible} | ${b.converted} | ${formatPercent(b.rate)} |`)
        }
        lines.push('')
    }

    // ── Notes ─────────────────────────────────────────────────────────────────
    lines.push('## Notes')
    lines.push('')
    lines.push('- **DQP** = estimated unique users who in one UTC day had a Reddit referrer, tapped a cell, and stayed ≥20s active-foreground. It uses a bounded daily membership filter, not full user sets.')
    lines.push('- **D1/D7 Retention** = estimated % of sampled DQPs on the cohort day who returned as DQP exactly 1 or 7 days later. "—" when the window is open or sample is too small.')
    lines.push('- **S2R** = of users who completed puzzle #1 in a session, % who started puzzle #2 within 60s. "—" when no completions.')
    lines.push('- _The previously published "opens" metric counted webview mounts before any human interaction. It is no longer reported._')

    return lines.join('\n')
}
