# Implementation Plan: Engagement Growth System

## Overview

This design adds six subsystems to the Urjo puzzle game: Daily/Weekly Missions, Achievements & Milestones, Variable Reward Mechanics, Community Highlights, Flair-Based Progression, and Referral Incentives. The implementation builds on the existing Hono API routes, Redis data layer, economy system, and scheduler infrastructure.

All new business logic lives in pure, testable modules under `src/server/lib/`. New API routes are added via dedicated Hono routers. Shared type definitions and constant data (mission templates, achievement definitions, reward weights) live in `src/shared/`.

---

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/shared/engagement-types.ts` | Types for missions, achievements, rewards, profiles |
| `src/shared/engagement-constants.ts` | Mission templates, achievement defs, reward weights |
| `src/server/lib/missions.ts` | Mission generation, progress tracking, claiming |
| `src/server/lib/achievements.ts` | Achievement checking, unlocking, flair tier logic |
| `src/server/lib/variable-rewards.ts` | Bonus multiplier rolls, mystery box drops |
| `src/server/lib/referrals.ts` | Referral tracking and bonus logic |
| `src/server/lib/profile.ts` | Investment score calculation, profile aggregation |
| `src/server/lib/highlights.ts` | Community highlight data fetching and formatting |
| `src/server/routes/engagement.ts` | API routes: missions, achievements, profile |

### Modified Files

| File | Changes |
|------|---------|
| `src/server/routes/game.ts` | Extend completion handler to update missions, check achievements, roll variable rewards, track referrals, increment weekly leaderboard |
| `src/server/index.ts` | Register `engagementRouter`, extend scheduler to include highlights and mission preview |
| `src/shared/types.ts` | Add `CoinReward.multiplier`, `CoinReward.mysteryBox` fields |
| `src/shared/constants.ts` | Re-export engagement constants for convenience |

### Data Flow

```
Puzzle Complete → game.ts completion handler
  ├─ Update mission progress (missions.ts)
  ├─ Roll variable rewards (variable-rewards.ts)
  ├─ Check achievements (achievements.ts)
  ├─ Check referral (referrals.ts)
  ├─ Increment weekly leaderboard
  └─ Return enriched CompleteResponse

Scheduler → daily-puzzle handler
  ├─ Build highlights comment (highlights.ts)
  ├─ Include mission preview (missions.ts)
  ├─ Include active player stats
  └─ Post to Reddit
```

---

## Data Models

### New Types (`src/shared/engagement-types.ts`)

```typescript
/** Mission cadence */
type MissionCadence = 'daily' | 'weekly'

/** Mission template type identifiers */
type MissionType =
  | 'solve_n_puzzles'
  | 'solve_under_time'
  | 'solve_zero_mistakes'
  | 'solve_grid_size'
  | 'maintain_streak'
  | 'earn_n_coins'
  | 'solve_each_grid'
  | 'achieve_speed_solves'
  | 'complete_daily_missions'
  | 'solve_difficulty_level'

/** Mission template definition (stored in constants) */
type MissionTemplate = {
  readonly id: string
  readonly type: MissionType
  readonly descriptionTemplate: string
  readonly targetValue: number
  readonly coinReward: number
  readonly cadence: MissionCadence
}

/** Runtime mission instance with progress */
type MissionInstance = {
  templateId: string
  type: MissionType
  description: string
  targetValue: number
  currentProgress: number
  completed: boolean
  claimed: boolean
  coinReward: number
}

/** Daily/weekly mission state stored in Redis */
type MissionState = {
  missions: MissionInstance[]
  allCompleteBonusClaimed: boolean
}

/** Achievement category */
type AchievementCategory =
  | 'solve_count'
  | 'streak'
  | 'speed'
  | 'economy'
  | 'mastery'
  | 'social'

/** Achievement definition (stored in constants) */
type AchievementDef = {
  readonly id: string
  readonly category: AchievementCategory
  readonly label: string
  readonly emoji: string
  readonly description: string
  readonly thresholdValue: number
  readonly coinBonus: number
}

/** Achievement unlock record */
type AchievementUnlock = {
  id: string
  unlockedAt: number // timestamp
}

/** Flair tier */
type FlairTier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'master'

/** Flair tier definition */
type FlairTierDef = {
  readonly tier: FlairTier
  readonly minAchievements: number
  readonly maxAchievements: number
  readonly emoji: string
  readonly label: string
}

/** Mystery box reward type */
type MysteryBoxRewardType = 'coins' | 'streak_freeze' | 'cosmetic_title'

/** Mystery box reward */
type MysteryBoxReward = {
  type: MysteryBoxRewardType
  value: number // coin amount, or 1 for freeze/title
  titleId?: string // if type is cosmetic_title
}

