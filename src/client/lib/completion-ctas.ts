import type { CompletionAction, CompletionContext } from '../../shared/social-types'

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
