# Implementation Plan: Engagement Growth System

## Overview

Add six engagement subsystems to the Urjo puzzle game: Daily/Weekly Missions, Achievements & Milestones, Variable Reward Mechanics, Community Highlights, Flair-Based Progression, and Referral Incentives. The implementation builds on the existing Hono API routes, Redis data layer, economy system, and scheduler infrastructure. All new business logic lives in pure, testable modules under `src/server/lib/`. New API routes are added via a dedicated `engagementRouter`. Shared types and constants live in `src/shared/`.

## Tasks

- [x] 1. Add shared engagement types and constants
  - [x] 1.1 Create `src/shared/engagement-types.ts` with all engagement type definitions
    - Add `MissionCadence`, `MissionType`, `MissionTemplate`, `MissionInstance`, `MissionState` types
    - Add `AchievementCategory`, `AchievementDef`, `AchievementUnlock` types
    - Add `FlairTier`, `FlairTierDef` types
    - Add `MysteryBoxRewardType`, `MysteryBoxReward`, `VariableRewardResult` types
    - Add `InvestmentScoreBreakdown`, `ProfileResponse`, `MissionsResponse` types
    - Add `EngagementCompletionData` type for extended completion response
    - Add `MissionEvent` type for mission progress tracking
    - Add `UserStats` type for achievement checking input
    - _Requirements: 1.1, 1.7, 2.1, 2.6, 4.1, 5.1, 5.3, 7.1, 10.1_

  - [x] 1.2 Create `src/shared/engagement-constants.ts` with mission templates, achievement definitions, and reward weights
    - Add `DAILY_MISSION_TEMPLATES` readonly array of `MissionTemplate` objects covering: solve N puzzles, solve under time, solve zero mistakes, solve specific grid size, maintain streak, earn N coins
    - Add `WEEKLY_MISSION_TEMPLATES` readonly array covering: solve N puzzles total, solve on each grid size, achieve N speed solves, earn N total coins, complete daily missions on N days, solve at difficulty level N+
    - Add `ACHIEVEMENT_DEFS` readonly array across categories: Solve Count (10, 50, 100, 250, 500), Streak (7, 30, 100, 365), Speed (10, 50, 100), Economy (1000, 5000, 10000), Mastery (level 4 any grid, level 4 all grids), Social (5 shares, 5 challenges, 10 challenge beats)
    - Add `FLAIR_TIER_DEFS` readonly array: Bronze (1–3), Silver (4–7), Gold (8–12), Diamond (13–17), Master (18+)
    - Add `BONUS_MULTIPLIER_WEIGHTS` object: `{ none: 0.80, double: 0.15, triple: 0.05 }`
    - Add `MYSTERY_BOX_WEIGHTS` object: `{ coins: 0.50, streakFreeze: 0.30, cosmeticTitle: 0.20 }`
    - Add `MYSTERY_BOX_BASE_DROP_RATE = 0.10`, `MYSTERY_BOX_STREAK_BONUS = 0.02`, `MYSTERY_BOX_MAX_DROP_RATE = 0.30`
    - Add `STREAK_MILESTONES` array: `[{ threshold: 7, bonus: 50 }, { threshold: 30, bonus: 200 }, { threshold: 100, bonus: 500 }, { threshold: 365, bonus: 1000 }]`
    - Add `REFERRAL_BONUS = 25`, `REFERRAL_CAP_PER_POST = 10`
    - Add `ALL_DAILY_BONUS = 25`, `ALL_WEEKLY_BONUS = 75`
    - Add `MYSTERY_BOX_COIN_RANGE = { min: 10, max: 50 }`, `MYSTERY_BOX_TITLE_SUBSTITUTE_COINS = 100`
    - _Requirements: 1.1, 1.2, 1.4, 1.7, 2.1, 2.2, 2.6, 4.1, 5.1, 5.3, 5.4, 7.1, 8.1, 8.4, 9.1, 11.1, 11.2, 11.3_

  - [x]* 1.3 Write property tests for MissionTemplate round-trip serialization (Property 11)
    - **Property 11: MissionTemplate Round-Trip Serialization**
    - For all MissionTemplate objects in `DAILY_MISSION_TEMPLATES` and `WEEKLY_MISSION_TEMPLATES`, `JSON.parse(JSON.stringify(template))` produces a deeply equal object
    - **Validates: Requirements 11.4**

  - [x]* 1.4 Write property tests for AchievementDef round-trip serialization (Property 12)
    - **Property 12: AchievementDef Round-Trip Serialization**
    - For all AchievementDef objects in `ACHIEVEMENT_DEFS`, `JSON.parse(JSON.stringify(def))` produces a deeply equal object
    - **Validates: Requirements 11.5**

  - [x] 1.5 Extend `src/shared/types.ts` with engagement fields
    - Add `multiplier?: number` and `mysteryBox?: MysteryBoxReward` fields to `CoinReward`
    - Add `engagement?: EngagementCompletionData` field to `CompleteResponse`
    - _Requirements: 5.2, 5.6_

  - [x] 1.6 Re-export engagement constants from `src/shared/constants.ts`
    - Add re-exports of key engagement constants for convenience
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 2. Implement missions module
  - [x] 2.1 Create `src/server/lib/missions.ts` with pure mission logic
    - Implement `selectDailyMissions(date: string, templates: readonly MissionTemplate[]): MissionTemplate[]` — deterministic selection using date string hash, returns exactly 3 daily missions with no duplicates
    - Implement `selectWeeklyMissions(isoWeek: string, templates: readonly MissionTemplate[]): MissionTemplate[]` — deterministic selection using ISO week hash, returns exactly 2 weekly missions
    - Implement `generateMissionState(templates: MissionTemplate[]): MissionState` — creates initial state with zero progress
    - Implement `updateMissionProgress(state: MissionState, event: MissionEvent): MissionState` — pure function, returns updated state without mutating input, progress is monotonically non-decreasing, completion is sticky
    - _Requirements: 1.1, 1.2, 1.6, 1.7, 1.8, 2.1, 2.2, 2.6_

  - [x]* 2.2 Write property test for deterministic daily mission selection (Property 1)
    - **Property 1: Deterministic Daily Mission Selection**
    - For all valid date strings: always returns exactly 3 missions, all have cadence "daily", same date → same result, no duplicate missions
    - **Validates: Requirements 1.1, 1.2**

  - [x]* 2.3 Write property test for deterministic weekly mission selection (Property 2)
    - **Property 2: Deterministic Weekly Mission Selection**
    - For all valid ISO week strings: always returns exactly 2 missions, same week → same result, no duplicates
    - **Validates: Requirements 2.2**

  - [x]* 2.4 Write property test for mission progress monotonicity (Property 4)
    - **Property 4: Mission Progress is Monotonic**
    - For all sequences of mission events, `updateMissionProgress` never decreases `currentProgress`, once `completed` is true it stays true
    - **Validates: Requirements 3.2**

  - [x] 2.5 Add Redis persistence functions to `src/server/lib/missions.ts`
    - Implement `getMissionState(userId: string, cadence: MissionCadence): Promise<MissionState>` — reads from Redis, generates if not exists
    - Implement `saveMissionState(userId: string, cadence: MissionCadence, state: MissionState): Promise<void>` — persists to Redis
    - Implement `claimMission(userId: string, missionId: string, cadence: MissionCadence): Promise<{ coinsAwarded: number }>` — validates completion, marks claimed, awards coins via economy
    - Redis keys: `user:{userId}:missions:daily:{YYYY-MM-DD}`, `user:{userId}:missions:weekly:{isoWeek}`
    - _Requirements: 1.3, 1.5, 1.8, 2.5, 3.4, 3.5, 3.6_

  - [x]* 2.6 Write unit tests for mission persistence and claiming
    - Test `getMissionState` generates new state for first call, returns existing state on subsequent calls (Property 3: Mission Generation Idempotence)
    - Test `claimMission` awards coins for completed mission, returns error for incomplete mission, returns error for already-claimed mission
    - **Property 3: Mission Generation Idempotence**
    - **Validates: Requirements 1.8, 3.4, 3.5, 3.6**

