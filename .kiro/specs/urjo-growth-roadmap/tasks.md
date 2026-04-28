# Implementation Plan: Urjo Growth Roadmap

## Overview

Add distribution, analytics, virality, and competitive features to the Urjo puzzle game to grow from ~692 DQE to sustained Tier 2 (1,000+ DQE). The implementation builds on the existing Hono API routes, Redis data layer, economy system, and scheduler infrastructure. New modules follow the established pattern: types → constants → pure logic → Redis persistence → API routes → client components. All new business logic lives in pure, testable modules under `src/server/lib/`. Shared types and constants live in `src/shared/`. Client components use Svelte 5.

## Tasks

- [x] 1. Add shared growth types and constants
  - [x] 1.1 Create `src/shared/growth-types.ts` with all growth-related type definitions
    - Add `ResultCardData` type for result card serialization
    - Add `DailyMetrics`, `RollingMetrics` types for analytics
    - Add `Alert`, `CurrentPhase`, `DashboardData` types for dashboard
    - Add `SeasonInfo`, `SeasonLeaderboardEntry`, `SeasonLeaderboardResponse`, `SeasonRecap` types for seasons
    - Add `PostFrequency`, `SubredditConfig`, `InstallationInfo` types for mod config
    - Add `KillRule`, `ScaleRule`, `RoadmapPhase`, `SeasonTopReward` types for constants
    - _Requirements: 1.1, 3.4, 3.5, 5.1, 5.4, 6.1, 6.3, 6.4, 9.1, 10.2, 11.2, 14.1, 14.2, 14.3, 14.4_

  - [x] 1.2 Create `src/shared/growth-constants.ts` with kill rules, scale rules, roadmap phases, and season scoring constants
    - Add `SEASON_BASE_POINTS` (10), `SEASON_SPEED_BONUS` (5), `SEASON_PERFECT_BONUS` (10)
    - Add `SEASON_TOP_REWARDS` readonly array: `[{ rank: 1, coins: 500 }, { rank: 2, coins: 250 }, { rank: 3, coins: 100 }]`
    - Add `KILL_RULES` readonly array with 3 rules: first_action_rate < 50%, completion_rate < 30%, d1_return_rate < 15%
    - Add `SCALE_RULES` readonly array with 3 rules: d1_return > 40%, result_copies > 10, dqe > 1000
    - Add `ROADMAP_PHASES` readonly array with 4 phases: Distribution Sprint (1–14), Retention & Polish (15–30), Scale (31–45), Payout Maximization (46–60) with suggested actions per phase
    - _Requirements: 5.3, 5.7, 6.2, 6.3, 6.4, 10.2, 10.6, 14.1, 14.2, 14.3, 14.4_

  - [x] 1.3 Write property test for growth constants JSON round-trip (Property 10)
    - **Property 10: Growth Constants JSON Round-Trip**
    - For all `KillRule`, `ScaleRule`, and `RoadmapPhase` objects, `JSON.parse(JSON.stringify(obj))` produces a deeply equal object
    - **Validates: Requirements 14.5, 14.6, 14.7**

