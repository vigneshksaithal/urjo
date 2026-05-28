/**
 * Tests for Custom Post Preview Builder
 */

import { describe, it, expect } from 'vitest'
import { buildChallengePreview, buildDailyPreview, buildChallengeBeatPreview } from '../preview'
import type { ChallengePreviewData, DailyPreviewData } from '../../../shared/race-types'
import type { ChallengeBeatPreviewData } from '../preview'

describe('buildChallengePreview', () => {
    const sampleData: ChallengePreviewData = {
        challengerUsername: 'testuser',
        challengerTime: 42,
        gridSize: 4,
        puzzleGridEmoji: '🟥🟦🟥🟦\n🟦🟥🟦🟥\n🟥🟦🟥🟦\n🟦🟥🟦🟥',
        beatsCount: 5,
        attemptsCount: 12,
        fastestTime: 38,
        activeRacers: 3,
    }

    it('returns a valid block structure with correct number of blocks', () => {
        const result = buildChallengePreview(sampleData)
        expect(result).toHaveProperty('blocks')
        expect(result.blocks).toHaveLength(5)
    })

    it('includes challenger username and time in title', () => {
        const result = buildChallengePreview(sampleData)
        const title = result.blocks[0]
        expect(title?.content).toContain('testuser')
        expect(title?.content).toContain('42s')
        expect(title?.style).toBe('title')
    })

    it('includes grid size in subtitle', () => {
        const result = buildChallengePreview(sampleData)
        const subtitle = result.blocks[1]
        expect(subtitle?.content).toContain('4×4')
        expect(subtitle?.style).toBe('subtitle')
    })

    it('includes emoji grid in body', () => {
        const result = buildChallengePreview(sampleData)
        const body = result.blocks[2]
        expect(body?.content).toBe(sampleData.puzzleGridEmoji)
        expect(body?.style).toBe('body')
    })

    it('includes "Play now" CTA', () => {
        const result = buildChallengePreview(sampleData)
        const cta = result.blocks[3]
        expect(cta?.content).toBe('Play now')
        expect(cta?.style).toBe('cta')
    })

    it('includes attempts and beats stats', () => {
        const result = buildChallengePreview(sampleData)
        const stats = result.blocks[4]
        expect(stats?.content).toContain('12 attempting')
        expect(stats?.content).toContain('5 beaten')
        expect(stats?.style).toBe('stats')
    })

    it('formats time over 60s as minutes', () => {
        const data: ChallengePreviewData = {
            ...sampleData,
            challengerTime: 125,
        }
        const result = buildChallengePreview(data)
        const title = result.blocks[0]
        expect(title?.content).toContain('2m 5s')
    })

    it('formats exact minute times without seconds', () => {
        const data: ChallengePreviewData = {
            ...sampleData,
            challengerTime: 120,
        }
        const result = buildChallengePreview(data)
        const title = result.blocks[0]
        expect(title?.content).toContain('2m')
        expect(title?.content).not.toContain('2m 0s')
    })

    it('handles zero attempts and beats', () => {
        const data: ChallengePreviewData = {
            ...sampleData,
            attemptsCount: 0,
            beatsCount: 0,
        }
        const result = buildChallengePreview(data)
        const stats = result.blocks[4]
        expect(stats?.content).toBe('Be the first to attempt!')
    })

    it('handles 6x6 grid size', () => {
        const data: ChallengePreviewData = {
            ...sampleData,
            gridSize: 6,
        }
        const result = buildChallengePreview(data)
        const subtitle = result.blocks[1]
        expect(subtitle?.content).toContain('6×6')
    })

    it('handles 8x8 grid size', () => {
        const data: ChallengePreviewData = {
            ...sampleData,
            gridSize: 8,
        }
        const result = buildChallengePreview(data)
        const subtitle = result.blocks[1]
        expect(subtitle?.content).toContain('8×8')
    })

    it('all blocks have type "text"', () => {
        const result = buildChallengePreview(sampleData)
        for (const block of result.blocks) {
            expect(block.type).toBe('text')
        }
    })
})

