/**
 * Game API Routes
 * Handles game state, puzzle completion, and adaptive difficulty
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { context, redis, reddit, scheduler } from '@devvit/web/server'
import type { TaskRequest, TaskResponse } from '@devvit/web/server'
import type {
	GameState,
	NextChallengeResponse,
	CompleteRequest,
	CompleteResponse,
	AdaptiveHistoryRecord,
	GameRecord,
	StreakData,
	LeaderboardData,
	LeaderboardEntry,
	ChallengeRequest,
	ChallengeResponse,
	SerializedPuzzle,
	GridSizeResponse,
	FirstScreenData,
	OnboardingChoiceResponse,
} from '../../shared/types'
import { DEFAULT_CHALLENGE_TITLE, DEFAULT_GRID_SIZE, MAX_STREAK_FREEZES, MIN_SKILL_LEVEL, getGridLevelConfig, isValidGridSize } from '../../shared/constants'
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
	getAdaptiveHistory,
	getGridSizePreference,
	getGridSizeOverride,
	setGridSizePreference,
	setGridSizeOverride,
	getGridSkillLevel,
	setGridSkillLevel,
	getPathLevel,
	incrementPathLevel,
	getGridHistory,
	setGridHistory,
	setAdaptiveHistory,
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
	trackVariantFirstAction,
	trackVariantCompletion,
} from '../lib/ab-test'
import {
	isDifficulty,
	markS2RFirstCompletion,
	tryConvertS2RFirstAction,
} from '../lib/s2r'
import { parseMeasurementHeaders } from '../../shared/measurement-contract'
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
import { toPublicPuzzle } from '../lib/public-puzzle'
import type { ChallengePreviewData } from '../../shared/social-types'
import { isModeratorCached, requireModerator } from '../lib/moderator'
import { isOptedIn } from '../lib/notify'
import { calculateSeasonScore, getCurrentSeason, recordSeasonScore } from '../lib/seasons'
import { getSocialStats, incrementChallengeBeats, incrementChallengesCreated, incrementSharesCount } from '../lib/social'
import { serializeVerifiedResultComment } from '../../shared/result-card'
import type { EngagementCompletionData, UserStats } from '../../shared/engagement-types'
import { getSessionRunMultiplier, getSessionRunBonusCoins } from '../../shared/session-run'
import { incrementVerifiedSessionRun } from '../lib/server-session-run'
import { forecastNextStreak } from '../../shared/streak-rewards'
import { getActiveWeekendEvent, getWeekendEventBonusCoins } from '../../shared/weekend-event'
import { buildLoggedOutGameState, buildLoggedOutCompleteResponse } from '../lib/logged-out'
import { createStickyComment } from '../post'
import { addAdaptiveHistoryRecord, selectAdaptivePuzzleState } from '../lib/adaptive-selector'
import { createContentId } from '../lib/content-id'
import {
	claimCompletionAction,
	createCompletionSnapshot,
	finalizeCompletionAction,
	getOwnedCompletionSnapshot,
	releaseCompletionAction,
} from '../lib/completion-snapshot'
import { recordVerifiedUrjoBlitzCompletion } from '../lib/urjo-blitz'
import { recordScheduledSlotEvent } from '../lib/slot-metrics'
import {
	claimAnonymousMigration,
	finalizeAnonymousMigration,
	persistAnonymousPuzzle,
	startAnonymousPuzzleTimer,
	verifyAnonymousPuzzleCompletion,
} from '../lib/anonymous-receipts'
import { isCurrentScheduledCompletion } from '../lib/current-day-content'
import {
	registerUserDynamicKey,
	registerUserSortedSetMembership,
} from '../lib/account-deletion'

// ─── Result Comment Dedup Key ────────────────────────────────────────────────

const redditCommentsUrl = (postId: string): string =>
	`https://reddit.com/comments/${postId.replace(/^t3_/, '')}`

const formatMistakeCount = (mistakes: number): string =>
	mistakes === 0 ? 'zero mistakes' : `${mistakes} mistake${mistakes === 1 ? '' : 's'}`

const MAX_REPEAT_AVOIDANCE_ATTEMPTS = 5
const COMPLETION_FOLLOWUP_TASK_NAME = 'completion-followup'
const COMPLETION_FOLLOWUP_QUEUE_KEY = 'queue:completion-followups'
const COMPLETION_FOLLOWUP_JOB_KEY = 'queue:completion-followups:job'
const COMPLETION_FOLLOWUP_BATCH_SIZE = 25
const COMPLETION_FOLLOWUP_TTL_SECONDS = 86400

type CompletionFollowup = {
	id: string
	userId: string
	postId: string
	timeTaken: number
	currentLevel: number
	difficulty: 'easy' | 'medium' | 'hard' | 'diabolical'
	puzzleInstanceId: string
	isChallengePost: boolean
	preCompletionTotalSolves: number
	sessionId: string | null
	contentId: string | null
	attemptId: string | null
}

type CompletionFollowupTaskBody = TaskRequest & { data?: { batch?: unknown } }

const completionFollowupKey = (userId: string, id: string): string =>
	`user:${userId}:completion:${id}:followup`

const completionFollowupQueueMember = (userId: string, id: string): string =>
	`${userId}:${id}`

const parseCompletionFollowupQueueMember = (member: string): { userId: string; id: string } | null => {
	const separator = member.indexOf(':')
	if (separator <= 0) return null
	const userId = member.slice(0, separator)
	const id = member.slice(separator + 1)
	return userId.length > 0 && id.length > 0 ? { userId, id } : null
}

const parseCompletionFollowup = (raw: string): CompletionFollowup | null => {
	try {
		const value: unknown = JSON.parse(raw)
		if (!value || typeof value !== 'object') return null
		const event = value as Record<string, unknown>
		if (
			typeof event.id !== 'string'
			|| typeof event.userId !== 'string'
			|| typeof event.postId !== 'string'
			|| typeof event.timeTaken !== 'number'
			|| typeof event.currentLevel !== 'number'
			|| typeof event.puzzleInstanceId !== 'string'
			|| typeof event.isChallengePost !== 'boolean'
			|| typeof event.preCompletionTotalSolves !== 'number'
			|| !isDifficulty(event.difficulty)
		) return null
		return {
			id: event.id,
			userId: event.userId,
			postId: event.postId,
			timeTaken: event.timeTaken,
			currentLevel: event.currentLevel,
			difficulty: event.difficulty,
			puzzleInstanceId: event.puzzleInstanceId,
			isChallengePost: event.isChallengePost,
			preCompletionTotalSolves: event.preCompletionTotalSolves,
			sessionId: typeof event.sessionId === 'string' ? event.sessionId : null,
			contentId: typeof event.contentId === 'string' ? event.contentId : null,
			attemptId: typeof event.attemptId === 'string' ? event.attemptId : null,
		}
	} catch {
		return null
	}
}

const ensureCompletionFollowupJob = async (): Promise<void> => {
	const claimed = await redis.set(COMPLETION_FOLLOWUP_JOB_KEY, 'pending', {
		nx: true,
		expiration: new Date(Date.now() + 300_000),
	})
	if (claimed === '') return

	try {
		const jobId = await scheduler.runJob({
			name: COMPLETION_FOLLOWUP_TASK_NAME,
			data: { batch: true },
			runAt: new Date(Date.now() + 250),
		})
		await redis.set(COMPLETION_FOLLOWUP_JOB_KEY, jobId, {
			expiration: new Date(Date.now() + 300_000),
		})
	} catch (error) {
		await redis.del(COMPLETION_FOLLOWUP_JOB_KEY)
		throw error
	}
}

const enqueueCompletionFollowup = async (event: Omit<CompletionFollowup, 'id'>): Promise<void> => {
	const id = crypto.randomUUID()
	const payload: CompletionFollowup = { ...event, id }
	await Promise.all([
		registerUserDynamicKey(event.userId, completionFollowupKey(event.userId, id)),
		redis.set(completionFollowupKey(event.userId, id), JSON.stringify(payload), {
			expiration: new Date(Date.now() + COMPLETION_FOLLOWUP_TTL_SECONDS * 1000),
		}),
		redis.zAdd(COMPLETION_FOLLOWUP_QUEUE_KEY, {
			member: completionFollowupQueueMember(event.userId, id),
			score: Date.now(),
		}),
	])
	await ensureCompletionFollowupJob()
}

const processCompletionFollowup = async (event: CompletionFollowup): Promise<void> => {
	const today = getTodayUTC()
	const expectedContentId = createContentId(event.postId, event.puzzleInstanceId)
	const tasks: Promise<unknown>[] = [
		recordCompleter(today, event.userId),
	]
	if (
		event.sessionId !== null
		&& event.contentId === expectedContentId
		&& event.attemptId !== null
	) {
		tasks.push(markS2RFirstCompletion({
			sessionId: event.sessionId,
			date: today,
			skillLevel: event.currentLevel,
			difficulty: event.difficulty,
			postId: event.postId,
			contentId: expectedContentId,
			attemptId: event.attemptId,
		}))
	}
	if (event.isChallengePost && event.preCompletionTotalSolves === 0) {
		tasks.push(getChallengeCreationTimestamp(event.postId).then(async (creationTs) => {
			if (creationTs !== null) await recordCycleTime(today, (Date.now() - creationTs) / 1000)
		}))
	}
	if (event.preCompletionTotalSolves === 0) {
		tasks.push(getAttribution(event.userId).then(async (attribution) => {
			if (attribution !== null) await recordChannelConversion(today, attribution, event.userId)
		}))
	}
	const results = await Promise.allSettled(tasks)
	for (const result of results) {
		if (result.status === 'rejected') console.error('[Completion follow-up] task failed:', result.reason)
	}
}

const drainCompletionFollowups = async (): Promise<void> => {
	const entries = await redis.zRange(COMPLETION_FOLLOWUP_QUEUE_KEY, 0, COMPLETION_FOLLOWUP_BATCH_SIZE - 1, { by: 'rank' })
	for (const { member } of entries) {
		const queueMember = parseCompletionFollowupQueueMember(member)
		const raw = queueMember === null
			? undefined
			: await redis.get(completionFollowupKey(queueMember.userId, queueMember.id))
		const event = raw === undefined ? null : parseCompletionFollowup(raw)
		if (event !== null) await processCompletionFollowup(event)
		await Promise.all([
			redis.zRem(COMPLETION_FOLLOWUP_QUEUE_KEY, [member]),
			...(queueMember === null ? [] : [redis.del(completionFollowupKey(queueMember.userId, queueMember.id))]),
		])
	}
	await redis.del(COMPLETION_FOLLOWUP_JOB_KEY)
	if (await redis.zCard(COMPLETION_FOLLOWUP_QUEUE_KEY) > 0) await ensureCompletionFollowupJob()
}

const puzzleFirstCellTimeKey = (
	userId: string,
	postId: string,
	instanceId: string,
): string => `user:${userId}:puzzleFirstCellTime:${postId}:${instanceId}`

const onboardingChoiceKey = (userId: string, postId: string): string =>
	`user:${userId}:game:${postId}:onboardingChoice`

const persistAnonymousPuzzleForRequest = async (
	c: Context,
	postId: string,
	contentId: string,
	puzzle: SerializedPuzzle,
	postPuzzle: Record<string, string>,
): Promise<void> => {
	const { sessionId } = parseMeasurementHeaders(c.req.raw.headers)
	if (sessionId === null) return

	await persistAnonymousPuzzle({
		sessionId,
		postId,
		contentId,
		puzzle,
		...(postPuzzle.scheduledDate !== undefined && {
			scheduledDate: postPuzzle.scheduledDate,
		}),
		...(postPuzzle.scheduledSlotKey !== undefined && {
			scheduledSlotKey: postPuzzle.scheduledSlotKey,
		}),
	})
}

const getLockedGridSize = (postPuzzle: Record<string, string>): GridSize | undefined => {
	const rawGridSize = postPuzzle.lockedGridSize !== undefined
		? parseInt(postPuzzle.lockedGridSize, 10)
		: NaN
	return isValidGridSize(rawGridSize) ? rawGridSize : undefined
}

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

const MAX_DAILY_CHALLENGE_POSTS = 3

const claimDailyChallengeSlot = async (
	userId: string,
	date: string,
	completionId: string,
): Promise<string | null> => {
	for (let slot = 1; slot <= MAX_DAILY_CHALLENGE_POSTS; slot++) {
		const key = `user:${userId}:challenge-slot:${date}:${slot}`
		await registerUserDynamicKey(userId, key)
		const claimed = await redis.set(key, completionId, {
			nx: true,
			expiration: new Date(Date.now() + 172800000),
		})
		if (claimed) return key
	}
	return null
}

export const gameRouter = new Hono()

gameRouter.post('/internal/scheduler/completion-followup', async (c) => {
	const body = await c.req.json<CompletionFollowupTaskBody>().catch(() => null)
	if (body?.data?.batch !== true) {
		return c.json<TaskResponse>({ status: 'error', message: 'Invalid completion follow-up task' }, 400)
	}

	try {
		await drainCompletionFollowups()
		return c.json<TaskResponse>({ status: 'ok' })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Completion follow-up failed'
		return c.json<TaskResponse>({ status: 'error', message }, 500)
	}
})

const HTTP_STATUS_BAD_REQUEST = 400
const HTTP_STATUS_NOT_FOUND = 404
const HTTP_STATUS_INTERNAL_ERROR = 500

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
 * If beaten, updates challenge stats and refreshes the sticky leaderboard comment.
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
		const beatEventsKey = `challenge:${postId}:beat_events`
		await registerUserSortedSetMembership(winnerId, beatEventsKey)
		await redis.zAdd(beatEventsKey, {
			member: winnerId,
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
				await registerUserDynamicKey(winnerId, previewDedupKey)
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
					winnerId,
				})
				await redis.zAdd(`user:${winnerId}:challengeBeatPreviews`, {
					member: postId,
					score: Date.now(),
				})
			}
		} catch (previewErr) {
			console.error('[Preview] Challenge beat preview update failed (non-critical):', previewErr)
		}

		// Mark beat as recorded — after stats are written so partial failure doesn't lose data.
		// Two-step write: see previewDedupKey comment above for rationale.
		await registerUserDynamicKey(winnerId, notifyKey)
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

const isSamePuzzleSolution = (
	candidate: SerializedPuzzle,
	currentPuzzle: { solution: string; gridSize: string } | null,
): boolean =>
	currentPuzzle !== null &&
	candidate.gridSize.toString() === currentPuzzle.gridSize &&
	candidate.solution === currentPuzzle.solution

const generatePuzzleForGridLevelAvoidingRepeat = (
	gridSize: GridSize,
	level: number,
	currentPuzzle: { solution: string; gridSize: string } | null,
): SerializedPuzzle => {
	let candidate = generatePuzzleForGridLevel(gridSize, level)
	for (let attempt = 1; attempt < MAX_REPEAT_AVOIDANCE_ATTEMPTS; attempt++) {
		if (!isSamePuzzleSolution(candidate, currentPuzzle)) return candidate
		candidate = generatePuzzleForGridLevel(gridSize, level)
	}
	return candidate
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
	source: 'adaptive' | 'manual' | 'challenge' | 'post'
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
			source:
				userPuzzle.source === 'manual' ||
				userPuzzle.source === 'challenge' ||
				userPuzzle.source === 'post'
					? userPuzzle.source
					: 'adaptive',
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
		source: puzzle.challengeBy ? 'challenge' : 'post',
	}
}

const persistIssuedPuzzle = async (
	postId: string,
	userId: string,
	puzzle: SerializedPuzzle,
	source: 'adaptive' | 'manual' | 'challenge',
): Promise<{
	colors: string
	numbers: string
	solution: string
	difficulty: string
	gridSize: string
	instanceId: string
	source: 'adaptive' | 'manual' | 'challenge'
}> => {
	const instanceId = makeInstanceId()
	const puzzleKey = `user:${userId}:game:${postId}:currentPuzzle`
	await registerUserDynamicKey(userId, puzzleKey)
	await redis.hSet(puzzleKey, {
		colors: puzzle.colors,
		numbers: puzzle.numbers,
		solution: puzzle.solution,
		difficulty: puzzle.difficulty,
		gridSize: puzzle.gridSize.toString(),
		instanceId,
		source,
	})
	await redis.expire(puzzleKey, 2592000)
	await setGridSizePreference(userId, puzzle.gridSize as GridSize)

	return {
		colors: puzzle.colors,
		numbers: puzzle.numbers,
		solution: puzzle.solution,
		difficulty: puzzle.difficulty,
		gridSize: puzzle.gridSize.toString(),
		instanceId,
		source,
	}
}

const buildAdaptiveRecord = (
	gridSize: GridSize,
	level: number,
	timeTaken: number,
	mistakes: number,
	skipped: boolean,
	source: 'adaptive' | 'manual' | 'challenge' | 'post',
): AdaptiveHistoryRecord => ({
	gridSize,
	level,
	timeTaken,
	mistakes,
	skipped,
	source,
	timestamp: Date.now(),
})

const selectPuzzleStateForUser = async (
	userId: string,
	input: {
		pathLevel: number
		streak: StreakData
		sessionRun: number
		random?: () => number
	},
): Promise<{ gridSize: GridSize; level: number; source: 'adaptive' | 'manual' }> => {
	const today = getTodayUTC()
	const [manualOverride, adaptiveHistory, level4, level6, level8] = await Promise.all([
		getGridSizeOverride(userId),
		getAdaptiveHistory(userId),
		getGridSkillLevel(userId, 4),
		getGridSkillLevel(userId, 6),
		getGridSkillLevel(userId, 8),
	])

	const isFirstPuzzleOfDay = input.streak.lastPlayedDate !== today
	const isReentry =
		input.streak.lastPlayedDate !== null &&
		getDayDifference(input.streak.lastPlayedDate, today) > 1

	return selectAdaptivePuzzleState(
		{
			pathLevel: input.pathLevel,
			perGridLevels: { 4: level4, 6: level6, 8: level8 },
			adaptiveHistory,
			currentStreak: input.streak.currentStreak,
			sessionRun: input.sessionRun,
			isFirstPuzzleOfDay,
			isReentry,
			...(manualOverride !== undefined && { manualOverride }),
		},
		input.random,
	)
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
		ctx.gridSize,
		false,
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
	await registerUserSortedSetMembership(ctx.userId, 'leaderboard:coins')
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
			const lockedGridSize = getLockedGridSize(postPuzzle)
			const contentId = createContentId(postId, 'post')
			await persistAnonymousPuzzleForRequest(
				c,
				postId,
				contentId,
				serializedPuzzle,
				postPuzzle,
			)

				let puzzleNumber: number | undefined
				try {
					const storedPuzzleNumber = postPuzzle.puzzleNumber
						?? await redis.get('stats:puzzleCounter')
					puzzleNumber = storedPuzzleNumber !== undefined
						? parseInt(storedPuzzleNumber, 10)
						: undefined
			} catch {
				// non-critical
			}

			return c.json(
				buildLoggedOutGameState({
					puzzle: toPublicPuzzle(serializedPuzzle),
					contentId,
					postId,
					isChallenge,
					allowsGridSizeChange: lockedGridSize === undefined,
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

		const storedGridSizePreference = await getGridSizePreference(userId)
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
					source: postPuzzle.challengeBy ? 'challenge' : 'post',
				}
			} else {
				return c.json({ error: 'Game not found' }, 404)
			}
		}

		// Determine if this is a challenge post (has baked-in grid size)
		const postPuzzleMeta = await redis.hGetAll(`game:${postId}:puzzle`)
		const isChallenge = Boolean(postPuzzleMeta?.challengeBy)
		const lockedGridSize = getLockedGridSize(postPuzzleMeta)
		const pathLevel = await getPathLevel(userId)
		const streak = await getStreakData(userId)

		// For normal posts, either honor the user's explicit manual override or
		// issue an adaptive puzzle the first time they open the post.
		if (!isChallenge && lockedGridSize === undefined) {
			const manualOverride = await getGridSizeOverride(userId)
			const puzzleGridSize = parseInt(puzzle.gridSize, 10)

			if (manualOverride !== undefined) {
				if (puzzle.source !== 'manual' || puzzleGridSize !== manualOverride) {
					const manualLevel = await getGridSkillLevel(userId, manualOverride)
					const manualPuzzle = generatePuzzleForGridLevel(manualOverride, manualLevel)
					puzzle = await persistIssuedPuzzle(postId, userId, manualPuzzle, 'manual')
				}
			} else if (puzzle.source === 'post') {
				const selection = await selectPuzzleStateForUser(userId, {
					pathLevel,
					streak,
					sessionRun: 0,
					random: Math.random,
				})
				const adaptivePuzzle = generatePuzzleForGridLevel(selection.gridSize, selection.level)
				puzzle = await persistIssuedPuzzle(postId, userId, adaptivePuzzle, selection.source)
			}
		}

		const effectiveGridSize = parseInt(puzzle.gridSize, 10) as GridSize
		const skillLevel = await getGridSkillLevel(userId, effectiveGridSize)
		const tutorialCompleted = (await redis.get(`user:${userId}:tutorialCompleted`)) === 'true'
		const gridSizePreference = isChallenge ? storedGridSizePreference : effectiveGridSize
		const allowsGridSizeChange = !isChallenge && lockedGridSize === undefined

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
		await registerUserDynamicKey(userId, startTimeKey)
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
			}
				const openIsNew = await trackOpen(today, postId, userId)
				if (openIsNew) await recordScheduledSlotEvent(today, postId, 'opens')
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
		let onboardingChoiceRequired = false
		if (
			!isChallenge &&
			isFirstTimeUser &&
			lockedGridSize !== undefined &&
			lockedGridSize > 4
		) {
			const priorChoice = await redis.get(onboardingChoiceKey(userId, postId))
			onboardingChoiceRequired = priorChoice === undefined
		}

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
			const storedPuzzleNumber = postPuzzleMeta?.puzzleNumber
				?? await redis.get('stats:puzzleCounter')
			puzzleNumber = storedPuzzleNumber !== undefined
				? parseInt(storedPuzzleNumber, 10)
				: undefined
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

		// ─── Inline onboarding experiment ───────────────────────────────────────
		// A/B are directly playable controls. C adds non-blocking guidance over
		// the same board for eligible returning players who have not acted today.
		let abVariant: 'A' | 'B' | 'C' | undefined
		let hasPlayedToday = false
		let firstScreenData: FirstScreenData | undefined
		if (!isChallenge && !isFirstTimeUser) {
			try {
				abVariant = assignVariant(userId)
				// Check if the user already acted today — skip guidance if so.
				const actedKey = `analytics:acted:${today}:${postId}:${userId}`
				const acted = await redis.get(actedKey)
				hasPlayedToday = acted !== undefined
				// Build the community/target data consumed by Variant C's overlay.
				if (communityStats !== undefined) {
					const target = await getFirstScreenTarget(
						today,
						serializedPuzzle.gridSize,
						postPuzzleMeta,
						userId,
					)
					firstScreenData = {
						samplePuzzle: toPublicPuzzle(serializedPuzzle),
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
			puzzle: toPublicPuzzle(serializedPuzzle),
			contentId: createContentId(postId, puzzle.instanceId),
			tutorialCompleted,
			isLoggedIn: true,
			skillLevel,
			pathLevel,
			gridSizePreference,
			postId,
			isChallenge,
			allowsGridSizeChange,
			streak,
			...(username !== undefined && { username }),
			isFirstTimeUser,
			onboardingChoiceRequired,
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
			// Inline onboarding experiment
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

// ─── POST /api/game/mod-solution ────────────────────────────────────────────

const getModeratorSolution = async (c: Context): Promise<Response> => {
	const { postId, userId } = context
	if (!postId || !userId) {
		return c.json({ status: 'error', message: 'Missing game context' }, HTTP_STATUS_BAD_REQUEST)
	}

	try {
		const puzzle = await getCurrentPuzzle(postId, userId)
		if (!puzzle) {
			return c.json({ status: 'error', message: 'Puzzle not found' }, HTTP_STATUS_NOT_FOUND)
		}

		return c.json({
			status: 'success',
			data: { solution: puzzle.solution },
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load puzzle solution'
		return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
	}
}

gameRouter.post('/api/game/mod-solution', requireModerator(), getModeratorSolution)

// ─── POST /api/game/timer-start ──────────────────────────────────────────────

gameRouter.post('/api/game/timer-start', async (c) => {
	const { postId, userId } = context
	if (!postId) return c.json({ error: 'Missing context' }, 400)

	try {
		if (!userId) {
			const measurement = parseMeasurementHeaders(c.req.raw.headers)
			if (
				measurement.sessionId === null ||
				measurement.contentId === null ||
				measurement.attemptId === null
			) {
				return c.json({ error: 'Anonymous attempt headers are required' }, 400)
			}
			const result = await startAnonymousPuzzleTimer({
				sessionId: measurement.sessionId,
				postId,
				contentId: measurement.contentId,
				attemptId: measurement.attemptId,
			})
			if (result.status === 'started') return c.json({ started: true })
			if (result.status === 'already-started') return c.json({ started: false })
			return c.json({ error: 'Anonymous puzzle attempt is unavailable' }, 409)
		}

		const puzzle = await getCurrentPuzzle(postId, userId)
		if (!puzzle) return c.json({ error: 'Game not found' }, 404)

		const key = puzzleFirstCellTimeKey(userId, postId, puzzle.instanceId)
		const existing = await redis.get(key)
		if (existing !== undefined) return c.json({ started: false })

		await registerUserDynamicKey(userId, key)
		await redis.set(key, Date.now().toString())
		await redis.expire(key, 86400)
		return c.json({ started: true })
	} catch (error) {
		console.error('Error starting puzzle timer:', error)
		return c.json({ error: 'Failed to start puzzle timer' }, 500)
	}
})

// ─── POST /api/game/grid-size ─────────────────────────────────────────────────

gameRouter.post('/api/game/onboarding-choice', async (c) => {
	const { postId, userId } = context
	if (!postId || !userId) return c.json({ error: 'Missing context' }, 400)

	const body = await c.req.json<{ choice?: unknown }>().catch(() => null)
	const choice = body?.choice
	if (choice !== 'warmup' && choice !== 'advertised') {
		return c.json({ error: 'choice must be warmup or advertised' }, 400)
	}

	try {
		const [postPuzzle, economy] = await Promise.all([
			redis.hGetAll(`game:${postId}:puzzle`),
			getUserEconomy(userId),
		])
		const advertisedGridSize = getLockedGridSize(postPuzzle)
		if (
			advertisedGridSize === undefined ||
			advertisedGridSize === 4 ||
			Boolean(postPuzzle.challengeBy) ||
			!postPuzzle.colors
		) {
			return c.json({ error: 'Warm-up choice is unavailable for this post' }, 409)
		}
		if (economy.totalSolves > 0) {
			return c.json({ error: 'Warm-up choice is only for first-time players' }, 409)
		}

		const advertisedPuzzle: SerializedPuzzle = {
			colors: postPuzzle.colors,
			numbers: postPuzzle.numbers ?? '',
			solution: postPuzzle.solution ?? '',
			difficulty: (postPuzzle.difficulty ?? 'easy') as SerializedPuzzle['difficulty'],
			gridSize: advertisedGridSize,
		}
		const selectedPuzzle = choice === 'warmup'
			? generatePuzzleForGridLevel(4, MIN_SKILL_LEVEL)
			: advertisedPuzzle
		const issuedPuzzle = await persistIssuedPuzzle(postId, userId, selectedPuzzle, 'manual')

		const returnKey = `user:${userId}:game:${postId}:warmupReturnGrid`
		if (choice === 'warmup') {
			await registerUserDynamicKey(userId, returnKey)
			await redis.set(returnKey, advertisedGridSize.toString())
			await redis.expire(returnKey, 86400)
		} else {
			await redis.del(returnKey)
		}

		const onboardingClaimKey = onboardingChoiceKey(userId, postId)
		await registerUserDynamicKey(userId, onboardingClaimKey)
		const analyticsClaim = await redis.set(
			onboardingClaimKey,
			choice,
			{ nx: true },
		)
		if (analyticsClaim) {
			await redis.hIncrBy(
				`analytics:${getTodayUTC()}:onboarding_choices`,
				`${advertisedGridSize}:${choice}`,
				1,
			)
		}

		const response: OnboardingChoiceResponse = {
			choice,
			puzzle: toPublicPuzzle(selectedPuzzle),
			contentId: createContentId(postId, issuedPuzzle.instanceId),
			skillLevel: await getGridSkillLevel(userId, selectedPuzzle.gridSize as GridSize),
			advertisedGridSize,
		}
		return c.json(response)
	} catch (error) {
		console.error('Error applying onboarding choice:', error)
		return c.json({ error: 'Failed to apply onboarding choice' }, 500)
	}
})

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
		const postPuzzle = await redis.hGetAll(`game:${postId}:puzzle`)
		if (getLockedGridSize(postPuzzle) !== undefined) {
			return c.json({ error: 'This is a fixed-size puzzle post.' }, 400)
		}

		// ─── Logged-out path ─────────────────────────────────────────────
		// Serve a fresh puzzle at the requested size without persisting the
		// preference or a per-user puzzle override (nothing to key on).
		if (!userId) {
			const newPuzzle = generatePuzzleForGridLevel(gridSize, MIN_SKILL_LEVEL)
			const contentId = createContentId(postId, makeInstanceId())
			await persistAnonymousPuzzleForRequest(c, postId, contentId, newPuzzle, postPuzzle)
			const response: GridSizeResponse = {
				puzzle: toPublicPuzzle(newPuzzle),
				contentId,
				skillLevel: MIN_SKILL_LEVEL,
				gridSizePreference: gridSize,
			}
			return c.json(response)
		}

		// Persist the explicit manual override.
		await setGridSizePreference(userId, gridSize)
		await setGridSizeOverride(userId, gridSize)

		// Read per-grid skill level
		const skillLevel = await getGridSkillLevel(userId, gridSize)

		// Generate a new puzzle at the selected grid size and skill level
		const newPuzzle = generatePuzzleForGridLevel(gridSize, skillLevel)

		// Store puzzle for this user/post
		const issuedPuzzle = await persistIssuedPuzzle(postId, userId, newPuzzle, 'manual')
		if (postId) {
			// Reset the server-side timer anchor so this freshly issued puzzle
			// is timed from now, not from a stale earlier issuance.
			const startTimeKey = `user:${userId}:puzzleStartTime:${postId}`
			await registerUserDynamicKey(userId, startTimeKey)
			await redis.set(startTimeKey, Date.now().toString())
			await redis.expire(startTimeKey, 86400)
		}

		const response: GridSizeResponse = {
			puzzle: toPublicPuzzle(newPuzzle),
			contentId: createContentId(postId, issuedPuzzle.instanceId),
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
			if (isNew) await recordScheduledSlotEvent(today, postId, 'firstActions')
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
			const measurement = parseMeasurementHeaders(c.req.raw.headers)
			if (
				measurement.sessionId !== null &&
				measurement.contentId !== null &&
				measurement.attemptId !== null
			) {
				await tryConvertS2RFirstAction({
					sessionId: measurement.sessionId,
					postId,
					contentId: measurement.contentId,
					attemptId: measurement.attemptId,
				})
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
	// Logged-out users get a verified result and a short-lived opaque receipt.
	// Nothing account-scoped is credited until the same receipt is claimed
	// after sign-in; browser-provided time and mistake counts are ignored.
	if (!userId) {
		try {
			const body = await c.req.json().catch(() => null)
			if (body === null || typeof body !== 'object') {
				return c.json({ error: 'Invalid request body' }, 400)
			}
			const measurement = parseMeasurementHeaders(c.req.raw.headers)
			if (
				measurement.sessionId === null ||
				measurement.contentId === null ||
				measurement.attemptId === null
			) {
				const clientTime = (body as Record<string, unknown>).timeTaken
				if (typeof clientTime !== 'number' || clientTime <= 0) {
					return c.json({ error: 'Invalid timeTaken' }, 400)
				}
				return c.json(buildLoggedOutCompleteResponse({
					timeTaken: clientTime,
					mistakes: 0,
					gridSize: 4,
					weekendEvent: getActiveWeekendEvent(new Date()),
				}))
			}
			const verification = await verifyAnonymousPuzzleCompletion({
				sessionId: measurement.sessionId,
				postId,
				contentId: measurement.contentId,
				attemptId: measurement.attemptId,
				board: (body as Record<string, unknown>).board,
			})
			if (verification.status === 'invalid-solution') {
				return c.json({ error: 'Solution does not match the puzzle' }, 400)
			}
			if (verification.status !== 'verified') {
				return c.json({ error: 'Anonymous puzzle attempt is unavailable' }, 409)
			}

			return c.json({
				...buildLoggedOutCompleteResponse({
					timeTaken: verification.timeTaken,
					mistakes: 0,
					gridSize: verification.gridSize,
					weekendEvent: getActiveWeekendEvent(new Date()),
				}),
				migrationToken: verification.migrationToken,
			})
		} catch (error) {
			console.error('Error completing logged-out game:', error)
			return c.json({ error: 'Failed to record completion' }, 500)
		}
	}

	try {
		const body: CompleteRequest = await c.req.json()
		const verifiedMistakes = 0

		const puzzle = await getCurrentPuzzle(postId, userId)

		// Prefer the first-cell anchor used by the visible timer. The issuance
		// anchor remains a safe fallback if the non-critical start request failed.
		const startTimeKey = `user:${userId}:puzzleStartTime:${postId}`
		const firstCellTimeKey = puzzle
			? puzzleFirstCellTimeKey(userId, postId, puzzle.instanceId)
			: undefined
		const [firstCellTimeStr, startTimeStr] = await Promise.all([
			firstCellTimeKey ? redis.get(firstCellTimeKey) : Promise.resolve(undefined),
			redis.get(startTimeKey),
		])
		let timeTaken: number

		if (firstCellTimeStr) {
			timeTaken = Math.max(1, Math.ceil((Date.now() - parseInt(firstCellTimeStr, 10)) / 1000))
		} else if (startTimeStr) {
			timeTaken = Math.max(1, Math.round((Date.now() - parseInt(startTimeStr, 10)) / 1000))
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
		await Promise.all([
			redis.del(startTimeKey),
			...(firstCellTimeKey ? [redis.del(firstCellTimeKey)] : []),
		])

		// ─── Idempotency: credit each issued puzzle at most once ──────────────
		// Keyed on the puzzle instance (not just the post) so a "run again"
		// puzzle is credited again, but replaying the same solved board — the
		// trivial coin/season farm — is rejected.
		const completionKey = `user:${userId}:solved:${postId}:${puzzle.instanceId}`
		await registerUserDynamicKey(userId, completionKey)
		const completionClaimed = await redis.set(completionKey, '1', {
			nx: true,
			expiration: new Date(Date.now() + 2592000000),
		})
		if (!completionClaimed) {
			return c.json({ error: 'Puzzle already completed' }, 409)
		}

		const sessionId = getSessionIdFromHeader(c.req.raw.headers)
		const [
			sessionRun,
			currentLevel,
			history,
			pathLevel,
			adaptiveHistory,
			puzzleMeta,
			preCompletionEconomy,
		] = await Promise.all([
			incrementVerifiedSessionRun(userId, sessionId),
			getGridSkillLevel(userId, gridSize),
			getGridHistory(userId, gridSize),
			puzzle.source === 'challenge' ? getPathLevel(userId) : incrementPathLevel(userId),
			getAdaptiveHistory(userId),
			redis.hGetAll(`game:${postId}:puzzle`),
			getUserEconomy(userId),
		])

		const performanceScore = calculatePerformanceScore(timeTaken, currentLevel, verifiedMistakes, gridSize)

		const record: GameRecord = {
			level: currentLevel,
			timeTaken,
			timestamp: Date.now(),
			mistakes: verifiedMistakes,
			gridSize,
			source: puzzle.source,
		}
		const updatedHistory = addGameRecord(history, record)
		const newSkillLevel = determineSkillLevel(currentLevel, updatedHistory)
		const updatedAdaptiveHistory = addAdaptiveHistoryRecord(
			adaptiveHistory,
			buildAdaptiveRecord(gridSize, currentLevel, timeTaken, verifiedMistakes, false, puzzle.source),
		)
		const completionDate = getTodayUTC()
		const streakEligible = isCurrentScheduledCompletion({
			scheduledDate: puzzleMeta?.scheduledDate,
			scheduledSlotKey: puzzleMeta?.scheduledSlotKey,
			completionDate,
			today: completionDate,
		})
		const streak = streakEligible
			? await updateStreak(userId)
			: await getStreakData(userId)

		const coinReward = await applyCoinReward({
			userId,
			timeTaken,
			currentLevel,
			streak,
			mistakes: verifiedMistakes,
			gridSize,
		})

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

		const today = completionDate
		const speedLeaderboardKey = `leaderboard:speed:${today}:${gridSize}`
		await Promise.all([
			registerUserSortedSetMembership(userId, 'leaderboard:streak'),
			registerUserSortedSetMembership(userId, speedLeaderboardKey),
		])
		await Promise.all([
			redis.zAdd('leaderboard:streak', { score: streak.currentStreak, member: userId }),
			redis.zAdd(speedLeaderboardKey, { score: timeTaken, member: userId }),
			redis.expire(speedLeaderboardKey, 2592000), // 30-day TTL
		])

		// Update per-grid skill level and history
		await Promise.all([
			setGridSkillLevel(userId, gridSize, newSkillLevel),
			setGridHistory(
				userId,
				gridSize,
				newSkillLevel !== currentLevel ? [] : updatedHistory,
			),
			setAdaptiveHistory(userId, updatedAdaptiveHistory),
			redis.set(`user:${userId}:consecutiveSkips:${gridSize}`, '0'),
		])

		// Track attempts on challenge posts (once per user)
		const isChallengePost = Boolean(puzzleMeta?.challengeBy)
		if (isChallengePost) {
			const attemptedKey = `challenge:${postId}:attempted:${userId}`
			const alreadyAttempted = await redis.get(attemptedKey)
			if (!alreadyAttempted) {
				await redis.hIncrBy(`game:${postId}:stats`, 'attempts', 1)
				await registerUserDynamicKey(userId, attemptedKey)
				await redis.set(attemptedKey, 'true')
				await redis.expire(attemptedKey, 2592000) // 30-day TTL
			}
		}

		const challengeScore = safeParseInt(puzzleMeta?.challengeScore, 0)
		if (isChallengePost && challengeScore > 0 && timeTaken < challengeScore) {
			await checkChallengeBeat(postId, userId, timeTaken)
		}

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
			const weeklyLeaderboardKey = `leaderboard:weekly:${isoWeek}`
			await registerUserSortedSetMembership(userId, weeklyLeaderboardKey)
			await redis.zIncrBy(weeklyLeaderboardKey, userId, 1)
			await redis.expire(weeklyLeaderboardKey, 1209600) // 14-day TTL

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
			const previouslyUnlockedIds = unlockedIds.map((unlock) => unlock.id)
			const streakMilestone = streakEligible
				? checkStreakMilestone(streak.currentStreak, previouslyUnlockedIds)
				: null
			const newAchievements = checkAchievements(userStats, previouslyUnlockedIds)
			if (newAchievements.length > 0) {
				await unlockAchievements(userId, newAchievements)
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

		try {
			const completionIsNew = await trackCompletion(completionDate, postId, userId, context.subredditId)
			if (completionIsNew) {
				await recordScheduledSlotEvent(completionDate, postId, 'completions')
				void trackVariantCompletion(completionDate, assignVariant(userId)).catch((err) =>
					console.error('[AB] variant completion tracking failed:', err),
				)
			}
			if (isChallengePost) {
				await trackChallengeCompletion(completionDate, postId, userId, preCompletionEconomy.totalSolves === 0)
			}
		} catch (err) {
			console.error('[Analytics] Completion tracking failed (non-critical):', err)
		}

		// ─── Daily preview update for every verified puzzle completion ───────────
		try {
			const previewKey = `game:${postId}:preview`
			const previewMeta = await redis.hGetAll(previewKey)
			if (previewMeta?.type === 'daily') {
				const existingData = previewMeta.data
				if (existingData) {
					const parsed = JSON.parse(existingData) as {
						puzzleNumber: number
						gridSize: number
						completionsToday?: number
						activeNow?: number
						fastestTime?: number | null
						fastestUsername?: string | null
					}
					await redis.hSetNX(
						previewKey,
						'verifiedCompletions',
						(parsed.completionsToday ?? 0).toString(),
					)
					const completionsToday = await redis.hIncrBy(previewKey, 'verifiedCompletions', 1)
					const hasNewFastest = parsed.fastestTime == null || timeTaken < parsed.fastestTime
					const updatedPreviewData = {
						puzzleNumber: parsed.puzzleNumber,
						gridSize: parsed.gridSize,
						completionsToday,
						activeNow: parsed.activeNow ?? 0,
						fastestTime: hasNewFastest ? timeTaken : parsed.fastestTime,
						fastestUsername: hasNewFastest ? null : (parsed.fastestUsername ?? null),
					}
					await redis.hSet(previewKey, {
						type: 'daily',
						data: JSON.stringify(updatedPreviewData),
					})
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
				await registerUserDynamicKey(userId, seasonSolvesKey)
				const dailySolveIndex = await redis.incrBy(seasonSolvesKey, 1)
				await redis.expire(seasonSolvesKey, 172800)
				const score = calculateSeasonScore(
					timeTaken,
					gridSize,
					currentLevel,
					verifiedMistakes,
					dailySolveIndex,
				)
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
		let completionId: string | undefined
		try {
			const rawPuzzleNumber = puzzleMeta.puzzleNumber
				?? await redis.get('stats:puzzleCounter')
			const snapshotPuzzleNumber = Math.max(1, safeParseInt(rawPuzzleNumber, 1))
			const colorGrid = Array.from({ length: gridSize }, (_, row) =>
				puzzle.solution
					.slice(row * gridSize, (row + 1) * gridSize)
					.split('')
					.map((color) => color === 'r' ? 'red' as const : 'blue' as const),
			)
			const snapshot = await createCompletionSnapshot({
				userId,
				sourcePostId: postId,
				puzzleInstanceId: puzzle.instanceId,
				puzzleNumber: snapshotPuzzleNumber,
				gridSize,
				skillLevel: currentLevel,
				timeTaken,
				streak: streak.currentStreak,
				colorGrid,
			})
			completionId = snapshot.completionId
			await recordVerifiedUrjoBlitzCompletion({
				userId,
				completionId,
				gridSize,
			}).catch((blitzError) => {
				console.error('[Urjo Blitz] Completion recording failed (non-critical):', blitzError)
			})
		} catch (snapshotError) {
			console.error('[Completion] Snapshot creation failed (non-critical):', snapshotError)
		}

		const challengePromptEligible =
			completionId !== undefined && !isChallengePost && Boolean(context.subredditName)
		const measurement = parseMeasurementHeaders(c.req.raw.headers)

		try {
			await enqueueCompletionFollowup({
				userId,
				postId,
				timeTaken,
				currentLevel,
				difficulty: isDifficulty(puzzle.difficulty) ? puzzle.difficulty : 'easy',
				puzzleInstanceId: puzzle.instanceId,
				isChallengePost,
				preCompletionTotalSolves: preCompletionEconomy.totalSolves,
				sessionId: measurement.sessionId,
				contentId: measurement.contentId,
				attemptId: measurement.attemptId,
			})
		} catch (followupError) {
			console.error('[Completion follow-up] failed to enqueue:', followupError)
		}

		const response: CompleteResponse = {
			...(completionId !== undefined && { completionId }),
			timeTaken,
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

/** Credit a server-verified logged-out solve after sign-in. */
gameRouter.post('/api/game/migrate-logged-out-score', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const body = await c.req.json().catch(() => null)
		if (!body || typeof body !== 'object') {
			return c.json({ error: 'Invalid request body' }, 400)
		}

		const migrationToken = (body as Record<string, unknown>).migrationToken
		if (typeof migrationToken !== 'string') {
			return c.json({ error: 'A migration receipt is required' }, 400)
		}
		const claim = await claimAnonymousMigration(migrationToken, userId, postId)
		if (claim.status === 'unavailable') {
			return c.json({ error: 'Migration receipt is invalid or expired' }, 400)
		}
		if (claim.status === 'pending') {
			return c.json({ error: 'Migration is already in progress' }, 409)
		}
		if (claim.status === 'finalized') {
			return c.json({ migrated: false, credited: claim.credited })
		}

		const { receipt } = claim
		const today = getTodayUTC()
		const isEligible = isCurrentScheduledCompletion({
			scheduledDate: receipt.scheduledDate,
			scheduledSlotKey: receipt.scheduledSlotKey,
			completionDate: receipt.completionDate,
			today,
		})
		if (!isEligible) {
			await finalizeAnonymousMigration(migrationToken, userId, false)
			return c.json({ migrated: true, credited: false })
		}

		const currentLevel = await getGridSkillLevel(userId, receipt.gridSize)
		const streak = await updateStreak(userId)
		const coinReward = await applyCoinReward({
			userId,
			timeTaken: receipt.timeTaken,
			currentLevel,
			streak,
			mistakes: 0,
			gridSize: receipt.gridSize,
		})

		const speedLeaderboardKey = `leaderboard:speed:${today}:${receipt.gridSize}`
		await Promise.all([
			registerUserSortedSetMembership(userId, 'leaderboard:streak'),
			registerUserSortedSetMembership(userId, speedLeaderboardKey),
		])
		await Promise.all([
			redis.zAdd('leaderboard:streak', { score: streak.currentStreak, member: userId }),
			redis.zAdd(speedLeaderboardKey, {
				score: receipt.timeTaken,
				member: userId,
			}),
			redis.expire(speedLeaderboardKey, 2592000),
		])

		// Season scoring (non-blocking)
		let seasonRank: number | null = null
		let seasonPoints = 0
		try {
			const season = getCurrentSeason()
			if (season.isActive) {
				// Daily_Solve_Index: 1-based count of season-counted solves today.
				// incrBy returns the post-increment value, so the first solve gets 1.
				const seasonSolvesKey = `user:${userId}:seasonSolves:${today}`
				await registerUserDynamicKey(userId, seasonSolvesKey)
				const dailySolveIndex = await redis.incrBy(seasonSolvesKey, 1)
				await redis.expire(seasonSolvesKey, 172800)
				const score = calculateSeasonScore(
					receipt.timeTaken,
					receipt.gridSize,
					currentLevel,
					0,
					dailySolveIndex,
				)
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
		await finalizeAnonymousMigration(migrationToken, userId, true)

		return c.json({
			migrated: true,
			credited: true,
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
	const postPuzzleMeta = await redis.hGetAll(`game:${postId}:puzzle`)
	const lockedGridSize = getLockedGridSize(postPuzzleMeta)

	// ─── Logged-out path ─────────────────────────────────────────────────
	// Serve a fresh puzzle at the floor difficulty without touching skill
	// level / history (nothing to persist for an anonymous viewer).
	if (!userId) {
		const nextGridSize = lockedGridSize ?? DEFAULT_GRID_SIZE
		const newPuzzle = generatePuzzleForGridLevel(nextGridSize, MIN_SKILL_LEVEL)
		const contentId = createContentId(postId, makeInstanceId())
		await persistAnonymousPuzzleForRequest(c, postId, contentId, newPuzzle, postPuzzleMeta)
		const response: NextChallengeResponse = {
			puzzle: toPublicPuzzle(newPuzzle),
			contentId,
			skillLevel: MIN_SKILL_LEVEL,
			gridSizePreference: nextGridSize,
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

		const currentPuzzle = await getCurrentPuzzle(postId, userId)
		const isChallengePost = Boolean(postPuzzleMeta?.challengeBy)
		const rawGridSize = currentPuzzle ? parseInt(currentPuzzle.gridSize, 10) : await getGridSizePreference(userId)
		const currentGridSize: GridSize = isValidGridSize(rawGridSize) ? rawGridSize : 4
		const currentLevel = await getGridSkillLevel(userId, currentGridSize)
		const history = await getGridHistory(userId, currentGridSize)
		const adaptiveHistory = await getAdaptiveHistory(userId)
		const currentSource = currentPuzzle?.source ?? (isChallengePost ? 'challenge' : 'adaptive')

		const skipRecord: GameRecord = {
			level: currentLevel,
			timeTaken: timeSpent,
			timestamp: Date.now(),
			skipped: true,
			mistakes: 0,
			gridSize: currentGridSize,
			source: currentSource,
		}
		const updatedHistory = addGameRecord(history, skipRecord)
		const updatedAdaptiveHistory = addAdaptiveHistoryRecord(
			adaptiveHistory,
			buildAdaptiveRecord(currentGridSize, currentLevel, timeSpent, 0, true, currentSource),
		)

		const skipCountKey = `user:${userId}:consecutiveSkips:${currentGridSize}`
		const prevSkips = await redis.get(skipCountKey)
		const consecutiveSkips = (prevSkips ? parseInt(prevSkips, 10) : 0) + 1
		await redis.set(skipCountKey, consecutiveSkips.toString())

		let newLevel = determineSkillLevel(currentLevel, updatedHistory)
		if (shouldForceDemotion(consecutiveSkips)) {
			newLevel = Math.max(MIN_SKILL_LEVEL, currentLevel - 1)
		}

		await setGridSkillLevel(userId, currentGridSize, newLevel)
		await setGridHistory(userId, currentGridSize, updatedHistory)
		await setAdaptiveHistory(userId, updatedAdaptiveHistory)

		const [pathLevel, streak] = await Promise.all([
			getPathLevel(userId),
			getStreakData(userId),
		])
		let newPuzzle: SerializedPuzzle
		let responseGridSizePreference: GridSize
		let responseSkillLevel: number
		let issuedPuzzleInstanceId: string
		const warmupReturnKey = `user:${userId}:game:${postId}:warmupReturnGrid`
		const warmupReturnGrid = safeParseInt(await redis.get(warmupReturnKey), 0)

		if (
			lockedGridSize !== undefined &&
			warmupReturnGrid === lockedGridSize &&
			postPuzzleMeta.colors
		) {
			newPuzzle = {
				colors: postPuzzleMeta.colors,
				numbers: postPuzzleMeta.numbers ?? '',
				solution: postPuzzleMeta.solution ?? '',
				difficulty: (postPuzzleMeta.difficulty ?? 'easy') as SerializedPuzzle['difficulty'],
				gridSize: lockedGridSize,
			}
			issuedPuzzleInstanceId = (
				await persistIssuedPuzzle(postId, userId, newPuzzle, 'manual')
			).instanceId
			await redis.del(warmupReturnKey)
			responseGridSizePreference = lockedGridSize
			responseSkillLevel = await getGridSkillLevel(userId, lockedGridSize)
		} else if (lockedGridSize !== undefined) {
			const lockedLevel = await getGridSkillLevel(userId, lockedGridSize)
			newPuzzle = generatePuzzleForGridLevelAvoidingRepeat(
				lockedGridSize,
				lockedLevel,
				currentPuzzle,
			)
			issuedPuzzleInstanceId = (
				await persistIssuedPuzzle(postId, userId, newPuzzle, 'manual')
			).instanceId
			responseGridSizePreference = lockedGridSize
			responseSkillLevel = lockedLevel
		} else {
			const selection = await selectPuzzleStateForUser(userId, {
				pathLevel,
				streak,
				sessionRun: 0,
			})
			newPuzzle = generatePuzzleForGridLevelAvoidingRepeat(
				selection.gridSize,
				selection.level,
				currentPuzzle,
			)
			issuedPuzzleInstanceId = (
				await persistIssuedPuzzle(postId, userId, newPuzzle, selection.source)
			).instanceId
			responseGridSizePreference = selection.gridSize
			responseSkillLevel = await getGridSkillLevel(userId, newPuzzle.gridSize as GridSize)
		}

		// Reset the server-side timer anchor for the freshly issued puzzle so
		// run-again solves are timed consistently (server-authoritative).
		const startTimeKey = `user:${userId}:puzzleStartTime:${postId}`
		await registerUserDynamicKey(userId, startTimeKey)
		await redis.set(startTimeKey, Date.now().toString())
		await redis.expire(startTimeKey, 86400)

		const response: NextChallengeResponse = {
			puzzle: toPublicPuzzle(newPuzzle),
			contentId: createContentId(postId, issuedPuzzleInstanceId),
			skillLevel: responseSkillLevel,
			gridSizePreference: responseGridSizePreference,
		}

		return c.json(response)
	} catch (error) {
		console.error('Error generating next challenge:', error)
		return c.json({ error: 'Failed to generate next challenge' }, 500)
	}
})

// ─── GET /api/game/leaderboard ───────────────────────────────────────────────

gameRouter.get('/api/game/leaderboard', async (c) => {
	const { postId, userId } = context
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
			const lockedGridSizeForPost = postId
				? getLockedGridSize(await redis.hGetAll(`game:${postId}:puzzle`))
				: undefined
			const gridSizePreference = lockedGridSizeForPost
				?? (userId ? await getGridSizePreference(userId) : 4)
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

type ResultCommentInput = Readonly<{
	completionId: string
	commentMessage?: string
}>

const RESULT_COMMENT_COMPLETION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/

const postResultComment = async (c: Context): Promise<Response> => {
	const { postId, userId } = context
	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	let pendingClaim: { completionId: string; claimToken: string } | null = null
	let createdCommentId: string | null = null

	try {
		const body = await c.req.json().catch(() => null)
		const parsed = parseResultCommentInput(body)
		if (typeof parsed === 'string') return c.json({ error: parsed }, 400)

		const snapshot = await getOwnedCompletionSnapshot(userId, parsed.completionId)
		if (snapshot === null || snapshot.sourcePostId !== postId) {
			return c.json({ error: 'Verified completion not found' }, 403)
		}

		const actionClaim = await claimCompletionAction(userId, parsed.completionId, 'result-comment')
		if (actionClaim.status === 'finalized') {
			return c.json({ success: true, commentId: actionClaim.resourceId })
		}
		if (actionClaim.status === 'pending') {
			return c.json({ error: 'Result comment is already being posted' }, 409)
		}
		pendingClaim = { completionId: parsed.completionId, claimToken: actionClaim.claimToken }
		const resultText = serializeVerifiedResultComment(snapshot, parsed.commentMessage)

		const stickyCommentId = await getResultCommentTarget(snapshot.sourcePostId)
		const comment = await reddit.submitComment({
			id: stickyCommentId as `t1_${string}`,
			text: resultText,
			runAs: 'USER',
		})
		createdCommentId = comment.id
		await finalizeCompletionAction(
			userId,
			parsed.completionId,
			'result-comment',
			actionClaim.claimToken,
			createdCommentId,
		)
		pendingClaim = null
		await trackPublishedResultComment(userId)
		return c.json({ success: true, commentId: createdCommentId })
	} catch (error) {
		if (pendingClaim !== null && createdCommentId === null) {
			await releaseResultCommentClaim(userId, pendingClaim)
		}
		if (pendingClaim !== null && createdCommentId !== null) {
			const finalized = await retryResultCommentFinalization(
				userId,
				pendingClaim,
				createdCommentId,
			)
			if (finalized) await trackPublishedResultComment(userId)
			return c.json({ success: true, commentId: createdCommentId })
		}
		console.error('Error posting result comment:', error)
		return c.json({ error: 'Failed to post result comment' }, 500)
	}
}

gameRouter.post('/api/game/result-comment', postResultComment)

const parseResultCommentInput = (body: unknown): ResultCommentInput | string => {
	if (!body || typeof body !== 'object') return 'Invalid request body'
	const { completionId, commentMessage } = body as Record<string, unknown>
	if (
		typeof completionId !== 'string' ||
		!RESULT_COMMENT_COMPLETION_ID_PATTERN.test(completionId)
	) return 'A verified completion is required'
	if (
		commentMessage !== undefined &&
		(typeof commentMessage !== 'string' || commentMessage.length > 400)
	) return 'Comment message must be 400 characters or fewer'
	return {
		completionId,
		...(typeof commentMessage === 'string' && { commentMessage }),
	}
}

const getResultCommentTarget = async (postId: string): Promise<string> => {
	const stickyCommentId = await redis.hGet(`game:${postId}:meta`, 'stickyCommentId')
	if (stickyCommentId !== undefined) return stickyCommentId

	const lockKey = `game:${postId}:stickyLock`
	const lockResult = await redis.set(lockKey, '1', {
		nx: true,
		expiration: new Date(Date.now() + 15_000),
	})
	if (lockResult !== 'OK') throw new Error('Post is being set up')

	try {
		return await createStickyComment(postId)
	} finally {
		await redis.del(lockKey)
	}
}

const trackPublishedResultComment = async (userId: string): Promise<void> => {
	try {
		const today = getTodayUTC()
		await Promise.all([
			trackResultComment(today, userId),
			incrementSharesCount(userId),
			recordSharer(today, userId),
			recordChannelOpen(today, 'result_comment', userId),
		])
	} catch (error) {
		console.error('[Viral] Result comment tracking failed (non-critical):', error)
	}
}

const releaseResultCommentClaim = async (
	userId: string,
	claim: { completionId: string; claimToken: string },
): Promise<void> => {
	try {
		await releaseCompletionAction(
			userId,
			claim.completionId,
			'result-comment',
			claim.claimToken,
		)
	} catch (error) {
		console.error('[ResultComment] Failed to release completion claim:', error)
	}
}

const retryResultCommentFinalization = async (
	userId: string,
	claim: { completionId: string; claimToken: string },
	commentId: string,
): Promise<boolean> => {
	try {
		await finalizeCompletionAction(
			userId,
			claim.completionId,
			'result-comment',
			claim.claimToken,
			commentId,
		)
		return true
	} catch (error) {
		console.error('[ResultComment] Comment posted but receipt finalization failed:', error)
		return false
	}
}

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
	let pendingClaim: { completionId: string; claimToken: string } | null = null
	let dailySlotKey: string | null = null
	let createdPostId: `t3_${string}` | null = null

	try {
		const body = await c.req.json<Partial<ChallengeRequest>>().catch(() => null)
		if (!body || typeof body.completionId !== 'string') {
			return c.json<ChallengeResponse>(
				{ success: false, error: 'A verified completion is required' },
				400,
			)
		}
		if (!subredditName) {
			return c.json<ChallengeResponse>({ success: false, error: 'No subreddit context' }, 400)
		}
		const completionId = body.completionId
		const snapshot = await getOwnedCompletionSnapshot(userId, completionId)
		if (snapshot === null || snapshot.sourcePostId !== postId) {
			return c.json<ChallengeResponse>(
				{ success: false, error: 'Verified completion not found' },
				403,
			)
		}
		const customTitle = normalizeChallengeTitle(body.customTitle)
		const today = getTodayUTC()

		const puzzle = await getCurrentPuzzle(postId, userId)
		if (!puzzle || puzzle.instanceId !== snapshot.puzzleInstanceId) {
			return c.json<ChallengeResponse>(
				{ success: false, error: 'The verified puzzle is no longer active' },
				409,
			)
		}

		const actionClaim = await claimCompletionAction(userId, completionId, 'challenge')
		if (actionClaim.status === 'finalized') {
			const resourceId = actionClaim.resourceId as `t3_${string}`
			return c.json<ChallengeResponse>({
				success: true,
				postId: resourceId,
				postUrl: redditCommentsUrl(resourceId),
			})
		}
		if (actionClaim.status === 'pending') {
			return c.json<ChallengeResponse>(
				{ success: false, error: 'Challenge creation is already in progress' },
				409,
			)
		}
		pendingClaim = { completionId, claimToken: actionClaim.claimToken }

		dailySlotKey = await claimDailyChallengeSlot(userId, today, completionId)
		if (dailySlotKey === null) {
			await releaseCompletionAction(
				userId,
				completionId,
				'challenge',
				actionClaim.claimToken,
			)
			pendingClaim = null
			return c.json<ChallengeResponse>(
				{ success: false, error: `You can create ${MAX_DAILY_CHALLENGE_POSTS} rival posts per day` },
				429,
			)
		}

		const timeTaken = snapshot.timeTaken
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

		// Publish the user-provided title when present; otherwise fall back to a
		// simple default instead of generating extra copy.
		const title = customTitle ?? DEFAULT_CHALLENGE_TITLE

		const newPost = await reddit.submitCustomPost({
			subredditName,
			title,
			textFallback: {
				text: `${username} solved Urjo in ${timeTaken}s. Open the post to play the same board.`,
			},
			runAs: 'USER',
			userGeneratedContent: { text: title },
			postData: {
				postType: 'urjo-puzzle',
			},
		})
		createdPostId = newPost.id as `t3_${string}`
		await finalizeCompletionAction(
			userId,
			completionId,
			'challenge',
			actionClaim.claimToken,
			createdPostId,
		)
		pendingClaim = null

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
			challengeSkillLevel: snapshot.skillLevel.toString(),
			completionId,
			sourcePostId: postId,
			challengeChainLength: challengeChainLength.toString(),
		})

		// Initialize stats for the challenge post
		await redis.hSet(`game:${newPost.id}:stats`, {
			attempts: '0',
			beats: '0',
		})

		// Post the initial leaderboard comment (APP account, no user action needed).
		// Non-critical — if rate-limited, meta is stored without a comment ID and
		// the leaderboard comment will simply be absent.
		let leaderboardCommentId = ''
		try {
			const targetLine = buildChallengeTargetLine(timeTaken.toString(), undefined)
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

		return c.json<ChallengeResponse>({
			success: true,
			postId: createdPostId,
			postUrl: redditCommentsUrl(newPost.id),
		})
	} catch (error) {
		console.error('Challenge post error:', error)
		if (pendingClaim !== null) {
			await releaseCompletionAction(
				userId,
				pendingClaim.completionId,
				'challenge',
				pendingClaim.claimToken,
			).catch((releaseError) =>
				console.error('[Challenge] Failed to release action claim:', releaseError),
			)
		}
		if (dailySlotKey !== null && createdPostId === null) {
			await redis.del(dailySlotKey).catch((slotError) =>
				console.error('[Challenge] Failed to release daily slot:', slotError),
			)
		}
		if (createdPostId !== null) {
			return c.json<ChallengeResponse>({
				success: true,
				postId: createdPostId,
				postUrl: redditCommentsUrl(createdPostId),
			})
		}
		return c.json<ChallengeResponse>({ success: false, error: 'Failed to create challenge' })
	}
})
