import {
    ADAPTIVE_HISTORY_SIZE,
    getGridLevelConfig,
    type GridSize,
    VALID_GRID_SIZES,
} from '../../shared/constants'
import { getResultTier } from '../../shared/result-tiers'
import type { AdaptiveHistoryRecord } from '../../shared/types'
import { calculatePerformanceScore, calculateSkipScore } from './adaptive'

type SizeMix = Record<GridSize, number>

type AdaptiveSelectionInput = {
    pathLevel: number
    perGridLevels: Record<GridSize, number>
    adaptiveHistory: AdaptiveHistoryRecord[]
    currentStreak: number
    sessionRun: number
    isFirstPuzzleOfDay: boolean
    isReentry: boolean
    manualOverride?: GridSize
}

export type AdaptiveSelectionResult = {
    gridSize: GridSize
    level: number
    source: 'adaptive' | 'manual'
}

type WeightedCandidate = {
    gridSize: GridSize
    level: number
    weight: number
}

const COMFORT_WINDOW = 8
const RECENT_DOUBLE_COUNT = 3
const STRUGGLE_WINDOW = 5
const SESSION_COMFORT_WINDOW = 3

export const getAdaptiveSizeMix = (pathLevel: number): SizeMix => {
    if (pathLevel <= 3) {
        return { 4: 0.4, 6: 0.5, 8: 0.1 }
    }
    if (pathLevel <= 10) {
        return { 4: 0.2, 6: 0.55, 8: 0.25 }
    }
    if (pathLevel <= 20) {
        return { 4: 0.1, 6: 0.5, 8: 0.4 }
    }
    return { 4: 0.1, 6: 0.4, 8: 0.5 }
}

export const addAdaptiveHistoryRecord = (
    history: AdaptiveHistoryRecord[],
    record: AdaptiveHistoryRecord,
): AdaptiveHistoryRecord[] => {
    const updated = [...history, record]
    if (updated.length <= ADAPTIVE_HISTORY_SIZE) return updated
    return updated.slice(updated.length - ADAPTIVE_HISTORY_SIZE)
}

export const calculateComfortIndex = (history: AdaptiveHistoryRecord[]): number => {
    const recent = history
        .filter((record) => record.source === 'adaptive')
        .slice(-COMFORT_WINDOW)

    if (recent.length === 0) return 0.5

    let weightedTotal = 0
    let totalWeight = 0

    for (let index = 0; index < recent.length; index++) {
        const record = recent[index]!
        const weight = index >= recent.length - RECENT_DOUBLE_COUNT ? 2 : 1
        weightedTotal += scoreAdaptiveRecord(record) * weight
        totalWeight += weight
    }

    return totalWeight === 0 ? 0.5 : weightedTotal / totalWeight
}

export const selectAdaptivePuzzleState = (
    input: AdaptiveSelectionInput,
    random: () => number = Math.random,
): AdaptiveSelectionResult => {
    if (input.manualOverride !== undefined) {
        return {
            gridSize: input.manualOverride,
            level: input.perGridLevels[input.manualOverride],
            source: 'manual',
        }
    }

    const orderedHistory = [...input.adaptiveHistory].sort((left, right) => left.timestamp - right.timestamp)
    const lastRecord = orderedHistory[orderedHistory.length - 1]
    const comfortIndex = calculateComfortIndex(orderedHistory)
    const recentStruggles = orderedHistory
        .slice(-STRUGGLE_WINDOW)
        .filter((record) => isStruggleRecord(record)).length
    const comfortableSession =
        orderedHistory.length >= SESSION_COMFORT_WINDOW &&
        orderedHistory
            .slice(-SESSION_COMFORT_WINDOW)
            .every((record) => !isStruggleRecord(record))

    const comfortBias =
        input.isFirstPuzzleOfDay ||
        input.isReentry ||
        (input.currentStreak >= 7 && (comfortIndex < 0.6 || recentStruggles > 0))
    const shouldRecover = comfortBias || recentStruggles >= 2 || (lastRecord !== undefined && isStruggleRecord(lastRecord))

    let candidates = buildCandidates(input.pathLevel, input.perGridLevels)
    candidates = applyRepeatPenalty(candidates, orderedHistory)
    candidates = filterDoubleEscalation(candidates, lastRecord)
    candidates = applyComfortGuardrails(candidates, {
        lastRecord,
        shouldRecover,
        currentStreak: input.currentStreak,
        sessionRun: input.sessionRun,
        comfortableSession,
    })

    if (candidates.length === 0) {
        candidates = buildCandidates(input.pathLevel, input.perGridLevels)
    }

    const chosen = pickWeightedCandidate(candidates, random)
    return {
        gridSize: chosen.gridSize,
        level: chosen.level,
        source: 'adaptive',
    }
}

