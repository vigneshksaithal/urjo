import { redis } from '@devvit/web/server'

import { isBoardSolved } from '../../shared/board'
import { isValidGridSize } from '../../shared/constants'
import type { GridSize } from '../../shared/constants'
import { isMeasurementId } from '../../shared/measurement-contract'
import type { SerializedPuzzle } from '../../shared/types'

export const ANONYMOUS_PUZZLE_TTL_SECONDS = 6 * 60 * 60
export const ANONYMOUS_MIGRATION_TTL_SECONDS = 15 * 60

type AnonymousPuzzle = Readonly<{
    sessionId: string
    postId: string
    contentId: string
    puzzle: SerializedPuzzle
    scheduledDate: string | null
    scheduledSlotKey: string | null
    issuedAt: number
}>

type PersistAnonymousPuzzleInput = Omit<AnonymousPuzzle, 'issuedAt' | 'scheduledDate' | 'scheduledSlotKey'> & {
    scheduledDate?: string
    scheduledSlotKey?: string
}

type AnonymousTimer = Readonly<{
    attemptId: string
    startedAt: number
}>

export type AnonymousMigrationReceipt = Readonly<{
    migrationToken: string
    postId: string
    gridSize: GridSize
    timeTaken: number
    completionDate: string
    scheduledDate: string | null
    scheduledSlotKey: string | null
    createdAt: number
}>

type TimerStartResult = Readonly<{
    status: 'started' | 'already-started' | 'unavailable' | 'mismatch'
}>

export type AnonymousVerificationResult =
    | Readonly<{ status: 'unavailable' | 'mismatch' | 'invalid-solution' }>
    | Readonly<{
        status: 'verified'
        migrationToken: string
        timeTaken: number
        gridSize: GridSize
        completionDate: string
    }>

export type AnonymousMigrationClaim =
    | Readonly<{ status: 'claimed'; receipt: AnonymousMigrationReceipt }>
    | Readonly<{ status: 'pending' }>
    | Readonly<{ status: 'finalized'; credited: boolean }>
    | Readonly<{ status: 'unavailable' }>

type PendingMigrationClaim = Readonly<{
    status: 'pending'
    userId: string
    claimedAt: number
}>

type FinalizedMigrationClaim = Readonly<{
    status: 'finalized'
    userId: string
    credited: boolean
    claimedAt: number
    finalizedAt: number
}>

type MigrationClaimState = PendingMigrationClaim | FinalizedMigrationClaim

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const POST_ID_PATTERN = /^t3_[A-Za-z0-9_-]+$/
const SLOT_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const puzzleKey = (sessionId: string, postId: string): string =>
    `anonymous:puzzle:${sessionId}:${postId}`

const timerKey = (sessionId: string, postId: string, contentId: string): string =>
    `anonymous:timer:${sessionId}:${postId}:${contentId}`

const completionKey = (sessionId: string, postId: string, contentId: string): string =>
    `anonymous:completion:${sessionId}:${postId}:${contentId}`

const migrationKey = (migrationToken: string): string =>
    `anonymous:migration:${migrationToken}`

const migrationClaimKey = (migrationToken: string): string =>
    `anonymous:migration:${migrationToken}:claim`

export const persistAnonymousPuzzle = async (
    input: PersistAnonymousPuzzleInput,
    nowMs = Date.now(),
): Promise<void> => {
    validatePuzzleInput(input)
    const record: AnonymousPuzzle = {
        ...input,
        scheduledDate: input.scheduledDate ?? null,
        scheduledSlotKey: input.scheduledSlotKey ?? null,
        issuedAt: nowMs,
    }
    await redis.set(puzzleKey(input.sessionId, input.postId), JSON.stringify(record), {
        expiration: expiresAt(nowMs, ANONYMOUS_PUZZLE_TTL_SECONDS),
    })
}

export const getAnonymousPuzzle = async (
    sessionId: string,
    postId: string,
): Promise<AnonymousPuzzle | null> => {
    if (!isMeasurementId(sessionId) || !POST_ID_PATTERN.test(postId)) return null
    const raw = await redis.get(puzzleKey(sessionId, postId))
    return raw === undefined ? null : parseAnonymousPuzzle(raw)
}

