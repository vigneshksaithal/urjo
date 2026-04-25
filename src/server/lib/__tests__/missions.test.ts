/**
 * Tests for pure mission logic — selection, state generation, progress updates.
 * No Redis or side effects involved.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
    selectDailyMissions,
    selectWeeklyMissions,
    generateMissionState,
    updateMissionProgress,
} from '../missions'
import {
    DAILY_MISSION_TEMPLATES,
    WEEKLY_MISSION_TEMPLATES,
} from '../../../shared/engagement-constants'
import type { MissionTemplate, MissionEvent, MissionState } from '../../../shared/engagement-types'

// ─── selectDailyMissions ───────────────────────────────────────────────────────

describe('selectDailyMissions', () => {
    it('returns exactly 3 missions', () => {
        const result = selectDailyMissions('2025-01-15', DAILY_MISSION_TEMPLATES)
        expect(result).toHaveLength(3)
    })

    it('all returned missions have cadence "daily"', () => {
        const result = selectDailyMissions('2025-01-15', DAILY_MISSION_TEMPLATES)
        for (const mission of result) {
            expect(mission.cadence).toBe('daily')
        }
    })

    it('returns no duplicate missions', () => {
        const result = selectDailyMissions('2025-01-15', DAILY_MISSION_TEMPLATES)
        const ids = result.map((m) => m.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('is deterministic — same date produces same result', () => {
        const a = selectDailyMissions('2025-01-15', DAILY_MISSION_TEMPLATES)
        const b = selectDailyMissions('2025-01-15', DAILY_MISSION_TEMPLATES)
        expect(a).toEqual(b)
    })

    it('different dates produce different selections (with high probability)', () => {
        const a = selectDailyMissions('2025-01-15', DAILY_MISSION_TEMPLATES)
        const b = selectDailyMissions('2025-01-16', DAILY_MISSION_TEMPLATES)
        const aIds = a.map((m) => m.id).sort()
        const bIds = b.map((m) => m.id).sort()
        // Not guaranteed but extremely likely with 12 templates
        expect(aIds).not.toEqual(bIds)
    })

    it('returns empty array when no daily templates exist', () => {
        const weeklyOnly: readonly MissionTemplate[] = WEEKLY_MISSION_TEMPLATES
        const result = selectDailyMissions('2025-01-15', weeklyOnly)
        expect(result).toEqual([])
    })

    it('returns fewer missions when pool is smaller than 3', () => {
        const twoTemplates = DAILY_MISSION_TEMPLATES.slice(0, 2)
        const result = selectDailyMissions('2025-01-15', twoTemplates)
        expect(result).toHaveLength(2)
    })
})

// ─── selectWeeklyMissions ──────────────────────────────────────────────────────

describe('selectWeeklyMissions', () => {
    it('returns exactly 2 missions', () => {
        const result = selectWeeklyMissions('2025-W03', WEEKLY_MISSION_TEMPLATES)
        expect(result).toHaveLength(2)
    })

    it('all returned missions have cadence "weekly"', () => {
        const result = selectWeeklyMissions('2025-W03', WEEKLY_MISSION_TEMPLATES)
        for (const mission of result) {
            expect(mission.cadence).toBe('weekly')
        }
    })

    it('returns no duplicate missions', () => {
        const result = selectWeeklyMissions('2025-W03', WEEKLY_MISSION_TEMPLATES)
        const ids = result.map((m) => m.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('is deterministic — same week produces same result', () => {
        const a = selectWeeklyMissions('2025-W03', WEEKLY_MISSION_TEMPLATES)
        const b = selectWeeklyMissions('2025-W03', WEEKLY_MISSION_TEMPLATES)
        expect(a).toEqual(b)
    })

    it('returns empty array when no weekly templates exist', () => {
        const dailyOnly: readonly MissionTemplate[] = DAILY_MISSION_TEMPLATES
        const result = selectWeeklyMissions('2025-W03', dailyOnly)
        expect(result).toEqual([])
    })
})

// ─── generateMissionState ──────────────────────────────────────────────────────

describe('generateMissionState', () => {
    it('creates missions with zero progress', () => {
        const templates = selectDailyMissions('2025-01-15', DAILY_MISSION_TEMPLATES)
        const state = generateMissionState(templates)

        for (const mission of state.missions) {
            expect(mission.currentProgress).toBe(0)
        }
    })

    it('creates missions that are not completed', () => {
        const templates = selectDailyMissions('2025-01-15', DAILY_MISSION_TEMPLATES)
        const state = generateMissionState(templates)

        for (const mission of state.missions) {
            expect(mission.completed).toBe(false)
        }
    })

    it('creates missions that are not claimed', () => {
        const templates = selectDailyMissions('2025-01-15', DAILY_MISSION_TEMPLATES)
        const state = generateMissionState(templates)

        for (const mission of state.missions) {
            expect(mission.claimed).toBe(false)
        }
    })

    it('allCompleteBonusClaimed starts as false', () => {
        const templates = selectDailyMissions('2025-01-15', DAILY_MISSION_TEMPLATES)
        const state = generateMissionState(templates)
        expect(state.allCompleteBonusClaimed).toBe(false)
    })

    it('replaces {n} in description template with targetValue', () => {
        const templates: MissionTemplate[] = [
            {
                id: 'test',
                type: 'solve_n_puzzles',
                descriptionTemplate: 'Solve {n} puzzles today',
                targetValue: 5,
                coinReward: 25,
                cadence: 'daily',
            },
        ]
        const state = generateMissionState(templates)
        expect(state.missions[0]?.description).toBe('Solve 5 puzzles today')
    })

    it('preserves coinReward from template', () => {
        const templates = selectDailyMissions('2025-01-15', DAILY_MISSION_TEMPLATES)
        const state = generateMissionState(templates)

        for (let i = 0; i < templates.length; i++) {
            expect(state.missions[i]?.coinReward).toBe(templates[i]?.coinReward)
        }
    })
})

// ─── updateMissionProgress ─────────────────────────────────────────────────────

const makeEvent = (overrides: Partial<MissionEvent> = {}): MissionEvent => ({
    type: 'puzzle_complete',
    timeTaken: 30,
    mistakes: 0,
    gridSize: 4,
    skillLevel: 2,
    coinsEarned: 15,
    currentStreak: 3,
    ...overrides,
})

const makeMission = (overrides: Partial<MissionTemplate> = {}): MissionTemplate => ({
    id: 'test_mission',
    type: 'solve_n_puzzles',
    descriptionTemplate: 'Solve {n} puzzles',
    targetValue: 3,
    coinReward: 15,
    cadence: 'daily',
    ...overrides,
})

const makeState = (templates: MissionTemplate[]): MissionState =>
    generateMissionState(templates)

describe('updateMissionProgress', () => {
    it('does not mutate the input state', () => {
        const state = makeState([makeMission()])
        const original = JSON.parse(JSON.stringify(state))
        updateMissionProgress(state, makeEvent())
        expect(state).toEqual(original)
    })

    describe('solve_n_puzzles', () => {
        it('increments progress by 1 per event', () => {
            const state = makeState([makeMission({ type: 'solve_n_puzzles', targetValue: 3 })])
            const updated = updateMissionProgress(state, makeEvent())
            expect(updated.missions[0]?.currentProgress).toBe(1)
        })

        it('marks completed when progress reaches targetValue', () => {
            let state = makeState([makeMission({ type: 'solve_n_puzzles', targetValue: 2 })])
            state = updateMissionProgress(state, makeEvent())
            state = updateMissionProgress(state, makeEvent())
            expect(state.missions[0]?.completed).toBe(true)
        })
    })

    describe('solve_under_time', () => {
        it('sets progress to 1 when timeTaken < targetValue', () => {
            const state = makeState([makeMission({ type: 'solve_under_time', targetValue: 60 })])
            const updated = updateMissionProgress(state, makeEvent({ timeTaken: 30 }))
            expect(updated.missions[0]?.currentProgress).toBe(1)
            expect(updated.missions[0]?.completed).toBe(true)
        })

        it('does not update progress when timeTaken >= targetValue', () => {
            const state = makeState([makeMission({ type: 'solve_under_time', targetValue: 60 })])
            const updated = updateMissionProgress(state, makeEvent({ timeTaken: 60 }))
            expect(updated.missions[0]?.currentProgress).toBe(0)
        })
    })

    describe('solve_zero_mistakes', () => {
        it('sets progress to 1 when mistakes === 0', () => {
            const state = makeState([makeMission({ type: 'solve_zero_mistakes', targetValue: 1 })])
            const updated = updateMissionProgress(state, makeEvent({ mistakes: 0 }))
            expect(updated.missions[0]?.currentProgress).toBe(1)
            expect(updated.missions[0]?.completed).toBe(true)
        })

        it('does not update progress when mistakes > 0', () => {
            const state = makeState([makeMission({ type: 'solve_zero_mistakes', targetValue: 1 })])
            const updated = updateMissionProgress(state, makeEvent({ mistakes: 2 }))
            expect(updated.missions[0]?.currentProgress).toBe(0)
        })
    })

    describe('solve_grid_size', () => {
        it('sets progress to 1 when gridSize matches targetValue', () => {
            const state = makeState([makeMission({ type: 'solve_grid_size', targetValue: 6 })])
            const updated = updateMissionProgress(state, makeEvent({ gridSize: 6 }))
            expect(updated.missions[0]?.currentProgress).toBe(1)
            expect(updated.missions[0]?.completed).toBe(true)
        })

        it('does not update progress when gridSize does not match', () => {
            const state = makeState([makeMission({ type: 'solve_grid_size', targetValue: 6 })])
            const updated = updateMissionProgress(state, makeEvent({ gridSize: 4 }))
            expect(updated.missions[0]?.currentProgress).toBe(0)
        })
    })

    describe('maintain_streak', () => {
        it('sets progress to currentStreak value', () => {
            const state = makeState([makeMission({ type: 'maintain_streak', targetValue: 5 })])
            const updated = updateMissionProgress(state, makeEvent({ currentStreak: 3 }))
            expect(updated.missions[0]?.currentProgress).toBe(3)
        })

        it('marks completed when currentStreak >= targetValue', () => {
            const state = makeState([makeMission({ type: 'maintain_streak', targetValue: 5 })])
            const updated = updateMissionProgress(state, makeEvent({ currentStreak: 5 }))
            expect(updated.missions[0]?.completed).toBe(true)
        })
    })

    describe('earn_n_coins', () => {
        it('adds coinsEarned to progress', () => {
            const state = makeState([makeMission({ type: 'earn_n_coins', targetValue: 50 })])
            const updated = updateMissionProgress(state, makeEvent({ coinsEarned: 15 }))
            expect(updated.missions[0]?.currentProgress).toBe(15)
        })

        it('accumulates across multiple events', () => {
            let state = makeState([makeMission({ type: 'earn_n_coins', targetValue: 50 })])
            state = updateMissionProgress(state, makeEvent({ coinsEarned: 15 }))
            state = updateMissionProgress(state, makeEvent({ coinsEarned: 20 }))
            expect(state.missions[0]?.currentProgress).toBe(35)
        })

        it('marks completed when accumulated coins >= targetValue', () => {
            let state = makeState([makeMission({ type: 'earn_n_coins', targetValue: 30 })])
            state = updateMissionProgress(state, makeEvent({ coinsEarned: 15 }))
            state = updateMissionProgress(state, makeEvent({ coinsEarned: 15 }))
            expect(state.missions[0]?.completed).toBe(true)
        })
    })

    describe('completion stickiness', () => {
        it('once completed, stays completed regardless of subsequent events', () => {
            let state = makeState([makeMission({ type: 'solve_n_puzzles', targetValue: 1 })])
            state = updateMissionProgress(state, makeEvent())
            expect(state.missions[0]?.completed).toBe(true)

            // Another event should not change completed status
            state = updateMissionProgress(state, makeEvent())
            expect(state.missions[0]?.completed).toBe(true)
        })
    })

    describe('progress monotonicity', () => {
        it('progress never decreases for maintain_streak even if streak drops', () => {
            let state = makeState([makeMission({ type: 'maintain_streak', targetValue: 10 })])
            state = updateMissionProgress(state, makeEvent({ currentStreak: 5 }))
            expect(state.missions[0]?.currentProgress).toBe(5)

            // Streak drops — progress should not decrease
            state = updateMissionProgress(state, makeEvent({ currentStreak: 2 }))
            expect(state.missions[0]?.currentProgress).toBe(5)
        })
    })

    describe('weekly-only mission types', () => {
        it('does not update progress for unhandled types like solve_each_grid', () => {
            const state = makeState([makeMission({ type: 'solve_each_grid' as MissionTemplate['type'], targetValue: 3 })])
            const updated = updateMissionProgress(state, makeEvent())
            expect(updated.missions[0]?.currentProgress).toBe(0)
        })
    })
})


// ─── Property-Based Tests ──────────────────────────────────────────────────────

// ─── Generators ────────────────────────────────────────────────────────────────

/** Generate a valid YYYY-MM-DD date string */
const arbDateString = fc
    .record({
        year: fc.integer({ min: 2020, max: 2099 }),
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 28 }), // 28 to avoid invalid dates
    })
    .map(({ year, month, day }) => {
        const mm = String(month).padStart(2, '0')
        const dd = String(day).padStart(2, '0')
        return `${year}-${mm}-${dd}`
    })