describe('buildDailyPreview', () => {
    const sampleData: DailyPreviewData = {
        puzzleNumber: 42,
        gridSize: 4,
        completionsToday: 150,
        activeNow: 12,
        fastestTime: 28,
        fastestUsername: 'speedster',
    }

    it('returns a valid block structure with correct number of blocks', () => {
        const result = buildDailyPreview(sampleData)
        expect(result).toHaveProperty('blocks')
        expect(result.blocks).toHaveLength(4)
    })

    it('includes puzzle number in title', () => {
        const result = buildDailyPreview(sampleData)
        const title = result.blocks[0]
        expect(title?.content).toContain('Urjo Puzzle #42')
        expect(title?.style).toBe('title')
    })

    it('includes grid size in subtitle', () => {
        const result = buildDailyPreview(sampleData)
        const subtitle = result.blocks[1]
        expect(subtitle?.content).toContain('4×4')
        expect(subtitle?.style).toBe('subtitle')
    })

    it('includes player count in stats', () => {
        const result = buildDailyPreview(sampleData)
        const stats = result.blocks[2]
        expect(stats?.content).toContain('150 players today')
        expect(stats?.style).toBe('stats')
    })

    it('includes "Play now" CTA', () => {
        const result = buildDailyPreview(sampleData)
        const cta = result.blocks[3]
        expect(cta?.content).toBe('Play now')
        expect(cta?.style).toBe('cta')
    })

    it('handles zero completions', () => {
        const data: DailyPreviewData = {
            ...sampleData,
            completionsToday: 0,
        }
        const result = buildDailyPreview(data)
        const stats = result.blocks[2]
        expect(stats?.content).toBe('0 players today')
    })

    it('handles large puzzle numbers', () => {
        const data: DailyPreviewData = {
            ...sampleData,
            puzzleNumber: 9999,
        }
        const result = buildDailyPreview(data)
        const title = result.blocks[0]
        expect(title?.content).toContain('#9999')
    })

    it('handles 6x6 grid size', () => {
        const data: DailyPreviewData = {
            ...sampleData,
            gridSize: 6,
        }
        const result = buildDailyPreview(data)
        const subtitle = result.blocks[1]
        expect(subtitle?.content).toContain('6×6')
    })

    it('all blocks have type "text"', () => {
        const result = buildDailyPreview(sampleData)
        for (const block of result.blocks) {
            expect(block.type).toBe('text')
        }
    })
})


describe('buildChallengeBeatPreview', () => {
    const sampleData: ChallengeBeatPreviewData = {
        winnerUsername: 'champion42',
        winnerTime: 25,
    }

    it('returns a valid block structure with one block', () => {
        const result = buildChallengeBeatPreview(sampleData)
        expect(result).toHaveProperty('blocks')
        expect(result.blocks).toHaveLength(1)
    })

    it('includes winner username and time in title', () => {
        const result = buildChallengeBeatPreview(sampleData)
        const title = result.blocks[0]
        expect(title?.content).toBe('Beaten! Champion: u/champion42 in 25s')
        expect(title?.style).toBe('title')
    })

    it('formats time over 60s as minutes', () => {
        const data: ChallengeBeatPreviewData = {
            winnerUsername: 'speedster',
            winnerTime: 95,
        }
        const result = buildChallengeBeatPreview(data)
        const title = result.blocks[0]
        expect(title?.content).toBe('Beaten! Champion: u/speedster in 1m 35s')
    })

    it('formats exact minute times without seconds', () => {
        const data: ChallengeBeatPreviewData = {
            winnerUsername: 'player1',
            winnerTime: 60,
        }
        const result = buildChallengeBeatPreview(data)
        const title = result.blocks[0]
        expect(title?.content).toBe('Beaten! Champion: u/player1 in 1m')
    })

    it('block has type "text"', () => {
        const result = buildChallengeBeatPreview(sampleData)
        expect(result.blocks[0]?.type).toBe('text')
    })
})
