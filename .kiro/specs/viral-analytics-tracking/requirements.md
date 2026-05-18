# Requirements Document

## Introduction

Viral analytics tracking for the Urjo puzzle game on Reddit/Devvit. The goal is to measure every step of the viral loop — from a user completing a puzzle, to sharing/challenging, to a new user arriving and converting — so that bottlenecks can be identified and optimized. Additionally, a markdown export button in the existing Analytics Dashboard allows moderators to copy 14-day metrics for pasting into AI analysis tools.

The system must operate within Devvit platform constraints: Redis-only storage, no external analytics services, and storage-efficient design (rollups, TTLs, sampling) since the majority of Redis budget is allocated to leaderboards.

## Glossary

- **Viral_Tracker**: The server-side module responsible for recording viral loop events and computing viral metrics
- **Dashboard_Exporter**: The client-side component that formats and copies dashboard metrics as markdown to the clipboard
- **K_Factor**: The viral coefficient calculated as invites_per_user × conversion_rate, measuring organic growth potential
- **Share_Rate**: The proportion of puzzle completers who trigger at least one share action (result copy, result comment, or challenge post) on a given day
- **Viral_Cycle_Time**: The median elapsed time (in hours) between a challenge post being created and a new player completing that challenge
- **Attribution**: The mapping of a new player's first engagement back to the specific challenge post or share that brought them
- **Invite_Channel**: A distinct mechanism through which existing users expose the game to potential new users (result comment, challenge post, result copy)
- **Conversion_Rate**: The proportion of users who open a challenge post and subsequently complete the puzzle
- **Rolling_Window**: A 7-day sliding window used for smoothing daily metric fluctuations
- **Markdown_Snapshot**: A formatted markdown string containing 14-day metrics suitable for pasting into external tools

## Requirements

### Requirement 1: Track Share Rate

**User Story:** As a moderator, I want to see what percentage of completers share the game, so that I can identify whether the share step is a bottleneck in the viral loop.

#### Acceptance Criteria

1. WHEN a user completes a puzzle on a given UTC day, THE Viral_Tracker SHALL add that user's ID to the set of potential sharers for that day, deduplicated so each user is counted at most once per day regardless of how many puzzles they complete
2. WHEN a user triggers any share action (result copy, result comment, or challenge post) on a given UTC day, THE Viral_Tracker SHALL add that user's ID to the set of actual sharers for that day, deduplicated so each user is counted at most once per day regardless of how many share actions they perform or which share action types they use
3. WHEN the Share_Rate for a given day is requested, THE Viral_Tracker SHALL compute it as the count of distinct actual sharers divided by the count of distinct completers for that day, returned as a decimal ratio between 0.0 and 1.0 (inclusive)
4. IF the completer count for a day is zero, THEN THE Viral_Tracker SHALL return null for Share_Rate rather than dividing by zero
5. IF a user triggers a share action on a given day but has not completed a puzzle on that same day, THEN THE Viral_Tracker SHALL still record them as an actual sharer for that day

### Requirement 2: Track Viral Cycle Time

**User Story:** As a moderator, I want to know how quickly the viral loop completes (from share to new player conversion), so that I can optimize for faster loops.

#### Acceptance Criteria

1. WHEN a challenge post is created, THE Viral_Tracker SHALL record the creation timestamp in milliseconds associated with that challenge post identifier
2. WHEN a new player (totalSolves equals 0 at time of completion) completes a puzzle on a challenge post, THE Viral_Tracker SHALL compute the elapsed time in seconds between the challenge post creation timestamp and the completion timestamp
3. IF the challenge post creation timestamp is unavailable when a new player completes a challenge, THEN THE Viral_Tracker SHALL discard that completion from the elapsed time dataset
4. WHEN the moderator requests Viral_Cycle_Time for a given UTC calendar day, THE Viral_Tracker SHALL return the median of all elapsed times recorded for completions that occurred on that day
5. IF no new player challenge completions with valid elapsed times occur on a given UTC calendar day, THEN THE Viral_Tracker SHALL return null for Viral_Cycle_Time
6. THE Viral_Tracker SHALL store elapsed times in a sorted set keyed by UTC calendar day with a 48-hour TTL to bound storage usage
7. THE Viral_Tracker SHALL cap individual elapsed times at 172800 seconds (48 hours), discarding any elapsed time that exceeds this threshold

### Requirement 3: Track Per-Channel Invite Attribution

**User Story:** As a moderator, I want to see which share channels (result comments, challenge posts, result copies) drive the most new player conversions, so that I can invest in the highest-performing channels.

#### Acceptance Criteria

