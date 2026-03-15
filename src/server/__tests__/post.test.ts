import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { createPost, URJO_PUZZLE_POST_TYPE, URJO_POST_TYPE_KEY } from '../post'

// ─── createPost — happy path ──────────────────────────────────────────────────

const test = createDevvitTest({
	userId: 't2_testuser',
	subredditName: 'testsub',
})

test('createPost creates a Reddit post and stores puzzle in Redis', async () => {
	vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_abc123' } as never)

	await createPost()

	expect(reddit.submitCustomPost).toHaveBeenCalledWith({
		subredditName: 'testsub',
		title: 'Urjo Puzzle - Can you solve it?',
		postData: {
			[URJO_POST_TYPE_KEY]: URJO_PUZZLE_POST_TYPE,
		},
	})

	const puzzle = await redis.hGetAll('game:t3_abc123:puzzle')
	expect(puzzle.colors).toBeDefined()
	expect(puzzle.solution).toBeDefined()
	expect(puzzle.difficulty).toBe('easy')
	expect(puzzle.gridSize).toBe('4')
})

// ─── createPost — missing subredditName ──────────────────────────────────────

const testNoSubreddit = createDevvitTest({
	userId: 't2_testuser',
})

testNoSubreddit('createPost throws when subredditName is missing', async () => {
	await expect(createPost(undefined, { subredditName: undefined })).rejects.toThrow('subredditName is required')
})
