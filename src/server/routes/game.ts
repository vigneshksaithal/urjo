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
} from '../../shared/types'
import { DEFAULT_SKILL_LEVEL, MIN_SKILL_LEVEL, getLevelConfig } from '../../shared/constants'
import { generatePuzzle } from '../lib/generator'
import {
	calculatePerformanceScore,
	determineSkillLevel,
	addGameRecord,
	parseHistory,
	shouldForceDemotion,
} from '../lib/adaptive'

export const gameRouter = new Hono()

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch Reddit username for a user ID.
 * Caches results in Redis for 24 hours.
 * Returns "You" for current user, actual username for others, "Anon" as fallback.
 */
async function fetchUsername(targetUserId: string, currentUserId?: string): Promise<string> {
	// Return "You" for the current user
	if (currentUserId && targetUserId === currentUserId) {
		return 'You'
	}

	// Check cache first
	const cacheKey = `user:${targetUserId}:username`
	const cached = await redis.get(cacheKey)
	if (cached) return cached

	// Fetch from Reddit API
	try {
		const user = await reddit.getUserById(targetUserId as `t2_${string}`)
		if (!user) return 'Anon'
		
		const username = user.username
		
		// Cache for 24 hours (using expire)
		await redis.set(cacheKey, username)
		await redis.expire(cacheKey, 86400)
		
		return username
	} catch (error) {
		console.error(`Failed to fetch username for ${targetUserId}:`, error)
		return 'Anon'
	}
}

/**
 * Get the user's current skill level from Redis.
 */
async function getSkillLevel(userId: string): Promise<number> {
	const level = await redis.get(`user:${userId}:skillLevel`)
	return level ? parseInt(level, 10) : DEFAULT_SKILL_LEVEL
}

/**
 * Get the user's game history from Redis.
 */
async function getHistory(userId: string): Promise<GameRecord[]> {
	const json = await redis.get(`user:${userId}:history`)
	return parseHistory(json)
}

/**
 * Generate a puzzle at the user's current skill level.
 */
function generatePuzzleForLevel(level: number) {
	const config = getLevelConfig(level)
	return generatePuzzle(config.difficulty, config.gridSize as 4 | 6)
}

/**
 * Get the current puzzle data for a user.
 */