/** Generate a valid YYYY-Wnn ISO week string */
const arbIsoWeekString = fc
    .record({
        year: fc.integer({ min: 2020, max: 2099 }),
        week: fc.integer({ min: 1, max: 52 }),
    })
    .map(({ year, week }) => {
        const ww = String(week).padStart(2, '0')
        return `${year}-W${ww}`
    })

/** Generate a MissionEvent with reasonable values */
const arbMissionEvent: fc.Arbitrary<MissionEvent> = fc.record({
    type: fc.constant('puzzle_complete' as const),
    timeTaken: fc.integer({ min: 1, max: 600 }),
    mistakes: fc.integer({ min: 0, max: 20 }),
    gridSize: fc.constantFrom(4, 6, 8),
    skillLevel: fc.integer({ min: 1, max: 10 }),
    coinsEarned: fc.integer({ min: 0, max: 200 }),
    currentStreak: fc.integer({ min: 0, max: 500 }),
})

// ─── Property 1: Deterministic Daily Mission Selection ─────────────────────────

/**
 * **Validates: Requirements 1.1, 1.2**
 */
describe('Property 1: Deterministic Daily Mission Selection', () => {
    it('always returns exactly 3 missions for any date', () => {
        fc.assert(
            fc.property(arbDateString, (date) => {
                const result = selectDailyMissions(date, DAILY_MISSION_TEMPLATES)
                expect(result).toHaveLength(3)
            })
        )
    })

    it('all returned missions have cadence "daily"', () => {
        fc.assert(
            fc.property(arbDateString, (date) => {
                const result = selectDailyMissions(date, DAILY_MISSION_TEMPLATES)
                for (const mission of result) {
                    expect(mission.cadence).toBe('daily')
                }
            })
        )
    })

    it('same date always produces the same result (idempotence)', () => {
        fc.assert(
            fc.property(arbDateString, (date) => {
                const first = selectDailyMissions(date, DAILY_MISSION_TEMPLATES)
                const second = selectDailyMissions(date, DAILY_MISSION_TEMPLATES)
                expect(first).toEqual(second)
            })
        )
    })

    it('no duplicate missions in a single day selection', () => {
        fc.assert(
            fc.property(arbDateString, (date) => {
                const result = selectDailyMissions(date, DAILY_MISSION_TEMPLATES)
                const ids = result.map((m) => m.id)
                expect(new Set(ids).size).toBe(ids.length)
            })
        )
    })
})

