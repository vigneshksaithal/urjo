import { context, redis } from '@devvit/web/server'
import type { Context } from 'hono'
import { Hono } from 'hono'

import { STREAK_MILESTONES } from '../../shared/engagement-constants'
import type { MissionTemplate } from '../../shared/engagement-types'
import type { GridSize } from '../../shared/constants'
import { registerUserDynamicKey } from '../lib/account-deletion'
import { getUserEconomy, getUserStreakData } from '../lib/economy'
import { countPlayersAbove, getGridSkillLevel, getPathLevel, getTodayUTC } from '../lib/helpers'
import { getVerifiedDailyMissions } from '../lib/progression-missions'
import { getCurrentSeason } from '../lib/seasons'

const HTTP_STATUS_BAD_REQUEST = 400
const HTTP_STATUS_CONFLICT = 409
const HTTP_STATUS_INTERNAL_ERROR = 500
const CLAIM_TTL_SECONDS = 259200
const CLAIM_ATTEMPTS = 3
const GRID_SIZES = [4, 6, 8] as const satisfies readonly GridSize[]
const MISSION_ID_PATTERN = /^[a-z0-9_]{1,64}$/

type MissionProgress = {
    id: string
    label: string
    progress: number
    target: number
    rewardCoins: number
    completed: boolean
    claimed: boolean
}

type DailySignals = {
    solves: number
    currentStreak: number
    solvedGrids: ReadonlySet<number>
}

type NextGoal = { label: string; progress: number; target: number }

export const progressionRouter = new Hono()

