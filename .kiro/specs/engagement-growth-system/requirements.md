# Requirements Document

## Introduction

The Engagement Growth System adds daily missions, achievements, variable rewards, community highlights, and viral mechanics to the Urjo puzzle game. The goal is to maximize Daily Active Engagers (DAE), retention, and viral K-factor by closing the gaps identified in the current game loop against Reddit's Community Games best practices and Nir Eyal's Hooked model (Trigger → Action → Variable Reward → Investment).

The system builds on existing infrastructure — streaks, coins, titles, leaderboards, challenge posts, and the twice-daily scheduler — and introduces six new subsystems: Daily/Weekly Missions, Achievements & Milestones, Variable Reward Mechanics, Community Highlights ("Player of the Week"), Flair-Based Progression, and Referral Incentives. Each subsystem is scoped to what the Devvit platform supports today (Redis, Reddit API for posts/comments/flair, scheduler cron jobs) and avoids features requiring beta access (push notifications).

## Glossary

- **Mission_System**: The server-side subsystem that generates, tracks, and rewards daily and weekly missions for each user
- **Daily_Mission**: A mission that resets every UTC day, requiring the user to complete a specific objective within that day
- **Weekly_Mission**: A mission that resets every UTC Monday, requiring the user to complete a larger objective within that week
- **Mission_Progress**: A Redis hash tracking a user's current progress toward each active mission's objective
- **Achievement_System**: The server-side subsystem that tracks long-term milestones and awards permanent badges upon completion
- **Achievement**: A permanent, one-time unlock awarded when a user reaches a specific cumulative milestone
- **Achievement_Badge**: A visual indicator (emoji + label) displayed on a user's profile and optionally in their Reddit flair
- **Variable_Reward_Engine**: The server-side logic that introduces randomness into coin rewards via bonus multipliers and mystery boxes
- **Mystery_Box**: A random reward granted after puzzle completion with a configurable drop rate, containing coins, streak freezes, or cosmetic items
- **Bonus_Multiplier**: A random 2× or 3× multiplier applied to the base coin reward with a configurable probability
- **Community_Highlight_System**: The scheduler-driven subsystem that selects and announces top-performing players in the daily puzzle post comments
- **Player_of_the_Week**: A weekly recognition posted as a comment on the first puzzle post of each week, highlighting top performers across categories
- **Flair_Progression_System**: The server-side logic that automatically updates a user's subreddit flair based on their achievement tier
- **Flair_Tier**: A progression level (Bronze, Silver, Gold, Diamond, Master) determined by the number of achievements unlocked
- **Referral_System**: The server-side subsystem that tracks when a user's challenge post leads to a new player's first solve, rewarding both parties
- **Referral_Bonus**: Coins awarded to the challenger when a new player completes their challenge post for the first time
- **New_Player**: A user whose `totalSolves` in the economy hash is 0 at the time they complete a challenge post
- **Streak_Milestone**: A special achievement triggered at streak thresholds (7, 30, 100, 365 days) that awards bonus coins and an Achievement_Badge
- **Daily_Puzzle_Post**: A Reddit post created by the scheduler at 16:00 and 20:00 UTC containing a fresh puzzle
- **Coin_Reward_System**: The existing economy subsystem that calculates coin rewards, now extended with Variable_Reward_Engine outputs
- **Investment_Score**: A computed value representing the total stored value a user has accumulated (titles owned, achievements unlocked, streak length, coins earned), used to display "sunk cost" to the user

## Requirements

### Requirement 1: Daily Missions

**User Story:** As a player, I want daily missions that give me specific objectives beyond just solving puzzles, so that each day feels fresh and I have reasons to come back.

#### Acceptance Criteria

