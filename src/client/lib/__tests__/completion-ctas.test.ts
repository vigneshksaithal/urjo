import { describe, expect, it } from 'vitest'

import type { CompletionContext } from '../../../shared/race-types'
import {
    getCompletionCtas,
    getSimplifiedCompletionCtas,
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

describe('getSimplifiedCompletionCtas', () => {
    const baseContext: CompletionContext = {
        isRaceResult: false,
        raceWon: false,
        timeTaken: 45,
        mistakes: 1,
        streak: 3,
        skillLevel: 2,
        hasChallenged: false,
        challengeUrl: null,
        hasSubscribed: false,
    }

    it('always returns "Next Puzzle" as the primary CTA', () => {
        const result = getSimplifiedCompletionCtas(baseContext)

        expect(result.primary).toEqual({
            id: 'next-puzzle',
            label: 'Next Puzzle',
            style: 'primary',
        })
    })

    it('demotes "Challenge Friends" to secondary by default', () => {
        const result = getSimplifiedCompletionCtas(baseContext)

        expect(result.secondary).toContainEqual({
            id: 'challenge-friends',
            label: 'Challenge Friends',
            style: 'secondary',
        })
    })

    it('puts "Race Again" in secondary after a race win — primary stays Next Puzzle', () => {
        const context: CompletionContext = {
            ...baseContext,
            isRaceResult: true,
            raceWon: true,
        }
        const result = getSimplifiedCompletionCtas(context)

        expect(result.primary.id).toBe('next-puzzle')
        expect(result.secondary).toContainEqual({
            id: 'race-rematch',
            label: 'Race Again',
            style: 'secondary',
        })
    })

    it('puts "View Challenge" in secondary when already challenged', () => {
        const context: CompletionContext = {
            ...baseContext,
            hasChallenged: true,
            challengeUrl: 'https://reddit.com/comments/abc',
        }
        const result = getSimplifiedCompletionCtas(context)

        expect(result.primary.id).toBe('next-puzzle')
        expect(result.secondary).toContainEqual({
            id: 'view-challenge',
            label: 'View Challenge',
            style: 'secondary',
        })
    })

    it('falls back to "Challenge Friends" in secondary on race loss', () => {
        const context: CompletionContext = {
            ...baseContext,
            isRaceResult: true,
            raceWon: false,
        }
        const result = getSimplifiedCompletionCtas(context)

        expect(result.primary.id).toBe('next-puzzle')
        expect(result.secondary).toContainEqual({
            id: 'challenge-friends',
            label: 'Challenge Friends',
            style: 'secondary',
        })
    })

    it('is a pure function — same input always produces same output', () => {
        const first = getSimplifiedCompletionCtas(baseContext)
        const second = getSimplifiedCompletionCtas(baseContext)

        expect(first).toEqual(second)
    })
})
