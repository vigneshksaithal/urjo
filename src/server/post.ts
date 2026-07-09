import { context, reddit, redis } from '@devvit/web/server'
import type { Difficulty, GridSize } from '../shared/constants'
import { generatePuzzle } from './lib/generator'

export const URJO_POST_TYPE_KEY = 'postType'
export const URJO_PUZZLE_POST_TYPE = 'urjo-puzzle'

export const DEFAULT_STICKY_COMMENT = `Share your victory here.

When you finish the puzzle, use **Comment Your Victory** in the game to reply with your score.`

type CreatePostOptions = {
	stickyCommentText?: string
	gridSize?: GridSize
	lockGridSize?: boolean
}

const PUBLIC_POST_GRID_LOOP: readonly GridSize[] = [6, 6, 8, 6, 4, 8, 6] as const

const getPuzzleConfigForGridSize = (
	gridSize: GridSize,
): { gridSize: GridSize; difficulty: Extract<Difficulty, 'easy' | 'medium'> } => ({
	gridSize,
	difficulty: gridSize === 8 ? 'medium' : 'easy',
})

export const getPublicPostPuzzleConfig = (
	date: Date,
): { gridSize: GridSize; difficulty: Extract<Difficulty, 'easy' | 'medium'> } => {
	const dayIndex = (date.getUTCDay() + 6) % 7
	const gridSize = PUBLIC_POST_GRID_LOOP[dayIndex] ?? 6
	return getPuzzleConfigForGridSize(gridSize)
}

export const createStickyComment = async (
	postId: string,
	text = DEFAULT_STICKY_COMMENT,
): Promise<string> => {
	const stickyComment = await reddit.submitComment({
		id: postId as `t3_${string}`,
		text,
	})
	await stickyComment.distinguish(true)

	await redis.hSet(`game:${postId}:meta`, {
		stickyCommentId: stickyComment.id,
	})

	return stickyComment.id
}

export const createPost = async (
	customTitle?: string,
	ctxOverride?: any,
	options: CreatePostOptions = {},
): Promise<{ id: string; gridSize: GridSize }> => {
	const currentContext = ctxOverride || context
	const { subredditName } = currentContext
	if (!subredditName) {
		throw new Error('subredditName is required')
	}

	// Rotate the public post puzzle across the authored weekly loop so the
	// top-of-funnel experience is not permanently anchored to 4x4.
	const publicPostConfig = options.gridSize !== undefined
		? getPuzzleConfigForGridSize(options.gridSize)
		: getPublicPostPuzzleConfig(new Date())
	const puzzle = generatePuzzle(publicPostConfig.difficulty, publicPostConfig.gridSize)

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
		...(options.lockGridSize ? { lockedGridSize: puzzle.gridSize.toString() } : {}),
	})

	await redis.hSet(`game:${post.id}:meta`, {
		[URJO_POST_TYPE_KEY]: URJO_PUZZLE_POST_TYPE,
		...(options.lockGridSize ? { lockedGridSize: puzzle.gridSize.toString() } : {}),
	})

	await createStickyComment(post.id, options.stickyCommentText)

	// Increment global stats
	await redis.incrBy('stats:totalGames', 1)

	return {
		id: post.id,
		gridSize: puzzle.gridSize as GridSize,
	}
}
