# Implementation Plan: Funnel Truth and Trigger

## Overview

Three coordinated workstreams responding to a triple-KILL alert caused by an instrumentation gap. The client never POSTs to the existing `/api/game/first-action` endpoint, so `analytics:{date}:first_actions` is permanently zero and all dependent rates collapse. This plan wires the missing POST, adds Data Quality (DQ) flags to neutralize false alerts, removes mandatory onboarding gates in favor of inline hints, and adds a daily mention notification for opted-in completers.

Implementation follows the workspace's TDD workflow: shared types first, then pure server lib modules (testable in isolation), then routes, then client stores and components, then scheduler integration, and finally end-to-end verification.

## Tasks

- [x] 1. Update shared types and constants
  - [x] 1.1 Extend `src/shared/growth-types.ts` with DQ and nullable metric fields
    - Add `helpTaps: number` to `DailyMetrics`
    - Change `firstActionRate`, `completionRate`, `d1ReturnRate` to `number | null` on `DailyMetrics`
    - Add `dq: { firstActionMissing: boolean }` to `DailyMetrics`
    - Add `helpTapRate: number | null` to `DailyMetrics`
    - Change all fields on `RollingMetrics` to `number | null`
    - Add `dqSuppressedRuleIds: string[]` to `DashboardData`
    - Add `backfillPolicy: 'no-backfill'` to `DashboardData`
    - _Requirements: 3.1, 3.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 6.3, 11.4_

  - [x] 1.2 Extend `src/shared/types.ts` with notify and hints fields on `GameState`
    - Add `notifyOptIn?: boolean` to `GameState`
    - Add `hintsDismissed?: { numberConstraint: boolean; adjacencyViolation: boolean }` to `GameState`
    - _Requirements: 12.3, 14.6_

- [x] 2. Implement analytics DQ logic
  - [x] 2.1 Update `getDailyMetrics` in `src/server/lib/analytics.ts` to emit DQ flag and nullable rates
    - Detect `completions > 0 && firstActions === 0` → set `dq.firstActionMissing = true`
    - Return `firstActionRate` and `completionRate` as `null` when DQ is true
    - Add `helpTaps` counter read from `analytics:{date}:help_taps`
    - Compute `helpTapRate = helpTaps / postOpens` (null when postOpens === 0)
    - _Requirements: 3.1, 3.2, 3.3, 3.7, 3.8, 11.4_

  - [x] 2.2 Write property test for DQ flag computation (Property 3)
    - **Property 3: DQ Flag Computation**
    - For all `(firstActions, completions)` pairs of non-negative integers, `dq.firstActionMissing === true` iff `completions > 0 && firstActions === 0`; rates are `null` when DQ, finite `[0,1]` otherwise
    - **Validates: Requirements 3.1, 3.2, 3.7, 3.8**

  - [x] 2.3 Write property test for rate definition consistency (Property 15)
    - **Property 15: Rate Definition Consistency**
    - For all dates D with `dq.firstActionMissing === false` and `firstActions > 0`, `completionRate === completions / firstActions`
    - **Validates: Requirement 24.8**

  - [x] 2.4 Write unit tests for `getDailyMetrics` DQ scenarios
    - Test `completions=5, firstActions=0` → `dq.firstActionMissing=true`, rates are `null`
    - Test `completions=5, firstActions=10` → `dq.firstActionMissing=false`, rates are numeric
    - Test `completions=0, firstActions=0` → `dq.firstActionMissing=false`, rates are 0
    - _Requirements: 3.1, 3.2, 3.7, 3.8_

