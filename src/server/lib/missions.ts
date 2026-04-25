/**
 * Mission Generation & Progress Tracking
 * Pure functions for deterministic mission selection and progress updates,
 * plus Redis persistence for mission state and claiming.
 */

import { redis } from '@devvit/web/server'
import type {
    MissionCadence,
    MissionTemplate,
    MissionState,
    MissionInstance,
    MissionEvent,
} from '../../shared/engagement-types'
import {
    DAILY_MISSION_TEMPLATES,
    WEEKLY_MISSION_TEMPLATES,
} from '../../shared/engagement-constants'
import { getTodayUTC, getISOWeek } from './helpers'

// ─── Deterministic Hash ────────────────────────────────────────────────────────

/** djb2 string hash — deterministic, fast, no crypto needed */
const djb2Hash = (str: string): number => {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + (str.charCodeAt(i) ?? 0)) | 0
    }
    return Math.abs(hash)
}

// ─── Mission Selection ─────────────────────────────────────────────────────────

/**
 * Select 3 daily missions deterministically from the template pool.
 * Same date + same templates → same result every time.
 */
export const selectDailyMissions = (
    date: string,
    templates: readonly MissionTemplate[]
): MissionTemplate[] => {
    const dailyTemplates = templates.filter((t) => t.cadence === 'daily')
    return selectMissions(date, dailyTemplates, 3)
}

/**
 * Select 2 weekly missions deterministically from the template pool.
 * Same ISO week + same templates → same result every time.
 */
export const selectWeeklyMissions = (
    isoWeek: string,
    templates: readonly MissionTemplate[]
): MissionTemplate[] => {
    const weeklyTemplates = templates.filter((t) => t.cadence === 'weekly')
    return selectMissions(isoWeek, weeklyTemplates, 2)
}

/**
 * Deterministic selection of `count` unique missions from a filtered pool.
 * Uses the seed hash to pick indices without replacement.
 */
const selectMissions = (
    seed: string,
    pool: readonly MissionTemplate[],
    count: number
): MissionTemplate[] => {
    if (pool.length === 0) return []
    const actualCount = Math.min(count, pool.length)

    const hash = djb2Hash(seed)
    const selected: MissionTemplate[] = []
    const remaining = [...pool]

    for (let i = 0; i < actualCount; i++) {
        // Derive a sub-hash for each pick to avoid clustering
        const subHash = djb2Hash(`${seed}:${i}:${hash}`)
        const index = subHash % remaining.length
        const picked = remaining[index]
        if (picked === undefined) break
        selected.push(picked)
        remaining.splice(index, 1)
    }

    return selected
}

// ─── Mission State Generation ──────────────────────────────────────────────────

/**
 * Create initial MissionState from selected templates.
 * All missions start with zero progress, uncompleted, unclaimed.
 */
export const generateMissionState = (templates: MissionTemplate[]): MissionState => ({
    missions: templates.map(
        (t): MissionInstance => ({
            templateId: t.id,
            type: t.type,
            description: t.descriptionTemplate.replace('{n}', String(t.targetValue)),
            targetValue: t.targetValue,
            currentProgress: 0,
            completed: false,
            claimed: false,
            coinReward: t.coinReward,
        })
    ),
    allCompleteBonusClaimed: false,
})

// ─── Mission Progress Update ───────────────────────────────────────────────────

/**
 * Pure function: apply a puzzle-complete event to mission state.
 * Returns a new MissionState without mutating the input.
 * Progress is monotonically non-decreasing; completion is sticky.
 */
export const updateMissionProgress = (
    state: MissionState,
    event: MissionEvent
): MissionState => ({
    ...state,
    missions: state.missions.map((mission) => updateSingleMission(mission, event)),
})

/** Apply event to a single mission instance, returning a new instance. */
const updateSingleMission = (
    mission: MissionInstance,
    event: MissionEvent
): MissionInstance => {
    // Once completed, stay completed — no further progress changes
    if (mission.completed) return mission

    const newProgress = calculateProgress(mission, event)

    // Progress is monotonically non-decreasing
    const clampedProgress = Math.max(mission.currentProgress, newProgress)
    const completionTarget = getCompletionTarget(mission)
    const completed = clampedProgress >= completionTarget

    return {
        ...mission,
        currentProgress: clampedProgress,
        completed,
    }
}

