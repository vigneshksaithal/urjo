/**
 * Tests for notify.ts
 * Covers: computeDailyMentionBatch (pure), Redis persistence helpers,
 * buildMentionCommentText, and property-based tests for Properties 10 and 12.
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/redis'
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
    computeDailyMentionBatch,
    addOptIn,
    removeOptIn,
    isOptedIn,
    getOptInUserIds,
    getCompleterUserIdsForDate,
    tryMarkUserMentioned,
    buildMentionCommentText,
} from '../notify'

// ─── computeDailyMentionBatch (pure, no Redis) ─────────────────────────────────

describe('computeDailyMentionBatch', () => {
    it('returns intersection of A and B minus C', () => {
        const result = computeDailyMentionBatch(
            ['u1', 'u2', 'u3'],
            ['u2', 'u3', 'u4'],
            ['u3'],
        )
        expect(result).toEqual(['u2'])
    })

    it('returns empty array when opt-in set is empty', () => {
        const result = computeDailyMentionBatch([], ['u1', 'u2'], [])
        expect(result).toEqual([])
    })

    it('returns empty array when completer set is empty', () => {
        const result = computeDailyMentionBatch(['u1', 'u2'], [], [])
        expect(result).toEqual([])
    })

    it('returns empty array when all intersection members are already mentioned', () => {
        const result = computeDailyMentionBatch(['u1', 'u2'], ['u1', 'u2'], ['u1', 'u2'])
        expect(result).toEqual([])
    })

    it('deduplicates inputs — duplicate opt-in IDs do not produce duplicates in output', () => {
        const result = computeDailyMentionBatch(
            ['u1', 'u1', 'u2'],
            ['u1', 'u2'],
            [],
        )
        expect(result).toEqual(['u1', 'u2'])
    })

    it('preserves stable insertion order matching optInUserIds', () => {
        const result = computeDailyMentionBatch(
            ['u3', 'u1', 'u2'],
            ['u1', 'u2', 'u3'],
            [],
        )
        expect(result).toEqual(['u3', 'u1', 'u2'])
    })

    it('handles all three sets being empty', () => {
        const result = computeDailyMentionBatch([], [], [])
        expect(result).toEqual([])
    })

    it('does not include users only in completer set but not opt-in', () => {
        const result = computeDailyMentionBatch(['u1'], ['u1', 'u2'], [])
        expect(result).toEqual(['u1'])
    })
})

// ─── Property 10: Daily Mention Batch Set Difference ──────────────────────────

describe('Daily Mention Batch Set Difference — Property 10', () => {
    /**
     * **Validates: Requirements 16.5, 16.6, 16.7**
     *
     * Property 10: Daily Mention Batch Set Difference
     * For all three input arrays A (opt-in), B (yesterday completers), C (already mentioned):
     * - R ⊆ A ∩ B  (consent and eligibility)
     * - R ∩ C = ∅  (no double-mention)
     * - computeDailyMentionBatch(A, B, C) = computeDailyMentionBatch(A, B, C)  (idempotence)
     */
    const userIdArb = fc.stringMatching(/^u_[a-z0-9]{1,8}$/)
    const userArrayArb = fc.array(userIdArb, { minLength: 0, maxLength: 30 })

    it('result is a subset of A ∩ B (consent and eligibility)', () => {
        fc.assert(
            fc.property(userArrayArb, userArrayArb, userArrayArb, (A, B, C) => {
                const R = computeDailyMentionBatch(A, B, C)
                const aSet = new Set(A)
                const bSet = new Set(B)

                for (const userId of R) {
                    expect(aSet.has(userId)).toBe(true)
                    expect(bSet.has(userId)).toBe(true)
                }
            }),
            { numRuns: 200 },
        )
    })

    it('result has no overlap with C (no double-mention)', () => {
        fc.assert(
            fc.property(userArrayArb, userArrayArb, userArrayArb, (A, B, C) => {
                const R = computeDailyMentionBatch(A, B, C)
                const cSet = new Set(C)

                for (const userId of R) {
                    expect(cSet.has(userId)).toBe(false)
                }
            }),
            { numRuns: 200 },
        )
    })

    it('is idempotent — same inputs produce equal results', () => {
        fc.assert(
            fc.property(userArrayArb, userArrayArb, userArrayArb, (A, B, C) => {
                const R1 = computeDailyMentionBatch(A, B, C)
                const R2 = computeDailyMentionBatch(A, B, C)
                expect(R1).toEqual(R2)
            }),
            { numRuns: 200 },
        )
    })

    it('result contains no duplicates', () => {
        fc.assert(
            fc.property(userArrayArb, userArrayArb, userArrayArb, (A, B, C) => {
                const R = computeDailyMentionBatch(A, B, C)
                const rSet = new Set(R)
                expect(R.length).toBe(rSet.size)
            }),
            { numRuns: 200 },
        )
    })
})