- [x] 3. Implement achievements module
  - [x] 3.1 Create `src/server/lib/achievements.ts` with pure achievement logic
    - Implement `checkAchievements(stats: UserStats, unlocked: string[]): AchievementDef[]` — pure function, returns newly unlockable achievements, never returns already-unlocked achievements
    - Implement `getFlairTier(achievementCount: number): FlairTierDef` — pure function, maps count to exactly one tier
    - Implement `formatFlair(tier: FlairTierDef, titleEmoji: string, titleLabel: string): string` — pure function, returns `{tierEmoji} {titleEmoji} {titleLabel}`
    - Implement `checkStreakMilestone(currentStreak: number, unlockedAchievements: string[]): { threshold: number; bonus: number } | null` — returns milestone data if streak hits a threshold not yet unlocked
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 7.1, 7.5, 9.1, 9.3, 9.4_

  - [ ]* 3.2 Write property test for achievement unlock idempotence (Property 5)
    - **Property 5: Achievement Unlock is Idempotent**
    - For any stats and unlocked set, `checkAchievements` result ∩ unlocked = ∅, running twice with same stats produces same result
    - **Validates: Requirements 4.6**

  - [ ]* 3.3 Write property test for flair tier partitioning (Property 7)
    - **Property 7: Flair Tier Partitions Achievement Counts**
    - For any non-negative integer achievement count, `getFlairTier` returns exactly one tier, tiers form a complete non-overlapping partition of [0, ∞)
    - **Validates: Requirements 7.1**

  - [ ]* 3.4 Write property test for streak milestone bonus mapping (Property 14)
    - **Property 14: Streak Milestone Bonus Mapping**
    - For streak values at milestone thresholds (7, 30, 100, 365), the correct bonus is returned; for non-milestone values, no milestone bonus is returned
    - **Validates: Requirements 9.1**

  - [x] 3.5 Add Redis persistence functions to `src/server/lib/achievements.ts`
    - Implement `getUnlockedAchievements(userId: string): Promise<AchievementUnlock[]>` — reads from Redis
    - Implement `unlockAchievements(userId: string, newAchievements: AchievementDef[]): Promise<void>` — persists unlocks, awards coin bonuses, updates flair tier, updates Reddit flair if opted in
    - Redis keys: `user:{userId}:achievements`, `user:{userId}:flairTier`, `user:{userId}:flairOptIn`
    - _Requirements: 4.2, 4.3, 4.6, 7.2, 7.3, 7.4_

  - [ ]* 3.6 Write unit tests for achievement persistence and flair updates
    - Test `unlockAchievements` persists new achievements, awards coins, updates flair tier
    - Test flair is only updated for users who opted in
    - Test already-unlocked achievements are not re-awarded
    - _Requirements: 4.2, 4.3, 4.6, 7.2, 7.3_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement variable rewards module
  - [x] 5.1 Create `src/server/lib/variable-rewards.ts` with pure reward logic
    - Implement `rollBonusMultiplier(seed: string): number | null` — deterministic given seed, 15% chance of 2×, 5% chance of 3×, 80% null
    - Implement `calculateMysteryBoxDropRate(currentStreak: number): number` — pure function, returns 0.10 + min(currentStreak × 0.02, 0.20), capped at 0.30
    - Implement `rollMysteryBox(seed: string, dropRate: number, ownedTitles: string[]): MysteryBoxReward | null` — deterministic given seed, weighted selection from pool, substitutes 100 coins if all titles owned
    - Implement `rollVariableRewards(userId: string, postId: string, timestamp: number, streak: number, ownedTitles: string[]): VariableRewardResult` — combines multiplier and mystery box rolls, builds seed from userId + postId + timestamp
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7_

  - [ ]* 5.2 Write property test for mystery box drop rate bounds (Property 8)
    - **Property 8: Mystery Box Drop Rate is Bounded**
    - For any non-negative streak value, `calculateMysteryBoxDropRate(streak)` returns a value in [0.10, 0.30]
    - **Validates: Requirements 5.3**

  - [ ]* 5.3 Write property test for variable reward determinism (Property 9)
    - **Property 9: Variable Reward Determinism**
    - For the same (userId, postId, timestamp), `rollVariableRewards` always returns the same result
    - **Validates: Requirements 5.5**

  - [ ]* 5.4 Write property test for bonus multiplier distribution (Property 10)
    - **Property 10: Bonus Multiplier Distribution**
    - Given many seeds, the multiplier distribution approximates 80% null, 15% 2×, 5% 3× within statistical tolerance
    - **Validates: Requirements 5.1**

  - [ ]* 5.5 Write unit tests for variable rewards edge cases
    - Test mystery box awards 100 coins when all titles owned
    - Test mystery box coin reward is within [10, 50] range
    - Test streak freeze reward returns type "streak_freeze" with value 1
    - _Requirements: 5.4, 5.7_

