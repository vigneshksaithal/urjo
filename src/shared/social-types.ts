/**
 * Social Viral Mechanics Types
 * Completion CTAs, and post previews
 */

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

// ─── Inline Preview (webview splash) ─────────────────────────────────────────

/**
 * Data the inline preview webview (`default` entrypoint) fetches from
 * `/api/preview` to render the feed splash: a faded grid backdrop, a
 * battle-style prompt, and — for challenge posts — the creator's avatar.
 * Challenge-only fields are null on daily/regular posts.
 */
export type PreviewState = {
    /** Puzzle starting colors string (r/b/.) — never the solution */
    colors: string
    gridSize: number
    isChallenge: boolean
    challengerUsername: string | null
    challengerTime: number | null
    avatarUrl: string | null
}