// ─── buildMentionCommentText ───────────────────────────────────────────────────

describe('buildMentionCommentText', () => {
    it('contains u/{username}', () => {
        const text = buildMentionCommentText('alice', 5, 't3_abc123')
        expect(text).toContain('u/alice')
    })

    it('contains streak number followed by "streak"', () => {
        const text = buildMentionCommentText('alice', 7, 't3_abc123')
        expect(text).toContain('7')
        expect(text).toContain('streak')
    })

    it('contains Reddit URL with postId stripped of t3_ prefix', () => {
        const text = buildMentionCommentText('alice', 5, 't3_abc123')
        expect(text).toContain('https://reddit.com/comments/abc123')
    })

    it('strips t3_ prefix from postId in URL', () => {
        const text = buildMentionCommentText('bob', 3, 't3_xyz789')
        expect(text).toContain('https://reddit.com/comments/xyz789')
        expect(text).not.toContain('t3_')
    })

    it('does not contain any t1_, t2_, t3_, t4_, t5_ prefixes', () => {
        const text = buildMentionCommentText('charlie', 10, 't3_post1')
        expect(text).not.toMatch(/t[1-5]_/)
    })

    it('matches the deterministic template exactly', () => {
        const text = buildMentionCommentText('alice', 5, 't3_abc123')
        expect(text).toBe(
            'u/alice — Day 5 of your Urjo streak. Today\'s puzzle: https://reddit.com/comments/abc123',
        )
    })

    it('handles postId without t3_ prefix gracefully', () => {
        const text = buildMentionCommentText('alice', 5, 'abc123')
        expect(text).toContain('https://reddit.com/comments/abc123')
    })
})

// ─── Property 12: Mention Comment Round-Trip ──────────────────────────────────

describe('Mention Comment Round-Trip — Property 12', () => {
    /**
     * **Validates: Requirement 18.5**
     *
     * Property 12: Mention Comment Round-Trip
     * For all valid (username, streak, postId) triples, extracting substrings
     * from buildMentionCommentText output recovers the original triple.
     */
    // Exclude usernames that start with t1_-t5_ to avoid false positives in the
    // "no t[1-5]_ prefix" check — the requirement targets internal IDs, not usernames.
    const usernameArb = fc
        .stringMatching(/^[A-Za-z0-9_-]{1,20}$/)
        .filter((u) => !/^t[1-5]_/.test(u))
    const streakArb = fc.integer({ min: 1, max: 9999 })
    const postIdArb = fc.stringMatching(/^t3_[a-z0-9]{1,10}$/)

    it('username, streak, and postId are recoverable from comment text', () => {
        fc.assert(
            fc.property(usernameArb, streakArb, postIdArb, (username, streak, postId) => {
                const text = buildMentionCommentText(username, streak, postId)

                // Extract username: text after "u/" up to " —"
                const usernameMatch = text.match(/^u\/([A-Za-z0-9_-]+) —/)
                expect(usernameMatch).not.toBeNull()
                expect(usernameMatch![1]).toBe(username)

                // Extract streak: number after "Day " and before " of"
                const streakMatch = text.match(/Day (\d+) of/)
                expect(streakMatch).not.toBeNull()
                expect(parseInt(streakMatch![1]!, 10)).toBe(streak)

                // Extract postId: after "https://reddit.com/comments/"
                const postIdShort = postId.replace(/^t3_/, '')
                const urlMatch = text.match(/https:\/\/reddit\.com\/comments\/([a-z0-9]+)/)
                expect(urlMatch).not.toBeNull()
                expect(urlMatch![1]).toBe(postIdShort)
            }),
            { numRuns: 200 },
        )
    })

    it('comment text does not contain any t1_-t5_ prefixes', () => {
        fc.assert(
            fc.property(usernameArb, streakArb, postIdArb, (username, streak, postId) => {
                const text = buildMentionCommentText(username, streak, postId)
                expect(text).not.toMatch(/t[1-5]_/)
            }),
            { numRuns: 200 },
        )
    })
})

