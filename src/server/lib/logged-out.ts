/**
 * Logged-out game responses.
 *
 * Reddit has a large base of logged-out users (SEO, shared links, direct
 * traffic). Per Reddit's "Building for Logged Out Players" guide the core
 * experience must not be gated behind a login wall — so these builders shape
 * a fully-playable game-state / completion response for a viewer with no
 * `context.userId`.
 *
 * Everything account-scoped (streak, coins, season, missions, username,
 * moderator tools) is deliberately omitted: there is no user to key it on,
 * and the client surfaces a login prompt instead. The functions are pure so
 * they can be unit-tested without Redis or the Reddit API.
 */

import type { GameState, CompleteResponse, SerializedPuzzle } from '../../shared/types'
import type { GridSize } from '../../shared/constants'
import { calculatePerformanceScore } from './adaptive'

/** Default skill level / grid size shown to logged-out players. */
const LOGGED_OUT_SKILL_LEVEL = 1
const LOGGED_OUT_GRID_SIZE = 4

/** Weekend-event payload shape, mirrored from GameState for reuse. */
type WeekendEvent = NonNullable<GameState['weekendEvent']>

type LoggedOutStateInput = {
    puzzle: SerializedPuzzle
    postId: string
    isChallenge: boolean
    puzzleNumber?: number
    weekendEvent?: WeekendEvent
}

/**
 * Build the game state served to a logged-out viewer.
 *
 * The puzzle comes straight from the post (no per-user override), gameplay is
 * never gated behind the tutorial/first-screen, and no meta-progression is
 * attached.
 */
export const buildLoggedOutGameState = (input: LoggedOutStateInput): GameState => {
    const { puzzle, postId, isChallenge, puzzleNumber, weekendEvent } = input

    return {
        puzzle,
        isLoggedIn: false,
        // Skip the tutorial/first-screen gate so logged-out users can "just
        // play" immediately — the single highest-leverage rule in the guide.
        tutorialCompleted: true,
        isFirstTimeUser: false,
        skillLevel: LOGGED_OUT_SKILL_LEVEL,
        gridSizePreference: LOGGED_OUT_GRID_SIZE,
        postId,
        isChallenge,
        isMod: false,
        notifyOptIn: false,
        hintsDismissed: { numberConstraint: false, adjacencyViolation: false },
        ...(puzzleNumber !== undefined && { puzzleNumber }),
        ...(weekendEvent !== undefined && { weekendEvent }),
    }
}

type LoggedOutCompleteInput = {
    timeTaken: number
    mistakes: number
    gridSize: GridSize
    weekendEvent?: WeekendEvent
}

/**
 * Build the completion response for a logged-out solve.
 *
 * We still return a performance score so the result screen can show "nice
 * time" framing, but skill level stays at the floor (nothing is persisted)
 * and every reward field is omitted. The weekend event is echoed back so the
 * banner can render, but bonus coins are always zero — there is no wallet.
 */
export const buildLoggedOutCompleteResponse = (
    input: LoggedOutCompleteInput,
): CompleteResponse => {
    const { timeTaken, mistakes, gridSize, weekendEvent } = input
    const performanceScore = calculatePerformanceScore(
        timeTaken,
        LOGGED_OUT_SKILL_LEVEL,
        mistakes,
        gridSize,
    )

    return {
        performanceScore,
        newSkillLevel: LOGGED_OUT_SKILL_LEVEL,
        previousSkillLevel: LOGGED_OUT_SKILL_LEVEL,
        isLoggedIn: false,
        weekendBonusCoins: 0,
        ...(weekendEvent !== undefined && { weekendEvent }),
    }
}