// ─── Property 2: Deterministic Weekly Mission Selection ────────────────────────

/**
 * **Validates: Requirements 2.2**
 */
describe('Property 2: Deterministic Weekly Mission Selection', () => {
    it('always returns exactly 2 missions for any ISO week', () => {
        fc.assert(
            fc.property(arbIsoWeekString, (isoWeek) => {
                const result = selectWeeklyMissions(isoWeek, WEEKLY_MISSION_TEMPLATES)
                expect(result).toHaveLength(2)
            })
        )
    })

    it('same week always produces the same result (idempotence)', () => {
        fc.assert(
            fc.property(arbIsoWeekString, (isoWeek) => {
                const first = selectWeeklyMissions(isoWeek, WEEKLY_MISSION_TEMPLATES)
                const second = selectWeeklyMissions(isoWeek, WEEKLY_MISSION_TEMPLATES)
                expect(first).toEqual(second)
            })
        )
    })

    it('no duplicate missions in a single week selection', () => {
        fc.assert(
            fc.property(arbIsoWeekString, (isoWeek) => {
                const result = selectWeeklyMissions(isoWeek, WEEKLY_MISSION_TEMPLATES)
                const ids = result.map((m) => m.id)
                expect(new Set(ids).size).toBe(ids.length)
            })
        )
    })
})

