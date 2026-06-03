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

import { createPost, URJO_PUZZLE_POST_TYPE, URJO_POST_TYPE_KEY } from './post'
import { buildDailyPreview } from './lib/preview'
import type { DailyPreviewData } from '../shared/social-types'
import { gameRouter } from './routes/game'
import { economyRouter } from './routes/economy'
import { engagementRouter } from './routes/engagement'
import { analyticsRouter } from './routes/analytics'
import { adminRouter } from './routes/admin'
import { seasonRouter } from './routes/season'
import { notifyRouter } from './routes/notify'
import { presenceRouter } from './routes/presence'
import { dwellRouter } from './routes/dwell'
import {
  computeDailyMentionBatch,
  getOptInUserIds,
  getCompleterUserIdsForDate,
  getMentionedUserIdsForDate,
  tryMarkUserMentioned,
  buildMentionCommentText,
} from './lib/notify'
import { buildHighlightsComment, buildPlayerOfTheWeekComment, buildMissionPreview } from './lib/highlights'
import { selectDailyMissions } from './lib/missions'
import { getTodayUTC, getISOWeek, getYesterdayUTC, fetchUsername, readUserStreak } from './lib/helpers'
import { computeDashboard, formatDashboardMarkdown } from './lib/dashboard'
import { runDriftCheck, formatDriftLogLine } from './lib/drift'
import { buildScorecard, formatScorecardMarkdown } from './lib/scorecard'
import { getSeasonRecap, awardSeasonRewards, getSeasonForDate } from './lib/seasons'
import { getSubredditConfig, recordInstallation } from './lib/subreddit-config'
import {
  claimGrowthPostSlot,
  getGrowthPostSlot,
  isGrowthPostSlotEnabled,
  type GrowthPostSlot,
} from './lib/growth-safety'
import { DAILY_MISSION_TEMPLATES } from '../shared/engagement-constants'
import type { HighlightData, WeeklyHighlightData } from '../shared/engagement-types'

const HTTP_STATUS_BAD_REQUEST = 400

export const app = new Hono()

type PostCreatePayload = {
  post?: { id?: string; title?: string }
  author?: { name?: string }
}

const REDDIT_GAMES_SUBREDDIT = 'RedditGames'

const normalizePostId = (postId: string): `t3_${string}` =>
  postId.startsWith('t3_') ? postId as `t3_${string}` : `t3_${postId}`

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

// On app install: create default config, record installation, set roadmap start, create first post
app.post('/internal/on-app-install', async (c: Context) => {
  try {
    const subredditId = context.subredditId
    const subredditName = context.subredditName
    const userId = context.userId ?? 'unknown'

    // Create default subreddit config (creates defaults if none exists)
    await getSubredditConfig(subredditId)

    // Record installation in sorted set and metadata hash
    await recordInstallation(subredditId, subredditName, userId)

    // Set roadmap:startDate if not already set
    const existingStartDate = await redis.get('roadmap:startDate')
    if (existingStartDate === undefined) {
      await redis.set('roadmap:startDate', getTodayUTC())
    }

    // Create first puzzle post for immediate content
    const post = await createPost()

    return c.json({
      navigateTo: `https://reddit.com/r/${subredditName}/comments/${post.id}`
    })
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Failed to handle app install'
    return c.json(
      { status: 'error', message: errorMessage },
      HTTP_STATUS_BAD_REQUEST
    )
  }
})
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

const buildGrowthPostTitle = (
  slot: GrowthPostSlot,
  puzzleNumber: number,
  brandingEmoji: string
): string => {
  if (slot === 'speed_window') {
    return `${brandingEmoji} Urjo Speed Window #${puzzleNumber} - set the fastest solve`
  }
  if (slot === 'evening_puzzle') {
    return `${brandingEmoji} Urjo Evening Puzzle #${puzzleNumber} - unwind with a board`
  }
  return `${brandingEmoji} Urjo Puzzle #${puzzleNumber} - Beat today's board`
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
    'Comment your result from the game to join the scoreboard.',
    'Create one Rival Challenge after a strong solve to start a beat-my-time chain.',
    'Good luck! 🍀',
  ].join('\n')
}

// Build a season recap comment for the previous week's season
const buildSeasonRecapComment = async (previousSeasonId: string): Promise<string> => {
  const recap = await getSeasonRecap(previousSeasonId)

  const lines: string[] = ['## 🏆 Season Recap']
  lines.push(`**Season ${previousSeasonId}** has ended!`)
  lines.push(`**${recap.totalParticipants}** players competed this season.`)
  lines.push('')

  if (recap.topPlayers.length > 0) {
    lines.push('**Top Players:**')
    const medals = ['🥇', '🥈', '🥉'] as const
    for (let i = 0; i < Math.min(recap.topPlayers.length, 3); i++) {
      const player = recap.topPlayers[i]!
      const medal = medals[i] ?? '🏅'
      lines.push(`${medal} u/${player.username} — ${player.score} pts`)
    }
  }

  return lines.join('\n')
}

