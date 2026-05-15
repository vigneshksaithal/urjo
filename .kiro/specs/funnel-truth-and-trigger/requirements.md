# Requirements Document

## Introduction

The Funnel Truth and Trigger spec is a one-week corrective bundling three parallel workstreams that respond to a triple-KILL alert on the Urjo growth dashboard. On the day this spec was authored, the dashboard simultaneously fired:

- KILL: First Action Rate 0.0% vs 50% threshold
- KILL: Completion Rate 0.0% vs 30% threshold
- KILL: No D1 return habit forming (0.0% vs 15%)

Daily counters showed roughly 9,000 post opens and 1,200 completions, but `analytics:{date}:first_actions` was zero on every date. That state is logically impossible — every completion requires at least one cell-color action — so at least two of the three KILL alerts are false positives caused by an instrumentation gap. The confirmed root cause is that `src/client/App.svelte#handleCellChange` mutates the grid client-side but never POSTs to the existing `/api/game/first-action` endpoint, so the server-side `trackFirstAction` infrastructure is never invoked.

This spec restores funnel truth, removes onboarding friction that may be suppressing real first actions, and adds a daily return trigger that compensates for Reddit's lack of push notifications. The three workstreams are coupled by a shared two-week success criterion: Friday's dashboard must show non-zero, non-DQ values for First Action Rate, Completion Rate, and D1 Return, and First Action Rate must be within sanity invariant of Completion Rate (every completer must have first-acted).

The three workstreams are:

1. **Instrumentation Truth** — wire the missing first-action POST, add a Data Quality (DQ) flag that neutralizes false positives when historical counters are unrecoverable, and suppress kill-rule evaluation on `null`-valued metrics so the dashboard does not show false KILL alerts.
2. **Diegetic Onboarding** — remove the mandatory FirstScreen and Tutorial gates from new-user first-load, replace them with two inline hints surfaced on demand inside the live puzzle, and keep the scripted tutorial reachable from the existing Help icon as opt-in.
3. **Tomorrow-Trigger** — let users opt in to a daily mention notification, then have the daily-puzzle scheduler post one mention comment per opted-in completer per day on today's puzzle post. Reorder the completion screen to the four primary CTAs that drive virality and return.

The North Star moving forward is weekly DQE on a 7-day rolling average (Reddit Developer Fund metric). Today is approximately 692; the Tier 2 target is 1000+.

## Glossary

- **DQ_Flag**: A boolean field `dq.firstActionMissing` returned alongside daily metrics indicating that completions were recorded for a date while first_actions was zero, signalling the funnel data for that date is unrecoverable.
- **First_Action_Tracking**: The end-to-end flow that fires a single debounced POST to `/api/game/first-action` the first time a session's user mutates a cell color, idempotent at the server via Redis SET NX.
- **First_Action_Endpoint**: The existing server route `POST /api/game/first-action` that calls `trackFirstAction(date, postId, userId, subredditId)` and returns `{ tracked: boolean }`.
- **Session_First_Action_Latch**: A client-side boolean per `(postId, page-load)` session that ensures at most one first-action POST is dispatched, regardless of how many cells the user taps.
- **Sanity_Invariant**: For every date with non-DQ data, `firstActions >= completions` must hold.
- **Kill_Rule_Suppression**: The dashboard rule-evaluation behavior that skips kill and scale rule evaluation for any metric whose value is `null` due to a DQ flag.
- **Inline_Hint**: A transient, in-game tooltip surfaced inside `GameView` the first time a specific game condition is encountered (numbered cell tap, or first invalid placement). Each hint has an idempotent dismissal flag stored client-side and mirrored to the server.
- **Hint_Number_Constraint**: The Inline_Hint shown the first time a session user taps a cell that has a number constraint, explaining that the number means same-color neighbors including diagonals.
- **Hint_Adjacency_Violation**: The Inline_Hint shown the first time a session user attempts to place a color that violates the adjacent-same-color rule, accompanied by a brief shake animation on the affected row or column.
- **Help_Icon_Tap_Rate**: The fraction of new sessions where the user taps the existing Help icon, used to detect insufficient inline hinting.
- **Tutorial_Opt_In**: An entry point inside the existing `HowToPlayModal` that launches `TutorialView` when the user explicitly chooses the scripted tutorial.
- **Tomorrow_Trigger**: The completion-screen feature that lets a user opt in to a daily mention notification, replacing the primary "Challenge Friends" slot.
- **Notify_Toggle**: The completion-screen UI control that calls the opt-in or opt-out endpoint depending on current state.
- **Notify_Opt_In_Set**: A Redis sorted set `notify:optin` whose members are user IDs and whose scores are the opt-in Unix timestamp; no expiry.
- **Daily_Mention_Batch**: The set of opt-in users who completed a puzzle yesterday and have not yet been mentioned today; produced by the scheduler each daily run.
- **Mention_Dedup_Key**: A Redis SET NX key `notify:mentioned:{date}:{userId}` with a 48-hour TTL, ensuring at most one mention comment per opted-in user per day.
- **Yesterday_Completer_Set**: The Redis sorted set used to enumerate users who completed at least one puzzle on the prior UTC date, derived from the existing `analytics:user:{userId}:completion_dates` per-user history.
- **Result_Card**: The existing emoji-grid summary rendered on the completion screen by `ResultCard.svelte`, unchanged by this spec.
- **More_Menu**: The existing collapsible "More" section on the completion screen that hosts secondary actions; consolidates Missions, Achievements, Profile, Season, and Challenge Friends after this spec.
- **Daily_Puzzle_Scheduler**: The existing cron task `daily-puzzle` registered in `devvit.json` at `0 16,20 * * *`. The 16:00 UTC slot is reused by the Tomorrow_Trigger workstream.
- **Backfill_Policy**: This spec performs no backfill of historical analytics counters; the DQ_Flag retroactively neutralizes false alerts for affected dates.

