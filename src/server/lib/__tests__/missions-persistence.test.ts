/**
 * Tests for mission persistence and claiming — Redis-backed functions.
 * Separate from pure logic tests in missions.test.ts.
 *
 * Property 3: Mission Generation Idempotence
 * Validates: Requirements 1.8, 3.4, 3.5, 3.6
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { describe, expect, vi, beforeEach, afterEach } from 'vitest'
import { getMissionState, saveMissionState, claimMission } from '../missions'
import type { MissionState } from '../../../shared/engagement-types'

// ─── Mock helpers for deterministic date/week ──────────────────────────────────

vi.mock('../helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../helpers')>()
    return {
        ...actual,
        getTodayUTC: vi.fn(() => '2025-01-15'),
        getISOWeek: vi.fn(() => '2025-W03'),
    }
})

// ─── getMissionState — idempotence (Property 3) ────────────────────────────────

describe('getMissionState — persistence', () => {
    const test = createDevvitTest({ userId: 't2_testuser' })

    test('generates new daily state for first call', async () => {
        const state = await getMissionState('t2_testuser', 'daily')

        expect(state.missions).toHaveLength(3)
        expect(state.allCompleteBonusClaimed).toBe(false)
        for (const mission of state.missions) {
            expect(mission.currentProgress).toBe(0)
            expect(mission.completed).toBe(false)
            expect(mission.claimed).toBe(false)
        }
    })

    const testIdempotent = createDevvitTest({ userId: 't2_testuser' })

    testIdempotent('returns identical state on subsequent calls (Property 3: Mission Generation Idempotence)', async () => {
        const first = await getMissionState('t2_testuser', 'daily')
        const second = await getMissionState('t2_testuser', 'daily')

        expect(first).toEqual(second)
    })

    const testWeekly = createDevvitTest({ userId: 't2_testuser' })

    testWeekly('generates new weekly state for first call', async () => {
        const state = await getMissionState('t2_testuser', 'weekly')

        expect(state.missions).toHaveLength(2)
        expect(state.allCompleteBonusClaimed).toBe(false)
        for (const mission of state.missions) {
            expect(mission.currentProgress).toBe(0)
            expect(mission.completed).toBe(false)
            expect(mission.claimed).toBe(false)
        }
    })

    const testWeeklyIdempotent = createDevvitTest({ userId: 't2_testuser' })

    testWeeklyIdempotent('weekly state is idempotent across calls', async () => {
        const first = await getMissionState('t2_testuser', 'weekly')
        const second = await getMissionState('t2_testuser', 'weekly')

        expect(first).toEqual(second)
    })

    const testPersisted = createDevvitTest({ userId: 't2_testuser' })

    testPersisted('persists generated state to Redis', async () => {
        await getMissionState('t2_testuser', 'daily')

        const raw = await redis.get('user:t2_testuser:missions:daily:2025-01-15')
        expect(raw).toBeDefined()

        const parsed = JSON.parse(raw!) as MissionState
        expect(parsed.missions).toHaveLength(3)
    })
})

// ─── claimMission — awards coins for completed mission ─────────────────────────

describe('claimMission — claiming', () => {
    const testClaim = createDevvitTest({ userId: 't2_testuser' })

    testClaim('awards coins for a completed mission', async () => {
        // Generate state, then manually complete a mission
        const state = await getMissionState('t2_testuser', 'daily')
        const mission = state.missions[0]!
        mission.currentProgress = mission.targetValue
        mission.completed = true
        await saveMissionState('t2_testuser', 'daily', state)

        const result = await claimMission('t2_testuser', mission.templateId, 'daily')

        expect(result.coinsAwarded).toBe(mission.coinReward)

        // Verify coins were added to economy
        const coins = await redis.hGet('user:t2_testuser:economy', 'coins')
        expect(parseInt(coins ?? '0', 10)).toBe(mission.coinReward)

        const totalCoins = await redis.hGet('user:t2_testuser:economy', 'totalCoins')
        expect(parseInt(totalCoins ?? '0', 10)).toBe(mission.coinReward)
    })

    // ─── claimMission — throws for incomplete mission ──────────────────────────

    const testIncomplete = createDevvitTest({ userId: 't2_testuser' })

    testIncomplete('throws error for incomplete mission', async () => {
        const state = await getMissionState('t2_testuser', 'daily')
        const mission = state.missions[0]!

        // Mission is not completed — should throw
        await expect(
            claimMission('t2_testuser', mission.templateId, 'daily')
        ).rejects.toThrow('not yet completed')
    })

    // ─── claimMission — throws for already-claimed mission ─────────────────────

    const testAlreadyClaimed = createDevvitTest({ userId: 't2_testuser' })

    testAlreadyClaimed('throws error for already-claimed mission', async () => {
        // Complete and claim a mission
        const state = await getMissionState('t2_testuser', 'daily')
        const mission = state.missions[0]!
        mission.currentProgress = mission.targetValue
        mission.completed = true
        await saveMissionState('t2_testuser', 'daily', state)

        await claimMission('t2_testuser', mission.templateId, 'daily')

        // Attempt to claim again — should throw
        await expect(
            claimMission('t2_testuser', mission.templateId, 'daily')
        ).rejects.toThrow('already been claimed')
    })

    // ─── claimMission — throws for non-existent mission ────────────────────────

    const testNonExistent = createDevvitTest({ userId: 't2_testuser' })

    testNonExistent('throws error for non-existent mission', async () => {
        // Ensure state exists so we don't get a generation error
        await getMissionState('t2_testuser', 'daily')

        await expect(
            claimMission('t2_testuser', 'nonexistent_mission_id', 'daily')
        ).rejects.toThrow('not found')
    })
})
