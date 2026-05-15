/**
 * Property 13: Help-Tap Idempotence
 * For all sequences of N help-icon taps by the same user on the same date,
 * the increment to `analytics:{date}:help_taps` equals min(1, N).
 *
 * Validates: Requirement 11.5
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/redis'
import { describe, it } from 'vitest'
import * as fc from 'fast-check'

import { trackHelpTap } from '../lib/analytics'

// ─── Generators ───────────────────────────────────────────────────────────────

/**
 * Generates a valid user-ID-shaped string (t2_ prefix + alphanumeric suffix).
 */
const userIdArb = fc
    .stringMatching(/^[a-z0-9]{3,16}$/)
    .map((s) => `t2_${s}`)

/**
 * Generates a valid post-ID-shaped string (t3_ prefix + alphanumeric suffix).
 */
const postIdArb = fc
    .stringMatching(/^[a-z0-9]{4,10}$/)
    .map((s) => `t3_${s}`)

/**
 * Generates a valid ISO date string in the range 2025-01-01 to 2025-12-31.
 */
const dateArb = fc
    .integer({ min: 1, max: 365 })
    .map((dayOfYear) => {
        const d = new Date(Date.UTC(2025, 0, dayOfYear))
        return d.toISOString().split('T')[0] ?? '2025-01-01'
    })

/**
 * Generates a tap count N in [1, 20].
 * N=0 is excluded — the property is about sequences of at least one tap.
 */
const tapCountArb = fc.integer({ min: 1, max: 20 })

// ─── Property 13: Help-Tap Idempotence ────────────────────────────────────────

/**
 * **Validates: Requirement 11.5**
 *
 * Property 13: Help-Tap Idempotence
 * For all sequences of N help-icon taps by the same user on the same date,
 * the increment to `analytics:{date}:help_taps` equals min(1, N).
 *
 * The property is tested against the real `trackHelpTap` function backed by
 * in-memory Redis (via @devvit/test isolation). Each generated (date, postId,
 * userId, N) tuple gets a fresh Redis namespace, so there is no cross-run
 * state bleed.
 */
describe('Property 13: Help-Tap Idempotence', () => {
    const test = createDevvitTest({ userId: 't2_pbt_user', subredditId: 't5_testsub' })

    test('for all N >= 1 taps by the same user on the same date, help_taps counter equals 1', async () => {
        await fc.assert(
            fc.asyncProperty(
                dateArb,
                postIdArb,
                userIdArb,
                tapCountArb,
                async (date, postId, userId, n) => {
                    // Use a unique date key per (postId, userId, n) to avoid
                    // counter collisions across property runs within the same test.
                    // We embed postId and userId fragments into the date string so
                    // each combination gets its own Redis counter key.
                    const uniqueDate = `${date}-${postId.slice(3, 7)}-${userId.slice(3, 7)}-${n}`

                    // Fire N taps for the same (uniqueDate, postId, userId) triple.
                    for (let i = 0; i < n; i++) {
                        await trackHelpTap(uniqueDate, postId, userId)
                    }

                    // The counter must equal min(1, N) = 1 (since N >= 1).
                    const counter = await redis.get(`analytics:${uniqueDate}:help_taps`)
                    const counterValue = counter !== undefined ? parseInt(counter, 10) : 0
                    return counterValue === 1
                },
            ),
            { numRuns: 100 },
        )
    })

    test('for N=1 tap, help_taps counter equals 1 (base case)', async () => {
        await fc.assert(
            fc.asyncProperty(
                dateArb,
                postIdArb,
                userIdArb,
                async (date, postId, userId) => {
                    const uniqueDate = `${date}-base-${postId.slice(3, 6)}-${userId.slice(3, 6)}`

                    await trackHelpTap(uniqueDate, postId, userId)

                    const counter = await redis.get(`analytics:${uniqueDate}:help_taps`)
                    const counterValue = counter !== undefined ? parseInt(counter, 10) : 0
                    return counterValue === 1
                },
            ),
            { numRuns: 100 },
        )
    })

    test('different users on the same date each contribute exactly 1 to the counter', async () => {
        await fc.assert(
            fc.asyncProperty(
                dateArb,
                postIdArb,
                fc.uniqueArray(userIdArb, { minLength: 2, maxLength: 5 }),
                tapCountArb,
                async (date, postId, userIds, n) => {
                    const uniqueDate = `${date}-multi-${postId.slice(3, 6)}-${n}`

                    // Each user fires N taps — each should contribute exactly 1.
                    for (const userId of userIds) {
                        for (let i = 0; i < n; i++) {
                            await trackHelpTap(uniqueDate, postId, userId)
                        }
                    }

                    const counter = await redis.get(`analytics:${uniqueDate}:help_taps`)
                    const counterValue = counter !== undefined ? parseInt(counter, 10) : 0
                    // Each of the K distinct users contributes exactly 1 tap.
                    return counterValue === userIds.length
                },
            ),
            { numRuns: 50 },
        )
    })
})
