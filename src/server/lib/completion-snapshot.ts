/**
 * Immutable, server-verified completion records used by explicit UGC actions.
 * Mutable challenge/comment publication state is stored separately so the
 * verified result itself is never rewritten.
 */
import { redis } from '@devvit/web/server'

export const COMPLETION_SNAPSHOT_TTL_SECONDS = 30 * 24 * 60 * 60

export const COMPLETION_ACTION_TYPES = ['challenge', 'result-comment'] as const

export type CompletionActionType = typeof COMPLETION_ACTION_TYPES[number]
export type CompletionColor = 'red' | 'blue'

export type CreateCompletionSnapshotInput = {
    userId: string
    sourcePostId: string
    puzzleInstanceId: string
    puzzleNumber: number
    gridSize: 4 | 6 | 8
    skillLevel: number
    timeTaken: number
    streak: number
    colorGrid: readonly (readonly CompletionColor[])[]
}

export type CompletionSnapshot = Readonly<CreateCompletionSnapshotInput & {
    completionId: string
    createdAt: number
}>

type PendingActionState = Readonly<{
    status: 'pending'
    claimToken: string
    claimedAt: number
}>

export type FinalizedCompletionAction = Readonly<{
    status: 'finalized'
    resourceId: string
    claimedAt: number
    finalizedAt: number
}>

type CompletionActionState = PendingActionState | FinalizedCompletionAction

export type CompletionActionClaim =
    | Readonly<{ status: 'claimed'; claimToken: string }>
    | Readonly<{ status: 'pending' }>
    | FinalizedCompletionAction

const snapshotKey = (userId: string, completionId: string): string =>
    `user:${userId}:completion:${completionId}`

const actionKey = (
    userId: string,
    completionId: string,
    action: CompletionActionType,
): string => `user:${userId}:completion:${completionId}:action:${action}`

const completionIndexKey = (userId: string): string =>
    `user:${userId}:completions`

const latestByPostKey = (userId: string): string =>
    `user:${userId}:completionLatestByPost`

const expiresAt = (createdAt: number): Date =>
    new Date(createdAt + COMPLETION_SNAPSHOT_TTL_SECONDS * 1000)

export const createCompletionSnapshot = async (
    input: CreateCompletionSnapshotInput,
): Promise<CompletionSnapshot> => {
    validateSnapshotInput(input)

    const snapshot: CompletionSnapshot = {
        ...input,
        colorGrid: input.colorGrid.map((row) => [...row]),
        completionId: crypto.randomUUID(),
        createdAt: Date.now(),
    }
    await persistSnapshot(snapshot)
    return snapshot
}

export const getOwnedCompletionSnapshot = async (
    userId: string,
    completionId: string,
): Promise<CompletionSnapshot | null> => {
    const raw = await redis.get(snapshotKey(userId, completionId))
    if (raw === undefined) return null

    const snapshot = parseSnapshot(raw)
    if (
        snapshot === null ||
        snapshot.userId !== userId ||
        snapshot.completionId !== completionId
    ) return null

    return snapshot
}

export const getLatestCompletionForPost = async (
    userId: string,
    sourcePostId: string,
): Promise<CompletionSnapshot | null> => {
    const completionId = await redis.hGet(latestByPostKey(userId), sourcePostId)
    if (completionId === undefined) return null

    const snapshot = await getOwnedCompletionSnapshot(userId, completionId)
    return snapshot?.sourcePostId === sourcePostId ? snapshot : null
}

export const claimCompletionAction = async (
    userId: string,
    completionId: string,
    action: CompletionActionType,
): Promise<CompletionActionClaim> => {
    const snapshot = await requireOwnedSnapshot(userId, completionId)
    const key = actionKey(userId, completionId, action)
    const pending: PendingActionState = {
        status: 'pending',
        claimToken: crypto.randomUUID(),
        claimedAt: Date.now(),
    }

    const result = await redis.set(key, JSON.stringify(pending), {
        nx: true,
        expiration: expiresAt(snapshot.createdAt),
    })
    if (result === 'OK') return { status: 'claimed', claimToken: pending.claimToken }

    const existing = await readActionState(key)
    if (existing?.status === 'finalized') return existing
    return { status: 'pending' }
}

export const finalizeCompletionAction = async (
    userId: string,
    completionId: string,
    action: CompletionActionType,
    claimToken: string,
    resourceId: string,
): Promise<FinalizedCompletionAction> => {
    if (resourceId.length === 0) throw new Error('Completion action resource ID is required')
    const snapshot = await requireOwnedSnapshot(userId, completionId)
    const key = actionKey(userId, completionId, action)
    const transaction = await redis.watch(key)
    const current = await readActionState(key)

    if (current?.status === 'finalized') {
        await transaction.unwatch()
        if (current.resourceId === resourceId) return current
        throw new Error('Completion action already finalized with a different resource')
    }
    if (current?.status !== 'pending' || current.claimToken !== claimToken) {
        await transaction.unwatch()
        throw new Error('Completion action claim does not match')
    }

    const finalized: FinalizedCompletionAction = {
        status: 'finalized',
        resourceId,
        claimedAt: current.claimedAt,
        finalizedAt: Date.now(),
    }
    await transaction.multi()
    await transaction.set(key, JSON.stringify(finalized), {
        expiration: expiresAt(snapshot.createdAt),
    })
    const result = await transaction.exec()
    if (result.length === 0) throw new Error('Completion action changed; retry finalization')
    return finalized
}

