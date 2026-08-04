/**
 * Result Card Serialization & Parsing
 * Pure functions with zero dependencies beyond growth-types.
 * Shared between client (preview) and server (comment posting).
 */

import type { ResultCardData } from './growth-types'

export type VerifiedResultCardData = Omit<ResultCardData, 'mistakes' | 'colorGrid'> & {
    colorGrid: readonly (readonly ('red' | 'blue')[])[]
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const RED_EMOJI = '🟥'
const BLUE_EMOJI = '🟦'
const HEADER_PREFIX = 'Urjo #'
const FOOTER = 'Play at r/urjo'
const VALID_GRID_SIZES = new Set([4, 6, 8])

// ─── Serialization ─────────────────────────────────────────────────────────────

/** Serialize a completed puzzle into the shareable text format */
export const serializeResultCard = (data: ResultCardData): string =>
    serializeResult(data, `⏱️ ${data.timeTaken}s | 🎯 ${data.mistakes} mistakes | 🔥 ${data.streak} streak`)

/** Serialize only fields backed by the immutable server completion receipt. */
export const serializeVerifiedResultComment = (
    data: VerifiedResultCardData,
    customMessage?: string,
): string => withCustomMessage(
    serializeResult(data, `⏱️ ${data.timeTaken}s | 🔥 ${data.streak} streak`),
    customMessage,
)

const serializeResult = (
    data: VerifiedResultCardData,
    stats: string,
): string => {
    const header = `${HEADER_PREFIX}${data.puzzleNumber} 🧩 ${data.gridSize}×${data.gridSize} ⭐${data.skillLevel}`

    const gridRows = data.colorGrid.map((row) =>
        row.map((cell) => (cell === 'red' ? RED_EMOJI : BLUE_EMOJI)).join('')
    )

    return [header, ...gridRows, stats, FOOTER].join('\n')
}

/**
 * Build the full Reddit comment text for a victory share.
 * Keeps the auto-generated result card appended below the user's custom intro.
 */
export const serializeResultComment = (
    data: ResultCardData,
    customMessage?: string,
): string => withCustomMessage(serializeResultCard(data), customMessage)

const withCustomMessage = (card: string, customMessage?: string): string => {
    const message = customMessage?.trim()
    return message ? `${message}\n\n${card}` : card
}

// ─── Parsing ───────────────────────────────────────────────────────────────────

const HEADER_REGEX = /^Urjo #(\d+) 🧩 (\d+)×(\d+) ⭐(\d+)$/
const STATS_REGEX = /^⏱️ (\d+)s \| 🎯 (\d+) mistakes \| 🔥 (\d+) streak$/

/** Parse a single emoji grid row into color values, or null if invalid */
const parseGridRow = (row: string, expectedSize: number): ('red' | 'blue')[] | null => {
    const cells: ('red' | 'blue')[] = []
    let remaining = row

    while (remaining.length > 0) {
        if (remaining.startsWith(RED_EMOJI)) {
            cells.push('red')
            remaining = remaining.slice(RED_EMOJI.length)
        } else if (remaining.startsWith(BLUE_EMOJI)) {
            cells.push('blue')
            remaining = remaining.slice(BLUE_EMOJI.length)
        } else {
            return null
        }
    }

    return cells.length === expectedSize ? cells : null
}

/** Parse a result card string back into structured data, or null if invalid */
export const parseResultCard = (text: string): ResultCardData | null => {
    const rawLines = text.split('\n')

    // serializeResultComment prepends an optional custom message (plus a
    // blank line) before the card. Locate the header line instead of
    // assuming it's line 0, so parsing tolerates that prefix and still
    // round-trips serializeResultCard output (where the header is line 0).
    const headerIndex = rawLines.findIndex((line) => HEADER_REGEX.test(line))
    if (headerIndex === -1) {
        return null
    }
    const lines = rawLines.slice(headerIndex)

    // Minimum lines: header + at least 1 grid row + stats + footer = 4
    if (lines.length < 4) {
        return null
    }

    // Parse header
    const headerLine = lines[0]
    if (headerLine === undefined) {
        return null
    }
    const headerMatch = HEADER_REGEX.exec(headerLine)
    if (headerMatch === null) {
        return null
    }

    const puzzleNumberStr = headerMatch[1]
    const gridSizeStr = headerMatch[2]
    const gridSizeStr2 = headerMatch[3]
    const skillLevelStr = headerMatch[4]

    if (puzzleNumberStr === undefined || gridSizeStr === undefined || gridSizeStr2 === undefined || skillLevelStr === undefined) {
        return null
    }

    const puzzleNumber = parseInt(puzzleNumberStr, 10)
    const gridSize = parseInt(gridSizeStr, 10)
    const gridSize2 = parseInt(gridSizeStr2, 10)
    const skillLevel = parseInt(skillLevelStr, 10)

    // Grid dimensions must match
    if (gridSize !== gridSize2) {
        return null
    }

    // Validate gridSize is 4, 6, or 8
    if (!VALID_GRID_SIZES.has(gridSize)) {
        return null
    }

    // Validate skillLevel is 1–9
    if (skillLevel < 1 || skillLevel > 9) {
        return null
    }

    // Validate puzzleNumber is positive
    if (puzzleNumber < 1) {
        return null
    }

    // Expected line count: 1 header + gridSize rows + 1 stats + 1 footer
    const expectedLineCount = 1 + gridSize + 1 + 1
    if (lines.length !== expectedLineCount) {
        return null
    }

    // Parse grid rows
    const colorGrid: ('red' | 'blue')[][] = []
    for (let i = 1; i <= gridSize; i++) {
        const line = lines[i]
        if (line === undefined) {
            return null
        }
        const row = parseGridRow(line, gridSize)
        if (row === null) {
            return null
        }
        colorGrid.push(row)
    }

    // Parse stats line
    const statsLine = lines[1 + gridSize]
    if (statsLine === undefined) {
        return null
    }
    const statsMatch = STATS_REGEX.exec(statsLine)
    if (statsMatch === null) {
        return null
    }

    const timeStr = statsMatch[1]
    const mistakesStr = statsMatch[2]
    const streakStr = statsMatch[3]

    if (timeStr === undefined || mistakesStr === undefined || streakStr === undefined) {
        return null
    }

    const timeTaken = parseInt(timeStr, 10)
    const mistakes = parseInt(mistakesStr, 10)
    const streak = parseInt(streakStr, 10)

    // Parse footer
    const footerLine = lines[2 + gridSize]
    if (footerLine !== FOOTER) {
        return null
    }

    return {
        puzzleNumber,
        gridSize: gridSize as 4 | 6 | 8,
        skillLevel,
        colorGrid,
        timeTaken,
        mistakes,
        streak,
    }
}
