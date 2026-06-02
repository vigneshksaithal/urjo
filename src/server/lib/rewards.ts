/**
 * Reddit Developer Rewards command center.
 *
 * Reddit QE CSV uploads are the canonical payout ledger. Internal DQP is only
 * a leading diagnostic, so this module stores Reddit snapshots separately and
 * computes reward status from those rows.
 */

import { redis } from '@devvit/web/server'

import { readGlobalDQP } from './qualified'

export type RedditQESnapshot = {
    date: string
    qualifiedInstalls: number
    qualifiedEngagers: number
    qualifiedEngagersLoggedIn: number
    qualifiedEngagersLoggedOut: number
    qualifiedEngagers7d: number
    qualifiedEngagers7dLoggedIn: number
    qualifiedEngagers7dLoggedOut: number
    qualifiedEngagers14d: number
    qualifiedEngagers14dLoggedIn: number
    qualifiedEngagers14dLoggedOut: number
    tierEligibility: string
}

export type RewardsStatusInput = {
    date: string
    qualifiedEngagers: number
    qualifiedEngagers7d: number
    tierEligibility: string
    internalDqp: number
}

export type RewardsStatus = {
    canonicalSource: 'reddit'
    date: string
    currentTier: number
    nextTargetTier: number | null
    tierEligibility: string
    redditQualifiedEngagers: number
    redditQualifiedEngagers7d: number
    internalDqp: number
    internalVsRedditDrift: number | null
    tier3Target: number
    gapToTier3: number
    multiplierToTier3: number | null
}

export type RewardsIngestResult = {
    rowsStored: number
    latest: RedditQESnapshot
}

const TIER_3_TARGET = 10_000
const SNAPSHOT_TTL_SECONDS = 120 * 86400
const SNAPSHOT_DATE_INDEX = 'rewards:qe:dates'
const LATEST_SNAPSHOT_KEY = 'rewards:qe:latest'

const TIER_THRESHOLDS = [
    { tier: 8, threshold: 1_000_000 },
    { tier: 7, threshold: 250_000 },
    { tier: 6, threshold: 100_000 },
    { tier: 5, threshold: 50_000 },
    { tier: 4, threshold: 25_000 },
    { tier: 3, threshold: TIER_3_TARGET },
    { tier: 2, threshold: 1_000 },
    { tier: 1, threshold: 500 },
] as const

export const parseRedditQECsv = (csv: string): RedditQESnapshot[] => {
    const rows = parseCsvRows(csv.trim())
    const dataRows = rows.slice(1)

    return dataRows
        .filter((row) => row.some((value) => value.trim().length > 0))
        .map(parseSnapshotRow)
}

export const computeRewardsStatus = (input: RewardsStatusInput): RewardsStatus => {
    const currentTier = getTierForDqe(input.qualifiedEngagers7d)
    const drift = computeDrift(input.internalDqp, input.qualifiedEngagers)
    const gapToTier3 = Math.max(0, TIER_3_TARGET - input.qualifiedEngagers7d)
    const multiplierToTier3 = input.qualifiedEngagers7d > 0
        ? TIER_3_TARGET / input.qualifiedEngagers7d
        : null

    return {
        canonicalSource: 'reddit',
        date: input.date,
        currentTier,
        nextTargetTier: getNextTargetTier(currentTier),
        tierEligibility: input.tierEligibility,
        redditQualifiedEngagers: input.qualifiedEngagers,
        redditQualifiedEngagers7d: input.qualifiedEngagers7d,
        internalDqp: input.internalDqp,
        internalVsRedditDrift: drift,
        tier3Target: TIER_3_TARGET,
        gapToTier3,
        multiplierToTier3,
    }
}

export const ingestRedditQECsv = async (csv: string): Promise<RewardsIngestResult> => {
    const snapshots = parseRedditQECsv(csv)
    if (snapshots.length === 0) {
        throw new Error('No Reddit QE rows found')
    }

    await Promise.all(snapshots.map((snapshot) => storeRedditQESnapshot(snapshot)))
    const latest = getLatestSnapshot(snapshots)
    await redis.set(LATEST_SNAPSHOT_KEY, latest.date)
    await redis.expire(LATEST_SNAPSHOT_KEY, SNAPSHOT_TTL_SECONDS)

    return { rowsStored: snapshots.length, latest }
}

export const readLatestRewardsStatus = async (): Promise<RewardsStatus | null> => {
    const latestDate = await readLatestSnapshotDate()
    if (latestDate === null) return null

    const snapshot = await readRedditQESnapshot(latestDate)
    if (snapshot === null) return null

    const internalDqp = await readGlobalDQP(snapshot.date)
    return computeRewardsStatus({
        date: snapshot.date,
        qualifiedEngagers: snapshot.qualifiedEngagers,
        qualifiedEngagers7d: snapshot.qualifiedEngagers7d,
        tierEligibility: snapshot.tierEligibility,
        internalDqp,
    })
}

export const readRedditQESnapshot = async (
    date: string,
): Promise<RedditQESnapshot | null> => {
    const raw = await redis.hGetAll(snapshotKey(date))
    if (Object.keys(raw).length === 0) return null
    return parseStoredSnapshot(raw)
}

