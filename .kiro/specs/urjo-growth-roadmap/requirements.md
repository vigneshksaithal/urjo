# Requirements Document

## Introduction

The Urjo Growth Roadmap is a 60-day structured plan to grow Urjo — a color-based constraint puzzle game on Reddit (Devvit) — from ~692 DQE (Tier 1) to sustained Tier 2 (1,000+ DQE). The game already has deep engagement systems (missions, achievements, streaks, mystery boxes, leaderboards, coin economy, cosmetic shop, challenge posts, flair progression, referral bonuses, community highlights). The bottleneck is distribution: only 350 subscribers on r/urjo, no mod outreach, and the game is installed on a single subreddit.

This roadmap focuses on four phases:
1. **Distribution Sprint (Days 1–14):** Get Urjo installed on 5–10 external subreddits via mod outreach, optimize the first screen for featuring, and apply for push notification beta.
2. **Retention & Polish (Days 15–30):** Use analytics from new communities to fix drop-off points, add social posting mechanics (shareable result cards), and optimize the completion screen for virality.
3. **Scale (Days 31–45):** Introduce weekly seasons with reset leaderboards, run community events, push for Reddit featuring, and add in-app analytics tracking.
4. **Payout Maximization (Days 46–60):** Stabilize, run daily events, avoid risky changes, and maximize DQE for Developer Fund payouts.

The requirements below cover the technical features to build, the analytics system, the growth/distribution strategy tooling, and the daily operational workflow engine.

## Glossary

