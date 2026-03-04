/**
 * Economy API Routes
 * Handles user economy, shop, titles
 */

import { Hono } from 'hono'
import { context, redis } from '@devvit/web/server'
import type {
	EconomyResponse,
	ShopResponse,
	BuyTitleRequest,
	BuyTitleResponse,
	EquipTitleRequest,
	EquipTitleResponse,
	LeaderboardData,
	LeaderboardEntry,
} from '../../shared/types'
import { TITLES } from '../../shared/constants'
import {
	getUserEconomy,
	saveUserEconomy,
	getShopItems,
	getUserDisplay,
	getUserStreakData,
} from '../lib/economy'

export const economyRouter = new Hono()

// ─── GET /api/economy ─────────────────────────────────────────────────────────

economyRouter.get('/api/economy', async (c) => {
	const { userId } = context

	if (!userId) {
		return c.json({ error: 'User ID required' }, 400)
	}

	try {
		const economy = await getUserEconomy(userId)
		const response: EconomyResponse = economy
		return c.json(response)
	} catch (error) {
		console.error('Error fetching economy:', error)
		return c.json({ error: 'Failed to fetch economy' }, 500)
	}
})

// ─── GET /api/shop ────────────────────────────────────────────────────────────

economyRouter.get('/api/shop', async (c) => {
	const { userId } = context

	if (!userId) {
		return c.json({ error: 'User ID required' }, 400)
	}

	try {
		const [economy, skillLevel, streakData] = await Promise.all([
			getUserEconomy(userId),
			getSkillLevel(userId),
			getUserStreakData(userId),
		])

		const items = await getShopItems(userId, skillLevel, streakData)

		const response: ShopResponse = {
			items,
			coins: economy.coins,
		}

		return c.json(response)
	} catch (error) {
		console.error('Error fetching shop:', error)
		return c.json({ error: 'Failed to fetch shop' }, 500)
	}
})

// ─── POST /api/shop/buy ─────────────────────────────────────────────────────

economyRouter.post('/api/shop/buy', async (c) => {
	const { userId } = context

	if (!userId) {
		return c.json({ error: 'User ID required' }, 400)
	}

	try {
		const body = await c.req.json<BuyTitleRequest>()
		const { titleId } = body

		if (!titleId) {
			return c.json({ error: 'Title ID required' }, 400)
		}

		const title = TITLES.find((t) => t.id === titleId)
		if (!title) {
			return c.json({ error: 'Title not found' }, 404)
		}

		const economy = await getUserEconomy(userId)

		// Check ownership
		if (economy.ownedTitles.includes(titleId)) {
			return c.json({ error: 'Already owned' }, 400)
		}

		// Check coins
		if (economy.coins < title.cost) {
			return c.json({ error: 'Not enough coins' }, 400)
		}

		// Check condition (server-side validation)
		const streakData = await getUserStreakData(userId)
		const skillLevel = await getSkillLevel(userId)

		if (title.condition) {
			const conditionMet = await checkCondition(title, economy, skillLevel, streakData)
			if (!conditionMet) {
				return c.json({ error: 'Condition not met' }, 400)
			}
		}

		// Deduct coins and add title
		const newCoins = economy.coins - title.cost
		const newOwnedTitles = [...economy.ownedTitles, titleId]

		await saveUserEconomy(userId, {
			coins: newCoins,
			ownedTitles: newOwnedTitles,
		})

		const response: BuyTitleResponse = {
			success: true,
			newBalance: newCoins,
		}

		return c.json(response)
	} catch (error) {
		console.error('Error buying title:', error)
		return c.json({ error: 'Failed to buy title' }, 500)
	}
})

// ─── POST /api/shop/equip ───────────────────────────────────────────────────

economyRouter.post('/api/shop/equip', async (c) => {
	const { userId } = context

	if (!userId) {
		return c.json({ error: 'User ID required' }, 400)
	}

	try {
		const body = await c.req.json<EquipTitleRequest>()
		const { titleId } = body

		if (!titleId) {
			return c.json({ error: 'Title ID required' }, 400)
		}

		const economy = await getUserEconomy(userId)

		// Verify ownership
		if (!economy.ownedTitles.includes(titleId)) {
			return c.json({ error: 'Title not owned' }, 400)
		}

		// Equip title
		await saveUserEconomy(userId, {
			equippedTitle: titleId,
		})

		// Invalidate display cache
		await redis.del(`user:${userId}:display`)

		const response: EquipTitleResponse = {
			success: true,
		}

		return c.json(response)
	} catch (error) {
		console.error('Error equipping title:', error)
		return c.json({ error: 'Failed to equip title' }, 500)
	}
})

// ─── GET /api/leaderboard/coins ─────────────────────────────────────────────

economyRouter.get('/api/leaderboard/coins', async (c) => {
	const { userId } = context

	try {
		const topUsers = await redis.zRange('leaderboard:coins', 0, 9, {
			reverse: true,
			by: 'rank',
		})

		const entriesPromises = topUsers.map(async (item, i) => {
			const memberId = item.member
			const score = item.score

			const { username, titleEmoji } = await getUserDisplay(memberId, userId)

			return {
				rank: i + 1,
				userId: memberId,
				username: `${titleEmoji} ${username}`,
				score,
			} as LeaderboardEntry
		})

		const entries = await Promise.all(entriesPromises)

		// Find user's rank - for coins, higher score = better rank
		let userRank: number | undefined
		if (userId) {
			const userScore = await redis.zScore('leaderboard:coins', userId)
			if (userScore !== undefined && userScore !== null) {
				// Count how many users have higher scores
				const higherCount = await redis.zRange('leaderboard:coins', userScore + 1, Number.MAX_SAFE_INTEGER, {
					by: 'score',
				})
				userRank = higherCount.length + 1
			}
		}

		const leaderboard: LeaderboardData = {
			type: 'coins',
			entries,
			...(userRank !== undefined && { userRank }),
		}

		return c.json(leaderboard)
	} catch (error) {
		console.error('Error fetching coins leaderboard:', error)
		return c.json({ error: 'Failed to fetch leaderboard' }, 500)
	}
})

// ─── Helpers ────────────────────────────────────────────────────────────────

const getSkillLevel = async (userId: string): Promise<number> => {
	const level = await redis.get(`user:${userId}:skillLevel`)
	return level ? parseInt(level, 10) : 1
}

const checkCondition = async (
	title: (typeof TITLES)[number],
	economy: Awaited<ReturnType<typeof getUserEconomy>>,
	skillLevel: number,
	streakData: Awaited<ReturnType<typeof getUserStreakData>>
): Promise<boolean> => {
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
