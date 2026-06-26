/**
 * Integration tests for POST /internal/on-account-delete.
 * Verifies that deleteUserData removes all Redis data for a deleted account
 * without affecting other users' data.
 */
import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { expect } from 'vitest'

import { app } from '../index'
import { getCurrentSeason } from '../lib/seasons'

const test = createDevvitTest({
    userId: 't2_testrunner',
    subredditName: 'urjo',
    subredditId: 't5_urjo',
})

const accountDeleteRequest = (userId: string): Promise<Response> =>
    app.request('/internal/on-account-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
    })

// ─── Profile key cleanup ──────────────────────────────────────────────────────

test('POST /internal/on-account-delete removes all user profile keys', async () => {
    const userId = 't2_profileuser'

    await Promise.all([
        // Streak
        redis.set(`user:${userId}:streak:current`, '5'),
        redis.set(`user:${userId}:streak:longest`, '10'),
        redis.set(`user:${userId}:streak:lastDate`, '2025-01-01'),
        // Economy + social
        redis.hSet(`user:${userId}:economy`, { coins: '500', totalCoins: '1000' }),
        redis.hSet(`user:${userId}:social`, { shares: '3' }),
        // Achievements + flair
        redis.set(`user:${userId}:achievements`, '["first_win"]'),
        redis.set(`user:${userId}:flairTier`, 'bronze'),
        redis.set(`user:${userId}:flairOptIn`, 'true'),
        // Skill levels
        redis.set(`user:${userId}:skillLevel`, '3'),
        redis.set(`user:${userId}:skillLevel:4`, '2'),
        redis.set(`user:${userId}:skillLevel:6`, '1'),
        redis.set(`user:${userId}:skillLevel:8`, '1'),
        // Per-grid history
        redis.set(`user:${userId}:history:4`, '[{"level":2,"timeTaken":60}]'),
        redis.set(`user:${userId}:history:6`, '[{"level":1,"timeTaken":90}]'),
        redis.set(`user:${userId}:history:8`, '[{"level":1,"timeTaken":120}]'),
        // Preferences + onboarding
        redis.set(`user:${userId}:gridSizePreference`, '4'),
        redis.set(`user:${userId}:gridMigrated`, 'true'),
        redis.set(`user:${userId}:tutorialCompleted`, 'true'),
        // Other
        redis.set(`user:${userId}:username`, 'profileuser'),
        redis.hSet(`user:${userId}:loginStreak`, { days: '3', lastDate: '2025-01-01' }),
        redis.zAdd(`analytics:user:${userId}:completion_dates`, { member: '2025-01-01', score: 1 }),
    ])

    const res = await accountDeleteRequest(userId)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })

    // Streak
    expect(await redis.get(`user:${userId}:streak:current`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:streak:longest`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:streak:lastDate`)).toBeUndefined()
    // Economy + social
    expect(await redis.hGetAll(`user:${userId}:economy`)).toEqual({})
    expect(await redis.hGetAll(`user:${userId}:social`)).toEqual({})
    // Achievements + flair
    expect(await redis.get(`user:${userId}:achievements`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:flairTier`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:flairOptIn`)).toBeUndefined()
    // Skill levels
    expect(await redis.get(`user:${userId}:skillLevel`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:skillLevel:4`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:skillLevel:6`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:skillLevel:8`)).toBeUndefined()
    // Per-grid history
    expect(await redis.get(`user:${userId}:history:4`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:history:6`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:history:8`)).toBeUndefined()
    // Preferences + onboarding
    expect(await redis.get(`user:${userId}:gridSizePreference`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:gridMigrated`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:tutorialCompleted`)).toBeUndefined()
    // Other
    expect(await redis.get(`user:${userId}:username`)).toBeUndefined()
    expect(await redis.hGetAll(`user:${userId}:loginStreak`)).toEqual({})
    expect(
        await redis.zRange(`analytics:user:${userId}:completion_dates`, 0, -1, { by: 'rank' })
    ).toEqual([])
})

// ─── Global leaderboard removal ───────────────────────────────────────────────

test('POST /internal/on-account-delete removes user from all global leaderboards', async () => {
    const userId = 't2_leaderuser'
    const { seasonId } = getCurrentSeason()

    await Promise.all([
        redis.zAdd('leaderboard:streak', { member: userId, score: 7 }),
        redis.zAdd('leaderboard:coins', { member: userId, score: 1000 }),
        redis.zAdd('notify:optin', { member: userId, score: Date.now() }),
        redis.zAdd(`season:${seasonId}:leaderboard`, { member: userId, score: 50 }),
    ])

    await accountDeleteRequest(userId)

    expect(await redis.zScore('leaderboard:streak', userId)).toBeUndefined()
    expect(await redis.zScore('leaderboard:coins', userId)).toBeUndefined()
    expect(await redis.zScore('notify:optin', userId)).toBeUndefined()
    expect(await redis.zScore(`season:${seasonId}:leaderboard`, userId)).toBeUndefined()
})

// ─── Season participation cleanup ────────────────────────────────────────────

test('POST /internal/on-account-delete removes user from all seasons via reverse index', async () => {
    const userId = 't2_seasonuser'
    const pastSeasonId = '2025-W01'
    const anotherSeasonId = '2025-W10'

    // Seed participation in two past seasons
    await Promise.all([
        redis.zAdd(`season:${pastSeasonId}:leaderboard`, { member: userId, score: 120 }),
        redis.zAdd(`season:${anotherSeasonId}:leaderboard`, { member: userId, score: 80 }),
        redis.zAdd(`user:${userId}:seasonParticipation`, { member: pastSeasonId, score: 1 }),
        redis.zAdd(`user:${userId}:seasonParticipation`, { member: anotherSeasonId, score: 2 }),
    ])

    await accountDeleteRequest(userId)

    expect(await redis.zScore(`season:${pastSeasonId}:leaderboard`, userId)).toBeUndefined()
    expect(await redis.zScore(`season:${anotherSeasonId}:leaderboard`, userId)).toBeUndefined()
    // Reverse index key itself is removed
    expect(
        await redis.zRange(`user:${userId}:seasonParticipation`, 0, -1, { by: 'rank' })
    ).toEqual([])
})

// ─── Champion attribution cleanup ─────────────────────────────────────────────

test('POST /internal/on-account-delete clears championId but preserves fastestTime', async () => {
    const userId = 't2_champuser'
    const postId = 't3_challengepost1'

    await redis.hSet(`game:${postId}:stats`, {
        attempts: '5',
        beats: '3',
        fastestTime: '45',
        championId: userId,
    })
    await redis.zAdd(`user:${userId}:championOf`, { member: postId, score: Date.now() })

    await accountDeleteRequest(userId)

    const stats = await redis.hGetAll(`game:${postId}:stats`)
    // Champion identity field removed
    expect(stats['championId']).toBeUndefined()
    // fastestTime is a game metric, NOT PII — must be preserved so the leaderboard
    // display and "new record" logic in checkChallengeBeat remain correct
    expect(stats['fastestTime']).toBe('45')
    // Other stats preserved
    expect(stats['attempts']).toBe('5')
    expect(stats['beats']).toBe('3')
    // Reverse index key removed
    expect(
        await redis.zRange(`user:${userId}:championOf`, 0, -1, { by: 'rank' })
    ).toEqual([])
})

test('POST /internal/on-account-delete skips champion clear when a different user is current champion', async () => {
    const deletedUserId = 't2_formerchamp'
    const currentChampId = 't2_currentchamp'
    const postId = 't3_challengepost2'

    // A different user has since taken the champion title
    await redis.hSet(`game:${postId}:stats`, {
        fastestTime: '30',
        championId: currentChampId,
    })
    await redis.zAdd(`user:${deletedUserId}:championOf`, { member: postId, score: Date.now() })

    await accountDeleteRequest(deletedUserId)

    // Current champion's data is entirely untouched
    const stats = await redis.hGetAll(`game:${postId}:stats`)
    expect(stats['championId']).toBe(currentChampId)
    expect(stats['fastestTime']).toBe('30')
})

// ─── Challenge creator attribution cleanup ────────────────────────────────────

test('POST /internal/on-account-delete clears creator attribution on challenge posts', async () => {
    const userId = 't2_creatoruser'
    const postId = 't3_createdchallenge1'

    await redis.hSet(`game:${postId}:meta`, {
        postType: 'urjo-puzzle',
        challengeCreatorId: userId,
        stickyCommentId: 't1_sticky',
    })
    await redis.hSet(`game:${postId}:puzzle`, {
        colors: 'r'.repeat(16),
        numbers: '-'.repeat(16),
        challengeBy: userId,
        challengeByUsername: 'creatoruser',
        challengeByAvatar: 'https://img/avatar.png',
    })
    await redis.zAdd(`user:${userId}:createdChallenges`, { member: postId, score: Date.now() })

    await accountDeleteRequest(userId)

    const meta = await redis.hGetAll(`game:${postId}:meta`)
    expect(meta['challengeCreatorId']).toBeUndefined()
    // Non-identity meta fields preserved
    expect(meta['postType']).toBe('urjo-puzzle')
    expect(meta['stickyCommentId']).toBe('t1_sticky')

    const puzzle = await redis.hGetAll(`game:${postId}:puzzle`)
    expect(puzzle['challengeBy']).toBeUndefined()
    expect(puzzle['challengeByUsername']).toBeUndefined()
    expect(puzzle['challengeByAvatar']).toBeUndefined()
    // Non-identity puzzle data preserved
    expect(puzzle['colors']).toBe('r'.repeat(16))

    // Reverse index key removed
    expect(
        await redis.zRange(`user:${userId}:createdChallenges`, 0, -1, { by: 'rank' })
    ).toEqual([])
})

// ─── Idempotency ──────────────────────────────────────────────────────────────

test('POST /internal/on-account-delete with no data returns 200 without error', async () => {
    const res = await accountDeleteRequest('t2_nonexistentuser')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
})

// ─── Payload format: user.id ──────────────────────────────────────────────────

test('POST /internal/on-account-delete handles user.id payload format', async () => {
    const userId = 't2_altformatuser'
    await redis.set(`user:${userId}:streak:current`, '3')
    await redis.zAdd('leaderboard:streak', { member: userId, score: 3 })

    const res = await app.request('/internal/on-account-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: { id: userId } }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(await redis.get(`user:${userId}:streak:current`)).toBeUndefined()
    expect(await redis.zScore('leaderboard:streak', userId)).toBeUndefined()
})

// ─── Isolation ────────────────────────────────────────────────────────────────

test("POST /internal/on-account-delete does not affect other users' data", async () => {
    const deletedUserId = 't2_willbedeleted'
    const otherUserId = 't2_shouldremain'
    const { seasonId } = getCurrentSeason()

    await Promise.all([
        redis.set(`user:${deletedUserId}:streak:current`, '3'),
        redis.zAdd('leaderboard:streak', { member: deletedUserId, score: 3 }),
        redis.set(`user:${otherUserId}:streak:current`, '8'),
        redis.zAdd('leaderboard:streak', { member: otherUserId, score: 8 }),
        redis.zAdd(`season:${seasonId}:leaderboard`, { member: otherUserId, score: 75 }),
    ])

    await accountDeleteRequest(deletedUserId)

    // Deleted user's data is gone
    expect(await redis.get(`user:${deletedUserId}:streak:current`)).toBeUndefined()
    expect(await redis.zScore('leaderboard:streak', deletedUserId)).toBeUndefined()

    // Other user's data is entirely intact
    expect(await redis.get(`user:${otherUserId}:streak:current`)).toBe('8')
    expect(await redis.zScore('leaderboard:streak', otherUserId)).toBe(8)
    expect(await redis.zScore(`season:${seasonId}:leaderboard`, otherUserId)).toBe(75)
})
