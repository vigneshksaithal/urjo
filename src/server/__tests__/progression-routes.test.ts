import { redis } from '@devvit/redis'
import { createDevvitTest } from '@devvit/test/server/vitest'
import { runWithContext } from '@devvit/web/server'
import { expect } from 'vitest'

import { getCurrentSeason } from '../lib/seasons'
import { getTodayUTC } from '../lib/helpers'
import { progressionRouter } from '../routes/progression'

const USER_ID = 't2_progression'

type Mission = {
    id: string
    rewardCoins: number
    completed: boolean
    claimed: boolean
}

type Snapshot = {
    coins: number
    streak: { current: number; longest: number; freezes: number }
    path: { level: number; gridLevels: Record<string, number> }
    season: { rank: number | null; points: number }
    missions: Mission[]
}

const request = (path: string, init?: RequestInit): Promise<Response> =>
    progressionRouter.request(path, init)

const seedCompletedProgress = async (): Promise<void> => {
    const date = getTodayUTC()
    const season = getCurrentSeason()

    await Promise.all([
        redis.set(`user:${USER_ID}:seasonSolves:${date}`, '10'),
        redis.set(`user:${USER_ID}:streak:current`, '100'),
        redis.set(`user:${USER_ID}:streak:longest`, '120'),
        redis.set(`user:${USER_ID}:pathLevel`, '14'),
        redis.set(`user:${USER_ID}:skillLevel:4`, '3'),
        redis.set(`user:${USER_ID}:skillLevel:6`, '4'),
        redis.set(`user:${USER_ID}:skillLevel:8`, '2'),
        redis.hSet(`user:${USER_ID}:economy`, { coins: '50', totalCoins: '80', streakFreezes: '1' }),
        redis.zAdd(`season:${season.seasonId}:leaderboard`, { member: USER_ID, score: 200 }),
        redis.zAdd(`season:${season.seasonId}:leaderboard`, { member: 't2_ahead', score: 300 }),
        redis.zAdd(`leaderboard:speed:${date}:4`, { member: USER_ID, score: 80 }),
        redis.zAdd(`leaderboard:speed:${date}:6`, { member: USER_ID, score: 90 }),
        redis.zAdd(`leaderboard:speed:${date}:8`, { member: USER_ID, score: 120 }),
    ])
}

const test = createDevvitTest({ userId: USER_ID, subredditName: 'urjo' })

test('GET /api/progression aggregates existing verified progression state', async () => {
    await seedCompletedProgress()

    const response = await request('/api/progression')
    const body = await response.json() as { status: string; data: Snapshot }

    expect(response.status).toBe(200)
    expect(body.status).toBe('success')
    expect(body.data.streak).toEqual({ current: 100, longest: 120, freezes: 1 })
    expect(body.data.path).toEqual({ level: 14, gridLevels: { 4: 3, 6: 4, 8: 2 } })
    expect(body.data.season).toMatchObject({ rank: 2, points: 200 })
    expect(body.data.missions).toHaveLength(3)
    expect(body.data.missions.every((mission) => mission.completed)).toBe(true)
    expect(body.data.missions.some((mission) => mission.id === 'daily_grid_4')).toBe(false)
})

test('POST /api/progression/claim-mission rejects an incomplete mission', async () => {
    const snapshotResponse = await request('/api/progression')
    const snapshotBody = await snapshotResponse.json() as { data: Snapshot }
    const mission = snapshotBody.data.missions[0]
    expect(mission).toBeDefined()

    const response = await request('/api/progression/claim-mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId: mission!.id }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
        status: 'error',
        message: 'Complete this mission before claiming its reward',
    })
})

test('POST /api/progression/claim-mission awards existing coins exactly once', async () => {
    await seedCompletedProgress()
    const snapshotResponse = await request('/api/progression')
    const snapshotBody = await snapshotResponse.json() as { data: Snapshot }
    const mission = snapshotBody.data.missions[0]
    expect(mission).toBeDefined()

    const claim = (): Promise<Response> => request('/api/progression/claim-mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId: mission!.id }),
    })

    const first = await claim()
    const second = await claim()
    const firstBody = await first.json() as { data: { alreadyClaimed: boolean } }
    const secondBody = await second.json() as { data: { alreadyClaimed: boolean } }

    expect(first.status).toBe(200)
    expect(firstBody.data.alreadyClaimed).toBe(false)
    expect(second.status).toBe(200)
    expect(secondBody.data.alreadyClaimed).toBe(true)
    expect(await redis.hGet(`user:${USER_ID}:economy`, 'coins')).toBe(String(50 + mission!.rewardCoins))
    expect(await redis.hGet(`user:${USER_ID}:economy`, 'totalCoins')).toBe(String(80 + mission!.rewardCoins))
    expect(await redis.expireTime(`user:${USER_ID}:missions:${getTodayUTC()}`)).toBeGreaterThan(0)
    expect(
        await redis.zScore(
            `user:${USER_ID}:dynamicKeys`,
            `user:${USER_ID}:missions:${getTodayUTC()}`,
        ),
    ).toBeDefined()
})

test('POST /api/progression/claim-mission validates the mission id', async () => {
    const response = await request('/api/progression/claim-mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId: 'unknown:mission' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
        status: 'error',
        message: 'Invalid mission',
    })
})

test('GET /api/progression requires a logged-in user', async () => {
    const response = await runWithContext(
        { subredditName: 'urjo' },
        () => request('/api/progression'),
    )

    expect(response.status).toBe(400)
})

test('GET /api/progression normalizes invalid stored counters', async () => {
    await Promise.all([
        redis.hSet(`user:${USER_ID}:economy`, { coins: 'not-a-number', streakFreezes: '-3' }),
        redis.set(`user:${USER_ID}:streak:current`, 'invalid'),
        redis.set(`user:${USER_ID}:streak:longest`, '-8'),
        redis.set(`user:${USER_ID}:skillLevel:4`, 'invalid'),
        redis.set(`user:${USER_ID}:skillLevel:6`, '-2'),
    ])

    const response = await request('/api/progression')
    const body = await response.json() as { data: Snapshot }

    expect(body.data.coins).toBe(0)
    expect(body.data.streak).toEqual({ current: 0, longest: 0, freezes: 0 })
    expect(body.data.path.gridLevels).toEqual({ 4: 1, 6: 1, 8: 1 })
})