const getProgressionHandler = async (c: Context): Promise<Response> => {
    const { userId } = context
    if (!userId) {
        return c.json({ status: 'error', message: 'Sign in to track progress' }, HTTP_STATUS_BAD_REQUEST)
    }

    try {
        return c.json({ status: 'success', data: await buildProgressionSnapshot(userId) })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load progress'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
}

const claimMissionHandler = async (c: Context): Promise<Response> => {
    const { userId } = context
    if (!userId) {
        return c.json({ status: 'error', message: 'Sign in to claim rewards' }, HTTP_STATUS_BAD_REQUEST)
    }

    const missionId = parseMissionId(await c.req.json().catch(() => null))
    if (missionId === null) {
        return c.json({ status: 'error', message: 'Invalid mission' }, HTTP_STATUS_BAD_REQUEST)
    }

    return claimMissionForUser(c, userId, missionId)
}

progressionRouter.get('/api/progression', getProgressionHandler)
progressionRouter.post('/api/progression/claim-mission', claimMissionHandler)

const claimMissionForUser = async (
    c: Context,
    userId: string,
    missionId: string,
): Promise<Response> => {
    try {
        const before = await buildProgressionSnapshot(userId)
        const mission = before.missions.find((item) => item.id === missionId)
        if (!mission) return c.json({ status: 'error', message: 'Invalid mission' }, HTTP_STATUS_BAD_REQUEST)
        if (!mission.completed) {
            return c.json(
                { status: 'error', message: 'Complete this mission before claiming its reward' },
                HTTP_STATUS_CONFLICT,
            )
        }

        const awarded = await awardMissionOnce(userId, before.date, mission)
        const snapshot = awarded ? await buildProgressionSnapshot(userId) : before
        return c.json({
            status: 'success',
            data: { snapshot, rewardCoins: mission.rewardCoins, alreadyClaimed: !awarded },
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to claim mission reward'
        return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
    }
}

const buildProgressionSnapshot = async (userId: string) => {
    const date = getTodayUTC()
    const season = getCurrentSeason()
    const leaderboardKey = `season:${season.seasonId}:leaderboard`
    const [economy, streak, pathLevel, gridLevels, signals, claims, seasonScore] = await Promise.all([
        getUserEconomy(userId),
        getUserStreakData(userId),
        getPathLevel(userId),
        getGridLevels(userId),
        getDailySignals(userId, date),
        redis.hGetAll(claimsKey(userId, date)),
        redis.zScore(leaderboardKey, userId),
    ])
    const missions = buildDailyMissions(date, signals, claims)
    const rank = await getSeasonRank(leaderboardKey, seasonScore)
    const currentStreak = normalizeCount(streak.currentStreak)

    return {
        date,
        coins: normalizeCount(economy.coins),
        streak: {
            current: currentStreak,
            longest: normalizeCount(streak.longestStreak),
            freezes: normalizeCount(economy.streakFreezes),
        },
        path: { level: pathLevel, gridLevels },
        season: { number: season.seasonNumber, rank, points: normalizeCount(seasonScore ?? 0), endDate: season.endDate },
        missions,
        nextGoal: getNextGoal(missions, currentStreak),
    }
}

const getGridLevels = async (userId: string): Promise<{ 4: number; 6: number; 8: number }> => {
    const [four, six, eight] = await Promise.all(
        GRID_SIZES.map((gridSize) => getGridSkillLevel(userId, gridSize)),
    )
    return { 4: normalizeLevel(four), 6: normalizeLevel(six), 8: normalizeLevel(eight) }
}

const getDailySignals = async (userId: string, date: string): Promise<DailySignals> => {
    const [solvesRaw, streak, ...gridScores] = await Promise.all([
        redis.get(`user:${userId}:seasonSolves:${date}`),
        redis.get(`user:${userId}:streak:current`),
        ...GRID_SIZES.map((gridSize) => redis.zScore(`leaderboard:speed:${date}:${gridSize}`, userId)),
    ])
    const solvedGrids = new Set<number>()
    gridScores.forEach((score, index) => {
        const gridSize = GRID_SIZES[index]
        if (gridSize !== undefined && score !== undefined && score !== null) solvedGrids.add(gridSize)
    })
    return { solves: parseCount(solvesRaw), currentStreak: parseCount(streak), solvedGrids }
}

const buildDailyMissions = (
    date: string,
    signals: DailySignals,
    claims: Record<string, string>,
): MissionProgress[] => getVerifiedDailyMissions(date)
    .map((template) => buildMissionProgress(template, signals, claims[template.id] !== undefined))

const buildMissionProgress = (
    template: MissionTemplate,
    signals: DailySignals,
    claimed: boolean,
): MissionProgress => {
    const target = template.type === 'solve_grid_size' ? 1 : template.targetValue
    const progress = Math.min(target, getMissionProgress(template, signals))
    return {
        id: template.id,
        label: template.descriptionTemplate.replace('{n}', String(template.targetValue)),
        progress,
        target,
        rewardCoins: template.coinReward,
        completed: progress >= target,
        claimed,
    }
}

const getMissionProgress = (template: MissionTemplate, signals: DailySignals): number => {
    switch (template.type) {
        case 'solve_n_puzzles':
            return signals.solves
        case 'solve_grid_size':
            return signals.solvedGrids.has(template.targetValue) ? 1 : 0
        case 'maintain_streak':
            return signals.currentStreak
        default:
            return 0
    }
}

const getNextGoal = (missions: MissionProgress[], currentStreak: number): NextGoal => {
    const claimable = missions.find((mission) => mission.completed && !mission.claimed)
    if (claimable) {
        return { label: `Collect ${claimable.rewardCoins} coins`, progress: 1, target: 1 }
    }

    const incomplete = missions.find((mission) => !mission.completed)
    if (incomplete) {
        return { label: incomplete.label, progress: incomplete.progress, target: incomplete.target }
    }

    const milestone = STREAK_MILESTONES.find((item) => item.threshold > currentStreak)
    if (milestone) {
        return { label: `Reach a ${milestone.threshold}-day streak`, progress: currentStreak, target: milestone.threshold }
    }
    return { label: 'New missions arrive tomorrow', progress: 1, target: 1 }
}

const awardMissionOnce = async (
    userId: string,
    date: string,
    mission: MissionProgress,
): Promise<boolean> => {
    for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
        const awarded = await tryAwardMission(userId, date, mission)
        if (awarded !== null) {
            if (awarded) await redis.expire(claimsKey(userId, date), CLAIM_TTL_SECONDS)
            return awarded
        }
    }
    throw new Error('Unable to atomically claim mission reward')
}

const tryAwardMission = async (
    userId: string,
    date: string,
    mission: MissionProgress,
): Promise<boolean | null> => {
    const missionClaimsKey = claimsKey(userId, date)
    const economyKey = `user:${userId}:economy`
    await registerUserDynamicKey(userId, missionClaimsKey)
    const transaction = await redis.watch(missionClaimsKey, economyKey)
    if (await redis.hGet(missionClaimsKey, mission.id) !== undefined) {
        await transaction.unwatch()
        return false
    }

    await transaction.multi()
    await transaction.hSet(missionClaimsKey, { [mission.id]: new Date().toISOString() })
    await transaction.hIncrBy(economyKey, 'coins', mission.rewardCoins)
    await transaction.hIncrBy(economyKey, 'totalCoins', mission.rewardCoins)
    return (await transaction.exec()).length > 0 ? true : null
}

const getSeasonRank = async (
    leaderboardKey: string,
    score: number | undefined | null,
): Promise<number | null> => {
    if (score === undefined || score === null) return null
    return (await countPlayersAbove(leaderboardKey, score)) + 1
}

const parseMissionId = (raw: unknown): string | null => {
    if (typeof raw !== 'object' || raw === null) return null
    const missionId = (raw as Record<string, unknown>).missionId
    if (typeof missionId !== 'string' || !MISSION_ID_PATTERN.test(missionId)) return null
    return missionId
}

const parseCount = (value: string | undefined): number => {
    const parsed = Number.parseInt(value ?? '0', 10)
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const normalizeCount = (value: number): number =>
    Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0

const normalizeLevel = (value: number | undefined): number =>
    value !== undefined && Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1

const claimsKey = (userId: string, date: string): string =>
    `user:${userId}:missions:${date}`