// ─── Property 9: Notify Idempotence ───────────────────────────────────────────

/**
 * **Validates: Requirement 14.8**
 *
 * Property 9: Notify Idempotence
 * For all pairs of consecutive identical calls (two opt-ins, or two opt-outs)
 * for the same user, the second call produces the same final membership as the first.
 *
 * Two opt-ins: user is in notify:optin after both calls.
 * Two opt-outs: user is absent from notify:optin after both calls.
 */

const testDoubleOptInIdempotence = createDevvitTest({ userId: 't2_user_idem', subredditId: 't5_testsub' })

testDoubleOptInIdempotence(
    'Property 9 — two consecutive opt-ins produce the same membership (user present)',
    async () => {
        const userId = 't2_user_idem'

        // First opt-in
        await addOptIn(userId)
        const afterFirst = await isOptedIn(userId)

        // Second opt-in (identical call)
        await addOptIn(userId)
        const afterSecond = await isOptedIn(userId)

        // Both calls must produce the same membership state
        expect(afterFirst).toBe(true)
        expect(afterSecond).toBe(true)

        // User appears exactly once in the sorted set
        const members = await redis.zRange('notify:optin', 0, -1, { by: 'rank' })
        const entries = members.filter((m) => m.member === userId)
        expect(entries).toHaveLength(1)
    },
)

const testDoubleOptOutIdempotence = createDevvitTest({ userId: 't2_user_idem2', subredditId: 't5_testsub' })

testDoubleOptOutIdempotence(
    'Property 9 — two consecutive opt-outs produce the same membership (user absent)',
    async () => {
        const userId = 't2_user_idem2'

        // Seed the user as opted-in first
        await addOptIn(userId)

        // First opt-out
        await removeOptIn(userId)
        const afterFirst = await isOptedIn(userId)

        // Second opt-out (identical call)
        await removeOptIn(userId)
        const afterSecond = await isOptedIn(userId)

        // Both calls must produce the same membership state
        expect(afterFirst).toBe(false)
        expect(afterSecond).toBe(false)
    },
)

const testDoubleOptOutFromColdStart = createDevvitTest({ userId: 't2_user_idem3', subredditId: 't5_testsub' })

testDoubleOptOutFromColdStart(
    'Property 9 — two consecutive opt-outs for a never-opted-in user both produce absent membership',
    async () => {
        const userId = 't2_user_idem3'

        // User was never opted in — both opt-outs should be safe and idempotent
        await removeOptIn(userId)
        const afterFirst = await isOptedIn(userId)

        await removeOptIn(userId)
        const afterSecond = await isOptedIn(userId)

        expect(afterFirst).toBe(false)
        expect(afterSecond).toBe(false)
    },
)

const testDoubleOptInPreservesScore = createDevvitTest({ userId: 't2_user_idem4', subredditId: 't5_testsub' })

testDoubleOptInPreservesScore(
    'Property 9 — two consecutive opt-ins: score is defined after both calls',
    async () => {
        const userId = 't2_user_idem4'

        await addOptIn(userId)
        const scoreAfterFirst = await redis.zScore('notify:optin', userId)

        await addOptIn(userId)
        const scoreAfterSecond = await redis.zScore('notify:optin', userId)

        // Score must be defined after both calls (user remains a member)
        expect(scoreAfterFirst).toBeDefined()
        expect(scoreAfterSecond).toBeDefined()
    },
)

