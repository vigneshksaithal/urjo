import type { CompletionAction, CompletionContext } from '../../shared/social-types'

export type CompletionCtaId =
    | 'next-puzzle'
    | 'rival-challenge'
    | 'open-rival-challenge'

export type CompletionCta = {
    id: CompletionCtaId
    label: string
}

export type RivalChallengeEligibilityInput = {
    mistakes: number
    streak: number
    skillLevel: number
    hasChallenged: boolean
    seasonRank: number | null
}

export type CompletionCtaInput = RivalChallengeEligibilityInput & {
    challengeUrl: string | null
}

export type CompletionCtas = {
    primary: CompletionCta
    social: CompletionCta[]
}

export const isRivalChallengeEligible = ({
    mistakes,
    streak,
    skillLevel,
    hasChallenged,
    seasonRank,
}: RivalChallengeEligibilityInput): boolean => {
    if (hasChallenged) return false
    if (mistakes === 0) return true
    if (streak >= 3) return true
    if (skillLevel >= 3) return true

    return seasonRank !== null && seasonRank <= 25
}

export const getCompletionCtas = (input: CompletionCtaInput): CompletionCtas => {
    const primary: CompletionCta = {
        id: 'next-puzzle',
        label: 'Next Puzzle',
    }

    if (input.hasChallenged && input.challengeUrl !== null) {
        return {
            primary,
            social: [{
                id: 'open-rival-challenge',
                label: 'Open Rival Challenge',
            }],
        }
    }

    if (!isRivalChallengeEligible(input)) {
        return { primary, social: [] }
    }

    return {
        primary,
        social: [{
            id: 'rival-challenge',
            label: 'Create Rival Challenge',
        }],
    }
}

// ─── Simplified Completion CTAs (Social Viral Mechanics) ───────────────────────

/**
 * Build the secondary "social" action for the completion screen.
 * A finished challenge prefers "View Challenge", and the default fallback is
 * "Challenge Friends".
 *
 * (Previously this was the primary CTA. We demoted it because data + the
 * Subway Surfers / CoC playbook says the highest-friction action ("post a
 * challenge to the subreddit") is the wrong primary — players in flow want
 * to keep playing, and the giant button should reflect that.)
 */
const getSocialCta = (context: CompletionContext): CompletionAction => {
    if (context.hasChallenged) {
        return { id: 'view-challenge', label: 'View Challenge', style: 'secondary' }
    }

    return { id: 'challenge-friends', label: 'Challenge Friends', style: 'secondary' }
}

export const getSimplifiedCompletionCtas = (
    context: CompletionContext
): { primary: CompletionAction; secondary: CompletionAction[] } => {
    // PRIMARY = Next Puzzle. The hooked player wants more of the thing they
    // just did; the giant button should make that a one-tap continuation.
    const primary: CompletionAction = {
        id: 'next-puzzle',
        label: 'Next Puzzle',
        style: 'primary',
    }

    // Secondary = the social/share action that used to be primary.
    const secondary: CompletionAction[] = [getSocialCta(context)]

    return { primary, secondary }
}
