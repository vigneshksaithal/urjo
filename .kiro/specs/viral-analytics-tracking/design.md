# Design Document: Viral Analytics Tracking

## Overview

This design extends Urjo's existing analytics system with viral loop measurement capabilities. The feature adds three server-side modules and one client-side utility:

1. **Viral Tracker** (`src/server/lib/viral-tracker.ts`) — Records share events, cycle times, and channel attributions using Redis atomic counters and sorted sets, all namespaced under `viral:`.
2. **Viral Metrics Computation** (integrated into `src/server/lib/analytics.ts` and `src/server/lib/dashboard.ts`) — Computes share rate, K-factor, cycle time, and per-channel conversion rates on-demand during dashboard requests.
3. **Rolling Viral Metrics** (extension of `computeDashboard`) — Adds 7-day rolling averages for viral metrics with a minimum-3-day data quality threshold.
4. **Markdown Exporter** (`src/client/lib/markdown-export.ts`) — Pure function that formats dashboard data as a GFM markdown snapshot for clipboard copy.

The design preserves backward compatibility with existing API consumers by extending (not replacing) the `GrowthLoopMetrics` type and keeping the `DashboardData` top-level structure unchanged.

## Architecture

```mermaid
flowchart TD
    subgraph Client ["Client (Svelte 5)"]
        AD[AnalyticsDashboard.svelte]
        ME[markdown-export.ts]
        AD -->|"Copy button click"| ME
        ME -->|"Clipboard API / fallback"| CB[Clipboard]
    end

    subgraph Server ["Server (Hono)"]
        GR[game.ts routes]
        AR[analytics.ts routes]
        VT[viral-tracker.ts]
        AN[analytics.ts lib]
        DB[dashboard.ts lib]

        GR -->|"on complete/share/challenge"| VT
        AR -->|"GET /api/analytics/dashboard"| DB
        DB -->|"reads viral metrics"| VT
        DB -->|"reads funnel metrics"| AN
    end

    subgraph Storage ["Redis"]
        VC[viral:* counters]
        VS[viral:* sorted sets]
        VD[viral:* dedup keys]
        DK[dashboard:{date}]
    end

    VT --> VC
    VT --> VS
    VT --> VD
    DB --> DK
```

**Data Flow for Viral Event Recording:**
1. User completes puzzle → `POST /api/game/complete` handler calls `viralTracker.recordCompletion(date, userId)`
2. User shares (copy/comment/challenge) → existing tracking functions additionally call `viralTracker.recordShare(date, userId, channel)`
3. New player opens challenge → `viralTracker.recordChallengeAttribution(userId, postId, channel)`

**Data Flow for Dashboard Read:**
1. `GET /api/analytics/dashboard` → `computeDashboard(date)` → reads viral counters → computes viral metrics → includes in `GrowthLoopMetrics`

## Components and Interfaces

### New Module: `src/server/lib/viral-tracker.ts`

```typescript
// ─── Public API ────────────────────────────────────────────────────────────────

/** Record a user as a completer for share rate calculation */
export const recordCompleter = async (date: string, userId: string): Promise<void>

/** Record a user as a sharer (any channel) for share rate calculation */
export const recordSharer = async (date: string, userId: string): Promise<void>

/** Record a challenge post creation timestamp */
export const recordChallengeCreation = async (date: string, postId: string, timestampMs: number): Promise<void>

/** Record a new player's cycle time (elapsed seconds from challenge creation to completion) */
export const recordCycleTime = async (date: string, elapsedSeconds: number): Promise<void>

/** Record first-touch attribution for a new player */
export const recordAttribution = async (userId: string, channel: InviteChannel): Promise<void>

/** Record a channel open event for conversion rate */
export const recordChannelOpen = async (date: string, channel: InviteChannel): Promise<void>

/** Record a channel conversion event */
export const recordChannelConversion = async (date: string, channel: InviteChannel): Promise<void>

/** Get the creation timestamp for a challenge post */
export const getChallengeCreationTimestamp = async (postId: string): Promise<number | null>

/** Get the first-touch attribution channel for a user (null if unattributed) */
export const getAttribution = async (userId: string): Promise<InviteChannel | null>

// ─── Pure Computation Functions ────────────────────────────────────────────────

/** Compute share rate from completer and sharer counts */
export const computeShareRate = (completers: number, sharers: number): number | null

/** Compute median from a sorted array of numbers */
export const computeMedian = (values: readonly number[]): number | null

/** Compute conversion rate from opens and conversions */
export const computeConversionRate = (opens: number, conversions: number): number | null

/** Compute rolling average with minimum-3-day threshold */
export const computeViralRollingAverage = (values: readonly (number | null)[]): number | null
```