/** Variable reward result */
type VariableRewardResult = {
  bonusMultiplier: number | null // null = no multiplier, 2 or 3
  mysteryBox: MysteryBoxReward | null // null = no drop
}

/** Investment score breakdown */
type InvestmentScoreBreakdown = {
  totalCoinsEarned: number
  titlesOwned: number
  titlesScore: number
  achievementsUnlocked: number
  achievementsScore: number
  currentStreak: number
  currentStreakScore: number
  longestStreak: number
  longestStreakScore: number
  totalScore: number
}

/** Profile response */
type ProfileResponse = {
  investmentScore: InvestmentScoreBreakdown
  flairTier: FlairTier
  totalReferrals: number
  achievements: AchievementUnlock[]
  rankPercentile: number
}

/** Missions API response */
type MissionsResponse = {
  daily: MissionInstance[]
  weekly: MissionInstance[]
  dailyBonusAvailable: boolean
  weeklyBonusAvailable: boolean
}

/** Extended completion response fields */
type EngagementCompletionData = {
  variableReward: VariableRewardResult
  newAchievements: AchievementDef[]
  streakMilestone: { threshold: number; bonus: number } | null
  missionsUpdated: boolean
}
```

### Redis Key Schema

| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `user:{userId}:missions:daily:{YYYY-MM-DD}` | String (JSON) | Daily mission state |
| `user:{userId}:missions:weekly:{isoWeek}` | String (JSON) | Weekly mission state |
| `user:{userId}:achievements` | String (JSON) | Array of AchievementUnlock |
| `user:{userId}:flairTier` | String | Current flair tier name |
| `user:{userId}:flairOptIn` | String | "true" if user opted in to flair updates |
| `referral:{postId}:{newPlayerId}` | String | "true" — dedup referral events |
| `leaderboard:weekly:{isoWeek}` | Sorted Set | Weekly completion counts |
| `stats:activePlayers:7d` | String | Cached active player count |
| `stats:collectiveStreaks` | String | Cached sum of active streaks |

---

## API Contracts

### GET /api/missions

Returns current daily and weekly missions with progress.

**Response:** `MissionsResponse`

```json
{
  "daily": [
    {
      "templateId": "daily_solve_3",
      "type": "solve_n_puzzles",
      "description": "Solve 3 puzzles today",
      "targetValue": 3,
      "currentProgress": 1,
      "completed": false,
      "claimed": false,
      "coinReward": 15
    }
  ],
  "weekly": [...],
  "dailyBonusAvailable": false,
  "weeklyBonusAvailable": false
}
```

### POST /api/missions/claim

Claim reward for a completed mission.

**Request:** `{ missionId: string, cadence: "daily" | "weekly" }`

**Response:** `{ success: true, coinsAwarded: number }` or `{ error: string }` (400)

### GET /api/achievements

Returns all achievements with unlock status and progress.

**Response:**
```json
{
  "achievements": [
    {
      "id": "solve_10",
      "category": "solve_count",
      "label": "Puzzle Novice",
      "emoji": "🧩",
      "description": "Solve 10 puzzles",
      "thresholdValue": 10,
      "coinBonus": 25,
      "unlocked": true,
      "unlockedAt": 1700000000000,
      "progressPercent": 100
    }
  ]
}
```

### GET /api/profile

Returns investment score, flair tier, referrals, and achievements.

**Response:** `ProfileResponse`

### Extended POST /api/game/complete Response

The existing `CompleteResponse` is extended with:

```json
{
  "performanceScore": 0.85,
  "newSkillLevel": 3,
  "previousSkillLevel": 3,
  "streak": { "currentStreak": 7, "longestStreak": 15, "lastPlayedDate": "2024-01-15" },
  "coinReward": { "base": 15, "...": "...", "multiplier": 2, "multipliedBase": 30 },
  "engagement": {
    "variableReward": { "bonusMultiplier": 2, "mysteryBox": null },
    "newAchievements": [{ "id": "streak_7", "...": "..." }],
    "streakMilestone": { "threshold": 7, "bonus": 50 },
    "missionsUpdated": true
  }
}
```

---

## Module Design

### missions.ts — Mission Generation & Tracking

**`selectDailyMissions(date: string, templates: readonly MissionTemplate[]): MissionTemplate[]`**
- Deterministic selection using date string as seed
- Hash the date to get an index, select 3 non-overlapping daily templates
- Pure function, no side effects

**`selectWeeklyMissions(isoWeek: string, templates: readonly MissionTemplate[]): MissionTemplate[]`**
- Same approach using ISO week string as seed
- Select 2 non-overlapping weekly templates

**`generateMissionState(templates: MissionTemplate[]): MissionState`**
- Creates initial MissionState with zero progress

**`updateMissionProgress(state: MissionState, event: MissionEvent): MissionState`**
- Pure function: given current state and an event (puzzle solved, coins earned, etc.), returns updated state
- Does not mutate input

**`getMissionState(userId: string, cadence: MissionCadence): Promise<MissionState>`**
- Reads from Redis, generates if not exists

**`saveMissionState(userId: string, cadence: MissionCadence, state: MissionState): Promise<void>`**
- Persists to Redis

**`claimMission(userId: string, missionId: string, cadence: MissionCadence): Promise<{ coinsAwarded: number }>`**
- Validates completion, marks claimed, awards coins

### achievements.ts — Achievement Checking & Flair

**`checkAchievements(stats: UserStats, unlocked: string[]): AchievementDef[]`**
- Pure function: given user stats and already-unlocked IDs, returns newly unlockable achievements
- No side effects

**`getFlairTier(achievementCount: number): FlairTierDef`**
- Pure function: maps achievement count to tier

**`formatFlair(tier: FlairTierDef, titleEmoji: string, titleLabel: string): string`**
- Pure function: returns formatted flair string

**`unlockAchievements(userId: string, newAchievements: AchievementDef[]): Promise<void>`**
- Persists unlocks, awards coins, updates flair if opted in

### variable-rewards.ts — Bonus Multipliers & Mystery Boxes

**`rollBonusMultiplier(seed: string): number | null`**
- Deterministic given seed, returns 2, 3, or null
- 15% chance of 2×, 5% chance of 3×

**`calculateMysteryBoxDropRate(currentStreak: number): number`**
- Pure function: 0.10 + min(currentStreak * 0.02, 0.20)
- Capped at 0.30

**`rollMysteryBox(seed: string, dropRate: number, ownedTitles: string[]): MysteryBoxReward | null`**
- Deterministic given seed
- If drop: weighted selection from pool
- If cosmetic title and all owned: substitute 100 coins

**`rollVariableRewards(userId: string, postId: string, timestamp: number, streak: number, ownedTitles: string[]): VariableRewardResult`**
- Combines multiplier and mystery box rolls
- Builds seed from userId + postId + timestamp

### referrals.ts — Referral Tracking

**`checkAndAwardReferral(postId: string, newPlayerId: string, challengeCreatorId: string): Promise<{ awarded: boolean; reason?: string }>`**
- Checks: is new player (totalSolves === 0), not already referred, cap not exceeded
- Awards 25 coins to creator, increments counter

### profile.ts — Investment Score

**`calculateInvestmentScore(data: InvestmentScoreInput): InvestmentScoreBreakdown`**
- Pure function
- Formula: totalCoinsEarned + (titlesOwned × 100) + (achievementsUnlocked × 50) + (currentStreak × 10) + (longestStreak × 5)

**`calculateRankPercentile(userScore: number, allScores: number[]): number`**
- Pure function: percentage of users with score ≤ userScore

### highlights.ts — Community Highlights

**`buildHighlightsComment(data: HighlightData): string`**
- Pure function: formats "Yesterday's Stars" section

**`buildPlayerOfTheWeekComment(data: WeeklyHighlightData): string`**
- Pure function: formats "Player of the Week" section

**`buildMissionPreview(missions: MissionTemplate[]): string`**
- Pure function: formats mission preview line

---

## Correctness Properties

### Property 1: Deterministic Daily Mission Selection (Req 1.1, 1.2)
For all valid date strings, `selectDailyMissions(date, templates)` always returns the same 3 missions. For two different dates, the selections differ (with high probability given a sufficiently large template pool).

**Test approach:** Property-based test — generate random date strings, verify:
- Always returns exactly 3 missions
- All returned missions have cadence "daily"
- Same date → same result (idempotence)
- No duplicate missions in a single day's selection

### Property 2: Deterministic Weekly Mission Selection (Req 2.2)
For all valid ISO week strings, `selectWeeklyMissions(isoWeek, templates)` always returns the same 2 missions.

**Test approach:** Property-based test — same structure as Property 1 but for weekly cadence.

### Property 3: Mission Generation Idempotence (Req 1.8)
Calling `getMissionState` multiple times for the same user and date returns the same missions without regenerating.

**Test approach:** Property-based test — for any userId and date, two consecutive calls return identical state.

### Property 4: Mission Progress is Monotonic (Req 3.2)
For all mission events, `updateMissionProgress` never decreases `currentProgress` for any mission. Once `completed` is true, it stays true.

**Test approach:** Property-based test — generate sequences of mission events, verify progress is non-decreasing and completion is sticky.

### Property 5: Achievement Unlock is Idempotent (Req 4.6)
`checkAchievements` never returns an achievement that is already in the `unlocked` list. Running the check twice with the same stats produces the same result.

**Test approach:** Property-based test — for any stats and unlocked set, result ∩ unlocked = ∅.

### Property 6: Investment Score is Monotonically Non-Decreasing (Req 10.2)
For any two inputs where every component is ≥ the corresponding component of the other, the total score is also ≥.

**Test approach:** Property-based test — generate two InvestmentScoreInput values where one dominates the other, verify score ordering.

### Property 7: Flair Tier Partitions Achievement Counts (Req 7.1)
For any non-negative integer achievement count, exactly one FlairTierDef matches. The tiers form a complete, non-overlapping partition of [1, ∞).

**Test approach:** Property-based test — for any achievement count ≥ 1, `getFlairTier` returns exactly one tier. For count 0, no tier (or a default).

### Property 8: Mystery Box Drop Rate is Bounded (Req 5.3)
For any non-negative streak value, `calculateMysteryBoxDropRate(streak)` returns a value in [0.10, 0.30].

**Test approach:** Property-based test — generate arbitrary non-negative integers, verify bounds.

### Property 9: Variable Reward Determinism (Req 5.5)
For the same (userId, postId, timestamp), `rollVariableRewards` always returns the same result.

**Test approach:** Property-based test — generate random triples, call twice, verify equality.

### Property 10: Bonus Multiplier Distribution (Req 5.1)
Given a uniform random seed, the multiplier distribution approximates 80% null, 15% 2×, 5% 3×.

**Test approach:** Property-based test — generate many seeds, verify distribution is within statistical tolerance.

### Property 11: MissionTemplate Round-Trip Serialization (Req 11.4)
For all MissionTemplate objects, `JSON.parse(JSON.stringify(template))` produces a deeply equal object.

**Test approach:** Property-based test — for each template in the constant array, verify round-trip equality.

### Property 12: AchievementDef Round-Trip Serialization (Req 11.5)
For all AchievementDef objects, `JSON.parse(JSON.stringify(def))` produces a deeply equal object.

**Test approach:** Property-based test — for each definition in the constant array, verify round-trip equality.

### Property 13: Rank Percentile is Bounded (Req 10.4)
For any user score and non-empty array of all scores, `calculateRankPercentile` returns a value in [0, 100]. A higher score always yields a percentile ≥ a lower score's percentile.

**Test approach:** Property-based test — generate score arrays and user scores, verify bounds and monotonicity.

### Property 14: Streak Milestone Bonus Mapping (Req 9.1)
For any streak value at a milestone threshold (7, 30, 100, 365), the correct bonus is returned. For non-milestone values, no milestone bonus is returned.

**Test approach:** Property-based test — generate arbitrary streak values, verify milestone detection matches the defined thresholds.

### Property 15: Referral Cap Enforcement (Req 8.4)
After 10 successful referrals on a single challenge post, no further referral bonuses are awarded regardless of how many new players complete the challenge.

**Test approach:** Example-based test — simulate 11+ referral attempts, verify only first 10 succeed.

---

## Integration Points

### Completion Handler Extension (game.ts)

The `POST /api/game/complete` handler is extended after the existing coin reward logic:

1. **Variable Rewards**: Roll bonus multiplier and mystery box. If multiplier hits, multiply the base coin reward and re-persist. If mystery box drops, apply reward (coins/freeze/title).
2. **Mission Progress**: Update all applicable daily and weekly mission progress counters.
3. **Weekly Leaderboard**: Increment `leaderboard:weekly:{isoWeek}` sorted set.
4. **Achievement Check**: Gather updated stats, check for new achievements, unlock and award.
5. **Streak Milestones**: Check if updated streak hits a milestone threshold.
6. **Referral Check**: If this is a challenge post and the user is a new player, award referral bonus to creator.
7. **Return**: Include `engagement` field in response with all new data.

### Scheduler Extension (index.ts)

The `POST /internal/scheduler/daily-puzzle` handler is extended:

1. **Active Player Count**: Count users with `streak:lastDate` within 7 days, cache in `stats:activePlayers:7d` with 5-second timeout fallback.
2. **Collective Streaks**: Sum all active streaks, cache in `stats:collectiveStreaks`.
3. **Mission Preview**: Generate today's 3 daily missions, format as preview line.
4. **Yesterday's Stars**: Fetch top performers from leaderboard sorted sets.
5. **Player of the Week**: On Mondays, fetch top weekly completion count.
6. **Build Comment**: Combine all sections into the sticky comment.

---

## Error Handling

- All new Redis operations use try/catch with descriptive error logging
- Mission/achievement operations are non-blocking — failures don't prevent puzzle completion from succeeding
- Variable reward rolls are deterministic and pure — no failure modes
- Referral checks fail gracefully — if Redis is unavailable, skip referral (no coins lost, can be retried)
- Active player count query has a 5-second timeout with cached fallback
- All new API endpoints validate userId from context and return 400 if missing
