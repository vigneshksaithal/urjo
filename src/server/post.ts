import { context, reddit, redis } from '@devvit/web/server'
import { generatePuzzle } from './lib/generator'

export const createPost = async () => {
	const { subredditName } = context
	if (!subredditName) {
		throw new Error('subredditName is required')
	}

	// Generate puzzle
	const puzzle = generatePuzzle('medium')

	// Create post
	const post = await reddit.submitCustomPost({
		subredditName,
		title: 'Urjo Puzzle - Can you solve it?',
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