## Requirements

### Workstream 1: Instrumentation Truth

#### Requirement 1: Client First-Action Wiring

**User Story:** As a player, I want my first cell tap to be counted in the funnel exactly once, so that the dashboard reflects the true First Action Rate.

##### Acceptance Criteria

1. WHEN a session user mutates a cell color for the first time on a given post-load, THE Client SHALL POST to `/api/game/first-action` exactly once with the current post and user context.
2. WHILE the Session_First_Action_Latch is set for the current `(postId, page-load)` session, THE Client SHALL NOT issue any additional POSTs to `/api/game/first-action`.
3. WHEN the user mutates a cell color and a previous POST to `/api/game/first-action` is already in flight, THE Client SHALL NOT issue a second POST and SHALL preserve idempotence by relying on the latch.
4. IF the POST to `/api/game/first-action` fails for any reason (network, 4xx, 5xx), THEN THE Client SHALL leave the gameplay flow unaffected and SHALL NOT retry the POST within the same session.
5. WHEN the user starts a new puzzle via Next Puzzle, Restart, or Grid Size Change, THE Client SHALL reset the Session_First_Action_Latch so the first cell mutation on the new puzzle re-fires the POST.
6. FOR ALL session timelines containing N cell mutations within a single post-load and a single puzzle, the count of POSTs to `/api/game/first-action` issued by the client SHALL equal min(1, N) (idempotence property).

#### Requirement 2: Server First-Action Idempotence

**User Story:** As a developer, I want repeated first-action calls for the same user, post, and date to be safe, so that any client retry, re-entry, or race never inflates the funnel.

##### Acceptance Criteria

1. WHEN `POST /api/game/first-action` is invoked, THE First_Action_Endpoint SHALL call `trackFirstAction(date, postId, userId, subredditId)` and return `{ tracked: boolean }`.
2. WHEN the same `(date, postId, userId)` triple has already been counted, THE First_Action_Endpoint SHALL return `{ tracked: false }` and SHALL NOT increment `analytics:{date}:first_actions`.
3. WHEN the request lacks `context.postId` or `context.userId`, THE First_Action_Endpoint SHALL return HTTP 400 with a descriptive error and SHALL NOT increment any counter.
4. FOR ALL sequences of N consecutive successful invocations of `POST /api/game/first-action` with the same `(date, postId, userId)` triple, the resulting increment to `analytics:{date}:first_actions` SHALL equal 1 (idempotence property).
5. FOR ALL completed dates D and all user IDs U on D, the value of `analytics:{D}:first_actions` SHALL be greater than or equal to the count of distinct users in `analytics:user:{U}:completion_dates` containing D, after this requirement is in place (Sanity_Invariant property).

#### Requirement 3: Data Quality Flag for Missing First Actions

**User Story:** As a moderator viewing the dashboard, I want metrics to show as "no data" rather than 0% when an instrumentation gap is detected, so that I do not act on false signals.

##### Acceptance Criteria

