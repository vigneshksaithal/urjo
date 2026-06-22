/**
 * Social Viral Mechanics Types
 * Post previews and personal challenge sharing
 */

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

// ─── Personal Challenge (Deeplink Share) ───────────────────────────────────────

/**
 * Personal challenge data encoded in showShareSheet deeplink.
 * Passed via getShareData() when recipient opens the shared link.
 *
 * Constraints:
 * - JSON.stringify result must be ≤1024 characters (Devvit limit)
 * - Data is untrusted input (users can tamper with links)
 * - Validate before using
 */
export type PersonalChallengeData = {
    /** Discriminator for type narrowing */
    type: 'personal-challenge'

    /** Post ID of the puzzle (t3_xxx format) — used to load the same puzzle */
    postId: string

    /** Challenger's solve time in seconds */
    time: number

    /** Challenger's username (for display only, not for identity) */
    username: string

    /** Grid size (4, 6, or 8) — for preview before load */
    gridSize: number

    /** ISO timestamp when challenge was created (for analytics) */
    createdAt: string
}

/**
 * Result of validating personal challenge data from getShareData().
 * Used to safely handle untrusted deeplink payloads.
 */
export type PersonalChallengeValidation =
    | { valid: true; data: PersonalChallengeData }
    | { valid: false; error: string }

/**
 * Validate personal challenge data from untrusted deeplink source.
 *
 * @param raw - Raw string from getShareData()
 * @returns Validation result with either parsed data or error message
 */
export const validatePersonalChallengeData = (raw: string | null | undefined): PersonalChallengeValidation => {
    if (!raw) {
        return { valid: false, error: 'No share data' }
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return { valid: false, error: 'Invalid JSON' }
    }

    if (!parsed || typeof parsed !== 'object') {
        return { valid: false, error: 'Invalid payload structure' }
    }

    const obj = parsed as Record<string, unknown>

    // Check discriminator
    if (obj.type !== 'personal-challenge') {
        return { valid: false, error: 'Not a personal challenge' }
    }

    // Validate postId (must be string starting with t3_)
    if (typeof obj.postId !== 'string' || !obj.postId.startsWith('t3_')) {
        return { valid: false, error: 'Invalid postId' }
    }

    // Validate time (must be positive number, reasonable bounds)
    if (typeof obj.time !== 'number' || obj.time <= 0 || obj.time > 3600) {
        return { valid: false, error: 'Invalid time' }
    }

    // Validate username (must be string, reasonable length)
    if (typeof obj.username !== 'string' || obj.username.length === 0 || obj.username.length > 50) {
        return { valid: false, error: 'Invalid username' }
    }

    // Validate gridSize (must be 4, 6, or 8)
    if (typeof obj.gridSize !== 'number' || ![4, 6, 8].includes(obj.gridSize)) {
        return { valid: false, error: 'Invalid gridSize' }
    }

    // Validate createdAt (must be valid ISO string)
    if (typeof obj.createdAt !== 'string') {
        return { valid: false, error: 'Invalid createdAt' }
    }
    const createdAtDate = new Date(obj.createdAt)
    if (Number.isNaN(createdAtDate.getTime())) {
        return { valid: false, error: 'Invalid createdAt date' }
    }

    return {
        valid: true,
        data: {
            type: 'personal-challenge',
            postId: obj.postId,
            time: obj.time,
            username: obj.username,
            gridSize: obj.gridSize,
            createdAt: obj.createdAt,
        },
    }
}
