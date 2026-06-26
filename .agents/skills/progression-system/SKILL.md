---
name: progression-system
description: Design streaks, XP, levels, leagues, leaderboards, achievements, flair, and player identity. The complete "retain the player" skill. Read when building any feature that tracks progress, ranks players, displays status, or creates long-term goals.
---

# Progression, Leaderboards & Player Identity

> Progression transforms a fun toy into a game people play for months. Every session must move the player forward, every achievement must be visible to others, and every leaderboard must reset often enough that newcomers can compete.

## Progression Axes

Design multiple overlapping systems so there's always something to work toward:

| Axis | Timeframe | Mechanic | Retention effect |
|---|---|---|---|
| **Streaks** | Daily | Consecutive days played | Loss aversion — "Can't break my streak" |
| **XP / Level** | Weekly | Cumulative experience points | Sunk cost — "I've invested too much to stop" |
| **League / Rank** | Weekly | Competitive tier placement | Status — "I'm a Diamond player" |
| **Leaderboards** | Daily/Weekly | Ranked score competition | Competition — "I need to reclaim #3" |
| **Achievements** | Ongoing | One-time milestone badges | Completionism — "Only 3 more to collect" |
| **Missions** | Daily/Weekly | Short-term task lists | Direction — "I know what to do next" |
| **Flair** | Ongoing | Subreddit-visible status | Identity — "This community sees I'm a Champion" |

---

## Streaks — The #1 Retention Mechanic

Streaks exploit loss aversion: losing a streak feels worse than gaining one feels good.

### Streak design rules

1. **Easy to start** — First streak day should be trivially achievable
2. **Visible everywhere** — Show streak count on main screen and in flair
3. **Escalating rewards** — Bigger bonuses at milestones (7, 14, 30, 100 days)
4. **Grace mechanics** — Streak freezes prevent rage-quit from one missed day
5. **Recovery path** — If broken, show "Start a new streak" immediately

### Streak Redis schema

```typescript
// user:{userId}:streak:meta — hash
{
  longest: '23',
  freezesAvailable: '1',
  freezesUsed: '0',
}

// user:{userId}:streak:{year} — bitfield
// bit dayIndex = 1 when the user completed streak-worthy content for that UTC day

const STREAK_MILESTONES = [
  { days: 3, reward: 'streak_badge_bronze', xp: 50 },
  { days: 7, reward: 'streak_badge_silver', xp: 150 },
  { days: 14, reward: 'streak_badge_gold', xp: 400 },
  { days: 30, reward: 'streak_badge_diamond', xp: 1000 },
  { days: 100, reward: 'streak_badge_legendary', xp: 5000 },
] as const
```

### Streak calculation logic

Record streak credit only after the server verifies completion. Do not record streaks from client-only events.

```typescript
const recordStreakCompletion = async (input: {
  userId: string
  contentCreatedAt: Date
  completed?: boolean
}): Promise<void> => {
  if (input.completed === false) return
  const { year, dayIndex } = getUtcYearDayIndex(input.contentCreatedAt)
  await redis.bitfield(`user:${input.userId}:streak:${year}`, 'set', 'u1', `#${dayIndex}`, 1)
}
```

Current streak calculation must be forgiving:

- A new user starts at streak `0`, not `1`
- After first verified completion, streak becomes `1`
- If the user completed today, count backward from today
- If the user has not completed today, count backward from yesterday so the streak stays visible during the day
- Bridge Jan 1 into the previous year's bitfield when needed
- Correctly handle leap years
- Anchor the day to the content's UTC creation date, not the client clock or request timestamp

Ask before implementation whether archive completions should count toward streaks. Do not assume.

---

## XP & Leveling

XP provides a universal progress currency. Every positive action earns XP.

### XP award table (customize per game)

| Action | XP | Rationale |
|---|---|---|
| Complete a game | 10 | Base reward for participation |
| Win / solve correctly | 25 | Reward skill |
| New personal best | 50 | Reward improvement |
| Daily challenge completed | 30 | Reward daily engagement |
| First game of the day | 15 | Reward return visits |
| Streak milestone | 50-5000 | Reward consistency (escalating) |

### Level curve (logarithmic — fast early, slower later)

```typescript
const xpForLevel = (level: number): number => {
  if (level <= 1) return 0
  return Math.floor(100 * Math.pow(level - 1, 1.5))
}

const getLevelFromXp = (xp: number): number => {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  return level
}