1. WHEN a user loads the game for the first time each UTC day, THE Mission_System SHALL generate a set of 3 Daily_Missions from a predefined pool of mission templates
2. THE Mission_System SHALL select Daily_Missions using a deterministic seed based on the UTC date, so that all users receive the same 3 missions on a given day
3. WHEN a user completes a Daily_Mission objective, THE Mission_System SHALL mark that mission as complete and award the specified coin reward
4. WHEN a user completes all 3 Daily_Missions in a single day, THE Mission_System SHALL award a bonus reward of 25 coins on top of individual mission rewards
5. THE Mission_System SHALL store Daily_Mission progress in Redis under the key `user:{userId}:missions:daily:{date}` as a JSON hash
6. WHEN a new UTC day begins, THE Mission_System SHALL treat the previous day's incomplete missions as expired without penalty
7. THE Mission_System SHALL support the following mission template types: solve N puzzles, solve a puzzle under X seconds, solve a puzzle with zero mistakes, solve a puzzle on a specific grid size, maintain a streak of N days, earn N coins in a single day
8. IF a user has already generated Daily_Missions for the current day, THEN THE Mission_System SHALL return the existing missions and progress without regenerating

### Requirement 2: Weekly Missions

**User Story:** As a player, I want weekly missions with bigger goals and better rewards, so that I have medium-term objectives that keep me engaged across the week.

#### Acceptance Criteria

1. WHEN a user loads the game for the first time each UTC week (Monday 00:00), THE Mission_System SHALL generate a set of 2 Weekly_Missions from a predefined pool of weekly mission templates
2. THE Mission_System SHALL select Weekly_Missions using a deterministic seed based on the ISO week number, so that all users receive the same 2 missions each week
3. WHEN a user completes a Weekly_Mission objective, THE Mission_System SHALL mark that mission as complete and award the specified coin reward
4. WHEN a user completes both Weekly_Missions in a single week, THE Mission_System SHALL award a bonus reward of 75 coins on top of individual mission rewards
5. THE Mission_System SHALL store Weekly_Mission progress in Redis under the key `user:{userId}:missions:weekly:{isoWeek}` as a JSON hash
6. THE Mission_System SHALL support the following weekly mission template types: solve N puzzles total, solve N puzzles on each grid size, achieve N speed solves, earn N total coins, complete all daily missions on N different days, solve a puzzle at difficulty level N or higher

### Requirement 3: Mission Progress API

**User Story:** As a player, I want to see my mission progress in the game UI, so that I know how close I am to completing each mission.

#### Acceptance Criteria

1. THE Server SHALL expose a `GET /api/missions` endpoint that returns the user's current daily and weekly missions with progress data
2. WHEN the missions endpoint is called, THE Server SHALL return each mission's template type, description, target value, current progress value, completion status, and coin reward
3. WHEN a puzzle is completed, THE Server SHALL update all applicable mission progress counters atomically within the completion handler
4. THE Server SHALL expose a `POST /api/missions/claim` endpoint that allows a user to claim rewards for completed missions
5. IF a user attempts to claim a mission that is not yet complete, THEN THE Server SHALL return a 400 error with a descriptive message
6. IF a user attempts to claim a mission that has already been claimed, THEN THE Server SHALL return a 400 error indicating the reward was already claimed

### Requirement 4: Achievements and Milestones

**User Story:** As a player, I want to unlock achievements for reaching long-term milestones, so that I feel a sense of permanent progression and accomplishment.

#### Acceptance Criteria

1. THE Achievement_System SHALL define a set of achievements across categories: Solve Count (10, 50, 100, 250, 500 puzzles), Streak (7, 30, 100, 365 days), Speed (10, 50, 100 speed solves), Economy (1000, 5000, 10000 total coins earned), Mastery (reach level 4 on any grid size, reach level 4 on all grid sizes), and Social (share 5 scores, create 5 challenges, have a challenge beaten 10 times)
2. WHEN a user's cumulative stats meet an achievement's threshold, THE Achievement_System SHALL unlock that achievement and store it in Redis under the key `user:{userId}:achievements` as a JSON array of achievement IDs
3. WHEN an achievement is unlocked, THE Achievement_System SHALL award the achievement's coin bonus and return the unlocked achievement data in the API response
4. THE Server SHALL expose a `GET /api/achievements` endpoint that returns all achievements with their unlock status and progress percentage for the current user
5. THE Achievement_System SHALL check for newly unlocked achievements after every puzzle completion, mission claim, and challenge beat event
6. IF an achievement has already been unlocked, THEN THE Achievement_System SHALL not award the coin bonus again

### Requirement 5: Variable Coin Rewards

**User Story:** As a player, I want coin rewards to feel surprising and exciting, so that each puzzle completion has an element of anticipation.

