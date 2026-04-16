import { context, reddit, redis } from '@devvit/web/server'
import { generatePuzzle } from './lib/generator'

export const URJO_POST_TYPE_KEY = 'postType'
export const URJO_PUZZLE_POST_TYPE = 'urjo-puzzle'

export type PostGridConfig = {
	gridSize: 4 | 6
	difficulty: 'easy' | 'medium' | 'hard'
}

/**
 * Determine grid config based on UTC hour.
 * 13:00 UTC (9AM ET)  → 4x4 easy   (morning warm-up)
 * 18:00 UTC (2PM ET)  → 6x6 medium (afternoon challenge)
 * 23:00 UTC (7PM ET)  → 6x6 hard   (peak evening)
 * Default             → 4x4 easy
 */
export const getGridConfigForHour = (utcHour: number): PostGridConfig => {
	if (utcHour === 18) return { gridSize: 6, difficulty: 'medium' }
	if (utcHour === 23) return { gridSize: 6, difficulty: 'hard' }
	return { gridSize: 4, difficulty: 'easy' }
}

export const createPost = async (customTitle?: string, ctxOverride?: any, gridConfig?: PostGridConfig): Promise<{ id: string }> => {
	const currentContext = ctxOverride || context
	const { subredditName } = currentContext
	if (!subredditName) {
		throw new Error('subredditName is required')
	}

	// Use provided grid config or default to 4x4 easy
	const config = gridConfig ?? { gridSize: 4 as const, difficulty: 'easy' as const }
	const puzzle = generatePuzzle(config.difficulty, config.gridSize)

	// Create post with custom title or default
	const title = customTitle || 'Urjo Puzzle - Can you solve it?'
	const post = await reddit.submitCustomPost({
		subredditName,
		title,
		postData: {
			[URJO_POST_TYPE_KEY]: URJO_PUZZLE_POST_TYPE,
		},
	})

	// Save puzzle to Redis
	await redis.hSet(`game:${post.id}:puzzle`, {
		colors: puzzle.colors,
		numbers: puzzle.numbers,
		solution: puzzle.solution,
		difficulty: puzzle.difficulty,
		gridSize: puzzle.gridSize.toString(),
		created: new Date().toISOString(),
	})

	await redis.hSet(`game:${post.id}:meta`, {
		[URJO_POST_TYPE_KEY]: URJO_PUZZLE_POST_TYPE,
	})

	// Increment global stats
	await redis.incrBy('stats:totalGames', 1)

	return post
}
