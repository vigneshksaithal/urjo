/**
 * Unit tests for logged-out game-state and completion builders.
 *
 * These are pure functions (no Redis / Reddit) that shape the responses
 * served to logged-out Reddit users. They must:
 *   - produce a playable puzzle
 *   - flag isLoggedIn: false
 *   - omit all account-scoped meta-progression (streak, coins, season,
 *     missions, username)
 */

import { describe, it, expect } from 'vitest'
import {
    buildLoggedOutGameState,
    buildLoggedOutCompleteResponse,
} from '../logged-out'
import type { SerializedPuzzle } from '../../../shared/types'

const PUZZLE: SerializedPuzzle = {
    colors: 'rrbbrrbbrrbbrrbb',
    numbers: '----------------',
    solution: 'rrbbrrbbrrbbrrbb',
    difficulty: 'easy',
    gridSize: 4,
}

const ACTIVE_WEEKEND = {
    active: true,
    multiplier: 1.5,
    name: 'Weekend Rush',
    emoji: '🎉',
    endsAtMs: 1_000,
    hoursLeft: 5,
} as const

describe('buildLoggedOutGameState', () => {
    it('returns a playable puzzle flagged as logged-out', () => {
        const state = buildLoggedOutGameState({
            puzzle: PUZZLE,
            postId: 't3_abc',
            isChallenge: false,
        })

        expect(state.isLoggedIn).toBe(false)
        expect(state.puzzle).toEqual(PUZZLE)
        expect(state.postId).toBe('t3_abc')
        expect(state.gridSizePreference).toBe(4)
    })

    it('does not gate gameplay behind tutorial or first-screen', () => {
        const state = buildLoggedOutGameState({
            puzzle: PUZZLE,
            postId: 't3_abc',
            isChallenge: false,
        })

        expect(state.tutorialCompleted).toBe(true)
        expect(state.isFirstTimeUser).toBe(false)
        expect(state.firstScreen).toBeUndefined()
    })

    it('omits all account-scoped meta-progression', () => {
        const state = buildLoggedOutGameState({
            puzzle: PUZZLE,
            postId: 't3_abc',
            isChallenge: false,
        })

        expect(state.streak).toBeUndefined()
        expect(state.username).toBeUndefined()
        expect(state.seasonProgress).toBeUndefined()
        expect(state.nextMission).toBeUndefined()
        expect(state.isMod).toBe(false)
        expect(state.notifyOptIn).toBe(false)
    })

    it('preserves challenge flag and optional session-wide context', () => {
        const state = buildLoggedOutGameState({
            puzzle: PUZZLE,
            postId: 't3_abc',
            isChallenge: true,
            puzzleNumber: 42,
            weekendEvent: ACTIVE_WEEKEND,
        })

        expect(state.isChallenge).toBe(true)
        expect(state.puzzleNumber).toBe(42)
        expect(state.weekendEvent).toEqual(ACTIVE_WEEKEND)
    })
})

describe('buildLoggedOutCompleteResponse', () => {
    it('returns a completion result flagged as logged-out with no rewards', () => {
        const res = buildLoggedOutCompleteResponse({
            timeTaken: 30,
            mistakes: 0,
            gridSize: 4,
        })

        expect(res.isLoggedIn).toBe(false)
        expect(res.coinReward).toBeUndefined()
        expect(res.streak).toBeUndefined()
        expect(res.seasonRank).toBeUndefined()
        expect(res.autoChallengeUrl).toBeUndefined()
    })

    it('computes a bounded performance score from time and mistakes', () => {
        const res = buildLoggedOutCompleteResponse({
            timeTaken: 30,
            mistakes: 0,
            gridSize: 4,
        })

        expect(res.performanceScore).toBeGreaterThanOrEqual(0)
        expect(res.performanceScore).toBeLessThanOrEqual(1)
        expect(res.newSkillLevel).toBe(1)
        expect(res.previousSkillLevel).toBe(1)
    })

    it('does not award weekend bonus coins to logged-out players', () => {
        const res = buildLoggedOutCompleteResponse({
            timeTaken: 30,
            mistakes: 0,
            gridSize: 4,
            weekendEvent: ACTIVE_WEEKEND,
        })

        expect(res.weekendBonusCoins).toBe(0)
        expect(res.weekendEvent).toEqual(ACTIVE_WEEKEND)
    })
})
