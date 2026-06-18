import { describe, expect, it } from 'vitest'

import type { CompletionContext } from '../../../shared/social-types'
import { getSimplifiedCompletionCtas } from '../completion-ctas'

describe('getSimplifiedCompletionCtas', () => {
    const baseContext: CompletionContext = {
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

    it('falls back to "Challenge Friends" in secondary by default', () => {
        const result = getSimplifiedCompletionCtas(baseContext)

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