export const startAnonymousPuzzleTimer = async (input: {
    sessionId: string
    postId: string
    contentId: string
    attemptId: string
    nowMs?: number
}): Promise<TimerStartResult> => {
    const puzzle = await getAnonymousPuzzle(input.sessionId, input.postId)
    if (puzzle === null) return { status: 'unavailable' }
    if (puzzle.contentId !== input.contentId || !isMeasurementId(input.attemptId)) {
        return { status: 'mismatch' }
    }

    const nowMs = input.nowMs ?? Date.now()
    const key = timerKey(input.sessionId, input.postId, input.contentId)
    const timer: AnonymousTimer = { attemptId: input.attemptId, startedAt: nowMs }
    const claimed = await redis.set(key, JSON.stringify(timer), {
        nx: true,
        expiration: expiresAt(nowMs, ANONYMOUS_PUZZLE_TTL_SECONDS),
    })
    if (claimed === 'OK') return { status: 'started' }

    const existing = await readTimer(key)
    return existing?.attemptId === input.attemptId
        ? { status: 'already-started' }
        : { status: 'mismatch' }
}

export const verifyAnonymousPuzzleCompletion = async (input: {
    sessionId: string
    postId: string
    contentId: string
    attemptId: string
    board: unknown
    nowMs?: number
}): Promise<AnonymousVerificationResult> => {
    const puzzle = await getAnonymousPuzzle(input.sessionId, input.postId)
    if (puzzle === null) return { status: 'unavailable' }
    if (puzzle.contentId !== input.contentId) return { status: 'mismatch' }

    const timer = await readTimer(timerKey(input.sessionId, input.postId, input.contentId))
    if (timer === null) return { status: 'unavailable' }
    if (timer.attemptId !== input.attemptId) return { status: 'mismatch' }
    if (!isBoardSolved(input.board, puzzle.puzzle.solution)) {
        return { status: 'invalid-solution' }
    }

    const nowMs = input.nowMs ?? Date.now()
    const timeTaken = Math.max(1, Math.ceil((nowMs - timer.startedAt) / 1000))
    return issueMigrationReceipt(puzzle, timeTaken, nowMs)
}

export const claimAnonymousMigration = async (
    migrationToken: string,
    userId: string,
    postId: string,
): Promise<AnonymousMigrationClaim> => {
    const receipt = await readMigrationReceipt(migrationToken)
    if (receipt === null || receipt.postId !== postId) return { status: 'unavailable' }

    const pending: PendingMigrationClaim = { status: 'pending', userId, claimedAt: Date.now() }
    const claimed = await redis.set(migrationClaimKey(migrationToken), JSON.stringify(pending), {
        nx: true,
        expiration: expiresAt(receipt.createdAt, ANONYMOUS_MIGRATION_TTL_SECONDS),
    })
    if (claimed === 'OK') return { status: 'claimed', receipt }

    const existing = await readMigrationClaim(migrationToken)
    if (existing === null || existing.userId !== userId) return { status: 'unavailable' }
    if (existing.status === 'pending') return { status: 'pending' }
    return { status: 'finalized', credited: existing.credited }
}

export const finalizeAnonymousMigration = async (
    migrationToken: string,
    userId: string,
    credited: boolean,
): Promise<void> => {
    const receipt = await readMigrationReceipt(migrationToken)
    if (receipt === null) throw new Error('Anonymous migration receipt not found')

    const key = migrationClaimKey(migrationToken)
    const transaction = await redis.watch(key)
    const current = await readMigrationClaim(migrationToken)
    if (current?.status !== 'pending' || current.userId !== userId) {
        await transaction.unwatch()
        throw new Error('Anonymous migration claim does not match')
    }

    const finalized: FinalizedMigrationClaim = {
        status: 'finalized',
        userId,
        credited,
        claimedAt: current.claimedAt,
        finalizedAt: Date.now(),
    }
    await transaction.multi()
    await transaction.set(key, JSON.stringify(finalized), {
        expiration: expiresAt(receipt.createdAt, ANONYMOUS_MIGRATION_TTL_SECONDS),
    })
    if ((await transaction.exec()).length === 0) {
        throw new Error('Anonymous migration claim changed')
    }
}

const issueMigrationReceipt = async (
    puzzle: AnonymousPuzzle,
    timeTaken: number,
    nowMs: number,
): Promise<AnonymousVerificationResult> => {
    const key = completionKey(puzzle.sessionId, puzzle.postId, puzzle.contentId)
    const existingToken = await redis.get(key)
    if (existingToken !== undefined) {
        const existing = await readMigrationReceipt(existingToken)
        return existing === null ? { status: 'unavailable' } : verifiedResult(existing)
    }

    const receipt = buildMigrationReceipt(puzzle, timeTaken, nowMs)
    const claimed = await redis.set(key, receipt.migrationToken, {
        nx: true,
        expiration: expiresAt(nowMs, ANONYMOUS_MIGRATION_TTL_SECONDS),
    })
    if (claimed !== 'OK') return issueMigrationReceipt(puzzle, timeTaken, nowMs)

    await redis.set(migrationKey(receipt.migrationToken), JSON.stringify(receipt), {
        expiration: expiresAt(nowMs, ANONYMOUS_MIGRATION_TTL_SECONDS),
    })
    return verifiedResult(receipt)
}