- [x] 2. Implement result card module
  - [x] 2.1 Create `src/shared/result-card.ts` with pure serialization and parsing functions
    - Implement `serializeResultCard(data: ResultCardData): string` — produces the emoji-grid text format with header, grid rows, stats line, and footer
    - Implement `parseResultCard(text: string): ResultCardData | null` — parses the text format back into structured data, returns null for invalid input
    - Define `ResultCardData` type with `puzzleNumber`, `gridSize` (4|6|8), `skillLevel` (1–9), `colorGrid` (2D array of 'red'|'blue'), `timeTaken`, `mistakes`, `streak`
    - Format: header `Urjo #{puzzleNumber} 🧩 {gridSize}×{gridSize} ⭐{skillLevel}`, emoji grid rows (🟥/🟦), stats line, footer `Play at r/urjo`
    - _Requirements: 1.1, 1.2, 1.4, 11.1, 11.2, 11.3, 11.6_

  - [x] 2.2 Write property test for result card round-trip (Property 1)
    - **Property 1: Result Card Round-Trip**
    - For any valid `ResultCardData` object, `parseResultCard(serializeResultCard(data))` produces an object deeply equal to the original input
    - **Validates: Requirements 1.7, 11.4**

  - [x] 2.3 Write property test for invalid result card strings (Property 2)
    - **Property 2: Invalid Result Card Strings Return Null**
    - For any string that does not conform to the result card format, `parseResultCard(text)` returns `null`
    - **Validates: Requirements 11.5**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement analytics tracker module
  - [x] 4.1 Create `src/server/lib/analytics.ts` with event tracking and deduplication
    - Implement `trackPostOpen(date, postId, userId, subredditId): Promise<boolean>` — SET NX dedup at `analytics:seen:{date}:{postId}:{userId}` with 24h TTL, increment `analytics:{date}:post_opens` and per-subreddit counter
    - Implement `trackFirstAction(date, postId, userId, subredditId): Promise<boolean>` — SET NX dedup at `analytics:acted:{date}:{postId}:{userId}` with 24h TTL, increment `analytics:{date}:first_actions`
    - Implement `trackCompletion(date, postId, userId, subredditId): Promise<boolean>` — SET NX dedup at `analytics:completed:{postId}:{userId}` with 48h TTL, increment `analytics:{date}:completions` and per-subreddit counter, add to user completion dates sorted set
    - Implement `trackResultCopy(date): Promise<void>` — increment `analytics:{date}:result_copies` (not deduplicated)
    - Implement `getDailyMetrics(date): Promise<DailyMetrics>` — read all counters, compute first_action_rate and completion_rate
    - Implement `computeD1ReturnRate(date): Promise<number>` — compare completion date sets for day D and D+1
    - Use Redis `INCRBY` for atomic counter increments
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.10, 9.5, 9.6, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 4.2 Write property test for D1 return rate computation (Property 3)
    - **Property 3: D1 Return Rate Computation**
    - For any two sets of user IDs (day D and day D+1), the D1 return rate equals |intersection| / |day D set|, and is 0 when day D set is empty
    - **Validates: Requirements 3.6**

  - [x] 4.3 Write unit tests for analytics deduplication
    - Test `trackPostOpen` increments counter on first call, skips on duplicate
    - Test `trackFirstAction` dedup with same user/post/day
    - Test `trackCompletion` dedup per user per post
    - Test `getDailyMetrics` computes correct rates
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 5. Implement season system module
  - [x] 5.1 Create `src/server/lib/seasons.ts` with pure season logic and Redis persistence
    - Implement `calculateSeasonScore(timeTaken, parTime, mistakes): number` — pure function: `SEASON_BASE_POINTS` + `SEASON_SPEED_BONUS` if timeTaken <= parTime + `SEASON_PERFECT_BONUS` if mistakes === 0
    - Implement `getCurrentSeason(): SeasonInfo` — pure function computing current season from UTC date (Monday 00:00 to Sunday 23:59:59)
    - Implement `recordSeasonScore(seasonId, userId, score): Promise<void>` — ZINCRBY on `season:{seasonId}:leaderboard`
    - Implement `getSeasonLeaderboard(seasonId, userId, limit): Promise<SeasonLeaderboardResponse>` — top N entries + player rank
    - Implement `getSeasonRecap(seasonId): Promise<SeasonRecap>` — top 10 players + total participants
    - Implement `awardSeasonRewards(seasonId): Promise<void>` — award coins to top 3 per `SEASON_TOP_REWARDS`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 5.2 Write property test for season boundary computation (Property 4)
    - **Property 4: Season Boundary Computation**
    - For any date, the computed season start is a Monday 00:00 UTC, end is Sunday 23:59:59 UTC, span is exactly 7 days minus 1 second, and the input date falls within [start, end]
    - **Validates: Requirements 5.1**

  - [x] 5.3 Write property test for season score calculation (Property 5)
    - **Property 5: Season Score Calculation**
    - For any (timeTaken > 0, parTime > 0, mistakes >= 0), score is always in [SEASON_BASE_POINTS, SEASON_BASE_POINTS + SEASON_SPEED_BONUS + SEASON_PERFECT_BONUS], speed bonus iff timeTaken <= parTime, perfect bonus iff mistakes === 0
    - **Validates: Requirements 5.3**

