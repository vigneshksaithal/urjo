/**
 * Game API Routes
 * Handles game state, user moves, restart, and next challenge
 */

import { Hono } from 'hono'
import { context, redis } from '@devvit/web/server'
import type {
	GameState,
	MoveRequest,
	MoveResponse,
	NextChallengeResponse,
	RestartResponse,
} from '../../shared/types'
import {
	deserializeGrid,
	isBalanced,
	hasAdjacentIdenticalRows,
	hasAdjacentIdenticalColumns,
	numberConstraintsSatisfied,
	generatePuzzle,
} from '../lib/generator'

export const gameRouter = new Hono()

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determine puzzle difficulty based on user's total solve count.
 */
function getDifficulty(solveCount: number): 'easy' | 'medium' | 'hard' {
	if (solveCount < 3) return 'easy'
	if (solveCount < 7) return 'medium'
	return 'hard'
}

/**
 * Validate that a completed board follows all game rules.
 */
function validateSolution(
	board: string,
	numbers: string,
	puzzleColors: string
): { valid: boolean; error?: string } {
	const grid = deserializeGrid(board, numbers, puzzleColors)

	if (!isBalanced(grid)) {
		return { valid: false, error: 'Each row and column must have 2 red and 2 blue spots' }
	}

	if (hasAdjacentIdenticalRows(grid)) {
		return { valid: false, error: 'Adjacent rows must be different' }
	}

	if (hasAdjacentIdenticalColumns(grid)) {
		return { valid: false, error: 'Adjacent columns must be different' }
	}

	if (!numberConstraintsSatisfied(grid)) {
		return { valid: false, error: 'Numbered spot constraints not satisfied' }
	}

	return { valid: true }
}

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

		// Get user progress
		const userProgress = await redis.hGetAll(`user:${userId}:game:${postId}`)

		// Get solve count
		const solveCountStr = await redis.get(`user:${userId}:solveCount`)
		const solveCount = solveCountStr ? parseInt(solveCountStr, 10) : 0

		// Get tutorial status
		const tutorialCompleted = (await redis.get(`user:${userId}:tutorialCompleted`)) === 'true'

		const gameState: GameState = {
			puzzle: {
				colors: puzzle.colors,
				numbers: puzzle.numbers,
				solution: puzzle.solution,
				difficulty: puzzle.difficulty as 'easy' | 'medium' | 'hard',
			},
			userBoard: userProgress.board ?? puzzle.colors,
			isCompleted: userProgress.completed === 'true',
			solveCount,
			tutorialCompleted,
		}

		return c.json(gameState)
	} catch (error) {
		console.error('Error fetching game state:', error)
		return c.json({ error: 'Failed to fetch game state' }, 500)
	}
})

// ─── POST /api/game/move ─────────────────────────────────────────────────────

gameRouter.post('/api/game/move', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const body = (await c.req.json()) as MoveRequest
		const { row, col, color } = body

		if (row < 0 || row >= 4 || col < 0 || col >= 4) {
			return c.json({ error: 'Invalid row or column' }, 400)
		}

		const puzzle = await getCurrentPuzzle(postId, userId)
		if (!puzzle) return c.json({ error: 'Game not found' }, 404)

		// Enforce locked cells
		const index = row * 4 + col
		if (puzzle.colors[index] !== '.') {
			return c.json({ error: 'Cannot modify a locked cell' }, 400)
		}

		// Get current user board
		const userProgress = await redis.hGetAll(`user:${userId}:game:${postId}`)
		const board = userProgress.board ?? puzzle.colors

		// Update cell
		const boardArray = board.split('')
		boardArray[index] = color === 'red' ? 'r' : color === 'blue' ? 'b' : '.'
		const newBoard = boardArray.join('')

		// Check completion
		const matchesSolution = newBoard === puzzle.solution
		const validation = validateSolution(newBoard, puzzle.numbers, puzzle.colors)
		const isComplete = matchesSolution && validation.valid

		const wasCompleted = userProgress.completed === 'true'
		const isNewCompletion = isComplete && !wasCompleted

		// Save user progress
		await redis.hSet(`user:${userId}:game:${postId}`, {
			board: newBoard,
			completed: isComplete ? 'true' : 'false',
			completedAt: isComplete ? new Date().toISOString() : userProgress.completedAt ?? '',
		})

		// Increment solve counts on new completion
		if (isNewCompletion) {
			await redis.incrBy('stats:totalSolves', 1)
			await redis.incrBy(`user:${userId}:solveCount`, 1)
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

// ─── POST /api/game/restart ──────────────────────────────────────────────────

gameRouter.post('/api/game/restart', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const puzzle = await getCurrentPuzzle(postId, userId)
		if (!puzzle) return c.json({ error: 'Game not found' }, 404)

		await redis.hSet(`user:${userId}:game:${postId}`, {
			board: puzzle.colors,
			completed: 'false',
			completedAt: '',
		})

		const response: RestartResponse = {
			userBoard: puzzle.colors,
		}

		return c.json(response)
	} catch (error) {
		console.error('Error restarting game:', error)
		return c.json({ error: 'Failed to restart game' }, 500)
	}
})

// ─── POST /api/game/next-challenge ───────────────────────────────────────────

gameRouter.post('/api/game/next-challenge', async (c) => {
	const { postId, userId } = context

	if (!postId) return c.json({ error: 'Post ID is required' }, 400)
	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const solveCountStr = await redis.get(`user:${userId}:solveCount`)
		const solveCount = solveCountStr ? parseInt(solveCountStr, 10) : 0
		const difficulty = getDifficulty(solveCount)

		const newPuzzle = generatePuzzle(difficulty)

		await redis.hSet(`user:${userId}:game:${postId}:currentPuzzle`, {
			colors: newPuzzle.colors,
			numbers: newPuzzle.numbers,
			solution: newPuzzle.solution,
			difficulty: newPuzzle.difficulty,
		})

		await redis.hSet(`user:${userId}:game:${postId}`, {
			board: newPuzzle.colors,
			completed: 'false',
			completedAt: '',
		})

		const response: NextChallengeResponse = {
			puzzle: newPuzzle,
			userBoard: newPuzzle.colors,
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
