/**
 * Game API Routes
 * Handles game state, puzzle completion, and adaptive difficulty
 */

import { Hono } from 'hono'
import { context, redis, reddit } from '@devvit/web/server'
import type {
	GameState,
	NextChallengeResponse,
	CompleteRequest,
	CompleteResponse,
	GameRecord,
	StreakData,
	LeaderboardData,
	LeaderboardEntry,
	ShareRequest,
	ShareResponse,
	ChallengeRequest,
	ChallengeResponse,
	SerializedPuzzle,
	GridSizeResponse,
} from '../../shared/types'
import { MIN_SKILL_LEVEL, getGridLevelConfig, isValidGridSize } from '../../shared/constants'
import type { GridSize } from '../../shared/constants'
import { generatePuzzle } from '../lib/generator'
import {
	calculatePerformanceScore,
	determineSkillLevel,
	addGameRecord,
	shouldForceDemotion,
} from '../lib/adaptive'
import { calculateCoinReward } from '../lib/economy'
import type { CoinReward } from '../../shared/types'
import { getUserEconomy } from '../lib/economy'
import {
	getTodayUTC,
	getDayDifference,
	fetchUsername,
	updateLoginStreak,
	getGridSizePreference,
	setGridSizePreference,
	getGridSkillLevel,
	setGridSkillLevel,
	getGridHistory,
	setGridHistory,
} from '../lib/helpers'
import { isUserMigrated, migrateUserToPerGrid } from '../lib/migration'

export const gameRouter = new Hono()

// ─── checkChallengeBeat ──────────────────────────────────────────────────────

/**
 * Update the leaderboard comment for a challenge post.
 * Fetches current stats and edits the pinned comment in place.
 */
async function updateLeaderboardComment(postId: string): Promise<void> {
	try {
		const [stats, meta] = await Promise.all([
			redis.hGetAll(`game:${postId}:stats`),
			redis.hGetAll(`game:${postId}:meta`),
		])

		const leaderboardCommentId = meta['leaderboardCommentId']
		if (!leaderboardCommentId) return

		const attempts = stats['attempts'] ?? '0'
		const beats = stats['beats'] ?? '0'
		const fastestTime = stats['fastestTime'] ?? null
		const championId = stats['championId'] ?? null

		// Fetch champion username
		let championName = '--'
		if (championId) {
			try {
				const user = await reddit.getUserById(championId as `t2_${string}`)
				championName = user?.username ?? '--'
			} catch { /* fallback */ }
		}

		const leaderboardText = `🏆 **Challenge Leaderboard**

👥 Attempts: ${attempts}
✅ Beaten: ${beats} times
${fastestTime ? `⏱️ Fastest: ${fastestTime}s` : '⏱️ Fastest: --'}
${fastestTime ? `👑 Champion: u/${championName}` : '👑 Champion: --'}

Think you can beat it? Play above! 🎯`

		const comment = await reddit.getCommentById(leaderboardCommentId as `t1_${string}`)
		await comment.edit({ text: leaderboardText })
	} catch (err) {
		console.error('Failed to update leaderboard comment:', err)
	}
}

/**
 * Check if a puzzle completion beats the challenge score for this post.
 * If beaten, notifies the original challenger via a Reddit comment.
 */