const buildCandidates = (
    pathLevel: number,
    perGridLevels: Record<GridSize, number>,
): WeightedCandidate[] => {
    const mix = getAdaptiveSizeMix(pathLevel)
    return VALID_GRID_SIZES.map((gridSize) => ({
        gridSize,
        level: perGridLevels[gridSize],
        weight: mix[gridSize],
    }))
}

const applyRepeatPenalty = (
    candidates: WeightedCandidate[],
    history: AdaptiveHistoryRecord[],
): WeightedCandidate[] => {
    const recent = history.slice(-2)
    if (
        recent.length < 2 ||
        recent[0]?.gridSize !== recent[1]?.gridSize ||
        recent.some((record) => record.source === 'manual')
    ) {
        return candidates
    }

    const repeatedSize = recent[1]!.gridSize
    return candidates.map((candidate) =>
        candidate.gridSize === repeatedSize
            ? { ...candidate, weight: candidate.weight * 0.5 }
            : candidate,
    )
}

const filterDoubleEscalation = (
    candidates: WeightedCandidate[],
    lastRecord: AdaptiveHistoryRecord | undefined,
): WeightedCandidate[] => {
    if (lastRecord === undefined) return candidates

    return candidates.filter((candidate) => {
        const largerGrid = candidate.gridSize > lastRecord.gridSize
        const higherLevel = candidate.level > lastRecord.level
        return !(largerGrid && higherLevel)
    })
}

const applyComfortGuardrails = (
    candidates: WeightedCandidate[],
    context: {
        lastRecord: AdaptiveHistoryRecord | undefined
        shouldRecover: boolean
        currentStreak: number
        sessionRun: number
        comfortableSession: boolean
    },
): WeightedCandidate[] => {
    const { lastRecord, shouldRecover, currentStreak, sessionRun, comfortableSession } = context
    if (lastRecord === undefined) return candidates

    let filtered = [...candidates]

    if (shouldRecover) {
        filtered = filtered.filter((candidate) => candidate.gridSize <= lastRecord.gridSize)
        const smaller = filtered.filter((candidate) => candidate.gridSize < lastRecord.gridSize)
        if (smaller.length > 0) {
            filtered = smaller
        }
    }

    if (currentStreak >= 7 && !comfortableSession) {
        filtered = filtered.filter((candidate) => candidate.gridSize <= lastRecord.gridSize)
    }

    if (sessionRun >= 4 && !comfortableSession) {
        filtered = filtered.filter((candidate) => candidate.gridSize <= lastRecord.gridSize)
    }

    return filtered.length > 0 ? filtered : candidates
}

const isStruggleRecord = (record: AdaptiveHistoryRecord): boolean => {
    if (record.skipped) return true
    const config = getGridLevelConfig(record.gridSize, record.level)
    if (record.timeTaken > config.expectedTime * 1.5) return true
    return getResultTier(record.mistakes, record.gridSize).id === 'scrappy'
}

const scoreAdaptiveRecord = (record: AdaptiveHistoryRecord): number =>
    record.skipped
        ? calculateSkipScore(record.timeTaken, record.level, record.gridSize)
        : calculatePerformanceScore(record.timeTaken, record.level, record.mistakes, record.gridSize)

const pickWeightedCandidate = (
    candidates: WeightedCandidate[],
    random: () => number,
): WeightedCandidate => {
    const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
    if (totalWeight <= 0) return candidates[0]!

    const threshold = random() * totalWeight
    let running = 0
    for (const candidate of candidates) {
        running += candidate.weight
        if (threshold <= running) {
            return candidate
        }
    }

    return candidates[candidates.length - 1]!
}
