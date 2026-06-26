---
name: daily-content
description: Design daily/weekly challenges, scheduler tasks, timed game events, rotating content, delayed notifications, cleanup jobs, and content calendars. Read when building any time-based content, automated posting, periodic maintenance, or FOMO-driven feature.
---

# Daily Content & Scheduled Events

> Reddit posts decay fast. Without fresh content, your game disappears from feeds within hours. Daily content is not optional — it's survival.

## Why Daily Content Matters

| Problem | Solution |
|---|---|
| Posts drop off feed in hours | New daily post keeps game visible |
| Players have no reason to return | Daily challenge creates daily habit |
| Leaderboards get stale | Daily reset gives everyone fresh start |
| Content feels repetitive | Rotating themes/difficulty keeps it fresh |
| No urgency to play | "Today only" creates FOMO |

FOMO must be honest: only show countdowns or scarcity when the content, leaderboard, reward, or event actually expires.

---

## Content Cadence Framework

### Daily (non-negotiable for retention)

| Content | Time | Mechanism |
|---|---|---|
| **Daily challenge post** | 00:00 UTC | Scheduler creates new post |
| **Daily missions reset** | 00:00 UTC | Redis counters reset |
| **Daily leaderboard reset** | 00:00 UTC | New sorted set key |

### Weekly (for deeper engagement)

| Content | Time | Mechanism |
|---|---|---|
| **Weekly tournament** | Friday 18:00 UTC | Scheduler creates tournament post |
| **League promotion/demotion** | Monday 00:00 UTC | Scheduler calculates + updates flair |
| **Weekly recap** | Sunday 20:00 UTC | Scheduler posts community stats |
| **Weekly missions reset** | Monday 00:00 UTC | Redis counters reset |

### Seasonal / Event (for spikes)

| Content | Frequency | Mechanism |
|---|---|---|
| **Holiday themes** | Seasonal | Manual or scheduled config change |
| **Special tournaments** | Monthly | Scheduler + custom rules |
| **Community events** | Ad-hoc | Moderator-triggered via menu item |
| **New content drops** | Bi-weekly | App update + announcement post |

---

## Automated Daily Post Creation

## Scheduler setup

Declare recurring or one-off tasks in `devvit.json`; each task maps to an internal endpoint.

```json
{
  "scheduler": {
    "tasks": {
      "daily-challenge": {
        "endpoint": "/internal/cron/daily-challenge",
        "cron": "0 0 * * *"
      },
      "weekly-recap": {
        "endpoint": "/internal/cron/weekly-recap",
        "cron": "0 20 * * 0"
      },
      "league-reset": {
        "endpoint": "/internal/cron/league-reset",
        "cron": "0 0 * * 1"
      }
    }
  }
}
```

- Tasks with `cron` run automatically on schedule.
- Tasks without `cron` are one-off and are scheduled at runtime via `scheduler.runJob()`.
- Keep handlers bounded. If work may exceed 30 seconds, process a small batch and schedule the next one-off job with a cursor.
- Limits: 10 live recurring actions per installation, 60 `runJob()` calls/minute, 60 deliveries/minute.

### Runtime one-off jobs

```typescript
import { scheduler } from '@devvit/web/server'

const jobId = await scheduler.runJob({
  name: 'game-timeout',
  data: { postId: context.postId },
  runAt: new Date(Date.now() + 5 * 60 * 1000),
})

await redis.set(`job:${context.postId}`, jobId)
```

Cancel jobs by storing their job id in Redis and calling `scheduler.cancelJob(jobId)`.

### Bounded batch jobs

Use scheduler batches for notification campaigns, Redis migrations, `redisCompressed` backfills, leaderboard trimming, old-record cleanup, derived indexes, and event settlement.