async function checkChallengeBeat(postId: string, winnerId: string, timeTaken: number): Promise<void> {
	try {
		const puzzleMeta = await redis.hGetAll(`game:${postId}:puzzle`)
		if (!puzzleMeta?.challengeBy || !puzzleMeta?.challengeScore) return

		const challengeScore = parseInt(puzzleMeta.challengeScore, 10)
		const challengerId = puzzleMeta.challengeBy

		// Only trigger if winner is not the original challenger and their time is faster
		if (winnerId === challengerId) return
		if (timeTaken >= challengeScore) return

		// Check dedup before writing stats
		const notifyKey = `challenge:${postId}:beaten:${winnerId}`
		const alreadyNotified = await redis.get(notifyKey)
		if (alreadyNotified === 'true') return

		// Increment beats counter
		await redis.hIncrBy(`game:${postId}:stats`, 'beats', 1)

		// Update fastest time if this is a new record
		const currentFastest = await redis.hGet(`game:${postId}:stats`, 'fastestTime')
		if (!currentFastest || timeTaken < parseInt(currentFastest, 10)) {
			await redis.hSet(`game:${postId}:stats`, {
				fastestTime: timeTaken.toString(),
				championId: winnerId,
			})
		}

		// Update the leaderboard comment
		await updateLeaderboardComment(postId)

		// Mark beat as recorded — after stats are written so partial failure doesn't lose data
		await redis.set(notifyKey, 'true')
		await redis.expire(notifyKey, 2592000) // 30-day TTL — matches speed leaderboard retention




	} catch (err) {
		console.error('checkChallengeBeat error:', err)
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a puzzle at the given grid size and per-grid skill level.
 */
const generatePuzzleForGridLevel = (gridSize: GridSize, level: number): SerializedPuzzle => {
	const config = getGridLevelConfig(gridSize, level)
	return generatePuzzle(config.difficulty, config.gridSize)
}

/**
 * Get the current puzzle data for a user.
 */
const getCurrentPuzzle = async (
	postId: string,
	userId: string
): Promise<{
	colors: string
	numbers: string
	solution: string
	difficulty: string
	gridSize: string
} | null> => {
	const userPuzzle = await redis.hGetAll(`user:${userId}:game:${postId}:currentPuzzle`)
	if (userPuzzle && userPuzzle.colors) {
		return {
			colors: userPuzzle.colors,
			numbers: userPuzzle.numbers ?? '',
			solution: userPuzzle.solution ?? '',
			difficulty: userPuzzle.difficulty ?? 'easy',
			gridSize: userPuzzle.gridSize ?? '4',
		}
	}

	const puzzle = await redis.hGetAll(`game:${postId}:puzzle`)
	if (!puzzle || !puzzle.colors) return null

	return {
		colors: puzzle.colors,
		numbers: puzzle.numbers ?? '',
		solution: puzzle.solution ?? '',
		difficulty: puzzle.difficulty ?? 'easy',
		gridSize: puzzle.gridSize ?? '4',
	}
}

/**
 * Get the user's current streak data from Redis.
 */
const getStreakData = async (userId: string): Promise<StreakData> => {
	const [currentStr, longestStr, lastDate] = await Promise.all([
		redis.get(`user:${userId}:streak:current`),
		redis.get(`user:${userId}:streak:longest`),
		redis.get(`user:${userId}:streak:lastDate`),
	])

	return {
		currentStreak: currentStr ? parseInt(currentStr, 10) : 0,
		longestStreak: longestStr ? parseInt(longestStr, 10) : 0,
		lastPlayedDate: lastDate ?? null,
	}
}

/**
 * Update the user's streak based on completion.
 * Uses 1-day grace period (48 hours).
 * Streak freeze protects streak when dayDiff > 2.
 */
const updateStreak = async (userId: string): Promise<StreakData> => {
	const today = getTodayUTC()
	const streakData = await getStreakData(userId)

	if (streakData.lastPlayedDate === today) {
		return streakData
	}

	let newStreak = 1

	if (streakData.lastPlayedDate) {
		const dayDiff = getDayDifference(streakData.lastPlayedDate, today)
		if (dayDiff === 1 || dayDiff === 2) {
			newStreak = streakData.currentStreak + 1
		} else if (dayDiff > 2) {
			// Streak would break - check for freeze
			const economy = await getUserEconomy(userId)
			if (economy.streakFreezes > 0) {
				// Use a freeze - keep current streak, consume one freeze
				await redis.hIncrBy(`user:${userId}:economy`, 'streakFreezes', -1)
				newStreak = streakData.currentStreak + 1
			}
		}
	}

	const newLongest = Math.max(newStreak, streakData.longestStreak)

	await Promise.all([
		redis.set(`user:${userId}:streak:current`, newStreak.toString()),
		redis.set(`user:${userId}:streak:longest`, newLongest.toString()),
		redis.set(`user:${userId}:streak:lastDate`, today),
	])

	return {
		currentStreak: newStreak,
		longestStreak: newLongest,
		lastPlayedDate: today,
	}
}

type CoinRewardContext = {
	userId: string
	timeTaken: number
	currentLevel: number
	streak: StreakData
	mistakes: number
	gridSize: GridSize
}

/**
 * Apply coin reward for a completed puzzle and persist economy data.
 */
const applyCoinReward = async (ctx: CoinRewardContext): Promise<CoinReward> => {
	const today = getTodayUTC()
	const economyKey = `user:${ctx.userId}:economy`
	const economyData = await redis.hGetAll(economyKey)
	const lastDailySolve = economyData?.dailyFirstSolve ?? null
	const isDailyFirst = lastDailySolve !== today

	// Track login streak and get consecutive days (only matters on first daily solve)
	const consecutiveLoginDays = await updateLoginStreak(ctx.userId, isDailyFirst)

	const coinReward = calculateCoinReward(
		ctx.timeTaken,
		ctx.currentLevel,
		ctx.streak.currentStreak,
		isDailyFirst,
		ctx.mistakes,
		consecutiveLoginDays,
		ctx.gridSize
	)

	// Atomic increments for coins (prevents race conditions)
	const [, newTotalCoins] = await Promise.all([
		redis.hIncrBy(economyKey, 'coins', coinReward.total),
		redis.hIncrBy(economyKey, 'totalCoins', coinReward.total),
	])

	// Atomic increments for solve counters (prevents race conditions)
	await redis.hIncrBy(economyKey, 'totalSolves', 1)
	if (coinReward.speedBonus > 0) {
		await redis.hIncrBy(economyKey, 'speedSolves', 1)
	}

	// Update non-atomic fields with hSet
	await redis.hSet(economyKey, {
		ownedTitles: economyData?.ownedTitles ?? '["puzzler"]',
		equippedTitle: economyData?.equippedTitle ?? 'puzzler',
		dailyFirstSolve: isDailyFirst ? today : (lastDailySolve ?? ''),
	})
	// Update coins leaderboard
	await redis.zAdd('leaderboard:coins', { score: newTotalCoins, member: ctx.userId })

	return coinReward
}

// ─── GET /api/game/state ─────────────────────────────────────────────────────

gameRouter.get('/api/game/state', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		// Run one-time migration for existing users
		const migrated = await isUserMigrated(userId)
		if (!migrated) {
			await migrateUserToPerGrid(userId)
		}

		// Read grid size preference (set by migration or user selection)
		const gridSizePreference = await getGridSizePreference(userId)

		let puzzle = await getCurrentPuzzle(postId, userId)

		if (!puzzle) {
			const postPuzzle = await redis.hGetAll(`game:${postId}:puzzle`)
			if (postPuzzle && postPuzzle.colors) {
				puzzle = {
					colors: postPuzzle.colors,
					numbers: postPuzzle.numbers ?? '',
					solution: postPuzzle.solution ?? '',
					difficulty: postPuzzle.difficulty ?? 'easy',
					gridSize: postPuzzle.gridSize ?? '4',
				}
			} else {
				return c.json({ error: 'Game not found' }, 404)
			}
		}

		// Determine if this is a challenge post (has baked-in grid size)
		const postPuzzleMeta = await redis.hGetAll(`game:${postId}:puzzle`)
		const isChallenge = Boolean(postPuzzleMeta?.challengeBy)

		// For non-challenge posts, generate a fresh puzzle at the user's preferred grid size
		// if the stored puzzle doesn't match the preference
		if (!isChallenge) {
			const storedGridSize = parseInt(puzzle.gridSize, 10)
			if (storedGridSize !== gridSizePreference) {
				const skillLevel = await getGridSkillLevel(userId, gridSizePreference)
				const newPuzzle = generatePuzzleForGridLevel(gridSizePreference, skillLevel)
				await redis.hSet(`user:${userId}:game:${postId}:currentPuzzle`, {
					colors: newPuzzle.colors,
					numbers: newPuzzle.numbers,
					solution: newPuzzle.solution,
					difficulty: newPuzzle.difficulty,
					gridSize: newPuzzle.gridSize.toString(),
				})
				puzzle = {
					colors: newPuzzle.colors,
					numbers: newPuzzle.numbers,
					solution: newPuzzle.solution,
					difficulty: newPuzzle.difficulty,
					gridSize: newPuzzle.gridSize.toString(),
				}
			}
		}

		// Determine skill level: per-grid for non-challenge, from puzzle for challenge
		const effectiveGridSize = isChallenge
			? (parseInt(puzzle.gridSize, 10) as GridSize)
			: gridSizePreference
		const skillLevel = await getGridSkillLevel(userId, effectiveGridSize)

		const tutorialCompleted = (await redis.get(`user:${userId}:tutorialCompleted`)) === 'true'
		const streak = await getStreakData(userId)

		// Fetch username for consent dialog display
		let username: string | undefined
		try {
			const user = await reddit.getUserById(userId as `t2_${string}`)
			username = user?.username
		} catch {
			// non-critical
		}

		// Record start time for server-side time tracking (security fix)
		const startTimeKey = `user:${userId}:puzzleStartTime:${postId}`
		await redis.set(startTimeKey, Date.now().toString())
		await redis.expire(startTimeKey, 86400)

		const serializedPuzzle: SerializedPuzzle = {
			colors: puzzle.colors,
			numbers: puzzle.numbers,
			solution: puzzle.solution,
			difficulty: puzzle.difficulty as 'easy' | 'medium' | 'hard' | 'diabolical',
			gridSize: parseInt(puzzle.gridSize, 10),
		}

		const gameState: GameState = {
			puzzle: serializedPuzzle,
			tutorialCompleted,
			skillLevel,
			gridSizePreference,
			isChallenge,
			streak,
			...(username !== undefined && { username }),
		}

		return c.json(gameState)
	} catch (error) {
		console.error('Error fetching game state:', error)
		return c.json({ error: 'Failed to fetch game state' }, 500)
	}
})

