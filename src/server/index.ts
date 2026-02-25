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

const app = new Hono()

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

/**
 * Build a stats comment for the daily puzzle post.
 * Pulls streak leader, today's speed leader, and total games from Redis.
 */
async function buildStatsComment(puzzleNumber: number): Promise<string> {
  // Streak leader
  const streakTop = await redis.zRange('leaderboard:streak', 0, 0, { reverse: true, by: 'rank' })
  let streakLine = ''
  if (streakTop.length > 0 && streakTop[0]) {
    const entry = streakTop[0]
    try {
      const user = await reddit.getUserById(entry.member as `t2_${string}`)
      if (user) {
        streakLine = `🔥 **Streak Leader:** u/${user.username} (${entry.score} days)`
      }
    } catch { /* skip */ }
  }

  // Yesterday's speed leader
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0] ?? ''
  const speedTop = await redis.zRange(`leaderboard:speed:${yesterday}`, 0, 0, { by: 'rank' })
  let speedLine = ''
  if (speedTop.length > 0 && speedTop[0]) {
    const entry = speedTop[0]
    try {
      const user = await reddit.getUserById(entry.member as `t2_${string}`)
      if (user) {
        speedLine = `⚡ **Yesterday's Fastest:** u/${user.username} (${entry.score}s)`
      }
    } catch { /* skip */ }
  }

  const totalGames = await redis.get('stats:totalGames')

  const lines = [
    `**Puzzle #${puzzleNumber}** is live! Tap to play 👆`,
    '',
    ...(streakLine ? [streakLine] : []),
    ...(speedLine ? [speedLine] : []),
    ...(totalGames ? [`🎮 **${totalGames}** puzzles played so far`] : []),
    '',
    '⬆️ **Upvote to support the game** — every upvote helps us keep building!',
    '',
    'Good luck! 🍀',
  ]

  return lines.join('\n')
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
serve({ fetch: app.fetch, port: getServerPort(), createServer })
