import { context, reddit, redis } from '@devvit/web/server'
import { generatePuzzle } from './lib/generator'

export const URJO_POST_TYPE_KEY = 'postType'
export const URJO_PUZZLE_POST_TYPE = 'urjo-puzzle'

export const DEFAULT_STICKY_COMMENT = `Share your victory here.

When you finish the puzzle, use **Comment Your Victory** in the game to reply with your score.`

type CreatePostOptions = {
	stickyCommentText?: string
}

export const createStickyComment = async (
	postId: string,
	text = DEFAULT_STICKY_COMMENT,
): Promise<string> => {
	const stickyComment = await reddit.submitComment({
		id: postId as `t3_${string}`,
		text,
	})

	await redis.hSet(`game:${postId}:meta`, {
		stickyCommentId: stickyComment.id,
	})

	return stickyComment.id
}

export const createPost = async (
	customTitle?: string,
	ctxOverride?: any,
	options: CreatePostOptions = {},
): Promise<{ id: string }> => {
	const currentContext = ctxOverride || context
	const { subredditName } = currentContext
	if (!subredditName) {
		throw new Error('subredditName is required')
	}

	// Generate puzzle with easy 4x4 difficulty for shared post puzzle
	// Individual users get adaptive difficulty via their own puzzle override
	const puzzle = generatePuzzle('easy', 4)

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

	await createStickyComment(post.id, options.stickyCommentText)

	// Increment global stats
	await redis.incrBy('stats:totalGames', 1)

	return post
}
