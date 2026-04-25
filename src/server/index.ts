import {
  context,
  createServer,
  getServerPort,
  redis,
  reddit
} from '@devvit/web/server'
import type { TaskRequest, TaskResponse } from '@devvit/web/server'
import { serve } from '@hono/node-server'
import type { Context } from 'hono'
import { Hono } from 'hono'

import { createPost, URJO_PUZZLE_POST_TYPE as _URJO_PUZZLE_POST_TYPE, URJO_POST_TYPE_KEY as _URJO_POST_TYPE_KEY } from './post'
import { gameRouter } from './routes/game'
import { economyRouter } from './routes/economy'
import { engagementRouter } from './routes/engagement'
import { buildHighlightsComment, buildPlayerOfTheWeekComment, buildMissionPreview } from './lib/highlights'
import { selectDailyMissions } from './lib/missions'
import { getTodayUTC, getISOWeek } from './lib/helpers'
import { DAILY_MISSION_TEMPLATES } from '../shared/engagement-constants'
import type { HighlightData, WeeklyHighlightData } from '../shared/engagement-types'

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
// Also includes engagement data: active players, collective streaks, mission preview, highlights.
const buildStatsComment = async (puzzleNumber: number): Promise<string> => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0] ?? ''
  const today = getTodayUTC()
  const isoWeek = getISOWeek()
  const isMonday = new Date().getUTCDay() === 1

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

  // ─── Active player count (with 5-second timeout fallback) ─────────────────
  let activePlayers = 0
  try {
    const cached = await redis.get('stats:activePlayers:7d')
    if (cached !== undefined) {
      activePlayers = parseInt(cached, 10)
    } else {
      const timeoutPromise = new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000)
      )
      const countPromise = (async () => {
        // Count users with streak:lastDate within last 7 days
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0] ?? ''
        const allStreakEntries = await redis.zRange('leaderboard:streak', 0, -1, { by: 'rank' })
        let count = 0
        for (const entry of allStreakEntries) {
          const lastDate = await redis.get(`user:${entry.member}:streak:lastDate`)
          if (lastDate !== undefined && lastDate >= cutoff) count++
        }
        return count
      })()
      activePlayers = await Promise.race([countPromise, timeoutPromise])
      await redis.set('stats:activePlayers:7d', activePlayers.toString())
    }
  } catch {
    const cached = await redis.get('stats:activePlayers:7d')
    activePlayers = cached !== undefined ? parseInt(cached, 10) : 0
    console.warn('[Scheduler] Active player count timed out, using cached value')
  }

  // ─── Collective streaks ────────────────────────────────────────────────────
  let collectiveStreaks = 0
  try {
    const allStreakEntries = await redis.zRange('leaderboard:streak', 0, -1, { by: 'rank' })
    collectiveStreaks = allStreakEntries.reduce((sum, e) => sum + e.score, 0)
    await redis.set('stats:collectiveStreaks', collectiveStreaks.toString())
  } catch {
    const cached = await redis.get('stats:collectiveStreaks')
    collectiveStreaks = cached !== undefined ? parseInt(cached, 10) : 0
  }

  // ─── Mission preview ───────────────────────────────────────────────────────
  const todayMissions = selectDailyMissions(today, DAILY_MISSION_TEMPLATES)
  const missionPreview = buildMissionPreview(todayMissions)

  // ─── Yesterday's Stars ─────────────────────────────────────────────────────
  const topStreakEntry = streakLeaders[0]
  const fastestSolves = speedLeaders.map((l, i) => ({
    gridSize: 4, // simplified — full impl would track per-grid
    username: l.username,
    titleEmoji: '⚡',
    timeTaken: speedTop[i]?.score ?? 0,
  }))
  const topCoinsEntry = coinsLeaders[0]

  const highlightData: HighlightData = {
    topStreak: topStreakEntry
      ? { username: topStreakEntry.username, titleEmoji: '🔥', streak: streakTop[0]?.score ?? 0 }
      : null,
    fastestSolves,
    mostCoins: topCoinsEntry
      ? { username: topCoinsEntry.username, titleEmoji: '💰', coins: coinsTop[0]?.score ?? 0 }
      : null,
  }
  const highlightsSection = buildHighlightsComment(highlightData)

  // ─── Player of the Week (Mondays only) ────────────────────────────────────
  let playerOfWeekSection = ''
  if (isMonday) {
    const weeklyTop = await redis.zRange(`leaderboard:weekly:${isoWeek}`, 0, 0, { reverse: true, by: 'rank' })
    const weeklyTopEntry = weeklyTop[0]
    let topPlayer: WeeklyHighlightData['topPlayer'] = null
    if (weeklyTopEntry) {
      try {
        const user = await reddit.getUserById(weeklyTopEntry.member as `t2_${string}`)
        if (user?.username) {
          topPlayer = { username: user.username, titleEmoji: '🏆', completions: weeklyTopEntry.score }
        }
      } catch { /* skip */ }
    }
    playerOfWeekSection = buildPlayerOfTheWeekComment({ topPlayer, isoWeek })
  }

  return [
    `🧩 **Puzzle #${puzzleNumber}** is live! Tap to play 👆`,
    '',
    `👥 **${activePlayers} active players** · 🔥 **${collectiveStreaks} collective streak days**`,
    '',
    missionPreview,
    '',
    highlightsSection,
    ...(playerOfWeekSection ? ['', playerOfWeekSection] : []),
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
  await c.req.json<TaskRequest>()
  try {
    const puzzleNumber = await redis.incrBy('stats:puzzleCounter', 1)
    const title = `🧩 Urjo Puzzle #${puzzleNumber} — Can you solve it?`

    console.log(`[Scheduler] Creating post: ${title}`)

    const post = await createPost(title)

    // Build a stats comment from yesterday's data
    try {
      const statsComment = await buildStatsComment(puzzleNumber)
      if (statsComment) {
        const stickyComment = await reddit.submitComment({ id: post.id as `t3_${string}`, text: statsComment })
        // Store sticky comment ID so score shares can reply under it
        if (stickyComment?.id) {
          await redis.hSet(`game:${post.id}:meta`, {
            stickyCommentId: stickyComment.id,
          })
        }
      }
    } catch (commentErr) {
      console.error('[Scheduler] Stats comment failed (non-critical):', commentErr)
    }

    console.log(`[Scheduler] Post created successfully: ${post.id}`)

    return c.json<TaskResponse>({ status: 'ok' }, 200)
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

// Trigger handler: no-op for post-create events
app.post('/internal/on-post-create', async (c: Context) => {
  return c.json({ status: 'ok' }, 200)
})

// Register game API routes
app.route('/', gameRouter)
app.route('/', economyRouter)
app.route('/', engagementRouter)

// Start the Devvit-wrapped server so context (reddit, redis, etc.) is available
// Guard against running in test environment to prevent side effects during test imports
if (process.env['NODE_ENV'] !== 'test') {
  serve({ fetch: app.fetch, port: getServerPort(), createServer })
}