- [x] 6. Implement dashboard engine module
  - [x] 6.1 Create `src/server/lib/dashboard.ts` with pure rule evaluation and dashboard computation
    - Implement `evaluateKillRules(metrics: RollingMetrics, rules: readonly KillRule[]): Alert[]` — pure function, returns alerts for metrics below/above thresholds
    - Implement `evaluateScaleRules(metrics: RollingMetrics, rules: readonly ScaleRule[]): Alert[]` — pure function, same pattern
    - Implement `computeRoadmapPhase(startDate, currentDate, phases: readonly RoadmapPhase[]): CurrentPhase` — pure function, computes day number and matching phase, Phase 4 + isComplete when day > 60
    - Implement `computeRollingAverage(values: number[]): number` — pure function, 7-day rolling average or mean of all if < 7
    - Implement `getSuggestedActions(phase: RoadmapPhase): readonly string[]` — pure function
    - Implement `formatDashboardMarkdown(data: DashboardData): string` — pure function, formats as Reddit markdown table with 🚨 kill alerts and 🚀 scale alerts
    - Implement `computeDashboard(date): Promise<DashboardData>` — aggregates metrics, evaluates rules, stores in Redis
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 10.2, 10.3_

  - [x] 6.2 Write property test for rolling average computation (Property 6)
    - **Property 6: Rolling Average Computation**
    - For any array of 7+ values, the 7-day rolling average equals the mean of the last 7; for < 7 values, equals the mean of all
    - **Validates: Requirements 6.2**

  - [x] 6.3 Write property test for kill and scale rule evaluation (Property 7)
    - **Property 7: Kill and Scale Rule Evaluation**
    - For any metrics and rule, an alert is produced iff the metric is below threshold (for 'below' comparison) or above threshold (for 'above' comparison); alert contains rule id, message, metric value, and threshold
    - **Validates: Requirements 6.3, 6.4**

  - [x] 6.4 Write property test for dashboard markdown formatting (Property 8)
    - **Property 8: Dashboard Markdown Formatting**
    - For any valid `DashboardData`, the formatted markdown contains metric values, kill alerts prefixed with "🚨", scale alerts prefixed with "🚀", and roadmap phase number and day count
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5**

  - [x] 6.5 Write property test for roadmap phase computation (Property 9)
    - **Property 9: Roadmap Phase Computation**
    - For any (startDate, currentDate) where current >= start, day number = days elapsed + 1, phase matches the range containing day number, day > 60 → Phase 4 with isComplete = true
    - **Validates: Requirements 10.2, 10.3**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement moderator auth and subreddit config modules
  - [x] 8.1 Create `src/server/lib/moderator.ts` with Hono middleware and cached moderator check
    - Implement `requireModerator(): MiddlewareHandler` — Hono middleware that returns 401 if no userId, 403 if not a moderator
    - Implement `isModeratorCached(subredditId, userId): Promise<boolean>` — checks Redis cache at `mod:{subredditId}:{userId}` (5-min TTL), falls back to Reddit API `getModerators()`
    - Cache moderator check result in Redis with 5-minute expiration
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 8.2 Create `src/server/lib/subreddit-config.ts` with per-subreddit config CRUD
    - Implement `getSubredditConfig(subredditId): Promise<SubredditConfig>` — reads from Redis hash `subreddit:{subredditId}:config`, creates defaults if none exists (postFrequency: "twice_daily", defaultGridSize: 4, brandingEmoji: "🧩", welcomeMessage: "Welcome to Urjo!")
    - Implement `updateSubredditConfig(subredditId, updates): Promise<SubredditConfig>` — partial update of config fields
    - Implement `recordInstallation(subredditId, subredditName, installedBy): Promise<void>` — adds to `installations:all` sorted set and stores metadata hash
    - _Requirements: 4.1, 4.2, 4.5, 9.1_

  - [x] 8.3 Write unit tests for moderator middleware and subreddit config
    - Test `requireModerator` returns 401 when no userId, 403 when non-moderator, passes through for moderator
    - Test moderator cache: cached result avoids Reddit API call, expired cache triggers fresh check
    - Test `getSubredditConfig` creates defaults for new subreddit, returns existing config
    - Test `updateSubredditConfig` merges partial updates
    - Test `recordInstallation` stores metadata and adds to sorted set
    - _Requirements: 4.1, 9.1, 13.1, 13.3, 13.4, 13.5_