1. WHEN computing `DailyMetrics` for a date D where `completions > 0` and `firstActions === 0`, THE Server SHALL set a Boolean field `dq.firstActionMissing` to `true` on the daily metrics object for D.
2. WHEN `dq.firstActionMissing` is `true` for date D, THE Server SHALL return `firstActionRate` and `completionRate` for D as `null` rather than 0 or NaN.
3. WHEN `dq.firstActionMissing` is `false` or absent, THE Server SHALL compute `firstActionRate` and `completionRate` using the existing safe-divide rules and SHALL NOT mark the date as DQ.
4. WHEN computing the `RollingMetrics` 7-day averages, THE Server SHALL exclude any date whose `dq.firstActionMissing` is `true` from the numerator and denominator of `firstActionRate7d` and `completionRate7d`.
5. IF every date in the 7-day window has `dq.firstActionMissing === true`, THEN THE Server SHALL return the corresponding rolling rate as `null`.
6. WHERE D1 Return Rate computation cohorts off `analytics:{date}:first_actions`, THE Server SHALL substitute `analytics:user:{userId}:completion_dates` membership for the cohort definition on dates with `dq.firstActionMissing === true`, so the D1 Return Rate is not poisoned by the DQ gap.
7. FOR ALL dates D where `dq.firstActionMissing === true`, repeating the daily metrics computation for D SHALL produce the same `firstActionRate === null`, `completionRate === null`, `dq.firstActionMissing === true` result regardless of input order or call count (idempotence property).
8. FOR ALL dates D where `firstActions >= completions` and `firstActions > 0`, the daily metrics computation SHALL return `dq.firstActionMissing === false` and numeric, finite `firstActionRate` and `completionRate` (positive case property).

#### Requirement 4: Kill-Rule and Scale-Rule Suppression on Null Metrics

**User Story:** As a developer, I want the dashboard to skip kill and scale evaluation for metrics with no real data, so that DQ gaps never raise KILL or SCALE alerts.

##### Acceptance Criteria

1. WHEN evaluating a kill rule against a `RollingMetrics` whose target metric is `null`, THE Server SHALL skip that rule and SHALL NOT include any alert for it in the dashboard alerts array.
2. WHEN evaluating a scale rule against a `RollingMetrics` whose target metric is `null`, THE Server SHALL skip that rule and SHALL NOT include any alert for it in the dashboard alerts array.
3. WHEN any rolling metric is `null`, THE Server SHALL include a `dqSuppressedRuleIds` field on `DashboardData` listing the IDs of every rule whose evaluation was suppressed for that day.
4. WHEN every input metric is non-null and finite, THE Server SHALL evaluate every kill and scale rule and SHALL leave `dqSuppressedRuleIds` empty.
5. FOR ALL `RollingMetrics` inputs M and rule sets R, evaluating R against M with all `null` fields replaced by their threshold-equal values SHALL produce the same alert IDs as evaluating R against M with those fields kept as `null` plus the corresponding rule IDs in `dqSuppressedRuleIds` (suppression equivalence property).
6. FOR ALL non-null, finite `RollingMetrics` inputs M and rule sets R, the rule evaluator SHALL be idempotent: calling it twice on the same inputs SHALL return alert sets equal under set equality (idempotence property).

#### Requirement 5: Dashboard UI Renders DQ Metrics Without False Positives

**User Story:** As a moderator viewing the dashboard, I want metrics tagged with a DQ badge instead of showing 0%, so that I can distinguish missing data from poor performance.

##### Acceptance Criteria

1. WHEN the dashboard receives a `DailyMetrics` whose `firstActionRate` is `null`, THE Dashboard_UI SHALL render that cell as `—` and SHALL NOT render `0.0%` or `NaN%`.
2. WHEN the dashboard receives a `DailyMetrics` whose `completionRate` is `null`, THE Dashboard_UI SHALL render that cell as `—` and SHALL NOT render `0.0%` or `NaN%`.
3. WHEN any rolling metric on the latest dashboard entry is `null`, THE Dashboard_UI SHALL render that metric tile with a small "DQ" badge and the value `—`.
4. WHEN `dqSuppressedRuleIds` is non-empty for the latest dashboard entry, THE Dashboard_UI SHALL render a non-alarming notice listing the count of suppressed rules; THE Dashboard_UI SHALL NOT render a KILL or SCALE alert card for any suppressed rule.
5. WHEN `dq.firstActionMissing` is `true` for any row in the 14-day table, THE Dashboard_UI SHALL render a small DQ badge in that row and SHALL render the rate cells as `—`.

#### Requirement 6: No Historical Backfill

**User Story:** As a developer, I want a clear, explicit non-goal that historical counters will not be backfilled, so that nobody attempts to invent first-action data for past dates.

##### Acceptance Criteria

