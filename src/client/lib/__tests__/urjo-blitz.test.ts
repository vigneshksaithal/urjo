import { describe, expect, it, vi } from 'vitest'

import {
    formatBlitzRemaining,
    joinUrjoBlitz,
    loadUrjoBlitz,
} from '../urjo-blitz'

const STATE = {
    event: {
        eventId: '2026-W29',
        status: 'active',
        startAt: '2026-07-17T18:00:00.000Z',
        endAt: '2026-07-19T18:00:00.000Z',
        updatedAt: '2026-07-17T18:00:00.000Z',
        participantCount: 12,
        completionCount: 30,
    },
    leaderboard: [{ rank: 1, username: 'Alice', score: 9 }],
    viewer: { joined: true, rank: 4, score: 5 },
} as const

describe('Urjo Blitz client adapter', () => {
    it('loads and validates the public event state', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            status: 'success',
            data: STATE,
        })))

        await expect(loadUrjoBlitz(fetcher)).resolves.toEqual(STATE)
        expect(fetcher).toHaveBeenCalledWith('/api/urjo-blitz')
    })

    it('rejects malformed leaderboard identity data', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            status: 'success',
            data: { ...STATE, leaderboard: [{ rank: 1, userId: 't2_secret', score: 9 }] },
        })))

        await expect(loadUrjoBlitz(fetcher)).rejects.toThrow('Urjo Blitz is unavailable')
    })

    it('joins only through an explicit POST and returns refreshed state', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'success', data: {} })))
            .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'success', data: STATE })))

        await expect(joinUrjoBlitz(fetcher)).resolves.toEqual(STATE)
        expect(fetcher).toHaveBeenNthCalledWith(1, '/api/urjo-blitz/join', { method: 'POST' })
        expect(fetcher).toHaveBeenNthCalledWith(2, '/api/urjo-blitz')
    })

    it('surfaces a server join error without pretending the user joined', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            status: 'error',
            message: 'Urjo Blitz is not active',
        }), { status: 409 }))

        await expect(joinUrjoBlitz(fetcher)).rejects.toThrow('Urjo Blitz is not active')
    })
})

describe('formatBlitzRemaining', () => {
    it.each([
        { endAt: '2026-07-19T18:00:00.000Z', now: Date.parse('2026-07-17T18:00:00.000Z'), expected: '48h 00m' },
        { endAt: '2026-07-19T18:00:00.000Z', now: Date.parse('2026-07-19T17:58:30.000Z'), expected: '1m 30s' },
        { endAt: '2026-07-19T18:00:00.000Z', now: Date.parse('2026-07-19T18:00:00.000Z'), expected: 'Ended' },
        { endAt: 'bad-date', now: 0, expected: 'Ended' },
    ])('formats $expected at the boundary', ({ endAt, now, expected }) => {
        expect(formatBlitzRemaining(endAt, now)).toBe(expected)
    })
})
