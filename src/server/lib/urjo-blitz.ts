import { realtime, redis } from '@devvit/web/server'

import {
    URJO_BLITZ_CHANNEL,
    getUrjoBlitzEventId,
    getUrjoBlitzPoints,
    isUrjoBlitzEventId,
} from '../../shared/urjo-blitz'
import type {
    UrjoBlitzEvent,
    UrjoBlitzLeaderboardEntry,
    UrjoBlitzState,
    UrjoBlitzSummaryEvent,
    UrjoBlitzViewer,
} from '../../shared/urjo-blitz'

export const URJO_BLITZ_RETENTION_SECONDS = 30 * 24 * 60 * 60
export const URJO_BLITZ_DURATION_MS = 48 * 60 * 60 * 1_000

const TOP_LEADERBOARD_LIMIT = 10
const MAX_WRITE_ATTEMPTS = 3
const USER_ID_PATTERN = /^t2_[a-zA-Z0-9_]{1,64}$/
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/
const COMPLETION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

type StartUrjoBlitzResult = { event: UrjoBlitzEvent; created: boolean }
type CloseUrjoBlitzResult = { event: UrjoBlitzEvent | null; changed: boolean }
type JoinUrjoBlitzResult = { event: UrjoBlitzEvent; joinedNow: boolean }
type RedisTransaction = Awaited<ReturnType<typeof redis.watch>>
type CompletionKeys = {
    done: string
    scores: string
    event: string
    people: string
}
type CompletionReadState = {
    event: UrjoBlitzEvent | null
    joined: string | undefined
    duplicate: string | undefined
    score: number | undefined
}

export type RecordUrjoBlitzCompletionInput = {
    userId: string
    completionId: string
    gridSize: number
    completedAt?: Date
}

export type RecordUrjoBlitzCompletionResult =
    | { recorded: true; eventId: string; points: number; score: number }
    | { recorded: false; reason: 'duplicate'; eventId: string; score: number }
    | { recorded: false; reason: 'inactive' | 'not_joined' }

export class UrjoBlitzInactiveError extends Error {
    public constructor() {
        super('Urjo Blitz is not active')
        this.name = 'UrjoBlitzInactiveError'
    }
}

const currentKey = 'blitz:current'
const metaKey = (eventId: string): string => `blitz:event:${eventId}:meta`
const participantsKey = (eventId: string): string => `blitz:event:${eventId}:participants`
const leaderboardKey = (eventId: string): string => `blitz:event:${eventId}:leaderboard`
const completionsKey = (eventId: string): string => `blitz:event:${eventId}:completions`
const participationKey = (userId: string): string => `user:${userId}:blitz-participation`
const broadcastKey = (eventId: string, bucket: number): string =>
    `blitz:event:${eventId}:broadcast:${bucket}`

export const startUrjoBlitz = async (now = new Date()): Promise<StartUrjoBlitzResult> => {
    requireValidDate(now)
    const eventId = getUrjoBlitzEventId(now)
    const current = await readCurrentEvent()
    if (current?.status === 'active' && current.eventId !== eventId) {
        if (now.getTime() < Date.parse(current.endAt)) return { event: current, created: false }
        await closeUrjoBlitz(current.eventId, now)
    }

    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
        const result = await tryStartEvent(eventId, now)
        if (result !== null) return result
    }
    throw new Error('Unable to atomically start Urjo Blitz')
}

export const closeUrjoBlitz = async (
    eventId: string,
    now = new Date(),
): Promise<CloseUrjoBlitzResult> => {
    requireEventId(eventId)
    requireValidDate(now)

    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
        const result = await tryCloseEvent(eventId, now)
        if (result !== null) return result
    }
    throw new Error('Unable to atomically close Urjo Blitz')
}

export const joinUrjoBlitz = async (
    userId: string,
    username: string,
    now = new Date(),
): Promise<JoinUrjoBlitzResult> => {
    requireUser(userId, username)
    const event = await requireActiveEvent(now)

    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
        const joinedNow = await tryJoinEvent(event, userId, username, now)
        if (joinedNow !== null) {
            const updatedEvent = await requireEvent(event.eventId)
            if (joinedNow) await publishSummary(updatedEvent, now)
            return { event: updatedEvent, joinedNow }
        }
    }
    throw new Error('Unable to atomically join Urjo Blitz')
}

