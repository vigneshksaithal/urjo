import { describe, expect, it, vi } from 'vitest'

import {
    claimDailyMission,
    getProgressPercent,
    loadProgression,
} from '../progression'

const SNAPSHOT = {
    date: '2026-07-15',
    coins: 42,
    streak: { current: 4, longest: 9, freezes: 1 },
    path: { level: 12, gridLevels: { 4: 3, 6: 2, 8: 1 } },
    season: { number: 29, rank: 7, points: 310, endDate: '2026-07-19' },
    missions: [
        {
            id: 'daily_solve_3',
            label: 'Solve 3 puzzles today',
            progress: 2,
            target: 3,
            rewardCoins: 15,
            completed: false,
            claimed: false,
        },
    ],
    nextGoal: {
        label: 'Solve 3 puzzles today',
        progress: 2,
        target: 3,
    },
} as const

describe('progression client adapter', () => {
    it('loads a typed progression snapshot', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            status: 'success',
            data: SNAPSHOT,
        })))

        await expect(loadProgression(fetcher)).resolves.toEqual(SNAPSHOT)
        expect(fetcher).toHaveBeenCalledWith('/api/progression')
    })

    it('surfaces the server error message', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            status: 'error',
            message: 'Sign in to track progress',
        }), { status: 400 }))

        await expect(loadProgression(fetcher)).rejects.toThrow('Sign in to track progress')
    })

    it('claims a mission through an explicit JSON request', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            status: 'success',
            data: { snapshot: SNAPSHOT, rewardCoins: 15, alreadyClaimed: false },
        })))

        const result = await claimDailyMission('daily_solve_3', fetcher)

        expect(result.rewardCoins).toBe(15)
        expect(fetcher).toHaveBeenCalledWith('/api/progression/claim-mission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ missionId: 'daily_solve_3' }),
        })
    })
})

describe('getProgressPercent', () => {
    it.each([
        { progress: -1, target: 3, expected: 0 },
        { progress: 2, target: 3, expected: 67 },
        { progress: 9, target: 3, expected: 100 },
        { progress: 1, target: 0, expected: 0 },
    ])('returns $expected for $progress of $target', ({ progress, target, expected }) => {
        expect(getProgressPercent(progress, target)).toBe(expected)
    })
})