// ─── POST /api/game/grid-size ─────────────────────────────────────────────────

gameRouter.post('/api/game/grid-size', async (c) => {
	const { postId, userId } = context

	if (!userId) return c.json({ error: 'User ID is required' }, 400)
	if (!postId) return c.json({ error: 'Post ID is required' }, 400)

	try {
		const body = await c.req.json().catch(() => null)
		if (!body || typeof body !== 'object') {
			return c.json({ error: 'Invalid request body' }, 400)
		}

		const { gridSize: rawGridSize } = body as Record<string, unknown>
		const parsed = typeof rawGridSize === 'number' ? rawGridSize : parseInt(String(rawGridSize), 10)

		if (!isValidGridSize(parsed)) {
			return c.json({ error: 'Invalid grid size. Must be 4, 6, or 8.' }, 400)
		}

		const gridSize: GridSize = parsed

		// Persist preference
		await setGridSizePreference(userId, gridSize)

		// Read per-grid skill level
		const skillLevel = await getGridSkillLevel(userId, gridSize)

		// Generate a new puzzle at the selected grid size and skill level
		const newPuzzle = generatePuzzleForGridLevel(gridSize, skillLevel)

		// Store puzzle for this user/post
		if (postId) {
			await redis.hSet(`user:${userId}:game:${postId}:currentPuzzle`, {
				colors: newPuzzle.colors,
				numbers: newPuzzle.numbers,
				solution: newPuzzle.solution,
				difficulty: newPuzzle.difficulty,
				gridSize: newPuzzle.gridSize.toString(),
			})
		}

		const response: GridSizeResponse = {
			puzzle: newPuzzle,
			skillLevel,
			gridSizePreference: gridSize,
		}

		return c.json(response)
	} catch (error) {
		console.error('Error setting grid size:', error)
		return c.json({ error: 'Failed to set grid size' }, 500)
	}
})