1. THE Server SHALL NOT write to `analytics:{date}:first_actions` for any date earlier than the deploy date of this spec.
2. WHERE a moderator triggers a manual recompute of dashboards, THE Server SHALL still produce `dq.firstActionMissing === true` for every past date that already exhibits the missing-first-action condition.
3. THE Server SHALL document the Backfill_Policy in the dashboard endpoint response payload via a `backfillPolicy: 'no-backfill'` field on `DashboardData`.

### Workstream 2: Diegetic Onboarding

#### Requirement 7: Remove Mandatory First-Load Gates

**User Story:** As a new user, I want to land directly on a real, interactive puzzle, so that I can take my first action within seconds and the funnel is not blocked by tutorial friction.

##### Acceptance Criteria

1. WHEN a new user opens an Urjo post for the first time, THE Client SHALL navigate directly to `GameView` with a 4×4 puzzle and SHALL NOT navigate to `FirstScreen` or `TutorialView`.
2. WHEN the server's `GameState` indicates `tutorialCompleted === false` for a user, THE Client SHALL behave as if `tutorialCompleted === true` for view-routing purposes only and SHALL NOT mount `TutorialView` automatically.
3. WHEN the server's `GameState` indicates `isFirstTimeUser === true`, THE Client SHALL navigate directly to `GameView` and SHALL NOT mount `FirstScreen`.
4. WHILE `tutorialCompleted === true` is recorded for an existing user, THE Client SHALL preserve the previous behavior of navigating directly to `GameView`.
5. THE Client SHALL retain the `tutorialCompleted` field on `GameState` for compatibility but SHALL treat it as informational only.

#### Requirement 8: Inline Hint for Number-Constrained Cells

**User Story:** As a new user, I want to learn what a numbered cell means the first time I tap one, so that I understand the constraint without a scripted tutorial.

##### Acceptance Criteria

1. WHEN a session user taps a cell whose `number` field is non-null for the first time on a given page-load, THE Client SHALL display Hint_Number_Constraint as a transient tooltip near the tapped cell.
2. THE Hint_Number_Constraint SHALL display a one-line caption explaining that the number indicates how many same-color neighbors the cell has, counting all eight surrounding cells including diagonals.
3. THE Hint_Number_Constraint SHALL auto-dismiss after a fixed duration of 3500 milliseconds or when the user taps anywhere outside the tooltip.
4. WHEN Hint_Number_Constraint has already been shown once during the current session, THE Client SHALL NOT display it again on subsequent number-constrained taps in that session.
5. WHERE the user has previously dismissed Hint_Number_Constraint persistently (server flag set), THE Client SHALL NOT display it on future sessions.
6. WHEN the user taps any cell whose `number` field is `null`, THE Client SHALL NOT display Hint_Number_Constraint.
7. FOR ALL sequences of taps within a single session, the number of times Hint_Number_Constraint is displayed SHALL be at most 1 (idempotence property).

#### Requirement 9: Inline Hint for Adjacency Violations

**User Story:** As a new user, I want immediate feedback the first time I make an invalid placement, so that I understand the adjacent-same-color rule.

##### Acceptance Criteria

1. WHEN a session user mutates a cell to a color that creates a forbidden three-in-a-row of the same color along its row or column for the first time on a given page-load, THE Client SHALL briefly shake the affected row or column and SHALL display Hint_Adjacency_Violation as a one-line caption explaining the constraint.
2. THE Hint_Adjacency_Violation caption SHALL state that no row or column may contain three of the same color in a row.
3. THE shake animation SHALL run for at most 600 milliseconds and SHALL NOT block subsequent input.
4. WHEN Hint_Adjacency_Violation has already been shown once during the current session, THE Client SHALL NOT display the caption again, but SHALL continue to surface row/column violation styling via the existing `validateGrid` flow.
5. WHERE the user has previously dismissed Hint_Adjacency_Violation persistently (server flag set), THE Client SHALL NOT display the caption on future sessions.
6. FOR ALL sequences of cell mutations within a single session, the number of times Hint_Adjacency_Violation caption is displayed SHALL be at most 1 (idempotence property).

#### Requirement 10: Tutorial Reachable as Opt-In

**User Story:** As a user who wants more help, I want to launch the scripted tutorial from the existing Help icon, so that the tutorial remains available without blocking new users.

##### Acceptance Criteria

1. THE Client SHALL render an "Open Tutorial" entry inside the existing `HowToPlayModal`.
2. WHEN the user activates the "Open Tutorial" entry, THE Client SHALL mount `TutorialView` in opt-in mode.
3. WHEN the user completes the opt-in tutorial, THE Client SHALL POST to `/api/game/tutorial-complete` so the existing flag is set, and SHALL return to `GameView`.
4. WHEN the user dismisses the opt-in tutorial without completing it, THE Client SHALL return to `GameView` and SHALL NOT modify `tutorialCompleted`.