#### Acceptance Criteria

1. WHEN a puzzle is completed, THE Variable_Reward_Engine SHALL roll for a Bonus_Multiplier with a 15% probability of 2× and a 5% probability of 3×, applied to the base coin reward before bonuses are added
2. WHEN a Bonus_Multiplier is applied, THE Coin_Reward_System SHALL include the multiplier value and the boosted base amount in the CoinReward response so the client can display a special animation
3. WHEN a puzzle is completed, THE Variable_Reward_Engine SHALL roll for a Mystery_Box drop with a 10% base probability, increasing by 2% for each consecutive day in the user's current streak (capped at 30% total)
4. WHEN a Mystery_Box is awarded, THE Variable_Reward_Engine SHALL select a reward from a weighted pool: 50% chance of 10–50 bonus coins, 30% chance of a streak freeze, 20% chance of a random cosmetic title the user does not already own
5. THE Variable_Reward_Engine SHALL use a cryptographically seeded random number generator based on the user ID, post ID, and timestamp to ensure unpredictable but reproducible results
6. THE Server SHALL include Mystery_Box reward data in the completion response so the client can display an unboxing animation
7. IF the Mystery_Box awards a cosmetic title and the user already owns all available titles, THEN THE Variable_Reward_Engine SHALL substitute 100 bonus coins instead

### Requirement 6: Community Highlights in Daily Posts

**User Story:** As a player, I want to see top performers recognized in the daily puzzle posts, so that I feel motivated to compete and earn recognition.

#### Acceptance Criteria

1. WHEN the daily puzzle scheduler creates a new post, THE Community_Highlight_System SHALL include a "Yesterday's Stars" section in the sticky comment showing the top performer in each category: longest active streak, fastest solve (per grid size), and most coins earned yesterday
2. THE Community_Highlight_System SHALL fetch the top performer data from existing leaderboard sorted sets in Redis
3. WHEN the first puzzle post of each UTC week is created (Monday), THE Community_Highlight_System SHALL include a "Player of the Week" section highlighting the user with the most total puzzle completions that week
4. THE Community_Highlight_System SHALL store weekly completion counts in Redis under the key `leaderboard:weekly:{isoWeek}` as a sorted set
5. WHEN a puzzle is completed, THE Server SHALL increment the user's weekly completion count in the weekly leaderboard sorted set
6. THE Community_Highlight_System SHALL format usernames with their equipped title emoji for display in highlight comments

### Requirement 7: Flair-Based Progression Tiers

**User Story:** As a player, I want my Reddit flair to reflect my achievement progress, so that other subreddit members can see my status at a glance.

#### Acceptance Criteria

1. THE Flair_Progression_System SHALL define 5 tiers based on the number of achievements unlocked: Bronze (1–3 achievements), Silver (4–7), Gold (8–12), Diamond (13–17), Master (18+)
2. WHEN a user unlocks an achievement that causes a tier change, THE Flair_Progression_System SHALL update the user's subreddit flair to include the tier badge emoji (🥉 Bronze, 🥈 Silver, 🥇 Gold, 💎 Diamond, 👑 Master) alongside their equipped title
3. THE Flair_Progression_System SHALL only update flair for users who have previously opted in to flair updates (tracked via the existing equip-with-flair flow)
4. THE Server SHALL store the user's current Flair_Tier in Redis under the key `user:{userId}:flairTier`
5. WHEN the flair is updated, THE Flair_Progression_System SHALL format the flair as `{tierEmoji} {titleEmoji} {titleLabel}` (e.g., "🥇 ⚡ Speed Demon")

### Requirement 8: Referral Incentives via Challenge Posts

**User Story:** As a player, I want to earn rewards when my challenge posts attract new players, so that I am incentivized to share challenges and grow the community.

#### Acceptance Criteria

1. WHEN a New_Player (totalSolves equals 0) completes a puzzle on a Challenge_Post for the first time, THE Referral_System SHALL award a Referral_Bonus of 25 coins to the challenge creator
2. THE Referral_System SHALL store referral events in Redis under the key `referral:{postId}:{newPlayerId}` to prevent duplicate awards
3. WHEN a Referral_Bonus is awarded, THE Referral_System SHALL increment a referral counter on the challenge creator's economy data under the field `totalReferrals`
4. THE Referral_System SHALL cap the Referral_Bonus at 10 new players per challenge post to prevent abuse
5. IF the new player has already been counted as a referral on the same challenge post, THEN THE Referral_System SHALL not award a duplicate Referral_Bonus
6. THE Server SHALL include the referral count in the challenge post stats so the creator can see how many new players their challenge attracted