// ─── GET /api/game/streak ────────────────────────────────────────────────────

gameRouter.get('/api/game/streak', async (c) => {
	const { userId } = context

	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const streak = await getStreakData(userId)
		return c.json(streak)
	} catch (error) {
		console.error('Error fetching streak:', error)
		return c.json({ error: 'Failed to fetch streak' }, 500)
	}
})

// ─── POST /api/game/complete ─────────────────────────────────────────────────

gameRouter.post('/api/game/complete', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const body: CompleteRequest = await c.req.json()
		const { mistakes = 0 } = body

		// Server-side time tracking (security fix)
		const startTimeKey = `user:${userId}:puzzleStartTime:${postId}`
		const startTimeStr = await redis.get(startTimeKey)
		let timeTaken: number

		if (startTimeStr) {
			timeTaken = Math.round((Date.now() - parseInt(startTimeStr, 10)) / 1000)
			await redis.del(startTimeKey)
		} else {
			const clientTime = body.timeTaken
			if (typeof clientTime !== 'number' || clientTime <= 0) {
				return c.json({ error: 'Invalid timeTaken' }, 400)
			}
			timeTaken = clientTime
		}

		if (timeTaken <= 0) {
			return c.json({ error: 'Invalid timeTaken' }, 400)
		}

		// Read grid size from the completed puzzle
		const puzzle = await getCurrentPuzzle(postId, userId)
		const rawGridSize = puzzle ? parseInt(puzzle.gridSize, 10) : 4
		const gridSize: GridSize = isValidGridSize(rawGridSize) ? rawGridSize : 4

		const currentLevel = await getGridSkillLevel(userId, gridSize)
		const history = await getGridHistory(userId, gridSize)

		const performanceScore = calculatePerformanceScore(timeTaken, currentLevel, mistakes, gridSize)

		const record: GameRecord = {
			level: currentLevel,
			timeTaken,
			timestamp: Date.now(),
		}
		const updatedHistory = addGameRecord(history, record)
		const newSkillLevel = determineSkillLevel(currentLevel, updatedHistory)
		const streak = await updateStreak(userId)

		const coinReward = await applyCoinReward({ userId, timeTaken, currentLevel, streak, mistakes, gridSize })

		const today = getTodayUTC()
		await Promise.all([
			redis.zAdd('leaderboard:streak', { score: streak.currentStreak, member: userId }),
			redis.zAdd(`leaderboard:speed:${today}:${gridSize}`, { score: timeTaken, member: userId }),
			redis.expire(`leaderboard:speed:${today}:${gridSize}`, 2592000), // 30-day TTL
		])

		// Update per-grid skill level and history
		await setGridSkillLevel(userId, gridSize, newSkillLevel)
		await setGridHistory(
			userId,
			gridSize,
			newSkillLevel !== currentLevel ? [] : updatedHistory
		)
		await redis.set(`user:${userId}:consecutiveSkips:${gridSize}`, '0')

		// Track attempts on challenge posts (once per user)
		const puzzleMeta = await redis.hGetAll(`game:${postId}:puzzle`)
		if (puzzleMeta?.challengeBy) {
			const attemptedKey = `challenge:${postId}:attempted:${userId}`
			const alreadyAttempted = await redis.get(attemptedKey)
			if (!alreadyAttempted) {
				await redis.hIncrBy(`game:${postId}:stats`, 'attempts', 1)
				await redis.set(attemptedKey, 'true')
				await redis.expire(attemptedKey, 2592000) // 30-day TTL
			}
		}

		// Check if this is a challenge post and if the player beat the challenge
		await checkChallengeBeat(postId, userId, timeTaken)

		const response: CompleteResponse = {
			performanceScore,
			newSkillLevel,
			previousSkillLevel: currentLevel,
			streak,
			coinReward,
		}

		return c.json(response)
	} catch (error) {
		console.error('Error completing game:', error)
		return c.json({ error: 'Failed to record completion' }, 500)
	}
})

