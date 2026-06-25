/**
 * Game Route Integration Tests
 * Tests all game API endpoints via app.request() with seeded Redis data.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 9.1, 9.2
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, runWithContext } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { app } from '../../index'
import * as seasons from '../../lib/seasons'
import { getTodayUTC, getISOWeek } from '../../lib/helpers'
import { getUserEconomy, saveUserEconomy } from '../../lib/economy'

// postId is not injected by createDevvitTest — it only sets userId/subreddit.
// We must call runWithContext with a context that includes postId for routes that need it.
// Context() builds a Devvit context from raw headers (reads 'devvit-post' for postId).
// We import it from @devvit/server (re-exported via @devvit/web/server).
import { Context } from '@devvit/server'

const POST_ID = 't3_post1'
const USER_ID = 't2_testuser'
const SOLUTION = 'rbrbbrbrrbbbbrbr'

// Full headers matching what createDevvitTest injects, plus devvit-post
const TEST_HEADERS = {
    'devvit-user': USER_ID,
    'devvit-app-user': USER_ID,
    'devvit-subreddit': 't5_testsub',
    'devvit-subreddit-name': 'testsub',
    'devvit-app': 'test-app',
    'devvit-version': '0.0.0-test',
    'devvit-app-viewer-authorization': 'test-token',
    'devvit-post': POST_ID,
}

const seedPuzzle = async (): Promise<void> => {
    await redis.hSet(`game:${POST_ID}:puzzle`, {
        colors: 'rbrbbrbrrbbbbrbr',
        numbers: '----------------',
        solution: 'rbrbbrbrrbbbbrbr',
        difficulty: 'easy',
        gridSize: '4',
    })
}

// Issue a fresh per-user puzzle instance with a unique instanceId. The server
// credits each issued puzzle at most once (replay protection), so multi-solve
// tests must issue a new instance before each completion — exactly what a real
// "run again" / grid-size switch does. Returns the board to submit.
let instanceCounter = 0
const issueInstance = async (gridSize = '4', solution = SOLUTION): Promise<string> => {
    instanceCounter += 1
    await redis.hSet(`user:${USER_ID}:game:${POST_ID}:currentPuzzle`, {
        colors: solution,
        numbers: '-'.repeat(solution.length),
        solution,
        difficulty: 'easy',
        gridSize,
        instanceId: `inst-${instanceCounter}-${Date.now()}`,
    })
    return solution
}

// Helper: run app.request inside a context that includes postId
const requestWithPost = async (url: string, init?: RequestInit): Promise<Response> => {
    const ctx = Context(TEST_HEADERS)
    return runWithContext(ctx, () => app.request(url, init))
}

// ─── GET /api/game/state ──────────────────────────────────────────────────────

const testState = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.1: GET /api/game/state returns 200 with GameState JSON when puzzle is seeded
 */
testState('GET /api/game/state returns 200 with GameState JSON when puzzle is seeded', async () => {
    await seedPuzzle()

    const res = await requestWithPost('/api/game/state')
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.puzzle).toBeDefined()
    expect(json.skillLevel).toBeDefined()
    expect(json.tutorialCompleted).toBeDefined()
    expect(json.streak).toBeDefined()
})

/**
 * Requirement 5.2: GET /api/game/state returns 400 when postId is missing from context.
 * Note: createDevvitTest always injects a default userId, so the userId guard is not
 * reachable. The postId guard IS reachable — calling without the devvit-post header
 * results in context.postId === undefined → 400.
 */
const testNoPost = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

testNoPost('GET /api/game/state returns 400 when postId is missing', async () => {
    // app.request without runWithContext(Context with postId) → context.postId undefined
    const res = await app.request('/api/game/state')
    expect(res.status).toBe(400)
})

// ─── POST /api/game/complete ──────────────────────────────────────────────────

const testComplete = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.3: POST /api/game/complete returns 200 with expected response fields
 */
testComplete('POST /api/game/complete returns 200 with performanceScore, newSkillLevel, previousSkillLevel, streak, coinReward', async () => {
    await seedPuzzle()
    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 5, board: SOLUTION }),
    })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.performanceScore).toBeDefined()
    expect(json.newSkillLevel).toBeDefined()
    expect(json.previousSkillLevel).toBeDefined()
    expect(json.streak).toBeDefined()
    expect(json.coinReward).toBeDefined()
})

