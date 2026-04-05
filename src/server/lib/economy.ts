/**
 * Economy Helper Functions
 * Coin calculation, user economy management, title validation
 */

import { redis, reddit } from '@devvit/web/server'
import type { UserEconomy, CoinReward, ShopItem, TitleDef, StreakData } from '../../shared/types'
import {
	COIN_STREAK_MULTIPLIER,
	COIN_SPEED_BONUS,
	COIN_DAILY_BONUS,
	COIN_PERFECT_BONUS,
	PAR_TIME_MULTIPLIER,
	TITLES,
	getTitleById,
	getLevelConfig,
	getCoinBaseForLevel,
} from '../../shared/constants'
import { getTodayUTC, fetchUsername } from './helpers'

const ECONOMY_KEY_PREFIX = 'user'

const getEconomyKey = (userId: string): string =>
	`${ECONOMY_KEY_PREFIX}:${userId}:economy`

/**
 * Get user's economy data from Redis hash
 */
export const getUserEconomy = async (userId: string): Promise<UserEconomy> => {
	const key = getEconomyKey(userId)
	const data = await redis.hGetAll(key)

	return {
		coins: parseInt(data?.coins ?? '0', 10),
		totalCoins: parseInt(data?.totalCoins ?? '0', 10),
		totalSolves: parseInt(data?.totalSolves ?? '0', 10),
		speedSolves: parseInt(data?.speedSolves ?? '0', 10),
		equippedTitle: data?.equippedTitle ?? 'puzzler',
		ownedTitles: data?.ownedTitles ? JSON.parse(data.ownedTitles) : ['puzzler'],
		dailyFirstSolve: data?.dailyFirstSolve ?? null,
	}
}

/**
 * Save user economy data to Redis hash
 */
export const saveUserEconomy = async (userId: string, economy: Partial<UserEconomy>): Promise<void> => {
	const key = getEconomyKey(userId)
	const updates: Record<string, string> = {}

	if (economy.coins !== undefined) updates.coins = economy.coins.toString()
	if (economy.totalCoins !== undefined) updates.totalCoins = economy.totalCoins.toString()
	if (economy.totalSolves !== undefined) updates.totalSolves = economy.totalSolves.toString()
	if (economy.speedSolves !== undefined) updates.speedSolves = economy.speedSolves.toString()
	if (economy.equippedTitle !== undefined) updates.equippedTitle = economy.equippedTitle
	if (economy.ownedTitles !== undefined) updates.ownedTitles = JSON.stringify(economy.ownedTitles)
	if (economy.dailyFirstSolve !== undefined) updates.dailyFirstSolve = economy.dailyFirstSolve ?? ''

	if (Object.keys(updates).length > 0) {
		await redis.hSet(key, updates)
	}
}

/**
 * Calculate coin reward for puzzle completion
 */
export const calculateCoinReward = (
	timeTaken: number,
	level: number,
	currentStreak: number,
	isDailyFirst: boolean,
	mistakes: number = 0
): CoinReward => {
	const config = getLevelConfig(level)
	const parTime = config.expectedTime * PAR_TIME_MULTIPLIER
	const speedBonus = timeTaken <= parTime ? COIN_SPEED_BONUS : 0
	const perfectBonus = mistakes === 0 ? COIN_PERFECT_BONUS : 0

	const reward: CoinReward = {
		base: getCoinBaseForLevel(level),
		streakBonus: currentStreak * COIN_STREAK_MULTIPLIER,
		speedBonus,
		dailyBonus: isDailyFirst ? COIN_DAILY_BONUS : 0,
		perfectBonus,
		total: 0,
	}

	reward.total = reward.base + reward.streakBonus + reward.speedBonus + reward.dailyBonus + reward.perfectBonus
	return reward
}

/**
 * Check if user meets a title's condition
 */
export const checkTitleCondition = async (
	title: TitleDef,
	userId: string,
	skillLevel: number,
	streakData: StreakData
): Promise<boolean> => {
	if (!title.condition) return true

	switch (title.condition.type) {
		case 'minSolves': {
			const economy = await getUserEconomy(userId)
			return economy.totalSolves >= title.condition.value
		}
		case 'minSpeedSolves': {
			const economy = await getUserEconomy(userId)
			return economy.speedSolves >= title.condition.value
		}
		case 'minSkillLevel':
			return skillLevel >= title.condition.value
		case 'minLongestStreak':
			return streakData.longestStreak >= title.condition.value
		default:
			return false
	}
}

/**
 * Get all shop items with ownership and unlock status
 */
export const getShopItems = async (
	userId: string,
	skillLevel: number,
	streakData: StreakData
): Promise<ShopItem[]> => {
	const economy = await getUserEconomy(userId)

	return TITLES.map((title) => {
		const owned = economy.ownedTitles.includes(title.id)
		const equipped = economy.equippedTitle === title.id

		let unlocked = true
		if (title.condition) {
			unlocked = checkTitleConditionSync(title, economy, skillLevel, streakData)
		}

		return {
			...title,
			owned,
			equipped,
			unlocked,
		}
	})
}

/**
 * Synchronous version of condition check (for mapping)
 */
const checkTitleConditionSync = (
	title: TitleDef,
	economy: UserEconomy,
	skillLevel: number,
	streakData: StreakData
): boolean => {
	if (!title.condition) return true

	switch (title.condition.type) {
		case 'minSolves':
			return economy.totalSolves >= title.condition.value
		case 'minSpeedSolves':
			return economy.speedSolves >= title.condition.value
		case 'minSkillLevel':
			return skillLevel >= title.condition.value
		case 'minLongestStreak':
			return streakData.longestStreak >= title.condition.value
		default:
			return false
	}
}

/**
 * Get user display data (username + title emoji)
 * Uses cached display data from Redis
 */
export const getUserDisplay = async (
	targetUserId: string,
	currentUserId?: string
): Promise<{ username: string; titleEmoji: string }> => {
	// Return "You" for current user
	if (currentUserId && targetUserId === currentUserId) {
		return { username: 'You', titleEmoji: '🧩' }
	}

	// Check cache first
	const cacheKey = `user:${targetUserId}:display`
	const cached = await redis.get(cacheKey)

	if (cached) {
		try {
			const data = JSON.parse(cached)
			return { username: data.username, titleEmoji: data.titleEmoji }
		} catch {
			// Invalid cache, fetch fresh
		}
	}

	// Fetch username
	const username = await fetchUsername(targetUserId)

	// Get title
	const economy = await getUserEconomy(targetUserId)
	const titleDef = getTitleById(economy.equippedTitle)
	const titleEmoji = titleDef?.emoji ?? '🧩'

	// Cache for 24 hours
	const displayData = { username, titleEmoji }
	await redis.set(cacheKey, JSON.stringify(displayData))
	await redis.expire(cacheKey, 86400)

	return { username, titleEmoji }
}

/**
 * Get streak data for a user
 */
export const getUserStreakData = async (userId: string): Promise<StreakData> => {
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
