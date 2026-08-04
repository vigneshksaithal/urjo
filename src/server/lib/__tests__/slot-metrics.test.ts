import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { expect } from 'vitest'

import {
    readScheduledSlotMetrics,
    recordScheduledSlotEvent,
} from '../slot-metrics'

const test = createDevvitTest()
const DATE = '2026-07-15'

test('records raw funnel counts and rates by immutable slot and grid', async () => {
    await redis.hSet('game:t3_slot:meta', {
        scheduledSlotKey: '8x8-2000',
        scheduledGridSize: '8',
    })

    await recordScheduledSlotEvent(DATE, 't3_slot', 'opens')
    await recordScheduledSlotEvent(DATE, 't3_slot', 'opens')
    await recordScheduledSlotEvent(DATE, 't3_slot', 'firstActions')
    await recordScheduledSlotEvent(DATE, 't3_slot', 'completions')

    expect(await readScheduledSlotMetrics(DATE)).toEqual([{
        date: DATE,
        audience: 'signed-in',
        slotKey: '8x8-2000',
        gridSize: 8,
        opens: 2,
        firstActions: 1,
        completions: 1,
        actionRate: 0.5,
        completionRate: 1,
        openToCompletionRate: 0.5,
    }])
})

test('ignores non-scheduled and malformed post dimensions', async () => {
    await redis.hSet('game:t3_normal:meta', { postType: 'urjo-puzzle' })
    await redis.hSet('game:t3_bad:meta', {
        scheduledSlotKey: '../bad',
        scheduledGridSize: '4',
    })

    expect(await recordScheduledSlotEvent(DATE, 't3_normal', 'opens')).toBe(false)
    expect(await recordScheduledSlotEvent(DATE, 't3_bad', 'opens')).toBe(false)
    expect(await readScheduledSlotMetrics(DATE)).toEqual([])
})