- [x] 3. Update dashboard library for null-aware metrics and rule suppression
  - [x] 3.1 Update `computeRollingAverage` in `src/server/lib/dashboard.ts` to filter null values
    - Accept `readonly (number | null)[]` input
    - Filter out `null` values before averaging
    - Return `null` when all values are `null`
    - _Requirements: 3.4, 3.5_

  - [x] 3.2 Update `evaluateKillRules` and `evaluateScaleRules` to skip null metrics and return suppressed rule IDs
    - Accept `RollingMetricsNullable` (all fields `number | null`)
    - Skip rules whose target metric is `null`
    - Return `{ alerts: Alert[]; suppressedRuleIds: string[] }`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 3.3 Update `computeDashboard` to populate `dqSuppressedRuleIds` and `backfillPolicy`
    - Aggregate suppressed rule IDs from both evaluators
    - Set `backfillPolicy: 'no-backfill'` on every `DashboardData` response
    - Exclude DQ dates from rolling average computation
    - _Requirements: 4.3, 6.3_

  - [x] 3.4 Write property test for kill/scale rule suppression equivalence (Property 4)
    - **Property 4: Kill/Scale Rule Suppression Equivalence**
    - For all `RollingMetricsNullable` inputs M and rule sets R, the union of alert IDs and `suppressedRuleIds` equals the alert IDs when null slots are replaced by threshold-equal values
    - **Validates: Requirements 4.1, 4.2, 4.5**

  - [x] 3.5 Write property test for rule evaluator idempotence (Property 5)
    - **Property 5: Rule Evaluator Idempotence**
    - For all non-null, finite `RollingMetricsNullable` inputs M and rule sets R, calling the evaluator twice returns alert sets equal under set equality
    - **Validates: Requirement 4.6**

  - [x] 3.6 Write unit tests for null-aware rolling average and dashboard suppression
    - Test `[0.5, null, 0.3, null]` → averages only non-null values
    - Test all-null array → returns `null`
    - Test rule with null target metric is skipped and appears in `suppressedRuleIds`
    - Test non-null metrics evaluate all rules normally
    - _Requirements: 3.4, 3.5, 4.1, 4.2_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement notify library
  - [x] 5.1 Create `src/server/lib/notify.ts` with pure `computeDailyMentionBatch` and Redis persistence
    - Implement `computeDailyMentionBatch(optInUserIds, yesterdayCompleterUserIds, alreadyMentionedUserIds): readonly string[]` — pure set difference `(A ∩ B) − C`, deduplicated, stable order
    - Implement `addOptIn(userId)` — `redis.zAdd('notify:optin', { member: userId, score: Date.now() })`
    - Implement `removeOptIn(userId)` — `redis.zRem('notify:optin', [userId])`
    - Implement `isOptedIn(userId)` — check membership in `notify:optin`
    - Implement `getOptInUserIds()` — read all members from `notify:optin`
    - Implement `getCompleterUserIdsForDate(date)` — scan `analytics:user:*:completion_dates` for members with the given date
    - Implement `tryMarkUserMentioned(date, userId)` — SET NX on `notify:mentioned:{date}:{userId}` with 48h TTL
    - Implement `buildMentionCommentText(username, streak, postId)` — deterministic template
    - _Requirements: 14.1, 14.2, 15.1, 15.4, 15.5, 16.1, 16.2, 16.3, 16.4, 18.1, 18.2, 18.3, 18.4_

  - [x] 5.2 Write property test for daily mention batch set difference (Property 10)
    - **Property 10: Daily Mention Batch Set Difference**
    - For all three input arrays A, B, C: `R ⊆ A ∩ B`, `R ∩ C = ∅`, idempotent
    - **Validates: Requirements 16.5, 16.6, 16.7**

  - [x] 5.3 Write property test for mention comment round-trip (Property 12)
    - **Property 12: Mention Comment Round-Trip**
    - For all valid `(username, streak, postId)` triples, extracting substrings from `buildMentionCommentText` output recovers the original triple
    - **Validates: Requirement 18.5**

  - [x] 5.4 Write unit tests for notify library
    - Test `computeDailyMentionBatch` with overlapping and disjoint sets
    - Test `addOptIn` is idempotent (preserves existing score)
    - Test `removeOptIn` for non-member returns without error
    - Test `tryMarkUserMentioned` returns false on second call
    - Test `buildMentionCommentText` contains `u/{username}`, streak number, and Reddit URL
    - _Requirements: 14.4, 14.5, 15.5, 15.6, 18.1, 18.2, 18.3_

