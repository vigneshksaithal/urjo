import { describe, expect, it } from 'vitest'

import {
    URJO_BLITZ_CHANNEL,
    getUrjoBlitzEventId,
    getUrjoBlitzPoints,
} from '../urjo-blitz'

describe('Urjo Blitz shared rules', () => {
    it('uses the ISO week-year across a calendar-year boundary', () => {
        expect(getUrjoBlitzEventId(new Date('2025-12-29T18:00:00.000Z'))).toBe('2026-W01')
    })

    it('weights the larger requested boards more heavily', () => {
        expect([4, 6, 8].map((gridSize) => getUrjoBlitzPoints(gridSize))).toEqual([1, 2, 3])
    })

    it('uses a stable Devvit Realtime channel name', () => {
        expect(URJO_BLITZ_CHANNEL).toBe('urjo_blitz_live')
        expect(URJO_BLITZ_CHANNEL).toMatch(/^[A-Za-z0-9_]+$/)
    })

    it('rejects unsupported board sizes', () => {
        expect(() => getUrjoBlitzPoints(5)).toThrow('Unsupported Urjo Blitz grid size')
    })
})
