import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/redis'
import { describe, expect, it } from 'vitest'

import {
    computeRewardsStatus,
    ingestRedditQECsv,
    parseRedditQECsv,
    readLatestRewardsStatus,
} from '../rewards'

const REDDIT_QE_CSV = `Date,Qualified Installs,Qualified Engagers,Qualified Engagers (Logged-in),Qualified Engagers (Logged-out),Qualified Engagers (7 day average),Qualified Engagers (7 day average, logged-in),Qualified Engagers (7 day average, logged-out),Qualified Engagers (14 day average),Qualified Engagers (14 day average, logged-in),Qualified Engagers (14 day average, logged-out),Tier Eligibility
2026-06-01,0,2586,2586,0,1742.7,1741.6,1.3,1193.4,1192.4,1.1,Tier 2
2026-05-31,0,2246,2243,3,1489.3,1488.1,1.3,1047.5,1046.5,1.1,Tier 2`

describe('parseRedditQECsv', () => {
    it('parses Reddit QE rows and preserves canonical tier data', () => {
        const rows = parseRedditQECsv(REDDIT_QE_CSV)

        expect(rows).toHaveLength(2)
        expect(rows[0]).toStrictEqual({
            date: '2026-06-01',
            qualifiedInstalls: 0,
            qualifiedEngagers: 2586,
            qualifiedEngagersLoggedIn: 2586,
            qualifiedEngagersLoggedOut: 0,
            qualifiedEngagers7d: 1742.7,
            qualifiedEngagers7dLoggedIn: 1741.6,
            qualifiedEngagers7dLoggedOut: 1.3,
            qualifiedEngagers14d: 1193.4,
            qualifiedEngagers14dLoggedIn: 1192.4,
            qualifiedEngagers14dLoggedOut: 1.1,
            tierEligibility: 'Tier 2',
        })
    })
})

describe('computeRewardsStatus', () => {
    it('computes the Tier 3 gap from Reddit rolling QE', () => {
        const status = computeRewardsStatus({
            date: '2026-06-01',
            qualifiedEngagers: 2586,
            qualifiedEngagers7d: 1742.7,
            tierEligibility: 'Tier 2',
            internalDqp: 2582,
        })

        expect(status.currentTier).toBe(2)
        expect(status.nextTargetTier).toBe(3)
        expect(status.tier3Target).toBe(10000)
        expect(status.gapToTier3).toBeCloseTo(8257.3)
        expect(status.multiplierToTier3).toBeCloseTo(5.7382, 4)
        expect(status.internalVsRedditDrift).toBeCloseTo(0.0015, 4)
    })
})

const testIngest = createDevvitTest({
    userId: 't2_rewards',
    subredditId: 't5_rewards',
    subredditName: 'urjo',
})

testIngest('ingestRedditQECsv stores snapshots and readLatestRewardsStatus returns canonical Reddit status', async () => {
    const result = await ingestRedditQECsv(REDDIT_QE_CSV)

    expect(result.rowsStored).toBe(2)
    expect(result.latest.date).toBe('2026-06-01')

    await redis.zAdd('qe:ours:2026-06-01', { member: 't2_a', score: 1 })
    await redis.zAdd('qe:ours:2026-06-01', { member: 't2_b', score: 2 })

    const status = await readLatestRewardsStatus()

    expect(status?.date).toBe('2026-06-01')
    expect(status?.redditQualifiedEngagers7d).toBe(1742.7)
    expect(status?.canonicalSource).toBe('reddit')
    expect(status?.internalDqp).toBe(2)
    expect(status?.gapToTier3).toBeCloseTo(8257.3)
})