- [x] 6. Implement hints library
  - [x] 6.1 Create `src/server/lib/hints.ts` with hint dismissal persistence
    - Implement `getHintsDismissed(userId)` — reads `user:{userId}:hint:numberConstraint` and `user:{userId}:hint:adjacencyViolation` from Redis
    - Implement `markHintDismissed(userId, kind)` — sets `user:{userId}:hint:{kind}` to `'1'` (no TTL, idempotent)
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 6.2 Write property test for hint dismissal persistence idempotence (Property 7)
    - **Property 7: Hint Dismissal Persistence Idempotence**
    - For all sequences of N `markHintDismissed` calls for the same user and kind, the Redis state is always `'1'`
    - **Validates: Requirement 12.6**

  - [x] 6.3 Write unit tests for hints library
    - Test `getHintsDismissed` returns `{ numberConstraint: false, adjacencyViolation: false }` for new user
    - Test `markHintDismissed` sets flag, subsequent `getHintsDismissed` returns true
    - Test double `markHintDismissed` is idempotent
    - _Requirements: 12.1, 12.2, 12.6_

- [x] 7. Implement notify routes
  - [x] 7.1 Create `src/server/routes/notify.ts` with opt-in and opt-out endpoints
    - Implement `POST /api/game/notify/opt-in` — 401 if no userId, calls `addOptIn`, returns `{ optedIn: true }`
    - Implement `POST /api/game/notify/opt-out` — 401 if no userId, calls `removeOptIn`, returns `{ optedIn: false }`
    - Register `notifyRouter` in `src/server/index.ts`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 19.1_

  - [x] 7.2 Write property test for notify last-write-wins (Property 8)
    - **Property 8: Notify Last-Write-Wins**
    - For all sequences of opt-in and opt-out calls, final membership equals the last call's implied state
    - **Validates: Requirement 14.7**

  - [x] 7.3 Write property test for notify idempotence (Property 9)
    - **Property 9: Notify Idempotence**
    - For all pairs of consecutive identical calls, the second produces the same membership as the first
    - **Validates: Requirement 14.8**

  - [x] 7.4 Write integration tests for notify routes
    - Test opt-in returns `{ optedIn: true }`, opt-out returns `{ optedIn: false }`
    - Test 401 when no userId
    - Test double opt-in preserves membership
    - Test opt-out for non-member returns without error
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 8. Extend game routes with help-tap, hints/dismiss, and GameState fields
  - [x] 8.1 Add `POST /api/game/help-tap` endpoint to `src/server/routes/game.ts`
    - Deduplicate per `(date, postId, userId)` via SET NX on `analytics:helped:{date}:{postId}:{userId}` with 24h TTL
    - Increment `analytics:{date}:help_taps` on first call
    - Return `{ tracked: boolean }`
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 8.2 Add `POST /api/game/hints/dismiss` endpoint to `src/server/routes/game.ts`
    - Accept body `{ kind: 'numberConstraint' | 'adjacencyViolation' }`
    - Call `markHintDismissed(userId, kind)`
    - Return `{ dismissed: true }`
    - _Requirements: 12.1, 12.2_

  - [x] 8.3 Update `GET /api/game/state` to include `notifyOptIn` and `hintsDismissed`
    - Call `isOptedIn(userId)` and include result as `notifyOptIn`
    - Call `getHintsDismissed(userId)` and include result as `hintsDismissed`
    - Remove `firstScreen` payload from response (new users go straight to GameView)
    - _Requirements: 7.1, 7.2, 7.3, 12.3, 14.6_

  - [x] 8.4 Write property test for help-tap idempotence (Property 13)
    - **Property 13: Help-Tap Idempotence**
    - For all sequences of N help-icon taps by the same user on the same date, the increment to `analytics:{date}:help_taps` equals `min(1, N)`
    - **Validates: Requirement 11.5**

  - [x] 8.5 Write unit tests for help-tap and hints/dismiss endpoints
    - Test help-tap increments counter once, returns `{ tracked: false }` on second call
    - Test hints/dismiss sets flag and returns `{ dismissed: true }`
    - Test hints/dismiss with invalid kind returns 400
    - Test GameState includes `notifyOptIn` and `hintsDismissed`
    - _Requirements: 11.1, 11.2, 11.3, 12.1, 12.2, 12.3_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement client-side first-action store and wiring
  - [x] 10.1 Create `src/client/stores/first-action.ts` with latch logic
    - Export a writable store `{ latched: boolean }`
    - Implement `fireOnce(postId)` — checks latch, sets to true, POSTs to `/api/game/first-action` (fire-and-forget)
    - Implement `resetLatch()` — sets latched to false
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 10.2 Wire first-action POST in `src/client/App.svelte`
    - Import `firstActionLatchStore` and call `fireOnce()` inside `handleCellChange` on first mutation
    - Call `resetLatch()` in `loadGame`, `handleNextChallenge`, `handleRestart`, `handleGridSizeChange`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 10.3 Write property test for first-action client idempotence (Property 1)
    - **Property 1: First-Action Idempotence**
    - For all sequences of N cell mutations within a single session, the count of POSTs equals `min(1, N)`
    - **Validates: Requirements 1.6, 2.4**

