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
	ChallengeRequest,
	ChallengeResponse,
	SerializedPuzzle,
	GridSizeResponse,
	FirstScreenData,
} from '../../shared/types'
import { MIN_SKILL_LEVEL, getGridLevelConfig, isValidGridSize, DEFAULT_GRID_SIZE } from '../../shared/constants'
import { MAX_STREAK_FREEZES } from '../../shared/constants'
import type { GridSize } from '../../shared/constants'
import { isBoardSolved } from '../../shared/board'
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
	getPathLevel,
	incrementPathLevel,
	getGridHistory,
	setGridHistory,
	getISOWeek,
	safeParseInt,
	countPlayersAbove,
	makeInstanceId,
} from '../lib/helpers'
import { isUserMigrated, migrateUserToPerGrid } from '../lib/migration'
import { checkAchievements, checkStreakMilestone, unlockAchievements, getUnlockedAchievements } from '../lib/achievements'
import { rollVariableRewards } from '../lib/variable-rewards'
import { checkAndAwardReferral } from '../lib/referrals'
import {
	trackFirstAction,
	trackCompletion,
	trackResultComment,
	trackChallengePostCreated,
	trackChallengeOpen,
	trackChallengeCompletion,
	trackHelpTap,
	normalizeFirstActionSource,
} from '../lib/analytics'
import {
	captureReferrer,
	markFirstTapAndCommit,
	getSessionIdFromHeader,
} from '../lib/qualified'
import { trackOpen } from '../lib/metrics'
import {
	assignVariant,
	trackVariantOpen,
	trackVariantScreenTap,
	trackVariantFirstAction,
	trackVariantCompletion,
} from '../lib/ab-test'
import {
	isDifficulty,
	markS2REligible,
	tryConvertS2R,
} from '../lib/s2r'
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
import type { ChallengePreviewData } from '../../shared/social-types'
import { isModeratorCached } from '../lib/moderator'
import { isOptedIn } from '../lib/notify'
import { calculateSeasonScore, getCurrentSeason, recordSeasonScore } from '../lib/seasons'
import { getSocialStats, incrementChallengeBeats, incrementChallengesCreated, incrementSharesCount } from '../lib/social'
import { serializeResultCard } from '../../shared/result-card'
import type { ResultCardData } from '../../shared/growth-types'
import type { EngagementCompletionData, UserStats } from '../../shared/engagement-types'
import { getSessionRunMultiplier, getSessionRunBonusCoins } from '../../shared/session-run'
import { forecastNextStreak } from '../../shared/streak-rewards'
import { getActiveWeekendEvent, getWeekendEventBonusCoins } from '../../shared/weekend-event'
import { buildLoggedOutGameState, buildLoggedOutCompleteResponse } from '../lib/logged-out'
import { createStickyComment } from '../post'

// ─── Result Comment Dedup Key ────────────────────────────────────────────────

const RESULT_COMMENT_TTL = 172800 // 48 hours

const resultCommentDedupKey = (userId: string, postId: string): string =>
	`user:${userId}:resultCommented:${postId}`

const redditCommentsUrl = (postId: string): string =>
	`https://reddit.com/comments/${postId.replace(/^t3_/, '')}`

const formatMistakeCount = (mistakes: number): string =>
	mistakes === 0 ? 'zero mistakes' : `${mistakes} mistake${mistakes === 1 ? '' : 's'}`

const buildChallengeTargetLine = (
	scoreSeconds: string | undefined,
	mistakes: string | undefined,
): string => {
	if (!scoreSeconds) return ''

	const parsedMistakes = mistakes === undefined ? undefined : Number.parseInt(mistakes, 10)
	const mistakesText = parsedMistakes === undefined || Number.isNaN(parsedMistakes)
		? ''
		: ` with ${formatMistakeCount(parsedMistakes)}`

	return `Score to beat: ${scoreSeconds}s${mistakesText}`
}

const normalizeChallengeTitle = (value: unknown): string | undefined => {
	if (typeof value !== 'string') return undefined
	const title = value.trim()
	if (title.length < 1 || title.length > 120) return undefined
	return title
}

export const gameRouter = new Hono()

// ─── checkChallengeBeat ──────────────────────────────────────────────────────

/**
 * Update the leaderboard comment for a challenge post.
 * Fetches current stats and edits the pinned comment in place.
 */