- **Analytics_Tracker**: The server-side subsystem that records user interaction events (first action, completion, return visits) in Redis for funnel analysis
- **First_Action_Rate**: The percentage of users who open a post and take at least one cell-color action within the first session
- **Completion_Rate**: The percentage of users who start a puzzle and solve it within the same session
- **D1_Return_Rate**: The percentage of users who solve a puzzle on day N and return to solve at least one puzzle on day N+1
- **Result_Card_Generator**: The client-side module that produces a shareable emoji-grid representation of a completed puzzle (similar to Wordle's share format)
- **Result_Card**: A text-based emoji grid showing the player's solved puzzle pattern, time, streak, and skill level, suitable for pasting into Reddit comments or other platforms
- **First_Screen**: The initial view a user sees when they open an Urjo post from the Reddit feed, before any interaction
- **Feed_Preview**: The static or semi-static representation of an Urjo post as it appears in the Reddit feed before a user taps to expand
- **Mod_Outreach_Toolkit**: A set of documentation, configuration options, and install guides that make it easy for moderators of external subreddits to install and customize Urjo
- **Subreddit_Config**: Per-subreddit settings stored in Redis that allow moderators to customize Urjo's behavior (post frequency, difficulty defaults, branding)
- **Season_System**: A time-bounded competitive period (7 days) with dedicated leaderboards that reset at the end of each season
- **Season**: A single 7-day competitive period with its own leaderboard, starting and ending on UTC Monday 00:00
- **Season_Leaderboard**: A sorted set in Redis tracking player scores within a single season, reset at the start of each new season
- **Daily_Ops_Engine**: The automated daily workflow that posts analytics summaries, suggests actions based on metric thresholds, and tracks roadmap progress
- **Growth_Metric_Dashboard**: A Redis-backed data store that aggregates daily DQE estimates, first-action rates, completion rates, and D1 return rates
- **Kill_Rule**: A predefined metric threshold that, when breached, triggers an alert recommending the developer stop investing in a specific feature or strategy
- **Scale_Rule**: A predefined metric threshold that, when exceeded, triggers an alert recommending the developer double down on a specific feature or strategy
- **DQE**: Daily Qualifying Engagers — Reddit's metric for unique logged-in users who interact with the app each day
- **Scheduler**: The existing cron-based system that creates puzzle posts at 16:00 and 20:00 UTC

## Requirements

### Requirement 1: Shareable Result Cards

**User Story:** As a player, I want to copy a visual emoji-grid of my completed puzzle so that I can share my result in Reddit comments and other platforms, creating organic feed content that attracts new players.

#### Acceptance Criteria

1. WHEN a player completes a puzzle, THE Result_Card_Generator SHALL produce a Result_Card containing: an emoji grid representing the solved puzzle colors (🟥 for red, 🟦 for blue), the grid size, the skill level, the solve time, the mistake count, and the current streak length
2. THE Result_Card_Generator SHALL format the emoji grid as rows of emoji characters matching the puzzle's grid dimensions (4×4, 6×6, or 8×8)
3. WHEN a player taps the "Copy Result" button on the completion screen, THE Result_Card_Generator SHALL copy the Result_Card text to the device clipboard
4. THE Result_Card SHALL include a header line in the format `Urjo #{puzzleNumber} 🧩 {gridSize}×{gridSize} ⭐{skillLevel}` followed by the emoji grid, a stats line `⏱️ {time}s | 🎯 {mistakes} mistakes | 🔥 {streak} streak`, and a footer `Play at r/urjo`
5. WHEN a player taps the "Comment Result" button, THE Server SHALL submit a comment containing the Result_Card text as a reply to the post's sticky comment, using `runAs: 'USER'`
6. IF the player has already commented a result on the current post, THEN THE Server SHALL return a 400 error indicating the result was already shared
7. FOR ALL valid completed puzzle states, generating a Result_Card then parsing the header line SHALL recover the original grid size and skill level (round-trip property)

### Requirement 2: First-Screen Optimization

**User Story:** As a feed-browsing Reddit user, I want to immediately understand what Urjo is and how to play when I see it in my feed, so that I tap to play within 5 seconds of seeing the post.

#### Acceptance Criteria

1. WHEN a user opens an Urjo post for the first time (no prior solve history), THE First_Screen SHALL display: a partially-filled sample puzzle with 2–3 cells pre-colored, a one-line instruction ("Tap cells to color them. Fill the grid so each row and column has equal reds and blues."), and a prominent "Play" call-to-action button
2. THE First_Screen SHALL render the sample puzzle and instruction within 500 milliseconds of the webview loading
3. WHEN the user taps the "Play" call-to-action, THE Client SHALL transition to the actual puzzle with no additional loading screens
4. THE First_Screen SHALL use the smallest grid size (4×4) for the sample puzzle regardless of the user's saved grid size preference
5. WHILE a user has completed at least one puzzle previously, THE First_Screen SHALL skip the sample puzzle and load the user's actual puzzle directly
6. THE First_Screen SHALL display the Urjo logo, the current puzzle number, and the community stats line (active players count, collective streak days) from the cached stats in the sticky comment data

### Requirement 3: In-App Analytics Tracking

**User Story:** As the developer, I want to track key funnel metrics (first-action rate, completion rate, D1 return rate) inside the app so that I can make data-driven decisions about what to optimize each day.

#### Acceptance Criteria

1. WHEN a user opens an Urjo post, THE Analytics_Tracker SHALL record a `post_open` event by incrementing the Redis key `analytics:{date}:post_opens`
2. WHEN a user takes their first cell-color action on a puzzle, THE Analytics_Tracker SHALL record a `first_action` event by incrementing the Redis key `analytics:{date}:first_actions`
3. WHEN a user completes a puzzle, THE Analytics_Tracker SHALL record a `completion` event by incrementing the Redis key `analytics:{date}:completions`
4. THE Analytics_Tracker SHALL compute the First_Action_Rate as `first_actions / post_opens` for a given date
5. THE Analytics_Tracker SHALL compute the Completion_Rate as `completions / first_actions` for a given date
6. THE Analytics_Tracker SHALL compute the D1_Return_Rate by comparing the set of users who completed a puzzle on date D with the set of users who completed a puzzle on date D+1, stored as `analytics:{date}:d1_return_rate`
7. THE Analytics_Tracker SHALL store per-user completion dates in a sorted set `analytics:user:{userId}:completion_dates` with the date string as member and Unix timestamp as score
8. THE Server SHALL expose a `GET /api/analytics/daily` endpoint that returns the last 30 days of daily metrics: post opens, first actions, completions, First_Action_Rate, Completion_Rate, and D1_Return_Rate
9. IF the analytics endpoint is called by a non-moderator user, THEN THE Server SHALL return a 403 error
10. THE Analytics_Tracker SHALL use Redis `INCRBY` operations for counters to ensure atomic increments under concurrent access

### Requirement 4: Mod Outreach Toolkit

**User Story:** As the developer, I want a documentation package and configuration system that makes it trivial for moderators of external subreddits to install and customize Urjo, so that I can pitch the game to puzzle and game communities.

#### Acceptance Criteria

1. WHEN Urjo is installed on a new subreddit, THE Server SHALL create a default Subreddit_Config in Redis under the key `subreddit:{subredditId}:config` with fields: `postFrequency` (default "twice_daily"), `defaultGridSize` (default 4), `brandingEmoji` (default "🧩"), and `welcomeMessage` (default "Welcome to Urjo!")
2. THE Server SHALL expose a `POST /api/admin/config` endpoint that allows moderators to update the Subreddit_Config for their subreddit
3. IF a non-moderator user calls the admin config endpoint, THEN THE Server SHALL return a 403 error
4. WHEN the Scheduler creates a daily puzzle post, THE Scheduler SHALL read the Subreddit_Config for the current subreddit and use the configured `brandingEmoji` in the post title and `defaultGridSize` for the sample puzzle
5. THE Server SHALL expose a `GET /api/admin/config` endpoint that returns the current Subreddit_Config for the subreddit
6. WHEN Urjo is installed on a new subreddit via the `onAppInstall` trigger, THE Server SHALL create the first puzzle post automatically so the subreddit has immediate content

### Requirement 5: Weekly Season System

**User Story:** As a player, I want weekly competitive seasons with fresh leaderboards so that I have a recurring reason to compete and a sense of weekly progression.

#### Acceptance Criteria

1. THE Season_System SHALL define a Season as a 7-day period starting on UTC Monday 00:00 and ending on the following Sunday 23:59:59
2. WHEN a player completes a puzzle during an active Season, THE Season_System SHALL increment the player's score in the Season_Leaderboard stored at Redis key `season:{seasonId}:leaderboard` where `seasonId` is the ISO week identifier
3. THE Season_System SHALL calculate the season score as: base points from puzzle completion (10 per solve) plus bonus points for speed solves (5 extra) plus bonus points for perfect solves (10 extra)
4. THE Server SHALL expose a `GET /api/season/leaderboard` endpoint that returns the top 50 entries of the current Season_Leaderboard with the player's own rank
5. WHEN a new Season begins (Monday 00:00 UTC), THE Scheduler SHALL post a "Season Recap" comment on the first puzzle post of the week summarizing the previous season's top 3 players and total participants
6. THE Server SHALL expose a `GET /api/season/current` endpoint that returns the current season's start date, end date, season number, and the player's current score and rank
7. WHEN the Season Recap is generated, THE Season_System SHALL award bonus coins to the top 3 players: 500 coins for 1st place, 250 coins for 2nd place, 100 coins for 3rd place
8. THE Season_System SHALL store season history in Redis under the key `season:{seasonId}:results` as a JSON object containing the top 10 players and total participant count

### Requirement 6: Growth Metric Dashboard

**User Story:** As the developer, I want an automated daily analytics summary that tells me exactly which metrics are healthy and which need attention, so that I can spend my 4 hours/day on the highest-impact work.

#### Acceptance Criteria

1. WHEN the daily puzzle Scheduler runs at 16:00 UTC, THE Daily_Ops_Engine SHALL compute and store the previous day's metrics in Redis under the key `dashboard:{date}` as a JSON object containing: estimated DQE (unique users who completed at least one puzzle), post opens, first actions, completions, First_Action_Rate, Completion_Rate, D1_Return_Rate, new subscribers (if trackable), and active season participant count
2. THE Daily_Ops_Engine SHALL compute a 7-day rolling average for DQE, First_Action_Rate, Completion_Rate, and D1_Return_Rate and store them alongside the daily values
3. THE Daily_Ops_Engine SHALL evaluate Kill_Rules against the daily metrics and include alerts in the dashboard: IF the 7-day average First_Action_Rate falls below 50%, THEN flag "KILL: Users not understanding first screen" ; IF the 7-day average Completion_Rate falls below 30%, THEN flag "KILL: Puzzle too hard or UX broken" ; IF the 7-day average D1_Return_Rate falls below 15%, THEN flag "KILL: No return habit forming"
4. THE Daily_Ops_Engine SHALL evaluate Scale_Rules against the daily metrics and include alerts in the dashboard: IF the 7-day average D1_Return_Rate exceeds 40%, THEN flag "SCALE: Strong return habit — add more streak/reset mechanics" ; IF the daily result-card comments exceed 10, THEN flag "SCALE: Users sharing organically — prioritize share card polish" ; IF the 7-day average DQE exceeds 1000, THEN flag "SCALE: Tier 2 reached — focus on stability"
5. THE Server SHALL expose a `GET /api/analytics/dashboard` endpoint that returns the last 14 days of dashboard data including all metrics, rolling averages, and active alerts
6. IF the dashboard endpoint is called by a non-moderator user, THEN THE Server SHALL return a 403 error
7. THE Daily_Ops_Engine SHALL include a "Suggested Actions" list in the dashboard based on the current roadmap phase (derived from the app install date): Phase 1 actions focus on outreach and first-screen polish, Phase 2 actions focus on retention fixes, Phase 3 actions focus on scaling, Phase 4 actions focus on stability

### Requirement 7: Daily Operational Workflow Automation

**User Story:** As the developer, I want the daily puzzle post's sticky comment to include a developer-facing analytics summary so that I can check yesterday's performance without leaving Reddit.

#### Acceptance Criteria

1. WHEN the Scheduler creates the 16:00 UTC puzzle post, THE Daily_Ops_Engine SHALL append a developer analytics section to the sticky comment (visible only as a collapsed reply to the sticky) containing: yesterday's estimated DQE, 7-day DQE average, First_Action_Rate, Completion_Rate, D1_Return_Rate, and any active Kill_Rule or Scale_Rule alerts
2. THE Daily_Ops_Engine SHALL format the analytics section as a Reddit markdown table for readability
3. WHEN the analytics section includes a Kill_Rule alert, THE Daily_Ops_Engine SHALL prefix the alert with "🚨" and include the specific metric value that triggered it
4. WHEN the analytics section includes a Scale_Rule alert, THE Daily_Ops_Engine SHALL prefix the alert with "🚀" and include the specific metric value that triggered it
5. THE Daily_Ops_Engine SHALL include the current roadmap phase number and day count (calculated from the app install date or a configured start date stored in Redis under `roadmap:startDate`)

### Requirement 8: Completion Screen Virality Optimization

**User Story:** As a player who just solved a puzzle, I want the completion screen to make sharing and returning feel effortless, so that I naturally create content and come back tomorrow.

#### Acceptance Criteria

1. WHEN a puzzle is completed, THE Client SHALL display the completion screen with actions ordered by viral impact: "Copy Result" button (most prominent), "Comment Score" button, "Challenge a Friend" button, "Next Puzzle" button, and "Join r/urjo" button (for non-subscribers)
2. THE Client SHALL display the Result_Card preview (emoji grid) directly on the completion screen so the player sees what they would share before tapping "Copy Result"
3. WHEN the player taps "Copy Result", THE Client SHALL show a brief "Copied!" confirmation toast and increment a Redis counter `analytics:{date}:result_copies` for tracking
4. THE Client SHALL display a "Tomorrow's streak bonus" preview showing the coins the player would earn if they return tomorrow, calculated as the current streak bonus plus one day
5. WHILE the player has not subscribed to the current subreddit, THE Client SHALL display the "Join r/urjo" button with the text "🔔 Get daily puzzles in your feed"
6. THE Client SHALL display the player's season rank and points on the completion screen when a Season is active

### Requirement 9: Cross-Subreddit Installation Tracking

**User Story:** As the developer, I want to track which subreddits have Urjo installed and how each community performs, so that I can identify which types of communities drive the most engagement.

#### Acceptance Criteria

1. WHEN Urjo is installed on a new subreddit via the `onAppInstall` trigger, THE Server SHALL record the installation in Redis by adding the subreddit ID to a sorted set `installations:all` with the install timestamp as the score, and storing metadata in a hash `installation:{subredditId}` with fields: `subredditName`, `installedAt`, `installedBy` (moderator user ID)
2. THE Server SHALL expose a `GET /api/admin/installations` endpoint that returns all installations with their metadata and per-subreddit DQE estimates for the last 7 days
3. IF a non-moderator user calls the installations endpoint, THEN THE Server SHALL return a 403 error
4. WHEN the daily Scheduler runs, THE Daily_Ops_Engine SHALL compute per-subreddit metrics by reading the `analytics:{date}:completions:subreddit:{subredditId}` counters and store them in the dashboard
5. THE Analytics_Tracker SHALL tag all analytics events with the current `context.subredditId` so that metrics can be broken down by subreddit
6. THE Server SHALL store a per-subreddit completion counter at `analytics:{date}:completions:subreddit:{subredditId}` incremented on each puzzle completion

### Requirement 10: Roadmap Phase Configuration

**User Story:** As the developer, I want the system to know which roadmap phase I'm in so that suggested actions, alerts, and priorities automatically adjust as the 60-day plan progresses.

#### Acceptance Criteria

1. THE Server SHALL store the roadmap start date in Redis under the key `roadmap:startDate` as an ISO date string, set during the first admin configuration or defaulting to the app install date
2. THE Daily_Ops_Engine SHALL compute the current roadmap day as the number of days elapsed since `roadmap:startDate` and the current phase as: Phase 1 (days 1–14), Phase 2 (days 15–30), Phase 3 (days 31–45), Phase 4 (days 46–60)
3. WHEN the current roadmap day exceeds 60, THE Daily_Ops_Engine SHALL report Phase 4 and include a "Roadmap Complete" flag in the dashboard
4. THE Server SHALL expose a `POST /api/admin/roadmap` endpoint that allows a moderator to set or reset the `roadmap:startDate`
5. IF a non-moderator user calls the roadmap endpoint, THEN THE Server SHALL return a 403 error
6. THE Daily_Ops_Engine SHALL include phase-specific suggested actions in the dashboard: Phase 1 suggests "Pitch to 2 subreddit mods today", "Polish first-screen copy", "Check install conversion"; Phase 2 suggests "Review completion rate drop-offs", "A/B test result card format", "Add social posting prompts"; Phase 3 suggests "Launch weekly event", "Push for Reddit featuring", "Review season engagement"; Phase 4 suggests "No new features", "Monitor stability", "Optimize existing flows"

### Requirement 11: Result Card Serialization and Parsing

**User Story:** As a developer, I want the Result_Card format to be well-defined and round-trippable so that result cards can be reliably generated, parsed, and validated.

#### Acceptance Criteria

1. THE Result_Card_Generator SHALL serialize a completed puzzle into a Result_Card string following a strict format: line 1 is the header `Urjo #{puzzleNumber} 🧩 {gridSize}×{gridSize} ⭐{skillLevel}`, lines 2 through N+1 are the emoji grid rows (🟥 for red, 🟦 for blue), line N+2 is the stats `⏱️ {time}s | 🎯 {mistakes} mistakes | 🔥 {streak} streak`, and line N+3 is the footer `Play at r/urjo`
2. THE Result_Card_Generator SHALL define a `ResultCardData` type containing: `puzzleNumber` (number), `gridSize` (4 | 6 | 8), `skillLevel` (1–9), `colorGrid` (2D array of 'red' | 'blue'), `timeTaken` (number), `mistakes` (number), `streak` (number)
3. THE Result_Card_Generator SHALL expose a `serializeResultCard(data: ResultCardData): string` function and a `parseResultCard(text: string): ResultCardData | null` function
4. FOR ALL valid `ResultCardData` objects, `parseResultCard(serializeResultCard(data))` SHALL produce an object equivalent to the original input (round-trip property)
5. WHEN `parseResultCard` receives a string that does not match the expected format, THE Result_Card_Generator SHALL return `null`
6. THE Result_Card_Generator SHALL be implemented as a pure function in `src/shared/` with no server or client dependencies

### Requirement 12: Analytics Event Deduplication

**User Story:** As the developer, I want analytics events to be deduplicated per user per session so that metrics accurately reflect unique user actions rather than repeated taps.

#### Acceptance Criteria

1. THE Analytics_Tracker SHALL deduplicate `post_open` events by storing a flag at `analytics:seen:{date}:{postId}:{userId}` with a 24-hour expiration, and only incrementing the counter if the flag does not already exist
2. THE Analytics_Tracker SHALL deduplicate `first_action` events by storing a flag at `analytics:acted:{date}:{postId}:{userId}` with a 24-hour expiration, and only incrementing the counter if the flag does not already exist
3. THE Analytics_Tracker SHALL deduplicate `completion` events per post by storing a flag at `analytics:completed:{postId}:{userId}` with a 48-hour expiration, and only incrementing the daily counter if the flag does not already exist
4. THE Analytics_Tracker SHALL use Redis `SET` with `NX` (set-if-not-exists) semantics for deduplication flags to ensure atomicity under concurrent requests
5. IF a deduplication flag already exists for a given event, THEN THE Analytics_Tracker SHALL skip the counter increment and proceed without error

### Requirement 13: Moderator Authentication Guard

**User Story:** As the developer, I want all admin/analytics endpoints to be protected by moderator authentication so that sensitive data is only accessible to authorized users.

#### Acceptance Criteria

1. THE Server SHALL implement a `requireModerator` middleware function that checks whether the current user is a moderator of the current subreddit
2. WHEN a request is made to any `/api/admin/*` or `/api/analytics/*` endpoint, THE Server SHALL invoke the `requireModerator` middleware before processing the request
3. IF the current user is not a moderator, THEN THE Server SHALL return a 403 error with the message "Moderator access required"
4. IF the current user is not logged in (no `context.userId`), THEN THE Server SHALL return a 401 error with the message "Authentication required"
5. THE `requireModerator` middleware SHALL cache the moderator check result in Redis under `mod:{subredditId}:{userId}` with a 5-minute expiration to avoid repeated Reddit API calls
6. THE Server SHALL use the Reddit API `getModerators()` or equivalent to verify moderator status

### Requirement 14: Engagement Metric Constants and Thresholds

**User Story:** As a developer, I want all growth metric thresholds, kill rules, and scale rules defined as typed constants so that adjusting thresholds requires no code changes to the dashboard engine.

#### Acceptance Criteria

1. THE Server SHALL define all Kill_Rule thresholds in `src/shared/constants.ts` as a typed readonly array of `KillRule` objects, each containing: `id` (string), `metric` (string), `threshold` (number), `comparison` ('below' | 'above'), `message` (string)
2. THE Server SHALL define all Scale_Rule thresholds in `src/shared/constants.ts` as a typed readonly array of `ScaleRule` objects, each containing: `id` (string), `metric` (string), `threshold` (number), `comparison` ('below' | 'above'), `message` (string)
3. THE Server SHALL define roadmap phase boundaries in `src/shared/constants.ts` as a typed readonly array of `RoadmapPhase` objects, each containing: `phase` (number), `startDay` (number), `endDay` (number), `label` (string), `suggestedActions` (readonly string[])
4. THE Server SHALL define season scoring constants in `src/shared/constants.ts`: `SEASON_BASE_POINTS` (10), `SEASON_SPEED_BONUS` (5), `SEASON_PERFECT_BONUS` (10), `SEASON_TOP_REWARDS` (readonly array of `{ rank: number, coins: number }`)
5. FOR ALL `KillRule` objects, serializing to JSON then deserializing SHALL produce an equivalent object (round-trip property)
6. FOR ALL `ScaleRule` objects, serializing to JSON then deserializing SHALL produce an equivalent object (round-trip property)
7. FOR ALL `RoadmapPhase` objects, serializing to JSON then deserializing SHALL produce an equivalent object (round-trip property)
