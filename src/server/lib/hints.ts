/**
 * Hints Library
 * Persists per-user hint dismissal flags to Redis.
 * Keys: user:{userId}:hint:numberConstraint, user:{userId}:hint:adjacencyViolation
 * Requirements: 12.1, 12.2, 12.3
 */

import { redis } from '@devvit/web/server'

export type HintKind = 'numberConstraint' | 'adjacencyViolation'

const hintKey = (userId: string, kind: HintKind): string =>
    `user:${userId}:hint:${kind}`

/**
 * Read both hint dismissal flags for a user.
 * Returns false for any flag that has not been set.
 */
export const getHintsDismissed = async (
    userId: string,
): Promise<{ numberConstraint: boolean; adjacencyViolation: boolean }> => {
    const [nc, av] = await redis.mGet([
        hintKey(userId, 'numberConstraint'),
        hintKey(userId, 'adjacencyViolation'),
    ])

    return {
        numberConstraint: nc === '1',
        adjacencyViolation: av === '1',
    }
}

/**
 * Set the hint dismissal flag for a user and kind.
 * Idempotent: calling multiple times produces the same '1' value with no TTL.
 */
export const markHintDismissed = async (userId: string, kind: HintKind): Promise<void> => {
    await redis.set(hintKey(userId, kind), '1')
}
