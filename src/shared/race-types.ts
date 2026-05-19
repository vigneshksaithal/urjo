/**
 * Social Viral Mechanics Types
 * Race sessions, presence, completion CTAs, and post previews
 */

// ─── Race Session ──────────────────────────────────────────────────────────────

/** Stored as Redis hash: race:{postId}:{sessionId} with 5-minute TTL */
export type RaceSession = {
    sessionId: string
    postId: string
    player1Id: string
    player2Id: string
    puzzleColors: string
    puzzleNumbers: string
    puzzleSolution: string
    gridSize: string // "4" | "6" | "8"
    status: 'waiting' | 'racing' | 'finished' | 'abandoned'
    startedAt: string // timestamp ms
    player1Progress: string // "0" to "100" percentage
    player2Progress: string
    player1Time: string // completion time or "0"
    player2Time: string
    winnerId: string // "" until determined
}

// ─── Race Queue ────────────────────────────────────────────────────────────────

/** Stored as Redis string: race:queue:{postId}:{gridSize} with 30s TTL */
export type QueueEntry = {
    userId: string
    sessionId: string
    joinedAt: number // timestamp ms
}

// ─── Race Results ──────────────────────────────────────────────────────────────

export type JoinRaceResult = {
    status: 'waiting' | 'matched' | 'already_racing'
    sessionId: string
    puzzle?: {
        colors: string
        numbers: string
        solution: string
    }
}

export type RaceStatus = {
    status: 'waiting' | 'racing' | 'finished' | 'expired' | 'opponent_left'
    opponentProgress: number
    opponentTime?: number
    waitingForOpponent?: boolean
}

export type RaceCompleteResult = {
    won: boolean
    yourTime: number
    opponentTime?: number | null
    winnerId?: string | null
    waitingForOpponent?: boolean
    error?: string
}

// ─── Presence ──────────────────────────────────────────────────────────────────

export type PresencePlayer = {
    userId: string
    username: string
    avatarUrl?: string
    isRacing: boolean
}

export type PresenceData = {
    activeCount: number
    players: PresencePlayer[]
    racingCount: number
}

// ─── Completion Screen ─────────────────────────────────────────────────────────

export type CompletionActionId =
    | 'challenge-friends'
    | 'race-rematch'
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
    isRaceResult: boolean
    raceWon: boolean
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
    activeRacers: number
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
