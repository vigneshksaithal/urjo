import { context, reddit, redis } from '@devvit/web/server'
import { generatePuzzle } from './lib/generator'

export const createPost = async (customTitle?: string): Promise<{ id: string }> => {
	const { subredditName } = context
	if (!subredditName) {
		throw new Error('subredditName is required')
	}

	// Generate puzzle with easy difficulty for shared post puzzle
	const puzzle = generatePuzzle('easy')

	// Create post with custom title or default
	const title = customTitle || 'Urjo Puzzle - Can you solve it?'
	const post = await reddit.submitCustomPost({
		subredditName,
		title,
	})

	// Save puzzle to Redis
	await redis.hSet(`game:${post.id}:puzzle`, {
		colors: puzzle.colors,
		numbers: puzzle.numbers,
		solution: puzzle.solution,
		difficulty: puzzle.difficulty,
		created: new Date().toISOString(),
	})

	// Increment global stats
	await redis.incrBy('stats:totalGames', 1)

	return post
}