- [x] 11. Implement client-side hints store and InlineHint component
  - [x] 11.1 Create `src/client/stores/hints.ts` with session hint tracking
    - Export a writable store `{ numberConstraintShown: boolean, adjacencyViolationShown: boolean }`
    - Implement `markShown(kind)` — sets in-session flag
    - Implement `hydrateFromServer(hintsDismissed)` — initializes from GameState
    - Implement `dismissPersistent(kind)` — POSTs to `/api/game/hints/dismiss`
    - _Requirements: 8.4, 8.5, 9.4, 9.5, 12.4, 12.5_

  - [x] 11.2 Create `src/client/components/InlineHint.svelte`
    - Props: `text: string`, `kind: 'numberConstraint' | 'adjacencyViolation'`, `onDismiss: () => void`
    - Auto-dismiss after 3500ms or on click outside
    - On dismiss, POST to `/api/game/hints/dismiss` and call `onDismiss`
    - Render as a transient tooltip bubble positioned near the trigger cell
    - _Requirements: 8.1, 8.2, 8.3, 9.1, 9.2, 9.3_

  - [x] 11.3 Write property test for hint display idempotence per session (Property 6)
    - **Property 6: Hint Display Idempotence Per Session**
    - For all sequences of N cell taps within a single session, each hint type is displayed at most 1 time
    - **Validates: Requirements 8.7, 9.6**

- [x] 12. Remove mandatory onboarding gates and add opt-in tutorial
  - [x] 12.1 Update `src/client/App.svelte` view-routing to skip FirstScreen and TutorialView for new users
    - New users (`isFirstTimeUser === true` or `tutorialCompleted === false`) navigate directly to `GameView`
    - Preserve `tutorialCompleted` field for compatibility but treat as informational only
    - Pass `notifyOptIn` and `hintsDismissed` from GameState to GameView
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 12.2 Add "Open Tutorial" entry to `src/client/components/HowToPlayModal.svelte`
    - Render an "Open Tutorial" button/entry inside the modal
    - On activation, mount `TutorialView` in opt-in mode
    - On tutorial completion, POST to `/api/game/tutorial-complete` and return to GameView
    - On tutorial dismissal without completion, return to GameView without modifying `tutorialCompleted`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 12.3 Update `src/client/views/TutorialView.svelte` to support opt-in mode
    - Add `mode: 'mandatory' | 'opt-in'` prop (default: 'mandatory' for backward compat)
    - In opt-in mode, completion dismisses the view without redirect
    - Add a dismiss/close button visible in opt-in mode
    - _Requirements: 10.2, 10.3, 10.4_