// ─── addOptIn / removeOptIn / isOptedIn / getOptInUserIds (Redis) ──────────────

const testOptIn = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testOptIn('addOptIn adds user to notify:optin sorted set', async () => {
    await addOptIn('t2_user1')
    const members = await redis.zRange('notify:optin', 0, -1, { by: 'rank' })
    expect(members.map((m) => m.member)).toContain('t2_user1')
})

const testOptInScore = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testOptInScore('addOptIn sets score to current timestamp (positive number)', async () => {
    const before = Date.now()
    await addOptIn('t2_user1')
    const after = Date.now()

    const members = await redis.zRange('notify:optin', 0, -1, { by: 'rank' })
    const entry = members.find((m) => m.member === 't2_user1')
    expect(entry).toBeDefined()
    expect(entry!.score).toBeGreaterThanOrEqual(before)
    expect(entry!.score).toBeLessThanOrEqual(after)
})

const testOptInIdempotent = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testOptInIdempotent('addOptIn is idempotent — double opt-in keeps user in set once', async () => {
    await addOptIn('t2_user1')
    await addOptIn('t2_user1')

    const members = await redis.zRange('notify:optin', 0, -1, { by: 'rank' })
    const userEntries = members.filter((m) => m.member === 't2_user1')
    expect(userEntries).toHaveLength(1)
})

const testRemoveOptIn = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testRemoveOptIn('removeOptIn removes user from notify:optin', async () => {
    await addOptIn('t2_user1')
    await removeOptIn('t2_user1')

    const members = await redis.zRange('notify:optin', 0, -1, { by: 'rank' })
    expect(members.map((m) => m.member)).not.toContain('t2_user1')
})

const testRemoveNonMember = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testRemoveNonMember('removeOptIn for non-member does not throw', async () => {
    await expect(removeOptIn('t2_nonexistent')).resolves.not.toThrow()
})

const testIsOptedIn = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testIsOptedIn('isOptedIn returns true after addOptIn', async () => {
    await addOptIn('t2_user1')
    expect(await isOptedIn('t2_user1')).toBe(true)
})

const testIsOptedInFalse = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testIsOptedInFalse('isOptedIn returns false for user not in set', async () => {
    expect(await isOptedIn('t2_nothere')).toBe(false)
})

const testIsOptedInAfterRemove = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testIsOptedInAfterRemove('isOptedIn returns false after removeOptIn', async () => {
    await addOptIn('t2_user1')
    await removeOptIn('t2_user1')
    expect(await isOptedIn('t2_user1')).toBe(false)
})

const testGetOptInUserIds = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testGetOptInUserIds('getOptInUserIds returns all opted-in user IDs', async () => {
    await addOptIn('t2_user1')
    await addOptIn('t2_user2')
    await addOptIn('t2_user3')

    const ids = await getOptInUserIds()
    expect(ids).toHaveLength(3)
    expect(ids).toContain('t2_user1')
    expect(ids).toContain('t2_user2')
    expect(ids).toContain('t2_user3')
})

const testGetOptInEmpty = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testGetOptInEmpty('getOptInUserIds returns empty array when no users opted in', async () => {
    const ids = await getOptInUserIds()
    expect(ids).toEqual([])
})

// ─── getCompleterUserIdsForDate ────────────────────────────────────────────────

const testGetCompleters = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testGetCompleters('getCompleterUserIdsForDate returns users who completed on given date', async () => {
    // Users must be in the opt-in set (the candidate universe for the scan)
    await addOptIn('t2_user1')
    await addOptIn('t2_user2')
    await addOptIn('t2_user3')

    // Seed completion_dates sorted sets for two users on the target date
    const dateTimestamp = new Date('2025-01-14T00:00:00Z').getTime()
    await redis.zAdd('analytics:user:t2_user1:completion_dates', { member: '2025-01-14', score: dateTimestamp })
    await redis.zAdd('analytics:user:t2_user2:completion_dates', { member: '2025-01-14', score: dateTimestamp })
    // user3 completed on a different date
    const otherTimestamp = new Date('2025-01-13T00:00:00Z').getTime()
    await redis.zAdd('analytics:user:t2_user3:completion_dates', { member: '2025-01-13', score: otherTimestamp })

    const completers = await getCompleterUserIdsForDate('2025-01-14')
    expect(completers).toContain('t2_user1')
    expect(completers).toContain('t2_user2')
    expect(completers).not.toContain('t2_user3')
})