#### Requirement 11: Help-Icon-Tap Tracking

**User Story:** As a developer, I want to know how often new users tap the Help icon, so that I can detect when inline hints are insufficient.

##### Acceptance Criteria

1. WHEN a session user taps the Help icon for the first time on a given page-load, THE Client SHALL POST to `/api/game/help-tap` with the current post and user context.
2. THE Server SHALL increment the counter `analytics:{date}:help_taps` exactly once per `(date, postId, userId)` triple, using SET NX deduplication on `analytics:helped:{date}:{postId}:{userId}` with a 24-hour TTL.
3. WHEN the user taps the Help icon a second or subsequent time during the same session, THE Client SHALL still open `HowToPlayModal` but SHALL NOT POST again.
4. THE Server SHALL expose `helpTapRate = help_taps / new_sessions_today` on the `DailyMetrics` response, where `new_sessions_today` is the count of distinct users with a first `post_open` event recorded today.
5. FOR ALL sequences of N help-icon taps by the same user on the same date, the increment to `analytics:{date}:help_taps` SHALL equal min(1, N) (idempotence property).

#### Requirement 12: Persisted Hint-Dismissal Flags

**User Story:** As a returning user, I want the inline hints I have already seen to stop appearing, so that I am not nagged by tutorial content I do not need.

##### Acceptance Criteria

1. WHEN Hint_Number_Constraint is displayed, THE Server SHALL set the Redis flag `user:{userId}:hint:numberConstraint` to `'1'` with no TTL on the next session-end signal or on explicit dismiss.
2. WHEN Hint_Adjacency_Violation is displayed, THE Server SHALL set the Redis flag `user:{userId}:hint:adjacencyViolation` to `'1'` with no TTL on the next session-end signal or on explicit dismiss.
3. THE Server SHALL include a `hintsDismissed: { numberConstraint: boolean, adjacencyViolation: boolean }` object on the `GameState` response.
4. WHEN `hintsDismissed.numberConstraint === true`, THE Client SHALL NOT display Hint_Number_Constraint for the duration of the session.
5. WHEN `hintsDismissed.adjacencyViolation === true`, THE Client SHALL NOT display Hint_Adjacency_Violation for the duration of the session.
6. FOR ALL sequences of N session-end signals from the same user after a hint has been displayed, the resulting Redis state SHALL be the same single `'1'` value regardless of N (idempotence property).

### Workstream 3: Tomorrow-Trigger

#### Requirement 13: Notify Toggle on Completion Screen

**User Story:** As a player who just completed a puzzle, I want to opt in to a daily reminder, so that I form a return habit without push notifications.

##### Acceptance Criteria

1. WHEN the completion overlay is rendered and the current user is not in the Notify_Opt_In_Set, THE Client SHALL render the Notify_Toggle in its "Notify me tomorrow" state.
2. WHEN the user activates the Notify_Toggle in opt-in state, THE Client SHALL POST to `/api/game/notify/opt-in` and on success SHALL update local state to opted-in.
3. WHEN the completion overlay is rendered and the current user is already in the Notify_Opt_In_Set, THE Client SHALL render the Notify_Toggle in its "Notifications on — tap to turn off" state.
4. WHEN the user activates the Notify_Toggle in opted-in state, THE Client SHALL POST to `/api/game/notify/opt-out` and on success SHALL update local state to opted-out.
5. IF either notify endpoint returns a non-2xx response, THEN THE Client SHALL preserve the prior toggle state and SHALL display a brief inline error.

#### Requirement 14: Notify Opt-In and Opt-Out Endpoints

**User Story:** As a developer, I want server-side opt-in and opt-out endpoints with strict idempotence, so that double-taps and races never corrupt the Notify_Opt_In_Set.

##### Acceptance Criteria

