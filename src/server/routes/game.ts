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
} from '../../shared/types'
import { MIN_SKILL_LEVEL, getLevelConfig } from '../../shared/constants'
import { generatePuzzle } from '../lib/generator'
import {
	calculatePerformanceScore,
	determineSkillLevel,
	addGameRecord,
	parseHistory,
	shouldForceDemotion,
} from '../lib/adaptive'
import { calculateCoinReward } from '../lib/economy'
import type { CoinReward } from '../../shared/types'
import { getUserEconomy } from '../lib/economy'
import { getTodayUTC, getDayDifference, getSkillLevel, fetchUsername, updateLoginStreak } from '../lib/helpers'

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
 * Get the user's game history from Redis.
 */
const getHistory = async (userId: string): Promise<GameRecord[]> => {
	const json = await redis.get(`user:${userId}:history`)
	return parseHistory(json)
}

/**
 * Generate a puzzle at the user's current skill level.
 */
const generatePuzzleForLevel = (level: number): SerializedPuzzle => {
	const config = getLevelConfig(level)
	return generatePuzzle(config.difficulty, config.gridSize as 4 | 6 | 8)
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
		consecutiveLoginDays
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
		const skillLevel = await getSkillLevel(userId)

		let puzzle = await getCurrentPuzzle(postId, userId)

		if (!puzzle) {
			const postPuzzle = await redis.hGetAll(`game:${postId}:puzzle`)
			if (postPuzzle && postPuzzle.colors) {
				// If user is above Level 1, generate a skill-appropriate puzzle instead of the default 4x4
				if (skillLevel > 1) {
					const skillPuzzle = generatePuzzleForLevel(skillLevel)
					await redis.hSet(`user:${userId}:game:${postId}:currentPuzzle`, {
						colors: skillPuzzle.colors,
						numbers: skillPuzzle.numbers,
						solution: skillPuzzle.solution,
						difficulty: skillPuzzle.difficulty,
						gridSize: skillPuzzle.gridSize.toString(),
					})
					puzzle = {
						colors: skillPuzzle.colors,
						numbers: skillPuzzle.numbers,
						solution: skillPuzzle.solution,
						difficulty: skillPuzzle.difficulty,
						gridSize: skillPuzzle.gridSize.toString(),
					}
				} else {
					puzzle = {
						colors: postPuzzle.colors,
						numbers: postPuzzle.numbers ?? '',
						solution: postPuzzle.solution ?? '',
						difficulty: postPuzzle.difficulty ?? 'easy',
						gridSize: postPuzzle.gridSize ?? '4',
					}
				}
			} else {
				return c.json({ error: 'Game not found' }, 404)
			}
		}

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
			difficulty: puzzle.difficulty as 'easy' | 'medium' | 'hard',
			gridSize: parseInt(puzzle.gridSize, 10),
		}

		const gameState: GameState = {
			puzzle: serializedPuzzle,
			tutorialCompleted,
			skillLevel,
			streak,
			...(username !== undefined && { username }),
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
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const body: CompleteRequest = await c.req.json()
		const { mistakes = 0 } = body

		// Server-side time tracking (security fix)
		// Calculate timeTaken from stored start time instead of trusting client
		const startTimeKey = `user:${userId}:puzzleStartTime:${postId}`
		const startTimeStr = await redis.get(startTimeKey)
		let timeTaken: number

		if (startTimeStr) {
			timeTaken = Math.round((Date.now() - parseInt(startTimeStr, 10)) / 1000)
			await redis.del(startTimeKey)
		} else {
			// Fallback to client value if no server start time (shouldn't happen in production)
			const clientTime = body.timeTaken
			if (typeof clientTime !== 'number' || clientTime <= 0) {
				return c.json({ error: 'Invalid timeTaken' }, 400)
			}
			timeTaken = clientTime
		}

		if (timeTaken <= 0) {
			return c.json({ error: 'Invalid timeTaken' }, 400)
		}

		const currentLevel = await getSkillLevel(userId)
		const history = await getHistory(userId)

		const performanceScore = calculatePerformanceScore(timeTaken, currentLevel, mistakes)

		const record: GameRecord = {
			level: currentLevel,
			timeTaken,
			timestamp: Date.now(),
		}
		const updatedHistory = addGameRecord(history, record)
		const newSkillLevel = determineSkillLevel(currentLevel, updatedHistory)
		const streak = await updateStreak(userId)

		const coinReward = await applyCoinReward({ userId, timeTaken, currentLevel, streak, mistakes })

		const today = getTodayUTC()
		await Promise.all([
			redis.zAdd('leaderboard:streak', { score: streak.currentStreak, member: userId }),
			redis.zAdd(`leaderboard:speed:${today}`, { score: timeTaken, member: userId }),
			redis.expire(`leaderboard:speed:${today}`, 2592000), // 30-day TTL
		])

		await redis.set(`user:${userId}:skillLevel`, newSkillLevel.toString())
		// Reset history when level changes — fresh slate for new difficulty
		await redis.set(
			`user:${userId}:history`,
			newSkillLevel !== currentLevel ? JSON.stringify([]) : JSON.stringify(updatedHistory)
		)
		await redis.set(`user:${userId}:consecutiveSkips`, '0')

		// When level changes, clear the cached personal puzzle so next open generates a fresh one
		if (newSkillLevel !== currentLevel) {
			await redis.del(`user:${userId}:game:${postId}:currentPuzzle`)
		}

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

		// Personal best tracking — per user per skill level
		const pbKey = `user:${userId}:pb:${currentLevel}`
		const prevPB = await redis.get(pbKey)
		const prevPBTime = prevPB ? parseInt(prevPB, 10) : null
		const isPersonalBest = prevPBTime === null || timeTaken < prevPBTime
		if (isPersonalBest) {
			await redis.set(pbKey, timeTaken.toString())
		}

		const response: CompleteResponse = {
			performanceScore,
			newSkillLevel,
			previousSkillLevel: currentLevel,
			streak,
			coinReward,
			isPersonalBest,
			personalBestTime: isPersonalBest ? timeTaken : (prevPBTime ?? undefined),
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

		let currentLevel = await getSkillLevel(userId)
		const history = await getHistory(userId)

		const skipRecord: GameRecord = {
			level: currentLevel,
			timeTaken: timeSpent,
			timestamp: Date.now(),
			skipped: true,
		}
		const updatedHistory = addGameRecord(history, skipRecord)

		const skipCountKey = `user:${userId}:consecutiveSkips`
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
			const topUsers = await redis.zRange(`leaderboard:speed:${today}`, 0, 9, { by: 'rank' })

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
		const statsLine = `⏱️ ${timeTaken}s · 🎯 Level ${skillLevel} · 🔥 ${streak} day streak · ${perfTag}`
		const commentText = `u/${sharerUsername} solved it!\n\n${emojiGrid}\n\n${statsLine}\nPlay → r/urjo`

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

		// Build title — rotating high-CTR templates
		const perfectTag = mistakes === 0 ? ' (perfect!)' : ''
		const perfectBadge = mistakes === 0 ? ' (zero mistakes)' : ''
		const titleTemplates = [
			`Only top players beat ${timeTaken}s at Level ${skillLevel}. u/${username} just did it${perfectBadge}. Your turn 🎯`,
			`u/${username} solved Level ${skillLevel} in ${timeTaken}s${perfectTag} — can YOU beat it? 🏆`,
			`Level ${skillLevel} cleared in ${timeTaken}s by u/${username}${perfectBadge}. Think you're faster? 👀`,
			`New challenge dropped: Level ${skillLevel}, ${timeTaken}s to beat. u/${username} set the bar${perfectBadge} 🔥`,
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
