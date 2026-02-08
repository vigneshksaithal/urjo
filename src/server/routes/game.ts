/**
 * Game API Routes
 * Handles game state and next challenge generation
 */

import { Hono } from 'hono'
import { context, redis } from '@devvit/web/server'
import type { GameState, NextChallengeResponse } from '../../shared/types'
import { generatePuzzle } from '../lib/generator'

export const gameRouter = new Hono()

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get the current puzzle data for a user.
 */
async function getCurrentPuzzle(
	postId: string,
	userId: string
): Promise<{ colors: string; numbers: string; solution: string; difficulty: string } | null> {
	// Check for user-specific puzzle (from Next Challenge)
	const userPuzzle = await redis.hGetAll(`user:${userId}:game:${postId}:currentPuzzle`)
	if (userPuzzle && userPuzzle.colors) {
		return {
			colors: userPuzzle.colors,
			numbers: userPuzzle.numbers ?? '',
			solution: userPuzzle.solution ?? '',
			difficulty: userPuzzle.difficulty ?? 'easy',
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
	}
}

// ─── GET /api/game/state ─────────────────────────────────────────────────────

gameRouter.get('/api/game/state', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const puzzle = await getCurrentPuzzle(postId, userId)
		if (!puzzle) return c.json({ error: 'Game not found' }, 404)

		// Get tutorial status
		const tutorialCompleted = (await redis.get(`user:${userId}:tutorialCompleted`)) === 'true'

		const gameState: GameState = {
			puzzle: {
				colors: puzzle.colors,
				numbers: puzzle.numbers,
				solution: puzzle.solution,
				difficulty: puzzle.difficulty as 'easy' | 'medium' | 'hard',
			},
			tutorialCompleted,
		}

		return c.json(gameState)
	} catch (error) {
		console.error('Error fetching game state:', error)
		return c.json({ error: 'Failed to fetch game state' }, 500)
	}
})

// ─── POST /api/game/next-challenge ───────────────────────────────────────────

gameRouter.post('/api/game/next-challenge', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const newPuzzle = generatePuzzle('easy')

		await redis.hSet(`user:${userId}:game:${postId}:currentPuzzle`, {
			colors: newPuzzle.colors,
			numbers: newPuzzle.numbers,
			solution: newPuzzle.solution,
			difficulty: newPuzzle.difficulty,
		})

		const response: NextChallengeResponse = {
			puzzle: newPuzzle,
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
