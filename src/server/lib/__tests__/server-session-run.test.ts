import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/redis'
import { expect } from 'vitest'

import { incrementVerifiedSessionRun } from '../server-session-run'

const test = createDevvitTest()

test('increments a bounded session run and refreshes its expiry', async () => {
    const first = await incrementVerifiedSessionRun('t2_runner', 'session-123')
    const second = await incrementVerifiedSessionRun('t2_runner', 'session-123')

    expect(first).toBe(1)
    expect(second).toBe(2)
    expect(await redis.expireTime('user:t2_runner:session-run:session-123')).toBeGreaterThan(0)
})

test('returns one without persistence when the session id is absent', async () => {
    const run = await incrementVerifiedSessionRun('t2_runner', null)

    expect(run).toBe(1)
})