async function getCurrentPuzzle(
	postId: string,
	userId: string
): Promise<{
	colors: string
	numbers: string
	solution: string
	difficulty: string
	gridSize: string
} | null> {
	// Check for user-specific puzzle (from Next Challenge)
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

	// Fall back to post puzzle
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
async function getStreakData(userId: string): Promise<StreakData> {
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
 * Get today's date in UTC as YYYY-MM-DD.
 */
function getTodayUTC(): string {
	const now = new Date()
	const isoString = now.toISOString()
	const datePart = isoString.split('T')[0]
	return datePart ?? ''
}

/**
 * Calculate the day difference between two YYYY-MM-DD date strings.
 */
function getDayDifference(date1: string, date2: string): number {
	const d1 = new Date(date1)
	const d2 = new Date(date2)
	const diffTime = Math.abs(d2.getTime() - d1.getTime())
	return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Update the user's streak based on completion.
 * Uses 1-day grace period (48 hours).
 */
async function updateStreak(userId: string): Promise<StreakData> {
	const today = getTodayUTC()
	const streakData = await getStreakData(userId)

	// If already played today, return current data
	if (streakData.lastPlayedDate === today) {
		return streakData
	}

	let newStreak = 1

	if (streakData.lastPlayedDate) {
		const dayDiff = getDayDifference(streakData.lastPlayedDate, today)
		
		// Continue streak if played yesterday (1 day) or day before (2 days = 48hr grace)
		if (dayDiff === 1 || dayDiff === 2) {
			newStreak = streakData.currentStreak + 1
		}
	}

	const newLongest = Math.max(newStreak, streakData.longestStreak)

	// Update Redis
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

// ─── GET /api/game/state ─────────────────────────────────────────────────────

gameRouter.get('/api/game/state', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const skillLevel = await getSkillLevel(userId)

		// Check if user already has a puzzle for this post
		let puzzle = await getCurrentPuzzle(postId, userId)

		// If no user-specific puzzle exists, generate one at their skill level
		if (!puzzle) {
			// Check if a shared post puzzle exists
			const postPuzzle = await redis.hGetAll(`game:${postId}:puzzle`)
			if (postPuzzle && postPuzzle.colors) {
				// Use the shared post puzzle as fallback
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

		// Get tutorial status
		const tutorialCompleted = (await redis.get(`user:${userId}:tutorialCompleted`)) === 'true'

		// Get streak data
		const streak = await getStreakData(userId)

		const gameState: GameState = {
			puzzle: {
				colors: puzzle.colors,
				numbers: puzzle.numbers,
				solution: puzzle.solution,
				difficulty: puzzle.difficulty as 'easy' | 'medium' | 'hard',
				gridSize: parseInt(puzzle.gridSize, 10),
			},
			tutorialCompleted,
			skillLevel,
			streak,
		}

		return c.json(gameState)
	} catch (error) {
		console.error('Error fetching game state:', error)
		return c.json({ error: 'Failed to fetch game state' }, 500)
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
	const { userId } = context

	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const body: CompleteRequest = await c.req.json()
		const { timeTaken } = body

		if (typeof timeTaken !== 'number' || timeTaken <= 0) {
			return c.json({ error: 'Invalid timeTaken' }, 400)
		}

		const currentLevel = await getSkillLevel(userId)
		const history = await getHistory(userId)

		// Calculate performance score
		const performanceScore = calculatePerformanceScore(timeTaken, currentLevel)

		// Add game record to history
		const record: GameRecord = {
			level: currentLevel,
			timeTaken,
			timestamp: Date.now(),
		}
		const updatedHistory = addGameRecord(history, record)

		// Determine new skill level
		const newSkillLevel = determineSkillLevel(currentLevel, updatedHistory)

		// Update streak
		const streak = await updateStreak(userId)

		// ─── Coin Rewards ───────────────────────────────────────────────────
		const today = getTodayUTC()

		// Get current economy data
		const economyKey = `user:${userId}:economy`
		const economyData = await redis.hGetAll(economyKey)

		// Check if first solve of the day
		const lastDailySolve = economyData?.dailyFirstSolve ?? null
		const isDailyFirst = lastDailySolve !== today

		// Calculate coin reward
		const { calculateCoinReward } = await import('../lib/economy')
		const coinReward = calculateCoinReward(timeTaken, currentLevel, streak.currentStreak, isDailyFirst)

		// Update economy
		const currentCoins = parseInt(economyData?.coins ?? '0', 10)
		const currentTotalCoins = parseInt(economyData?.totalCoins ?? '0', 10)
		const currentTotalSolves = parseInt(economyData?.totalSolves ?? '0', 10)
		const speedSolves = parseInt(economyData?.speedSolves ?? '0', 10)

		const newCoins = currentCoins + coinReward.total
		const newTotalCoins = currentTotalCoins + coinReward.total
		const newTotalSolves = currentTotalSolves + 1
		const newSpeedSolves = speedSolves + (coinReward.speedBonus > 0 ? 1 : 0)

		// Save economy updates
		await Promise.all([
			redis.hSet(economyKey, {
				coins: newCoins.toString(),
				totalCoins: newTotalCoins.toString(),
				totalSolves: newTotalSolves.toString(),
				speedSolves: newSpeedSolves.toString(),
				ownedTitles: economyData?.ownedTitles ?? '["puzzler"]',
				equippedTitle: economyData?.equippedTitle ?? 'puzzler',
				dailyFirstSolve: isDailyFirst ? today : (lastDailySolve ?? ''),
			}),
			redis.zAdd('leaderboard:coins', { score: newTotalCoins, member: userId }),
		])
		// ─── End Coin Rewards ─────────────────────────────────────────────

		// Update leaderboards
		await Promise.all([
			redis.zAdd('leaderboard:streak', { score: streak.currentStreak, member: userId }),
			redis.zAdd(`leaderboard:speed:${today}`, { score: timeTaken, member: userId }),
		])

		// Persist to Redis
		await redis.set(`user:${userId}:skillLevel`, newSkillLevel.toString())
		await redis.set(`user:${userId}:history`, JSON.stringify(updatedHistory))

		// Reset consecutive skip counter on any completion
		await redis.set(`user:${userId}:consecutiveSkips`, '0')

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
		// Parse optional timeSpent from request body (seconds on the skipped puzzle)
		let timeSpent = 0
		try {
			const body = await c.req.json<{ timeSpent?: number }>()
			if (typeof body.timeSpent === 'number' && body.timeSpent >= 0) {
				timeSpent = body.timeSpent
			}
		} catch {
			// No body or invalid JSON — treat as instant skip (timeSpent = 0)
		}

		let currentLevel = await getSkillLevel(userId)
		const history = await getHistory(userId)

		// Record the skip in history
		const skipRecord: GameRecord = {
			level: currentLevel,
			timeTaken: timeSpent,
			timestamp: Date.now(),
			skipped: true,
		}
		const updatedHistory = addGameRecord(history, skipRecord)

		// Track consecutive skips
		const skipCountKey = `user:${userId}:consecutiveSkips`
		const prevSkips = await redis.get(skipCountKey)
		const consecutiveSkips = (prevSkips ? parseInt(prevSkips, 10) : 0) + 1
		await redis.set(skipCountKey, consecutiveSkips.toString())

		// Check for forced demotion via consecutive skips
		let newLevel: number
		if (shouldForceDemotion(consecutiveSkips)) {
			// Force immediate demotion and reset counter
			newLevel = Math.max(MIN_SKILL_LEVEL, currentLevel - 1)
			await redis.set(skipCountKey, '0')
		} else {
			// Normal determination via history averaging
			newLevel = determineSkillLevel(currentLevel, updatedHistory)
		}

		// Persist updated history and skill level
		await redis.set(`user:${userId}:skillLevel`, newLevel.toString())
		await redis.set(`user:${userId}:history`, JSON.stringify(updatedHistory))

		const newPuzzle = generatePuzzleForLevel(newLevel)

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
			// Fetch top 10 from streak leaderboard (highest scores first)
			const topUsers = await redis.zRange('leaderboard:streak', 0, 9, { reverse: true, by: 'rank' })
			
			// Get usernames for top users (fetch in parallel)
			const entriesPromises = topUsers.map(async (item, i) => {
				const memberId = item.member
				const score = item.score
				const username = await fetchUsername(memberId, userId)
				
				if (userId && memberId === userId) {
					userRank = i + 1
				}

				return {
					rank: i + 1,
					userId: memberId,
					username,
					score,
				}
			})
			
			entries = await Promise.all(entriesPromises)
		} else if (type === 'speed') {
			// Fetch top 10 from today's speed leaderboard (lowest scores first)
			const today = getTodayUTC()
			const topUsers = await redis.zRange(`leaderboard:speed:${today}`, 0, 9, { by: 'rank' })
			
			// Get usernames for top users (fetch in parallel)
			const entriesPromises = topUsers.map(async (item, i) => {
				const memberId = item.member
				const score = item.score
				const username = await fetchUsername(memberId, userId)
				
				if (userId && memberId === userId) {
					userRank = i + 1
				}

				return {
					rank: i + 1,
					userId: memberId,
					username,
					score,
				}
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
		const { timeTaken, streak } = body

		// Check if already shared for this post
		const sharedKey = `user:${userId}:shared:${postId}`
		const alreadyShared = await redis.get(sharedKey)

		if (alreadyShared === 'true') {
			return c.json({ success: false, alreadyShared: true })
		}

		// Compose comment text
		const commentText = `🎯 I solved today's Urjo puzzle in ${timeTaken}s! 🔥 ${streak} day streak | Play at r/urjo`

		// Submit comment to Reddit as the user (scope: "user" in devvit.json enables this)
		await reddit.submitComment({
			id: postId,
			text: commentText,
		})

		// Mark as shared
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
