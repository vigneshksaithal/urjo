import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { expect } from 'vitest'

import {
    recordChannelConversion,
    recordChannelOpen,
} from '../viral-tracker'

const testChannelOpenDedup = createDevvitTest({ userId: 't2_testuser' })

testChannelOpenDedup('recordChannelOpen counts one open per user/channel/day', async () => {
    const first = await recordChannelOpen('2025-01-15', 'challenge_post', 't2_newbie')
    const second = await recordChannelOpen('2025-01-15', 'challenge_post', 't2_newbie')
    const third = await recordChannelOpen('2025-01-15', 'challenge_post', 't2_other')

    const opens = await redis.get('viral:2025-01-15:channel:challenge_post:opens')

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(third).toBe(true)
    expect(opens).toBe('2')
})

const testChannelConversionDedup = createDevvitTest({ userId: 't2_testuser' })

testChannelConversionDedup('recordChannelConversion counts one conversion per attributed user', async () => {
    const first = await recordChannelConversion('2025-01-15', 'challenge_post', 't2_newbie')
    const second = await recordChannelConversion('2025-01-16', 'challenge_post', 't2_newbie')

    const dayOneConversions = await redis.get('viral:2025-01-15:channel:challenge_post:conversions')
    const dayTwoConversions = await redis.get('viral:2025-01-16:channel:challenge_post:conversions')

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(dayOneConversions).toBe('1')
    expect(dayTwoConversions).toBeUndefined()
})