const getProgressToNextLevel = (xp: number): { current: number; required: number; percent: number } => {
  const level = getLevelFromXp(xp)
  const currentLevelXp = xpForLevel(level)
  const nextLevelXp = xpForLevel(level + 1)
  const progress = xp - currentLevelXp
  const required = nextLevelXp - currentLevelXp
  return { current: progress, required, percent: Math.floor((progress / required) * 100) }
}
```

### XP Redis schema

```typescript
// user:{userId}:xp — simple string (level derived, not stored)
await redis.incrBy(`user:${userId}:xp`, xpAmount)
```

---

## Leagues & Ranks

Leagues create weekly competitive cycles with promotion/demotion.

```typescript
const LEAGUES = [
  { id: 'bronze', name: 'Bronze', minXp: 0, icon: '🥉' },
  { id: 'silver', name: 'Silver', minXp: 500, icon: '🥈' },
  { id: 'gold', name: 'Gold', minXp: 1500, icon: '🥇' },
  { id: 'diamond', name: 'Diamond', minXp: 4000, icon: '💎' },
  { id: 'champion', name: 'Champion', minXp: 10000, icon: '👑' },
] as const
```

### Weekly league cycle
```
Monday 00:00 UTC: New week starts → players placed by previous week's XP → weekly XP resets
  Top 3 promoted, bottom 3 demoted → flair updated → celebration/motivation screen
Sunday 23:59 UTC: Week ends → final rankings → rewards distributed
```

### League Redis schema

```typescript
// league:week:{weekId}:{leagueId} — sorted set (member: userId, score: weeklyXp)
await redis.zAdd(`league:week:${weekId}:gold`, { member: userId, score: weeklyXp })

// user:{userId}:league — hash
{ current: 'gold', weeklyXp: '1250', weekId: '2025-W03' }
```

---

## Leaderboards

### Types and when to use each

| Type | Reset | Best for |
|---|---|---|
| **Daily** | Every 24h | Daily puzzles, casual players, fresh competition |
| **Weekly** | Every 7 days | Sustained effort, league integration |
| **All-time** | Never | Hall of fame, legacy |
| **Post-specific** | Per post | UGC challenges, local competition |

Daily leaderboards are the default — everyone starts at zero, newcomers can compete immediately, and daily FOMO drives return visits.

### Core leaderboard patterns

```typescript
// Submit score (only update if higher)
const submitScore = async (key: string, userId: string, score: number): Promise<void> => {
  const current = await redis.zScore(key, userId)
  if (current === undefined || score > current) {
    await redis.zAdd(key, { member: userId, score })
  }
}

// Get top N
const getTopPlayers = async (key: string, count: number): Promise<LeaderboardEntry[]> =>
  await redis.zRange(key, 0, count - 1, { by: 'rank', reverse: true })

// Get player rank (0-indexed)
const getPlayerRank = async (key: string, userId: string): Promise<number | undefined> =>
  await redis.zRank(key, userId, { reverse: true })
```

### Leaderboard key patterns

```typescript
`leaderboard:daily:${dateString}`     // leaderboard:daily:2025-01-15
`leaderboard:weekly:${weekId}`        // leaderboard:weekly:2025-W03
`leaderboard:alltime`
`leaderboard:post:${postId}`
```

### Leaderboard API

```typescript
app.get('/api/leaderboard', async (c) => {
  const type = c.req.query('type') ?? 'daily'
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100)
  const key = getLeaderboardKey(type)
  const entries = await getLeaderboardWithNames(key, limit)

  const userId = context.userId
  let playerRank: number | undefined
  if (userId) playerRank = await getPlayerRank(key, userId)

  return c.json({
    status: 'success',
    data: { entries, playerRank, type, resetsAt: getResetTime(type) },
  })
})
```

### Competitive psychology

| Principle | Implementation |
|---|---|
| **Fresh starts** | Daily reset — everyone starts at zero |
| **Visible progress** | Show rank change arrows (↑3 from yesterday) |
| **Near-miss motivation** | "You're 12 points behind #5!" |
| **Social proof** | "1,247 players competing today" |
| **Peer comparison** | "Better than 73% of players" |

---

## Achievements

Achievements reward exploration and mastery. Some should be hidden (discoverable).

| Category | Examples |
|---|---|
| **Skill** | "Score 1000 in a single game" |
| **Consistency** | "Play 30 days in a row" |
| **Exploration** | "Try all game modes" |
| **Social** | "Have 10 people attempt your challenge" |
| **Hidden** | "Find the easter egg" |

```typescript
// user:{userId}:achievements — hash (key: achievementId, value: unlockedAt)
await redis.hSet(`user:${userId}:achievements`, { [achievementId]: new Date().toISOString() })
```

---

## Daily / Weekly Missions

3 daily missions (achievable in 1-2 sessions) + 3 weekly missions (sustained play).

```typescript
const DAILY_MISSION_POOL = [
  { id: 'play_3', description: 'Play 3 games', target: 3, xpReward: 30 },
  { id: 'score_500', description: 'Score 500+', target: 500, xpReward: 50 },
  { id: 'perfect_round', description: 'No mistakes in a round', target: 1, xpReward: 75 },
] as const