const testCompleteInvalidStr = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.4: POST /api/game/complete returns 400 for non-number timeTaken
 */
testCompleteInvalidStr('POST /api/game/complete returns 400 for non-number timeTaken', async () => {
    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 'bad' }),
    })
    expect(res.status).toBe(400)
})

const testCompleteZero = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.4: POST /api/game/complete returns 400 for timeTaken <= 0
 */
testCompleteZero('POST /api/game/complete returns 400 for timeTaken=0', async () => {
    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 0 }),
    })
    expect(res.status).toBe(400)
})

// ─── POST /api/game/next-challenge ────────────────────────────────────────────

const testNextChallenge = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.5: POST /api/game/next-challenge returns 200 with puzzle and skillLevel
 */
testNextChallenge('POST /api/game/next-challenge returns 200 with puzzle and skillLevel', async () => {
    const res = await requestWithPost('/api/game/next-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeSpent: 3 }),
    })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.puzzle).toBeDefined()
    expect(json.skillLevel).toBeDefined()
})

// ─── GET /api/game/leaderboard ────────────────────────────────────────────────

const testLeaderboard = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.6: GET /api/game/leaderboard returns 200 with type and entries fields
 */
testLeaderboard('GET /api/game/leaderboard returns 200 with type and entries fields', async () => {
    const res = await app.request('/api/game/leaderboard')
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.type).toBeDefined()
    expect(json.entries).toBeDefined()
})


// ─── Daily Preview Update on First Completion ─────────────────────────────────

const testPreviewUpdate = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 6: First completion on a daily post updates the preview data in Redis
 */
testPreviewUpdate('POST /api/game/complete updates daily preview on first completion', async () => {
    await seedPuzzle()
    // Seed a daily preview in Redis (simulating what the scheduler does)
    await redis.hSet(`game:${POST_ID}:preview`, {
        type: 'daily',
        data: JSON.stringify({
            puzzleNumber: 42,
            gridSize: 4,
            completionsToday: 0,
            activeNow: 0,
            fastestTime: null,
            fastestUsername: null,
        }),
    })

    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 30, board: SOLUTION }),
    })
    expect(res.status).toBe(200)

    // Verify preview was updated
    const previewMeta = await redis.hGetAll(`game:${POST_ID}:preview`)
    expect(previewMeta.type).toBe('daily')
    const parsed = JSON.parse(previewMeta.data!)
    expect(parsed.completionsToday).toBe(1)
    expect(parsed.fastestTime).toBe(30)
})

const testPreviewDedup = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 6: Preview update is deduped — second completion does not update preview again
 */
testPreviewDedup('POST /api/game/complete does not update daily preview on second completion (deduped)', async () => {
    await seedPuzzle()
    // Seed a daily preview in Redis
    await redis.hSet(`game:${POST_ID}:preview`, {
        type: 'daily',
        data: JSON.stringify({
            puzzleNumber: 43,
            gridSize: 4,
            completionsToday: 0,
            activeNow: 0,
            fastestTime: null,
            fastestUsername: null,
        }),
    })

    // Set the dedup key to simulate already-updated
    await redis.set(`preview:updated:${POST_ID}`, '1')

    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 20, board: SOLUTION }),
    })
    expect(res.status).toBe(200)

    // Verify preview was NOT updated (still shows 0 completions)
    const previewMeta = await redis.hGetAll(`game:${POST_ID}:preview`)
    const parsed = JSON.parse(previewMeta.data!)
    expect(parsed.completionsToday).toBe(0)
    expect(parsed.fastestTime).toBeNull()
})

const testPreviewNonDaily = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 6: Preview update only applies to daily posts, not challenge posts
 */
testPreviewNonDaily('POST /api/game/complete does not update preview for challenge posts', async () => {
    await seedPuzzle()
    // Seed a challenge preview (not daily)
    await redis.hSet(`game:${POST_ID}:preview`, {
        type: 'challenge',
        data: JSON.stringify({
            challengerUsername: 'testuser',
            challengerTime: 42,
            gridSize: 4,
            puzzleGridEmoji: '🟥🟦🟥🟦',
            beatsCount: 0,
            attemptsCount: 0,
            fastestTime: null,
        }),
    })

    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 15, board: SOLUTION }),
    })
    expect(res.status).toBe(200)

    // Verify no dedup key was set (preview update logic was skipped)
    const dedupKey = await redis.get(`preview:updated:${POST_ID}`)
    expect(dedupKey).toBeUndefined()
})

