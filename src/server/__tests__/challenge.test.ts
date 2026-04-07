import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit } from '@devvit/web/server'
import { runWithContext } from '@devvit/server'
import { expect, vi } from 'vitest'

import { app } from '../index'

// ─── Shared test context ──────────────────────────────────────────────────────

const test = createDevvitTest({ userId: 't2_winner', subredditName: 'urjo' })
const challengeTest = createDevvitTest({ userId: 't2_challenger', subredditName: 'urjo' })

// ─── Request helpers ──────────────────────────────────────────────────────────

/**
 * Run a request with an explicit postId/userId injected into the Devvit context.
 * createDevvitTest doesn't support postId in its config, so we wrap the request
 * in a nested runWithContext that overrides those fields.
 */
const withContext = <T>(postId: string, userId: string, fn: () => Promise<T>): Promise<T> =>
    runWithContext(
        { postId, userId, subredditName: 'urjo', subredditId: 't5_urjo' } as Parameters<typeof runWithContext>[0],
        fn
    )

const completeRequest = (body: object = { mistakes: 0 }) =>
    app.request('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

const challengeRequest = (body: object) =>
    app.request('/api/game/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

// ─── Seed helpers ─────────────────────────────────────────────────────────────

const seedChallengePuzzle = async (
    postId = 't3_challengepost',
    challengerId = 't2_challenger',
    score = 60
) => {
    await redis.hSet(`game:${postId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
        challengeBy: challengerId,
        challengeScore: score.toString(),
    })
    await redis.hSet(`game:${postId}:stats`, { attempts: '0', beats: '0' })
    await redis.hSet(`game:${postId}:meta`, {
        postType: 'urjo-puzzle',
        leaderboardCommentId: 't1_leaderboard',
    })
}

const seedStartTime = async (userId: string, postId: string, secondsAgo = 30) => {
    await redis.set(
        `user:${userId}:puzzleStartTime:${postId}`,
        (Date.now() - secondsAgo * 1000).toString()
    )
}

// ─── updateLeaderboardComment ─────────────────────────────────────────────────

test('updateLeaderboardComment: edits the pinned comment with current stats', async () => {
    const postId = 't3_lbcomment1'
    await seedChallengePuzzle(postId, 't2_challenger', 60)
    await redis.hSet(`game:${postId}:stats`, {
        attempts: '5', beats: '2', fastestTime: '45', championId: 't2_champ',
    })
    await seedStartTime('t2_winner', postId, 30)

    const editSpy = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(reddit, 'getCommentById').mockResolvedValue({ edit: editSpy } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'ChampUser' } as never)
    vi.spyOn(reddit, 'sendPrivateMessage').mockResolvedValue(undefined as never)

    const res = await withContext(postId, 't2_winner', completeRequest)
    expect(res.status).toBe(200)
    expect(editSpy).toHaveBeenCalled()

    const editArg: string = (editSpy.mock.calls[0] as [{ text: string }])[0]?.text ?? ''
    expect(editArg).toContain('Attempts:')
    expect(editArg).toContain('Beaten:')
})

test('updateLeaderboardComment: skips edit when leaderboardCommentId is missing', async () => {
    const postId = 't3_lbcomment2'
    await redis.hSet(`game:${postId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
        challengeBy: 't2_challenger', challengeScore: '60',
    })
    await redis.hSet(`game:${postId}:stats`, { attempts: '0', beats: '0' })
    await redis.hSet(`game:${postId}:meta`, { postType: 'urjo-puzzle' }) // no leaderboardCommentId
    await seedStartTime('t2_winner', postId, 30)

    const getCommentSpy = vi.spyOn(reddit, 'getCommentById')
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'WinnerUser' } as never)
    vi.spyOn(reddit, 'sendPrivateMessage').mockResolvedValue(undefined as never)

    const res = await withContext(postId, 't2_winner', completeRequest)
    expect(res.status).toBe(200)
    expect(getCommentSpy).not.toHaveBeenCalled()
})

// ─── checkChallengeBeat — beats counter & fastest time ───────────────────────