// ─── POST /api/game/next-challenge ───────────────────────────────────────────

gameRouter.post('/api/game/next-challenge', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		let timeSpent = 0
		try {
			const body = await c.req.json<{ timeSpent?: number }>()
			if (typeof body.timeSpent === 'number' && body.timeSpent >= 0) {
				timeSpent = body.timeSpent
			}
		} catch {
			// No body or invalid JSON — treat as instant skip (timeSpent = 0)
		}

		// Use grid size preference for per-grid tracking
		const gridSizePreference = await getGridSizePreference(userId)
		let currentLevel = await getGridSkillLevel(userId, gridSizePreference)
		const history = await getGridHistory(userId, gridSizePreference)

		const skipRecord: GameRecord = {
			level: currentLevel,
			timeTaken: timeSpent,
			timestamp: Date.now(),
			skipped: true,
		}
		const updatedHistory = addGameRecord(history, skipRecord)

		const skipCountKey = `user:${userId}:consecutiveSkips:${gridSizePreference}`
		const prevSkips = await redis.get(skipCountKey)
		const consecutiveSkips = (prevSkips ? parseInt(prevSkips, 10) : 0) + 1
		await redis.set(skipCountKey, consecutiveSkips.toString())

		let newLevel: number
		if (shouldForceDemotion(consecutiveSkips)) {
			newLevel = Math.max(MIN_SKILL_LEVEL, currentLevel - 1)
			await redis.set(skipCountKey, '0')
		} else {
			newLevel = determineSkillLevel(currentLevel, updatedHistory)
		}

		await setGridSkillLevel(userId, gridSizePreference, newLevel)
		await setGridHistory(userId, gridSizePreference, updatedHistory)

		const newPuzzle = generatePuzzleForGridLevel(gridSizePreference, newLevel)

		await redis.hSet(`user:${userId}:game:${postId}:currentPuzzle`, {
			colors: newPuzzle.colors,
			numbers: newPuzzle.numbers,
			solution: newPuzzle.solution,
			difficulty: newPuzzle.difficulty,
			gridSize: newPuzzle.gridSize.toString(),
		})

		const response: NextChallengeResponse = {
			puzzle: newPuzzle,
			skillLevel: newLevel,
			gridSizePreference,
		}

		return c.json(response)
	} catch (error) {
		console.error('Error generating next challenge:', error)
		return c.json({ error: 'Failed to generate next challenge' }, 500)
	}
})