// ─── Difficulty-Weighted Scoring: reworked completion flow ────────────────────
// Feature: difficulty-weighted-scoring (task 7.3)
// Requirements: 4.1, 5.1, 5.5, 5.6, 6.5

/** Re-seed the post puzzle hash at a given grid size (drives the scored bucket). */
const seedPuzzleGrid = async (gridSize: string): Promise<void> => {
    await redis.hSet(`game:${POST_ID}:puzzle`, {
        colors: 'rbrbbrbrrbbbbrbr',
        numbers: '----------------',
        solution: 'rbrbbrbrrbbbbrbr',
        difficulty: 'easy',
        gridSize,
    })
}

const COMPLETE_INIT = (timeTaken: number, mistakes = 0): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeTaken, mistakes, board: SOLUTION }),
})

// gridSize reaches the route via the seeded puzzle hash (getCurrentPuzzle reads
// game:{postId}:puzzle), not the request body — so we re-seed to switch buckets.

const testDifficultyPays = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 4.1 / 2.x: a 6×6 completion records more coins and more season
 * points than an equivalent 4×4 completion (same time, same mistakes).
 */
testDifficultyPays('POST /api/game/complete: 6×6 records more coins and season points than an equivalent 4×4', async () => {
    const season = seasons.getCurrentSeason()
    const leaderboardKey = `season:${season.seasonId}:leaderboard`
    const solvesKey = `user:${USER_ID}:seasonSolves:${getTodayUTC()}`

    // ── 4×4 completion. It is the day's first solve, so it also collects the
    //    daily-first coin bonus — beating it with the 6×6 is therefore a
    //    conservative, robust comparison. ──
    await issueInstance('4')
    const before4 = (await redis.zScore(leaderboardKey, USER_ID)) ?? 0
    const res4 = await requestWithPost('/api/game/complete', COMPLETE_INIT(20))
    expect(res4.status).toBe(200)
    const json4 = await res4.json()
    const after4 = (await redis.zScore(leaderboardKey, USER_ID)) ?? 0
    const seasonDelta4 = after4 - before4

    // Reset the daily solve counter so the 6×6 solve is also index 1 (full
    // value) — isolates grid difficulty from the daily-decay confound.
    await redis.del(solvesKey)

    // ── 6×6 completion at the same time/mistakes (fresh issued instance). ──
    await issueInstance('6')
    const before6 = (await redis.zScore(leaderboardKey, USER_ID)) ?? 0
    const res6 = await requestWithPost('/api/game/complete', COMPLETE_INIT(20))
    expect(res6.status).toBe(200)
    const json6 = await res6.json()
    const after6 = (await redis.zScore(leaderboardKey, USER_ID)) ?? 0
    const seasonDelta6 = after6 - before6

    // Coins: the authored base and the resulting total are both higher for the
    // larger grid.
    expect(json6.coinReward.base).toBeGreaterThan(json4.coinReward.base)
    expect(json6.coinReward.total).toBeGreaterThan(json4.coinReward.total)

    // Season points: the 6×6 solve is awarded strictly more than the 4×4 solve.
    // (seasonPoints in the response is the cumulative leaderboard score, so we
    // compare the per-solve deltas read from the leaderboard zset.)
    expect(seasonDelta6).toBeGreaterThan(seasonDelta4)
})

const testRepeatedSolvesDecay = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.5: repeated same-day season-counted solves award progressively
 * fewer points (daily decay) but never zero (positive floor).
 */
