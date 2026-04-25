/**
 * Community highlight formatting functions.
 * All functions are pure — no side effects, no Redis, no external imports.
 */

import type { HighlightData, WeeklyHighlightData, MissionTemplate } from '../../shared/engagement-types'

/**
 * Formats the "Yesterday's Stars" section for the daily post sticky comment.
 * Skips any category that has no data.
 */
export const buildHighlightsComment = (data: HighlightData): string => {
    const lines: string[] = ["## ⭐ Yesterday's Stars"]

    if (data.topStreak !== null) {
        const { titleEmoji, username, streak } = data.topStreak
        lines.push(`🔥 Longest Streak: ${titleEmoji} u/${username} — ${streak} days`)
    }

    for (const solve of data.fastestSolves) {
        const { gridSize, titleEmoji, username, timeTaken } = solve
        lines.push(`⚡ Fastest ${gridSize}×${gridSize}: ${titleEmoji} u/${username} — ${timeTaken}s`)
    }

    if (data.mostCoins !== null) {
        const { titleEmoji, username, coins } = data.mostCoins
        lines.push(`💰 Most Coins: ${titleEmoji} u/${username} — ${coins} coins`)
    }

    return lines.join('\n')
}

/**
 * Formats the "Player of the Week" section.
 * Returns a fallback message when topPlayer is null.
 */
export const buildPlayerOfTheWeekComment = (data: WeeklyHighlightData): string => {
    const lines: string[] = ['## 🏆 Player of the Week']

    if (data.topPlayer === null) {
        lines.push('No completions yet this week.')
        return lines.join('\n')
    }

    const { titleEmoji, username, completions } = data.topPlayer
    lines.push(`👑 ${titleEmoji} u/${username} — ${completions} puzzles completed`)

    return lines.join('\n')
}

/**
 * Formats the mission preview line for the daily post.
 * Replaces `{n}` in each template's descriptionTemplate with its targetValue.
 * Returns a fallback message when the missions array is empty.
 */
export const buildMissionPreview = (missions: MissionTemplate[]): string => {
    const lines: string[] = ["## 🎯 Today's Missions"]

    if (missions.length === 0) {
        lines.push('No missions today.')
        return lines.join('\n')
    }

    for (const mission of missions) {
        const description = mission.descriptionTemplate.replace('{n}', String(mission.targetValue))
        lines.push(`• ${description}`)
    }

    return lines.join('\n')
}