- [ ] 6. Implement referrals module
  - [x] 6.1 Create `src/server/lib/referrals.ts` with referral tracking logic
    - Implement `checkAndAwardReferral(postId: string, newPlayerId: string, challengeCreatorId: string): Promise<{ awarded: boolean; reason?: string }>` — checks new player status (totalSolves === 0), dedup via Redis key, cap enforcement (10 per post), awards 25 coins to creator
    - Redis keys: `referral:{postId}:{newPlayerId}` for dedup, economy hash `totalReferrals` field for counter
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 6.2 Write unit tests for referral logic including cap enforcement (Property 15)
    - **Property 15: Referral Cap Enforcement**
    - Simulate 11+ referral attempts on a single post, verify only first 10 succeed
    - Test duplicate referral is rejected
    - Test non-new player (totalSolves > 0) is rejected
    - **Validates: Requirements 8.4, 8.5**

- [ ] 7. Implement profile and highlights modules
  - [x] 7.1 Create `src/server/lib/profile.ts` with investment score logic
    - Implement `calculateInvestmentScore(data: InvestmentScoreInput): InvestmentScoreBreakdown` — pure function, formula: totalCoinsEarned + (titlesOwned × 100) + (achievementsUnlocked × 50) + (currentStreak × 10) + (longestStreak × 5)
    - Implement `calculateRankPercentile(userScore: number, allScores: number[]): number` — pure function, percentage of users with score ≤ userScore, bounded [0, 100]
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 7.2 Write property test for investment score monotonicity (Property 6)
    - **Property 6: Investment Score is Monotonically Non-Decreasing**
    - For any two inputs where every component is ≥ the other, the total score is also ≥
    - **Validates: Requirements 10.2**

  - [ ]* 7.3 Write property test for rank percentile bounds (Property 13)
    - **Property 13: Rank Percentile is Bounded**
    - For any user score and non-empty array of scores, `calculateRankPercentile` returns [0, 100], higher score yields ≥ percentile
    - **Validates: Requirements 10.4**

  - [x] 7.4 Create `src/server/lib/highlights.ts` with community highlight formatting
    - Implement `buildHighlightsComment(data: HighlightData): string` — pure function, formats "Yesterday's Stars" section with top streak, fastest solve per grid, most coins
    - Implement `buildPlayerOfTheWeekComment(data: WeeklyHighlightData): string` — pure function, formats "Player of the Week" section
    - Implement `buildMissionPreview(missions: MissionTemplate[]): string` — pure function, formats mission preview line for daily post
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 12.3_

  - [ ]* 7.5 Write unit tests for highlight formatting and profile calculations
    - Test `buildHighlightsComment` includes all category leaders with title emojis
    - Test `buildPlayerOfTheWeekComment` formats correctly on Mondays
    - Test `buildMissionPreview` lists all 3 daily missions
    - Test `calculateInvestmentScore` with known inputs
    - _Requirements: 6.1, 6.6, 10.2, 12.3_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Create engagement API routes
  - [x] 9.1 Create `src/server/routes/engagement.ts` with mission, achievement, and profile endpoints
    - Implement `GET /api/missions` — returns daily and weekly missions with progress, bonus availability flags
    - Implement `POST /api/missions/claim` — validates completion, marks claimed, awards coins, returns 400 for incomplete or already-claimed
    - Implement `GET /api/achievements` — returns all achievements with unlock status and progress percentage
    - Implement `GET /api/profile` — returns investment score breakdown, flair tier, total referrals, achievements, rank percentile
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 4.4, 10.1, 10.3, 10.4_

  - [x] 9.2 Register `engagementRouter` in `src/server/index.ts`
    - Import and mount `engagementRouter` alongside existing `gameRouter` and `economyRouter`
    - _Requirements: 3.1, 4.4, 10.1_

  - [ ]* 9.3 Write integration tests for engagement API routes
    - Test `GET /api/missions` returns 3 daily and 2 weekly missions
    - Test `POST /api/missions/claim` returns 400 for incomplete mission, awards coins for completed mission
    - Test `GET /api/achievements` returns all achievements with progress
    - Test `GET /api/profile` returns investment score and flair tier
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 4.4, 10.1_

