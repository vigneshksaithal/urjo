/**
 * Account Deletion Cleanup
 *
 * Called by the /internal/on-account-delete trigger to remove all user data
 * from Redis. Required by Devvit Rules:
 * https://developers.reddit.com/docs/devvit_rules
 *
 * MAINTENANCE: When adding a new redis.set/hSet/zAdd under a user:{userId}:*
 * key anywhere in the server, add the corresponding deletion entry here.
 */
import { redis } from '@devvit/web/server'
import { getCurrentSeason } from './seasons'

// ─── Fixed-pattern keys ───────────────────────────────────────────────────────
// All user:{userId}:* keys with known, non-enumerable patterns.
// Key suffixes — enumerated explicitly so any new key added to the schema
// is visible here and not silently omitted.

const USER_KEY_SUFFIXES = [
    // Streak
    'streak:current',
    'streak:longest',
    'streak:lastDate',
    // Economy + social
    'economy',
    'social',
    // Achievements + flair
    'achievements',
    'flairTier',
    'flairOptIn',
    // Skill levels (general + per-grid)
    'skillLevel',
    'skillLevel:4',
    'skillLevel:6',
    'skillLevel:8',
    // Per-grid game history (key: user:{userId}:history:{gridSize})
    'history:4',
    'history:6',
    'history:8',
    // Preferences + onboarding
    'gridSizePreference',
    'gridMigrated',
    'tutorialCompleted',
    // Username cache
    'username',
    // Login streak (hash)
    'loginStreak',
] as const

const userFixedKeys = (userId: string): string[] => [
    ...USER_KEY_SUFFIXES.map(suffix => `user:${userId}:${suffix}`),
    // Analytics key lives outside user:* namespace but is user-scoped
    `analytics:user:${userId}:completion_dates`,
]

// ─── Champion attribution cleanup ─────────────────────────────────────────────
// The championOf reverse index is written in checkChallengeBeat (game.ts)
// whenever a user takes the fastest time on a challenge post.

const clearChampionEntries = async (userId: string): Promise<void> => {
    const entries = await redis.zRange(`user:${userId}:championOf`, 0, -1, { by: 'rank' })
    await Promise.all(
        entries.map(async ({ member: postId }) => {
            const currentChampion = await redis.hGet(`game:${postId}:stats`, 'championId')
            if (currentChampion === userId) {
                // Only delete the identity field (championId). fastestTime is a game metric,
                // not PII — deleting it would break record-keeping and leaderboard display.
                await redis.hDel(`game:${postId}:stats`, ['championId'])
            }
        })
    )
}

// ─── Challenge creator attribution cleanup ────────────────────────────────────
// The createdChallenges reverse index is written in the challenge creation
// route (game.ts) whenever a user posts a new challenge.

const clearCreatedChallengeEntries = async (userId: string): Promise<void> => {
    const entries = await redis.zRange(`user:${userId}:createdChallenges`, 0, -1, { by: 'rank' })
    await Promise.all(
        entries.map(async ({ member: postId }) => {
            await Promise.all([
                redis.hDel(`game:${postId}:meta`, ['challengeCreatorId']),
                redis.hDel(`game:${postId}:puzzle`, [
                    'challengeBy',
                    'challengeByUsername',
                    'challengeByAvatar',
                ]),
            ])
        })
    )
}

// ─── Season leaderboard cleanup ───────────────────────────────────────────────
// The seasonParticipation reverse index is written in recordSeasonScore
// (seasons.ts) on each user's first completion in a season. It maps
// userId → [seasonId, ...] so past leaderboards can be found without SCAN.

const clearSeasonParticipation = async (userId: string): Promise<void> => {
    const entries = await redis.zRange(`user:${userId}:seasonParticipation`, 0, -1, { by: 'rank' })
    await Promise.all(
        entries.map(({ member: seasonId }) =>
            redis.zRem(`season:${seasonId}:leaderboard`, [userId])
        )
    )
}

// ─── Global leaderboard removal ───────────────────────────────────────────────
// Belt-and-suspenders removal from the current season + permanent global sets.
// Past seasons are handled by clearSeasonParticipation above.

const removeFromLeaderboards = async (userId: string): Promise<void> => {
    const { seasonId } = getCurrentSeason()
    await Promise.all([
        redis.zRem('leaderboard:streak', [userId]),
        redis.zRem('leaderboard:coins', [userId]),
        redis.zRem('notify:optin', [userId]),
        // Current season is also covered by clearSeasonParticipation, but kept
        // here as a fallback for users who joined before the reverse index existed.
        redis.zRem(`season:${seasonId}:leaderboard`, [userId]),
    ])
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Delete all Redis data associated with a deleted user account.
 *
 * Covers:
 * - All fixed-pattern user:{userId}:* profile, state, and history keys
 * - analytics:user:{userId}:completion_dates
 * - Global leaderboard memberships (streak, coins, notify, current season)
 * - All season leaderboards via seasonParticipation reverse index
 * - Challenge champion attribution (reverse-index lookup + hDel)
 * - Challenge creator attribution (reverse-index lookup + hDel)
 *
 * TTL-managed (not explicitly deleted, expire naturally):
 * - user:{userId}:game:{postId}:currentPuzzle — 30-day TTL set at write time
 * - leaderboard:speed:{date}:{gridSize} — 30-day TTL set at write time
 * - user:{userId}:challenge:count:{date} — 24h TTL set at write time
 * - user:{userId}:seasonSolves:{date} — 2-day TTL set at write time
 */
export const deleteUserData = async (userId: string): Promise<void> => {
    console.log('[AccountDeletion] Starting deletion for:', userId)

    const fixedKeys = userFixedKeys(userId)
    const reverseIndexKeys: string[] = [
        `user:${userId}:championOf`,
        `user:${userId}:createdChallenges`,
        `user:${userId}:seasonParticipation`,
    ]

    // Run all independent cleanup operations in parallel.
    // Use allSettled so a failure in one step does not silently abort others.
    const results = await Promise.allSettled([
        redis.del(...fixedKeys),
        removeFromLeaderboards(userId),
        clearChampionEntries(userId),
        clearCreatedChallengeEntries(userId),
        clearSeasonParticipation(userId),
    ])

    const opNames = ['fixedKeys', 'leaderboards', 'champion', 'creator', 'seasons']
    for (let i = 0; i < results.length; i++) {
        const result = results[i]!
        if (result.status === 'rejected') {
            console.error(`[AccountDeletion] Partial failure in ${opNames[i]}:`, result.reason)
        }
    }

    const failCount = results.filter(r => r.status === 'rejected').length
    if (failCount > 0) {
        throw new Error(`Account deletion partially failed: ${failCount} operation(s) failed for ${userId}`)
    }

    // Delete the reverse index keys only after the cleanup passes that read them
    await redis.del(...reverseIndexKeys)

    console.log('[AccountDeletion] Completed deletion for:', userId)
}