// Rotate deterministically using date-based seed (same missions for all players)
```

### Mission design patterns

- Daily missions should have a low floor: one quick completion should preserve habit value.
- Weekly missions can ask for breadth or mastery, but should not require social posting, subscribing, payment, or notifications.
- Add near-miss copy when a player is close to a mission, league promotion, or level-up.
- Give lapsed players a recovery mission that restarts momentum without restoring fake progress.
- Treat boosters/freezes as friction relief, not mandatory resources.

---

## Flair & Player Identity

Reddit user flair is subreddit-scoped. It is still powerful because it is visible in the community where the game lives, but do not claim it follows the player across all of Reddit.

### Flair composition

```typescript
const buildFlairText = (league: string, streak: number, title?: string): string => {
  const parts: string[] = [league] // e.g., '💎'
  if (streak >= 7) parts.push(`🔥${streak}`)
  if (title) parts.push(`| ${title}`)
  return parts.join(' ')
  // Example: "💎 🔥23 | Puzzle Master"
}
```

### Auto-update flair on progression changes

```typescript
const syncFlair = async (userId: string): Promise<void> => {
  const username = await redis.get(`user:${userId}:username`)
  if (!username) return

  const [xp, streakData] = await Promise.all([
    redis.get(`user:${userId}:xp`),
    redis.hGetAll(`user:${userId}:streak:meta`),
  ])

  const league = getLeagueFromXp(parseInt(xp ?? '0', 10))
  const streak = parseInt(streakData['current'] ?? '0', 10)

  await reddit.setUserFlair({
    subredditName: context.subredditName!,
    username,
    text: buildFlairText(league.icon, streak),
  })
}
```

### Social proof — player count

```typescript
const trackPlayerActivity = async (userId: string): Promise<void> => {
  const today = getDateString(new Date())
  await redis.zAdd(`daily:${today}:players`, { member: userId, score: Date.now() })
}

const getTodayPlayerCount = async (): Promise<number> => {
  const today = getDateString(new Date())
  return await redis.zCard(`daily:${today}:players`)
}
```

### Player of the Week (scheduler-driven)

```typescript
app.post('/internal/cron/player-of-week', async (c) => {
  const weekId = getWeekId(new Date())
  const topPlayers = await redis.zRange(`league:week:${weekId}:all`, 0, 0, { by: 'rank', reverse: true })
  const topPlayer = topPlayers[0]
  if (!topPlayer) return c.json<TaskResponse>({ status: 'ok' })

  await redis.hSet(`user:${topPlayer.member}:achievements`, {
    [`potw_${weekId}`]: new Date().toISOString(),
  })
  await syncFlair(topPlayer.member)
  return c.json<TaskResponse>({ status: 'ok' })
})
```

---

## Progression UI Patterns

### Progress bar (always visible)
```svelte
<div class="w-full bg-gray-700 rounded-full h-2">
  <div class="bg-blue-500 h-2 rounded-full transition-all duration-500" style="width: {progressPercent}%"></div>
</div>
<p class="text-xs text-gray-400 mt-1">{currentXp}/{requiredXp} XP to Level {nextLevel}</p>
```

### Leaderboard with player highlight
```svelte
{#each entries as entry, i}
  <div class="flex items-center gap-3 px-3 py-2 rounded-lg {entry.userId === currentUserId ? 'bg-blue-900/50 border border-blue-500' : 'bg-gray-800'}">
    <span class="w-8 text-center font-bold">
      {#if i < 3}{['🥇', '🥈', '🥉'][i]}{:else}{i + 1}{/if}
    </span>
    <span class="flex-1 truncate">{entry.username}</span>
    <span class="font-mono font-bold">{entry.score.toLocaleString()}</span>
  </div>
{/each}
```

### Countdown timer (leaderboard reset)
```svelte
<span class="text-sm text-gray-400">Resets in {hoursLeft}h {minutesLeft}m</span>
```

## Checklist before finishing
- [ ] At least 2 progression axes active (streak + XP minimum)
- [ ] Streak includes grace mechanic (freeze)
- [ ] Streak credit is recorded server-side after verified completion only
- [ ] Daily streak state uses UTC content date and bitfield storage where appropriate
- [ ] New users show streak `0` until first streak-worthy completion
- [ ] XP curve is logarithmic (fast early, slower later)
- [ ] At least one leaderboard type implemented (daily recommended)
- [ ] Player's own rank always visible (even if not in top N)
- [ ] Leaderboard includes reset countdown
- [ ] League resets weekly with promotion/demotion
- [ ] Flair auto-updates on progression changes
- [ ] Flair copy treats flair as subreddit-scoped, not Reddit-wide
- [ ] Achievements include hidden/surprise entries
- [ ] Daily missions rotate deterministically (same for all players)
- [ ] Progress bar visible on main game screen
- [ ] Near-miss messaging used ("You're 50 XP from leveling up!")
- [ ] Player count displayed for social proof
- [ ] All progression state stored in Redis with documented schema
- [ ] Stored user identity/progression data has account-deletion cleanup or documented retention bounds
