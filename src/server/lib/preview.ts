/**
 * Custom Post Preview Builder
 * Builds preview data for challenge and daily puzzle posts.
 * These previews are displayed in the Reddit feed using setCustomPostPreview.
 * 
 * VIRAL OPTIMIZATION: Previews use curiosity-gap mechanics — showing partial
 * information to maximize click-through from the Reddit feed.
 */

import type { ChallengePreviewData, DailyPreviewData } from '../../shared/social-types'

// ─── Preview Block Types ─────────────────────────────────────────────────────

/** A text line in the preview */
export type PreviewTextBlock = {
    type: 'text'
    content: string
    style: 'title' | 'subtitle' | 'body' | 'stats' | 'cta'
}

/** The full preview structure */
export type PreviewBlocks = {
    blocks: PreviewTextBlock[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

const formatGridLabel = (gridSize: number): string => `${gridSize}×${gridSize}`

// ─── Curiosity-Gap Grid Masking ──────────────────────────────────────────────

/**
 * Seeded pseudo-random number generator (Linear Congruential Generator).
 * Produces deterministic values for the same seed — ensures masked grids
 * render identically across multiple preview loads.
 */
const seededRandom = (seed: number): (() => number) => {
    let state = Math.abs(seed) || 1
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0
        return state / 0xFFFFFFFF
    }
}

/**
 * Convert a string (like postId) to a numeric seed for deterministic masking.
 */
const stringToSeed = (str: string): number => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0
    }
    return hash || 1
}

/**
 * Mask a solved puzzle grid to create a curiosity gap.
 * 
 * VIRAL MECHANICS: A fully-revealed grid closes the curiosity loop — viewers
 * feel they've "consumed" the content without clicking. Showing ~40% of cells
 * exploits the Zeigarnik Effect (incomplete tasks are more memorable) and
 * Information Gap Theory (curiosity arises from the gap between what we know
 * and what we want to know).
 * 
 * @param emojiGrid - The complete emoji grid (rows joined by \n)
 * @param gridSize - Grid dimensions (4, 6, or 8)
 * @param seed - Deterministic seed (use postId) for consistent masking
 * @param revealPercent - Fraction of cells to show (default 0.4 = 40%)
 * @returns Masked emoji grid with ⬜ replacing hidden cells
 */
export const maskPuzzleGrid = (
    emojiGrid: string,
    gridSize: number,
    seed: string,
    revealPercent: number = 0.4
): string => {
    const rows = emojiGrid.split('\n')
    const totalCells = gridSize * gridSize
    const revealCount = Math.floor(totalCells * revealPercent)
    
    // Build list of cell indices and shuffle deterministically
    const indices = Array.from({ length: totalCells }, (_, i) => i)
    const random = seededRandom(stringToSeed(seed))
    
    // Fisher-Yates shuffle with seeded PRNG
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[indices[i], indices[j]] = [indices[j]!, indices[i]!]
    }
    
    // First `revealCount` indices after shuffle are revealed
    const revealSet = new Set(indices.slice(0, revealCount))
    
    // Rebuild grid with masking
    let cellIdx = 0
    return rows.map(row => {
        // Match emoji characters (🟥 or 🟦)
        const cells = row.match(/🟥|🟦/g) || []
        return cells.map(cell => {
            const show = revealSet.has(cellIdx++)
            return show ? cell : '⬜'
        }).join('')
    }).join('\n')
}

// ─── Challenge Preview ───────────────────────────────────────────────────────

/**
 * Build preview blocks for a challenge post.
 * 
 * VIRAL OPTIMIZATION: Title uses forward-looking, competitive framing
 * ("Can you match this?") instead of past-tense reporting ("solved it in").
 * Research shows action-oriented CTAs increase click-through 20-40%.
 */
export const buildChallengePreview = (data: ChallengePreviewData): PreviewBlocks => {
    // Title templates optimized for click-through (forward-looking, competitive)
    // Rotate based on time to add variety without randomness
    const titleTemplates = [
        `🎯 ${formatTime(data.challengerTime)} to beat — can you match u/${data.challengerUsername}?`,
        `🔥 u/${data.challengerUsername} set ${formatTime(data.challengerTime)}. Your move.`,
        `👀 ${formatTime(data.challengerTime)} challenge from u/${data.challengerUsername}`,
        `🏆 Beat ${formatTime(data.challengerTime)}? u/${data.challengerUsername} says try.`,
    ]
    const titleIndex = (data.challengerTime + data.gridSize) % titleTemplates.length
    const title = titleTemplates[titleIndex] ?? titleTemplates[0]!
    
    // Subtitle: grid size without "Level X" (Level 1 signals beginner content)
    const difficultyLabel = data.gridSize <= 4 ? 'Quick' : data.gridSize <= 6 ? 'Standard' : 'Hard'
    const subtitle = `${difficultyLabel} ${formatGridLabel(data.gridSize)} puzzle`
    
    // Stats with social proof (attempts create urgency)
    const statsLine = data.attemptsCount > 0
        ? `${data.attemptsCount} attempting · ${data.beatsCount} beaten`
        : 'Be the first to attempt!'
    
    const blocks: PreviewTextBlock[] = [
        {
            type: 'text',
            content: title,
            style: 'title',
        },
        {
            type: 'text',
            content: subtitle,
            style: 'subtitle',
        },
        {
            type: 'text',
            content: data.puzzleGridEmoji,
            style: 'body',
        },
        {
            type: 'text',
            content: 'Play now',
            style: 'cta',
        },
        {
            type: 'text',
            content: statsLine,
            style: 'stats',
        },
    ]

    return { blocks }
}

// ─── Challenge Beat Preview ──────────────────────────────────────────────

/** Data for a challenge beat preview update */
export type ChallengeBeatPreviewData = {
    winnerUsername: string
    winnerTime: number
}

/**
 * Build preview blocks for a beaten challenge post.
 * Shows: "Beaten! Champion: u/{winner} in {time}s"
 */
export const buildChallengeBeatPreview = (data: ChallengeBeatPreviewData): PreviewBlocks => {
    const blocks: PreviewTextBlock[] = [
        {
            type: 'text',
            content: `Beaten! Champion: u/${data.winnerUsername} in ${formatTime(data.winnerTime)}`,
            style: 'title',
        },
    ]

    return { blocks }
}

// ─── Daily Preview ───────────────────────────────────────────────────────────

/**
 * Build preview blocks for a daily puzzle post.
 * Shows: puzzle number, grid size, player count, partial grid, CTA.
 */
export const buildDailyPreview = (data: DailyPreviewData): PreviewBlocks => {
    const blocks: PreviewTextBlock[] = [
        {
            type: 'text',
            content: `🧩 Urjo Puzzle #${data.puzzleNumber}`,
            style: 'title',
        },
        {
            type: 'text',
            content: `${formatGridLabel(data.gridSize)} puzzle`,
            style: 'subtitle',
        },
        {
            type: 'text',
            content: `${data.completionsToday} players today`,
            style: 'stats',
        },
        {
            type: 'text',
            content: 'Play now',
            style: 'cta',
        },
    ]

    return { blocks }
}