1. THE Server SHALL expose `POST /api/game/notify/opt-in` that adds `userId` to the Notify_Opt_In_Set with the current Unix timestamp as the score and returns `{ optedIn: true }`.
2. THE Server SHALL expose `POST /api/game/notify/opt-out` that removes `userId` from the Notify_Opt_In_Set and returns `{ optedIn: false }`.
3. WHEN either endpoint is invoked without `context.userId`, THE Server SHALL return HTTP 401.
4. WHEN `POST /api/game/notify/opt-in` is invoked for a user already in the Notify_Opt_In_Set, THE Server SHALL preserve the existing membership score and SHALL return `{ optedIn: true }`.
5. WHEN `POST /api/game/notify/opt-out` is invoked for a user not in the Notify_Opt_In_Set, THE Server SHALL return `{ optedIn: false }` without error.
6. THE Server SHALL include the current opt-in state on the `GameState` response under `notifyOptIn: boolean`.
7. FOR ALL sequences of opt-in and opt-out calls for the same user, the final membership of `notify:optin` SHALL equal the membership implied by the last call only (last-write-wins property).
8. FOR ALL pairs of consecutive identical calls (two opt-ins, or two opt-outs) for the same user, the second call SHALL produce the same final membership as the first (idempotence property).

#### Requirement 15: Daily Mention Scheduler Hook

**User Story:** As an opted-in user, I want one mention comment per day on today's puzzle post linking me to the puzzle, so that I have a clear daily trigger.

##### Acceptance Criteria

1. WHEN the Daily_Puzzle_Scheduler runs at 16:00 UTC, THE Server SHALL compute the Daily_Mention_Batch as the intersection of the Notify_Opt_In_Set and the Yesterday_Completer_Set for the prior UTC date.
2. THE Server SHALL post one comment from the app account on today's puzzle post for each user in the Daily_Mention_Batch.
3. THE comment text SHALL include `u/{username}`, the user's current streak count, and a Reddit URL pointing to today's puzzle post.
4. WHEN the comment for a user has already been posted today, THE Server SHALL NOT post a second comment for that user that day.
5. THE Server SHALL enforce the at-most-one-per-day cap by setting Mention_Dedup_Key with SET NX before submitting the comment, with a 48-hour TTL.
6. IF the SET NX call indicates the dedup key already existed, THEN THE Server SHALL skip the comment submission for that user without error.
7. WHEN the comment submission fails for a user, THE Server SHALL release no dedup key for that user, SHALL log the error, and SHALL continue processing remaining users in the batch.
8. THE Server SHALL reuse the existing 16:00 UTC slot of the `daily-puzzle` cron task and SHALL NOT add a separate cron entry to `devvit.json`.
9. FOR ALL Daily_Mention_Batch sets B and all users U in B, the count of comments posted for U on a given date D SHALL be 1, regardless of how many times the scheduler runs that day (idempotence property).
10. FOR ALL users U not in the Yesterday_Completer_Set for D-1, the count of mention comments for U on D SHALL be 0 (eligibility property).
11. FOR ALL users U not in the Notify_Opt_In_Set, the count of mention comments for U on D SHALL be 0 (consent property).

#### Requirement 16: Eligibility Set Computation

**User Story:** As a developer, I want a pure function that computes the Daily_Mention_Batch from inputs, so that the scheduler logic is testable in isolation.

##### Acceptance Criteria

1. THE Server SHALL expose a pure function `computeDailyMentionBatch(optInUserIds: readonly string[], yesterdayCompleterUserIds: readonly string[], alreadyMentionedUserIds: readonly string[]): readonly string[]` in `src/server/lib/`.
2. THE function SHALL return the set difference `(optInUserIds ∩ yesterdayCompleterUserIds) − alreadyMentionedUserIds`.
3. THE function SHALL deduplicate inputs and SHALL return entries in stable insertion order matching the order of `optInUserIds`.
4. THE function SHALL be pure and SHALL NOT call Redis, Reddit API, or any other side-effectful dependency.
5. FOR ALL three input arrays A, B, C, calling `computeDailyMentionBatch(A, B, C)` twice with identical inputs SHALL return arrays equal under set equality (idempotence property).
6. FOR ALL three input arrays A, B, C, the result `R = computeDailyMentionBatch(A, B, C)` SHALL satisfy `R ∩ C === ∅` (no double-mention property).
7. FOR ALL three input arrays A, B, C, the result R SHALL satisfy `R ⊆ A ∩ B` (consent and eligibility property).

#### Requirement 17: Completion Screen CTA Reordering

**User Story:** As a player who just completed a puzzle, I want the screen ordered around the four highest-impact actions, so that the path to share, return, and convert is obvious.

##### Acceptance Criteria

