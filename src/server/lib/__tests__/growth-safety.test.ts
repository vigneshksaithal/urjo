import { createDevvitTest } from '@devvit/test/server/vitest'
import { describe, expect, it } from 'vitest'

import {
    AUTO_CHALLENGE_DAILY_CAP,
    claimAutoChallengeSlot,
    claimGrowthPostSlot,
    getGrowthPostSlot,
    isGrowthPostSlotEnabled,
} from '../growth-safety'

describe('growth post slots', () => {
    it('maps UTC hours to deterministic r/urjo growth slots', () => {
        expect(getGrowthPostSlot(new Date('2026-06-02T08:00:00Z'))).toBe('speed_window')
        expect(getGrowthPostSlot(new Date('2026-06-02T16:00:00Z'))).toBe('daily_puzzle')
        expect(getGrowthPostSlot(new Date('2026-06-02T23:00:00Z'))).toBe('evening_puzzle')
    })

    it('enables slots according to configured post frequency', () => {
        expect(isGrowthPostSlotEnabled('once_daily', 'daily_puzzle')).toBe(true)
        expect(isGrowthPostSlotEnabled('once_daily', 'speed_window')).toBe(false)
        expect(isGrowthPostSlotEnabled('twice_daily', 'speed_window')).toBe(true)
        expect(isGrowthPostSlotEnabled('twice_daily', 'evening_puzzle')).toBe(false)
        expect(isGrowthPostSlotEnabled('thrice_daily', 'evening_puzzle')).toBe(true)
    })
})

const testGrowthSlot = createDevvitTest({
    userId: 't2_growth',
    subredditId: 't5_urjo',
    subredditName: 'urjo',
})

testGrowthSlot('claimGrowthPostSlot allows one post per subreddit/date/slot', async () => {
    const first = await claimGrowthPostSlot('2026-06-02', 't5_urjo', 'daily_puzzle')
    const second = await claimGrowthPostSlot('2026-06-02', 't5_urjo', 'daily_puzzle')
    const otherSlot = await claimGrowthPostSlot('2026-06-02', 't5_urjo', 'evening_puzzle')

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(otherSlot).toBe(true)
})

const testAutoChallengeCap = createDevvitTest({
    userId: 't2_growth',
    subredditId: 't5_urjo',
    subredditName: 'urjo',
})

testAutoChallengeCap('claimAutoChallengeSlot enforces user and subreddit daily caps', async () => {
    for (let i = 0; i < AUTO_CHALLENGE_DAILY_CAP.perUser; i++) {
        expect(await claimAutoChallengeSlot({
            date: '2026-06-02',
            subredditId: 't5_urjo',
            userId: 't2_player',
        })).toBe(true)
    }

    expect(await claimAutoChallengeSlot({
        date: '2026-06-02',
        subredditId: 't5_urjo',
        userId: 't2_player',
    })).toBe(false)
})