export const recordVerifiedUrjoBlitzCompletion = async (
    input: RecordUrjoBlitzCompletionInput,
): Promise<RecordUrjoBlitzCompletionResult> => {
    requireCompletionInput(input)
    const now = input.completedAt ?? new Date()
    const event = await getActiveEvent(now)
    if (event === null) return { recorded: false, reason: 'inactive' }

    const joined = await redis.hGet(participantsKey(event.eventId), input.userId)
    if (joined === undefined) return { recorded: false, reason: 'not_joined' }

    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
        const result = await tryRecordCompletion(event, input)
        if (result !== null) {
            if (result.recorded) await publishCurrentSummary(event.eventId, now)
            return result
        }
    }
    throw new Error('Unable to atomically record Urjo Blitz completion')
}

export const getUrjoBlitzState = async (
    userId: string | null,
    now = new Date(),
): Promise<UrjoBlitzState> => {
    requireValidDate(now)
    const current = await readCurrentEvent()
    if (current === null) return { event: null, leaderboard: [], viewer: null }

    const event = await closeIfExpired(current, now)
    const [leaderboard, viewer] = await Promise.all([
        getTopLeaderboard(event.eventId),
        userId === null ? Promise.resolve(null) : getViewer(event.eventId, userId),
    ])
    return { event, leaderboard, viewer }
}

export const deleteUrjoBlitzUserData = async (userId: string): Promise<void> => {
    if (!USER_ID_PATTERN.test(userId)) return
    const key = participationKey(userId)
    const events = await redis.zRange(key, 0, -1, { by: 'rank' })
    await Promise.all(events.flatMap(({ member: eventId }) => [
        redis.hDel(participantsKey(eventId), [userId]),
        redis.zRem(leaderboardKey(eventId), [userId]),
    ]))
    await redis.del(key)
}

const tryStartEvent = async (
    eventId: string,
    now: Date,
): Promise<StartUrjoBlitzResult | null> => {
    const key = metaKey(eventId)
    const transaction = await redis.watch(key, currentKey)
    const existing = await readEvent(eventId)
    if (existing !== null) {
        await transaction.unwatch()
        return { event: existing, created: false }
    }

    const event = createEvent(eventId, now)
    await transaction.multi()
    await transaction.hSet(key, serializeEvent(event))
    await transaction.expire(key, URJO_BLITZ_RETENTION_SECONDS)
    await transaction.set(currentKey, eventId)
    await transaction.expire(currentKey, URJO_BLITZ_RETENTION_SECONDS)
    const committed = (await transaction.exec()).length > 0
    if (!committed) return null

    await publishSummary(event, now, true)
    return { event, created: true }
}

const tryCloseEvent = async (
    eventId: string,
    now: Date,
): Promise<CloseUrjoBlitzResult | null> => {
    const key = metaKey(eventId)
    const transaction = await redis.watch(key)
    const event = await readEvent(eventId)
    if (event === null || event.status === 'closed' || now.getTime() < Date.parse(event.endAt)) {
        await transaction.unwatch()
        return { event, changed: false }
    }

    const closed = { ...event, status: 'closed', updatedAt: now.toISOString() } as const
    await transaction.multi()
    await transaction.hSet(key, serializeEvent(closed))
    await transaction.expire(key, URJO_BLITZ_RETENTION_SECONDS)
    const committed = (await transaction.exec()).length > 0
    if (!committed) return null

    await expireEventCollections(eventId)
    await publishSummary(closed, now, true)
    return { event: closed, changed: true }
}

const tryJoinEvent = async (
    event: UrjoBlitzEvent,
    userId: string,
    username: string,
    now: Date,
): Promise<boolean | null> => {
    const peopleKey = participantsKey(event.eventId)
    const eventKey = metaKey(event.eventId)
    const transaction = await redis.watch(peopleKey, eventKey)
    const [current, existing] = await Promise.all([
        readEvent(event.eventId),
        redis.hGet(peopleKey, userId),
    ])
    if (!isEventActive(current, now)) {
        await transaction.unwatch()
        throw new UrjoBlitzInactiveError()
    }
    if (existing !== undefined) {
        await transaction.unwatch()
        return false
    }

    await transaction.multi()
    await transaction.hSet(peopleKey, { [userId]: username })
    await transaction.hSet(eventKey, { updatedAt: now.toISOString() })
    await transaction.hIncrBy(eventKey, 'participantCount', 1)
    await transaction.zAdd(participationKey(userId), { member: event.eventId, score: now.getTime() })
    await addEventExpirations(transaction, event.eventId, userId)
    return (await transaction.exec()).length > 0 ? true : null
}

const tryRecordCompletion = async (
    event: UrjoBlitzEvent,
    input: RecordUrjoBlitzCompletionInput,
): Promise<RecordUrjoBlitzCompletionResult | null> => {
    const now = input.completedAt ?? new Date()
    const keys = getCompletionKeys(event.eventId)
    const transaction = await redis.watch(keys.done, keys.scores, keys.event, keys.people)
    const state = await readCompletionState(event.eventId, input, keys)
    const blocked = getBlockedCompletion(event.eventId, state, now)
    if (blocked !== null) {
        await transaction.unwatch()
        return blocked
    }

    const points = getUrjoBlitzPoints(input.gridSize)
    const nextScore = (state.score ?? 0) + points
    const committed = await commitCompletion(transaction, keys, event.eventId, input, nextScore, now)
    return committed
        ? { recorded: true, eventId: event.eventId, points, score: nextScore }
        : null
}

