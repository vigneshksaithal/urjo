/**
 * Tests for the daily honest scorecard.
 *
 * Pure: formatPercent, formatCount, formatScorecardMarkdown shape
 * Redis: buildScorecard end-to-end with seeded DQP / S2R / Reddit QE
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { runWithContext } from '@devvit/web/server'
import { describe, expect, it } from 'vitest'

import {
    buildScorecard,
    formatCount,
    formatPercent,
    formatScorecardMarkdown,
    TOP_N_SUBS,
} from '../lib/scorecard'
import { commitQualifiedUser } from '../lib/qualified'
import { markS2REligible, tryConvertS2R } from '../lib/s2r'
import { storeRedditQEUpload } from '../lib/drift'

const CTX = {
    userId: 't2_scoreuser',
    subredditId: 't5_scoresub',
    subredditName: 'scoresub',
    postId: 't3_scorepost',
}

const withCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithContext(CTX as Parameters<typeof runWithContext>[0], fn)

// ─── Pure ─────────────────────────────────────────────────────────────────────

describe('formatPercent', () => {
    it('renders null and non-finite as "—"', () => {
        expect(formatPercent(null)).toBe('—')
        expect(formatPercent(NaN)).toBe('—')
        expect(formatPercent(Infinity)).toBe('—')
    })

    it('multiplies by 100 with 1 decimal', () => {
        expect(formatPercent(0)).toBe('0.0%')
        expect(formatPercent(0.123)).toBe('12.3%')
        expect(formatPercent(0.5)).toBe('50.0%')
        expect(formatPercent(1)).toBe('100.0%')
    })
})

describe('formatCount', () => {
    it('renders null as "—"', () => {
        expect(formatCount(null)).toBe('—')
    })

    it('uses thousands separator', () => {
        expect(formatCount(0)).toBe('0')
        expect(formatCount(1234)).toBe('1,234')
        expect(formatCount(1234567)).toBe('1,234,567')
    })

    it('rounds fractional values', () => {
        expect(formatCount(99.7)).toBe('100')
    })
})

// ─── End-to-end ───────────────────────────────────────────────────────────────

const test = createDevvitTest(CTX)

test('buildScorecard returns zero-state when nothing is recorded', async () => {
    const data = await withCtx(() => buildScorecard('1999-01-01'))
    expect(data.dqpGlobal).toBe(0)
    expect(data.d7Global).toBe(null)
    expect(data.d7WindowClosed).toBe(true) // 1999 is well past closed
    expect(data.s2rGlobalRate).toBe(null)
    expect(data.perSub).toEqual([])
    expect(data.globalDrift.redditQE).toBe(null)
    expect(data.globalDrift.severity).toBe('none')
})

test('buildScorecard reflects DQP, S2R and drift when seeded', async () => {
    const date = '2026-04-15' // window definitely closed, no fixture conflict

    // Seed DQP: 100 users in t5_alpha, 50 in t5_beta.
    for (let i = 0; i < 100; i++) {
        await withCtx(() => commitQualifiedUser(date, `t2_a_${i}`, 't5_alpha'))
    }
    for (let i = 0; i < 50; i++) {
        await withCtx(() => commitQualifiedUser(date, `t2_b_${i}`, 't5_beta'))
    }

    // Seed S2R: 10 eligible, 4 converted in mid:medium.
    for (let i = 0; i < 10; i++) {
        await withCtx(() =>
            markS2REligible(`s${i}`, date, 5, 'medium', 't2_x', 't3_p1'),
        )
    }
    for (let i = 0; i < 4; i++) {
        await withCtx(() => tryConvertS2R(`s${i}`, 't3_p2'))
    }

    // Seed Reddit QE: matches our DQP exactly.
    await withCtx(() =>
        storeRedditQEUpload({
            date,
            global: 150,
            perSub: { 't5_alpha': 100, 't5_beta': 50 },
        }),
    )

    const data = await withCtx(() => buildScorecard(date))
    expect(data.dqpGlobal).toBe(150)
    expect(data.s2rGlobalEligible).toBe(10)
    expect(data.s2rGlobalConverted).toBe(4)
    expect(data.s2rGlobalRate).toBeCloseTo(0.4)
    expect(data.globalDrift.severity).toBe('none')
    expect(data.globalDrift.driftPct).toBe(0)

    // Markdown render must not crash and must contain the headline numbers.
    const md = formatScorecardMarkdown(data)
    expect(md).toContain('Daily Qualified Players (DQP)')
    expect(md).toContain('150')
    expect(md).toContain('Reddit QE')
})

test('buildScorecard sorts perSub descending by DQP and respects top-N', async () => {
    const date = '2026-04-16'

    // Seed 12 subs with descending DQP: t5_00=12, t5_01=11, ..., t5_11=1.
    for (let s = 0; s < 12; s++) {
        const subId = `t5_${String(s).padStart(2, '0')}`
        const usersInSub = 12 - s
        for (let u = 0; u < usersInSub; u++) {
            await withCtx(() =>
                commitQualifiedUser(date, `t2_${subId}_${u}`, subId),
            )
        }
    }
    // Force the index by uploading QE per sub (which adds them to qe:reddit:_subs
    // but our scorecard uses drift records; so trigger a drift check to populate).
    await withCtx(() =>
        storeRedditQEUpload({
            date,
            global: 78,
            perSub: Object.fromEntries(
                Array.from({ length: 12 }, (_, s) => [
                    `t5_${String(s).padStart(2, '0')}`,
                    Math.max(50, 12 - s), // ensure each sub has its own value, but also ≥ MIN_DRIFT_SAMPLE for some
                ]),
            ),
        }),
    )
    // Importantly: even subs below MIN_DRIFT_SAMPLE get a drift record (with
    // null drift / 'none' severity), so the index will list them.
    const { runDriftCheck } = await import('../lib/drift')
    await withCtx(() => runDriftCheck(date))

    const data = await withCtx(() => buildScorecard(date))

    // Sorted descending by DQP, top entry is t5_00 with 12 DQPs.
    expect(data.perSub.length).toBeGreaterThan(0)
    expect(data.perSub[0]!.subredditId).toBe('t5_00')
    expect(data.perSub[0]!.dqp).toBe(12)

    // Markdown shows top-10 inline + the longtail bucket.
    const md = formatScorecardMarkdown(data)
    expect(md).toContain(`Top-${TOP_N_SUBS} Subreddits`)
    if (data.perSub.length > TOP_N_SUBS) {
        expect(md).toMatch(/longtail/i)
    }
})

test('formatScorecardMarkdown never references the killed "opens" headline', async () => {
    const data = await withCtx(() => buildScorecard('1999-01-01'))
    const md = formatScorecardMarkdown(data)
    // The "opens" word ONLY appears in the explanatory note about the killed metric,
    // never as a headline number. Assert that no header line and no table cell
    // contains "opens" outside the notes section.
    const headerLines = md.split('\n').filter((l) => l.startsWith('| ') || l.startsWith('## '))
    for (const line of headerLines) {
        expect(line.toLowerCase()).not.toContain('opens')
    }
})

test('formatScorecardMarkdown labels open D7 windows with "—" not 0', async () => {
    // Today: window is definitely open.
    const today = new Date().toISOString().split('T')[0] ?? ''
    const data = await withCtx(() => buildScorecard(today))
    const md = formatScorecardMarkdown(data)
    // The D7 row must contain "—".
    const d7Line = md.split('\n').find((l) => l.includes('D7 Retention'))
    expect(d7Line).toBeDefined()
    expect(d7Line!).toContain('—')
})
