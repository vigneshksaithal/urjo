/**
 * Custom Post Preview Builder
 * Builds preview data for challenge and daily puzzle posts.
 * These previews are displayed in the Reddit feed using setCustomPostPreview.
 */

import type { ChallengePreviewData, DailyPreviewData } from '../../shared/race-types'

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

// ─── Challenge Preview ───────────────────────────────────────────────────────

/**
 * Build preview blocks for a challenge post.
 * Shows: challenger username, time, grid size, emoji grid, CTA, stats.
 */
export const buildChallengePreview = (data: ChallengePreviewData): PreviewBlocks => {
    const blocks: PreviewTextBlock[] = [
        {
            type: 'text',
            content: `🎯 u/${data.challengerUsername} solved it in ${formatTime(data.challengerTime)}`,
            style: 'title',
        },
        {
            type: 'text',
            content: `${formatGridLabel(data.gridSize)} puzzle`,
            style: 'subtitle',
        },
        {
            type: 'text',
            content: data.puzzleGridEmoji,
            style: 'body',
        },
        {
            type: 'text',
            content: 'Can you beat it?',
            style: 'cta',
        },
        {
            type: 'text',
            content: `${data.attemptsCount} attempts · ${data.beatsCount} beaten`,
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
