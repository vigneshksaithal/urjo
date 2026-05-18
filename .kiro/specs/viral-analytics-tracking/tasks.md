# Implementation Plan: Viral Analytics Tracking

## Overview

Extend Urjo's analytics system with viral loop measurement: share rate, cycle time, per-channel attribution, enhanced K-factor, rolling viral metrics, and a markdown export button. Implementation follows the existing Hono + Redis + Svelte 5 architecture, adding a new `viral-tracker.ts` server module, extending shared types, and adding a client-side markdown exporter.

## Tasks

- [x] 1. Define shared types and constants for viral metrics
  - [x] 1.1 Extend `src/shared/growth-types.ts` with viral metric types
    - Add `InviteChannel` type (`'challenge_post' | 'result_comment' | 'result_copy'`)
    - Add `ChannelMetrics` type (`{ opens: number; conversions: number; conversionRate: number | null }`)
    - Add `PerChannelMetrics` type (one `ChannelMetrics` per `InviteChannel`)
    - Extend `GrowthLoopMetrics` with `shareRate: number | null`, `viralCycleTimeHours: number | null`, `perChannelMetrics: PerChannelMetrics | null`
    - Extend `RollingMetrics` with `shareRate7d: number | null`, `kFactor7d: number | null`, `viralCycleTimeHours7d: number | null`
    - _Requirements: 1.3, 2.4, 3.5, 4.3, 5.1, 5.2, 5.3, 9.1, 9.4_

  - [x] 1.2 Add `k_factor_viral` scale rule to `src/shared/growth-constants.ts`
    - Add a new scale rule with id `k_factor_viral`, metric `kFactor7d`, threshold `1.0`, comparison `above`, and appropriate message
    - _Requirements: 4.4_

- [x] 2. Implement viral tracker pure computation functions
  - [x] 2.1 Create `src/server/lib/viral-tracker.ts` with pure computation functions
    - Implement `computeShareRate(completers: number, sharers: number): number | null` — returns `sharers / completers` when completers > 0, null otherwise, clamped to [0, 1]
    - Implement `computeMedian(values: readonly number[]): number | null` — returns median for non-empty arrays, null for empty
    - Implement `computeConversionRate(opens: number, conversions: number): number | null` — returns `conversions / opens` when opens > 0, null otherwise
    - Implement `computeViralRollingAverage(values: readonly (number | null)[]): number | null` — returns null when fewer than 3 non-null values, arithmetic mean of non-null values otherwise
    - _Requirements: 1.3, 1.4, 2.4, 2.5, 3.4, 3.6, 5.1, 5.4, 5.5_

  - [ ]* 2.2 Write property test for share rate computation
    - **Property 2: Share Rate Computation**
    - **Validates: Requirements 1.3, 1.4**

  - [ ]* 2.3 Write property test for median cycle time computation
    - **Property 3: Median Cycle Time Computation**
    - **Validates: Requirements 2.4, 2.5**

  - [ ]* 2.4 Write property test for conversion rate computation
    - **Property 6: Conversion Rate Computation**
    - **Validates: Requirements 3.4, 3.6**

  - [ ]* 2.5 Write property test for rolling average with minimum threshold
    - **Property 8: Rolling Average with Minimum Threshold**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

- [x] 3. Implement viral tracker Redis recording functions
  - [x] 3.1 Add Redis recording functions to `src/server/lib/viral-tracker.ts`
    - Implement `recordCompleter(date, userId)` — adds userId to `viral:{date}:completers` sorted set (deduplication via set membership)
    - Implement `recordSharer(date, userId)` — adds userId to `viral:{date}:sharers` sorted set with dedup key `viral:dedup:share:{date}:{userId}` (48h TTL)
    - Implement `recordChallengeCreation(date, postId, timestampMs)` — stores timestamp at `viral:challenge:{postId}:created_at` with 48h TTL
    - Implement `recordCycleTime(date, elapsedSeconds)` — adds to `viral:{date}:cycle_times` sorted set, enforces 172800s cap and 200-member cardinality limit, 48h TTL
    - Implement `recordAttribution(userId, channel)` — stores first-touch attribution at `viral:attribution:{userId}` with NX semantics (90-day TTL)
    - Implement `recordChannelOpen(date, channel)` — increments `viral:{date}:channel:{channel}:opens` counter (90-day TTL)
    - Implement `recordChannelConversion(date, channel)` — increments `viral:{date}:channel:{channel}:conversions` counter (90-day TTL)
    - Implement `getChallengeCreationTimestamp(postId)` — reads creation timestamp
    - Implement `getAttribution(userId)` — reads first-touch attribution channel
    - All keys prefixed with `viral:` namespace
    - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.6, 2.7, 3.1, 3.2, 3.3, 3.7, 3.8, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 3.2 Write property test for deduplication invariant
    - **Property 1: Deduplication Invariant**
    - **Validates: Requirements 1.1, 1.2**

  - [ ]* 3.3 Write property test for cycle time cap invariant
    - **Property 4: Cycle Time Cap Invariant**
    - **Validates: Requirements 2.7**

  - [ ]* 3.4 Write property test for first-touch attribution immutability
    - **Property 5: First-Touch Attribution Immutability**
    - **Validates: Requirements 3.7**

  - [ ]* 3.5 Write property test for bounded cardinality invariant
    - **Property 9: Bounded Cardinality Invariant**
    - **Validates: Requirements 6.4, 6.5**

  - [ ]* 3.6 Write property test for viral key namespace invariant
    - **Property 10: Viral Key Namespace Invariant**
    - **Validates: Requirements 6.6**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Integrate viral tracker into game routes
  - [x] 5.1 Modify `src/server/routes/game.ts` to call viral tracker on events
    - On `POST /api/game/complete`: call `recordCompleter(date, userId)` for all completions; for challenge posts where user is a new player (totalSolves === 0), compute elapsed time from `getChallengeCreationTimestamp` and call `recordCycleTime`; call `recordChannelConversion` if user has attribution
    - On share actions (result copy, result comment, challenge post creation): call `recordSharer(date, userId)` and `recordChannelOpen` where applicable
    - On challenge post open by new player: call `recordAttribution(userId, 'challenge_post')` and `recordChannelOpen(date, 'challenge_post')`
    - All viral tracking calls wrapped in try/catch — non-blocking, errors logged but don't affect game flow
    - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.7, 3.8_

  - [ ]* 5.2 Write unit tests for viral tracker integration in game routes
    - Test that `recordCompleter` is called on puzzle completion
    - Test that `recordSharer` is called on share actions
    - Test that cycle time is computed and recorded for new player challenge completions
    - Test that attribution is recorded for new players on challenge posts
    - Test that viral tracking errors don't block game flow
    - _Requirements: 1.1, 1.2, 2.2, 3.1_