// ─── Property 4: Mission Progress is Monotonic ────────────────────────────────

/**
 * **Validates: Requirements 3.2**
 */
describe('Property 4: Mission Progress is Monotonic', () => {
    it('updateMissionProgress never decreases currentProgress for any mission', () => {
        fc.assert(
            fc.property(
                fc.array(arbMissionEvent, { minLength: 1, maxLength: 20 }),
                (events) => {
                    // Start with all daily templates to cover various mission types
                    const templates = selectDailyMissions('2025-01-15', DAILY_MISSION_TEMPLATES)
                    let state = generateMissionState(templates)

                    for (const event of events) {
                        const prevProgress = state.missions.map((m) => m.currentProgress)
                        state = updateMissionProgress(state, event)

                        for (let i = 0; i < state.missions.length; i++) {
                            const current = state.missions[i]?.currentProgress ?? 0
                            const previous = prevProgress[i] ?? 0
                            expect(current).toBeGreaterThanOrEqual(previous)
                        }
                    }
                }
            )
        )
    })

    it('once completed is true, it stays true through subsequent events', () => {
        fc.assert(
            fc.property(
                fc.array(arbMissionEvent, { minLength: 1, maxLength: 20 }),
                (events) => {
                    const templates = selectDailyMissions('2025-01-15', DAILY_MISSION_TEMPLATES)
                    let state = generateMissionState(templates)

                    const everCompleted = new Set<number>()

                    for (const event of events) {
                        state = updateMissionProgress(state, event)

                        for (let i = 0; i < state.missions.length; i++) {
                            if (state.missions[i]?.completed) {
                                everCompleted.add(i)
                            }
                        }

                        // Every mission that was ever completed must still be completed
                        for (const idx of everCompleted) {
                            expect(state.missions[idx]?.completed).toBe(true)
                        }
                    }
                }
            )
        )
    })
})