test('checkChallengeBeat: increments beats and sets fastestTime on first beat', async () => {
    const postId = 't3_beat1'
    await seedChallengePuzzle(postId, 't2_challenger', 60)
    await seedStartTime('t2_winner', postId, 30) // ~30s beats 60s challenge

    vi.spyOn(reddit, 'getCommentById').mockResolvedValue({ edit: vi.fn() } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'WinnerUser' } as never)
    vi.spyOn(reddit, 'sendPrivateMessage').mockResolvedValue(undefined as never)

    const res = await withContext(postId, 't2_winner', completeRequest)
    expect(res.status).toBe(200)

    const stats = await redis.hGetAll(`game:${postId}:stats`)
    expect(stats['beats']).toBe('1')
    expect(stats['fastestTime']).toBeDefined()
    expect(stats['championId']).toBe('t2_winner')
})

test('checkChallengeBeat: does not update fastestTime when existing record is faster', async () => {
    const postId = 't3_beat2'
    await seedChallengePuzzle(postId, 't2_challenger', 60)
    await redis.hSet(`game:${postId}:stats`, {
        attempts: '1', beats: '1', fastestTime: '10', championId: 't2_existing',
    })
    await seedStartTime('t2_winner', postId, 30) // ~30s, slower than existing 10s

    vi.spyOn(reddit, 'getCommentById').mockResolvedValue({ edit: vi.fn() } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'WinnerUser' } as never)
    vi.spyOn(reddit, 'sendPrivateMessage').mockResolvedValue(undefined as never)

    await withContext(postId, 't2_winner', completeRequest)

    const stats = await redis.hGetAll(`game:${postId}:stats`)
    expect(stats['fastestTime']).toBe('10')
    expect(stats['championId']).toBe('t2_existing')
})

test('checkChallengeBeat: does not fire when winner is the challenger', async () => {
    const postId = 't3_beat3'
    await redis.hSet(`game:${postId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
        challengeBy: 't2_winner', // same as userId
        challengeScore: '60',
    })
    await redis.hSet(`game:${postId}:stats`, { attempts: '0', beats: '0' })
    await redis.hSet(`game:${postId}:meta`, { postType: 'urjo-puzzle', leaderboardCommentId: 't1_lb' })
    await seedStartTime('t2_winner', postId, 30)

    const editSpy = vi.fn()
    vi.spyOn(reddit, 'getCommentById').mockResolvedValue({ edit: editSpy } as never)

    await withContext(postId, 't2_winner', completeRequest)

    const stats = await redis.hGetAll(`game:${postId}:stats`)
    expect(stats['beats']).toBe('0')
    expect(editSpy).not.toHaveBeenCalled()
})

test('checkChallengeBeat: does not fire when time does not beat challenge score', async () => {
    const postId = 't3_beat4'
    await seedChallengePuzzle(postId, 't2_challenger', 20) // challenge score = 20s
    await seedStartTime('t2_winner', postId, 30) // ~30s, slower

    const editSpy = vi.fn()
    vi.spyOn(reddit, 'getCommentById').mockResolvedValue({ edit: editSpy } as never)

    await withContext(postId, 't2_winner', completeRequest)

    const stats = await redis.hGetAll(`game:${postId}:stats`)
    expect(stats['beats']).toBe('0')
    expect(editSpy).not.toHaveBeenCalled()
})

test('checkChallengeBeat: dedup prevents double-counting the same winner', async () => {
    const postId = 't3_beat5'
    await seedChallengePuzzle(postId, 't2_challenger', 60)

    vi.spyOn(reddit, 'getCommentById').mockResolvedValue({ edit: vi.fn() } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'WinnerUser' } as never)
    vi.spyOn(reddit, 'sendPrivateMessage').mockResolvedValue(undefined as never)

    await seedStartTime('t2_winner', postId, 30)
    await withContext(postId, 't2_winner', completeRequest)

    await seedStartTime('t2_winner', postId, 25)
    await withContext(postId, 't2_winner', completeRequest)

    const stats = await redis.hGetAll(`game:${postId}:stats`)
    expect(stats['beats']).toBe('1')
})

test('checkChallengeBeat: DM URL uses /comments/ path not fullname', async () => {
    const postId = 't3_beat6'
    await seedChallengePuzzle(postId, 't2_challenger', 60)
    await seedStartTime('t2_winner', postId, 30)

    vi.spyOn(reddit, 'getCommentById').mockResolvedValue({ edit: vi.fn() } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'WinnerUser' } as never)
    const dmSpy = vi.spyOn(reddit, 'sendPrivateMessage').mockResolvedValue(undefined as never)

    await withContext(postId, 't2_winner', completeRequest)

    expect(dmSpy).toHaveBeenCalled()
    const dmArg = (dmSpy.mock.calls[0] as [{ text: string }])[0]
    expect(dmArg?.text).toContain('https://reddit.com/comments/beat6')
    expect(dmArg?.text).not.toContain('https://reddit.com/t3_')
})

// ─── attempts counter ─────────────────────────────────────────────────────────

test('attempts: increments once per unique user on challenge post completion', async () => {
    const postId = 't3_attempts1'
    await seedChallengePuzzle(postId, 't2_challenger', 60)
    await seedStartTime('t2_winner', postId, 30)

    vi.spyOn(reddit, 'getCommentById').mockResolvedValue({ edit: vi.fn() } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'WinnerUser' } as never)
    vi.spyOn(reddit, 'sendPrivateMessage').mockResolvedValue(undefined as never)

    await withContext(postId, 't2_winner', completeRequest)

    const stats = await redis.hGetAll(`game:${postId}:stats`)
    expect(stats['attempts']).toBe('1')
})

test('attempts: does not double-count re-solves by the same user', async () => {
    const postId = 't3_attempts2'
    await seedChallengePuzzle(postId, 't2_challenger', 60)

    vi.spyOn(reddit, 'getCommentById').mockResolvedValue({ edit: vi.fn() } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'WinnerUser' } as never)
    vi.spyOn(reddit, 'sendPrivateMessage').mockResolvedValue(undefined as never)

    await seedStartTime('t2_winner', postId, 30)
    await withContext(postId, 't2_winner', completeRequest)

    await seedStartTime('t2_winner', postId, 28)
    await withContext(postId, 't2_winner', completeRequest)

    const stats = await redis.hGetAll(`game:${postId}:stats`)
    expect(stats['attempts']).toBe('1')
})

test('attempts: does not increment on non-challenge posts', async () => {
    const postId = 't3_attempts3'
    await redis.hSet(`game:${postId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
        // no challengeBy
    })
    await seedStartTime('t2_winner', postId, 30)

    await withContext(postId, 't2_winner', completeRequest)

    const stats = await redis.hGetAll(`game:${postId}:stats`)
    expect(stats['attempts']).toBeUndefined()
})

