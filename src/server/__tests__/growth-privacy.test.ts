import { redis } from '@devvit/redis'
import { createDevvitTest } from '@devvit/test/server/vitest'
import { expect } from 'vitest'

import { trackVariantOpen } from '../lib/ab-test'
import { deleteUserData } from '../lib/account-deletion'
import {
    trackCompletion,
    trackFirstAction,
} from '../lib/analytics'
import { trackOpen } from '../lib/metrics'
import { addOptIn, tryMarkUserMentioned } from '../lib/notify'
import { captureReferrer } from '../lib/qualified'
import { checkAndAwardReferral } from '../lib/referrals'
import { markS2REligible } from '../lib/s2r'
import { incrementVerifiedSessionRun } from '../lib/server-session-run'
import {
    recordChannelOpen,
    recordCompleter,
    recordSharer,
} from '../lib/viral-tracker'

const USER_ID = 't2_growthprivacy'
const DATE = '2026-07-15'
const POST_ID = 't3_privacypost'

const test = createDevvitTest({
    userId: USER_ID,
    subredditName: 'urjo',
    subredditId: 't5_urjo',
})

const dynamicKeys = async (): Promise<string[]> => {
    const entries = await redis.zRange(`user:${USER_ID}:dynamicKeys`, 0, -1, { by: 'rank' })
    return entries.map(({ member }) => member)
}

const sortedSetMemberships = async (): Promise<string[]> => {
    const entries = await redis.zRange(
        `user:${USER_ID}:sortedSetMemberships`,
        0,
        -1,
        { by: 'rank' },
    )
    return entries.map(({ member }) => member)
}

test('growth writes register every dynamic key that embeds a Reddit user ID', async () => {
    await trackFirstAction(DATE, POST_ID, USER_ID, 't5_urjo')
    await trackOpen(DATE, POST_ID, USER_ID)
    await recordChannelOpen(DATE, 'challenge_post', USER_ID)
    await checkAndAwardReferral(POST_ID, USER_ID, 't2_creator', { newPlayerTotalSolves: 0 })
    await incrementVerifiedSessionRun(USER_ID, 'session_privacy')
    await tryMarkUserMentioned(DATE, USER_ID)
    await trackVariantOpen(DATE, POST_ID, USER_ID, 'A')

    await expect(dynamicKeys()).resolves.toEqual(expect.arrayContaining([
        `analytics:acted:${DATE}:${POST_ID}:${USER_ID}`,
        `metrics:opened:${DATE}:${POST_ID}:${USER_ID}`,
        `viral:dedup:channel_open:${DATE}:challenge_post:${USER_ID}`,
        `referral:${POST_ID}:${USER_ID}`,
        `user:${USER_ID}:session-run:session_privacy`,
        `notify:mentioned:${DATE}:${USER_ID}`,
        `analytics:variant_seen:${DATE}:${POST_ID}:${USER_ID}`,
    ]))
})

test('growth writes register every sorted set that contains a raw Reddit user ID', async () => {
    await trackFirstAction(DATE, POST_ID, USER_ID, 't5_urjo')
    await trackCompletion(DATE, POST_ID, USER_ID, 't5_urjo')
    await recordCompleter(DATE, USER_ID)
    await recordSharer(DATE, USER_ID)
    await addOptIn(USER_ID)

    await expect(sortedSetMemberships()).resolves.toEqual(expect.arrayContaining([
        `analytics:${DATE}:daily_active_engagers`,
        `analytics:${DATE}:completion_users`,
        `viral:${DATE}:completers`,
        `viral:${DATE}:sharers`,
        'notify:optin',
    ]))
})

test('account deletion removes identity keys and memberships written by growth paths', async () => {
    await trackFirstAction(DATE, POST_ID, USER_ID, 't5_urjo')
    await trackCompletion(DATE, POST_ID, USER_ID, 't5_urjo')
    await trackOpen(DATE, POST_ID, USER_ID)
    await recordCompleter(DATE, USER_ID)
    await recordSharer(DATE, USER_ID)
    await recordChannelOpen(DATE, 'challenge_post', USER_ID)
    await addOptIn(USER_ID)

    await deleteUserData(USER_ID)

    expect(await redis.get(`analytics:acted:${DATE}:${POST_ID}:${USER_ID}`)).toBeUndefined()
    expect(await redis.get(`analytics:completed:${POST_ID}:${USER_ID}`)).toBeUndefined()
    expect(await redis.get(`metrics:opened:${DATE}:${POST_ID}:${USER_ID}`)).toBeUndefined()
    expect(await redis.get(`viral:dedup:share:${DATE}:${USER_ID}`)).toBeUndefined()
    expect(await redis.get(`viral:dedup:channel_open:${DATE}:challenge_post:${USER_ID}`)).toBeUndefined()
    expect(await redis.zScore(`analytics:${DATE}:daily_active_engagers`, USER_ID)).toBeUndefined()
    expect(await redis.zScore(`analytics:${DATE}:completion_users`, USER_ID)).toBeUndefined()
    expect(await redis.zScore(`viral:${DATE}:completers`, USER_ID)).toBeUndefined()
    expect(await redis.zScore(`viral:${DATE}:sharers`, USER_ID)).toBeUndefined()
    expect(await redis.zScore('notify:optin', USER_ID)).toBeUndefined()
})

test('measurement session state does not store raw Reddit user IDs', async () => {
    await captureReferrer('session_qe-privacy', USER_ID, 't5_urjo', 'https://reddit.com/r/urjo')
    await markS2REligible(
        'session_s2r-privacy',
        DATE,
        4,
        'medium',
        USER_ID,
        POST_ID,
    )

    const qualifiedSession = await redis.hGetAll('qe:session:session_qe-privacy:flags')
    const s2rSession = await redis.hGetAll('s2r:session:session_s2r-privacy')

    expect(Object.values(qualifiedSession)).not.toContain(USER_ID)
    expect(Object.values(s2rSession)).not.toContain(USER_ID)
})
