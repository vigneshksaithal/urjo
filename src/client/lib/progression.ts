export type DailyMissionProgress = {
    id: string
    label: string
    progress: number
    target: number
    rewardCoins: number
    completed: boolean
    claimed: boolean
}

export type ProgressionSnapshot = {
    date: string
    coins: number
    streak: { current: number; longest: number; freezes: number }
    path: { level: number; gridLevels: { 4: number; 6: number; 8: number } }
    season: {
        number: number
        rank: number | null
        points: number
        endDate: string
    }
    missions: DailyMissionProgress[]
    nextGoal: { label: string; progress: number; target: number }
}

export type MissionClaimResult = {
    snapshot: ProgressionSnapshot
    rewardCoins: number
    alreadyClaimed: boolean
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type JsonRecord = Record<string, unknown>

export const getProgressPercent = (progress: number, target: number): number => {
    if (target <= 0) return 0
    const percent = Math.round((progress / target) * 100)
    return Math.min(100, Math.max(0, percent))
}

export const loadProgression = async (
    fetcher: Fetcher = fetch,
): Promise<ProgressionSnapshot> => {
    const response = await fetcher('/api/progression')
    const data = await readSuccessData(response)
    if (!isProgressionSnapshot(data)) throw new Error('Progress data is unavailable')
    return data
}

export const claimDailyMission = async (
    missionId: string,
    fetcher: Fetcher = fetch,
): Promise<MissionClaimResult> => {
    const response = await fetcher('/api/progression/claim-mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId }),
    })
    const data = await readSuccessData(response)
    if (!isMissionClaimResult(data)) throw new Error('Mission reward is unavailable')
    return data
}

const readSuccessData = async (response: Response): Promise<unknown> => {
    const payload = await response.json().catch(() => null) as unknown
    if (!isRecord(payload)) throw new Error('Progress service returned an invalid response')
    if (!response.ok || payload.status !== 'success') {
        const message = typeof payload.message === 'string'
            ? payload.message
            : 'Unable to load progress'
        throw new Error(message)
    }
    return payload.data
}

const isProgressionSnapshot = (value: unknown): value is ProgressionSnapshot => {
    if (!isRecord(value) || !Array.isArray(value.missions)) return false
    return typeof value.date === 'string'
        && isFiniteNumber(value.coins)
        && isStreak(value.streak)
        && isPath(value.path)
        && isSeason(value.season)
        && value.missions.every(isMission)
        && isGoal(value.nextGoal)
}

const isMissionClaimResult = (value: unknown): value is MissionClaimResult => {
    if (!isRecord(value)) return false
    return isProgressionSnapshot(value.snapshot)
        && isFiniteNumber(value.rewardCoins)
        && typeof value.alreadyClaimed === 'boolean'
}

const isStreak = (value: unknown): boolean => {
    if (!isRecord(value)) return false
    return isFiniteNumber(value.current)
        && isFiniteNumber(value.longest)
        && isFiniteNumber(value.freezes)
}

const isPath = (value: unknown): boolean => {
    if (!isRecord(value) || !isRecord(value.gridLevels)) return false
    return isFiniteNumber(value.level)
        && isFiniteNumber(value.gridLevels['4'])
        && isFiniteNumber(value.gridLevels['6'])
        && isFiniteNumber(value.gridLevels['8'])
}

const isSeason = (value: unknown): boolean => {
    if (!isRecord(value)) return false
    const rankIsValid = value.rank === null || isFiniteNumber(value.rank)
    return isFiniteNumber(value.number)
        && rankIsValid
        && isFiniteNumber(value.points)
        && typeof value.endDate === 'string'
}

const isMission = (value: unknown): value is DailyMissionProgress => {
    if (!isRecord(value)) return false
    return typeof value.id === 'string'
        && typeof value.label === 'string'
        && isFiniteNumber(value.progress)
        && isFiniteNumber(value.target)
        && isFiniteNumber(value.rewardCoins)
        && typeof value.completed === 'boolean'
        && typeof value.claimed === 'boolean'
}

const isGoal = (value: unknown): boolean => {
    if (!isRecord(value)) return false
    return typeof value.label === 'string'
        && isFiniteNumber(value.progress)
        && isFiniteNumber(value.target)
}

const isRecord = (value: unknown): value is JsonRecord =>
    typeof value === 'object' && value !== null

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value)
