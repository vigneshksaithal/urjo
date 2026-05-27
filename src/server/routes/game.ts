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
	FirstScreenData,
} from '../../shared/types'
import { MIN_SKILL_LEVEL, getGridLevelConfig, isValidGridSize } from '../../shared/constants'
import { MAX_STREAK_FREEZES } from '../../shared/constants'
import type { GridSize } from '../../shared/constants'
import { FREE_STREAK_FREEZE_CADENCE_DAYS } from '../../shared/streak-rewards'
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
	getISOWeek,
} from '../lib/helpers'
import { isUserMigrated, migrateUserToPerGrid } from '../lib/migration'
import { getMissionState, saveMissionState, updateMissionProgress } from '../lib/missions'
import { checkAchievements, checkStreakMilestone, unlockAchievements, getUnlockedAchievements } from '../lib/achievements'
import { rollVariableRewards } from '../lib/variable-rewards'
import { checkAndAwardReferral } from '../lib/referrals'
import {
	trackPostOpen,
	trackFirstAction,
	trackCompletion,
	trackResultCopy,
	trackResultComment,
	trackChallengePostCreated,
	trackChallengeOpen,
	trackChallengeCompletion,
	trackHelpTap,
} from '../lib/analytics'
import {
	recordCompleter,
	recordSharer,
	recordChallengeCreation,
	recordCycleTime,
	recordAttribution,
	recordChannelOpen,
	recordChannelConversion,
	getChallengeCreationTimestamp,
	getAttribution,
} from '../lib/viral-tracker'
import { getHintsDismissed, markHintDismissed } from '../lib/hints'
import type { HintKind } from '../lib/hints'
import { buildChallengePreview, buildChallengeBeatPreview, maskPuzzleGrid } from '../lib/preview'
import type { ChallengePreviewData } from '../../shared/race-types'
import { isModeratorCached } from '../lib/moderator'
import { isOptedIn } from '../lib/notify'
import { calculateSeasonScore, getCurrentSeason, recordSeasonScore } from '../lib/seasons'
import { getSocialStats, incrementChallengeBeats, incrementChallengesCreated, incrementSharesCount } from '../lib/social'
import { serializeResultCard } from '../../shared/result-card'
import type { ResultCardData } from '../../shared/growth-types'
import type { EngagementCompletionData, MissionEvent, UserStats } from '../../shared/engagement-types'
import { getSessionRunMultiplier, getSessionRunBonusCoins } from '../../shared/session-run'
import { forecastNextStreak } from '../../shared/streak-rewards'
import { getActiveWeekendEvent, getWeekendEventBonusCoins } from '../../shared/weekend-event'

// ─── Par Time Defaults ───────────────────────────────────────────────────────

/** Default par times by grid size (seconds) for season score calculation */
const PAR_TIME_BY_GRID_SIZE: Record<number, number> = {
	4: 60,
	6: 120,
	8: 180,
}

const getParTimeForGrid = (gridSize: number): number =>
	PAR_TIME_BY_GRID_SIZE[gridSize] ?? 60

// ─── Result Comment Dedup Key ────────────────────────────────────────────────

const RESULT_COMMENT_TTL = 172800 // 48 hours

const resultCommentDedupKey = (userId: string, postId: string): string =>
	`user:${userId}:resultCommented:${postId}`

const redditCommentsUrl = (postId: string): string =>
	`https://reddit.com/comments/${postId.replace(/^t3_/, '')}`

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
		await redis.zAdd(`challenge:${postId}:beat_events`, {
			member: `${winnerId}:${Date.now()}`,
			score: Date.now(),
		})

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
		await incrementChallengeBeats(challengerId)

		// Update post preview with beat info (non-blocking, deduped)
		try {
			const previewDedupKey = `preview:beat:${postId}:${winnerId}`
			const alreadyUpdatedPreview = await redis.get(previewDedupKey)
			if (!alreadyUpdatedPreview) {
				await redis.set(previewDedupKey, 'true')
				await redis.expire(previewDedupKey, 3600) // 1-hour TTL dedup

				const winnerUsername = await fetchUsername(winnerId)
				const beatPreview = buildChallengeBeatPreview({
					winnerUsername,
					winnerTime: timeTaken,
				})

				await redis.hSet(`game:${postId}:preview`, {
					type: 'challenge_beat',
					data: JSON.stringify(beatPreview),
				})
			}
		} catch (previewErr) {
			console.error('[Preview] Challenge beat preview update failed (non-critical):', previewErr)
		}

		// Mark beat as recorded — after stats are written so partial failure doesn't lose data
		await redis.set(notifyKey, 'true')
		await redis.expire(notifyKey, 2592000) // 30-day TTL — matches speed leaderboard retention

		try {
			await postChallengeBeatReply(postId, winnerId, challengerId, timeTaken)
		} catch (replyErr) {
			console.error('Failed to post challenge beat reply:', replyErr)
		}
	} catch (err) {
		console.error('checkChallengeBeat error:', err)
	}
}