- [ ] 10. Extend game completion handler with engagement logic
  - [x] 10.1 Extend `POST /api/game/complete` in `src/server/routes/game.ts`
    - After existing coin reward logic, roll variable rewards (bonus multiplier + mystery box)
    - If multiplier hits, multiply base coin reward and re-persist updated total
    - If mystery box drops, apply reward (coins added to economy, streak freeze incremented, or title added to owned titles)
    - Update all applicable daily and weekly mission progress counters
    - Increment `leaderboard:weekly:{isoWeek}` sorted set for community highlights
    - Check for newly unlocked achievements based on updated stats
    - Check for streak milestones and award bonus coins
    - Check referral eligibility if this is a challenge post and user is a new player
    - Return `engagement` field in response with `VariableRewardResult`, `newAchievements`, `streakMilestone`, and `missionsUpdated` flag
    - _Requirements: 1.3, 2.3, 3.3, 4.5, 5.1, 5.2, 5.3, 5.6, 6.5, 8.1, 9.1, 9.2_

  - [ ]* 10.2 Write integration tests for extended completion handler
    - Test completion response includes `engagement` field
    - Test variable reward multiplier is applied to coin reward
    - Test mystery box reward is included in response
    - Test mission progress is updated after completion
    - Test weekly leaderboard is incremented
    - Test achievement unlock is returned when threshold is met
    - Test streak milestone bonus is awarded at threshold
    - _Requirements: 3.3, 4.5, 5.1, 5.2, 5.6, 6.5, 9.2_

