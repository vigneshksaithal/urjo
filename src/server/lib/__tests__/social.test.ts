import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { expect } from 'vitest'

import {
    getSocialStats,
    incrementChallengeBeats,
    incrementChallengesCreated,
    incrementSharesCount,
} from '../social'

const test = createDevvitTest()

test('getSocialStats returns zero counts by default', async () => {
    const stats = await getSocialStats('t2_player')

    expect(stats).toEqual({
        sharesCount: 0,
        challengesCreated: 0,
        challengeBeats: 0,
    })
})

test('increment helpers persist social counters', async () => {
    await incrementSharesCount('t2_player')
    await incrementChallengesCreated('t2_player')
    await incrementChallengesCreated('t2_player')
    await incrementChallengeBeats('t2_player')

    const stats = await getSocialStats('t2_player')
    const raw = await redis.hGetAll('user:t2_player:social')

    expect(stats).toEqual({
        sharesCount: 1,
        challengesCreated: 2,
        challengeBeats: 1,
    })
    expect(raw['sharesCount']).toBe('1')
    expect(raw['challengesCreated']).toBe('2')
    expect(raw['challengeBeats']).toBe('1')
})