testRepeatedSolvesDecay('POST /api/game/complete: repeated same-day solves award progressively fewer (never zero) season points', async () => {
    const season = seasons.getCurrentSeason()
    const leaderboardKey = `season:${season.seasonId}:leaderboard`

    // Solve four fresh puzzle instances in a row (each "run again" issues a new
    // instance). The bucket is stable across these solves (a handful of fast
    // solves can't promote/demote level), so only the daily-decay factor
    // changes the awarded points.
    const deltas: number[] = []
    for (let i = 0; i < 4; i++) {
        await issueInstance('4')
        const before = (await redis.zScore(leaderboardKey, USER_ID)) ?? 0
        const res = await requestWithPost('/api/game/complete', COMPLETE_INIT(20))
        expect(res.status).toBe(200)
        const after = (await redis.zScore(leaderboardKey, USER_ID)) ?? 0
        deltas.push(after - before)
    }

    // Each subsequent solve is worth strictly less than the previous one …
    for (let i = 1; i < deltas.length; i++) {
        expect(deltas[i]!).toBeLessThan(deltas[i - 1]!)
    }
    // … and the last solve still awards a positive (floored) amount.
    expect(deltas[deltas.length - 1]!).toBeGreaterThan(0)
})

const testLoggedOutComplete = createDevvitTest({
    subredditName: 'testsub',
})

/**
 * Requirement 6.5: a genuinely logged-out completion (no userId) succeeds with
 * no errors and writes no per-user season state.
 */
testLoggedOutComplete('POST /api/game/complete: logged-out completion succeeds and writes no season counter', async () => {
    // Context with NO userId — simulates a logged-out Reddit viewer.
    const loggedOutCtx = {
        postId: POST_ID,
        subredditId: 't5_testsub',
        subredditName: 'testsub',
    } as Parameters<typeof runWithContext>[0]

    await seedPuzzleGrid('4')

    const res = await runWithContext(loggedOutCtx, () =>
        app.request('/api/game/complete', COMPLETE_INIT(20)),
    )
    expect(res.status).toBe(200)

    const json = await res.json()
    // Logged-out result is returned but nothing account-scoped is persisted.
    expect(json.isLoggedIn).toBe(false)
    expect(json.coinReward).toBeUndefined()
    expect(json.seasonPoints).toBeUndefined()

    // No per-user season leaderboard row was created (no userId to key on, so
    // the season block — and its seasonSolves counter — is never reached).
    const season = seasons.getCurrentSeason()
    const entries = await redis.zCard(`season:${season.seasonId}:leaderboard`)
    expect(entries).toBe(0)
})

const testMigrateLoggedOut = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.1 / 6.5: the migrate-logged-out-score route credits the
 * now-logged-in user — it returns 200 and writes the season counter for that
 * user (the only logged-out-related route that persists season state).
 */
testMigrateLoggedOut('POST /api/game/migrate-logged-out-score: credits the user and writes the season counter', async () => {
    await seedPuzzleGrid('4')

    const res = await requestWithPost('/api/game/migrate-logged-out-score', COMPLETE_INIT(20))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.migrated).toBe(true)
    expect(json.coinReward).toBeDefined()
    expect(json.seasonPoints).toBeGreaterThan(0)

    // The Daily_Solve_Index counter is written exactly once for this solve.
    const counter = await redis.get(`user:${USER_ID}:seasonSolves:${getTodayUTC()}`)
    expect(counter).toBe('1')
})

const testSeasonInactive = createDevvitTest({
    userId: USER_ID,
    subredditName: 'testsub',
})

/**
 * Requirement 5.6: when no season is active, no seasonSolves counter is written
 * and the completion still succeeds.
 *
 * Note: getCurrentSeason() derives isActive from the real UTC date and every
 * week is a season, so there is no real date that yields isActive=false. We
 * therefore stub getCurrentSeason — matching the codebase's vi.spyOn
 * convention — to exercise the season-inactive branch through the route.
 */
testSeasonInactive('POST /api/game/complete: season inactive writes no counter and still succeeds', async () => {
    await seedPuzzleGrid('4')

    const realSeason = seasons.getCurrentSeason()
    const spy = vi
        .spyOn(seasons, 'getCurrentSeason')
        .mockReturnValue({ ...realSeason, isActive: false })

    try {
        const res = await requestWithPost('/api/game/complete', COMPLETE_INIT(20))
        expect(res.status).toBe(200)

        const json = await res.json()
        // Completion still succeeds; no season points are awarded.
        expect(json.coinReward).toBeDefined()
        expect(json.seasonPoints).toBeUndefined()

        // The Daily_Solve_Index counter must NOT be written when inactive.
        const counter = await redis.get(`user:${USER_ID}:seasonSolves:${getTodayUTC()}`)
        expect(counter).toBeUndefined()

        // And no season leaderboard row was created.
        const entries = await redis.zCard(`season:${realSeason.seasonId}:leaderboard`)
        expect(entries).toBe(0)
    } finally {
        spy.mockRestore()
    }
})

