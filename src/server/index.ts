import {
  context,
  createServer,
  getServerPort,
  redis,
  reddit
} from '@devvit/web/server'
import type { TaskResponse } from '@devvit/web/server'
import { serve } from '@hono/node-server'
import type { Context } from 'hono'
import { Hono } from 'hono'

import { createPost } from './post'
import { gameRouter } from './routes/game'
import { economyRouter } from './routes/economy'

const HTTP_STATUS_BAD_REQUEST = 400

export const app = new Hono()

const createPostHandler = async (c: Context) => {
  try {
    const post = await createPost()

    return c.json({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`
    })
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Failed to create post'
    return c.json(
      {
        status: 'error',
        message: errorMessage
      },
      HTTP_STATUS_BAD_REQUEST
    )
  }
}

app.post('/internal/on-app-install', createPostHandler)
app.post('/internal/menu/post-create', createPostHandler)

type LeaderEntry = { medal: '🥇' | '🥈' | '🥉'; username: string; score: number }

const MEDALS = ['🥇', '🥈', '🥉'] as const

// Resolve usernames for leaderboard entries — all lookups run in parallel
const resolveUsernames = async (
  entries: Array<{ member: string; score?: number }>
): Promise<LeaderEntry[]> => {
  const settled = await Promise.all(
    entries.map(async (entry, i) => {
      if (!entry || typeof entry.score !== 'number') return null
      try {
        const user = await reddit.getUserById(entry.member as `t2_${string}`)
        const username: string | undefined = user?.username
        if (typeof username === 'string') {
          return { medal: MEDALS[i]!, username, score: entry.score }
        }
      } catch { /* skip failed lookups */ }
      return null
    })
  )
  return settled.filter((r): r is LeaderEntry => r !== null)
}

// Format a leaderboard section into lines, or return empty array if no entries
const formatLeaderboardSection = (
  header: string,
  leaders: LeaderEntry[],
  formatScore: (score: number) => string
): string[] => {
  if (leaders.length === 0) return []
  return [
    header,
    ...leaders.map(({ medal, username, score }) => `${medal} u/${username} (${formatScore(score)})`),
    '',
  ]
}

// Build a stats comment for the daily puzzle post.
// Pulls top 3 streak leaders, yesterday's top 3 speed, and top 3 coin leaders from Redis.
const buildStatsComment = async (puzzleNumber: number): Promise<string> => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0] ?? ''

  const [streakTop, speedTop, coinsTop] = await Promise.all([
    redis.zRange('leaderboard:streak', 0, 2, { reverse: true, by: 'rank' }),
    redis.zRange(`leaderboard:speed:${yesterday}`, 0, 2, { by: 'rank' }),
    redis.zRange('leaderboard:coins', 0, 2, { reverse: true, by: 'rank' }),
  ])

  const [streakLeaders, speedLeaders, coinsLeaders] = await Promise.all([
    resolveUsernames(streakTop),
    resolveUsernames(speedTop),
    resolveUsernames(coinsTop),
  ])

  return [
    `🧩 **Puzzle #${puzzleNumber}** is live! Tap to play 👆`,
    '',
    ...formatLeaderboardSection('🔥 **Top Streaks**', streakLeaders, (s) => `${s} days`),
    ...formatLeaderboardSection('⚡ **Fastest Yesterday**', speedLeaders, (s) => `${s}s`),
    ...formatLeaderboardSection('🪙 **Coin Leaders**', coinsLeaders, (s) => s.toLocaleString('en-US')),
    '⬆️ Upvote to keep the game alive!',
    'Good luck! 🍀',
  ].join('\n')
}

// Scheduler endpoint for twice-daily puzzle posts
app.post('/internal/scheduler/daily-puzzle', async (c: Context) => {
  try {
    const puzzleNumber = await redis.incrBy('stats:puzzleCounter', 1)
    const title = `🧩 Urjo Puzzle #${puzzleNumber} — Can you solve it?`

    console.log(`[Scheduler] Creating post: ${title}`)

    const post = await createPost(title)

    // Build a stats comment from yesterday's data
    try {
      const statsComment = await buildStatsComment(puzzleNumber)
      if (statsComment) {
        await reddit.submitComment({ id: post.id as `t3_${string}`, text: statsComment })
      }
    } catch (commentErr) {
      console.error('[Scheduler] Stats comment failed (non-critical):', commentErr)
    }

    console.log(`[Scheduler] Post created successfully: ${post.id}`)

    return c.json<TaskResponse>({ status: 'ok' })
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Failed to create scheduled post'
    console.error('[Scheduler] Error:', errorMessage)
    return c.json<TaskResponse>(
      { status: 'error', message: errorMessage },
      500
    )
  }
})

// Register game API routes
app.route('/', gameRouter)
app.route('/', economyRouter)

// Start the Devvit-wrapped server so context (reddit, redis, etc.) is available
// Guard against running in test environment to prevent side effects during test imports
if (process.env['NODE_ENV'] !== 'test') {
  serve({ fetch: app.fetch, port: getServerPort(), createServer })
}