const readCompletionState = async (
    eventId: string,
    input: RecordUrjoBlitzCompletionInput,
    keys: CompletionKeys,
): Promise<CompletionReadState> => {
    const [event, joined, duplicate, score] = await Promise.all([
        readEvent(eventId),
        redis.hGet(keys.people, input.userId),
        redis.hGet(keys.done, input.completionId),
        redis.zScore(keys.scores, input.userId),
    ])
    return { event, joined, duplicate, score }
}

const getBlockedCompletion = (
    eventId: string,
    state: CompletionReadState,
    now: Date,
): RecordUrjoBlitzCompletionResult | null => {
    if (!isEventActive(state.event, now) || state.joined === undefined) {
        return { recorded: false, reason: state.joined === undefined ? 'not_joined' : 'inactive' }
    }
    if (state.duplicate !== undefined) {
        return { recorded: false, reason: 'duplicate', eventId, score: state.score ?? 0 }
    }
    return null
}

const commitCompletion = async (
    transaction: RedisTransaction,
    keys: CompletionKeys,
    eventId: string,
    input: RecordUrjoBlitzCompletionInput,
    score: number,
    now: Date,
): Promise<boolean> => {
    await transaction.multi()
    await transaction.hSet(keys.done, { [input.completionId]: '1' })
    await transaction.zAdd(keys.scores, { member: input.userId, score })
    await transaction.hSet(keys.event, { updatedAt: now.toISOString() })
    await transaction.hIncrBy(keys.event, 'completionCount', 1)
    await addEventExpirations(transaction, eventId, input.userId)
    return (await transaction.exec()).length > 0
}

const getCompletionKeys = (eventId: string): CompletionKeys => ({
    done: completionsKey(eventId),
    scores: leaderboardKey(eventId),
    event: metaKey(eventId),
    people: participantsKey(eventId),
})

const getActiveEvent = async (now: Date): Promise<UrjoBlitzEvent | null> => {
    requireValidDate(now)
    const current = await readCurrentEvent()
    if (current === null) return null
    const event = await closeIfExpired(current, now)
    return isEventActive(event, now) ? event : null
}

const requireActiveEvent = async (now: Date): Promise<UrjoBlitzEvent> => {
    const event = await getActiveEvent(now)
    if (event === null) throw new UrjoBlitzInactiveError()
    return event
}

const closeIfExpired = async (event: UrjoBlitzEvent, now: Date): Promise<UrjoBlitzEvent> => {
    if (event.status === 'closed' || now.getTime() < Date.parse(event.endAt)) return event
    const result = await closeUrjoBlitz(event.eventId, now)
    return result.event ?? event
}

const getTopLeaderboard = async (eventId: string): Promise<UrjoBlitzLeaderboardEntry[]> => {
    const entries = await redis.zRange(leaderboardKey(eventId), 0, TOP_LEADERBOARD_LIMIT - 1, {
        by: 'rank',
        reverse: true,
    })
    const usernames = await Promise.all(
        entries.map(({ member }) => redis.hGet(participantsKey(eventId), member)),
    )
    return entries.flatMap((entry, index) => {
        const username = usernames[index]
        return username === undefined ? [] : [{ rank: index + 1, username, score: entry.score }]
    })
}

const getViewer = async (eventId: string, userId: string): Promise<UrjoBlitzViewer> => {
    if (!USER_ID_PATTERN.test(userId)) return { joined: false, rank: null, score: 0 }
    const [username, score] = await Promise.all([
        redis.hGet(participantsKey(eventId), userId),
        redis.zScore(leaderboardKey(eventId), userId),
    ])
    if (username === undefined) return { joined: false, rank: null, score: 0 }
    if (score === undefined) return { joined: true, rank: null, score: 0 }

    const higher = await redis.zRange(leaderboardKey(eventId), score + 1, Number.MAX_SAFE_INTEGER, {
        by: 'score',
    })
    return { joined: true, rank: higher.length + 1, score }
}

const publishCurrentSummary = async (eventId: string, now: Date): Promise<void> => {
    const event = await requireEvent(eventId)
    await publishSummary(event, now)
}