- [x] 13. Implement completion screen CTA reorder and Notify toggle
  - [x] 13.1 Reorder completion overlay CTAs in `src/client/views/GameView.svelte`
    - Primary CTA order: (1) Result Card + Copy, (2) Notify Toggle, (3) Next Puzzle, (4) Subscribe (non-subs only)
    - Move "Challenge Friends" into the More menu
    - Consolidate More menu: Missions, Achievements, Profile, Season, Challenge Friends
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [x] 13.2 Add Notify Toggle component to `src/client/views/GameView.svelte`
    - Read `notifyOptIn` from props
    - Show "🔔 Notify me tomorrow" when off, "🔕 Notifications on — tap to turn off" when on
    - POST to `/api/game/notify/opt-in` or `/api/game/notify/opt-out` on tap
    - Revert state and show inline error on failure
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 13.3 Wire inline hints into `src/client/views/GameView.svelte` cell-tap handler
    - After `onCellChange`, check if tapped cell has non-null `number` → show Hint_Number_Constraint (once per session)
    - After `onCellChange`, check if `validateGrid` returns violated rows/cols → show Hint_Adjacency_Violation with shake (once per session)
    - Wire help-tap tracking: POST to `/api/game/help-tap` on first Help icon tap per session
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 9.1, 9.2, 9.3, 9.4, 11.1_

- [x] 14. Update AnalyticsDashboard for DQ rendering
  - [x] 14.1 Update `src/client/components/AnalyticsDashboard.svelte` for null metrics and DQ badges
    - Render `null` metric values as `—` (not `0.0%` or `NaN%`)
    - Show small "DQ" badge on rolling metric tiles when value is `null`
    - Show "DQ" badge on daily table rows where `dq.firstActionMissing === true`
    - Filter out alerts whose `ruleId` is in `dqSuppressedRuleIds`
    - Show non-alarming notice "{N} rules suppressed due to data quality" when applicable
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement daily mention scheduler hook
  - [x] 16.1 Add mention step to `daily-puzzle` handler in `src/server/index.ts`
    - Only run at 16:00 UTC (check `new Date().getUTCHours() === 16`)
    - Compute `Daily_Mention_Batch` using `computeDailyMentionBatch`
    - For each user in batch: `tryMarkUserMentioned` → `fetchUsername` → `readUserStreak` → `buildMentionCommentText` → `reddit.submitComment`
    - On per-user failure: log error, continue processing remaining users
    - Entire mention block is non-blocking (try/catch around the whole step)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_

  - [x] 16.2 Write property test for mention scheduler idempotence (Property 11)
    - **Property 11: Mention Scheduler Idempotence**
    - For all batch sets B and users U in B, the count of comments posted for U on date D is exactly 1 regardless of scheduler run count
    - **Validates: Requirements 15.9, 15.10, 15.11**

  - [x] 16.3 Write unit tests for scheduler mention integration
    - Test mention step only runs at 16:00 UTC
    - Test dedup key prevents double-mention
    - Test user not in opt-in set is not mentioned
    - Test user not in yesterday completers is not mentioned
    - Test comment failure does not block remaining users
    - _Requirements: 15.1, 15.4, 15.5, 15.7, 15.8_

- [x] 17. Final checkpoint - Ensure all tests pass
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
- The `computeDailyMentionBatch` function is pure and deterministic, making it ideal for property-based testing
- No changes to `devvit.json` — the existing `daily-puzzle` cron at `0 16,20 * * *` is reused
- No historical backfill — the DQ flag retroactively neutralizes false alerts for affected dates

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "5.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "3.4", "3.5", "3.6", "5.2", "5.3", "5.4", "6.2", "6.3"] },
    { "id": 3, "tasks": ["7.1", "8.1", "8.2", "8.3"] },
    { "id": 4, "tasks": ["7.2", "7.3", "7.4", "8.4", "8.5"] },
    { "id": 5, "tasks": ["10.1", "11.1", "11.2"] },
    { "id": 6, "tasks": ["10.2", "10.3", "11.3", "12.1", "12.2", "12.3"] },
    { "id": 7, "tasks": ["13.1", "13.2", "13.3", "14.1"] },
    { "id": 8, "tasks": ["16.1"] },
    { "id": 9, "tasks": ["16.2", "16.3"] }
  ]
}
```
