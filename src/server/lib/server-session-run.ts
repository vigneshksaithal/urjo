import { redis } from '@devvit/web/server'

import { registerUserDynamicKey } from './account-deletion'

const SESSION_RUN_TTL_SECONDS = 3600
const SAFE_SESSION_ID = /^[a-zA-Z0-9_-]{1,64}$/

export const incrementVerifiedSessionRun = async (
    userId: string,
    sessionId: string | null,
): Promise<number> => {
    if (sessionId === null || !SAFE_SESSION_ID.test(sessionId)) return 1

    const key = `user:${userId}:session-run:${sessionId}`
    await registerUserDynamicKey(userId, key)
    const run = await redis.incrBy(key, 1)
    await redis.expire(key, SESSION_RUN_TTL_SECONDS)
    return run
}