// ─── /api/game/challenge — meta initialization ────────────────────────────────

challengeTest('challenge route: stores postType and leaderboardCommentId in a single meta hash', async () => {
    const sourcePostId = 't3_sourcepost1'
    await redis.hSet(`game:${sourcePostId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
    })
    await redis.set(
        `user:t2_challenger:puzzleStartTime:${sourcePostId}`,
        (Date.now() - 30000).toString()
    )

    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_newpost1' } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'ChallengerUser' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue({ id: 't1_leaderboard' } as never)

    const res = await withContext(sourcePostId, 't2_challenger', () =>
        challengeRequest({ timeTaken: 45, skillLevel: 3, mistakes: 0 })
    )
    expect(res.status).toBe(200)

    const meta = await redis.hGetAll('game:t3_newpost1:meta')
    // Both fields must coexist — double hSet bug would wipe postType
    expect(meta['postType']).toBe('urjo-puzzle')
    expect(meta['leaderboardCommentId']).toBe('t1_leaderboard')
})

challengeTest('challenge route: initializes stats with attempts=0 and beats=0', async () => {
    const sourcePostId = 't3_sourcepost2'
    await redis.hSet(`game:${sourcePostId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
    })

    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_newpost2' } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'ChallengerUser' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue({ id: 't1_lb2' } as never)

    await withContext(sourcePostId, 't2_challenger', () =>
        challengeRequest({ timeTaken: 45, skillLevel: 3, mistakes: 0 })
    )

    const stats = await redis.hGetAll('game:t3_newpost2:stats')
    expect(stats['attempts']).toBe('0')
    expect(stats['beats']).toBe('0')
})
