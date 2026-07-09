/**
 * Urjo Puzzle Game Types
 * Shared between client and server
 */

import type { EngagementCompletionData, MysteryBoxReward } from './engagement-types'
import type { GridSize } from './constants'

export type CellColor = 'red' | 'blue' | null

export type Cell = {
	color: CellColor
	number: number | null
	locked: boolean
	isLoading?: boolean
}

export type Grid = Cell[][]

export type SerializedPuzzle = {
	colors: string // "rbbrr.bb..." (r=red, b=blue, .=empty)
	numbers: string // "2-31--5-..." (digit or - for no number)
	solution: string // Complete solution (rbbrrbbrrbbrrbbb)
	difficulty: 'easy' | 'medium' | 'hard' | 'diabolical'
	gridSize: number // 4, 6, or 8
}

export type CommunityStats = {
	activePlayers: number
	collectiveStreakDays: number
}

export type FirstScreenData = {
	samplePuzzle: SerializedPuzzle
	instruction: string
	communityStats: CommunityStats
	targetToBeat?: {
		seconds: number
		username?: string
	}
}

export type GameState = {
	puzzle: SerializedPuzzle
	tutorialCompleted: boolean
	skillLevel: number
	pathLevel: number
	gridSizePreference: number
	/** False when the viewer is a logged-out Reddit user. The client uses
	 *  this to hide account-scoped UI (wallet, streak, leaderboards, social
	 *  actions) and surface a login prompt instead. Defaults to true when
	 *  absent so existing logged-in flows are unaffected. */
	isLoggedIn?: boolean
	postId?: string
	isChallenge?: boolean
	allowsGridSizeChange?: boolean
	streak?: StreakData
	username?: string
	isFirstTimeUser?: boolean
	puzzleNumber?: number
	communityStats?: CommunityStats
	isMod?: boolean
	currentSeason?: {
		seasonId: string
		seasonNumber: number
		startDate: string
		endDate: string
		isActive: boolean
	}
	notifyOptIn?: boolean
	hintsDismissed?: { numberConstraint: boolean; adjacencyViolation: boolean }
	/** Challenger info for challenge posts — always present when isChallenge is true.
	 *  Replaces the firstScreen preview; shown as a strip below the board. */
	challengerInfo?: {
		username: string
		avatarUrl?: string
		targetSeconds: number
	}
	/** Active weekend event payload — present on every state response so the
	 *  banner has fresh "ends in" data on each (re)open. Inactive events are
	 *  also returned (active=false) so the client can hide the banner. */
	weekendEvent?: {
		active: boolean
		multiplier: number
		name: string
		emoji: string
		endsAtMs: number | null
		hoursLeft: number | null
	}
	/** Player's current season standing — feeds the always-on progression
	 *  strip. Only populated when a season is active and the player has a
	 *  score (rank may still be null if they haven't earned points yet). */
	seasonProgress?: {
		rank: number | null
		score: number
	}
	/** First-screen preview data for the onboarding splash. Present for
	 *  non-challenge posts when the user hasn't played today. */
	firstScreen?: FirstScreenData
	/** A/B/C first-screen experiment variant assigned to this session.
	 *  Absent for logged-out users, challenge posts, and first-time users
	 *  (who see the tutorial instead). */
	variant?: 'A' | 'B' | 'C'
	/** True when the user has already had a first-action on this post today.
	 *  When true the client skips the first screen and goes straight to game. */
	hasPlayedToday?: boolean
}

export type NextChallengeResponse = {
	puzzle: SerializedPuzzle
	skillLevel: number
	gridSizePreference: number
}

export type CompleteRequest = {
	timeTaken: number // seconds
	mistakes?: number
	/** The fully-solved board, serialized as the colors string (r/b/.). The
	 *  server verifies this equals the puzzle's unique solution before
	 *  awarding anything — completion is never taken on the client's word. */
	board?: string
	/** How many puzzles the player has already completed in this session
	 *  (incl. the one being reported). Used to apply the run-again bonus. */
	sessionRun?: number
}