### Requirement 9: Streak Milestone Celebrations

**User Story:** As a player, I want special recognition when I hit streak milestones, so that maintaining my streak feels rewarding and worth protecting.

#### Acceptance Criteria

1. WHEN a user's current streak reaches a Streak_Milestone threshold (7, 30, 100, 365 days), THE Achievement_System SHALL unlock the corresponding streak achievement and award a milestone bonus: 50 coins at 7 days, 200 coins at 30 days, 500 coins at 100 days, 1000 coins at 365 days
2. WHEN a Streak_Milestone is reached, THE Server SHALL return a milestone celebration flag and bonus amount in the completion response so the client can display a special celebration overlay
3. THE Achievement_System SHALL check streak milestones after every streak update, not only on puzzle completion
4. IF a user's streak has already passed a milestone threshold (e.g., streak was 35 when the system launches), THEN THE Achievement_System SHALL retroactively unlock all milestones at or below the current streak on the next puzzle completion

### Requirement 10: Investment Score Display

**User Story:** As a player, I want to see how much I have invested in the game, so that I feel a sense of ownership and am motivated to keep playing.

#### Acceptance Criteria

1. THE Server SHALL expose an `GET /api/profile` endpoint that returns the user's Investment_Score and its component breakdown
2. THE Server SHALL calculate the Investment_Score as the sum of: total coins earned, number of titles owned multiplied by 100, number of achievements unlocked multiplied by 50, current streak multiplied by 10, and longest streak multiplied by 5
3. WHEN the profile endpoint is called, THE Server SHALL return the Investment_Score, its component breakdown, the user's Flair_Tier, total referrals, and a list of unlocked Achievement_Badges
4. THE Server SHALL include the user's rank percentile based on Investment_Score compared to all users who have solved at least one puzzle

### Requirement 11: Mission and Achievement Definitions as Constants

**User Story:** As a developer, I want mission templates and achievement definitions to be defined as typed constants, so that adding new missions and achievements requires no code changes to the engine.

#### Acceptance Criteria

1. THE Mission_System SHALL define all mission templates in `src/shared/constants.ts` as a typed readonly array of `MissionTemplate` objects, each containing: id, type, description template, target value, coin reward, and applicable cadence (daily or weekly)
2. THE Achievement_System SHALL define all achievements in `src/shared/constants.ts` as a typed readonly array of `AchievementDef` objects, each containing: id, category, label, emoji, description, threshold value, and coin bonus
3. THE Variable_Reward_Engine SHALL define all Mystery_Box reward weights and Bonus_Multiplier probabilities in `src/shared/constants.ts` as typed readonly objects
4. FOR ALL MissionTemplate objects, serializing to JSON then deserializing SHALL produce an equivalent object (round-trip property)
5. FOR ALL AchievementDef objects, serializing to JSON then deserializing SHALL produce an equivalent object (round-trip property)

### Requirement 12: Engagement Data in Scheduler Posts

**User Story:** As a player browsing r/urjo, I want the daily puzzle posts to contain compelling stats and highlights, so that I am drawn to open the post and play.

#### Acceptance Criteria

1. WHEN the daily puzzle scheduler creates a post, THE Server SHALL include the total number of active players (users who solved at least one puzzle in the last 7 days) in the sticky comment
2. WHEN the daily puzzle scheduler creates a post, THE Server SHALL include the community's collective streak count (sum of all active streaks) in the sticky comment
3. WHEN the daily puzzle scheduler creates a post, THE Server SHALL include a "mission preview" line listing the 3 daily missions for that day in the sticky comment
4. THE Server SHALL store the active player count in Redis under the key `stats:activePlayers:7d` and update it during the scheduler run by counting users with a `streak:lastDate` within the last 7 days
5. IF the active player count query takes longer than 5 seconds, THEN THE Server SHALL use the previously cached value and log a warning