async function updateLeaderboardComment(postId: string): Promise<void> {
	try {
		const [stats, meta, puzzleMeta] = await Promise.all([
			redis.hGetAll(`game:${postId}:stats`),
			redis.hGetAll(`game:${postId}:meta`),
			redis.hGetAll(`game:${postId}:puzzle`),
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

		const targetLine = buildChallengeTargetLine(
			puzzleMeta['challengeScore'],
			puzzleMeta['challengeMistakes'],
		)

		const leaderboardText = `🏆 **Challenge Leaderboard**
${targetLine ? `\n${targetLine}\n` : ''}

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
			// Reverse index for account deletion: track all posts where this user is champion
			await redis.zAdd(`user:${winnerId}:championOf`, { member: postId, score: Date.now() })
		}

		// Update the leaderboard comment
		await updateLeaderboardComment(postId)
		await incrementChallengeBeats(challengerId)

		// Update post preview with beat info (non-blocking, deduped)
		try {
			const previewDedupKey = `preview:beat:${postId}:${winnerId}`
			const alreadyUpdatedPreview = await redis.get(previewDedupKey)
			if (!alreadyUpdatedPreview) {
				// Two-step write: a crash between set and expire would orphan this key.
				// Acceptable: the preview just updates again on the next beat. The
				// MULTI/EXEC-without-WATCH pattern is unavailable in Devvit's Redis
				// client, and using WATCH here introduces worse failure modes.
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

		// Mark beat as recorded — after stats are written so partial failure doesn't lose data.
		// Two-step write: see previewDedupKey comment above for rationale.
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

	// Beat notifications are automated APP-account comments, not user-authored content.
	// runAs: 'APP' (the default) is intentional — this is an informational update
	// posted by the system, not an action taken on behalf of the player.
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
 *
 * `instanceId` identifies the specific issued puzzle so completion can be
 * credited at most once per issuance ('post' = the post's baked puzzle, a
 * random id = a freshly generated per-user puzzle from grid-size/next-challenge).
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
	instanceId: string
} | null> => {
	const userPuzzle = await redis.hGetAll(`user:${userId}:game:${postId}:currentPuzzle`)
	if (userPuzzle && userPuzzle.colors) {
		return {
			colors: userPuzzle.colors,
			numbers: userPuzzle.numbers ?? '',
			solution: userPuzzle.solution ?? '',
			difficulty: userPuzzle.difficulty ?? 'easy',
			gridSize: userPuzzle.gridSize ?? '4',
			instanceId: userPuzzle.instanceId ?? 'self',
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
		instanceId: 'post',
	}
}

type FirstScreenTarget = NonNullable<FirstScreenData['targetToBeat']>
type FirstScreenMaker = { username: string; avatarUrl?: string }

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

const getFirstScreenMaker = async (
	postPuzzleMeta: Record<string, string> | undefined,
	viewerId: string,
): Promise<FirstScreenMaker | undefined> => {
	const storedUsername = postPuzzleMeta?.challengeByUsername
	if (storedUsername && storedUsername !== 'Anon') {
		return {
			username: storedUsername,
			...(postPuzzleMeta?.challengeByAvatar && { avatarUrl: postPuzzleMeta.challengeByAvatar }),
		}
	}

	const challengerId = postPuzzleMeta?.challengeBy
	if (!challengerId) return undefined

	const username = await fetchUsername(challengerId, viewerId)
	if (!username || username === 'Anon') return undefined

	return { username }
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
		if (dayDiff <= 0) {
			// Defensive: a non-positive diff means lastPlayedDate is today or
			// in the future (clock skew / bad stored data). Treat it like
			// "already played today" — never wipe an existing streak.
			return streakData
		}
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

	// Update non-atomic fields with hSet. Only `dailyFirstSolve` is owned by
	// the completion path. `ownedTitles`/`equippedTitle` are deliberately NOT
	// written here — they're owned by the shop/mystery-box paths, and reading
	// them defaults safely (getUserEconomy → ['puzzler'] / 'puzzler'). Writing
	// a stale snapshot of them on every solve would clobber a concurrent
	// purchase or equip.
	await redis.hSet(economyKey, {
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

	// ─── Logged-out path ─────────────────────────────────────────────────
	// Reddit serves a large base of logged-out users via SEO/shared links.
	// They must be able to play immediately (no login wall). We serve the
	// post's baked-in puzzle with no per-user state. See lib/logged-out.ts.
	if (!userId) {
		try {
			const postPuzzle = await redis.hGetAll(`game:${postId}:puzzle`)
			if (!postPuzzle || !postPuzzle.colors) {
				return c.json({ error: 'Game not found' }, 404)
			}

			const serializedPuzzle: SerializedPuzzle = {
				colors: postPuzzle.colors,
				numbers: postPuzzle.numbers ?? '',
				solution: postPuzzle.solution ?? '',
				difficulty: (postPuzzle.difficulty ?? 'easy') as SerializedPuzzle['difficulty'],
				gridSize: parseInt(postPuzzle.gridSize ?? '4', 10),
			}
			const isChallenge = Boolean(postPuzzle.challengeBy)

			let puzzleNumber: number | undefined
			try {
				const counterStr = await redis.get('stats:puzzleCounter')
				puzzleNumber = counterStr !== undefined ? parseInt(counterStr, 10) : undefined
			} catch {
				// non-critical
			}

			return c.json(
				buildLoggedOutGameState({
					puzzle: serializedPuzzle,
					postId,
					isChallenge,
					weekendEvent: getActiveWeekendEvent(new Date()),
					...(puzzleNumber !== undefined && { puzzleNumber }),
				}),
			)
		} catch (error) {
			console.error('Error fetching logged-out game state:', error)
			return c.json({ error: 'Failed to fetch game state' }, 500)
		}
	}

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
					instanceId: 'post',
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
				const instanceId = makeInstanceId()
				await redis.hSet(`user:${userId}:game:${postId}:currentPuzzle`, {
					colors: newPuzzle.colors,
					numbers: newPuzzle.numbers,
					solution: newPuzzle.solution,
					difficulty: newPuzzle.difficulty,
					gridSize: newPuzzle.gridSize.toString(),
					instanceId,
				})
				await redis.expire(`user:${userId}:game:${postId}:currentPuzzle`, 2592000) // 30-day TTL
				puzzle = {
					colors: newPuzzle.colors,
					numbers: newPuzzle.numbers,
					solution: newPuzzle.solution,
					difficulty: newPuzzle.difficulty,
					gridSize: newPuzzle.gridSize.toString(),
					instanceId,
				}
			}
		}

		// Determine skill level: per-grid for non-challenge, from puzzle for challenge
		const effectiveGridSize = isChallenge
			? (parseInt(puzzle.gridSize, 10) as GridSize)
			: gridSizePreference
		const skillLevel = await getGridSkillLevel(userId, effectiveGridSize)
		const pathLevel = await getPathLevel(userId)

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

		// ─── Analytics: capture session-scoped qualification signals ─────────
		// Replaces the old trackPostOpen() pre-intent counter. We only
		// capture the Reddit referrer here; the qualification gate
		// (referrer + first-tap + dwell) is evaluated when all three are
		// satisfied via /api/dwell/tick or /api/game/first-action.
		try {
			const { subredditId } = context
			const sessionId = getSessionIdFromHeader(c.req.raw.headers)
			if (sessionId !== null) {
				const referer = c.req.raw.headers.get('referer')
				await captureReferrer(sessionId, userId, subredditId, referer)
				// S2R: if this state-load is within 60s of a prior completion
				// in the same session and a different post, count it as a
				// "started puzzle 2" conversion.
				await tryConvertS2R(sessionId, postId)
			}
			await trackOpen(today, postId, userId)
			if (isChallenge) {
				await trackChallengeOpen(today, postId, userId)
			}
		} catch (err) {
			console.error('[Analytics] Open instrumentation failed (non-critical):', err)
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
				activePlayers: safeParseInt(cachedActive, 0),
				collectiveStreakDays: safeParseInt(cachedStreaks, 0),
			}
		} catch {
			// non-critical
		}

		// ─── Current season info ───────────────────────────────────────────────
		const currentSeason = getCurrentSeason()

		// ─── Challenger info (challenge posts only) ────────────────────────────
		// Returned for ALL visitors so the in-game strip can show avatar +
		// target time without a separate fetch. Never shown on regular posts.
		let challengerInfo: GameState['challengerInfo'] | undefined
		if (isChallenge) {
			try {
				const maker = await getFirstScreenMaker(postPuzzleMeta, userId)
				const target = await getFirstScreenTarget(today, serializedPuzzle.gridSize, postPuzzleMeta, userId)
				if (maker !== undefined && target !== undefined) {
					challengerInfo = {
						username: maker.username,
						...(maker.avatarUrl !== undefined && { avatarUrl: maker.avatarUrl }),
						targetSeconds: target.seconds,
					}
				}
			} catch {
				// non-critical — strip simply won't render
			}
		}

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
					seasonProgress = {
						rank: (await countPlayersAbove(leaderboardKey, playerScore)) + 1,
						score: playerScore,
					}
				} else {
					seasonProgress = { rank: null, score: 0 }
				}
			}
		} catch (err) {
			console.error('[State] Season progress fetch failed (non-critical):', err)
		}

		// ─── A/B/C first-screen experiment ────────────────────────────────────────
		// Shown only for non-challenge, logged-in, non-first-time users who
		// have NOT already had a first-action on this post today.
		let abVariant: 'A' | 'B' | 'C' | undefined
		let hasPlayedToday = false
		let firstScreenData: FirstScreenData | undefined
		if (!isChallenge && !isFirstTimeUser) {
			try {
				abVariant = assignVariant(userId)
				// Check if user already acted today — skip first screen if so.
				const actedKey = `analytics:acted:${today}:${postId}:${userId}`
				const acted = await redis.get(actedKey)
				hasPlayedToday = acted !== undefined
				// Build first-screen data for both A/B component and Variant C overlay.
				if (communityStats !== undefined) {
					const target = await getFirstScreenTarget(
						today,
						serializedPuzzle.gridSize,
						postPuzzleMeta,
						userId,
					)
					firstScreenData = {
						samplePuzzle: serializedPuzzle,
						instruction: 'Equal reds and blues per row and column — no identical neighbours.',
						communityStats,
						...(target !== undefined && { targetToBeat: target }),
					}
				}
				// Track the open per variant (deduped, fire-and-forget).
				if (!hasPlayedToday) {
					void trackVariantOpen(today, postId, userId, abVariant).catch((err) =>
						console.error('[AB] variant open tracking failed:', err),
					)
				}
			} catch (err) {
				console.error('[AB] Variant setup failed (non-critical):', err)
			}
		}

		const gameState: GameState = {
			puzzle: serializedPuzzle,
			tutorialCompleted,
			isLoggedIn: true,
			skillLevel,
			pathLevel,
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
			...(challengerInfo !== undefined && { challengerInfo }),
			// Weekend Event — surfaced on every state read so the banner can
			// render the latest "ends in" countdown without an extra fetch.
			weekendEvent: getActiveWeekendEvent(new Date()),
			// Always-on progression strip data
			...(seasonProgress !== undefined && { seasonProgress }),
			// A/B/C first-screen experiment
			...(abVariant !== undefined && { variant: abVariant }),
			...(hasPlayedToday && { hasPlayedToday: true }),
			...(firstScreenData !== undefined && { firstScreen: firstScreenData }),
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

		// ─── Logged-out path ─────────────────────────────────────────────
		// Serve a fresh puzzle at the requested size without persisting the
		// preference or a per-user puzzle override (nothing to key on).
		if (!userId) {
			const newPuzzle = generatePuzzleForGridLevel(gridSize, MIN_SKILL_LEVEL)
			const response: GridSizeResponse = {
				puzzle: newPuzzle,
				skillLevel: MIN_SKILL_LEVEL,
				gridSizePreference: gridSize,
			}
			return c.json(response)
		}

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
				instanceId: makeInstanceId(),
			})
			await redis.expire(`user:${userId}:game:${postId}:currentPuzzle`, 2592000) // 30-day TTL
			// Reset the server-side timer anchor so this freshly issued puzzle
			// is timed from now, not from a stale earlier issuance.
			const startTimeKey = `user:${userId}:puzzleStartTime:${postId}`
			await redis.set(startTimeKey, Date.now().toString())
			await redis.expire(startTimeKey, 86400)
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
		const body = await c.req.json().catch(() => null)
		const source = normalizeFirstActionSource(
			body !== null && typeof body === 'object'
				? (body as Record<string, unknown>).source
				: undefined,
		)
		const today = getTodayUTC()
		const isNew = await trackFirstAction(today, postId, userId, subredditId, source)
		// Track per-variant first-action (fire-and-forget, only on first action).
		if (isNew) {
			const variant = assignVariant(userId)
			void trackVariantFirstAction(today, variant).catch((err) =>
				console.error('[AB] variant first-action tracking failed:', err),
			)
		}
		// ─── DQP gate: mark first-tap and commit if all conditions are met ────
		try {
			const sessionId = getSessionIdFromHeader(c.req.raw.headers)
			if (sessionId !== null) {
				await markFirstTapAndCommit(sessionId, today, userId, subredditId)
			}
		} catch (err) {
			console.error('[DQP] First-tap commit failed (non-critical):', err)
		}

		return c.json({ tracked: isNew })
	} catch (error) {
		console.error('[Analytics] First action tracking failed:', error)
		return c.json({ tracked: false })
	}
})

// ─── POST /api/game/first-screen-tap ─────────────────────────────────────────
// Fired when a user taps "Play" / "Beat Xs" on a Variant A or B first screen.
// Fire-and-forget from the client; logged-out users are silently ignored.

gameRouter.post('/api/game/first-screen-tap', async (c) => {
	const { userId } = context
	if (!userId) return c.json({ tracked: false })

	try {
		const today = getTodayUTC()
		const variant = assignVariant(userId)
		await trackVariantScreenTap(today, variant)
		return c.json({ tracked: true })
	} catch (err) {
		console.error('[AB] First-screen tap tracking failed:', err)
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

	// ─── Logged-out path ─────────────────────────────────────────────────
	// Logged-out users get a completion result (so the "nice time" screen +
	// login CTA can show) but nothing is persisted — there is no user to
	// key streak/coins/season on. Time is taken from the client since we
	// can't store a server-side start time without a userId.
	if (!userId) {
		try {
			const body = await c.req.json().catch(() => null)
			const clientTime = body && typeof body === 'object' ? (body as CompleteRequest).timeTaken : undefined
			if (typeof clientTime !== 'number' || clientTime <= 0) {
				return c.json({ error: 'Invalid timeTaken' }, 400)
			}
			const mistakes = body && typeof (body as CompleteRequest).mistakes === 'number'
				? (body as CompleteRequest).mistakes ?? 0
				: 0

			const postPuzzle = await redis.hGetAll(`game:${postId}:puzzle`)
			const rawGridSize = postPuzzle?.gridSize ? parseInt(postPuzzle.gridSize, 10) : 4
			const gridSize: GridSize = isValidGridSize(rawGridSize) ? rawGridSize : 4

			return c.json(
				buildLoggedOutCompleteResponse({
					timeTaken: clientTime,
					mistakes,
					gridSize,
					weekendEvent: getActiveWeekendEvent(new Date()),
				}),
			)
		} catch (error) {
			console.error('Error completing logged-out game:', error)
			return c.json({ error: 'Failed to record completion' }, 500)
		}
	}

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

		// ─── Anti-cheat: verify the submitted board is the real solution ──────
		// The client decides completion locally, but the server is the trust
		// boundary. Every generated puzzle has a unique solution, so a genuine
		// solve serializes to exactly the stored solution string. Without this,
		// a client could POST a fabricated fast time and farm coins, season
		// points, and the speed leaderboard without ever solving anything.
		if (!puzzle || !isBoardSolved(body.board, puzzle.solution)) {
			// Logged so a wave of *legitimate* mismatches (e.g. a client/puzzle
			// bug) is visible in production rather than silently denying rewards.
			console.warn(`[Complete] board verification failed for ${userId} on ${postId}; denying reward`)
			return c.json({ error: 'Solution does not match the puzzle' }, 400)
		}

		// ─── Idempotency: credit each issued puzzle at most once ──────────────
		// Keyed on the puzzle instance (not just the post) so a "run again"
		// puzzle is credited again, but replaying the same solved board — the
		// trivial coin/season farm — is rejected.
		const completionKey = `user:${userId}:solved:${postId}:${puzzle.instanceId}`
		const alreadyCompleted = await redis.get(completionKey)
		if (alreadyCompleted !== undefined) {
			return c.json({ error: 'Puzzle already completed' }, 409)
		}
		await redis.set(completionKey, '1')
		await redis.expire(completionKey, 2592000) // 30-day TTL

		const currentLevel = await getGridSkillLevel(userId, gridSize)
		const history = await getGridHistory(userId, gridSize)
		const pathLevel = await incrementPathLevel(userId)

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

			// Increment the weekly completion count for community highlights.
			// Must use zIncrBy (not zAdd, which would overwrite the score to 1
			// every solve, making "Player of the Week" meaningless).
			await redis.zIncrBy(`leaderboard:weekly:${isoWeek}`, userId, 1)
			await redis.expire(`leaderboard:weekly:${isoWeek}`, 1209600) // 14-day TTL

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
			}
		} catch (engagementErr) {
			// Engagement logic is non-blocking — failures don't prevent completion from succeeding
			console.error('Engagement logic error (non-critical):', engagementErr)
		}

		// ─── Analytics: track completion (non-blocking) ────────────────────────
		try {
			const { subredditId } = context
			const today = getTodayUTC()
			const completionIsNew = await trackCompletion(today, postId, userId, subredditId)
			if (completionIsNew) {
				const variant = assignVariant(userId)
				void trackVariantCompletion(today, variant).catch((err) =>
					console.error('[AB] variant completion tracking failed:', err),
				)
			}
			if (isChallengePost) {
				await trackChallengeCompletion(today, postId, userId, preCompletionEconomy.totalSolves === 0)
			}
		} catch (err) {
			console.error('[Analytics] Completion tracking failed (non-critical):', err)
		}

		// ─── S2R: mark this completion as eligible for "started puzzle 2" ────
		// Eligibility expires in 60s server-side. The next /api/game/state
		// call from the same session within that window converts the
		// eligibility into a "puzzle 2 started" event.
		try {
			const today = getTodayUTC()
			const sessionId = getSessionIdFromHeader(c.req.raw.headers)
			const difficulty = isDifficulty(puzzle?.difficulty) ? puzzle.difficulty : 'easy'
			await markS2REligible(sessionId, today, currentLevel, difficulty, userId, postId)
		} catch (err) {
			console.error('[S2R] markS2REligible failed (non-critical):', err)
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
					// Two-step write: see checkChallengeBeat previewDedupKey for rationale.
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
				// Daily_Solve_Index: 1-based count of season-counted solves today.
				// incrBy returns the post-increment value, so the first solve gets 1.
				const seasonSolvesKey = `user:${userId}:seasonSolves:${getTodayUTC()}`
				const dailySolveIndex = await redis.incrBy(seasonSolvesKey, 1)
				await redis.expire(seasonSolvesKey, 172800)
				const score = calculateSeasonScore(timeTaken, gridSize, currentLevel, mistakes, dailySolveIndex)
				await recordSeasonScore(season.seasonId, userId, score)

				// Read back the player's updated score and rank
				const leaderboardKey = `season:${season.seasonId}:leaderboard`
				const playerScore = await redis.zScore(leaderboardKey, userId)
				seasonPoints = playerScore ?? 0

				if (playerScore !== undefined && playerScore !== null) {
					seasonRank = (await countPlayersAbove(leaderboardKey, playerScore)) + 1
				}
			}
		} catch (err) {
			console.error('[Seasons] Score recording failed (non-critical):', err)
		}

		// ─── Perfect-solve challenge prompt (VIRAL: explicit opt-in share) ──────
		// Reddit policy requires posting on the user's behalf to be an explicit,
		// manual action — never automatic. So completion only flags eligibility;
		// the challenge post is created by /api/game/challenge when the player
		// taps "Challenge friends" (which posts as the user, with confirmation).
		const challengePromptEligible =
			mistakes === 0 && !isChallengePost && Boolean(context.subredditName)

		const response: CompleteResponse = {
			performanceScore,
			newSkillLevel,
			previousSkillLevel: currentLevel,
			pathLevel,
			isLoggedIn: true,
			streak,
			coinReward,
			...(engagement !== undefined && { engagement }),
			...(seasonRank !== null && { seasonRank }),
			...(seasonPoints > 0 && { seasonPoints }),
			...(challengePromptEligible && { challengePromptEligible: true }),
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

// ─── POST /api/game/migrate-logged-out-score ─────────────────────────────────

/**
 * Credit a returning (newly logged-in) user for a puzzle they solved while
 * logged out. The client replays the score it stashed in localStorage before
 * the login reload. We apply the same streak + coin + season crediting as a
 * normal completion, but skip all viral side effects (the
 * solve already happened, off-platform).
 *
 * Idempotent: a per-user/post key guards against double-crediting if the
 * client retries or replays the stored score more than once.
 */
gameRouter.post('/api/game/migrate-logged-out-score', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const body = await c.req.json().catch(() => null)
		if (!body || typeof body !== 'object') {
			return c.json({ error: 'Invalid request body' }, 400)
		}

		const { timeTaken, mistakes: rawMistakes, board } = body as Record<string, unknown>
		if (typeof timeTaken !== 'number' || timeTaken <= 0) {
			return c.json({ error: 'Invalid timeTaken' }, 400)
		}
		const mistakes = typeof rawMistakes === 'number' && rawMistakes >= 0 ? rawMistakes : 0

		// ─── Anti-cheat: verify the replayed board before crediting ───────────
		// A logged-out player always solves the post's baked puzzle (logged-out
		// /state and /complete both serve game:{postId}:puzzle), so verify the
		// replayed board against THAT — not getCurrentPuzzle, which for a
		// returning user can be a regenerated per-user puzzle with a different
		// solution (that mismatch would silently 400 every legitimate migrate).
		// Done BEFORE the idempotency guard so a rejected replay doesn't burn
		// the one-shot key.
		const postPuzzle = await redis.hGetAll(`game:${postId}:puzzle`)
		if (!isBoardSolved(board, postPuzzle?.solution ?? '')) {
			console.warn(`[Migrate] board verification failed for ${userId} on ${postId}; skipping credit`)
			return c.json({ error: 'Solution does not match the puzzle' }, 400)
		}

		// Idempotency guard — credit a given post's logged-out score once.
		const migratedKey = `user:${userId}:loggedOutMigrated:${postId}`
		const alreadyMigrated = await redis.get(migratedKey)
		if (alreadyMigrated === 'true') {
			return c.json({ migrated: false })
		}
		await redis.set(migratedKey, 'true')
		await redis.expire(migratedKey, 2592000) // 30-day TTL

		const rawGridSize = postPuzzle.gridSize ? parseInt(postPuzzle.gridSize, 10) : 4
		const gridSize: GridSize = isValidGridSize(rawGridSize) ? rawGridSize : 4

		const currentLevel = await getGridSkillLevel(userId, gridSize)
		const streak = await updateStreak(userId)
		const coinReward = await applyCoinReward({
			userId,
			timeTaken,
			currentLevel,
			streak,
			mistakes,
			gridSize,
		})

		const today = getTodayUTC()
		await Promise.all([
			redis.zAdd('leaderboard:streak', { score: streak.currentStreak, member: userId }),
			redis.zAdd(`leaderboard:speed:${today}:${gridSize}`, { score: timeTaken, member: userId }),
			redis.expire(`leaderboard:speed:${today}:${gridSize}`, 2592000),
		])

		// Season scoring (non-blocking)
		let seasonRank: number | null = null
		let seasonPoints = 0
		try {
			const season = getCurrentSeason()
			if (season.isActive) {
				// Daily_Solve_Index: 1-based count of season-counted solves today.
				// incrBy returns the post-increment value, so the first solve gets 1.
				const seasonSolvesKey = `user:${userId}:seasonSolves:${getTodayUTC()}`
				const dailySolveIndex = await redis.incrBy(seasonSolvesKey, 1)
				await redis.expire(seasonSolvesKey, 172800)
				const score = calculateSeasonScore(timeTaken, gridSize, currentLevel, mistakes, dailySolveIndex)
				await recordSeasonScore(season.seasonId, userId, score)
				const leaderboardKey = `season:${season.seasonId}:leaderboard`
				const playerScore = await redis.zScore(leaderboardKey, userId)
				seasonPoints = playerScore ?? 0
				if (playerScore !== undefined && playerScore !== null) {
					seasonRank = (await countPlayersAbove(leaderboardKey, playerScore)) + 1
				}
			}
		} catch (err) {
			console.error('[Migrate] Season scoring failed (non-critical):', err)
		}

		return c.json({
			migrated: true,
			coinReward,
			streak,
			...(seasonRank !== null && { seasonRank }),
			...(seasonPoints > 0 && { seasonPoints }),
		})
	} catch (error) {
		console.error('Error migrating logged-out score:', error)
		return c.json({ error: 'Failed to migrate score' }, 500)
	}
})

gameRouter.post('/api/game/next-challenge', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)

	// ─── Logged-out path ─────────────────────────────────────────────────
	// Serve a fresh puzzle at the floor difficulty without touching skill
	// level / history (nothing to persist for an anonymous viewer).
	if (!userId) {
		const newPuzzle = generatePuzzleForGridLevel(DEFAULT_GRID_SIZE, MIN_SKILL_LEVEL)
		const response: NextChallengeResponse = {
			puzzle: newPuzzle,
			skillLevel: MIN_SKILL_LEVEL,
			gridSizePreference: DEFAULT_GRID_SIZE,
		}
		return c.json(response)
	}

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
			instanceId: makeInstanceId(),
		})
		await redis.expire(`user:${userId}:game:${postId}:currentPuzzle`, 2592000) // 30-day TTL
		// Reset the server-side timer anchor for the freshly issued puzzle so
		// run-again solves are timed consistently (server-authoritative).
		const startTimeKey = `user:${userId}:puzzleStartTime:${postId}`
		await redis.set(startTimeKey, Date.now().toString())
		await redis.expire(startTimeKey, 86400)

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
		let stickyCommentId = postMeta['stickyCommentId']
		if (!stickyCommentId) {
			// Use an optimistic lock so only one concurrent request creates the sticky.
			// 15-second TTL on the lock key ensures it is always released.
			const lockKey = `game:${postId}:stickyLock`
			const lockTxn = await redis.watch(lockKey)
			const existingLock = await redis.get(lockKey)
			if (existingLock !== undefined) {
				// Another request is already creating the sticky — ask the client to retry.
				// Unwatch releases the transaction slot before returning.
				await lockTxn.unwatch()
				return c.json({ error: 'Post is being set up. Try again in a moment.' }, 503)
			}
			await lockTxn.multi()
			await lockTxn.set(lockKey, '1')
			await lockTxn.expire(lockKey, 15)
			const lockResult = await lockTxn.exec()
			if (!lockResult || lockResult.length === 0) {
				// Transaction aborted — another concurrent request won the race
				return c.json({ error: 'Post is being set up. Try again in a moment.' }, 503)
			}
			try {
				stickyCommentId = await createStickyComment(postId)
				// Explicitly release lock now that stickyCommentId is stored in meta.
				// Future requests will find it there and skip this branch entirely.
				await redis.del(lockKey)
			} catch (err) {
				console.error('[ResultComment] Failed to create sticky comment:', err)
				await redis.del(lockKey) // release lock so future requests can retry
				return c.json({ error: 'Unable to post comment right now. Try again shortly.' }, 503)
			}
		}

		await reddit.submitComment({
			id: stickyCommentId as `t1_${string}`,
			text: resultText,
			runAs: 'USER',
		})

		// Set dedup flag. Two-step write: a crash between set and expire would orphan
		// this key, permanently blocking the user from commenting on this post. We accept
		// this risk because the window is sub-millisecond in Devvit's managed runtime.
		// MULTI/EXEC without WATCH is unavailable in Devvit's Redis client, and using
		// WATCH here would abort the write if a concurrent request modifies the key —
		// a worse outcome since the comment was already posted successfully.
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
		const { timeTaken, mistakes } = body
		const customTitle = normalizeChallengeTitle(body.customTitle)

		// Rate limit user-authored challenge posts to reduce spam risk.
		const MAX_DAILY_CHALLENGES = 3
		const today = getTodayUTC()
		const challengeKey = `user:${userId}:challenge:count:${today}`
		const countStr = await redis.get(challengeKey)
		const challengeCount = countStr !== null && countStr !== undefined ? parseInt(countStr, 10) : 0
		if (challengeCount >= MAX_DAILY_CHALLENGES) {
			return c.json<ChallengeResponse>({
				success: false,
				error: `You've reached the limit of ${MAX_DAILY_CHALLENGES} challenge posts today`,
			})
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

		// Precompute the challenger's snoovatar so the inline preview can render
		// the avatar from Redis on first load — no per-view Reddit lookup.
		let challengerAvatar = ''
		if (username !== 'Anon') {
			try {
				challengerAvatar = (await reddit.getSnoovatarUrl(username)) ?? ''
			} catch {
				// non-critical — preview falls back to a default avatar
			}
		}

		// Build title from constrained app text; user free-form text is not published.
		const perfectTag = mistakes === 0 ? ' (zero mistakes)' : ''
		const gridLabel = `${puzzle.gridSize}×${puzzle.gridSize}`
		const difficultyLabel = parseInt(puzzle.gridSize, 10) <= 4 ? 'Quick' : parseInt(puzzle.gridSize, 10) <= 6 ? 'Standard' : 'Hard'
		const titleTemplates = [
			`Urjo challenge: ${timeTaken}s target on ${gridLabel}${perfectTag}`,
			`Urjo ${difficultyLabel} ${gridLabel}: u/${username} finished in ${timeTaken}s${perfectTag}`,
			`Urjo ${gridLabel} challenge from u/${username}: ${timeTaken}s target${perfectTag}`,
			`Urjo ${difficultyLabel} puzzle challenge: ${timeTaken}s target${perfectTag}`,
		]
		// Rotate template based on hour to spread variety without randomness (deterministic)
		const templateIndex = new Date().getUTCHours() % titleTemplates.length
		const generatedTitle = titleTemplates[templateIndex] ?? titleTemplates[0]!
		const title = customTitle ?? generatedTitle

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
			challengeByUsername: username,
			challengeByAvatar: challengerAvatar,
			challengeMistakes: mistakes.toString(),
			sourcePostId: postId,
			challengeChainLength: challengeChainLength.toString(),
		})

		// Initialize stats for the challenge post
		await redis.hSet(`game:${newPost.id}:stats`, {
			attempts: '0',
			beats: '0',
		})

		// Increment daily challenge counter (expires at 24h).
		// Two-step write: see result-comment dedup for rationale. A crash here leaves a
		// stale counter; the user can retry after it expires naturally.
		const newCount = challengeCount + 1
		await redis.set(challengeKey, newCount.toString())
		await redis.expire(challengeKey, 86400)

		// Post the initial leaderboard comment (APP account, no user action needed).
		// Non-critical — if rate-limited, meta is stored without a comment ID and
		// the leaderboard comment will simply be absent.
		let leaderboardCommentId = ''
		try {
			const targetLine = buildChallengeTargetLine(timeTaken.toString(), mistakes.toString())
			const leaderboardComment = await reddit.submitComment({
				id: newPost.id,
				text: `🏆 **Challenge Leaderboard**

${targetLine}

👥 Attempts: 0
✅ Beaten: 0 times
⏱️ Fastest: --
👑 Champion: --

Think you can beat it? Play above! 🎯`,
			})
			await leaderboardComment.distinguish(true)
			leaderboardCommentId = leaderboardComment.id
		} catch (lbErr) {
			console.error('[Challenge] Leaderboard comment failed (non-critical):', lbErr)
		}

		// Store postType and leaderboard comment ID together — single hSet avoids clobbering
		await redis.hSet(`game:${newPost.id}:meta`, {
			postType: 'urjo-puzzle',
			leaderboardCommentId,
			stickyCommentId: leaderboardCommentId,
			sourcePostId: postId,
			challengeCreatorId: userId,
			challengeChainLength: challengeChainLength.toString(),
			createdAt: Date.now().toString(),
		})
		await incrementChallengesCreated(userId)
		// Reverse index for account deletion: track challenge posts created by this user
		await redis.zAdd(`user:${userId}:createdChallenges`, { member: newPost.id, score: Date.now() })
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
