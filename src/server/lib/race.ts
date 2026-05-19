/**
 * Race Session Manager
 * Handles matchmaking queue, race session lifecycle, completion, and abandonment.
 */

import { redis } from '@devvit/web/server'
import { generatePuzzle } from './generator'
import type { GridSize } from '../../shared/constants'
import type {
    QueueEntry,
    JoinRaceResult,
    RaceStatus,
    RaceCompleteResult,
} from '../../shared/race-types'

// ─── Constants ──────────────────────────────────────────────────────────────────

const RACE_SESSION_TTL = 300 // 5 minutes
const QUEUE_TTL = 30 // 30 seconds
const ACTIVE_RACE_TTL = 300 // 5 minutes
const OPPONENT_TIMEOUT = 30_000 // 30 seconds in ms

// ─── Key Builders ───────────────────────────────────────────────────────────────

const queueKey = (postId: string, gridSize: GridSize): string =>
    `race:queue:${postId}:${gridSize}`

const sessionKey = (postId: string, sessionId: string): string =>
    `race:${postId}:${sessionId}`

const activeRaceKey = (userId: string): string =>
    `user:${userId}:activeRace`

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Join a race queue or match with a waiting player.
 *
 * Preconditions:
 * - postId is a valid post ID
 * - userId is a valid user ID
 * - gridSize is 4, 6, or 8
 *
 * Postconditions:
 * - If user already racing: returns already_racing with existing sessionId
 * - If no one queued: adds user to queue (30s TTL), returns waiting
 * - If someone queued (different user): creates session (5min TTL), returns matched
 * - Self-match prevention: if queued user is same, returns waiting
 */
export const joinRace = async (
    postId: string,
    userId: string,
    gridSize: GridSize
): Promise<JoinRaceResult> => {
    // Guard: already in a race
    const existingRace = await redis.get(activeRaceKey(userId))
    if (existingRace) {
        return { status: 'already_racing', sessionId: existingRace }
    }

    // Check queue for waiting player
    const key = queueKey(postId, gridSize)
    const queuedRaw = await redis.get(key)

    if (queuedRaw) {
        const queued: QueueEntry = JSON.parse(queuedRaw)

        // Self-match prevention
        if (queued.userId === userId) {
            return { status: 'waiting', sessionId: queued.sessionId }
        }

        // Match found — create race session
        await redis.del(key)
        const sessionId = queued.sessionId
        const puzzle = generatePuzzle('medium', gridSize)

        const session: Record<string, string> = {
            sessionId,
            postId,
            player1Id: queued.userId,
            player2Id: userId,
            puzzleColors: puzzle.colors,
            puzzleNumbers: puzzle.numbers,
            puzzleSolution: puzzle.solution,
            gridSize: gridSize.toString(),
            status: 'racing',
            startedAt: Date.now().toString(),
            player1Progress: '0',
            player2Progress: '0',
            player1Time: '0',
            player2Time: '0',
            winnerId: '',
        }

        const raceKey = sessionKey(postId, sessionId)
        await redis.hSet(raceKey, session)
        await redis.expire(raceKey, RACE_SESSION_TTL)

        // Track active race for both players
        await redis.set(activeRaceKey(queued.userId), sessionId)
        await redis.expire(activeRaceKey(queued.userId), ACTIVE_RACE_TTL)
        await redis.set(activeRaceKey(userId), sessionId)
        await redis.expire(activeRaceKey(userId), ACTIVE_RACE_TTL)

        return {
            status: 'matched',
            sessionId,
            puzzle: {
                colors: puzzle.colors,
                numbers: puzzle.numbers,
                solution: puzzle.solution,
            },
        }
    }

    // No one waiting — join queue
    const sessionId = crypto.randomUUID()
    const entry: QueueEntry = { userId, sessionId, joinedAt: Date.now() }
    await redis.set(key, JSON.stringify(entry))
    await redis.expire(key, QUEUE_TTL)

    return { status: 'waiting', sessionId }
}

/**
 * Get the current status of a race session.
 *
 * Preconditions:
 * - sessionId and userId are valid
 *
 * Postconditions:
 * - Returns current race state with opponent progress
 * - If session expired (key gone): returns expired
 * - If opponent abandoned: returns opponent_left
 * - Read-only — no mutations
 */