1. WHEN the completion overlay renders, THE Client SHALL render exactly four primary CTAs in the following vertical order: (a) Result_Card preview with Copy action, (b) Notify_Toggle, (c) Next Puzzle, (d) Subscribe to subreddit.
2. WHERE the user is already subscribed to the current subreddit, THE Client SHALL omit the Subscribe CTA and render exactly three primary CTAs.
3. THE Client SHALL move "Challenge Friends" out of the primary CTA stack and into the existing More_Menu.
4. THE Client SHALL consolidate Missions, Achievements, Profile, Season, and Challenge Friends inside the existing More_Menu, in that order.
5. WHEN the More_Menu is collapsed, THE Client SHALL NOT render any of the secondary actions in the primary CTA region.
6. THE Client SHALL preserve all existing engagement overlays (Mystery Box, Streak Milestone, Confetti) without changes to their visual contracts.

#### Requirement 18: Mention Comment Format

**User Story:** As an opted-in user, I want the mention comment to feel personal and useful, so that I act on it rather than ignoring it.

##### Acceptance Criteria

1. THE mention comment text SHALL contain the literal string `u/{username}` for the target user.
2. THE mention comment text SHALL contain the user's current streak as a numeric value followed by the word `streak`.
3. THE mention comment text SHALL contain a Reddit URL `https://reddit.com/comments/{postId}` pointing to today's puzzle post.
4. THE mention comment text SHALL NOT contain any user IDs, internal Redis keys, or any string starting with `t1_`, `t2_`, `t3_`, `t4_`, or `t5_`.
5. FOR ALL valid `(username, streak, postId)` triples, given the deterministic comment template T, calling `T(username, streak, postId)` and then extracting the username, streak, and post-id substrings SHALL recover the original triple (round-trip property).

### Cross-Cutting Requirements

#### Requirement 19: API Route Conventions

**User Story:** As a developer, I want all new endpoints to follow the existing Hono route patterns, so that auth, error handling, and response shapes are consistent.

##### Acceptance Criteria

1. THE Server SHALL define `POST /api/game/notify/opt-in`, `POST /api/game/notify/opt-out`, and `POST /api/game/help-tap` inside the existing game router file or a sibling router under `src/server/routes/`.
2. WHEN any new endpoint is missing `context.userId`, THE Server SHALL return HTTP 401 with the existing standard error shape used by the game router.
3. WHEN any new endpoint is missing `context.postId` and the endpoint logically requires a post context, THE Server SHALL return HTTP 400 with the existing standard error shape.
4. THE Server SHALL log non-critical analytics failures via `console.error` and SHALL NOT propagate them to the client response.
5. THE Server SHALL follow the existing `try / catch / return c.json(...)` pattern for all new endpoints.

#### Requirement 20: Redis Key Conventions and TTLs

**User Story:** As a developer, I want all new Redis keys to use the existing colon-delimited convention with TTLs where appropriate, so that storage is bounded and predictable.

##### Acceptance Criteria

1. THE Server SHALL use Redis key `notify:optin` (sorted set, no TTL) for the Notify_Opt_In_Set.
2. THE Server SHALL use Redis key `notify:mentioned:{date}:{userId}` (string, 48-hour TTL) for the Mention_Dedup_Key.
3. THE Server SHALL use Redis key `analytics:helped:{date}:{postId}:{userId}` (string, 24-hour TTL) for the help-tap dedup flag.
4. THE Server SHALL use Redis key `analytics:{date}:help_taps` (counter, no TTL) for the help-tap daily counter.
5. THE Server SHALL use Redis key `user:{userId}:hint:numberConstraint` (string, no TTL) for the persisted dismissal flag.
6. THE Server SHALL use Redis key `user:{userId}:hint:adjacencyViolation` (string, no TTL) for the persisted dismissal flag.
7. THE Server SHALL NOT introduce any new keys outside the colon-delimited convention.
8. FOR ALL Redis keys defined by this spec, the resulting key string SHALL contain only ASCII alphanumeric characters, hyphens, underscores, and colons (key-format property).

#### Requirement 21: Property-Based Tests for Pure Logic

**User Story:** As a developer, I want property-based tests around the pure logic introduced by this spec, so that idempotence and invariants are mechanically checked.

##### Acceptance Criteria

1. THE Test_Suite SHALL include a property-based test for `computeDailyMentionBatch` asserting `R ⊆ A ∩ B` and `R ∩ C === ∅` for arbitrary input arrays.
2. THE Test_Suite SHALL include a property-based test for the DQ-flag computation asserting that for arbitrary `(firstActions, completions)` pairs, `dq.firstActionMissing === true` if and only if `completions > 0 && firstActions === 0`.
3. THE Test_Suite SHALL include a property-based test for the kill-rule and scale-rule suppression asserting that for arbitrary `RollingMetrics` inputs with arbitrary `null` slots, the union of returned alert IDs and `dqSuppressedRuleIds` equals the alert IDs returned when `null` slots are replaced by their threshold-equal values.
4. THE Test_Suite SHALL include a property-based test for the hint-trigger conditions asserting that the count of Hint_Number_Constraint displays in any sequence of N taps is at most 1, and that Hint_Adjacency_Violation displays at most 1 per session.
5. THE Test_Suite SHALL include example-based integration tests for `POST /api/game/first-action`, `POST /api/game/notify/opt-in`, `POST /api/game/notify/opt-out`, and the daily-puzzle scheduler hook covering the Daily_Mention_Batch happy path and the dedup-key-already-set path.
6. FOR ALL property-based tests defined here, the chosen PBT library SHALL be the workspace standard (fast-check via Vitest) and SHALL run inside `__tests__/` directories colocated with source.

