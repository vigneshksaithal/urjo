import { describe, expect, it, vi } from 'vitest'

import {
    loadOwnedChallenges,
    removeOwnedChallenge,
} from '../challenge-management'

const successResponse = (data: unknown): Response => new Response(JSON.stringify({
    status: 'success',
    data,
}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
})

describe('challenge management client', () => {
    it('loads validated owned challenge records', async () => {
        const fetcher = vi.fn().mockResolvedValue(successResponse({ challenges: [{
            postId: 't3_owned',
            postUrl: 'https://reddit.com/comments/owned',
            createdAt: '2026-07-15T10:00:00.000Z',
            gridSize: 6,
            targetTime: 42,
            kind: 'level',
        }] }))

        await expect(loadOwnedChallenges(fetcher)).resolves.toEqual([{
            postId: 't3_owned',
            postUrl: 'https://reddit.com/comments/owned',
            createdAt: '2026-07-15T10:00:00.000Z',
            gridSize: 6,
            targetTime: 42,
            kind: 'level',
        }])
        expect(fetcher).toHaveBeenCalledWith('/api/challenges/mine')
    })

    it('rejects malformed challenge records', async () => {
        const fetcher = vi.fn().mockResolvedValue(successResponse({
            challenges: [{ postId: 't3_owned', postUrl: 'javascript:alert(1)' }],
        }))

        await expect(loadOwnedChallenges(fetcher)).rejects.toThrow(
            'Rival post data is unavailable',
        )
    })

    it('removes a challenge through the explicit DELETE endpoint', async () => {
        const fetcher = vi.fn().mockResolvedValue(successResponse({
            postId: 't3_owned',
            state: 'removed',
            alreadyRemoved: false,
        }))

        await expect(removeOwnedChallenge('t3_owned', fetcher)).resolves.toEqual({
            postId: 't3_owned',
            alreadyRemoved: false,
        })
        expect(fetcher).toHaveBeenCalledWith('/api/challenges/t3_owned', { method: 'DELETE' })
    })

    it('surfaces the native post URL when Reddit removal fails', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            status: 'error',
            message: 'Reddit could not remove this rival post.',
            postUrl: 'https://reddit.com/comments/owned',
        }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
        }))

        await expect(removeOwnedChallenge('t3_owned', fetcher)).rejects.toMatchObject({
            message: 'Reddit could not remove this rival post.',
            postUrl: 'https://reddit.com/comments/owned',
        })
    })
})
