import { describe, expect, it } from 'vitest'

import { isCurrentScheduledCompletion } from '../current-day-content'

describe('isCurrentScheduledCompletion', () => {
    const today = '2026-07-15'

    it('accepts a completion made on the date of a scheduled slot', () => {
        expect(isCurrentScheduledCompletion({
            scheduledDate: today,
            scheduledSlotKey: '6x6-1400',
            completionDate: today,
            today,
        })).toBe(true)
    })

    it.each([
        { scheduledDate: null, scheduledSlotKey: null, completionDate: today },
        { scheduledDate: today, scheduledSlotKey: null, completionDate: today },
        { scheduledDate: '2026-07-14', scheduledSlotKey: '6x6-1400', completionDate: today },
        { scheduledDate: today, scheduledSlotKey: '6x6-1400', completionDate: '2026-07-14' },
    ])('rejects unscheduled, stale, and delayed completions: %o', (input) => {
        expect(isCurrentScheduledCompletion({ ...input, today })).toBe(false)
    })
})
