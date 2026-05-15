import { describe, expect, it } from 'vitest'

import {
    getCompletionCtas,
    isRivalChallengeEligible,
} from '../completion-ctas'

describe('isRivalChallengeEligible', () => {
    it('promotes Rival Challenge for perfect solves', () => {
        expect(isRivalChallengeEligible({
            mistakes: 0,
            streak: 1,
            skillLevel: 1,
            hasChallenged: false,
            seasonRank: null,
        })).toBe(true)
    })

    it('does not promote Rival Challenge after challenge creation', () => {
        expect(isRivalChallengeEligible({
            mistakes: 0,
            streak: 10,
            skillLevel: 5,
            hasChallenged: true,
            seasonRank: 1,
        })).toBe(false)
    })

    it('promotes Rival Challenge for visible status moments', () => {
        expect(isRivalChallengeEligible({
            mistakes: 2,
            streak: 4,
            skillLevel: 1,
            hasChallenged: false,
            seasonRank: null,
        })).toBe(true)
        expect(isRivalChallengeEligible({
            mistakes: 2,
            streak: 1,
            skillLevel: 1,
            hasChallenged: false,
            seasonRank: 12,
        })).toBe(true)
    })
})

describe('getCompletionCtas', () => {
    it('keeps Next Puzzle primary and exposes Rival Challenge separately', () => {
        const ctas = getCompletionCtas({
            mistakes: 0,
            streak: 2,
            skillLevel: 2,
            hasChallenged: false,
            challengeUrl: null,
            seasonRank: null,
        })

        expect(ctas.primary.id).toBe('next-puzzle')
        expect(ctas.social.map((cta) => cta.id)).toContain('rival-challenge')
    })

    it('uses Open Rival Challenge when a challenge post already exists', () => {
        const ctas = getCompletionCtas({
            mistakes: 0,
            streak: 2,
            skillLevel: 2,
            hasChallenged: true,
            challengeUrl: 'https://reddit.com/comments/challenge',
            seasonRank: null,
        })

        expect(ctas.social).toContainEqual({
            id: 'open-rival-challenge',
            label: 'Open Rival Challenge',
        })
    })
})