// ─── GET /api/game/leaderboard ───────────────────────────────────────────────

gameRouter.get('/api/game/leaderboard', async (c) => {
	const { userId } = context
	const type = (c.req.query('type') || 'streak') as 'streak' | 'speed'

	try {
		let entries: LeaderboardEntry[] = []
		let userRank: number | undefined

		if (type === 'streak') {
			const topUsers = await redis.zRange('leaderboard:streak', 0, 9, { reverse: true, by: 'rank' })

			const entriesPromises = topUsers.map(async (item, i) => {
				const memberId = item.member
				const score = item.score
				const username = await fetchUsername(memberId, userId)

				if (userId && memberId === userId) {
					userRank = i + 1
				}

				return { rank: i + 1, userId: memberId, username, score }
			})

			entries = await Promise.all(entriesPromises)
		} else if (type === 'speed') {
			const today = getTodayUTC()
			// Speed leaderboard is scoped by the user's grid size preference
			const gridSizePreference = userId ? await getGridSizePreference(userId) : 4
			const topUsers = await redis.zRange(`leaderboard:speed:${today}:${gridSizePreference}`, 0, 9, { by: 'rank' })

			const entriesPromises = topUsers.map(async (item, i) => {
				const memberId = item.member
				const score = item.score
				const username = await fetchUsername(memberId, userId)

				if (userId && memberId === userId) {
					userRank = i + 1
				}

				return { rank: i + 1, userId: memberId, username, score }
			})

			entries = await Promise.all(entriesPromises)
		}

		const leaderboard: LeaderboardData = {
			type,
			entries,
			...(userRank !== undefined && { userRank }),
		}

		return c.json(leaderboard)
	} catch (error) {
		console.error('Error fetching leaderboard:', error)
		return c.json({ error: 'Failed to fetch leaderboard' }, 500)
	}
})