// Scheduler endpoint for capped r/urjo growth-slot puzzle posts
app.post('/internal/scheduler/daily-puzzle', async (c: Context) => {
  await c.req.json<TaskRequest>()
  try {
    // Store roadmap:startDate on first run if not already set
    const existingStartDate = await redis.get('roadmap:startDate')
    const today = getTodayUTC()
    if (existingStartDate === undefined) {
      await redis.set('roadmap:startDate', today)
    }

    const yesterday = getYesterdayUTC()

    // Compute and store previous day's dashboard (non-blocking, in-app diagnostic only)
    let dashboardMarkdown = ''
    try {
      const dashboardData = await computeDashboard(yesterday)
      // Keep computeDashboard wired so /api/analytics/dashboard keeps working
      // for in-app moderator views, but the Reddit comment uses the new
      // honest scorecard built from DQP / D7 / S2R / drift instead of the
      // inflated post_open-derived numbers.
      void formatDashboardMarkdown(dashboardData)
      const scorecard = await buildScorecard(yesterday)
      dashboardMarkdown = formatScorecardMarkdown(scorecard)
    } catch (dashErr) {
      console.error('[Scheduler] Scorecard computation failed (non-critical):', dashErr)
    }

    // Read subreddit config for branding/frequency and gate the active slot.
    const subredditConfig = await getSubredditConfig(context.subredditId)
    const slot = getGrowthPostSlot(new Date())
    if (!isGrowthPostSlotEnabled(subredditConfig.postFrequency, slot)) {
      return c.json<TaskResponse>({ status: 'success', message: `${slot} disabled by config` }, 200)
    }

    const slotClaimed = await claimGrowthPostSlot(today, context.subredditId, slot)
    if (!slotClaimed) {
      return c.json<TaskResponse>({ status: 'success', message: `${slot} already posted today` }, 200)
    }

    const brandingEmoji = subredditConfig.brandingEmoji

    const puzzleNumber = await redis.incrBy('stats:puzzleCounter', 1)
    const title = buildGrowthPostTitle(slot, puzzleNumber, brandingEmoji)

    console.log(`[Scheduler] Creating post: ${title}`)

    const post = await createPost(title)

    // ─── Custom post preview for feed engagement (non-blocking) ────────────
    try {
      const previewData: DailyPreviewData = {
        puzzleNumber,
        gridSize: 4,
        completionsToday: 0,
        activeNow: 0,
        fastestTime: null,
        fastestUsername: null,
      }
      buildDailyPreview(previewData)

      // Store preview data in Redis for future updates
      await redis.hSet(`game:${post.id}:preview`, {
        type: 'daily',
        data: JSON.stringify(previewData),
      })
    } catch (previewErr) {
      console.error('[Preview] Daily preview failed (non-critical):', previewErr)
    }

    // Build a stats comment from yesterday's data
    let stickyCommentId: string | undefined
    try {
      const statsComment = await buildStatsComment(puzzleNumber)
      if (statsComment) {
        const stickyComment = await reddit.submitComment({ id: post.id as `t3_${string}`, text: statsComment })
        // Store sticky comment ID so score shares can reply under it
        if (stickyComment?.id) {
          stickyCommentId = stickyComment.id
          await redis.hSet(`game:${post.id}:meta`, {
            stickyCommentId: stickyComment.id,
          })
        }
      }
    } catch (commentErr) {
      console.error('[Scheduler] Stats comment failed (non-critical):', commentErr)
    }

    // Append developer analytics as collapsed reply to sticky comment
    if (stickyCommentId && dashboardMarkdown) {
      try {
        const analyticsReply = [
          '<details>',
          '<summary>📊 Developer Analytics</summary>',
          '',
          dashboardMarkdown,
          '',
          '</details>',
        ].join('\n')
        await reddit.submitComment({ id: stickyCommentId as `t1_${string}`, text: analyticsReply })
      } catch (analyticsErr) {
        console.error('[Scheduler] Analytics reply failed (non-critical):', analyticsErr)
      }
    }

    // On Mondays: generate season recap and award season rewards
    const isMonday = new Date().getUTCDay() === 1
    if (isMonday) {
      try {
        // Get previous week's season (yesterday was Sunday)
        const lastSunday = new Date()
        lastSunday.setUTCDate(lastSunday.getUTCDate() - 1)
        const previousSeason = getSeasonForDate(lastSunday)

        // Award season rewards to top 3
        await awardSeasonRewards(previousSeason.seasonId)

        // Post season recap as a comment
        const recapComment = await buildSeasonRecapComment(previousSeason.seasonId)
        await reddit.submitComment({ id: post.id as `t3_${string}`, text: recapComment })
      } catch (seasonErr) {
        console.error('[Scheduler] Season recap failed (non-critical):', seasonErr)
      }
    }

    // At 16:00 UTC: post daily mention comments for opted-in completers
    if (new Date().getUTCHours() === 16) {
      try {
        const yesterday = getYesterdayUTC()
        const todayDate = getTodayUTC()

        const [optInUserIds, yesterdayCompleterUserIds, alreadyMentionedUserIds] = await Promise.all([
          getOptInUserIds(),
          getCompleterUserIdsForDate(yesterday),
          getMentionedUserIdsForDate(todayDate),
        ])

        const batch = computeDailyMentionBatch(
          optInUserIds,
          yesterdayCompleterUserIds,
          alreadyMentionedUserIds,
        )

        for (const userId of batch) {
          const claimed = await tryMarkUserMentioned(todayDate, userId)
          if (!claimed) continue

          try {
            const username = await fetchUsername(userId)
            const streak = await readUserStreak(userId)
            const text = buildMentionCommentText(username, streak, post.id)
            await reddit.submitComment({ id: post.id as `t3_${string}`, text })
          } catch (commentErr) {
            console.error('[Mention] Failed for user', userId, commentErr)
            // Dedup key remains set — prevents retry storms (Req 15.7)
          }
        }
      } catch (mentionErr) {
        console.error('[Mention] Scheduler step failed (non-critical):', mentionErr)
      }
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

// Crosspost app-created puzzle posts into r/RedditGames once.
app.post('/internal/on-post-create', async (c: Context) => {
  const input = await c.req.json<PostCreatePayload>().catch(() => null)
  const post = input?.post
  if (!post?.id) return c.json({ status: 'ok' }, 200)

  const postId = normalizePostId(post.id)
  const metaKey = `game:${postId}:meta`
  const meta = await redis.hGetAll(metaKey)

  if (meta[URJO_POST_TYPE_KEY] !== URJO_PUZZLE_POST_TYPE) {
    return c.json({ status: 'ok' }, 200)
  }

  if (meta.redditGamesCrosspostId !== undefined) {
    return c.json({ status: 'ok' }, 200)
  }

  if (meta.redditGamesCrosspostApproved !== 'true') {
    return c.json({ status: 'ok' }, 200)
  }

  const appUser = await reddit.getAppUser()
  if (input?.author?.name !== appUser?.username) {
    return c.json({ status: 'ok' }, 200)
  }

  try {
    const crosspost = await reddit.crosspost({
      subredditName: REDDIT_GAMES_SUBREDDIT,
      postId,
      title: post.title ?? 'Urjo Puzzle - Can you solve it?',
    })

    if (crosspost?.id) {
      await redis.hSet(metaKey, { redditGamesCrosspostId: crosspost.id })
    }

    return c.json({ status: 'ok' }, 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to crosspost'
    return c.json({ status: 'error', message }, 500)
  }
})

// Nightly drift-check scheduler. Reconciles our DQP per-sub against the
// most recent Reddit QE upload for the previous UTC day and emits a
// structured log line for any non-'none' severity record. A webhook
// downstream of the log can convert these to PagerDuty / Slack alerts.
app.post('/internal/scheduler/drift-check', async (c: Context) => {
  await c.req.json<TaskRequest>().catch(() => null)
  try {
    const yesterday = getYesterdayUTC()
    const records = await runDriftCheck(yesterday)
    let alerted = 0
    for (const rec of records) {
      if (rec.severity !== 'none') {
        console.error(formatDriftLogLine(rec))
        alerted++
      }
    }
    return c.json<TaskResponse>(
      { status: 'success', message: `drift-check complete: ${records.length} scopes evaluated, ${alerted} non-OK` },
      200,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drift check failed'
    console.error('[Scheduler] Drift check error:', message)
    return c.json<TaskResponse>({ status: 'error', message }, 500)
  }
})

// Register game API routes
app.route('/', gameRouter)
app.route('/', economyRouter)
app.route('/', engagementRouter)
app.route('/', analyticsRouter)
app.route('/', adminRouter)
app.route('/', seasonRouter)
app.route('/', notifyRouter)
app.route('/', presenceRouter)
app.route('/', dwellRouter)

// Start the Devvit-wrapped server so context (reddit, redis, etc.) is available
// Guard against running in test environment to prevent side effects during test imports
if (process.env['NODE_ENV'] !== 'test') {
  serve({ fetch: app.fetch, port: getServerPort(), createServer })
}