const publishSummary = async (
    event: UrjoBlitzEvent,
    now: Date,
    force = false,
): Promise<void> => {
    if (!force && !(await claimBroadcast(event.eventId, now))) return
    const message: UrjoBlitzSummaryEvent = {
        type: 'urjo-blitz-summary',
        eventId: event.eventId,
        status: event.status,
        participantCount: event.participantCount,
        completionCount: event.completionCount,
        updatedAt: event.updatedAt,
    }
    try {
        await realtime.send(URJO_BLITZ_CHANNEL, message)
    } catch (error) {
        console.error('[Urjo Blitz] Realtime summary failed:', error)
    }
}

const claimBroadcast = async (eventId: string, now: Date): Promise<boolean> => {
    const bucket = Math.floor(now.getTime() / 1_000)
    const result = await redis.set(broadcastKey(eventId, bucket), '1', {
        nx: true,
        expiration: new Date(now.getTime() + 10_000),
    })
    return result === 'OK'
}

const readCurrentEvent = async (): Promise<UrjoBlitzEvent | null> => {
    const eventId = await redis.get(currentKey)
    return eventId === undefined || !isUrjoBlitzEventId(eventId) ? null : readEvent(eventId)
}

const readEvent = async (eventId: string): Promise<UrjoBlitzEvent | null> => {
    const raw = await redis.hGetAll(metaKey(eventId))
    if (raw.eventId === undefined || raw.startAt === undefined || raw.endAt === undefined) return null
    if (raw.status !== 'active' && raw.status !== 'closed') return null

    return {
        eventId: raw.eventId,
        status: raw.status,
        startAt: raw.startAt,
        endAt: raw.endAt,
        updatedAt: raw.updatedAt ?? raw.startAt,
        participantCount: parseCounter(raw.participantCount),
        completionCount: parseCounter(raw.completionCount),
    }
}

const requireEvent = async (eventId: string): Promise<UrjoBlitzEvent> => {
    const event = await readEvent(eventId)
    if (event === null) throw new Error('Urjo Blitz event state is missing')
    return event
}

const createEvent = (eventId: string, now: Date): UrjoBlitzEvent => ({
    eventId,
    status: 'active',
    startAt: now.toISOString(),
    endAt: new Date(now.getTime() + URJO_BLITZ_DURATION_MS).toISOString(),
    updatedAt: now.toISOString(),
    participantCount: 0,
    completionCount: 0,
})

const serializeEvent = (event: UrjoBlitzEvent): Record<string, string> => ({
    eventId: event.eventId,
    status: event.status,
    startAt: event.startAt,
    endAt: event.endAt,
    updatedAt: event.updatedAt,
    participantCount: event.participantCount.toString(),
    completionCount: event.completionCount.toString(),
})

const addEventExpirations = async (
    transaction: RedisTransaction,
    eventId: string,
    userId: string,
): Promise<void> => {
    for (const key of [
        metaKey(eventId), participantsKey(eventId), leaderboardKey(eventId),
        completionsKey(eventId), participationKey(userId), currentKey,
    ]) {
        await transaction.expire(key, URJO_BLITZ_RETENTION_SECONDS)
    }
}

const expireEventCollections = async (eventId: string): Promise<void> => {
    await Promise.all([
        currentKey, metaKey(eventId), participantsKey(eventId),
        leaderboardKey(eventId), completionsKey(eventId),
    ].map((key) => redis.expire(key, URJO_BLITZ_RETENTION_SECONDS)))
}

const isEventActive = (event: UrjoBlitzEvent | null, now: Date): boolean =>
    event?.status === 'active'
    && now.getTime() >= Date.parse(event.startAt)
    && now.getTime() < Date.parse(event.endAt)

const parseCounter = (value: string | undefined): number => {
    const parsed = parseInt(value ?? '0', 10)
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const requireEventId = (eventId: string): void => {
    if (!isUrjoBlitzEventId(eventId)) throw new Error('Urjo Blitz event ID is invalid')
}

const requireValidDate = (date: Date): void => {
    if (!Number.isFinite(date.getTime())) throw new Error('Urjo Blitz date is invalid')
}

const requireUser = (userId: string, username: string): void => {
    if (!USER_ID_PATTERN.test(userId)) throw new Error('Urjo Blitz user ID is invalid')
    if (!USERNAME_PATTERN.test(username)) throw new Error('Urjo Blitz username is invalid')
}

const requireCompletionInput = (input: RecordUrjoBlitzCompletionInput): void => {
    requireValidDate(input.completedAt ?? new Date())
    if (!USER_ID_PATTERN.test(input.userId)) throw new Error('Urjo Blitz user ID is invalid')
    if (!COMPLETION_ID_PATTERN.test(input.completionId)) {
        throw new Error('Urjo Blitz completion ID is invalid')
    }
    getUrjoBlitzPoints(input.gridSize)
}