// ─── Anti-cheat: server-side solution verification (C1) ──────────────────────

const testForgedBoard = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

/**
 * A completion whose board does not equal the puzzle's solution is rejected and
 * awards nothing — the server never takes the client's word that it solved.
 */
testForgedBoard('POST /api/game/complete rejects a board that is not the solution', async () => {
    await seedPuzzle()

    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // A forged "fast" completion with a wrong board.
        body: JSON.stringify({ timeTaken: 1, board: 'bbbbrrrrbbbbrrrr' }),
    })
    expect(res.status).toBe(400)

    // Nothing was credited: no solve counter, no season row, no speed entry.
    const econ = await getUserEconomy(USER_ID)
    expect(econ.totalSolves).toBe(0)
    expect(econ.coins).toBe(0)

    const season = seasons.getCurrentSeason()
    expect(await redis.zCard(`season:${season.seasonId}:leaderboard`)).toBe(0)
    expect(await redis.zCard(`leaderboard:speed:${getTodayUTC()}:4`)).toBe(0)
})

const testMissingBoard = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

testMissingBoard('POST /api/game/complete rejects a completion with no board', async () => {
    await seedPuzzle()

    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 10 }),
    })
    expect(res.status).toBe(400)
})

// ─── Anti-farm: completion is idempotent per issued puzzle (C2) ──────────────

const testReplay = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

/**
 * Replaying the same solved board is rejected (409), so coins/season/solves are
 * credited exactly once per issued puzzle.
 */
testReplay('POST /api/game/complete credits a puzzle once and rejects replays', async () => {
    await seedPuzzle()

    const first = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 20, board: SOLUTION }),
    })
    expect(first.status).toBe(200)
    const coinsAfterFirst = (await getUserEconomy(USER_ID)).coins
    expect((await getUserEconomy(USER_ID)).totalSolves).toBe(1)

    const replay = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 20, board: SOLUTION }),
    })
    expect(replay.status).toBe(409)

    // No double-credit.
    const econ = await getUserEconomy(USER_ID)
    expect(econ.totalSolves).toBe(1)
    expect(econ.coins).toBe(coinsAfterFirst)
})

const testRunAgainCredits = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

/**
 * A genuinely new puzzle instance (as issued by "run again") is credited again
 * — idempotency is per-instance, not per-post.
 */
testRunAgainCredits('POST /api/game/complete credits a fresh instance after run-again', async () => {
    await issueInstance('4')
    const r1 = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 20, board: SOLUTION }),
    })
    expect(r1.status).toBe(200)

    await issueInstance('4')
    const r2 = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 20, board: SOLUTION }),
    })
    expect(r2.status).toBe(200)

    expect((await getUserEconomy(USER_ID)).totalSolves).toBe(2)
})

// ─── Weekly leaderboard counts completions (M1) ──────────────────────────────

const testWeekly = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

testWeekly('POST /api/game/complete increments the weekly completion count', async () => {
    const weeklyKey = `leaderboard:weekly:${getISOWeek()}`

    await issueInstance('4')
    await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 20, board: SOLUTION }),
    })
    expect(await redis.zScore(weeklyKey, USER_ID)).toBe(1)

    await issueInstance('4')
    await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 20, board: SOLUTION }),
    })
    // Must increment to 2 (the old zAdd-score-1 bug would leave it pinned at 1).
    expect(await redis.zScore(weeklyKey, USER_ID)).toBe(2)
})

// ─── Completion does not clobber owned/equipped titles (H2) ──────────────────

const testTitlePersists = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

testTitlePersists('POST /api/game/complete preserves owned and equipped titles', async () => {
    await seedPuzzle()
    await saveUserEconomy(USER_ID, {
        coins: 0,
        ownedTitles: ['puzzler', 'streak_lord'],
        equippedTitle: 'streak_lord',
    })

    const res = await requestWithPost('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeTaken: 20, board: SOLUTION }),
    })
    expect(res.status).toBe(200)

    const econ = await getUserEconomy(USER_ID)
    expect(econ.ownedTitles).toContain('streak_lord')
    expect(econ.equippedTitle).toBe('streak_lord')
})