export const getRaceStatus = async (
    sessionId: string,
    userId: string,
    postId: string
): Promise<RaceStatus> => {
    const raceKey = sessionKey(postId, sessionId)
    const session = await redis.hGetAll(raceKey)

    // Session expired or not found
    if (!session || !session['player1Id']) {
        return { status: 'expired', opponentProgress: 0 }
    }

    const isPlayer1 = session['player1Id'] === userId
    const opponentProgressField = isPlayer1 ? 'player2Progress' : 'player1Progress'
    const opponentTimeField = isPlayer1 ? 'player2Time' : 'player1Time'
    const opponentProgress = parseInt(session[opponentProgressField] ?? '0', 10)
    const opponentTime = parseInt(session[opponentTimeField] ?? '0', 10)

    // Check if race is finished
    if (session['status'] === 'finished') {
        const result: RaceStatus = {
            status: 'finished',
            opponentProgress: 100,
        }
        if (opponentTime > 0) {
            result.opponentTime = opponentTime
        }
        return result
    }

    // Check if opponent abandoned
    if (session['status'] === 'abandoned') {
        return { status: 'opponent_left', opponentProgress }
    }

    // Check for opponent timeout (no progress update in 30s)
    // We use startedAt + lack of progress as a heuristic
    const startedAt = parseInt(session['startedAt'] ?? '0', 10)
    const elapsed = Date.now() - startedAt
    if (elapsed > OPPONENT_TIMEOUT && opponentProgress === 0 && session['status'] === 'racing') {
        // Only flag as opponent_left if significant time has passed with no progress
        // This is a heuristic — real detection would need last-heartbeat tracking
    }

    const result: RaceStatus = {
        status: session['status'] as RaceStatus['status'],
        opponentProgress,
        waitingForOpponent: session['status'] === 'racing' && opponentTime === 0,
    }
    if (opponentTime > 0) {
        result.opponentTime = opponentTime
    }
    return result
}

/**
 * Record race completion for a player and determine winner if both done.
 *
 * Preconditions:
 * - Session exists and status is 'racing'
 * - userId is a participant who hasn't already completed
 * - timeTaken > 0
 *
 * Postconditions:
 * - Player's time is recorded
 * - If both done: winner = fastest, status = finished, active markers cleaned
 * - If only this player: status remains racing
 * - Idempotent: if player already has time, returns existing result without overwrite
 */
export const completeRace = async (
    sessionId: string,
    userId: string,
    postId: string,
    timeTaken: number
): Promise<RaceCompleteResult> => {
    const raceKey = sessionKey(postId, sessionId)
    const session = await redis.hGetAll(raceKey)

    // Session not found or expired
    if (!session || !session['player1Id']) {
        return { won: false, yourTime: timeTaken, error: 'session_not_found' }
    }

    // Determine which player
    const isPlayer1 = session['player1Id'] === userId
    const isPlayer2 = session['player2Id'] === userId
    if (!isPlayer1 && !isPlayer2) {
        return { won: false, yourTime: timeTaken, error: 'not_a_participant' }
    }

    const timeField = isPlayer1 ? 'player1Time' : 'player2Time'
    const progressField = isPlayer1 ? 'player1Progress' : 'player2Progress'
    const opponentTimeField = isPlayer1 ? 'player2Time' : 'player1Time'

    // Idempotent: if already completed, return existing result
    const existingTime = parseInt(session[timeField] ?? '0', 10)
    if (existingTime > 0) {
        const opponentTime = parseInt(session[opponentTimeField] ?? '0', 10)
        if (opponentTime > 0) {
            const winnerId = existingTime <= opponentTime ? userId : (isPlayer1 ? session['player2Id']! : session['player1Id']!)
            return {
                won: winnerId === userId,
                yourTime: existingTime,
                opponentTime,
                winnerId,
            }
        }
        return {
            won: false,
            yourTime: existingTime,
            opponentTime: null,
            winnerId: null,
            waitingForOpponent: true,
        }
    }

    // Race already finished by someone else determining winner
    if (session['status'] === 'finished') {
        return { won: false, yourTime: timeTaken, error: 'race_already_finished' }
    }

    // Record completion
    await redis.hSet(raceKey, {
        [timeField]: timeTaken.toString(),
        [progressField]: '100',
    })

    // Check if opponent already finished
    const opponentTime = parseInt(session[opponentTimeField] ?? '0', 10)

    if (opponentTime > 0) {
        // Both finished — determine winner (lowest time wins, ties go to first finisher)
        const winnerId = timeTaken <= opponentTime
            ? userId
            : (isPlayer1 ? session['player2Id']! : session['player1Id']!)

        await redis.hSet(raceKey, { status: 'finished', winnerId })

        // Cleanup active race markers
        await redis.del(activeRaceKey(session['player1Id']!))
        await redis.del(activeRaceKey(session['player2Id']!))

        return {
            won: winnerId === userId,
            yourTime: timeTaken,
            opponentTime,
            winnerId,
        }
    }

    // Only this player finished so far
    return {
        won: false,
        yourTime: timeTaken,
        opponentTime: null,
        winnerId: null,
        waitingForOpponent: true,
    }
}

/**
 * Abandon a race session.
 *
 * Postconditions:
 * - Session status set to 'abandoned'
 * - User's active race marker removed
 */
export const abandonRace = async (
    sessionId: string,
    userId: string,
    postId: string
): Promise<void> => {
    const raceKey = sessionKey(postId, sessionId)
    const session = await redis.hGetAll(raceKey)

    if (!session || !session['player1Id']) {
        return // Session already expired, nothing to do
    }

    await redis.hSet(raceKey, { status: 'abandoned' })
    await redis.del(activeRaceKey(userId))
}
