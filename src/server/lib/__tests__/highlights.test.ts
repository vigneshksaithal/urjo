/**
 * Tests for pure highlight formatting functions.
 * No Redis or side effects — pure string formatting only.
 */

import { describe, it, expect } from 'vitest'
import {
    buildHighlightsComment,
    buildPlayerOfTheWeekComment,
    buildMissionPreview,
} from '../highlights'
import type { HighlightData, WeeklyHighlightData, MissionTemplate } from '../../../shared/engagement-types'

// ─── buildHighlightsComment ────────────────────────────────────────────────────

const fullHighlightData: HighlightData = {
    topStreak: { username: 'alice', titleEmoji: '🔥', streak: 42 },
    fastestSolves: [
        { gridSize: 4, username: 'bob', titleEmoji: '⚡', timeTaken: 18 },
        { gridSize: 6, username: 'carol', titleEmoji: '🧩', timeTaken: 55 },
        { gridSize: 8, username: 'dave', titleEmoji: '👑', timeTaken: 120 },
    ],
    mostCoins: { username: 'eve', titleEmoji: '💰', coins: 350 },
}

describe('buildHighlightsComment', () => {
    it("includes \"Yesterday's Stars\" header", () => {
        const result = buildHighlightsComment(fullHighlightData)
        expect(result).toContain("Yesterday's Stars")
    })

    it('includes top streak with username and titleEmoji', () => {
        const result = buildHighlightsComment(fullHighlightData)
        expect(result).toContain('alice')
        expect(result).toContain('42')
        expect(result).toContain('🔥')
    })

    it('includes fastest solve per grid size', () => {
        const result = buildHighlightsComment(fullHighlightData)
        expect(result).toContain('4×4')
        expect(result).toContain('bob')
        expect(result).toContain('18')
        expect(result).toContain('6×6')
        expect(result).toContain('carol')
        expect(result).toContain('55')
        expect(result).toContain('8×8')
        expect(result).toContain('dave')
        expect(result).toContain('120')
    })

    it('includes most coins with username and titleEmoji', () => {
        const result = buildHighlightsComment(fullHighlightData)
        expect(result).toContain('eve')
        expect(result).toContain('350')
        expect(result).toContain('💰')
    })

    it('skips streak line when topStreak is null', () => {
        const data: HighlightData = { ...fullHighlightData, topStreak: null }
        const result = buildHighlightsComment(data)
        expect(result).not.toContain('Longest Streak')
        expect(result).toContain('eve')
    })

    it('skips mostCoins line when mostCoins is null', () => {
        const data: HighlightData = { ...fullHighlightData, mostCoins: null }
        const result = buildHighlightsComment(data)
        expect(result).not.toContain('Most Coins')
        expect(result).toContain('alice')
    })

    it('handles empty fastestSolves array gracefully', () => {
        const data: HighlightData = { ...fullHighlightData, fastestSolves: [] }
        const result = buildHighlightsComment(data)
        expect(result).toContain('alice')
        expect(result).toContain('eve')
    })

    it('skips all optional lines when all categories are null/empty', () => {
        const data: HighlightData = {
            topStreak: null,
            fastestSolves: [],
            mostCoins: null,
        }
        const result = buildHighlightsComment(data)
        expect(result).toContain("Yesterday's Stars")
        expect(result).not.toContain('Longest Streak')
        expect(result).not.toContain('Fastest')
        expect(result).not.toContain('Most Coins')
    })
})

// ─── buildPlayerOfTheWeekComment ──────────────────────────────────────────────

const weeklyData: WeeklyHighlightData = {
    topPlayer: { username: 'frank', titleEmoji: '🏆', completions: 87 },
    isoWeek: '2025-W03',
}

describe('buildPlayerOfTheWeekComment', () => {
    it('includes "Player of the Week" header', () => {
        const result = buildPlayerOfTheWeekComment(weeklyData)
        expect(result).toContain('Player of the Week')
    })

    it('includes top player username and completions', () => {
        const result = buildPlayerOfTheWeekComment(weeklyData)
        expect(result).toContain('frank')
        expect(result).toContain('87')
        expect(result).toContain('🏆')
    })

    it('returns fallback message when topPlayer is null', () => {
        const data: WeeklyHighlightData = { topPlayer: null, isoWeek: '2025-W03' }
        const result = buildPlayerOfTheWeekComment(data)
        expect(result).toContain('Player of the Week')
        expect(result).not.toContain('frank')
        expect(result.toLowerCase()).toMatch(/no completions/i)
    })
})

// ─── buildMissionPreview ───────────────────────────────────────────────────────

const missionTemplates: MissionTemplate[] = [
    {
        id: 'daily_solve_3',
        type: 'solve_n_puzzles',
        descriptionTemplate: 'Solve {n} puzzles today',
        targetValue: 3,
        coinReward: 15,
        cadence: 'daily',
    },
    {
        id: 'daily_speed_60',
        type: 'solve_under_time',
        descriptionTemplate: 'Solve a puzzle in under {n} seconds',
        targetValue: 60,
        coinReward: 20,
        cadence: 'daily',
    },
    {
        id: 'daily_perfect',
        type: 'solve_zero_mistakes',
        descriptionTemplate: 'Solve a puzzle with zero mistakes',
        targetValue: 1,
        coinReward: 20,
        cadence: 'daily',
    },
]

describe('buildMissionPreview', () => {
    it("includes \"Today's Missions\" header", () => {
        const result = buildMissionPreview(missionTemplates)
        expect(result).toContain("Today's Missions")
    })

    it('lists all mission descriptions with {n} replaced by targetValue', () => {
        const result = buildMissionPreview(missionTemplates)
        expect(result).toContain('Solve 3 puzzles today')
        expect(result).toContain('Solve a puzzle in under 60 seconds')
        expect(result).toContain('Solve a puzzle with zero mistakes')
    })

    it('uses bullet points for each mission', () => {
        const result = buildMissionPreview(missionTemplates)
        const lines = result.split('\n')
        const bulletLines = lines.filter((l) => l.startsWith('•'))
        expect(bulletLines).toHaveLength(3)
    })

    it('returns fallback message when missions array is empty', () => {
        const result = buildMissionPreview([])
        expect(result).toContain("Today's Missions")
        expect(result.toLowerCase()).toMatch(/no missions/i)
    })

    it('does not include raw {n} placeholder in output', () => {
        const result = buildMissionPreview(missionTemplates)
        expect(result).not.toContain('{n}')
    })
})