#### Requirement 22: Skill File References

**User Story:** As a developer, I want this spec's implementation to follow the documented skills, so that conventions are honored.

##### Acceptance Criteria

1. THE Implementation SHALL follow `src/.agents/skills/api-route/SKILL.md` for any new Hono routes.
2. THE Implementation SHALL follow `src/.agents/skills/svelte-component/SKILL.md` for any new or modified Svelte components.
3. THE Implementation SHALL follow `src/.agents/skills/redis-schema/SKILL.md` for any new Redis keys, TTLs, and value formats.
4. THE Implementation SHALL follow `src/.agents/skills/scheduler/SKILL.md` for the daily mention scheduler hook.
5. THE Implementation SHALL follow `src/.agents/skills/reddit-api/SKILL.md` for the daily mention comment submissions.

#### Requirement 23: Devvit Configuration Constraints

**User Story:** As a developer, I want Devvit configuration to remain unchanged where possible, so that this corrective does not introduce platform risk.

##### Acceptance Criteria

1. THE Implementation SHALL NOT modify the existing `daily-puzzle` cron entry `0 16,20 * * *` in `devvit.json`.
2. THE Implementation SHALL NOT add additional scheduler tasks to `devvit.json`.
3. THE Implementation SHALL reuse the existing `permissions.reddit.asUser` entries for `SUBMIT_COMMENT` and SHALL NOT request additional permissions.

### Success Criteria

#### Requirement 24: Two-Week Outcome Thresholds

**User Story:** As a developer, I want explicit two-week outcome thresholds, so that the corrective's success or failure is unambiguous.

##### Acceptance Criteria

1. WHEN two weeks have elapsed since deployment, THE Dashboard SHALL show non-zero, non-DQ values for First Action Rate, Completion Rate, and D1 Return Rate on the most recent UTC date.
2. WHEN two weeks have elapsed since deployment, THE Dashboard SHALL show zero kill-rule alerts whose root cause is a DQ flag.
3. WHEN two weeks have elapsed since deployment, the Sanity_Invariant `firstActions >= completions` SHALL hold for every UTC date in the prior 14-day window with `dq.firstActionMissing === false`.
4. WHEN two weeks have elapsed since deployment, the 7-day Compl/Open ratio SHALL be greater than or equal to 0.18 on the most recent UTC date.
5. WHEN two weeks have elapsed since deployment, the Help_Icon_Tap_Rate SHALL be less than 0.25 on the most recent UTC date.
6. WHEN two weeks have elapsed since deployment, among the subset of users in the Notify_Opt_In_Set, D1 Return Rate SHALL be greater than or equal to 0.25 on the most recent UTC date.
7. WHEN two weeks have elapsed since deployment, the cumulative count of users who have ever activated the Notify_Toggle SHALL be greater than or equal to 0.15 times the count of users who completed at least one puzzle in the same window.
8. FOR ALL UTC dates D in the prior 14-day window with `dq.firstActionMissing === false` and `firstActions > 0`, `completionRate(D) === completions(D) / firstActions(D)` SHALL hold (rate-definition property).

## Non-Goals (Explicitly Out of Scope)

The following are explicitly out of scope for this spec and SHALL NOT be addressed by the resulting design or tasks documents:

1. Backfilling historical analytics counters for any date earlier than the deploy date.
2. Per-subreddit theming or moderator-facing admin configuration changes.
3. Result Card visual polish, new mystery box rewards, new mission templates, new achievements, season balance changes, and flair tier expansion.
4. Moderator authentication caching optimizations or per-subreddit DQE breakdown changes.
5. Push notification delivery (unavailable on the Devvit platform); the Reddit inbox mention is the surrogate.
6. A/B testing framework; this corrective is a flag-flip plus a before-and-after comparison.
7. Replacement of the scripted `TutorialView` content; only its routing changes.
8. Changes to the existing `daily-puzzle` cron schedule.