export const releaseCompletionAction = async (
    userId: string,
    completionId: string,
    action: CompletionActionType,
    claimToken: string,
): Promise<boolean> => {
    await requireOwnedSnapshot(userId, completionId)
    const key = actionKey(userId, completionId, action)
    const transaction = await redis.watch(key)
    const current = await readActionState(key)
    if (current?.status !== 'pending' || current.claimToken !== claimToken) {
        await transaction.unwatch()
        return false
    }

    await transaction.multi()
    await transaction.del(key)
    const result = await transaction.exec()
    return result.length > 0
}

export const deleteCompletionSnapshotsForUser = async (userId: string): Promise<void> => {
    const entries = await redis.zRange(completionIndexKey(userId), 0, -1, { by: 'rank' })
    const snapshotKeys = entries.flatMap(({ member: completionId }) => [
        snapshotKey(userId, completionId),
        ...COMPLETION_ACTION_TYPES.map((action) => actionKey(userId, completionId, action)),
    ])

    if (snapshotKeys.length > 0) await redis.del(...snapshotKeys)
    await redis.del(completionIndexKey(userId), latestByPostKey(userId))
}

const requireOwnedSnapshot = async (
    userId: string,
    completionId: string,
): Promise<CompletionSnapshot> => {
    const snapshot = await getOwnedCompletionSnapshot(userId, completionId)
    if (snapshot === null) throw new Error('Completion snapshot not found')
    return snapshot
}

const persistSnapshot = async (snapshot: CompletionSnapshot): Promise<void> => {
    const key = snapshotKey(snapshot.userId, snapshot.completionId)
    const transaction = await redis.watch(key)
    if (await redis.get(key) !== undefined) {
        await transaction.unwatch()
        throw new Error('Completion snapshot ID already exists')
    }

    await transaction.multi()
    await transaction.set(key, JSON.stringify(snapshot), {
        expiration: expiresAt(snapshot.createdAt),
    })
    await transaction.zAdd(completionIndexKey(snapshot.userId), {
        member: snapshot.completionId,
        score: snapshot.createdAt,
    })
    await transaction.expire(completionIndexKey(snapshot.userId), COMPLETION_SNAPSHOT_TTL_SECONDS)
    await transaction.hSet(latestByPostKey(snapshot.userId), {
        [snapshot.sourcePostId]: snapshot.completionId,
    })
    await transaction.expire(latestByPostKey(snapshot.userId), COMPLETION_SNAPSHOT_TTL_SECONDS)

    const result = await transaction.exec()
    if (result.length === 0) throw new Error('Unable to persist completion snapshot')
}

const readActionState = async (key: string): Promise<CompletionActionState | null> => {
    const raw = await redis.get(key)
    if (raw === undefined) return null

    try {
        const parsed = JSON.parse(raw) as CompletionActionState
        return parsed.status === 'pending' || parsed.status === 'finalized' ? parsed : null
    } catch {
        return null
    }
}

const parseSnapshot = (raw: string): CompletionSnapshot | null => {
    try {
        const parsed = JSON.parse(raw) as CompletionSnapshot
        return typeof parsed === 'object' && parsed !== null ? parsed : null
    } catch {
        return null
    }
}

const validateSnapshotInput = (input: CreateCompletionSnapshotInput): void => {
    if (input.userId.length === 0 || input.sourcePostId.length === 0 || input.puzzleInstanceId.length === 0) {
        throw new Error('Completion snapshot identifiers are required')
    }
    if (!Number.isInteger(input.puzzleNumber) || input.puzzleNumber < 1) {
        throw new Error('Completion snapshot puzzle number is invalid')
    }
    if (![4, 6, 8].includes(input.gridSize)) {
        throw new Error('Completion snapshot grid size is invalid')
    }
    if (!Number.isInteger(input.skillLevel) || input.skillLevel < 1) {
        throw new Error('Completion snapshot skill level is invalid')
    }
    if (!Number.isInteger(input.timeTaken) || input.timeTaken < 1) {
        throw new Error('Completion snapshot time is invalid')
    }
    if (!Number.isInteger(input.streak) || input.streak < 0) {
        throw new Error('Completion snapshot streak is invalid')
    }
    if (
        input.colorGrid.length !== input.gridSize ||
        input.colorGrid.some((row) =>
            row.length !== input.gridSize || row.some((color) => color !== 'red' && color !== 'blue')
        )
    ) throw new Error('Completion snapshot color grid is invalid')
}