const postChallengeBeatReply = async (
	postId: string,
	winnerId: string,
	challengerId: string,
	timeTaken: number
): Promise<void> => {
	const meta = await redis.hGetAll(`game:${postId}:meta`)
	const leaderboardCommentId = meta['leaderboardCommentId']
	if (!leaderboardCommentId) return

	const [winnerName, challengerName] = await Promise.all([
		fetchUsername(winnerId),
		fetchUsername(challengerId),
	])

	await reddit.submitComment({
		id: leaderboardCommentId as `t1_${string}`,
		text: [
			`u/${winnerName} beat the challenge from u/${challengerName} in ${timeTaken}s.`,
			'',
			`Jump in: ${redditCommentsUrl(postId)}`,
		].join('\n'),
	})
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

type FirstScreenTarget = NonNullable<FirstScreenData['targetToBeat']>

const getFirstScreenTarget = async (
	date: string,
	gridSize: number,
	postPuzzleMeta: Record<string, string> | undefined,
	viewerId: string,
): Promise<FirstScreenTarget | undefined> => {
	const challengeScore = postPuzzleMeta?.challengeScore
	if (challengeScore) {
		const seconds = parseInt(challengeScore, 10)
		if (!Number.isNaN(seconds) && seconds > 0) {
			const challengerId = postPuzzleMeta?.challengeBy
			return {
				seconds,
				...(challengerId !== undefined && { username: await fetchUsername(challengerId, viewerId) }),
			}
		}
	}

	const leaders = await redis.zRange(`leaderboard:speed:${date}:${gridSize}`, 0, 0, { by: 'rank' })
	const leader = leaders[0]
	if (!leader || typeof leader.score !== 'number') return undefined

	return {
		seconds: leader.score,
		username: await fetchUsername(leader.member, viewerId),
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

	// ─── Free Streak Freeze grant ────────────────────────────────────────
	// Every FREE_STREAK_FREEZE_CADENCE_DAYS (7) of streak the player earns
	// one free Streak Freeze, capped at MAX_STREAK_FREEZES. Idempotent: we
	// remember the highest "earned" cadence tier per-user and only grant on
	// crossing a new boundary, so a single solve that increments streak past
	// a 7-day boundary grants exactly one freeze (no double-grant on retries).
	let freeFreezeGranted = false
	if (newStreak > streakData.currentStreak && newStreak >= FREE_STREAK_FREEZE_CADENCE_DAYS) {
		const grantTier = Math.floor(newStreak / FREE_STREAK_FREEZE_CADENCE_DAYS)
		const lastGrantTierStr = await redis.get(`user:${userId}:streak:freeFreezeTier`)
		const lastGrantTier = lastGrantTierStr ? parseInt(lastGrantTierStr, 10) : 0
		if (grantTier > lastGrantTier) {
			const economy = await getUserEconomy(userId)
			if (economy.streakFreezes < MAX_STREAK_FREEZES) {
				await redis.hIncrBy(`user:${userId}:economy`, 'streakFreezes', 1)
				freeFreezeGranted = true
			}
			// Always advance the tier marker so we don't keep retrying when
			// the player is at the cap — they'll get the next grant on the
			// next 7-day boundary if they've spent a freeze by then.
			await redis.set(`user:${userId}:streak:freeFreezeTier`, grantTier.toString())
		}
	}

	await Promise.all([
		redis.set(`user:${userId}:streak:current`, newStreak.toString()),
		redis.set(`user:${userId}:streak:longest`, newLongest.toString()),
		redis.set(`user:${userId}:streak:lastDate`, today),
	])

	return {
		currentStreak: newStreak,
		longestStreak: newLongest,
		lastPlayedDate: today,
		freeFreezeGranted,
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
		const today = getTodayUTC()

		// ─── Analytics: track post open (non-blocking) ────────────────────────
		try {
			const { subredditId } = context
			await trackPostOpen(today, postId, userId, subredditId)
			if (isChallenge) {
				await trackChallengeOpen(today, postId, userId)
			}
		} catch (err) {
			console.error('[Analytics] Post open tracking failed (non-critical):', err)
		}

		// ─── Notify opt-in and hints dismissal (for GameView) ────────────────
		const [notifyOptIn, hintsDismissed] = await Promise.all([
			isOptedIn(userId),
			getHintsDismissed(userId),
		])

		const economy = await getUserEconomy(userId)
		const isFirstTimeUser = economy.totalSolves === 0

		// ─── Viral tracking: challenge post open by new player (non-blocking) ─
		try {
			if (isChallenge && isFirstTimeUser) {
				await recordAttribution(userId, 'challenge_post')
				await recordChannelOpen(today, 'challenge_post', userId)
			}
		} catch (err) {
			console.error('[Viral] Challenge open attribution failed (non-critical):', err)
		}

		// ─── Puzzle number ─────────────────────────────────────────────────────
		let puzzleNumber: number | undefined
		try {
			const counterStr = await redis.get('stats:puzzleCounter')
			puzzleNumber = counterStr !== undefined ? parseInt(counterStr, 10) : undefined
		} catch {
			// non-critical
		}

		// ─── Community stats (for all users) ───────────────────────────────────
		let communityStats: { activePlayers: number; collectiveStreakDays: number } | undefined
		try {
			const cachedActive = await redis.get('stats:activePlayers:7d')
			const cachedStreaks = await redis.get('stats:collectiveStreaks')
			communityStats = {
				activePlayers: cachedActive !== undefined ? parseInt(cachedActive, 10) : 0,
				collectiveStreakDays: cachedStreaks !== undefined ? parseInt(cachedStreaks, 10) : 0,
			}
		} catch {
			// non-critical
		}

		// ─── Current season info ───────────────────────────────────────────────
		const currentSeason = getCurrentSeason()

		const firstScreenTarget = isFirstTimeUser
			? await getFirstScreenTarget(today, serializedPuzzle.gridSize, postPuzzleMeta, userId)
			: undefined

		const firstScreen: FirstScreenData | undefined = isFirstTimeUser
			? {
				samplePuzzle: serializedPuzzle,
				instruction: 'Fill each row and column with equal reds and blues.',
				communityStats: communityStats ?? { activePlayers: 0, collectiveStreakDays: 0 },
				...(firstScreenTarget !== undefined && { targetToBeat: firstScreenTarget }),
			}
			: undefined

		// ─── Moderator check (non-critical, used to show analytics UI) ─────────
		let isMod = false
		try {
			const { subredditId } = context
			if (subredditId) {
				isMod = await isModeratorCached(subredditId, userId)
			}
		} catch {
			// non-critical — defaults to false
		}

		// ─── Season progress (player rank + score) ─────────────────────────
		// Always-on UI needs the player's standing on every state read so the
		// home strip can show "Season 21 · Rank #4 · 80 pts" without an extra
		// fetch.
		let seasonProgress: { rank: number | null; score: number } | undefined
		try {
			if (currentSeason.isActive) {
				const leaderboardKey = `season:${currentSeason.seasonId}:leaderboard`
				const playerScore = await redis.zScore(leaderboardKey, userId)
				if (playerScore !== undefined && playerScore !== null) {
					const higherEntries = await redis.zRange(
						leaderboardKey,
						playerScore + 1,
						Number.MAX_SAFE_INTEGER,
						{ by: 'score' },
					)
					seasonProgress = {
						rank: higherEntries.length + 1,
						score: playerScore,
					}
				} else {
					seasonProgress = { rank: null, score: 0 }
				}
			}
		} catch (err) {
			console.error('[State] Season progress fetch failed (non-critical):', err)
		}

		// ─── Next active daily mission (preview) ───────────────────────────
		// Pick the first not-yet-completed daily mission so the home strip
		// can show "Solve 3 puzzles: 1/3" with a progress bar. CoC-style:
		// progression is always visible on the home screen, never hidden in
		// a modal.
		let nextMission: {
			templateId: string
			description: string
			currentProgress: number
			targetValue: number
			coinReward: number
		} | undefined
		try {
			const dailyState = await getMissionState(userId, 'daily')
			const activeMission =
				dailyState.missions.find((m) => !m.completed) ??
				dailyState.missions.find((m) => !m.claimed) ??
				dailyState.missions[0]
			if (activeMission) {
				nextMission = {
					templateId: activeMission.templateId,
					description: activeMission.description,
					currentProgress: activeMission.currentProgress,
					targetValue: activeMission.targetValue,
					coinReward: activeMission.coinReward,
				}
			}
		} catch (err) {
			console.error('[State] Next mission fetch failed (non-critical):', err)
		}

		const gameState: GameState = {
			puzzle: serializedPuzzle,
			tutorialCompleted,
			skillLevel,
			gridSizePreference,
			postId,
			isChallenge,
			streak,
			...(username !== undefined && { username }),
			isFirstTimeUser,
			...(puzzleNumber !== undefined && { puzzleNumber }),
			...(communityStats !== undefined && { communityStats }),
			isMod,
			currentSeason,
			notifyOptIn,
			hintsDismissed,
			...(firstScreen !== undefined && { firstScreen }),
			// Weekend Event — surfaced on every state read so the banner can
			// render the latest "ends in" countdown without an extra fetch.
			weekendEvent: getActiveWeekendEvent(new Date()),
			// Always-on progression strip data
			...(seasonProgress !== undefined && { seasonProgress }),
			...(nextMission !== undefined && { nextMission }),
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

// ─── POST /api/game/first-action ──────────────────────────────────────────────

gameRouter.post('/api/game/first-action', async (c) => {
	const { postId, userId, subredditId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const today = getTodayUTC()
		const isNew = await trackFirstAction(today, postId, userId, subredditId)
		return c.json({ tracked: isNew })
	} catch (error) {
		console.error('[Analytics] First action tracking failed:', error)
		return c.json({ tracked: false })
	}
})

// ─── POST /api/game/help-tap ──────────────────────────────────────────────────

gameRouter.post('/api/game/help-tap', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const today = getTodayUTC()
		const tracked = await trackHelpTap(today, postId, userId)
		return c.json({ tracked })
	} catch (error) {
		console.error('[Analytics] Help tap tracking failed:', error)
		return c.json({ tracked: false })
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

		// Run-again loop: client tells us how many puzzles the player has
		// solved in this session (including this one). We clamp + sanitize on
		// the server so a malicious client can't claim a 9999× multiplier.
		const rawSessionRun = typeof body.sessionRun === 'number' ? body.sessionRun : 0
		const sessionRun = Math.max(0, Math.min(Math.floor(rawSessionRun), 50))

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
		const preCompletionEconomy = await getUserEconomy(userId)

		const coinReward = await applyCoinReward({ userId, timeTaken, currentLevel, streak, mistakes, gridSize })

		// ─── Run-again loop: session-streak coin bonus ─────────────────────
		// On top of the standard reward, a player who keeps playing within a
		// single session earns a bonus that scales with consecutive solves
		// (capped at 2× of the base reward at sessionRun = 20+).
		const sessionRunMultiplier = getSessionRunMultiplier(sessionRun)
		const sessionRunBonusCoins = getSessionRunBonusCoins(coinReward.total, sessionRun)
		if (sessionRunBonusCoins > 0) {
			await Promise.all([
				redis.hIncrBy(`user:${userId}:economy`, 'coins', sessionRunBonusCoins),
				redis.hIncrBy(`user:${userId}:economy`, 'totalCoins', sessionRunBonusCoins),
			])
		}

		// ─── Weekend Event coin bonus ──────────────────────────────────────
		// Saturday/Sunday UTC apply a flat 1.5× multiplier to the displayed
		// coin reward. Computed off the original total so the weekend boost
		// stacks additively with the session-run bonus rather than compounding.
		const weekendEvent = getActiveWeekendEvent(new Date())
		const weekendBonusCoins = getWeekendEventBonusCoins(coinReward.total, weekendEvent)
		if (weekendBonusCoins > 0) {
			await Promise.all([
				redis.hIncrBy(`user:${userId}:economy`, 'coins', weekendBonusCoins),
				redis.hIncrBy(`user:${userId}:economy`, 'totalCoins', weekendBonusCoins),
			])
		}

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
		const isChallengePost = Boolean(puzzleMeta?.challengeBy)
		if (isChallengePost) {
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

		// ─── Engagement Logic ──────────────────────────────────────────────────
		let engagement: EngagementCompletionData | undefined
		try {
			const isoWeek = getISOWeek()

			// Roll variable rewards (bonus multiplier + mystery box)
			const economy = await getUserEconomy(userId)
			const variableReward = rollVariableRewards(
				userId,
				postId,
				Date.now(),
				streak.currentStreak,
				economy.ownedTitles
			)

			// Apply bonus multiplier to coin reward
			if (variableReward.bonusMultiplier !== null) {
				const multipliedBase = coinReward.base * variableReward.bonusMultiplier
				const bonus = multipliedBase - coinReward.base
				await redis.hIncrBy(`user:${userId}:economy`, 'coins', bonus)
				await redis.hIncrBy(`user:${userId}:economy`, 'totalCoins', bonus)
				coinReward.multiplier = variableReward.bonusMultiplier
			}

			// Apply mystery box reward
			if (variableReward.mysteryBox !== null) {
				const box = variableReward.mysteryBox
				if (box.type === 'coins') {
					await redis.hIncrBy(`user:${userId}:economy`, 'coins', box.value)
					await redis.hIncrBy(`user:${userId}:economy`, 'totalCoins', box.value)
				} else if (box.type === 'streak_freeze') {
					await redis.hIncrBy(`user:${userId}:economy`, 'streakFreezes', 1)
				} else if (box.type === 'cosmetic_title' && box.titleId) {
					const updatedEconomy = await getUserEconomy(userId)
					if (!updatedEconomy.ownedTitles.includes(box.titleId)) {
						const newTitles = [...updatedEconomy.ownedTitles, box.titleId]
						await redis.hSet(`user:${userId}:economy`, { ownedTitles: JSON.stringify(newTitles) })
					}
				}
				coinReward.mysteryBox = box
			}

			// Update mission progress
			const missionEvent: MissionEvent = {
				type: 'puzzle_complete',
				timeTaken,
				mistakes,
				gridSize,
				skillLevel: currentLevel,
				coinsEarned: coinReward.total,
				currentStreak: streak.currentStreak,
			}

			const [dailyState, weeklyState] = await Promise.all([
				getMissionState(userId, 'daily'),
				getMissionState(userId, 'weekly'),
			])
			const updatedDaily = updateMissionProgress(dailyState, missionEvent)
			const updatedWeekly = updateMissionProgress(weeklyState, missionEvent)
			await Promise.all([
				saveMissionState(userId, 'daily', updatedDaily),
				saveMissionState(userId, 'weekly', updatedWeekly),
			])

			// Increment weekly leaderboard for community highlights
			await redis.zAdd(`leaderboard:weekly:${isoWeek}`, { score: 1, member: userId })

			// Check for newly unlocked achievements
			const updatedEconomy = await getUserEconomy(userId)
			const socialStats = await getSocialStats(userId)
			const unlockedIds = await getUnlockedAchievements(userId)
			const userStats: UserStats = {
				totalSolves: updatedEconomy.totalSolves,
				currentStreak: streak.currentStreak,
				longestStreak: streak.longestStreak,
				speedSolves: updatedEconomy.speedSolves,
				totalCoinsEarned: updatedEconomy.totalCoins,
				maxGridLevel: newSkillLevel,
				allGridsMaxed: false, // simplified — full check would require reading all grid levels
				sharesCount: socialStats.sharesCount,
				challengesCreated: socialStats.challengesCreated,
				challengeBeats: socialStats.challengeBeats,
			}
			const newAchievements = checkAchievements(userStats, unlockedIds.map((u) => u.id))
			if (newAchievements.length > 0) {
				await unlockAchievements(userId, newAchievements)
			}

			// Check streak milestones
			const allUnlockedIds = [...unlockedIds.map((u) => u.id), ...newAchievements.map((a) => a.id)]
			const streakMilestone = checkStreakMilestone(streak.currentStreak, allUnlockedIds)
			if (streakMilestone !== null) {
				await redis.hIncrBy(`user:${userId}:economy`, 'coins', streakMilestone.bonus)
				await redis.hIncrBy(`user:${userId}:economy`, 'totalCoins', streakMilestone.bonus)
			}

			// Check referral eligibility for challenge posts
			const puzzleMetaForReferral = await redis.hGetAll(`game:${postId}:puzzle`)
			if (puzzleMetaForReferral?.challengeBy) {
				await checkAndAwardReferral(postId, userId, puzzleMetaForReferral.challengeBy, {
					newPlayerTotalSolves: preCompletionEconomy.totalSolves,
				})
			}

			engagement = {
				variableReward,
				newAchievements,
				streakMilestone,
				missionsUpdated: true,
			}
		} catch (engagementErr) {
			// Engagement logic is non-blocking — failures don't prevent completion from succeeding
			console.error('Engagement logic error (non-critical):', engagementErr)
		}

		// ─── Analytics: track completion (non-blocking) ────────────────────────
		try {
			const { subredditId } = context
			const today = getTodayUTC()
			await trackCompletion(today, postId, userId, subredditId)
			if (isChallengePost) {
				await trackChallengeCompletion(today, postId, userId, preCompletionEconomy.totalSolves === 0)
			}
		} catch (err) {
			console.error('[Analytics] Completion tracking failed (non-critical):', err)
		}

		// ─── Viral tracking: record completer + cycle time + conversion (non-blocking) ─
		try {
			const today = getTodayUTC()
			await recordCompleter(today, userId)

			// For new players on challenge posts, compute and record cycle time
			if (isChallengePost && preCompletionEconomy.totalSolves === 0) {
				const creationTs = await getChallengeCreationTimestamp(postId)
				if (creationTs !== null) {
					const elapsedSeconds = (Date.now() - creationTs) / 1000
					await recordCycleTime(today, elapsedSeconds)
				}
			}

			// Record channel conversion only for the attributed user's first completion.
			if (preCompletionEconomy.totalSolves === 0) {
				const attribution = await getAttribution(userId)
				if (attribution !== null) {
					await recordChannelConversion(today, attribution, userId)
				}
			}
		} catch (err) {
			console.error('[Viral] Completion tracking failed (non-critical):', err)
		}

		// ─── Daily preview update on first completion (deduped, non-blocking) ──
		try {
			const previewMeta = await redis.hGetAll(`game:${postId}:preview`)
			if (previewMeta?.type === 'daily') {
				const dedupKey = `preview:updated:${postId}`
				const alreadyUpdated = await redis.get(dedupKey)
				if (alreadyUpdated === undefined) {
					await redis.set(dedupKey, '1')
					await redis.expire(dedupKey, 86400) // 24h TTL

					const existingData = previewMeta.data
					if (existingData) {
						const parsed = JSON.parse(existingData) as { puzzleNumber: number; gridSize: number }
						const updatedPreviewData = {
							puzzleNumber: parsed.puzzleNumber,
							gridSize: parsed.gridSize,
							completionsToday: 1,
							activeNow: 0,
							fastestTime: timeTaken,
							fastestUsername: null,
						}
						await redis.hSet(`game:${postId}:preview`, {
							type: 'daily',
							data: JSON.stringify(updatedPreviewData),
						})
					}
				}
			}
		} catch (previewErr) {
			console.error('[Preview] Daily preview update failed (non-critical):', previewErr)
		}

		// ─── Season scoring (non-blocking) ─────────────────────────────────────
		let seasonRank: number | null = null
		let seasonPoints = 0
		try {
			const season = getCurrentSeason()
			if (season.isActive) {
				const parTime = getParTimeForGrid(gridSize)
				const score = calculateSeasonScore(timeTaken, parTime, mistakes)
				await recordSeasonScore(season.seasonId, userId, score)

				// Read back the player's updated score and rank
				const leaderboardKey = `season:${season.seasonId}:leaderboard`
				const playerScore = await redis.zScore(leaderboardKey, userId)
				seasonPoints = playerScore ?? 0

				if (playerScore !== undefined && playerScore !== null) {
					const higherEntries = await redis.zRange(leaderboardKey, playerScore + 1, Number.MAX_SAFE_INTEGER, { by: 'score' })
					seasonRank = higherEntries.length + 1
				}
			}
		} catch (err) {
			console.error('[Seasons] Score recording failed (non-critical):', err)
		}

		// ─── Auto-Challenge on Perfect Solve (VIRAL: opt-out sharing) ───────────
		// When a player achieves 0 mistakes, automatically create a challenge post
		// unless they've opted out. This is the default-effect viral mechanic:
		// opt-out countries have 90%+ organ donation; opt-in have 15%.
		let autoChallengeUrl: string | undefined
		try {
			const { subredditName } = context
			if (
				mistakes === 0 &&
				!isChallengePost &&
				subredditName
			) {
				// Check opt-out flag
				const optOutKey = `user:${userId}:autoChallenge:optOut`
				const optedOut = await redis.get(optOutKey)

				// Check daily rate limit for auto-challenges (max 3/day to avoid spam)
				const autoChallengeCountKey = `user:${userId}:autoChallenge:count:${today}`
				const autoChallengeCountStr = await redis.get(autoChallengeCountKey)
				const autoChallengeCount = autoChallengeCountStr ? parseInt(autoChallengeCountStr, 10) : 0

				if (optedOut !== 'true' && autoChallengeCount < 3) {
					// Fetch username
					let challengeUsername = 'Anon'
					try {
						const user = await reddit.getUserById(userId as `t2_${string}`)
						challengeUsername = user?.username ?? 'Anon'
					} catch { /* fallback */ }

					// Build competitive title (no "Level X")
					const gridLabel = `${gridSize}×${gridSize}`
					const difficultyLabel = gridSize <= 4 ? 'Quick' : gridSize <= 6 ? 'Standard' : 'Hard'
					const autoTitleTemplates = [
						`🎯 ${timeTaken}s, zero mistakes — u/${challengeUsername} just set the bar`,
						`🔥 u/${challengeUsername} nailed a ${difficultyLabel} ${gridLabel} in ${timeTaken}s perfectly. Your move.`,
						`👀 Perfect ${timeTaken}s by u/${challengeUsername}. Think you're faster?`,
						`🏆 Flawless ${difficultyLabel} solve: ${timeTaken}s. u/${challengeUsername} challenges you`,
					]
					const autoTitleIdx = (Date.now() % autoTitleTemplates.length)
					const autoTitle = autoTitleTemplates[autoTitleIdx] ?? autoTitleTemplates[0]!

					const autoPost = await reddit.submitCustomPost({
						subredditName,
						title: autoTitle,
						runAs: 'USER',
						userGeneratedContent: { text: autoTitle },
						postData: { postType: 'urjo-puzzle' },
					})

					// Seed the new post with the current puzzle
					if (puzzle) {
						await redis.hSet(`game:${autoPost.id}:puzzle`, {
							colors: puzzle.colors,
							numbers: puzzle.numbers,
							solution: puzzle.solution,
							difficulty: puzzle.difficulty,
							gridSize: puzzle.gridSize,
							created: new Date().toISOString(),
							challengeBy: userId,
							challengeScore: timeTaken.toString(),
							sourcePostId: postId,
							autoGenerated: 'true',
							challengeChainLength: '1',
						})

						await redis.hSet(`game:${autoPost.id}:stats`, {
							attempts: '0',
							beats: '0',
						})

						// Post leaderboard comment
						const leaderboardComment = await reddit.submitComment({
							id: autoPost.id,
							text: `🏆 **Challenge Leaderboard**\n\n👥 Attempts: 0\n✅ Beaten: 0 times\n⏱️ Fastest: --\n👑 Champion: --\n\nThink you can beat it? Play above! 🎯`,
						})

						await redis.hSet(`game:${autoPost.id}:meta`, {
							postType: 'urjo-puzzle',
							leaderboardCommentId: leaderboardComment.id,
							stickyCommentId: leaderboardComment.id,
							sourcePostId: postId,
							challengeCreatorId: userId,
							challengeChainLength: '1',
							createdAt: Date.now().toString(),
							autoGenerated: 'true',
						})

						// Build masked preview for feed (curiosity gap)
						const emojiMap: Record<string, string> = { r: '🟥', b: '🟦' }
						const cells = puzzle.colors.split('').map((ch: string) => emojiMap[ch] ?? '⬛')
						const rows: string[] = []
						for (let i = 0; i < cells.length; i += gridSize) {
							rows.push(cells.slice(i, i + gridSize).join(''))
						}
						const fullGrid = rows.join('\n')
						const maskedGrid = maskPuzzleGrid(fullGrid, gridSize, autoPost.id, 0.4)

						await redis.hSet(`game:${autoPost.id}:preview`, {
							type: 'challenge',
							data: JSON.stringify({
								challengerUsername: challengeUsername,
								challengerTime: timeTaken,
								gridSize,
								puzzleGridEmoji: maskedGrid,
								beatsCount: 0,
								attemptsCount: 0,
								fastestTime: null,
								activeRacers: 0,
							}),
							fullGrid,
						})
					}

					// Increment daily auto-challenge counter
					await redis.set(autoChallengeCountKey, (autoChallengeCount + 1).toString())
					await redis.expire(autoChallengeCountKey, 86400)

					// Track viral metrics
					await incrementChallengesCreated(userId)
					await trackChallengePostCreated(today, userId, autoPost.id)
					await recordSharer(today, userId)
					await recordChallengeCreation(today, autoPost.id, Date.now())

					autoChallengeUrl = redditCommentsUrl(autoPost.id)
				}
			}
		} catch (autoChallengeErr) {
			// Auto-challenge is non-blocking — failures don't prevent completion
			console.error('[AutoChallenge] Failed (non-critical):', autoChallengeErr)
		}

		const response: CompleteResponse = {
			performanceScore,
			newSkillLevel,
			previousSkillLevel: currentLevel,
			streak,
			coinReward,
			...(engagement !== undefined && { engagement }),
			...(seasonRank !== null && { seasonRank }),
			...(seasonPoints > 0 && { seasonPoints }),
			...(autoChallengeUrl !== undefined && { autoChallengeUrl }),
			// Run-again loop telemetry — used by the client to display the
			// session-streak chip + apply the bonus to the displayed wallet.
			sessionRun,
			sessionRunMultiplier,
			sessionRunBonusCoins,
			// Streak forecast — drives the "Return tomorrow → +X" hook on the
			// completion screen so the player can see the next reward bump.
			streakForecast: forecastNextStreak(streak.currentStreak),
			// Weekend Event payload — duplicated on /complete so the result
			// screen can show "🎉 +N weekend bonus" + a fresh countdown.
			weekendEvent,
			weekendBonusCoins,
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
		// Aligns with viral channel `result_copy` recorded below.
		// Previously this also incremented `trackResultComment`, which
		// double-counted shares across two channel counters and made
		// per-channel mix analysis unreliable.
		await Promise.all([
			trackResultCopy(getTodayUTC()),
			incrementSharesCount(userId),
		])

		// ─── Viral tracking: record sharer + channel open (non-blocking) ──────
		try {
			const today = getTodayUTC()
			await recordSharer(today, userId)
			await recordChannelOpen(today, 'result_copy', userId)
		} catch (err) {
			console.error('[Viral] Share tracking failed (non-critical):', err)
		}

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

// ─── POST /api/game/result-comment ───────────────────────────────────────────

gameRouter.post('/api/game/result-comment', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		// Check dedup — one result comment per user per post
		const dedupKey = resultCommentDedupKey(userId, postId)
		const alreadyCommented = await redis.get(dedupKey)
		if (alreadyCommented !== undefined) {
			return c.json({ error: 'Result already shared on this post' }, 400)
		}

		const body = await c.req.json().catch(() => null)
		if (!body || typeof body !== 'object') {
			return c.json({ error: 'Invalid request body' }, 400)
		}

		const {
			puzzleNumber,
			gridSize,
			skillLevel,
			timeTaken,
			mistakes,
			streak,
			colorGrid,
		} = body as Record<string, unknown>

		if (
			typeof puzzleNumber !== 'number' || puzzleNumber < 1 ||
			typeof gridSize !== 'number' || ![4, 6, 8].includes(gridSize) ||
			typeof skillLevel !== 'number' || skillLevel < 1 || skillLevel > 9 ||
			typeof timeTaken !== 'number' || timeTaken <= 0 ||
			typeof mistakes !== 'number' || mistakes < 0 ||
			typeof streak !== 'number' || streak < 0 ||
			!Array.isArray(colorGrid)
		) {
			return c.json({ error: 'Invalid result card data' }, 400)
		}

		const resultData: ResultCardData = {
			puzzleNumber,
			gridSize: gridSize as 4 | 6 | 8,
			skillLevel,
			colorGrid: colorGrid as ('red' | 'blue')[][],
			timeTaken,
			mistakes,
			streak,
		}

		const resultText = serializeResultCard(resultData)

		// Find the sticky comment to reply to
		const postMeta = await redis.hGetAll(`game:${postId}:meta`)
		const stickyCommentId = postMeta['stickyCommentId']

		if (!stickyCommentId) {
			return c.json({ error: 'No sticky comment available' }, 400)
		}

		await reddit.submitComment({
			id: stickyCommentId as `t1_${string}`,
			text: resultText,
			runAs: 'USER',
		})

		// Set dedup flag
		await redis.set(dedupKey, '1')
		await redis.expire(dedupKey, RESULT_COMMENT_TTL)
		// Aligns with viral channel `result_comment` recorded below.
		// Previously this also incremented `trackResultCopy`, which
		// double-counted shares across two channel counters.
		await Promise.all([
			trackResultComment(getTodayUTC(), userId),
			incrementSharesCount(userId),
		])

		// ─── Viral tracking: record sharer + channel open (non-blocking) ──────
		try {
			const today = getTodayUTC()
			await recordSharer(today, userId)
			await recordChannelOpen(today, 'result_comment', userId)
		} catch (err) {
			console.error('[Viral] Result comment tracking failed (non-critical):', err)
		}

		return c.json({ success: true })
	} catch (error) {
		console.error('Error posting result comment:', error)
		return c.json({ error: 'Failed to post result comment' }, 500)
	}
})

// ─── POST /api/game/hints/dismiss ────────────────────────────────────────────

const VALID_HINT_KINDS: readonly HintKind[] = ['numberConstraint', 'adjacencyViolation']

gameRouter.post('/api/game/hints/dismiss', async (c) => {
	const { userId } = context

	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const body = await c.req.json().catch(() => null)
		if (!body || typeof body !== 'object') {
			return c.json({ error: 'Invalid request body' }, 400)
		}

		const { kind } = body as Record<string, unknown>
		if (typeof kind !== 'string' || !(VALID_HINT_KINDS as readonly string[]).includes(kind)) {
			return c.json({ error: 'Invalid request body' }, 400)
		}

		await markHintDismissed(userId, kind as HintKind)
		return c.json({ dismissed: true })
	} catch (error) {
		console.error('Error dismissing hint:', error)
		return c.json({ error: 'Failed to dismiss hint' }, 500)
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
		const sourceMeta = await redis.hGetAll(`game:${postId}:meta`)
		const sourceChainLength = parseInt(sourceMeta?.challengeChainLength ?? '0', 10)
		const challengeChainLength = sourceChainLength + 1

		// Get username directly from Reddit API to avoid "You" fallback
		let username = 'Anon'
		try {
			const user = await reddit.getUserById(userId as `t2_${string}`)
			username = user?.username ?? 'Anon'
		} catch {
			// fallback to Anon
		}

		// Build title — rotating high-CTR templates WITHOUT "Level X" (removes beginner signal)
		const perfectTag = mistakes === 0 ? ' (zero mistakes)' : ''
		const gridLabel = `${puzzle.gridSize}×${puzzle.gridSize}`
		const difficultyLabel = parseInt(puzzle.gridSize, 10) <= 4 ? 'Quick' : parseInt(puzzle.gridSize, 10) <= 6 ? 'Standard' : 'Hard'
		const titleTemplates = [
			`🎯 ${timeTaken}s to beat — u/${username} just set the bar${perfectTag}`,
			`🔥 u/${username} cleared a ${difficultyLabel} ${gridLabel} in ${timeTaken}s${perfectTag}. Your move.`,
			`👀 ${timeTaken}s${perfectTag}. u/${username} challenges you on this ${gridLabel}. Think you're faster?`,
			`🏆 ${difficultyLabel} puzzle dropped: ${timeTaken}s to beat. u/${username} says try 🎯`,
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
			sourcePostId: postId,
			challengeChainLength: challengeChainLength.toString(),
		})

		// Initialize stats for the challenge post
		await redis.hSet(`game:${newPost.id}:stats`, {
			attempts: '0',
			beats: '0',
		})

		// Mark rate limit
		await redis.set(challengeKey, 'true')
		await redis.expire(challengeKey, 86400)

		// Post a comment on the challenge post showing the score to beat (no Level reference)
		const scoreComment = `🏆 Score to beat: ${timeTaken}s with ${mistakes === 0 ? 'zero mistakes' : `${mistakes} mistake${mistakes === 1 ? '' : 's'}`}\n\nThink you can do better? Solve the puzzle above! 🎯`
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
			stickyCommentId: leaderboardComment.id,
			sourcePostId: postId,
			challengeCreatorId: userId,
			challengeChainLength: challengeChainLength.toString(),
			createdAt: Date.now().toString(),
		})
		await incrementChallengesCreated(userId)
		await trackChallengePostCreated(today, userId, newPost.id)

		// ─── Custom post preview for feed engagement (VIRAL: curiosity-gap masking) ─
		try {
			const emojiMap: Record<string, string> = { r: '🟥', b: '🟦' }
			const cells = puzzle.colors.split('').map((ch) => emojiMap[ch] ?? '⬛')
			const gridSizeNum = parseInt(puzzle.gridSize, 10)
			const rows: string[] = []
			for (let i = 0; i < cells.length; i += gridSizeNum) {
				rows.push(cells.slice(i, i + gridSizeNum).join(''))
			}
			const fullEmojiGrid = rows.join('\n')
			
			// VIRAL OPTIMIZATION: Mask 60% of cells to create curiosity gap
			// Shows enough pattern to intrigue, not enough to satisfy
			const maskedGrid = maskPuzzleGrid(fullEmojiGrid, gridSizeNum, newPost.id, 0.4)

			const previewData: ChallengePreviewData = {
				challengerUsername: username,
				challengerTime: timeTaken,
				gridSize: gridSizeNum,
				puzzleGridEmoji: maskedGrid, // Use masked grid instead of full
				beatsCount: 0,
				attemptsCount: 0,
				fastestTime: null,
				activeRacers: 0,
			}
			buildChallengePreview(previewData)

			// Store BOTH masked (for preview) and full (for game) grids
			await redis.hSet(`game:${newPost.id}:preview`, {
				type: 'challenge',
				data: JSON.stringify(previewData),
				fullGrid: fullEmojiGrid, // Keep original for potential future use
			})
		} catch (previewErr) {
			console.error('[Preview] Challenge preview failed (non-critical):', previewErr)
		}

		// ─── Viral tracking: record sharer + channel open + challenge creation (non-blocking) ─
		try {
			await recordSharer(today, userId)
			await recordChannelOpen(today, 'challenge_post', userId)
			await recordChallengeCreation(today, newPost.id, Date.now())
		} catch (err) {
			console.error('[Viral] Challenge post tracking failed (non-critical):', err)
		}

		return c.json<ChallengeResponse>({ success: true, postUrl: redditCommentsUrl(newPost.id) })
	} catch (error) {
		console.error('Challenge post error:', error)
		return c.json<ChallengeResponse>({ success: false, error: 'Failed to create challenge' })
	}
})

// ─── POST /api/game/auto-challenge/opt-out ────────────────────────────────────

/**
 * Opt out of auto-challenge on perfect solve.
 * Sets a permanent flag in Redis so the user's perfect solves
 * no longer automatically create challenge posts.
 */
gameRouter.post('/api/game/auto-challenge/opt-out', async (c) => {
	const { userId } = context

	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		await redis.set(`user:${userId}:autoChallenge:optOut`, 'true')
		return c.json({ success: true, optedOut: true })
	} catch (error) {
		console.error('Error opting out of auto-challenge:', error)
		return c.json({ error: 'Failed to opt out' }, 500)
	}
})

// ─── POST /api/game/auto-challenge/opt-in ─────────────────────────────────────

/**
 * Opt back in to auto-challenge on perfect solve.
 * Removes the opt-out flag so future perfect solves create challenge posts again.
 */
gameRouter.post('/api/game/auto-challenge/opt-in', async (c) => {
	const { userId } = context

	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		await redis.del(`user:${userId}:autoChallenge:optOut`)
		return c.json({ success: true, optedOut: false })
	} catch (error) {
		console.error('Error opting in to auto-challenge:', error)
		return c.json({ error: 'Failed to opt in' }, 500)
	}
})
