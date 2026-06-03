/**
 * Social Viral Mechanics Types
 * Presence, completion CTAs, and post previews
 */

// ─── Presence ──────────────────────────────────────────────────────────────────

export type PresencePlayer = {
    userId: string
    username: string
    avatarUrl?: string
}

export type PresenceData = {
    activeCount: number
    players: PresencePlayer[]
}

// ─── Completion Screen ─────────────────────────────────────────────────────────

export type CompletionActionId =
    | 'challenge-friends'
    | 'next-puzzle'
    | 'view-challenge'
    | 'comment-result'
    | 'notify-toggle'
    | 'subscribe'
    | 'missions'
    | 'achievements'
    | 'profile'
    | 'season'

export type CompletionAction = {
    id: CompletionActionId
    label: string
    icon?: string
    style: 'primary' | 'secondary' | 'ghost'
}

export type CompletionContext = {
    timeTaken: number
    mistakes: number
    streak: number
    skillLevel: number
    hasChallenged: boolean
    challengeUrl: string | null
    hasSubscribed: boolean
}

// ─── Post Preview ──────────────────────────────────────────────────────────────

/** Data passed to setCustomPostPreview for challenge post feed rendering */
export type ChallengePreviewData = {
    challengerUsername: string
    challengerTime: number
    gridSize: number
    puzzleGridEmoji: string // pre-rendered emoji grid
    beatsCount: number
    attemptsCount: number
    fastestTime: number | null
}

/** Data passed to setCustomPostPreview for daily puzzle post feed rendering */
export type DailyPreviewData = {
    puzzleNumber: number
    gridSize: number
    completionsToday: number
    activeNow: number
    fastestTime: number | null
    fastestUsername: string | null
}
