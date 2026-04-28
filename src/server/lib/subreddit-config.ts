/**
 * Subreddit Config Module
 * Per-subreddit configuration CRUD and installation tracking
 */

import { redis } from '@devvit/web/server'
import type { SubredditConfig, PostFrequency } from '../../shared/growth-types'

const CONFIG_KEY = (subredditId: string): string =>
    `subreddit:${subredditId}:config`

const INSTALLATION_KEY = (subredditId: string): string =>
    `installation:${subredditId}`

const INSTALLATIONS_SET = 'installations:all'

const VALID_FREQUENCIES: readonly PostFrequency[] = ['once_daily', 'twice_daily', 'thrice_daily'] as const
const VALID_GRID_SIZES = [4, 6, 8] as const

/** Default config for new subreddits */
const DEFAULT_CONFIG: SubredditConfig = {
    postFrequency: 'twice_daily',
    defaultGridSize: 4,
    brandingEmoji: '🧩',
    welcomeMessage: 'Welcome to Urjo!',
} as const

/**
 * Serialize a SubredditConfig into a Redis hash record.
 */
const serializeConfig = (config: SubredditConfig): Record<string, string> => ({
    postFrequency: config.postFrequency,
    defaultGridSize: config.defaultGridSize.toString(),
    brandingEmoji: config.brandingEmoji,
    welcomeMessage: config.welcomeMessage,
})

/**
 * Parse a Redis hash record into a SubredditConfig.
 * Falls back to defaults for missing or invalid fields.
 */
const parseConfig = (data: Record<string, string>): SubredditConfig => {
    const frequency = data['postFrequency']
    const gridSizeStr = data['defaultGridSize']
    const gridSize = gridSizeStr !== undefined ? parseInt(gridSizeStr, 10) : NaN

    return {
        postFrequency: frequency !== undefined && (VALID_FREQUENCIES as readonly string[]).includes(frequency)
            ? frequency as PostFrequency
            : DEFAULT_CONFIG.postFrequency,
        defaultGridSize: VALID_GRID_SIZES.includes(gridSize as 4 | 6 | 8)
            ? (gridSize as 4 | 6 | 8)
            : DEFAULT_CONFIG.defaultGridSize,
        brandingEmoji: data['brandingEmoji'] ?? DEFAULT_CONFIG.brandingEmoji,
        welcomeMessage: data['welcomeMessage'] ?? DEFAULT_CONFIG.welcomeMessage,
    }
}

/**
 * Get subreddit config, creating defaults if none exists.
 */
export const getSubredditConfig = async (subredditId: string): Promise<SubredditConfig> => {
    const data = await redis.hGetAll(CONFIG_KEY(subredditId))

    // No config exists — create defaults
    if (!data || Object.keys(data).length === 0) {
        await redis.hSet(CONFIG_KEY(subredditId), serializeConfig(DEFAULT_CONFIG))
        return { ...DEFAULT_CONFIG }
    }

    return parseConfig(data)
}

/**
 * Update subreddit config fields (partial update).
 * Returns the full updated config.
 */
export const updateSubredditConfig = async (
    subredditId: string,
    updates: Partial<SubredditConfig>
): Promise<SubredditConfig> => {
    // Read current config (creates defaults if needed)
    const current = await getSubredditConfig(subredditId)

    // Merge updates with validation
    const merged: SubredditConfig = {
        postFrequency: updates.postFrequency !== undefined
            && (VALID_FREQUENCIES as readonly string[]).includes(updates.postFrequency)
            ? updates.postFrequency
            : current.postFrequency,
        defaultGridSize: updates.defaultGridSize !== undefined
            && VALID_GRID_SIZES.includes(updates.defaultGridSize as 4 | 6 | 8)
            ? (updates.defaultGridSize as 4 | 6 | 8)
            : current.defaultGridSize,
        brandingEmoji: updates.brandingEmoji ?? current.brandingEmoji,
        welcomeMessage: updates.welcomeMessage ?? current.welcomeMessage,
    }

    await redis.hSet(CONFIG_KEY(subredditId), serializeConfig(merged))
    return merged
}

/**
 * Record a new installation.
 * Adds to the installations sorted set and stores metadata hash.
 */
export const recordInstallation = async (
    subredditId: string,
    subredditName: string,
    installedBy: string
): Promise<void> => {
    const now = Date.now()

    await Promise.all([
        redis.zAdd(INSTALLATIONS_SET, { member: subredditId, score: now }),
        redis.hSet(INSTALLATION_KEY(subredditId), {
            subredditName,
            installedAt: now.toString(),
            installedBy,
        }),
    ])
}