const testGetCompletersEmpty = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testGetCompletersEmpty('getCompleterUserIdsForDate returns empty array when no completions', async () => {
    const completers = await getCompleterUserIdsForDate('2025-01-14')
    expect(completers).toEqual([])
})

// ─── tryMarkUserMentioned ──────────────────────────────────────────────────────

const testMarkMentioned = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testMarkMentioned('tryMarkUserMentioned returns true on first call', async () => {
    const result = await tryMarkUserMentioned('2025-01-15', 't2_user1')
    expect(result).toBe(true)
})

const testMarkMentionedDedup = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testMarkMentionedDedup('tryMarkUserMentioned returns false on second call (dedup)', async () => {
    await tryMarkUserMentioned('2025-01-15', 't2_user1')
    const second = await tryMarkUserMentioned('2025-01-15', 't2_user1')
    expect(second).toBe(false)
})

const testMarkMentionedKey = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testMarkMentionedKey('tryMarkUserMentioned sets notify:mentioned:{date}:{userId} key', async () => {
    await tryMarkUserMentioned('2025-01-15', 't2_user1')
    const value = await redis.get('notify:mentioned:2025-01-15:t2_user1')
    expect(value).toBe('1')
})

const testMarkMentionedDifferentDates = createDevvitTest({ userId: 't2_user1', subredditId: 't5_testsub' })

testMarkMentionedDifferentDates('tryMarkUserMentioned allows same user on different dates', async () => {
    const first = await tryMarkUserMentioned('2025-01-15', 't2_user1')
    const second = await tryMarkUserMentioned('2025-01-16', 't2_user1')
    expect(first).toBe(true)
    expect(second).toBe(true)
})

// ─── Property 8: Notify Last-Write-Wins ───────────────────────────────────────

/**
 * **Validates: Requirement 14.7**
 *
 * Property 8: Notify Last-Write-Wins
 * For all sequences of opt-in and opt-out calls for the same user, the final
 * membership of notify:optin equals the membership implied by the last call only.
 *
 * - A sequence ending in 'opt-in'  → isOptedIn returns true
 * - A sequence ending in 'opt-out' → isOptedIn returns false
 */
const testProperty8 = createDevvitTest()

testProperty8('Property 8: notify last-write-wins — final membership equals last call implied state', async () => {
    // Generate a non-empty sequence of opt-in / opt-out operations
    const callArb = fc.constantFrom<'opt-in' | 'opt-out'>('opt-in', 'opt-out')
    const sequenceArb = fc.array(callArb, { minLength: 1, maxLength: 20 })

    // Each fast-check run gets a unique userId to avoid cross-run state bleed
    // within the same test (the Devvit test harness isolates Redis per test,
    // but within a single asyncProperty run we need per-iteration isolation).
    const userIdArb = fc
        .integer({ min: 1, max: 999999 })
        .map((n) => `t2_lww_${n}`)

    await fc.assert(
        fc.asyncProperty(userIdArb, sequenceArb, async (userId, sequence) => {
            // Execute every call in the sequence in order
            for (const call of sequence) {
                if (call === 'opt-in') {
                    await addOptIn(userId)
                } else {
                    await removeOptIn(userId)
                }
            }

            // The last call determines the expected final state
            const lastCall = sequence[sequence.length - 1]
            const expectedOptedIn = lastCall === 'opt-in'

            const actualOptedIn = await isOptedIn(userId)
            return actualOptedIn === expectedOptedIn
        }),
        { numRuns: 100 },
    )
})
