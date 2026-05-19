import type { CompletionAction, CompletionContext } from '../../shared/race-types'

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

const getPrimaryCta = (context: CompletionContext): CompletionAction => {
    if (context.isRaceResult && context.raceWon) {
        return { id: 'race-rematch', label: 'Race Again', style: 'primary' }
    }

    if (context.hasChallenged) {
        return { id: 'view-challenge', label: 'View Challenge', style: 'primary' }
    }

    return { id: 'challenge-friends', label: 'Challenge Friends', style: 'primary' }
}

export const getSimplifiedCompletionCtas = (
    context: CompletionContext
): { primary: CompletionAction; secondary: CompletionAction[] } => {
    const primary = getPrimaryCta(context)
    const secondary: CompletionAction[] = [
        { id: 'next-puzzle', label: 'Next Puzzle', style: 'secondary' },
    ]

    return { primary, secondary }
}
