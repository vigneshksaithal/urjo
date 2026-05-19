import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/redis'
import { describe, expect, vi, afterEach } from 'vitest'
import { heartbeat, getPresence } from '../presence'

const test = createDevvitTest()

// ─── heartbeat ────────────────────────────────────────────────────────────────

describe('heartbeat', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    test('records user and returns activeCount of 1', async () => {
        const result = await heartbeat('t3_post1', 't2_user1')

        expect(result.activeCount).toBe(1)
        expect(result.players).toHaveLength(1)
        expect(result.players[0]?.userId).toBe('t2_user1')
        expect(result.players[0]?.isRacing).toBe(false)
        expect(result.racingCount).toBe(0)
    })

    test('multiple heartbeats from different users returns correct count', async () => {
        await heartbeat('t3_post1', 't2_user1')
        await heartbeat('t3_post1', 't2_user2')
        const result = await heartbeat('t3_post1', 't2_user3')

        expect(result.activeCount).toBe(3)
        expect(result.players).toHaveLength(3)
    })

    test('stale entries older than 60s are pruned', async () => {
        const now = Date.now()

        // Manually add a stale entry (70s ago)
        await redis.zAdd('presence:t3_post1', { member: 't2_stale', score: now - 70_000 })

        // Fresh heartbeat
        const result = await heartbeat('t3_post1', 't2_fresh')

        // Stale user should be pruned
        expect(result.activeCount).toBe(1)
        expect(result.players.some((p) => p.userId === 't2_stale')).toBe(false)
        expect(result.players[0]?.userId).toBe('t2_fresh')
    })

    test('isRacing is true when activeRace key exists', async () => {
        // Set up an active race for user
        await redis.set('user:t2_racer:activeRace', 'session-123')

        const result = await heartbeat('t3_post1', 't2_racer')

        expect(result.players[0]?.isRacing).toBe(true)
        expect(result.racingCount).toBe(1)
    })

    test('returns max 10 players even if more are active', async () => {
        // Add 12 users
        for (let i = 0; i < 12; i++) {
            await heartbeat('t3_post1', `t2_user${i}`)
        }

        const result = await heartbeat('t3_post1', 't2_user12')

        // activeCount reflects all members
        expect(result.activeCount).toBe(13)
        // But players array is capped at 10
        expect(result.players).toHaveLength(10)
    })
})

// ─── getPresence ──────────────────────────────────────────────────────────────

describe('getPresence', () => {
    test('is read-only — does not add user to presence set', async () => {
        // First add a user via heartbeat
        await heartbeat('t3_post1', 't2_existing')

        // getPresence should not add a new user
        const result = await getPresence('t3_post1')

        expect(result.activeCount).toBe(1)
        expect(result.players[0]?.userId).toBe('t2_existing')
    })

    test('returns empty data when no one is present', async () => {
        const result = await getPresence('t3_empty')

        expect(result.activeCount).toBe(0)
        expect(result.players).toHaveLength(0)
        expect(result.racingCount).toBe(0)
    })

    test('returns racing status correctly', async () => {
        await redis.set('user:t2_racer:activeRace', 'session-abc')
        await heartbeat('t3_post1', 't2_racer')
        await heartbeat('t3_post1', 't2_viewer')

        const result = await getPresence('t3_post1')

        expect(result.activeCount).toBe(2)
        expect(result.racingCount).toBe(1)

        const racer = result.players.find((p) => p.userId === 't2_racer')
        const viewer = result.players.find((p) => p.userId === 't2_viewer')
        expect(racer?.isRacing).toBe(true)
        expect(viewer?.isRacing).toBe(false)
    })
})