```typescript
type BatchData = { cursor: string }

app.post('/internal/cron/cleanup-batch', async (c) => {
  const { data } = await c.req.json<TaskRequest<BatchData>>()
  const result = await processCleanupPage(data?.cursor ?? '0', 100)

  if (!result.done) {
    await scheduler.runJob({
      name: 'cleanup-batch',
      data: { cursor: result.cursor },
      runAt: new Date(Date.now() + 1000),
    })
  }

  return c.json<TaskResponse>({ status: 'ok' })
})
```

For notifications, use Devvit notification APIs only, page opted-in users, and enqueue in groups. Do not build custom push providers, service workers, browser push subscriptions, or Redis opt-in lists.

### Daily challenge handler

```typescript
import { context, redis, reddit, scheduler } from '@devvit/web/server'
import type { TaskRequest, TaskResponse } from '@devvit/web/server'
import type { JsonObject } from '@devvit/web/shared'

app.post('/internal/cron/daily-challenge', async (c) => {
  const _input = await c.req.json<TaskRequest>()
  const today = getDateString(new Date())
  const dayNumber = getDayNumber() // Days since game launch

  // Generate deterministic challenge config from date
  const challengeConfig = generateDailyChallenge(today)

  // Create the daily post
  const postData: JsonObject = {
    type: 'daily-challenge',
    dayNumber,
    date: today,
    ...challengeConfig,
  }

  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName!,
    title: `Daily Challenge #${dayNumber} 🎯`,
    entry: 'default',
    postData,
  })

  // Store reference for leaderboard and stats
  await redis.set(`daily:${today}:postId`, post.id)
  await redis.set(`daily:latest`, post.id)
  await redis.hSet(`daily:${today}:meta`, {
    postId: post.id,
    createdAt: new Date().toISOString(),
  })

  // Pin/sticky the post (if app has mod permissions)
  // await reddit.stickyPost(post.id)

  // Create stickied score thread comment
  const scoreComment = await reddit.submitComment({
    postId: post.id,
    text: `📊 **Share your score below!**\n\nReply to this comment with your result.`,
  })
  await redis.set(`post:${post.id}:scoreThread`, scoreComment.id)

  // If push notifications are approved for the app, schedule a bounded campaign job.
  // Use Devvit notifications only; do not create custom push queues or browser push.

  return c.json<TaskResponse>({ status: 'ok' })
})
```

Use the daily post id and server-written creation timestamp as the canonical content identity for streaks, notifications, and share links. Do not award streak credit from the client clock or from opening the post.

### Deterministic challenge generation

Challenges must be deterministic (same seed = same challenge) so all players face the same puzzle:

```typescript
// Simple date-based seed for deterministic randomness
const generateDailyChallenge = (dateString: string): ChallengeConfig => {
  const seed = hashString(dateString)
  const rng = createSeededRandom(seed)

  return {
    seed,
    difficulty: getDifficultyForDay(rng),
    theme: getThemeForDay(rng),
    // ... game-specific config
  }
}

// Simple seeded PRNG (good enough for game content, not crypto)
const createSeededRandom = (seed: number): (() => number) => {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff
    return (state >>> 0) / 0xffffffff
  }
}

