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
		postData: expect.objectContaining({
			[URJO_POST_TYPE_KEY]: URJO_PUZZLE_POST_TYPE,
			previewIsChallenge: false,
			previewGridSize: 4,
		}),
	})

	const puzzle = await redis.hGetAll('game:t3_abc123:puzzle')
	expect(puzzle.colors).toBeDefined()
	expect(puzzle.solution).toBeDefined()
	expect(puzzle.difficulty).toBe('easy')
	expect(puzzle.gridSize).toBe('4')
})

test('createPost includes previewColors matching the generated puzzle', async () => {
	vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_preview' } as never)

	await createPost()

	const call = vi.mocked(reddit.submitCustomPost).mock.calls[0]
	const passedPostData = (call?.[0] as { postData?: Record<string, unknown> })?.postData
	expect(typeof passedPostData?.['previewColors']).toBe('string')
	const colors = passedPostData?.['previewColors'] as string
	expect(colors.length).toBe(16) // 4×4 grid
})

// ─── createPost — missing subredditName ──────────────────────────────────────

const testNoSubreddit = createDevvitTest({
	userId: 't2_testuser',
})

testNoSubreddit('createPost throws when subredditName is missing', async () => {
	await expect(createPost(undefined, { subredditName: undefined })).rejects.toThrow('subredditName is required')
})