1. WHEN a new player (totalSolves equals 0) opens a challenge post for the first time, THE Viral_Tracker SHALL attribute that open to the "challenge_post" Invite_Channel and record the channel as that player's first-touch attribution source
2. WHEN a new player (totalSolves equals 0) opens a daily puzzle post that contains a result comment for the first time, THE Viral_Tracker SHALL attribute that open to the "result_comment" Invite_Channel, provided the player has no prior first-touch attribution
3. WHEN a new player completes their first puzzle after being attributed to an Invite_Channel, THE Viral_Tracker SHALL increment the conversion counter for that player's first-touch Invite_Channel for the current UTC day
4. THE Viral_Tracker SHALL compute Conversion_Rate per Invite_Channel as conversions divided by opens for that channel on a given UTC day, expressed as a decimal between 0 and 1
5. THE Viral_Tracker SHALL expose per-channel metrics (opens, conversions, conversion rate) for each of the 3 Invite_Channels ("challenge_post", "result_comment", "result_copy") in the GET /api/analytics/daily growth metrics response
6. IF opens for a channel on a given UTC day is zero, THEN THE Viral_Tracker SHALL return null for that channel's Conversion_Rate instead of dividing by zero
7. THE Viral_Tracker SHALL attribute each new player to at most one Invite_Channel using first-touch logic: the first channel interaction recorded for that player is permanent and subsequent channel exposures SHALL NOT change the attribution
8. WHEN a new player opens a post after copying a result card shared via "result_copy" and no prior first-touch attribution exists, THE Viral_Tracker SHALL attribute that open to the "result_copy" Invite_Channel

### Requirement 4: Compute Enhanced K-Factor

**User Story:** As a moderator, I want an accurate K-factor that accounts for all invite channels and their conversion rates, so that I can track whether the game is achieving viral growth (K > 1).

#### Acceptance Criteria

1. THE Viral_Tracker SHALL compute K_Factor as: (challenge posts created per completer) × (new player challenge completions per challenge post) × (D1 retention rate of new players acquired via challenges), returning 0 when completions or challenge posts equal 0
2. THE Viral_Tracker SHALL compute Share_Rate as the ratio of total share actions (challenge posts created plus result comments) to total completions for the given date, and Viral_Cycle_Time as the number of calendar days between a challenge post creation date and the median first-completion date of new players on that challenge post
3. THE Viral_Tracker SHALL include K_Factor, Share_Rate, and Viral_Cycle_Time in the GrowthLoopMetrics object returned by the `GET /api/analytics/daily` and `GET /api/analytics/dashboard` endpoints
4. WHEN the 7-day rolling average of K_Factor exceeds 1.0, THE Viral_Tracker SHALL include a scale alert with type "scale" and rule ID "k_factor_viral" in the dashboard alerts array
5. THE Viral_Tracker SHALL store the computed K_Factor for each date as part of the daily metrics in Redis under the key `dashboard:{date}` with a 90-day TTL
6. IF fewer than 7 days of K_Factor data are available for the rolling window, THEN THE Viral_Tracker SHALL compute the rolling average using only the available days and indicate the sample size in the dashboard response

### Requirement 5: Add Rolling Viral Metrics

**User Story:** As a moderator, I want 7-day rolling averages for viral metrics, so that I can distinguish trends from daily noise.

#### Acceptance Criteria

1. THE Viral_Tracker SHALL compute a 7-day rolling average for Share_Rate by taking the arithmetic mean of non-null Share_Rate values from the most recent 7 calendar days ending on the current day
2. THE Viral_Tracker SHALL compute a 7-day rolling average for K_Factor by taking the arithmetic mean of non-null K_Factor values from the most recent 7 calendar days ending on the current day
3. THE Viral_Tracker SHALL compute a 7-day rolling average for Viral_Cycle_Time by taking the arithmetic mean of non-null Viral_Cycle_Time values from the most recent 7 calendar days ending on the current day
4. IF fewer than 3 non-null daily values exist within the Rolling_Window for a given metric, THEN THE Viral_Tracker SHALL return null for that rolling metric rather than computing from insufficient data
5. WHEN computing a rolling average, THE Viral_Tracker SHALL exclude days where the metric value is null from both the sum and the divisor count, treating them as absent rather than zero

### Requirement 6: Storage-Efficient Metric Persistence

**User Story:** As a developer, I want viral metrics to use minimal Redis storage, so that the leaderboard budget is not impacted.

#### Acceptance Criteria

1. THE Viral_Tracker SHALL use atomic Redis counters (INCRBY) for all event counts rather than storing individual event records
2. THE Viral_Tracker SHALL apply a 48-hour TTL to per-event deduplication keys (share action dedup per user per day, challenge open dedup per new player) at key creation time
3. THE Viral_Tracker SHALL apply a 90-day TTL to daily aggregate metric keys at key creation time
4. THE Viral_Tracker SHALL use sorted sets with bounded cardinality (maximum 200 members) for cycle time samples per day
5. IF the cycle time sorted set reaches 200 members for a day, THEN THE Viral_Tracker SHALL check cardinality before adding and skip recording additional samples for that day
6. THE Viral_Tracker SHALL namespace all viral metric keys with a "viral:" prefix using colon-delimited segments to avoid collision with leaderboard and other feature keys
7. THE Viral_Tracker SHALL consume no more than 1 MB of total Redis storage under peak load (1000 daily active users, 90 days of retained aggregates, and 6000 concurrent deduplication keys)

