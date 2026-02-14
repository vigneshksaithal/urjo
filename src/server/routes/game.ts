/**
 * Game API Routes
 * Handles game state, puzzle completion, and adaptive difficulty
 */

import { Hono } from 'hono'
import { context, redis } from '@devvit/web/server'
import type {
	GameState,
	NextChallengeResponse,
	CompleteRequest,
	CompleteResponse,
	GameRecord,
} from '../../shared/types'
import { DEFAULT_SKILL_LEVEL, getLevelConfig } from '../../shared/constants'
import { generatePuzzle } from '../lib/generator'
import {
	calculatePerformanceScore,
	determineSkillLevel,
	addGameRecord,
	parseHistory,
} from '../lib/adaptive'

export const gameRouter = new Hono()

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
		}

		return c.json(gameState)
	} catch (error) {
		console.error('Error fetching game state:', error)
		return c.json({ error: 'Failed to fetch game state' }, 500)
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

		// Persist to Redis
		await redis.set(`user:${userId}:skillLevel`, newSkillLevel.toString())
		await redis.set(`user:${userId}:history`, JSON.stringify(updatedHistory))

		const response: CompleteResponse = {
			performanceScore,
			newSkillLevel,
			previousSkillLevel: currentLevel,
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
		const skillLevel = await getSkillLevel(userId)
		const newPuzzle = generatePuzzleForLevel(skillLevel)

		await redis.hSet(`user:${userId}:game:${postId}:currentPuzzle`, {
			colors: newPuzzle.colors,
			numbers: newPuzzle.numbers,
			solution: newPuzzle.solution,
			difficulty: newPuzzle.difficulty,
			gridSize: newPuzzle.gridSize.toString(),
		})

		const response: NextChallengeResponse = {
			puzzle: newPuzzle,
			skillLevel,
		}

		return c.json(response)
	} catch (error) {
		console.error('Error generating next challenge:', error)
		return c.json({ error: 'Failed to generate next challenge' }, 500)
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