const buildMigrationReceipt = (
    puzzle: AnonymousPuzzle,
    timeTaken: number,
    nowMs: number,
): AnonymousMigrationReceipt => ({
    migrationToken: crypto.randomUUID(),
    postId: puzzle.postId,
    gridSize: puzzle.puzzle.gridSize as GridSize,
    timeTaken,
    completionDate: new Date(nowMs).toISOString().slice(0, 10),
    scheduledDate: puzzle.scheduledDate,
    scheduledSlotKey: puzzle.scheduledSlotKey,
    createdAt: nowMs,
})

const verifiedResult = (receipt: AnonymousMigrationReceipt): AnonymousVerificationResult => ({
    status: 'verified',
    migrationToken: receipt.migrationToken,
    timeTaken: receipt.timeTaken,
    gridSize: receipt.gridSize,
    completionDate: receipt.completionDate,
})

const readMigrationReceipt = async (
    migrationToken: string,
): Promise<AnonymousMigrationReceipt | null> => {
    if (!isMeasurementId(migrationToken)) return null
    const raw = await redis.get(migrationKey(migrationToken))
    if (raw === undefined) return null
    return parseMigrationReceipt(raw)
}

const readMigrationClaim = async (
    migrationToken: string,
): Promise<MigrationClaimState | null> => {
    const raw = await redis.get(migrationClaimKey(migrationToken))
    if (raw === undefined) return null
    try {
        const parsed = JSON.parse(raw) as MigrationClaimState
        return parsed.status === 'pending' || parsed.status === 'finalized' ? parsed : null
    } catch {
        return null
    }
}

const readTimer = async (key: string): Promise<AnonymousTimer | null> => {
    const raw = await redis.get(key)
    if (raw === undefined) return null
    try {
        const parsed = JSON.parse(raw) as AnonymousTimer
        return isMeasurementId(parsed.attemptId) && Number.isFinite(parsed.startedAt)
            ? parsed
            : null
    } catch {
        return null
    }
}

const parseAnonymousPuzzle = (raw: string): AnonymousPuzzle | null => {
    try {
        const parsed = JSON.parse(raw) as AnonymousPuzzle
        validatePuzzleInput(parsed)
        return Number.isFinite(parsed.issuedAt) ? parsed : null
    } catch {
        return null
    }
}

const parseMigrationReceipt = (raw: string): AnonymousMigrationReceipt | null => {
    try {
        const parsed = JSON.parse(raw) as AnonymousMigrationReceipt
        if (!isMeasurementId(parsed.migrationToken) || !POST_ID_PATTERN.test(parsed.postId)) return null
        if (!isValidGridSize(parsed.gridSize) || !Number.isInteger(parsed.timeTaken)) return null
        if (!ISO_DATE_PATTERN.test(parsed.completionDate) || !Number.isFinite(parsed.createdAt)) return null
        return parsed
    } catch {
        return null
    }
}

const validatePuzzleInput = (input: PersistAnonymousPuzzleInput | AnonymousPuzzle): void => {
    if (!isMeasurementId(input.sessionId) || !POST_ID_PATTERN.test(input.postId)) {
        throw new Error('Anonymous puzzle identity is invalid')
    }
    if (!isMeasurementId(input.contentId) || !isValidGridSize(input.puzzle.gridSize)) {
        throw new Error('Anonymous puzzle content is invalid')
    }
    if (input.puzzle.solution.length !== input.puzzle.gridSize ** 2) {
        throw new Error('Anonymous puzzle solution is invalid')
    }
    if (input.scheduledDate != null && !ISO_DATE_PATTERN.test(input.scheduledDate)) {
        throw new Error('Anonymous puzzle scheduled date is invalid')
    }
    if (input.scheduledSlotKey != null && !SLOT_KEY_PATTERN.test(input.scheduledSlotKey)) {
        throw new Error('Anonymous puzzle slot is invalid')
    }
}

const expiresAt = (nowMs: number, ttlSeconds: number): Date =>
    new Date(nowMs + ttlSeconds * 1000)
