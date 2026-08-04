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
import { deleteCompletionSnapshotsForUser } from './completion-snapshot'
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
    'streak:freeFreezeTier',
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
    'history:adaptive',
    // Preferences + onboarding
    'gridSizePreference',
    'gridSizeOverride',
    'gridMigrated',
    'tutorialCompleted',
    'communityJoined',
    'pathLevel',
    // Adaptive skips + persistent hint dismissals
    'consecutiveSkips:4',
    'consecutiveSkips:6',
    'consecutiveSkips:8',
    'hint:numberConstraint',
    'hint:adjacencyViolation',
    // Username cache
    'username',
    'display',
    // Login streak (hash)
    'loginStreak',
] as const

const userFixedKeys = (userId: string): string[] => [
    ...USER_KEY_SUFFIXES.map(suffix => `user:${userId}:${suffix}`),
    // Analytics key lives outside user:* namespace but is user-scoped
    `analytics:user:${userId}:completion_dates`,
    `viral:attribution:${userId}`,
]

const dynamicKeyIndex = (userId: string): string =>
    `user:${userId}:dynamicKeys`

const sortedSetMembershipIndex = (userId: string): string =>
    `user:${userId}:sortedSetMemberships`

/** Register a non-enumerable user-owned key at the same time it is written. */
export const registerUserDynamicKey = async (
    userId: string,
    key: string,
): Promise<void> => {
    if (userId.length === 0 || key.length === 0 || !key.includes(userId)) {
        throw new Error('Dynamic key must contain its user ID')
    }
    await redis.zAdd(dynamicKeyIndex(userId), { member: key, score: Date.now() })
}

/** Register a sorted-set that stores the raw user ID as its member. */
export const registerUserSortedSetMembership = async (
    userId: string,
    key: string,
): Promise<void> => {
    if (userId.length === 0 || key.length === 0) {
        throw new Error('User ID and sorted-set key are required')
    }
    await redis.zAdd(sortedSetMembershipIndex(userId), { member: key, score: Date.now() })
}

const clearDynamicKeys = async (userId: string): Promise<void> => {
    const entries = await redis.zRange(dynamicKeyIndex(userId), 0, -1, { by: 'rank' })
    const keys = entries.map(({ member }) => member)
    if (keys.length > 0) await redis.del(...keys)
}

const clearSortedSetMemberships = async (userId: string): Promise<void> => {
    const entries = await redis.zRange(sortedSetMembershipIndex(userId), 0, -1, { by: 'rank' })
    await Promise.all(
        entries.map(({ member: key }) => redis.zRem(key, [userId]))
    )
}

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

// ─── Challenge-beat preview cleanup ──────────────────────────────────────────
// The challengeBeatPreviews reverse index is written whenever a beat preview
// stores a winner's username. The winnerId field prevents an old account
// deletion from erasing a newer player's preview on the same post.

const clearChallengeBeatPreviews = async (userId: string): Promise<void> => {
    const entries = await redis.zRange(
        `user:${userId}:challengeBeatPreviews`,
        0,
        -1,
        { by: 'rank' },
    )
    await Promise.all(entries.map(async ({ member: postId }) => {
        const winnerId = await redis.hGet(`game:${postId}:preview`, 'winnerId')
        if (winnerId === userId) await redis.del(`game:${postId}:preview`)
    }))
}

// ─── Challenge creator attribution cleanup ────────────────────────────────────
// The createdChallenges reverse index is written in the challenge creation
// route (game.ts) whenever a user posts a new challenge.

const clearCreatedChallengeEntries = async (userId: string): Promise<void> => {
    const entries = await redis.zRange(`user:${userId}:createdChallenges`, 0, -1, { by: 'rank' })
    await Promise.all(entries.map(({ member: postId }) => clearCreatedContentEntry(postId)))
}

