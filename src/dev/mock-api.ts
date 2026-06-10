/**
 * Frontend-only dev mock for the `/api/*` endpoints.
 *
 * Devvit apps cannot run their Hono/Redis/Reddit backend offline, so this Vite
 * middleware plugin answers the handful of `/api/*` calls the client makes on
 * load with deterministic fixtures. It exists purely to support the AGENTS.md
 * UI Review Workflow (`bun run local`) — it is never bundled into the Devvit
 * build (only `vite.local.config.ts` registers it).
 *
 * Puzzles are generated mostly empty (tappable) with a couple of locked clue
 * cells kept out of the rightmost column, so the right-edge interaction check
 * in the game-board-cutoff-fix review can cycle colors on the last column.
 */

import type { Plugin, Connect } from 'vite'
import type { ServerResponse } from 'node:http'

type SerializedPuzzle = {
    colors: string
    numbers: string
    solution: string
    difficulty: 'easy' | 'medium' | 'hard' | 'diabolical'
    gridSize: number
}

const SUPPORTED_GRID_SIZES = [4, 6, 8] as const

const buildPuzzle = (gridSize: number): SerializedPuzzle => {
    const cellCount = gridSize * gridSize
    const colors = new Array<string>(cellCount).fill('.')
    const numbers = new Array<string>(cellCount).fill('-')

    // A couple of locked clue cells, deliberately away from the rightmost
    // column (indices `row * gridSize + (gridSize - 1)`) so the last column
    // stays empty/tappable for the interaction check.
    colors[0] = 'r' // row 0, col 0 (locked clue)
    colors[gridSize + 1] = 'b' // row 1, col 1 (locked clue)
    numbers[2] = '3' // row 0, col 2 — a number overlay on an unlocked cell

    const joinedColors = colors.join('')
    const joinedNumbers = numbers.join('')

    return {
        colors: joinedColors,
        numbers: joinedNumbers,
        solution: joinedColors,
        difficulty: 'easy',
        gridSize,
    }
}

const buildGameState = (gridSize: number): Record<string, unknown> => ({
    puzzle: buildPuzzle(gridSize),
    tutorialCompleted: true,
    isLoggedIn: true,
    skillLevel: 1,
    gridSizePreference: gridSize,
    postId: 'dev_post',
    isChallenge: false,
    isFirstTimeUser: false,
    puzzleNumber: 1,
    isMod: false,
    notifyOptIn: false,
    hintsDismissed: { numberConstraint: false, adjacencyViolation: false },
    streak: { currentStreak: 3, longestStreak: 5, lastPlayedDate: null },
    username: 'dev_tester',
    seasonProgress: { rank: 12, score: 340 },
    nextMission: {
        templateId: 'solve_3',
        description: 'Solve 3 puzzles today',
        currentProgress: 1,
        targetValue: 3,
        coinReward: 25,
    },
})

/**
 * Logged-out game state — mirrors the server's buildLoggedOutGameState:
 * a playable puzzle with isLoggedIn false and no account-scoped data. Used
 * for the UI Review Workflow via the `?loggedOut=1` query flag.
 */
const buildLoggedOutGameState = (gridSize: number): Record<string, unknown> => ({
    puzzle: buildPuzzle(gridSize),
    tutorialCompleted: true,
    isLoggedIn: false,
    isFirstTimeUser: false,
    skillLevel: 1,
    gridSizePreference: gridSize,
    postId: 'dev_post',
    isChallenge: false,
    isMod: false,
    notifyOptIn: false,
    hintsDismissed: { numberConstraint: false, adjacencyViolation: false },
    puzzleNumber: 1,
})

const buildEconomy = (): Record<string, unknown> => ({
    coins: 240,
    totalCoins: 1200,
    totalSolves: 18,
    speedSolves: 4,
    equippedTitle: '',
    ownedTitles: [],
    dailyFirstSolve: null,
    streakFreezes: 1,
})

const sendJson = (res: ServerResponse, body: unknown): void => {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
}

const readBody = async (req: Connect.IncomingMessage): Promise<string> => {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
        chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks).toString('utf-8')
}

const parseGridSize = (raw: string): number => {
    try {
        const parsed = JSON.parse(raw) as { gridSize?: unknown }
        const size = Number(parsed.gridSize)
        return SUPPORTED_GRID_SIZES.includes(size as 4 | 6 | 8) ? size : 4
    } catch {
        return 4
    }
}

export const mockApiPlugin = (): Plugin => ({
    name: 'urjo-mock-api',
    configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
            const url = req.url ?? ''
            if (!url.startsWith('/api/')) {
                next()
                return
            }

            const path = url.split('?')[0] ?? url

            // Logged-out review mode: the client page is loaded with
            // `?loggedOut=1`. The flag rides along on the referer header (the
            // client's own fetches don't carry it on the request URL). We also
            // honor a `loggedOut` cookie so it survives client-issued fetches.
            const referer = String(req.headers['referer'] ?? '')
            const cookie = String(req.headers['cookie'] ?? '')
            const loggedOut =
                /[?&]loggedOut=1/.test(referer) ||
                /[?&]loggedOut=1/.test(url) ||
                /(?:^|;\s*)loggedOut=1/.test(cookie)

            if (path === '/api/game/state') {
                sendJson(res, loggedOut ? buildLoggedOutGameState(4) : buildGameState(4))
                return
            }

            if (path === '/api/preview') {
                // Default to a challenge preview so the avatar + battle prompt
                // are exercised. Append `?daily=1` to the page URL to review the
                // non-challenge variant.
                const daily = /[?&]daily=1/.test(referer) || /[?&]daily=1/.test(url)
                const previewColors = 'rb.brb.b.brb.brbr.brbb.r.brb.r.b'.slice(0, 16)
                sendJson(res, {
                    status: 'success',
                    data: daily
                        ? {
                            colors: previewColors,
                            gridSize: 4,
                            isChallenge: false,
                            challengerUsername: null,
                            challengerTime: null,
                            avatarUrl: null,
                        }
                        : {
                            colors: previewColors,
                            gridSize: 4,
                            isChallenge: true,
                            challengerUsername: 'speedrunner',
                            challengerTime: 42,
                            avatarUrl: 'https://www.redditstatic.com/avatars/defaults/v2/avatar_default_3.png',
                        },
                })
                return
            }

            if (loggedOut) {
                // Account-scoped endpoints are gated server-side for logged-out
                // users — mirror that here so the client hides the UI.
                if (
                    path === '/api/economy' ||
                    path === '/api/subscribe/status' ||
                    path === '/api/subscribe'
                ) {
                    res.statusCode = 400
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify({ error: 'User ID required' }))
                    return
                }
            }

            if (path === '/api/game/grid-size') {
                const body = await readBody(req)
                const gridSize = parseGridSize(body)
                sendJson(res, {
                    puzzle: buildPuzzle(gridSize),
                    skillLevel: 1,
                    gridSizePreference: gridSize,
                })
                return
            }

            if (path === '/api/game/next-challenge') {
                sendJson(res, {
                    puzzle: buildPuzzle(4),
                    skillLevel: 1,
                    gridSizePreference: 4,
                })
                return
            }

            if (path === '/api/economy') {
                sendJson(res, buildEconomy())
                return
            }

            if (path === '/api/subscribe/status') {
                sendJson(res, { subscribed: false })
                return
            }

            // Generic OK for fire-and-forget tracking endpoints (dwell, help-tap,
            // notify, tutorial-complete, etc.) so the client never errors on load.
            sendJson(res, { status: 'success' })
        })
    },
})