/**
 * Get the completion target for a mission.
 * Binary mission types (solve_under_time, solve_zero_mistakes, solve_grid_size)
 * complete when progress reaches 1 — their targetValue is the condition parameter,
 * not the count needed. Accumulating types use targetValue directly.
 */
const getCompletionTarget = (mission: MissionInstance): number => {
    switch (mission.type) {
        case 'solve_under_time':
        case 'solve_zero_mistakes':
        case 'solve_grid_size':
            return 1
        default:
            return mission.targetValue
    }
}

/** Calculate the new progress value for a mission given an event. */
const calculateProgress = (
    mission: MissionInstance,
    event: MissionEvent
): number => {
    switch (mission.type) {
        case 'solve_n_puzzles':
            return mission.currentProgress + 1

        case 'solve_under_time':
            return event.timeTaken < mission.targetValue ? 1 : mission.currentProgress

        case 'solve_zero_mistakes':
            return event.mistakes === 0 ? 1 : mission.currentProgress

        case 'solve_grid_size':
            return event.gridSize === mission.targetValue ? 1 : mission.currentProgress

        case 'maintain_streak':
            return event.currentStreak

        case 'earn_n_coins':
            return mission.currentProgress + event.coinsEarned

        default:
            // Weekly-only types not handled by puzzle_complete events
            return mission.currentProgress
    }
}

// ─── Redis Key Helpers ─────────────────────────────────────────────────────────

/** Build the Redis key for a user's mission state */
const getMissionKey = (userId: string, cadence: MissionCadence): string => {
    if (cadence === 'daily') {
        return `user:${userId}:missions:daily:${getTodayUTC()}`
    }
    return `user:${userId}:missions:weekly:${getISOWeek()}`
}

// ─── Redis Persistence ─────────────────────────────────────────────────────────

/**
 * Read mission state from Redis, generating a fresh state if none exists.
 * For daily cadence, uses today's UTC date as the key segment.
 * For weekly cadence, uses the current ISO week string.
 */
export const getMissionState = async (
    userId: string,
    cadence: MissionCadence
): Promise<MissionState> => {
    const key = getMissionKey(userId, cadence)
    const existing = await redis.get(key)

    if (existing !== undefined) {
        return JSON.parse(existing) as MissionState
    }

    // Generate new state from the appropriate template pool
    const templates =
        cadence === 'daily'
            ? selectDailyMissions(getTodayUTC(), DAILY_MISSION_TEMPLATES)
            : selectWeeklyMissions(getISOWeek(), WEEKLY_MISSION_TEMPLATES)

    const state = generateMissionState(templates)
    await redis.set(key, JSON.stringify(state))
    return state
}

/**
 * Persist a MissionState to Redis under the appropriate cadence key.
 */
export const saveMissionState = async (
    userId: string,
    cadence: MissionCadence,
    state: MissionState
): Promise<void> => {
    const key = getMissionKey(userId, cadence)
    await redis.set(key, JSON.stringify(state))
}

/**
 * Claim a completed mission's coin reward.
 * Validates the mission exists, is completed, and hasn't been claimed yet.
 * Awards coins via atomic hIncrBy on the user's economy hash.
 */
export const claimMission = async (
    userId: string,
    missionId: string,
    cadence: MissionCadence
): Promise<{ coinsAwarded: number }> => {
    const state = await getMissionState(userId, cadence)

    const mission = state.missions.find((m) => m.templateId === missionId)
    if (!mission) {
        throw new Error(`Mission "${missionId}" not found in ${cadence} missions`)
    }

    if (!mission.completed) {
        throw new Error(`Mission "${missionId}" is not yet completed`)
    }

    if (mission.claimed) {
        throw new Error(`Mission "${missionId}" has already been claimed`)
    }

    // Mark as claimed
    mission.claimed = true
    await saveMissionState(userId, cadence, state)

    // Award coins atomically
    const economyKey = `user:${userId}:economy`
    await Promise.all([
        redis.hIncrBy(economyKey, 'coins', mission.coinReward),
        redis.hIncrBy(economyKey, 'totalCoins', mission.coinReward),
    ])

    return { coinsAwarded: mission.coinReward }
}