const clearCreatedContentEntry = async (postId: string): Promise<void> => {
    const contentType = await redis.hGet(`game:${postId}:meta`, 'creatorContentType')
    if (contentType === 'level') {
        await redis.del(
            `game:${postId}:meta`,
            `game:${postId}:puzzle`,
            `game:${postId}:stats`,
            `game:${postId}:preview`,
        )
        return
    }

    await Promise.all([
        redis.hDel(`game:${postId}:meta`, ['challengeCreatorId']),
        redis.hDel(`game:${postId}:puzzle`, [
            'challengeBy',
            'challengeByUsername',
            'challengeByAvatar',
        ]),
        redis.del(`game:${postId}:preview`),
    ])
}

// ─── Season leaderboard cleanup ───────────────────────────────────────────────
// The seasonParticipation reverse index is written in recordSeasonScore
// (seasons.ts) on each user's first completion in a season. It maps
// userId → [seasonId, ...] so past leaderboards can be found without SCAN.

const clearSeasonParticipation = async (userId: string): Promise<void> => {
    const entries = await redis.zRange(`user:${userId}:seasonParticipation`, 0, -1, { by: 'rank' })
    await Promise.all(
        entries.map(async ({ member: seasonId }) => {
            await Promise.all([
                redis.zRem(`season:${seasonId}:leaderboard`, [userId]),
                redis.hDel(`season:${seasonId}:rewarded`, [userId]),
                removeUserFromSeasonResults(seasonId, userId),
            ])
        })
    )
}

const removeUserFromSeasonResults = async (
    seasonId: string,
    userId: string,
): Promise<void> => {
    const key = `season:${seasonId}:results`
    const raw = await redis.get(key)
    if (raw === undefined) return

    const results = parseSeasonResults(raw)
    if (results === null) throw new Error(`Invalid stored results for season ${seasonId}`)

    const filtered = results.topPlayers.filter(
        (player) => !isStoredSeasonPlayer(player) || player.userId !== userId,
    )
    if (filtered.length === results.topPlayers.length) return
    await redis.set(key, JSON.stringify({ ...results.value, topPlayers: filtered }))
}

type StoredSeasonPlayer = Readonly<Record<string, unknown> & { userId: string }>

type StoredSeasonResults = Readonly<{
    value: Record<string, unknown>
    topPlayers: unknown[]
}>

const parseSeasonResults = (raw: string): StoredSeasonResults | null => {
    try {
        const value = JSON.parse(raw) as unknown
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

        const record = value as Record<string, unknown>
        if (!Array.isArray(record['topPlayers'])) return { value: record, topPlayers: [] }
        return { value: record, topPlayers: record['topPlayers'] }
    } catch {
        return null
    }
}

const isStoredSeasonPlayer = (value: unknown): value is StoredSeasonPlayer =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)['userId'] === 'string'

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
 * - Challenge-beat preview identity (reverse-index lookup + ownership check)
 * - Challenge creator attribution (reverse-index lookup + hDel)
 * - Indexed dynamic keys, sorted-set memberships, and completion snapshots
 */
export const deleteUserData = async (userId: string): Promise<void> => {
    console.log('[AccountDeletion] Starting deletion for:', userId)

    const fixedKeys = userFixedKeys(userId)
    const reverseIndexKeys: string[] = [
        `user:${userId}:championOf`,
        `user:${userId}:challengeBeatPreviews`,
        `user:${userId}:createdChallenges`,
        `user:${userId}:seasonParticipation`,
        dynamicKeyIndex(userId),
        sortedSetMembershipIndex(userId),
    ]

    // Run all independent cleanup operations in parallel.
    // Use allSettled so a failure in one step does not silently abort others.
    const results = await Promise.allSettled([
        redis.del(...fixedKeys),
        removeFromLeaderboards(userId),
        clearChampionEntries(userId),
        clearChallengeBeatPreviews(userId),
        clearCreatedChallengeEntries(userId),
        clearSeasonParticipation(userId),
        clearDynamicKeys(userId),
        clearSortedSetMemberships(userId),
        deleteCompletionSnapshotsForUser(userId),
    ])

    const opNames = [
        'fixedKeys',
        'leaderboards',
        'champion',
        'challengeBeatPreviews',
        'creator',
        'seasons',
        'dynamicKeys',
        'sortedSetMemberships',
        'completions',
    ]
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
