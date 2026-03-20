/**
 * UGC Builder API Routes
 * Handles user-created puzzle validation, publishing, and community browsing
 */

import { Hono } from 'hono'
import { context, redis, reddit } from '@devvit/web/server'
import type {
	BuilderValidateRequest,
	BuilderValidateResponse,
	BuilderPublishRequest,
	BuilderPublishResponse,
	CommunityPuzzlesResponse,
	PlayCommunityResponse,
	UGCPuzzle,
} from '../../shared/types'
import { countSolutions, deserializeGrid } from '../lib/generator'

export const builderRouter = new Hono()

// ─── POST /api/builder/validate ──────────────────────────────────────────────

/**
 * Validate a user-built puzzle — check it has a unique solution.
 */
builderRouter.post('/api/builder/validate', async (c) => {
	const { userId } = context

	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const body: BuilderValidateRequest = await c.req.json()
		const { colors, numbers, solution, gridSize } = body

		if (!colors || !numbers || !solution || !gridSize) {
			return c.json<BuilderValidateResponse>({
				valid: false,
				solutionCount: 0,
				error: 'Missing required fields',
			})
		}

		const parsedSize = Number(gridSize) as 4 | 6
		if (parsedSize !== 4 && parsedSize !== 6) {
			return c.json<BuilderValidateResponse>({
				valid: false,
				solutionCount: 0,
				error: 'Invalid grid size — must be 4 or 6',
			})
		}

		const expectedLen = parsedSize * parsedSize
		if (colors.length !== expectedLen || numbers.length !== expectedLen || solution.length !== expectedLen) {
			return c.json<BuilderValidateResponse>({
				valid: false,
				solutionCount: 0,
				error: 'Grid data length mismatch',
			})
		}

		// Deserialize the puzzle grid with locked cells (puzzle state, not solution)
		const puzzleGrid = deserializeGrid(solution, numbers, parsedSize, colors)

		const solutionCount = countSolutions(puzzleGrid, parsedSize, 2)

		const validateResp: BuilderValidateResponse = { valid: solutionCount === 1, solutionCount }
		if (solutionCount === 0) validateResp.error = 'Puzzle has no solution — check your clues'
		else if (solutionCount > 1) validateResp.error = 'Puzzle has multiple solutions — add more clues'
		return c.json(validateResp)
	} catch (error) {
		console.error('Builder validate error:', error)
		return c.json<BuilderValidateResponse>({
			valid: false,
			solutionCount: 0,
			error: 'Validation failed',
		})
	}
})

// ─── POST /api/builder/publish ───────────────────────────────────────────────

/**
 * Publish a validated user puzzle — store in Redis and post to subreddit.
 */
builderRouter.post('/api/builder/publish', async (c) => {
	const { userId } = context

	if (!userId) return c.json({ error: 'User ID is required' }, 400)

	try {
		const body: BuilderPublishRequest = await c.req.json()
		const { colors, numbers, solution, gridSize, title } = body

		if (!colors || !numbers || !solution || !gridSize || !title?.trim()) {
			return c.json<BuilderPublishResponse>({
				success: false,
				error: 'Missing required fields',
			})
		}

		const parsedSize = Number(gridSize) as 4 | 6
		if (parsedSize !== 4 && parsedSize !== 6) {
			return c.json<BuilderPublishResponse>({
				success: false,
				error: 'Invalid grid size',
			})
		}

		// Validate unique solution before accepting publish
		const puzzleGrid = deserializeGrid(solution, numbers, parsedSize, colors)
		const solutionCount = countSolutions(puzzleGrid, parsedSize, 2)
		if (solutionCount !== 1) {
			return c.json<BuilderPublishResponse>({
				success: false,
				error: solutionCount === 0 ? 'Puzzle has no solution' : 'Puzzle has multiple solutions',
			})
		}

		// Fetch author username
		let authorName = 'Anonymous'
		try {
			const user = await reddit.getUserById(userId as `t2_${string}`)
			authorName = user?.username ?? 'Anonymous'
		} catch {
			// Non-critical — use fallback
		}

		// Generate unique puzzle ID
		const puzzleId = `ugc:${userId}:${Date.now()}`
		const now = Date.now()

		const puzzle: UGCPuzzle = {
			id: puzzleId,
			authorId: userId,
			authorName,
			colors,
			numbers,
			solution,
			gridSize: parsedSize,
			title: title.trim().slice(0, 80),
			createdAt: now,
			solveCount: 0,
			upvotes: 0,
		}
		// postId assigned below after Reddit post

		// Store puzzle in Redis
		await redis.hSet(`ugc:puzzle:${puzzleId}`, {
			id: puzzleId,
			authorId: userId,
			authorName,
			colors,
			numbers,
			solution,
			gridSize: parsedSize.toString(),
			title: puzzle.title,
			createdAt: now.toString(),
			solveCount: '0',
			upvotes: '0',
		})

		// Add to community index (sorted by creation time)
		await redis.zAdd('ugc:puzzles:recent', { score: now, member: puzzleId })
		await redis.zAdd(`ugc:puzzles:by:${userId}`, { score: now, member: puzzleId })

		// Post to subreddit
		let postId: string | undefined
		try {
			const post = await reddit.submitPost({
				subredditName: context.subredditName ?? 'urjo',
				title: `🎨 Community Puzzle: ${puzzle.title} by u/${authorName}`,
				richtext: {
					document: [
						{
							e: 'par',
							c: [
								{ e: 'text', t: `u/${authorName} created a new community puzzle: **${puzzle.title}**` },
							],
						},
						{
							e: 'par',
							c: [
								{ e: 'text', t: `Grid: ${parsedSize}×${parsedSize} | Can you solve it? Play inside the app! 🧩` },
							],
						},
					],
				},
			})
			postId = post.id

			// Link post back to puzzle
			await redis.hSet(`ugc:puzzle:${puzzleId}`, { postId: post.id })

			// Add coin reward for publishing
			const economyKey = `user:${userId}:economy`
			const economyData = await redis.hGetAll(economyKey)
			const currentCoins = parseInt(economyData?.coins ?? '0', 10)
			await redis.hSet(economyKey, { coins: (currentCoins + 20).toString() })
		} catch (postError) {
			console.error('Failed to post to subreddit (non-critical):', postError)
			// Continue — puzzle is saved even if Reddit post fails
		}

		const publishResp: BuilderPublishResponse = { success: true, puzzleId }
		if (postId) publishResp.postId = postId
		return c.json(publishResp)
	} catch (error) {
		console.error('Builder publish error:', error)
		return c.json<BuilderPublishResponse>({
			success: false,
			error: 'Failed to publish puzzle',
		})
	}
})

