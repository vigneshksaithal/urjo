/**
 * Adaptive Difficulty Algorithm
 *
 * Determines the next puzzle difficulty level based on the user's
 * recent performance (last 5 completed games, time-based scoring).
 *
 * Performance score: 0.0 (very slow) to 1.0 (very fast)
 * Average >= 0.70 → promote (harder puzzle)
 * Average <= 0.30 → demote (easier puzzle)
 * Otherwise → stay at current level
 */

import type { GameRecord } from '../../shared/types'
import {
	MIN_SKILL_LEVEL,
	MAX_SKILL_LEVEL,
	HISTORY_SIZE,
	PROMOTE_THRESHOLDS,
	PROMOTE_WINDOW,
	DEMOTE_WINDOW,
	DEMOTE_THRESHOLD,
	SKIP_BASE_PENALTY,
	SKIP_MAX_EXTRA_PENALTY,
	CONSECUTIVE_SKIP_THRESHOLD,
	getLevelConfig,
} from '../../shared/constants'

/**
 * Calculate performance score for a single completed game.
 * Returns a value from 0.0 to 1.0.
 *
 * Formula: clamp(1.0 - (timeTaken / (expectedTime * 2)), 0, 1)
 * - Solving at half the expected time or less → 1.0
 * - Solving at exactly the expected time → 0.5
 * - Taking 2x the expected time or more → 0.0
 */
export const calculatePerformanceScore = (timeTaken: number, level: number): number => {
	const config = getLevelConfig(level)
	const expectedTime = config.expectedTime
	const score = 1.0 - timeTaken / (expectedTime * 2)
	return Math.max(0, Math.min(1, score))
}

/**
 * Calculate penalty score for a skipped puzzle.
 * Returns a value from -0.5 to -0.2 (always worse than any completion).
 *
 * Quick skips (user barely looked at the puzzle) receive a harsher penalty
 * than slow skips (user tried for a while before giving up).
 *
 * Formula: SKIP_BASE_PENALTY + (SKIP_MAX_EXTRA_PENALTY * quicknessFactor)
 * where quicknessFactor = clamp(1 - timeSpent / (expectedTime * 0.5), 0, 1)
 *
 * - Skip instantly (0s) → -0.5
 * - Skip at 25% of expected time → -0.35
 * - Skip at 50%+ of expected time → -0.2
 */
export const calculateSkipScore = (timeSpent: number, level: number): number => {
	const config = getLevelConfig(level)
	const expectedTime = config.expectedTime
	const quicknessFactor = Math.max(0, Math.min(1, 1 - timeSpent / (expectedTime * 0.5)))
	return SKIP_BASE_PENALTY + SKIP_MAX_EXTRA_PENALTY * quicknessFactor
}

/**
 * Calculate the average performance score from a list of game records.
 * Skipped records use the skip penalty formula; completions use the standard formula.
 * Returns 0.5 (neutral) if no records exist.
 */
export const calculateAverageScore = (history: GameRecord[]): number => {
	if (history.length === 0) return 0.5

	const total = history.reduce((sum, record) => {
		const score = record.skipped
			? calculateSkipScore(record.timeTaken, record.level)
			: calculatePerformanceScore(record.timeTaken, record.level)
		return sum + score
	}, 0)

	return total / history.length
}

/**
 * Determine the new skill level based on recent game history.
 *
 * Asymmetric windows:
 * - Demotion: uses last DEMOTE_WINDOW (5) games — quick to respond to struggles
 * - Promotion: uses last PROMOTE_WINDOW (15) games — requires sustained performance
 *
 * Per-level promotion thresholds (harder to promote at higher levels).
 * Demotion threshold is fixed at DEMOTE_THRESHOLD (0.18).
 */
export const determineSkillLevel = (currentLevel: number, history: GameRecord[]): number => {
	if (history.length === 0) return currentLevel

	// Check demotion first (short window)
	if (history.length >= DEMOTE_WINDOW) {
		const recentShort = history.slice(-DEMOTE_WINDOW)
		const avgShort = calculateAverageScore(recentShort)
		if (avgShort <= DEMOTE_THRESHOLD && currentLevel > MIN_SKILL_LEVEL) {
			return currentLevel - 1
		}
	}

	// Check promotion (longer window)
	if (history.length >= PROMOTE_WINDOW) {
		const recentLong = history.slice(-PROMOTE_WINDOW)
		const avgLong = calculateAverageScore(recentLong)
		const promoteThreshold = PROMOTE_THRESHOLDS[currentLevel - 1] ?? 0.55
		if (avgLong >= promoteThreshold && currentLevel < MAX_SKILL_LEVEL) {
			return currentLevel + 1
		}
	}

	return currentLevel
}

/**
 * Check if consecutive skips should force an immediate level demotion.
 * Returns true if the consecutive skip count meets or exceeds the threshold.
 */
export const shouldForceDemotion = (consecutiveSkips: number): boolean => {
	return consecutiveSkips >= CONSECUTIVE_SKIP_THRESHOLD
}

/**
 * Add a game record to history, keeping only the last HISTORY_SIZE records.
 * Returns the updated history array.
 */
export const addGameRecord = (history: GameRecord[], record: GameRecord): GameRecord[] => {
	const updated = [...history, record]
	// Keep only the most recent records
	if (updated.length > HISTORY_SIZE) {
		return updated.slice(updated.length - HISTORY_SIZE)
	}
	return updated
}

/**
 * Parse game history from Redis JSON string.
 * Returns empty array if invalid or missing.
 */
export const parseHistory = (json: string | null | undefined): GameRecord[] => {
	if (!json) return []
	try {
		const parsed: unknown = JSON.parse(json)
		if (!Array.isArray(parsed)) return []
		return parsed.filter(
			(item): item is GameRecord =>
				typeof item === 'object' &&
				item !== null &&
				typeof (item as GameRecord).level === 'number' &&
				typeof (item as GameRecord).timeTaken === 'number' &&
				typeof (item as GameRecord).timestamp === 'number' &&
				(typeof (item as GameRecord).skipped === 'boolean' ||
					typeof (item as GameRecord).skipped === 'undefined')
		)
	} catch {
		return []
	}
}