- [x] 6. Integrate viral metrics into dashboard computation
  - [x] 6.1 Modify `src/server/lib/dashboard.ts` to compute viral metrics
    - Read viral counters (completers ZCARD, sharers ZCARD, cycle times, channel counters) during `computeDashboard`
    - Compute `shareRate` using `computeShareRate`
    - Compute `viralCycleTimeHours` from median cycle time (seconds → hours)
    - Compute `perChannelMetrics` for each `InviteChannel` using `computeConversionRate`
    - Compute rolling viral averages (`shareRate7d`, `kFactor7d`, `viralCycleTimeHours7d`) using `computeViralRollingAverage`
    - Add `k_factor_viral` scale alert evaluation when `kFactor7d > 1.0`
    - Ensure all new fields are `null` (not `undefined`) when data is missing
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 6.2 Write unit tests for viral dashboard computation
    - Test that viral metrics appear in dashboard response with correct structure
    - Test backward compatibility — existing fields unchanged
    - Test null handling when viral data is missing
    - Test K-factor viral alert triggers when rolling average > 1.0
    - Test rolling average returns null with fewer than 3 data points
    - _Requirements: 4.4, 5.4, 9.4, 9.5_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement markdown export client module
  - [x] 8.1 Create `src/client/lib/markdown-export.ts`
    - Implement `formatMetricValue(value: number | null, type: 'percent' | 'hours' | 'number'): string` — formats percentages to 1 decimal ("42.7%"), hours to 1 decimal ("3.2h"), numbers as-is, null as "—"
    - Implement `generateMarkdownSnapshot(dashboards, rolling, phase): string` — produces GFM markdown with: level-1 heading with "Urjo" and YYYY-MM-DD date, phase context line, rolling averages summary, pipe-delimited table (Date, Opens, Actions, Completions, 1st Act%, Compl%, D1 Ret%, Share%, K, Cycle), and legend section
    - Implement `copyToClipboard(text: string): Promise<boolean>` — tries `navigator.clipboard.writeText`, falls back to textarea + `execCommand('copy')`, returns success boolean
    - _Requirements: 7.2, 7.3, 7.4, 7.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 8.2 Write property test for markdown snapshot completeness
    - **Property 11: Markdown Snapshot Completeness**
    - **Validates: Requirements 7.2, 7.3, 7.4, 8.1, 8.3, 8.4, 8.5, 8.6**

  - [ ]* 8.3 Write unit tests for markdown export
    - Test `formatMetricValue` for each type (percent, hours, number, null)
    - Test `generateMarkdownSnapshot` produces valid GFM table structure
    - Test legend section is present with column definitions
    - Test null values render as "—"
    - _Requirements: 8.3, 8.4, 8.5, 8.6_

- [x] 9. Add copy button to AnalyticsDashboard component
  - [x] 9.1 Modify `src/client/components/AnalyticsDashboard.svelte`
    - Add "Copy to Clipboard" button in the header between Refresh and Close buttons
    - Wire button click to call `generateMarkdownSnapshot` then `copyToClipboard`
    - Show success state (checkmark icon) for 2 seconds on successful copy
    - Show error state for 2 seconds if both clipboard methods fail
    - Disable button when `dashboards` array is empty
    - _Requirements: 7.1, 7.2, 7.5, 7.7, 7.8_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All viral tracking is non-blocking — errors are caught and logged without affecting game flow
- The design uses TypeScript throughout; no language selection needed
- Property tests use `fast-check` library with Vitest (minimum 100 iterations per property)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "5.1"] },
    { "id": 4, "tasks": ["5.2", "6.1"] },
    { "id": 5, "tasks": ["6.2", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "9.1"] }
  ]
}
```