// ─── POST /api/game/share ────────────────────────────────────────────────────

gameRouter.post('/api/game/share', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const body: ShareRequest = await c.req.json()
		const { timeTaken, streak, puzzleColors, gridSize, skillLevel, mistakes } = body

		const sharedKey = `user:${userId}:shared:${postId}`
		const alreadyShared = await redis.get(sharedKey)

		if (alreadyShared === 'true') {
			return c.json({ success: false, alreadyShared: true })
		}

		// Fetch current username for attribution
		let sharerUsername = 'Anon'
		try {
			const user = await reddit.getUserById(userId as `t2_${string}`)
			sharerUsername = user?.username ?? 'Anon'
		} catch { /* fallback */ }

		// Build emoji grid
		const emojiMap: Record<string, string> = { r: '🟥', b: '🟦' }
		const cells = puzzleColors.split('').map((ch) => emojiMap[ch] ?? '⬛')
		const rows: string[] = []
		for (let i = 0; i < cells.length; i += gridSize) {
			rows.push(cells.slice(i, i + gridSize).join(''))
		}
		const emojiGrid = rows.join('\n')

		const perfTag = mistakes === 0 ? 'Perfect! ✨' : `⚠️ ${mistakes} mistake${mistakes === 1 ? '' : 's'}`
		const gridLabel = `${gridSize}×${gridSize}`
		const statsLine = `⏱️ ${timeTaken}s · 🎯 Level ${skillLevel} · 🔥 ${streak} day streak · ${perfTag}`
		const commentText = `u/${sharerUsername} solved the ${gridLabel} puzzle!\n\n${emojiGrid}\n\n${statsLine}\nPlay → r/urjo`

		// Must reply to the sticky scores comment — required by Reddit user actions policy.
		const postMeta = await redis.hGetAll(`game:${postId}:meta`)
		const stickyCommentId = postMeta['stickyCommentId']

		if (!stickyCommentId) {
			return c.json({ success: false, error: 'No sticky comment available' })
		}

		await reddit.submitComment({
			id: stickyCommentId as `t1_${string}`,
			text: commentText,
			runAs: 'USER',
		})

		await redis.set(sharedKey, 'true')

		const response: ShareResponse = {
			success: true,
			shared: true,
		}

		return c.json(response)
	} catch (error) {
		console.error('Error sharing score:', error)
		return c.json({ error: 'Failed to share score' }, 500)
	}
})

// ─── POST /api/game/tutorial-complete ────────────────────────────────────────

gameRouter.post('/api/game/tutorial-complete', async (c) => {
	const { userId } = context

	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		await redis.set(`user:${userId}:tutorialCompleted`, 'true')
		return c.json({ success: true })
	} catch (error) {
		console.error('Error marking tutorial complete:', error)
		return c.json({ error: 'Failed to mark tutorial complete' }, 500)
	}
})

// ─── POST /api/game/challenge ─────────────────────────────────────────────────

