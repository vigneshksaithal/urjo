/**
 * Tests for the simplified metrics module.
 * Covers: opens tracking + dedup, views derivation, play-time aggregation,
 * and getSimpleMetrics composition incl. retention windowing.
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/redis'
import { describe, expect, it } from 'vitest'

import {
    computeViews,
    getSimpleMetrics,
    readPlaytime,
    recordPlaytimeTick,
    trackOpen,
} from '../metrics'
import { trackCompletion, trackFirstAction } from '../analytics'

// ─── computeViews (pure) ──────────────────────────────────────────────────────

describe('computeViews', () => {
    it('returns opens minus first actions', () => {
        expect(computeViews(10, 4)).toBe(6)
    })

    it('floors at 0 when first actions exceed opens', () => {
        expect(computeViews(3, 5)).toBe(0)
    })

    it('returns 0 when there are no opens', () => {
        expect(computeViews(0, 0)).toBe(0)
    })
})

// ─── trackOpen ────────────────────────────────────────────────────────────────

const testOpenIncrement = createDevvitTest()
testOpenIncrement('trackOpen increments the daily opens counter on first open', async () => {
    const isNew = await trackOpen('2026-01-01', 't3_post', 't2_user')
    expect(isNew).toBe(true)
    expect(await redis.get('metrics:2026-01-01:opens')).toBe('1')
})

const testOpenDedup = createDevvitTest()
testOpenDedup('trackOpen dedups repeat opens by the same user on the same post/day', async () => {
    await trackOpen('2026-01-01', 't3_post', 't2_user')
    const second = await trackOpen('2026-01-01', 't3_post', 't2_user')
    expect(second).toBe(false)
    expect(await redis.get('metrics:2026-01-01:opens')).toBe('1')
})

const testOpenDistinct = createDevvitTest()
testOpenDistinct('trackOpen counts distinct users separately', async () => {
    await trackOpen('2026-01-01', 't3_post', 't2_a')
    await trackOpen('2026-01-01', 't3_post', 't2_b')
    expect(await redis.get('metrics:2026-01-01:opens')).toBe('2')
})

// ─── recordPlaytimeTick / readPlaytime ─────────────────────────────────────────

const testPlaytimeAccumulates = createDevvitTest()
testPlaytimeAccumulates('recordPlaytimeTick accumulates seconds and counts the session once', async () => {
    await recordPlaytimeTick('2026-01-01', 'sess-1', 5)
    await recordPlaytimeTick('2026-01-01', 'sess-1', 5)
    const pt = await readPlaytime('2026-01-01')
    expect(pt.totalSeconds).toBe(10)
    expect(pt.sessions).toBe(1)
    expect(pt.averageSeconds).toBe(10)
})

const testPlaytimeMultiSession = createDevvitTest()
testPlaytimeMultiSession('readPlaytime averages across distinct sessions', async () => {
    await recordPlaytimeTick('2026-01-01', 'sess-1', 10)
    for (let i = 0; i < 6; i++) await recordPlaytimeTick('2026-01-01', 'sess-2', 5)
    const pt = await readPlaytime('2026-01-01')
    expect(pt.totalSeconds).toBe(40)
    expect(pt.sessions).toBe(2)
    expect(pt.averageSeconds).toBe(20)
})

const testPlaytimeClamp = createDevvitTest()
testPlaytimeClamp('recordPlaytimeTick clamps an oversized tick', async () => {
    await recordPlaytimeTick('2026-01-01', 'sess-1', 9999)
    const pt = await readPlaytime('2026-01-01')
    expect(pt.totalSeconds).toBe(10)
})

const testPlaytimeEmpty = createDevvitTest()
testPlaytimeEmpty('readPlaytime returns null average when there are no sessions', async () => {
    const pt = await readPlaytime('2026-01-01')
    expect(pt.sessions).toBe(0)
    expect(pt.averageSeconds).toBe(null)
})

// ─── getSimpleMetrics ───────────────────────────────────────────────────────────

const testSimpleComposition = createDevvitTest()
testSimpleComposition('getSimpleMetrics composes opens, views, completions and play time', async () => {
    const date = '2026-01-01'
    await trackOpen(date, 't3_post', 't2_a')
    await trackOpen(date, 't3_post', 't2_b')
    await trackOpen(date, 't3_post', 't2_c')
    await trackFirstAction(date, 't3_post', 't2_a', 't5_sub')
    for (let i = 0; i < 4; i++) await recordPlaytimeTick(date, 'sess-1', 5)

    const m = await getSimpleMetrics(date)
    expect(m.opens).toBe(3)
    expect(m.views).toBe(2) // 3 opens − 1 first action
    expect(m.averagePlaySeconds).toBe(20)
    expect(m.sessions).toBe(1)
})

const testRetentionWindowOpen = createDevvitTest()
testRetentionWindowOpen('getSimpleMetrics returns null retention while the window is open', async () => {
    const today = new Date().toISOString().split('T')[0]!
    const m = await getSimpleMetrics(today)
    expect(m.d1Retention).toBe(null)
    expect(m.d7Retention).toBe(null)
})

const testRetentionClosed = createDevvitTest()
testRetentionClosed('getSimpleMetrics computes completer-cohort D1 retention once the window closed', async () => {
    // Cohort day far in the past so D+1 and D+7 windows are closed.
    const cohort = '2026-01-01'
    const nextDay = '2026-01-02'
    await trackCompletion(cohort, 't3_p1', 't2_returner', 't5_sub')
    await trackCompletion(cohort, 't3_p1', 't2_oneoff', 't5_sub')
    // returner comes back on D+1
    await trackCompletion(nextDay, 't3_p2', 't2_returner', 't5_sub')

    const m = await getSimpleMetrics(cohort)
    expect(m.d1Retention).toBe(0.5)
})