- [ ] 11. Extend scheduler with community highlights and mission preview
  - [x] 11.1 Extend daily puzzle scheduler in `src/server/index.ts`
    - Count active players (users with `streak:lastDate` within 7 days), cache in `stats:activePlayers:7d` with 5-second timeout fallback
    - Sum all active streaks, cache in `stats:collectiveStreaks`
    - Generate today's 3 daily missions and format as preview line using `buildMissionPreview`
    - Fetch "Yesterday's Stars" data from leaderboard sorted sets using `buildHighlightsComment`
    - On Mondays, fetch "Player of the Week" from weekly completion counts using `buildPlayerOfTheWeekComment`
    - Combine all sections into the sticky comment alongside existing leaderboard data
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 11.2 Write unit tests for scheduler highlight integration
    - Test sticky comment includes active player count
    - Test sticky comment includes collective streak count
    - Test sticky comment includes mission preview
    - Test Monday posts include "Player of the Week" section
    - Test 5-second timeout fallback uses cached value
    - _Requirements: 12.1, 12.2, 12.3, 12.5_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implement client-side engagement UI components
  - [x] 13.1 Create `MissionsPanel.svelte` component in `src/client/components/`
    - Display daily missions (3) and weekly missions (2) with progress bars
    - Show completion status and claim buttons for completed missions
    - Show "All Complete" bonus indicator when all daily/weekly missions are done
    - Call `POST /api/missions/claim` when claim button is tapped
    - Refresh mission data after claiming
    - _Requirements: 1.3, 1.4, 2.3, 2.4, 3.1, 3.2_

  - [x] 13.2 Create `AchievementsPanel.svelte` component in `src/client/components/`
    - Display all achievements grouped by category with progress percentage
    - Show unlocked achievements with emoji badges and unlock dates
    - Show locked achievements with progress toward threshold
    - Fetch data from `GET /api/achievements`
    - _Requirements: 4.1, 4.4_

  - [x] 13.3 Create `MysteryBoxAnimation.svelte` component in `src/client/components/`
    - Display an unboxing animation when a mystery box is awarded
    - Show the reward type and value after animation completes
    - Support coin, streak freeze, and cosmetic title reward types
    - _Requirements: 5.6_

  - [x] 13.4 Create `ProfilePanel.svelte` component in `src/client/components/`
    - Display investment score with component breakdown
    - Show flair tier badge and progress to next tier
    - Show total referrals count
    - Show rank percentile
    - Fetch data from `GET /api/profile`
    - _Requirements: 10.1, 10.3_

  - [x] 13.5 Create `StreakMilestoneOverlay.svelte` component in `src/client/components/`
    - Display a celebration overlay when a streak milestone is reached
    - Show milestone threshold and bonus coins awarded
    - Auto-dismiss after 3.5 seconds (matching existing level-up overlay pattern)
    - _Requirements: 9.2_

  - [x] 13.6 Update `GameView.svelte` to integrate engagement UI elements
    - Add multiplier badge display in completion overlay when bonus multiplier is active (e.g., "2× BONUS!")
    - Show mystery box animation trigger in completion overlay
    - Show streak milestone celebration when milestone data is present
    - Add navigation to missions, achievements, and profile panels
    - Display new achievement unlock notifications in completion overlay
    - _Requirements: 5.2, 5.6, 9.2_

  - [x] 13.7 Update `App.svelte` to handle engagement state and API integration
    - Track engagement data from extended `CompleteResponse`
    - Pass variable reward, achievement, and milestone data to `GameView`
    - Handle mystery box reward application (update coins, streak freezes, or owned titles)
    - Add state management for missions panel, achievements panel, and profile panel visibility
    - _Requirements: 5.2, 5.6, 9.2, 10.1_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- The project uses TypeScript throughout (Svelte 5 client, Hono server, shared types)
- Run `bun run test` after each implementation task per the TDD workflow
- All new business logic is in pure, testable modules — side effects are isolated at the boundary (Redis persistence, API routes)
- Variable reward rolls are deterministic given a seed, making them reproducible and testable
- Mission and achievement definitions are data-driven constants — adding new ones requires no engine changes