### New Type: `InviteChannel`

```typescript
export type InviteChannel = 'challenge_post' | 'result_comment' | 'result_copy'
```

### Extended Type: `GrowthLoopMetrics`

```typescript
// Added fields (all nullable for backward compat)
export type GrowthLoopMetrics = {
    // ... existing fields unchanged ...
    shareRate: number | null
    viralCycleTimeHours: number | null
    perChannelMetrics: PerChannelMetrics | null
}

export type PerChannelMetrics = {
    challenge_post: ChannelMetrics
    result_comment: ChannelMetrics
    result_copy: ChannelMetrics
}

export type ChannelMetrics = {
    opens: number
    conversions: number
    conversionRate: number | null
}
```

### Extended Type: `RollingMetrics`

```typescript
export type RollingMetrics = {
    // ... existing fields unchanged ...
    shareRate7d: number | null
    kFactor7d: number | null
    viralCycleTimeHours7d: number | null
}
```

### New Client Module: `src/client/lib/markdown-export.ts`

```typescript
import type { DashboardData, RollingMetrics, CurrentPhase } from '../../shared/growth-types'

/** Generate a complete markdown snapshot from dashboard data */
export const generateMarkdownSnapshot = (
    dashboards: readonly DashboardData[],
    rolling: RollingMetrics,
    phase: CurrentPhase,
): string

/** Format a single metric value for markdown display */
export const formatMetricValue = (
    value: number | null,
    type: 'percent' | 'hours' | 'number',
): string

/** Copy text to clipboard with textarea fallback */
export const copyToClipboard = async (text: string): Promise<boolean>
```

### Modified Files

| File | Change |
|------|--------|
| `src/shared/growth-types.ts` | Add `shareRate`, `viralCycleTimeHours`, `perChannelMetrics` to `GrowthLoopMetrics`; add `shareRate7d`, `kFactor7d`, `viralCycleTimeHours7d` to `RollingMetrics`; add `PerChannelMetrics`, `ChannelMetrics`, `InviteChannel` types |
| `src/server/lib/analytics.ts` | Import and call viral tracker in `readGrowthMetrics`; extend `GrowthLoopMetrics` construction |
| `src/server/lib/dashboard.ts` | Compute viral rolling averages in `computeDashboard`; add K-factor viral alert rule |
| `src/shared/growth-constants.ts` | Add `k_factor_viral` scale rule |
| `src/server/routes/game.ts` | Call viral tracker on completion, share, and challenge events |
| `src/client/components/AnalyticsDashboard.svelte` | Add "Copy to Clipboard" button in header |

## Data Models

### Redis Key Schema (all prefixed with `viral:`)

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `viral:{date}:completers` | Sorted Set | 90 days | Deduplicated completer user IDs for share rate denominator |
| `viral:{date}:sharers` | Sorted Set | 90 days | Deduplicated sharer user IDs for share rate numerator |
| `viral:{date}:cycle_times` | Sorted Set | 48 hours | Elapsed seconds as scores (member = `{userId}:{timestamp}`) for median calculation. Max 200 members. |
| `viral:challenge:{postId}:created_at` | String | 48 hours | Challenge post creation timestamp in ms |
| `viral:attribution:{userId}` | String | 90 days | First-touch invite channel for a new player |
| `viral:{date}:channel:{channel}:opens` | String (counter) | 90 days | Per-channel open count |
| `viral:{date}:channel:{channel}:conversions` | String (counter) | 90 days | Per-channel conversion count |
| `viral:dedup:share:{date}:{userId}` | String | 48 hours | Dedup flag for sharer recording |
| `viral:dedup:completer:{date}:{userId}` | String | 48 hours | Dedup flag for completer recording |
| `viral:dedup:channel_open:{date}:{channel}:{userId}` | String | 48 hours | Dedup flag for channel open |

### Storage Budget Estimate

