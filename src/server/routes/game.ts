/**
 * Game API Routes
 * Handles game state and user moves
 */

import { Hono } from 'hono'
import { context, redis } from '@devvit/web/server'
import type { GameState, MoveRequest, MoveResponse } from '../../shared/types'

export const gameRouter = new Hono()

/**
 * GET /api/game/state
 * Returns the current game state and user progress
 */
gameRouter.get('/api/game/state', async (c) => {
	const { postId, userId } = context

	if (!postId) {
		return c.json({ error: 'Post ID is required' }, 400)
	}

	if (!userId) {
		return c.json({ error: 'User ID is required' }, 400)
	}

	try {
		// Fetch game puzzle
		const puzzle = await redis.hGetAll(`game:${postId}:puzzle`)

		if (!puzzle || !puzzle.colors) {
			return c.json({ error: 'Game not found' }, 404)
		}

		// Fetch user progress (if exists)
		const userProgress = await redis.hGetAll(`user:${userId}:game:${postId}`)

		const gameState: GameState = {
			puzzle: {
				colors: puzzle.colors,
				numbers: puzzle.numbers,
				solution: puzzle.solution,
				difficulty: puzzle.difficulty as 'easy' | 'medium' | 'hard',
			},
			userBoard: userProgress.board || puzzle.colors,
			isCompleted: userProgress.completed === 'true',
		}

		return c.json(gameState)
	} catch (error) {
		console.error('Error fetching game state:', error)
		return c.json({ error: 'Failed to fetch game state' }, 500)
	}
})

/**
 * POST /api/game/move
 * Updates the user's board with a new move
 */
gameRouter.post('/api/game/move', async (c) => {
	const { postId, userId } = context

	if (!postId) {
		return c.json({ error: 'Post ID is required' }, 400)
	}

	if (!userId) {
		return c.json({ error: 'User ID is required' }, 400)
	}

	try {
		const body = (await c.req.json()) as MoveRequest
		const { row, col, color } = body

		// Validate input
		if (row < 0 || row >= 4 || col < 0 || col >= 4) {
			return c.json({ error: 'Invalid row or column' }, 400)
		}

		// Get current user board
		const userProgress = await redis.hGetAll(`user:${userId}:game:${postId}`)
		let board = userProgress.board

		// If no existing board, get initial puzzle state
		if (!board) {
			const puzzle = await redis.hGet(`game:${postId}:puzzle`, 'colors')
			if (!puzzle) {
				return c.json({ error: 'Game not found' }, 404)
			}
			board = puzzle
		}

		// Update cell
		const boardArray = board.split('')
		const index = row * 4 + col
		boardArray[index] = color === 'red' ? 'r' : color === 'blue' ? 'b' : '.'
		const newBoard = boardArray.join('')

		// Check if puzzle is complete
		const solution = await redis.hGet(`game:${postId}:puzzle`, 'solution')
		const isComplete = newBoard === solution

		// Check if this is a new completion
		const wasCompleted = userProgress.completed === 'true'
		const isNewCompletion = isComplete && !wasCompleted

		// Save to Redis
		await redis.hSet(`user:${userId}:game:${postId}`, {
			board: newBoard,
			completed: isComplete ? 'true' : 'false',
			completedAt: isComplete ? new Date().toISOString() : userProgress.completedAt || '',
		})

		// Increment global stats if this is a new completion
		if (isNewCompletion) {
			await redis.incrBy('stats:totalSolves', 1)
		}

		const response: MoveResponse = {
			success: true,
			isComplete,
			board: newBoard,
		}

		return c.json(response)
	} catch (error) {
		console.error('Error processing move:', error)
		return c.json({ error: 'Failed to process move' }, 500)
	}
})
