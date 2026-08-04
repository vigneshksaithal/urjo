/**
 * Integration tests for POST /internal/on-account-delete.
 * Verifies that deleteUserData removes all Redis data for a deleted account
 * without affecting other users' data.
 */
import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { expect } from 'vitest'

import { app } from '../index'
import {
    registerUserDynamicKey,
    registerUserSortedSetMembership,
} from '../lib/account-deletion'
import {
    claimCompletionAction,
    createCompletionSnapshot,
} from '../lib/completion-snapshot'
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
        redis.set(`user:${userId}:streak:freeFreezeTier`, '2'),
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
        redis.set(`user:${userId}:history:adaptive`, '[]'),
        // Preferences + onboarding
        redis.set(`user:${userId}:gridSizePreference`, '4'),
        redis.set(`user:${userId}:gridSizeOverride`, '6'),
        redis.set(`user:${userId}:gridMigrated`, 'true'),
        redis.set(`user:${userId}:tutorialCompleted`, 'true'),
        redis.set(`user:${userId}:communityJoined`, 'true'),
        redis.set(`user:${userId}:pathLevel`, '12'),
        redis.set(`user:${userId}:consecutiveSkips:4`, '1'),
        redis.set(`user:${userId}:consecutiveSkips:6`, '2'),
        redis.set(`user:${userId}:consecutiveSkips:8`, '3'),
        redis.set(`user:${userId}:hint:numberConstraint`, '1'),
        redis.set(`user:${userId}:hint:adjacencyViolation`, '1'),
        // Other
        redis.set(`user:${userId}:username`, 'profileuser'),
        redis.set(`user:${userId}:display`, '{"username":"profileuser"}'),
        redis.hSet(`user:${userId}:loginStreak`, { days: '3', lastDate: '2025-01-01' }),
        redis.zAdd(`analytics:user:${userId}:completion_dates`, { member: '2025-01-01', score: 1 }),
        redis.set(`viral:attribution:${userId}`, '{"channel":"challenge_post"}'),
    ])

    const res = await accountDeleteRequest(userId)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })

    // Streak
    expect(await redis.get(`user:${userId}:streak:current`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:streak:longest`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:streak:lastDate`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:streak:freeFreezeTier`)).toBeUndefined()
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
    expect(await redis.get(`user:${userId}:history:adaptive`)).toBeUndefined()
    // Preferences + onboarding
    expect(await redis.get(`user:${userId}:gridSizePreference`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:gridSizeOverride`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:gridMigrated`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:tutorialCompleted`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:communityJoined`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:pathLevel`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:consecutiveSkips:4`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:consecutiveSkips:6`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:consecutiveSkips:8`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:hint:numberConstraint`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:hint:adjacencyViolation`)).toBeUndefined()
    // Other
    expect(await redis.get(`user:${userId}:username`)).toBeUndefined()
    expect(await redis.get(`user:${userId}:display`)).toBeUndefined()
    expect(await redis.hGetAll(`user:${userId}:loginStreak`)).toEqual({})
    expect(await redis.get(`viral:attribution:${userId}`)).toBeUndefined()
    expect(
        await redis.zRange(`analytics:user:${userId}:completion_dates`, 0, -1, { by: 'rank' })
    ).toEqual([])
})

// ─── Dynamic-key and completion-snapshot cleanup ─────────────────────────────

test('POST /internal/on-account-delete removes registered dynamic user keys', async () => {
    const userId = 't2_dynamicuser'
    const dynamicKeys = [
        `user:${userId}:game:t3_post:currentPuzzle`,
        `user:${userId}:puzzleStartTime:t3_post`,
        `user:${userId}:puzzleFirstCellTime:t3_post:instance-1`,
        `user:${userId}:solved:t3_post:instance-1`,
        `user:${userId}:challenge:count:2025-01-01`,
        `user:${userId}:seasonSolves:2025-01-01`,
        `user:${userId}:loggedOutMigrated:t3_post`,
        `analytics:seen:2025-01-01:t3_post:${userId}`,
        `analytics:acted:2025-01-01:t3_post:${userId}`,
        `analytics:completed:t3_post:${userId}`,
        `analytics:challenge_opened:2025-01-01:t3_post:${userId}`,
        `analytics:challenge_completed:t3_post:${userId}`,
        `viral:dedup:share:2025-01-01:${userId}`,
        `viral:dedup:channel_open:2025-01-01:challenge_post:${userId}`,
        `viral:dedup:channel_conversion:challenge_post:${userId}`,
        `referral:t3_post:${userId}`,
    ]

    for (const key of dynamicKeys) {
        await redis.set(key, 'value')
        await registerUserDynamicKey(userId, key)
    }

    await accountDeleteRequest(userId)

    for (const key of dynamicKeys) {
        expect(await redis.get(key)).toBeUndefined()
    }
    expect(
        await redis.zRange(`user:${userId}:dynamicKeys`, 0, -1, { by: 'rank' }),
    ).toEqual([])
})

test('POST /internal/on-account-delete removes registered sorted-set memberships', async () => {
    const userId = 't2_membershipuser'
    const setKeys = [
        'analytics:2025-01-01:daily_active_engagers',
        'viral:2025-01-01:completers',
        'leaderboard:speed:2025-01-01:4',
        'leaderboard:weekly:2025-W01',
    ]

    for (const key of setKeys) {
        await redis.zAdd(key, { member: userId, score: 1 })
        await registerUserSortedSetMembership(userId, key)
    }

    await accountDeleteRequest(userId)

    for (const key of setKeys) {
        expect(await redis.zScore(key, userId)).toBeUndefined()
    }
    expect(
        await redis.zRange(`user:${userId}:sortedSetMemberships`, 0, -1, { by: 'rank' }),
    ).toEqual([])
})

test('POST /internal/on-account-delete removes completion snapshots and action state', async () => {
    const userId = 't2_completionuser'
    const snapshot = await createCompletionSnapshot({
        userId,
        sourcePostId: 't3_sourcepost',
        puzzleInstanceId: 'instance-1',
        puzzleNumber: 7,
        gridSize: 4,
        skillLevel: 1,
        timeTaken: 31,
        streak: 2,
        colorGrid: [
            ['red', 'blue', 'red', 'blue'],
            ['blue', 'red', 'blue', 'red'],
            ['red', 'blue', 'red', 'blue'],
            ['blue', 'red', 'blue', 'red'],
        ],
    })
    await claimCompletionAction(userId, snapshot.completionId, 'challenge')

    await accountDeleteRequest(userId)

    expect(
        await redis.get(`user:${userId}:completion:${snapshot.completionId}`),
    ).toBeUndefined()
    expect(
        await redis.get(`user:${userId}:completion:${snapshot.completionId}:action:challenge`),
    ).toBeUndefined()
    expect(
        await redis.zRange(`user:${userId}:completions`, 0, -1, { by: 'rank' }),
    ).toEqual([])
    expect(await redis.hGetAll(`user:${userId}:completionLatestByPost`)).toEqual({})
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
        redis.hSet(`season:${pastSeasonId}:rewarded`, { [userId]: '500' }),
        redis.set(`season:${pastSeasonId}:results`, JSON.stringify({
            seasonId: pastSeasonId,
            totalParticipants: 2,
            topPlayers: [
                { userId, username: 'deleted-user', score: 120 },
                { userId: 't2_other', username: 'other-user', score: 100 },
            ],
        })),
    ])

    await accountDeleteRequest(userId)

    expect(await redis.zScore(`season:${pastSeasonId}:leaderboard`, userId)).toBeUndefined()
    expect(await redis.zScore(`season:${anotherSeasonId}:leaderboard`, userId)).toBeUndefined()
    expect(await redis.hGet(`season:${pastSeasonId}:rewarded`, userId)).toBeUndefined()
    const sanitizedResults = JSON.parse(
        (await redis.get(`season:${pastSeasonId}:results`))!,
    ) as { topPlayers: { userId: string }[] }
    expect(sanitizedResults.topPlayers).toEqual([
        expect.objectContaining({ userId: 't2_other' }),
    ])
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

test('POST /internal/on-account-delete clears a challenge-beat preview owned by the user', async () => {
    const userId = 't2_previewwinner'
    const postId = 't3_challengepreview'

    await Promise.all([
        redis.hSet(`game:${postId}:preview`, {
            type: 'challenge_beat',
            winnerId: userId,
            data: JSON.stringify({ winnerUsername: 'deleted-player', winnerTime: 20 }),
        }),
        redis.zAdd(`user:${userId}:challengeBeatPreviews`, {
            member: postId,
            score: Date.now(),
        }),
    ])

    await accountDeleteRequest(userId)

    expect(await redis.hGetAll(`game:${postId}:preview`)).toEqual({})
    expect(
        await redis.zRange(`user:${userId}:challengeBeatPreviews`, 0, -1, { by: 'rank' }),
    ).toEqual([])
})

test('POST /internal/on-account-delete preserves a newer challenge-beat preview', async () => {
    const deletedUserId = 't2_oldpreviewwinner'
    const currentWinnerId = 't2_newpreviewwinner'
    const postId = 't3_newchallengepreview'

    await Promise.all([
        redis.hSet(`game:${postId}:preview`, {
            type: 'challenge_beat',
            winnerId: currentWinnerId,
            data: JSON.stringify({ winnerUsername: 'current-player', winnerTime: 18 }),
        }),
        redis.zAdd(`user:${deletedUserId}:challengeBeatPreviews`, {
            member: postId,
            score: Date.now(),
        }),
    ])

    await accountDeleteRequest(deletedUserId)

    expect(await redis.hGet(`game:${postId}:preview`, 'winnerId')).toBe(currentWinnerId)
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
    await redis.hSet(`game:${postId}:preview`, {
        type: 'challenge',
        data: JSON.stringify({ challengerUsername: 'creatoruser', targetTime: 40 }),
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
    expect(await redis.hGetAll(`game:${postId}:preview`)).toEqual({})

    // Reverse index key removed
    expect(
        await redis.zRange(`user:${userId}:createdChallenges`, 0, -1, { by: 'rank' })
    ).toEqual([])
})

test('POST /internal/on-account-delete removes stored authored level content', async () => {
    const userId = 't2_levelcreator'
    const postId = 't3_createdlevel1'

    await Promise.all([
        redis.hSet(`game:${postId}:meta`, {
            postType: 'urjo-puzzle',
            challengeCreatorId: userId,
            creatorContentType: 'level',
        }),
        redis.hSet(`game:${postId}:puzzle`, {
            colors: 'r'.repeat(16),
            solution: 'b'.repeat(16),
            challengeBy: userId,
            customLevel: 'true',
        }),
        redis.hSet(`game:${postId}:stats`, { attempts: '2' }),
        redis.zAdd(`user:${userId}:createdChallenges`, { member: postId, score: Date.now() }),
    ])

    await accountDeleteRequest(userId)

    expect(await redis.hGetAll(`game:${postId}:meta`)).toEqual({})
    expect(await redis.hGetAll(`game:${postId}:puzzle`)).toEqual({})
    expect(await redis.hGetAll(`game:${postId}:stats`)).toEqual({})
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