At peak load (1000 DAU, 90 days retained):
- Completers sorted sets: 90 days × ~50 bytes/member × 1000 members = ~4.5 MB → Use counter only (8 bytes × 90 = 720 bytes)
- Sharers sorted sets: same pattern → 720 bytes
- Cycle time sorted sets: 48h retention × 200 members × 50 bytes = ~20 KB
- Challenge timestamps: ~500 active challenges × 30 bytes = ~15 KB
- Attribution keys: 1000 users × 40 bytes = ~40 KB
- Channel counters: 3 channels × 2 metrics × 90 days × 20 bytes = ~10.8 KB
- Dedup keys: 6000 concurrent × 30 bytes = ~180 KB

**Total estimated: ~260 KB** — well within the 1 MB budget.

**Design Decision:** Use sorted sets for completers/sharers (not plain counters) to enable deduplication via member uniqueness. The sorted set `ZCARD` gives the deduplicated count. Members are user IDs, scores are timestamps (for potential future analysis). This costs more than a plain counter but provides correct deduplication without separate dedup keys for the daily sets.

**Revised approach:** Actually, since sorted sets with userId as member already deduplicate (adding the same member twice just updates the score), we can skip the separate dedup keys for completers and sharers. The sorted set itself handles deduplication. We only need dedup keys for the sharer recording (to prevent multiple Redis writes on repeated share actions within the same request).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Deduplication Invariant

*For any* user ID and any number of repeated recording calls (completions or shares) on the same UTC day, the deduplicated count for that user in the corresponding sorted set SHALL be exactly 1.

**Validates: Requirements 1.1, 1.2**

### Property 2: Share Rate Computation

*For any* non-negative integer `completers` and non-negative integer `sharers`, `computeShareRate(completers, sharers)` SHALL return `sharers / completers` when `completers > 0`, and `null` when `completers === 0`. The result SHALL always be in the range [0.0, 1.0] or null.

**Validates: Requirements 1.3, 1.4**

### Property 3: Median Cycle Time Computation

*For any* non-empty sorted array of positive numbers, `computeMedian(values)` SHALL return the middle value (for odd length) or the average of the two middle values (for even length). For an empty array, it SHALL return null.

**Validates: Requirements 2.4, 2.5**

### Property 4: Cycle Time Cap Invariant

*For any* elapsed time value, if the value exceeds 172800 seconds, `recordCycleTime` SHALL not store it. The cycle time sorted set SHALL never contain a score greater than 172800.

**Validates: Requirements 2.7**

### Property 5: First-Touch Attribution Immutability

*For any* user ID and any sequence of `recordAttribution` calls with different channels, the stored attribution SHALL always equal the channel from the first call. Subsequent calls SHALL not modify the stored value.

**Validates: Requirements 3.7**

### Property 6: Conversion Rate Computation

*For any* non-negative integers `opens` and `conversions`, `computeConversionRate(opens, conversions)` SHALL return `conversions / opens` when `opens > 0`, and `null` when `opens === 0`. The result SHALL be in the range [0.0, ∞) or null (conversions can theoretically exceed opens due to timing).

**Validates: Requirements 3.4, 3.6**

### Property 7: K-Factor Formula

*For any* non-negative values `completions`, `challengePosts`, `newPlayerChallengeCompletions`, and `challengeD1RetainedShare` in [0, 1], the K-factor SHALL equal `(challengePosts / completions) × (newPlayerChallengeCompletions / challengePosts) × challengeD1RetainedShare` when both `completions > 0` and `challengePosts > 0`, and 0 otherwise.

**Validates: Requirements 4.1**

### Property 8: Rolling Average with Minimum Threshold

*For any* array of 7 nullable numeric values, `computeViralRollingAverage(values)` SHALL return null when fewer than 3 non-null values exist, and SHALL return the arithmetic mean of only the non-null values (excluding nulls from both sum and divisor) when 3 or more non-null values exist.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

### Property 9: Bounded Cardinality Invariant

*For any* number of `recordCycleTime` calls on the same UTC day, the cycle time sorted set for that day SHALL never exceed 200 members.

**Validates: Requirements 6.4, 6.5**

### Property 10: Viral Key Namespace Invariant

*For any* operation performed by the viral tracker module, all Redis keys created or accessed SHALL begin with the prefix `viral:`.

**Validates: Requirements 6.6**

### Property 11: Markdown Snapshot Completeness

