/**
 * Subscribe helper functions
 * Manages per-user subreddit join status for the "Join r/urjo" CTA.
 */

import { redis } from '@devvit/web/server'

const SUBSCRIBED_KEY = (userId: string) => `user:${userId}:subscribed`

/**
 * Check if a user has already joined the subreddit via the in-game CTA.
 */
export async function hasSubscribed(userId: string): Promise<boolean> {
	const value = await redis.get(SUBSCRIBED_KEY(userId))
	return value === 'true'
}

/**
 * Mark a user as having joined the subreddit.
 * Called when the user taps "Join r/urjo" in the completion overlay.
 */
export async function markSubscribed(userId: string): Promise<void> {
	await redis.set(SUBSCRIBED_KEY(userId), 'true')
}