### Requirement 7: Markdown Export Button

**User Story:** As a moderator, I want to copy 14-day analytics as markdown with one click, so that I can paste it into AI tools for analysis without manual formatting.

#### Acceptance Criteria

1. THE Dashboard_Exporter SHALL render a "Copy to Clipboard" button in the Analytics Dashboard header area, positioned between the existing Refresh button and Close button
2. WHEN the moderator clicks the "Copy to Clipboard" button, THE Dashboard_Exporter SHALL generate a Markdown_Snapshot containing all rows currently present in the dashboards array (up to 14 days of metrics)
3. THE Dashboard_Exporter SHALL format the Markdown_Snapshot as a markdown table with columns matching the existing 14-Day Table: Date, Opens, First Actions, Completions, First Action %, Completion %, D1 Return %, and K-Factor
4. THE Dashboard_Exporter SHALL include a summary section above the table containing the 7-day rolling averages currently displayed in the Overview tab: DQE, First Action Rate, Completion Rate, and D1 Return Rate, each formatted as "Label: value"
5. WHEN the clipboard write operation succeeds, THE Dashboard_Exporter SHALL display a visual confirmation by changing the button icon or label to indicate success for 2 seconds, then revert to the default state
6. IF the Clipboard API (navigator.clipboard.writeText) is unavailable or the write operation rejects, THEN THE Dashboard_Exporter SHALL fall back to creating a temporary off-screen textarea element, selecting its content, executing document.execCommand('copy'), and removing the element
7. IF both the Clipboard API and the textarea fallback fail, THEN THE Dashboard_Exporter SHALL display an error indication on the button for 2 seconds informing the moderator that copying failed
8. IF the dashboards array is empty when the button is clicked, THEN THE Dashboard_Exporter SHALL keep the button disabled and not attempt a copy operation

### Requirement 8: Markdown Export Format

**User Story:** As a moderator, I want the exported markdown to be self-contained and AI-friendly, so that I can paste it directly into an AI editor without additional context.

#### Acceptance Criteria

1. THE Dashboard_Exporter SHALL include a level-1 markdown heading containing the game name "Urjo" and the export date in ISO 8601 format (YYYY-MM-DD) as the first line of the Markdown_Snapshot
2. THE Dashboard_Exporter SHALL include the current roadmap phase number, phase label, and day number in a context line immediately below the heading
3. THE Dashboard_Exporter SHALL format percentages to one decimal place (e.g., "42.7%") and cycle times to one decimal place in hours (e.g., "3.2h")
4. THE Dashboard_Exporter SHALL represent null or missing values as "—" in the markdown table
5. THE Dashboard_Exporter SHALL produce the markdown table using pipe-delimited syntax with a header separator row (e.g., "|---|") conforming to GitHub Flavored Markdown (GFM) specification
6. THE Dashboard_Exporter SHALL include a legend section below the table that defines each column abbreviation (Share Rate, K-Factor, Cycle Time, D1 Return) in one line each, so that an AI reader can interpret the metrics without external context

### Requirement 9: Viral Metrics API Endpoint

**User Story:** As a developer, I want viral metrics exposed through the existing analytics API, so that the dashboard can display them without a separate endpoint.

#### Acceptance Criteria

1. THE Viral_Tracker SHALL extend the existing GrowthLoopMetrics type to include shareRate (number | null, representing the ratio of users who shared out of total completers, range 0.0 to 1.0), viralCycleTimeHours (number | null, representing the median hours between a share event and a new user's first completion sourced from that share), and perChannelMetrics (object | null with one key per sharing channel — "challenge" and "resultCopy" — each containing impressions: number, conversions: number, and conversionRate: number | null in range 0.0 to 1.0)
2. WHEN the /api/analytics/dashboard endpoint is called, THE Viral_Tracker SHALL include the extended viral metrics nested within the daily.growth field of each day's DashboardData object in the response array, preserving all existing GrowthLoopMetrics fields unchanged
3. THE Viral_Tracker SHALL compute viral metrics on-demand during the dashboard request by deriving values from the same Redis keys used for daily metrics, completing computation within 2000 milliseconds for the full 14-day response
4. IF any viral metric cannot be computed due to missing data, THEN THE Viral_Tracker SHALL return null for that specific field while still including the field key in the response object, so that existing consumers parsing the GrowthLoopMetrics type do not encounter undefined keys
5. WHEN the /api/analytics/dashboard endpoint is called, THE Viral_Tracker SHALL return a response whose top-level structure (status, data array of DashboardData objects with date, daily, rolling, alerts, currentPhase, seasonParticipants fields) remains identical to the pre-extension schema, ensuring backward compatibility with existing dashboard consumers
