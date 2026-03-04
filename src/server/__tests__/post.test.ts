import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis, reddit } from '@devvit/web/server'
import { expect, vi } from 'vitest'
import { createPost } from '../post'

// vi.hoisted runs before module imports, so this flag is available in vi.mock factory
const contextOverrides = vi.hoisted(() => ({ subredditName: 'testsub' as string | undefined }))

vi.mock('@devvit/web/server', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@devvit/web/server')>()
	return {
		...actual,
		get context() {
			return new Proxy(actual.context, {
				get: (_target, prop) => {
					if (prop === 'subredditName') return contextOverrides.subredditName
					return Reflect.get(actual.context, prop)
				},
			})
		},
	}
})

// ─── createPost — happy path ──────────────────────────────────────────────────

const test = createDevvitTest({
	userId: 't2_testuser',
	subredditName: 'testsub',
})

test('createPost creates a Reddit post and stores puzzle in Redis', async () => {
	contextOverrides.subredditName = 'testsub'
	vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue({ id: 't3_abc123' } as never)

	await createPost()

	expect(reddit.submitCustomPost).toHaveBeenCalledWith({
		subredditName: 'testsub',
		title: 'Urjo Puzzle - Can you solve it?',
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
	subredditName: 'testsub',
})

testNoSubreddit('createPost throws when subredditName is missing', async () => {
	contextOverrides.subredditName = undefined

	await expect(createPost()).rejects.toThrow('subredditName is required')
})
