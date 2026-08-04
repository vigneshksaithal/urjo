import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import {
	createPost,
	getPublicPostPuzzleConfig,
	URJO_PUZZLE_POST_TYPE,
	URJO_POST_TYPE_KEY,
} from '../post'

// ─── createPost — happy path ──────────────────────────────────────────────────

const test = createDevvitTest({
	userId: 't2_testuser',
	subredditName: 'testsub',
})

test('createPost creates a Reddit post and stores puzzle in Redis', async () => {
	const distinguishSticky = vi.fn().mockResolvedValue(undefined)
	vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_abc123' } as never)
	vi.spyOn(reddit, 'submitComment').mockResolvedValue({
		id: 't1_sticky123',
		distinguish: distinguishSticky,
	} as never)

	await createPost()

	expect(reddit.submitCustomPost).toHaveBeenCalledWith({
		subredditName: 'testsub',
		title: 'Urjo Puzzle - Can you solve it?',
		textFallback: {
			text: expect.stringContaining('Open this post to play'),
		},
		postData: expect.objectContaining({
			[URJO_POST_TYPE_KEY]: URJO_PUZZLE_POST_TYPE,
		}),
	})

	const puzzle = await redis.hGetAll('game:t3_abc123:puzzle')
	expect(puzzle.colors).toBeDefined()
	expect(puzzle.solution).toBeDefined()
	expect(['easy', 'medium']).toContain(puzzle.difficulty)
	expect(['4', '6', '8']).toContain(puzzle.gridSize)

	expect(reddit.submitComment).toHaveBeenCalledWith({
		id: 't3_abc123',
		text: expect.stringContaining('Share your victory'),
	})
	expect(distinguishSticky).toHaveBeenCalledWith(true)

	const meta = await redis.hGetAll('game:t3_abc123:meta')
	expect(meta[URJO_POST_TYPE_KEY]).toBe(URJO_PUZZLE_POST_TYPE)
	expect(meta.stickyCommentId).toBe('t1_sticky123')
})

test('createPost stores immutable scheduled-post dimensions', async () => {
	vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_scheduled' } as never)
	vi.spyOn(reddit, 'submitComment').mockResolvedValue({
		id: 't1_scheduled',
		distinguish: vi.fn().mockResolvedValue(undefined),
	} as never)

	await createPost('Urjo 8x8 Puzzle #42', undefined, {
		gridSize: 8,
		lockGridSize: true,
		scheduledSlotKey: '8x8-2000',
		scheduledDate: '2026-07-15',
		puzzleNumber: 42,
	})

	const puzzle = await redis.hGetAll('game:t3_scheduled:puzzle')
	const meta = await redis.hGetAll('game:t3_scheduled:meta')
	for (const stored of [puzzle, meta]) {
		expect(stored.scheduledSlotKey).toBe('8x8-2000')
		expect(stored.scheduledDate).toBe('2026-07-15')
		expect(stored.scheduledGridSize).toBe('8')
		expect(stored.puzzleNumber).toBe('42')
	}
})

// ─── createPost — missing subredditName ──────────────────────────────────────

const testNoSubreddit = createDevvitTest({
	userId: 't2_testuser',
})

testNoSubreddit('createPost throws when subredditName is missing', async () => {
	await expect(createPost(undefined, { subredditName: undefined })).rejects.toThrow('subredditName is required')
})

test('getPublicPostPuzzleConfig rotates through the authored weekly grid-size loop', () => {
	const start = new Date('2026-07-06T00:00:00.000Z')
	const week = Array.from({ length: 7 }, (_, index) => {
		const date = new Date(start)
		date.setUTCDate(start.getUTCDate() + index)
		return getPublicPostPuzzleConfig(date)
	})

	expect(week.map((entry) => entry.gridSize)).toEqual([6, 6, 8, 6, 4, 8, 6])
	expect(week.every((entry) => entry.difficulty === 'easy' || entry.difficulty === 'medium')).toBe(true)
})