*For any* non-empty array of `DashboardData` objects, `generateMarkdownSnapshot` SHALL produce output that contains: (a) a level-1 heading with "Urjo" and a date in YYYY-MM-DD format, (b) a pipe-delimited table with one data row per dashboard entry, (c) null values represented as "—", (d) percentages formatted to one decimal place, and (e) a legend section defining column abbreviations.

**Validates: Requirements 7.2, 7.3, 7.4, 8.1, 8.3, 8.4, 8.5, 8.6**

### Property 12: Null Field Presence

*For any* dashboard response where a viral metric cannot be computed, the field key SHALL be present in the response object with a value of `null`, never `undefined` or absent.

**Validates: Requirements 9.4**

## Error Handling

| Scenario | Handling |
|----------|----------|
| Redis write failure during viral event recording | Catch and log error; do not block the user's game flow. Viral tracking is non-critical. |
| Missing challenge creation timestamp on cycle time computation | Return `null` for that completion's cycle time; do not include in median dataset. |
| Cycle time exceeds 172800s cap | Discard silently — do not store or include in computation. |
| Sorted set at 200-member cap | Check `ZCARD` before `ZADD`; skip if at capacity. |
| Division by zero in rate computations | Return `null` (never throw). All rate functions handle zero denominators. |
| Clipboard API unavailable | Fall back to textarea + `execCommand('copy')`. If both fail, show error state on button for 2s. |
| Dashboard request exceeds 2000ms | Viral metrics are computed inline with existing dashboard logic; if slow, the entire dashboard response is delayed. No separate timeout — rely on Devvit's 30s request limit. |
| Empty dashboards array on export click | Button is disabled; no copy attempted. |

## Testing Strategy

### Unit Tests (Example-Based)

Located in `src/server/lib/__tests__/viral-tracker.test.ts` and `src/client/lib/__tests__/markdown-export.test.ts`:

- Attribution recording for each channel type (3.1, 3.2, 3.8)
- Challenge creation timestamp storage and retrieval (2.1)
- Clipboard fallback behavior (7.6)
- Button disabled state when dashboards empty (7.8)
- API response shape includes viral fields (9.2, 9.5)
- K-factor alert triggered when rolling average > 1.0 (4.4)

### Property-Based Tests

**Library:** [fast-check](https://github.com/dubzzz/fast-check) (already compatible with Vitest)

**Configuration:** Minimum 100 iterations per property test.

Each property test references its design document property with a tag comment:

```typescript
// Feature: viral-analytics-tracking, Property 1: Deduplication Invariant
```

**Properties to implement:**

1. **Deduplication invariant** — Generate random userIds and repeat counts; verify set cardinality is always 1 per user.
2. **Share rate computation** — Generate random (completers, sharers) pairs; verify formula and null handling.
3. **Median computation** — Generate random number arrays; verify median correctness.
4. **Cycle time cap** — Generate random elapsed times including values > 172800; verify cap enforcement.
5. **First-touch immutability** — Generate random channel sequences; verify first channel persists.
6. **Conversion rate computation** — Generate random (opens, conversions) pairs; verify formula and null handling.
7. **K-factor formula** — Generate random inputs; verify formula matches specification.
8. **Rolling average with threshold** — Generate random nullable arrays; verify null when < 3 non-null, correct mean otherwise.
9. **Bounded cardinality** — Generate > 200 cycle time events; verify set never exceeds 200.
10. **Markdown snapshot completeness** — Generate random DashboardData arrays; verify structural requirements.
11. **Null field presence** — Generate scenarios with missing data; verify null (not undefined) in response.

### Integration Tests

Located in `src/server/__tests__/viral-analytics-routes.test.ts`:

- Full dashboard endpoint returns viral metrics in correct structure
- Viral metrics are backward-compatible (existing fields unchanged)
- TTLs are correctly applied to Redis keys
- End-to-end: complete → share → dashboard shows updated share rate

### Test Organization

```
src/
├── server/lib/__tests__/
│   ├── viral-tracker.test.ts          # Unit + property tests for pure functions
│   └── viral-tracker.integration.test.ts  # Redis integration tests
├── server/__tests__/
│   └── viral-analytics-routes.test.ts # Route-level integration tests
└── client/lib/__tests__/
    └── markdown-export.test.ts        # Unit + property tests for markdown generation
```