- [x] 9. Create analytics and admin API routes
  - [x] 9.1 Create `src/server/routes/analytics.ts` with mod-protected analytics endpoints
    - Implement `GET /api/analytics/daily` — returns last 30 days of daily metrics (mod-only via `requireModerator`)
    - Implement `GET /api/analytics/dashboard` — returns last 14 days of dashboard data with alerts, rolling averages, and suggested actions (mod-only)
    - _Requirements: 3.8, 3.9, 6.5, 6.6_

  - [x] 9.2 Create `src/server/routes/admin.ts` with mod-protected admin endpoints
    - Implement `GET /api/admin/config` — returns current subreddit config (mod-only)
    - Implement `POST /api/admin/config` — updates subreddit config fields (mod-only)
    - Implement `POST /api/admin/roadmap` — sets or resets `roadmap:startDate` (mod-only)
    - Implement `GET /api/admin/installations` — returns all installations with per-subreddit DQE estimates (mod-only)
    - _Requirements: 4.2, 4.3, 4.5, 9.2, 9.3, 10.4, 10.5_

  - [x] 9.3 Create `src/server/routes/season.ts` with season endpoints
    - Implement `GET /api/season/current` — returns current season info, player score, and rank
    - Implement `GET /api/season/leaderboard` — returns top 50 entries with player's own rank
    - _Requirements: 5.4, 5.6_

  - [x] 9.4 Register new routers in `src/server/index.ts`
    - Import and mount `analyticsRouter`, `adminRouter`, `seasonRouter` alongside existing routers
    - _Requirements: 3.8, 4.2, 5.4_

  - [x] 9.5 Write integration tests for analytics, admin, and season routes
    - Test `GET /api/analytics/daily` returns 403 for non-moderator, returns metrics for moderator
    - Test `GET /api/analytics/dashboard` returns dashboard data with alerts
    - Test `POST /api/admin/config` updates config, returns 403 for non-mod
    - Test `GET /api/admin/installations` returns installation list
    - Test `GET /api/season/current` returns season info with player data
    - Test `GET /api/season/leaderboard` returns top 50 entries
    - _Requirements: 3.9, 4.3, 5.4, 5.6, 6.6, 9.3, 10.5_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Integrate analytics tracking into game flow
  - [x] 11.1 Extend `GET /api/game/state` in `src/server/routes/game.ts` for analytics and first-screen
    - Call `analytics.trackPostOpen()` when game state is loaded
    - Return first-screen data (sample puzzle, instruction, community stats) for new users with no prior solve history
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 3.1_

  - [x] 11.2 Add first-action tracking to game flow
    - Call `analytics.trackFirstAction()` on the first cell-color action per session (via a new `POST /api/game/first-action` endpoint or by extending the completion handler)
    - _Requirements: 3.2_

  - [x] 11.3 Extend `POST /api/game/complete` in `src/server/routes/game.ts` for analytics and seasons
    - Call `analytics.trackCompletion()` after successful completion
    - Calculate and record season score via `seasons.recordSeasonScore()`
    - Return season rank and points in the completion response
    - _Requirements: 3.3, 5.2, 5.3, 8.6, 9.5_

  - [x] 11.4 Add result card comment endpoint
    - Implement `POST /api/game/result-comment` — generates result card text, posts as comment reply to sticky using `runAs: 'USER'`, dedup via `user:{userId}:resultCommented:{postId}` flag
    - Return 400 if already commented on this post
    - _Requirements: 1.3, 1.5, 1.6_

  - [x] 11.5 Write integration tests for analytics integration and result card comment
    - Test `GET /api/game/state` increments post_open counter (deduplicated)
    - Test `POST /api/game/complete` increments completion counter and records season score
    - Test `POST /api/game/result-comment` succeeds first time, returns 400 on duplicate
    - _Requirements: 1.6, 3.1, 3.3, 5.2_