const hashString = (str: string): number => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}
```

---

## FOMO Mechanics

FOMO must never block core gameplay, force waiting, or punish a missed day so harshly that a player churns. Use recovery paths: easy re-entry, streak freezes, archived play, and a clear "today's challenge" route.

### Expiring content

```typescript
// Daily challenge expires at midnight UTC
const getTimeUntilExpiry = (): { hours: number; minutes: number } => {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  const diff = midnight.getTime() - now.getTime()
  return {
    hours: Math.floor(diff / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
  }
}
```

### Urgency UI

```svelte
<div class="flex items-center gap-2 text-sm">
  <span class="text-yellow-400">⏰</span>
  <span class="text-gray-300">
    {#if hoursLeft > 0}
      {hoursLeft}h {minutesLeft}m remaining
    {:else}
      {minutesLeft}m remaining — hurry!
    {/if}
  </span>
</div>
```

### "You missed it" recovery

When a player opens yesterday's challenge:
```svelte
{#if isExpired}
  <div class="text-center py-8">
    <p class="text-gray-400">This challenge has ended</p>
    <p class="text-sm text-gray-500 mt-1">
      {participantCount} players competed
    </p>
    <a href={todaysChallengeUrl} class="mt-4 inline-block px-6 py-2 bg-blue-600 rounded-lg">
      Play Today's Challenge →
    </a>
  </div>
{/if}
```

---

## Difficulty Rotation

Vary difficulty across the week to serve different player segments:

```typescript
const WEEKLY_DIFFICULTY_PATTERN = [
  'easy',    // Monday — gentle start, re-engage lapsed players
  'medium',  // Tuesday
  'medium',  // Wednesday
  'hard',    // Thursday — challenge hardcore players
  'medium',  // Friday
  'easy',    // Saturday — weekend casual players
  'hard',    // Sunday — end-of-week showdown
] as const

const getDifficultyForDay = (date: Date): Difficulty => {
  const dayOfWeek = date.getUTCDay() // 0 = Sunday
  const adjustedIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Monday = 0
  return WEEKLY_DIFFICULTY_PATTERN[adjustedIndex]!
}
```

---

## Weekly Recap Post

Celebrate the community's achievements to build belonging. Do not include private user data or content copied from deleted posts/comments. If recap posts include user-generated text or images, use appropriate attribution and deletion cleanup.

```typescript
app.post('/internal/cron/weekly-recap', async (c) => {
  const _input = await c.req.json<TaskRequest>()
  const weekId = getWeekId(new Date())

  // Gather stats
  const totalPlayers = await redis.get(`stats:week:${weekId}:uniquePlayers`) ?? '0'
  const totalGames = await redis.get(`stats:week:${weekId}:totalGames`) ?? '0'
  const topPlayer = await getTopPlayerOfWeek(weekId)

  const title = `📊 Week ${weekId} Recap — ${totalPlayers} players, ${totalGames} games!`

  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName!,
    title,
    entry: 'default',
    postData: {
      type: 'weekly-recap',
      weekId,
      stats: { totalPlayers, totalGames, topPlayer },
    } as JsonObject,
  })

  return c.json<TaskResponse>({ status: 'ok' })
})
```

---

## Content Calendar Template

Plan content 2 weeks ahead. Store in Redis for dynamic access:

```typescript
// content:calendar:{date} — hash
{
  type: 'daily-challenge',     // or 'tournament', 'special-event'
  theme: 'space',              // visual theme
  difficulty: 'hard',
  specialRules: '',            // optional modifier
  title: 'Cosmic Challenge',
}
```

## Notifications and Journeys

Push notifications and Devvit Journeys are gated beta features. Use them only when the app has approval:

- Notification opt-in state must come from Devvit notifications APIs, not Redis
- Notification copy must be short, contextual, and approved
- Use scheduler batches to page opted-in users; do not send a large campaign in one request
- Include the canonical daily post/content link
- Journeys events should track starts, completions, exits, session duration, and key friction points; handle receipts in tests/mocks

## Checklist before finishing
- [ ] Daily challenge post created automatically via scheduler
- [ ] Challenge generation is deterministic (same date = same puzzle for all)
- [ ] Stickied score thread comment created on each daily post
- [ ] Expiry countdown visible in UI
- [ ] Expired content shows "Play today's challenge" redirect
- [ ] Difficulty varies across the week
- [ ] Weekly recap post celebrates community stats
- [ ] League reset runs weekly via scheduler
- [ ] All scheduler tasks declared in devvit.json
- [ ] One-off job IDs stored in Redis when cancellation is needed
- [ ] Long scheduled work split into bounded batches with cursor/progress state
- [ ] Content calendar stored in Redis for dynamic access
- [ ] FOMO messaging is honest (real scarcity, not fake urgency)
- [ ] Daily content id and server-created timestamp anchor streaks and notifications
- [ ] Push notifications used only if approved, opted-in, copy-reviewed, and batched
- [ ] Recaps and archives respect Reddit content deletion/account deletion rules
