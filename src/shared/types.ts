/**
 * Urjo Puzzle Game Types
 * Shared between client and server
 */

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
	gridSize: number // 4 or 6
}

export type GameState = {
	puzzle: SerializedPuzzle
	tutorialCompleted: boolean
	skillLevel: number
	streak?: StreakData
}

export type NextChallengeResponse = {
	puzzle: SerializedPuzzle
	skillLevel: number
}

export type CompleteRequest = {
	timeTaken: number // seconds
	mistakes?: number
}

export type CompleteResponse = {
	performanceScore: number
	newSkillLevel: number
	previousSkillLevel: number
	streak?: StreakData
	coinReward?: CoinReward
}

/** A single game record stored in user history */
export type GameRecord = {
	level: number
	timeTaken: number
	timestamp: number
	skipped?: boolean
}

/** User streak data */
export type StreakData = {
	currentStreak: number
	longestStreak: number
	lastPlayedDate: string | null
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

/** Share score request */
export type ShareRequest = {
	timeTaken: number
	streak: number
}

/** Share score response */
export type ShareResponse = {
	success: boolean
	shared?: boolean
	alreadyShared?: boolean
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
}

/** Coin reward breakdown */
export type CoinReward = {
	base: number
	streakBonus: number
	speedBonus: number
	dailyBonus: number
	perfectBonus: number
	total: number
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