gameRouter.post('/api/game/challenge', async (c) => {
	const { postId, userId, subredditName } = context

	if (!postId || !userId) return c.json({ error: 'Missing context' }, 400)

	try {
		const body: ChallengeRequest = await c.req.json()
		const { timeTaken, skillLevel, mistakes } = body

		// Rate limit: one challenge post per user per day
		const today = getTodayUTC()
		const challengeKey = `user:${userId}:challenge:${today}`
		const alreadyChallenged = await redis.get(challengeKey)
		if (alreadyChallenged === 'true') {
			return c.json<ChallengeResponse>({ success: false, error: 'Already created a challenge today' })
		}

		// Get current puzzle for this post
		const puzzle = await getCurrentPuzzle(postId, userId)
		if (!puzzle) return c.json<ChallengeResponse>({ success: false, error: 'No puzzle found' })

		// Get username directly from Reddit API to avoid "You" fallback
		let username = 'Anon'
		try {
			const user = await reddit.getUserById(userId as `t2_${string}`)
			username = user?.username ?? 'Anon'
		} catch {
			// fallback to Anon
		}

		// Build title — rotating high-CTR templates with grid size context
		const perfectTag = mistakes === 0 ? ' (perfect!)' : ''
		const perfectBadge = mistakes === 0 ? ' (zero mistakes)' : ''
		const gridLabel = `${puzzle.gridSize}×${puzzle.gridSize}`
		const titleTemplates = [
			`Only top players beat ${timeTaken}s on a ${gridLabel} at Level ${skillLevel}. u/${username} just did it${perfectBadge}. Your turn 🎯`,
			`u/${username} solved a ${gridLabel} Level ${skillLevel} in ${timeTaken}s${perfectTag} — can YOU beat it? 🏆`,
			`${gridLabel} Level ${skillLevel} cleared in ${timeTaken}s by u/${username}${perfectBadge}. Think you're faster? 👀`,
			`New ${gridLabel} challenge dropped: Level ${skillLevel}, ${timeTaken}s to beat. u/${username} set the bar${perfectBadge} 🔥`,
		]
		// Rotate template based on hour to spread variety without randomness (deterministic)
		const templateIndex = new Date().getUTCHours() % titleTemplates.length
		const title = titleTemplates[templateIndex] ?? titleTemplates[0]!

		if (!subredditName) return c.json<ChallengeResponse>({ success: false, error: 'No subreddit context' })

		const newPost = await reddit.submitCustomPost({
			subredditName,
			title,
			runAs: 'USER',
			userGeneratedContent: { text: title },
			postData: {
				postType: 'urjo-puzzle',
			},
		})

		// Seed the new post with the same puzzle
		await redis.hSet(`game:${newPost.id}:puzzle`, {
			colors: puzzle.colors,
			numbers: puzzle.numbers,
			solution: puzzle.solution,
			difficulty: puzzle.difficulty,
			gridSize: puzzle.gridSize,
			created: new Date().toISOString(),
			challengeBy: userId,
			challengeScore: timeTaken.toString(),
		})

		// Initialize stats for the challenge post
		await redis.hSet(`game:${newPost.id}:stats`, {
			attempts: '0',
			beats: '0',
		})

		// Mark rate limit
		await redis.set(challengeKey, 'true')
		await redis.expire(challengeKey, 86400)

		// Post a comment on the challenge post showing the score to beat
		const scoreComment = `🏆 Score to beat: ${timeTaken}s with ${mistakes === 0 ? 'zero mistakes' : `${mistakes} mistake${mistakes === 1 ? '' : 's'}`} at Level ${skillLevel}\n\nThink you can do better? Solve the puzzle above! 🎯`
		await reddit.submitComment({ id: newPost.id as `t3_${string}`, text: scoreComment })

		// Post the initial leaderboard comment (APP account, no user action needed)
		const leaderboardComment = await reddit.submitComment({
			id: newPost.id,
			text: `🏆 **Challenge Leaderboard**

👥 Attempts: 0
✅ Beaten: 0 times
⏱️ Fastest: --
👑 Champion: --

Think you can beat it? Play above! 🎯`,
		})

		// Store postType and leaderboard comment ID together — single hSet avoids clobbering
		await redis.hSet(`game:${newPost.id}:meta`, {
			postType: 'urjo-puzzle',
			leaderboardCommentId: leaderboardComment.id,
		})

		return c.json<ChallengeResponse>({ success: true, postUrl: `https://reddit.com/${newPost.id}` })
	} catch (error) {
		console.error('Challenge post error:', error)
		return c.json<ChallengeResponse>({ success: false, error: 'Failed to create challenge' })
	}
})
