import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit } from '@devvit/web/server'
import { runWithContext } from '@devvit/server'
import { expect, vi } from 'vitest'

import { app } from '../index'
import { DEFAULT_CHALLENGE_TITLE } from '../../shared/constants'
import { REFERRAL_BONUS } from '../../shared/engagement-constants'

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

const completeRequest = (body: object = {}) =>
    app.request('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // All challenge-test puzzles are seeded with solution 'rbrb'. The
        // server now verifies the submitted board equals the solution, so we
        // send it here. mistakes defaults to 0 unless a test overrides it.
        body: JSON.stringify({ mistakes: 0, board: 'rbrb', ...body }),
    })

const challengeRequest = (body: object) =>
    app.request('/api/game/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

const stickyComment = (id: string, distinguish = vi.fn().mockResolvedValue(undefined)) => ({
    id,
    distinguish,
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
    expect(editArg).toContain('Score to beat: 60s')
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

test('checkChallengeBeat: posts one public beat reply under leaderboard comment', async () => {
    const postId = 't3_beat6'
    await seedChallengePuzzle(postId, 't2_challenger', 60)
    await seedStartTime('t2_winner', postId, 30)

    vi.spyOn(reddit, 'getCommentById').mockResolvedValue({ edit: vi.fn() } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'WinnerUser' } as never)
    const submitCommentSpy = vi.spyOn(reddit, 'submitComment').mockResolvedValue({ id: 't1_beat_reply' } as never)

    await withContext(postId, 't2_winner', completeRequest)
    await seedStartTime('t2_winner', postId, 25)
    await withContext(postId, 't2_winner', completeRequest)

    const beatReplies = submitCommentSpy.mock.calls.filter(([arg]) =>
        typeof arg === 'object' &&
        arg !== null &&
        'id' in arg &&
        arg.id === 't1_leaderboard'
    )
    expect(beatReplies).toHaveLength(1)

    const replyArg = beatReplies[0]?.[0] as { text?: string } | undefined
    expect(replyArg?.text).toContain('beat the challenge')
    expect(replyArg?.text).toContain('https://reddit.com/comments/beat6')
    expect(replyArg?.text).not.toContain('https://reddit.com/t3_')
})

test('referral: awards creator when a first-time player completes their challenge', async () => {
    const postId = 't3_referral1'
    await seedChallengePuzzle(postId, 't2_challenger', 60)
    await seedStartTime('t2_winner', postId, 30)

    vi.spyOn(reddit, 'getCommentById').mockResolvedValue({ edit: vi.fn() } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'WinnerUser' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue({ id: 't1_reply' } as never)

    const res = await withContext(postId, 't2_winner', completeRequest)
    expect(res.status).toBe(200)

    const creatorCoins = await redis.hGet('user:t2_challenger:economy', 'coins')
    const creatorReferrals = await redis.hGet('user:t2_challenger:economy', 'totalReferrals')

    expect(parseInt(creatorCoins ?? '0', 10)).toBe(REFERRAL_BONUS)
    expect(creatorReferrals).toBe('1')
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

// ─── Perfect-solve challenge prompt (compliance: explicit opt-in, never auto-posts) ─

const seedPlainPuzzle = async (postId: string) => {
    await redis.hSet(`game:${postId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
    })
}

test('complete: perfect solve on a normal post never posts as the user and flags the challenge prompt', async () => {
    const postId = 't3_perfectprompt'
    await seedPlainPuzzle(postId)
    await seedStartTime('t2_winner', postId, 30)

    // Reddit user actions must be explicit — completion must NOT submit a post.
    const submitPostSpy = vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_should_not_post' } as never)

    const res = await withContext(postId, 't2_winner', () => completeRequest({ mistakes: 0 }))
    expect(res.status).toBe(200)

    const body = await res.json() as { challengePromptEligible?: boolean }
    expect(body.challengePromptEligible).toBe(true)
    expect(submitPostSpy).not.toHaveBeenCalled()
})

test('complete: imperfect solve is not challenge-prompt eligible', async () => {
    const postId = 't3_imperfectprompt'
    await seedPlainPuzzle(postId)
    await seedStartTime('t2_winner', postId, 30)

    const res = await withContext(postId, 't2_winner', () => completeRequest({ mistakes: 2 }))
    expect(res.status).toBe(200)

    const body = await res.json() as { challengePromptEligible?: boolean }
    expect(body.challengePromptEligible).toBeUndefined()
})

test('complete: perfect solve on a challenge post is not challenge-prompt eligible', async () => {
    const postId = 't3_challengeperfect'
    await seedChallengePuzzle(postId, 't2_challenger', 60)
    await seedStartTime('t2_winner', postId, 30)

    vi.spyOn(reddit, 'getCommentById').mockResolvedValue({ edit: vi.fn() } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'WinnerUser' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue({ id: 't1_x' } as never)

    const res = await withContext(postId, 't2_winner', () => completeRequest({ mistakes: 0 }))
    expect(res.status).toBe(200)

    const body = await res.json() as { challengePromptEligible?: boolean }
    expect(body.challengePromptEligible).toBeUndefined()
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
    vi.spyOn(reddit, 'submitComment').mockResolvedValue(stickyComment('t1_leaderboard') as never)
    vi.spyOn(reddit, 'getSnoovatarUrl').mockResolvedValue('https://img/c.png' as never)

    const res = await withContext(sourcePostId, 't2_challenger', () =>
        challengeRequest({ timeTaken: 45, skillLevel: 3, mistakes: 0 })
    )
    expect(res.status).toBe(200)

    const meta = await redis.hGetAll('game:t3_newpost1:meta')
    // Both fields must coexist — double hSet bug would wipe postType
    expect(meta['postType']).toBe('urjo-puzzle')
    expect(meta['leaderboardCommentId']).toBe('t1_leaderboard')
    expect(meta['stickyCommentId']).toBe('t1_leaderboard')

    // The challenge post must be tagged with the puzzle post type in postData
    expect(reddit.submitCustomPost).toHaveBeenCalledWith(
        expect.objectContaining({
            postData: expect.objectContaining({
                postType: 'urjo-puzzle',
            }),
        }),
    )
})

challengeTest('challenge route: puts generic score details in the pinned thread only', async () => {
    const sourcePostId = 't3_sourcepost_score_thread'
    await redis.hSet(`game:${sourcePostId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
    })

    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_scorethread' } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'ChallengerUser' } as never)
    const distinguishSticky = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue(
        stickyComment('t1_score_thread', distinguishSticky) as never
    )

    const res = await withContext(sourcePostId, 't2_challenger', () =>
        challengeRequest({ timeTaken: 45, skillLevel: 3, mistakes: 0 })
    )
    expect(res.status).toBe(200)

    expect(reddit.submitComment).toHaveBeenCalledTimes(1)
    expect(reddit.submitComment).toHaveBeenCalledWith({
        id: 't3_scorethread',
        text: expect.stringContaining('Score to beat: 45s with zero mistakes'),
    })
    expect(distinguishSticky).toHaveBeenCalledWith(true)
})

challengeTest('challenge route: returns comments URL and increments challengesCreated', async () => {
    const sourcePostId = 't3_sourcepost_url'
    await redis.hSet(`game:${sourcePostId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
    })

    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_newposturl' } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'ChallengerUser' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue(stickyComment('t1_lb_url') as never)

    const res = await withContext(sourcePostId, 't2_challenger', () =>
        challengeRequest({ timeTaken: 45, skillLevel: 3, mistakes: 0 })
    )
    expect(res.status).toBe(200)

    const body = await res.json() as { success: boolean; postUrl?: string }
    const social = await redis.hGetAll('user:t2_challenger:social')
    const today = new Date().toISOString().split('T')[0] ?? ''
    const challengePosts = await redis.get(`analytics:${today}:challenge_posts`)

    expect(body.success).toBe(true)
    expect(body.postUrl).toBe('https://reddit.com/comments/newposturl')
    expect(social['challengesCreated']).toBe('1')
    expect(challengePosts).toBe('1')
})

challengeTest('challenge route: uses a trimmed custom title when provided', async () => {
    const sourcePostId = 't3_sourcepost_custom_title'
    await redis.hSet(`game:${sourcePostId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
    })

    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_customtitle' } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'ChallengerUser' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue(stickyComment('t1_lb_custom') as never)

    const res = await withContext(sourcePostId, 't2_challenger', () =>
        challengeRequest({
            timeTaken: 45,
            skillLevel: 3,
            mistakes: 0,
            customTitle: 'Can you beat my zero-mistake run?',
        })
    )

    expect(res.status).toBe(200)
    expect(reddit.submitCustomPost).toHaveBeenCalledWith(
        expect.objectContaining({
            title: 'Can you beat my zero-mistake run?',
            userGeneratedContent: {
                text: 'Can you beat my zero-mistake run?',
            },
        }),
    )
})

challengeTest('challenge route: uses the default title when custom title is omitted', async () => {
    const sourcePostId = 't3_sourcepost_default_title'
    await redis.hSet(`game:${sourcePostId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
    })

    const submitSpy = vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_defaulttitle' } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'ChallengerUser' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue(stickyComment('t1_lb_default') as never)

    const res = await withContext(sourcePostId, 't2_challenger', () =>
        challengeRequest({
            timeTaken: 45,
            skillLevel: 3,
            mistakes: 0,
        })
    )

    expect(res.status).toBe(200)
    expect(submitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
            title: DEFAULT_CHALLENGE_TITLE,
            userGeneratedContent: {
                text: DEFAULT_CHALLENGE_TITLE,
            },
        }),
    )
})

challengeTest('challenge route: ignores overlong custom titles and falls back to the default title', async () => {
    const sourcePostId = 't3_sourcepost_long_title'
    await redis.hSet(`game:${sourcePostId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
    })

    const submitSpy = vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_generatedtitle' } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'ChallengerUser' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue(stickyComment('t1_lb_generated') as never)

    const res = await withContext(sourcePostId, 't2_challenger', () =>
        challengeRequest({
            timeTaken: 45,
            skillLevel: 3,
            mistakes: 0,
            customTitle: 'a'.repeat(121),
        })
    )

    expect(res.status).toBe(200)
    expect(submitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
            title: DEFAULT_CHALLENGE_TITLE,
            userGeneratedContent: {
                text: DEFAULT_CHALLENGE_TITLE,
            },
        }),
    )
})

challengeTest('challenge route: initializes stats with attempts=0 and beats=0', async () => {
    const sourcePostId = 't3_sourcepost2'
    await redis.hSet(`game:${sourcePostId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
    })

    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_newpost2' } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'ChallengerUser' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue(stickyComment('t1_lb2') as never)

    await withContext(sourcePostId, 't2_challenger', () =>
        challengeRequest({ timeTaken: 45, skillLevel: 3, mistakes: 0 })
    )

    const stats = await redis.hGetAll('game:t3_newpost2:stats')
    expect(stats['attempts']).toBe('0')
    expect(stats['beats']).toBe('0')
})

challengeTest('challenge route: precomputes and stores challenger username and avatar on the puzzle', async () => {
    const sourcePostId = 't3_sourcepost_avatar'
    await redis.hSet(`game:${sourcePostId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
    })
    await redis.set(
        `user:t2_challenger:puzzleStartTime:${sourcePostId}`,
        (Date.now() - 30000).toString()
    )

    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_avatarpost' } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'ChallengerUser' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue(stickyComment('t1_lb_avatar') as never)
    vi.spyOn(reddit, 'getSnoovatarUrl').mockResolvedValue('https://img/challenger.png' as never)

    await withContext(sourcePostId, 't2_challenger', () =>
        challengeRequest({ timeTaken: 45, skillLevel: 3, mistakes: 0 })
    )

    const puzzle = await redis.hGetAll('game:t3_avatarpost:puzzle')
    expect(puzzle['challengeByUsername']).toBe('ChallengerUser')
    expect(puzzle['challengeByAvatar']).toBe('https://img/challenger.png')
})

challengeTest('challenge route: still creates the post when snoovatar lookup fails', async () => {
    const sourcePostId = 't3_sourcepost_noavatar'
    await redis.hSet(`game:${sourcePostId}:puzzle`, {
        colors: 'rbrb', numbers: '----', solution: 'rbrb',
        difficulty: 'easy', gridSize: '4',
    })
    await redis.set(
        `user:t2_challenger:puzzleStartTime:${sourcePostId}`,
        (Date.now() - 30000).toString()
    )

    vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_noavatarpost' } as never)
    vi.spyOn(reddit, 'getUserById').mockResolvedValue({ username: 'ChallengerUser' } as never)
    vi.spyOn(reddit, 'submitComment').mockResolvedValue(stickyComment('t1_lb_noavatar') as never)
    vi.spyOn(reddit, 'getSnoovatarUrl').mockRejectedValue(new Error('no avatar'))

    const res = await withContext(sourcePostId, 't2_challenger', () =>
        challengeRequest({ timeTaken: 45, skillLevel: 3, mistakes: 0 })
    )
    expect(res.status).toBe(200)

    const puzzle = await redis.hGetAll('game:t3_noavatarpost:puzzle')
    expect(puzzle['challengeByUsername']).toBe('ChallengerUser')
    expect(puzzle['challengeByAvatar'] ?? '').toBe('')
})