const parseSnapshotRow = (row: readonly string[]): RedditQESnapshot => {
    const date = row[0]
    if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('CSV row is missing a valid Date')
    }

    return {
        date,
        qualifiedInstalls: parseNumberField(row[1]),
        qualifiedEngagers: parseNumberField(row[2]),
        qualifiedEngagersLoggedIn: parseNumberField(row[3]),
        qualifiedEngagersLoggedOut: parseNumberField(row[4]),
        qualifiedEngagers7d: parseNumberField(row[5]),
        qualifiedEngagers7dLoggedIn: parseNumberField(row[6]),
        qualifiedEngagers7dLoggedOut: parseNumberField(row[7]),
        qualifiedEngagers14d: parseNumberField(row[8]),
        qualifiedEngagers14dLoggedIn: parseNumberField(row[9]),
        qualifiedEngagers14dLoggedOut: parseNumberField(row[10]),
        tierEligibility: row[11] ?? 'None',
    }
}

const parseCsvRows = (csv: string): string[][] =>
    csv.split(/\r?\n/).map(parseCsvLine)

const parseCsvLine = (line: string): string[] => {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
            inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim())
            current = ''
        } else {
            current += char ?? ''
        }
    }

    values.push(current.trim())
    return values
}

const parseNumberField = (value: string | undefined): number => {
    const parsed = parseFloat((value ?? '0').replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
}

const getTierForDqe = (dqe7d: number): number => {
    const match = TIER_THRESHOLDS.find((tier) => dqe7d >= tier.threshold)
    return match?.tier ?? 0
}

const getNextTargetTier = (currentTier: number): number | null => {
    const ascending = [...TIER_THRESHOLDS].reverse()
    const next = ascending.find((tier) => tier.tier > currentTier)
    return next?.tier ?? null
}

const computeDrift = (internalDqp: number, redditQE: number): number | null => {
    if (redditQE <= 0) return null
    return Math.abs(internalDqp - redditQE) / redditQE
}

const getLatestSnapshot = (snapshots: readonly RedditQESnapshot[]): RedditQESnapshot =>
    snapshots.reduce((latest, snapshot) =>
        snapshot.date > latest.date ? snapshot : latest
    )

const snapshotKey = (date: string): string => `rewards:qe:${date}`

const storeRedditQESnapshot = async (snapshot: RedditQESnapshot): Promise<void> => {
    await Promise.all([
        redis.hSet(snapshotKey(snapshot.date), serializeSnapshot(snapshot)),
        redis.expire(snapshotKey(snapshot.date), SNAPSHOT_TTL_SECONDS),
        redis.zAdd(SNAPSHOT_DATE_INDEX, {
            member: snapshot.date,
            score: new Date(`${snapshot.date}T00:00:00Z`).getTime(),
        }),
        redis.expire(SNAPSHOT_DATE_INDEX, SNAPSHOT_TTL_SECONDS),
    ])
}

const readLatestSnapshotDate = async (): Promise<string | null> => {
    const stored = await redis.get(LATEST_SNAPSHOT_KEY)
    if (stored !== undefined) return stored

    const latest = await redis.zRange(SNAPSHOT_DATE_INDEX, 0, 0, {
        by: 'rank',
        reverse: true,
    })
    return latest[0]?.member ?? null
}

const serializeSnapshot = (snapshot: RedditQESnapshot): Record<string, string> => ({
    date: snapshot.date,
    qualifiedInstalls: snapshot.qualifiedInstalls.toString(),
    qualifiedEngagers: snapshot.qualifiedEngagers.toString(),
    qualifiedEngagersLoggedIn: snapshot.qualifiedEngagersLoggedIn.toString(),
    qualifiedEngagersLoggedOut: snapshot.qualifiedEngagersLoggedOut.toString(),
    qualifiedEngagers7d: snapshot.qualifiedEngagers7d.toString(),
    qualifiedEngagers7dLoggedIn: snapshot.qualifiedEngagers7dLoggedIn.toString(),
    qualifiedEngagers7dLoggedOut: snapshot.qualifiedEngagers7dLoggedOut.toString(),
    qualifiedEngagers14d: snapshot.qualifiedEngagers14d.toString(),
    qualifiedEngagers14dLoggedIn: snapshot.qualifiedEngagers14dLoggedIn.toString(),
    qualifiedEngagers14dLoggedOut: snapshot.qualifiedEngagers14dLoggedOut.toString(),
    tierEligibility: snapshot.tierEligibility,
})

const parseStoredSnapshot = (raw: Record<string, string>): RedditQESnapshot => ({
    date: raw.date ?? '',
    qualifiedInstalls: parseNumberField(raw.qualifiedInstalls),
    qualifiedEngagers: parseNumberField(raw.qualifiedEngagers),
    qualifiedEngagersLoggedIn: parseNumberField(raw.qualifiedEngagersLoggedIn),
    qualifiedEngagersLoggedOut: parseNumberField(raw.qualifiedEngagersLoggedOut),
    qualifiedEngagers7d: parseNumberField(raw.qualifiedEngagers7d),
    qualifiedEngagers7dLoggedIn: parseNumberField(raw.qualifiedEngagers7dLoggedIn),
    qualifiedEngagers7dLoggedOut: parseNumberField(raw.qualifiedEngagers7dLoggedOut),
    qualifiedEngagers14d: parseNumberField(raw.qualifiedEngagers14d),
    qualifiedEngagers14dLoggedIn: parseNumberField(raw.qualifiedEngagers14dLoggedIn),
    qualifiedEngagers14dLoggedOut: parseNumberField(raw.qualifiedEngagers14dLoggedOut),
    tierEligibility: raw.tierEligibility ?? 'None',
})