// ─── GET /api/builder/community ─────────────────────────────────────────────

/**
 * Fetch recent community-created puzzles.
 */
builderRouter.get('/api/builder/community', async (c) => {
	try {
		const limitParam = c.req.query('limit')
		const offsetParam = c.req.query('offset')
		const limit = Math.min(parseInt(limitParam ?? '20', 10), 50)
		const offset = parseInt(offsetParam ?? '0', 10)

		const total = await redis.zCard('ugc:puzzles:recent')
		const members = await redis.zRange('ugc:puzzles:recent', offset, offset + limit - 1, {
			reverse: true,
			by: 'rank',
		})

		const puzzles: UGCPuzzle[] = []
		for (const item of members) {
			const puzzleId = item.member
			try {
				const data = await redis.hGetAll(`ugc:puzzle:${puzzleId}`)
				if (!data || !data.colors) continue
				const entry: UGCPuzzle = {
					id: data.id ?? puzzleId,
					authorId: data.authorId ?? '',
					authorName: data.authorName ?? 'Anonymous',
					colors: data.colors,
					numbers: data.numbers ?? '',
					solution: data.solution ?? '',
					gridSize: parseInt(data.gridSize ?? '4', 10),
					title: data.title ?? 'Untitled',
					createdAt: parseInt(data.createdAt ?? '0', 10),
					solveCount: parseInt(data.solveCount ?? '0', 10),
					upvotes: parseInt(data.upvotes ?? '0', 10),
				}
				if (data.postId) entry.postId = data.postId
				puzzles.push(entry)
			} catch {
				// Skip broken entries
			}
		}

		const response: CommunityPuzzlesResponse = { puzzles, total }
		return c.json(response)
	} catch (error) {
		console.error('Community puzzles error:', error)
		return c.json({ error: 'Failed to fetch community puzzles' }, 500)
	}
})

// ─── GET /api/builder/puzzle/:id ─────────────────────────────────────────────

/**
 * Fetch a single community puzzle by ID.
 */
builderRouter.get('/api/builder/puzzle/:id', async (c) => {
	const puzzleId = c.req.param('id')
	if (!puzzleId) return c.json({ error: 'Puzzle ID required' }, 400)

	try {
		const data = await redis.hGetAll(`ugc:puzzle:${puzzleId}`)
		if (!data || !data.colors) return c.json({ error: 'Puzzle not found' }, 404)

		const puzzle: UGCPuzzle = {
			id: data.id ?? puzzleId,
			authorId: data.authorId ?? '',
			authorName: data.authorName ?? 'Anonymous',
			colors: data.colors,
			numbers: data.numbers ?? '',
			solution: data.solution ?? '',
			gridSize: parseInt(data.gridSize ?? '4', 10),
			title: data.title ?? 'Untitled',
			createdAt: parseInt(data.createdAt ?? '0', 10),
			solveCount: parseInt(data.solveCount ?? '0', 10),
			upvotes: parseInt(data.upvotes ?? '0', 10),
		}
		if (data.postId) puzzle.postId = data.postId

		const response: PlayCommunityResponse = { puzzle }
		return c.json(response)
	} catch (error) {
		console.error('Fetch puzzle error:', error)
		return c.json({ error: 'Failed to fetch puzzle' }, 500)
	}
})

// ─── POST /api/builder/puzzle/:id/solve ─────────────────────────────────────

/**
 * Record a solve of a community puzzle.
 */
builderRouter.post('/api/builder/puzzle/:id/solve', async (c) => {
	const { userId } = context
	const puzzleId = c.req.param('id')

	if (!userId) return c.json({ error: 'User ID required' }, 400)
	if (!puzzleId) return c.json({ error: 'Puzzle ID required' }, 400)

	try {
		// Prevent double-counting
		const solvedKey = `user:${userId}:ugc:solved:${puzzleId}`
		const alreadySolved = await redis.get(solvedKey)
		if (!alreadySolved) {
			await Promise.all([
				redis.hIncrBy(`ugc:puzzle:${puzzleId}`, 'solveCount', 1),
				redis.set(solvedKey, '1'),
				// Small coin reward for solving community puzzles
				(async () => {
					const economyKey = `user:${userId}:economy`
					const economyData = await redis.hGetAll(economyKey)
					const currentCoins = parseInt(economyData?.coins ?? '0', 10)
					await redis.hSet(economyKey, { coins: (currentCoins + 5).toString() })
				})(),
			])
		}
		return c.json({ success: true })
	} catch (error) {
		console.error('Solve record error:', error)
		return c.json({ error: 'Failed to record solve' }, 500)
	}
})
