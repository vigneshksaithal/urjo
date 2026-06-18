/**
 * Subscribe helper functions
 * Manages per-user subreddit join status for the "Join r/urjo" CTA.
 */

import { redis } from '@devvit/web/server'

const JOINED_KEY = (userId: string) => `user:${userId}:joinedSubreddit`

/**
 * Check if a user has already joined the subreddit via the in-game CTA.
 */
export async function hasJoinedSubreddit(userId: string): Promise<boolean> {
	const value = await redis.get(JOINED_KEY(userId))
	return value === 'true'
}

/**
 * Mark a user as having joined the subreddit.
 * Called when the user taps "Join r/urjo" in the completion overlay.
 */
export async function markJoinedSubreddit(userId: string): Promise<void> {
	await redis.set(JOINED_KEY(userId), 'true')
}