export type CompleteResponse = {
	performanceScore: number
	newSkillLevel: number
	previousSkillLevel: number
	pathLevel: number
	/** False when the puzzle was solved by a logged-out user. Meta-progression
	 *  (streak, coins, season) is omitted in that case and the client shows a
	 *  login CTA on the result screen instead. Defaults to true when absent. */
	isLoggedIn?: boolean
	streak?: StreakData
	coinReward?: CoinReward
	engagement?: EngagementCompletionData | undefined
	seasonRank?: number
	seasonPoints?: number
	/** True on a perfect solve eligible for the "Challenge friends" prompt.
	 *  The challenge post itself is only ever created via an explicit user tap. */
	challengePromptEligible?: boolean
	/** Run-again loop info — echoed back so client can display the multiplier
	 *  alongside the coin reward. Bonus coins are already added to the wallet. */
	sessionRun?: number
	sessionRunMultiplier?: number
	sessionRunBonusCoins?: number
	/** Streak forecast — what tomorrow looks like for this player. Used by the
	 *  result screen "Return tomorrow" hook. Includes a flag for whether
	 *  tomorrow is a milestone bump so the UI can highlight it. */
	streakForecast?: {
		day: number
		coinBonus: number
		isMilestone: boolean
		label: string
	}
	/** Weekend Event payload — identical shape to /api/game/state so the
	 *  client can update its banner + show the per-completion bonus. */
	weekendEvent?: {
		active: boolean
		multiplier: number
		name: string
		emoji: string
		endsAtMs: number | null
		hoursLeft: number | null
	}
	/** Coins added to the wallet by the active weekend event on this solve.
	 *  0 when the event is inactive. */
	weekendBonusCoins?: number
}

/** A single game record stored in user history */
export type GameRecord = {
	level: number
	timeTaken: number
	timestamp: number
	skipped?: boolean
	mistakes?: number
	gridSize?: GridSize
	source?: 'adaptive' | 'manual' | 'challenge' | 'post'
}

export type AdaptiveHistoryRecord = {
	gridSize: GridSize
	level: number
	timeTaken: number
	mistakes: number
	skipped: boolean
	source: 'adaptive' | 'manual' | 'challenge' | 'post'
	timestamp: number
}

/** User streak data */
export type StreakData = {
	currentStreak: number
	longestStreak: number
	lastPlayedDate: string | null
	/** True only on the response from a /complete that just granted a free
	 *  weekly Streak Freeze (every 7 streak days). Optional + opt-in so all
	 *  read-side endpoints (GET /api/game/streak etc.) can leave it unset. */
	freeFreezeGranted?: boolean
}

/** Leaderboard entry */
export type LeaderboardEntry = {
	rank: number
	userId: string
	username: string
	score: number
}

/** Leaderboard response */
export type LeaderboardData = {
	type: 'streak' | 'speed' | 'coins'
	entries: LeaderboardEntry[]
	userRank?: number
}

/** Challenge post request */
export type ChallengeRequest = {
	timeTaken: number
	skillLevel: number
	mistakes: number
	customTitle?: string
}

/** Challenge post response */
export type ChallengeResponse = {
	success: boolean
	postUrl?: string
	error?: string
}

// ─── Economy Types ─────────────────────────────────────────────────────────────

/** Title condition types */
export type TitleConditionType = 'minSolves' | 'minSpeedSolves' | 'minSkillLevel' | 'minLongestStreak'

/** Title definition from constants */
export type TitleDef = {
	id: string
	emoji: string
	label: string
	cost: number
	condition?: {
		type: TitleConditionType
		value: number
	}
}

/** User economy data stored in Redis */
export type UserEconomy = {
	coins: number
	totalCoins: number
	totalSolves: number
	speedSolves: number
	equippedTitle: string
	ownedTitles: string[]
	dailyFirstSolve: string | null
	streakFreezes: number
}

/** Coin reward breakdown */
export type CoinReward = {
	base: number
	streakBonus: number
	speedBonus: number
	dailyBonus: number
	perfectBonus: number
	loginBonus: number
	gridSizeMultiplier: number
	total: number
	multiplier?: number | undefined
	mysteryBox?: MysteryBoxReward | undefined
	/** Result tier id ('flawless' | 'sharp' | 'solid' | 'scrappy'). Optional
	 *  for backwards compatibility — older completion records won't have it. */
	tierId?: 'flawless' | 'sharp' | 'solid' | 'scrappy' | undefined
	/** Tier bonus multiplier applied to the perfect/speed/streak pool (0-1). */
	tierMultiplier?: number | undefined
}

/** Shop item with ownership/unlock status */
export type ShopItem = TitleDef & {
	owned: boolean
	equipped: boolean
	unlocked: boolean
}

/** Economy response */
export type EconomyResponse = UserEconomy

/** Shop response */
export type ShopResponse = {
	items: ShopItem[]
	coins: number
	streakFreezes: number
}

/** Buy title request */
export type BuyTitleRequest = {
	titleId: string
}

/** Buy title response */
export type BuyTitleResponse = {
	success: boolean
	newBalance?: number
	error?: string
}

/** Equip title request */
export type EquipTitleRequest = {
	titleId: string
}

/** Equip title response */
export type EquipTitleResponse = {
	success: boolean
	error?: string
}

// ─── Grid Size Types ───────────────────────────────────────────────────────────

/** Grid size selection response */
export type GridSizeResponse = {
	puzzle: SerializedPuzzle
	skillLevel: number
	gridSizePreference: number
}