- [x] 12. Extend scheduler with dashboard, season recap, and analytics summary
  - [x] 12.1 Extend daily puzzle scheduler in `src/server/index.ts`
    - Compute and store previous day's dashboard via `dashboard.computeDashboard()`
    - Read subreddit config for branding emoji and default grid size in post title
    - On Mondays: generate season recap comment, award season rewards to top 3
    - Append developer analytics section as collapsed reply to sticky comment (markdown table with DQE, rates, alerts, roadmap phase)
    - Store `roadmap:startDate` on first run if not already set
    - _Requirements: 4.4, 4.6, 5.5, 5.7, 6.1, 7.1, 7.2, 7.3, 7.4, 7.5, 10.1_

  - [x] 12.2 Write unit tests for scheduler extensions
    - Test dashboard computation is triggered during scheduler run
    - Test Monday posts include season recap comment
    - Test developer analytics section contains markdown table with metrics
    - Test subreddit config branding emoji appears in post title
    - _Requirements: 4.4, 5.5, 7.1, 7.2_

- [x] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement client-side growth UI components
  - [x] 14.1 Create `src/client/components/ResultCard.svelte` component
    - Render emoji grid preview of the completed puzzle using `serializeResultCard()`
    - "Copy Result" button that calls `navigator.clipboard.writeText()` and shows "Copied!" toast
    - "Comment Result" button that POSTs to `/api/game/result-comment`
    - Fallback text area when clipboard API is unavailable
    - Track result copies via `POST /api/analytics/track-copy` or inline fetch
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.2, 8.3_

  - [x] 14.2 Create `src/client/components/FirstScreen.svelte` component
    - Display 4×4 sample puzzle with 2–3 pre-colored cells
    - One-line instruction: "Tap cells to color them. Fill the grid so each row and column has equal reds and blues."
    - Urjo logo, puzzle number, community stats line (active players, collective streak days)
    - Prominent "Play" CTA button that transitions to actual puzzle with no loading screen
    - Render within 500ms of webview loading
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

  - [x] 14.3 Create `src/client/components/SeasonLeaderboard.svelte` component
    - Modal showing top 50 players for current season with user's rank
    - Season end countdown timer
    - Reuse existing modal pattern from `LeaderboardModal.svelte`
    - Fetch data from `GET /api/season/leaderboard` and `GET /api/season/current`
    - _Requirements: 5.4, 5.6_

  - [x] 14.4 Update `src/client/views/GameView.svelte` completion screen for virality
    - Reorder completion actions by viral impact: "Copy Result" (most prominent), "Comment Score", "Challenge a Friend", "Next Puzzle", "Join r/urjo" (for non-subscribers)
    - Add `ResultCard.svelte` preview directly on completion screen
    - Display "Tomorrow's streak bonus" preview (current streak bonus + 1 day)
    - Display season rank and points when a season is active
    - Add season leaderboard button to engagement navigation row
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 14.5 Update `src/client/App.svelte` for first-screen routing and result card data
    - Route to `FirstScreen.svelte` when user has no prior solve history (tutorialCompleted but totalSolves === 0)
    - Pass result card data (puzzleColors, gridSize, skillLevel, puzzleNumber, streak, timeTaken, mistakes) to completion screen
    - Handle first-screen "Play" CTA transition to actual puzzle
    - _Requirements: 2.1, 2.3, 2.5, 8.2_

  - [x] 14.6 Extend `POST /api/game/state` response with first-screen and season data
    - Add `isFirstTimeUser` flag, `puzzleNumber`, `communityStats` (active players, collective streaks) to `GameState`
    - Add `currentSeason` info to game state response
    - _Requirements: 2.1, 2.6, 5.6_

- [x] 15. Extend onAppInstall trigger for cross-subreddit setup
  - [x] 15.1 Update `src/server/index.ts` onAppInstall handler
    - Create default subreddit config via `subreddit-config.createSubredditConfig()`
    - Record installation via `subreddit-config.recordInstallation()`
    - Create first puzzle post automatically for immediate content
    - Set `roadmap:startDate` if not already set
    - _Requirements: 4.1, 4.6, 9.1, 10.1_

  - [x] 15.2 Write integration tests for onAppInstall handler
    - Test new subreddit gets default config created
    - Test installation is recorded in sorted set and metadata hash
    - Test first puzzle post is created automatically
    - _Requirements: 4.1, 4.6, 9.1_

- [x] 16. Final checkpoint - Ensure all tests pass
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
- Result card serialization is a pure shared module with no server or client dependencies
- Analytics tracking is non-blocking — failures don't prevent core game flow
- Season scoring and dashboard computation follow the same pure-function-at-core pattern as the existing engagement system
- Moderator auth middleware is reusable across all admin and analytics endpoints
