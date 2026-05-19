# Requirements Document

## Introduction

This document defines the requirements for adding social viral mechanics to Urjo, a binary color-fill puzzle game running as a Devvit app on Reddit. The goal is to achieve a viral coefficient (K-factor) > 0.5 by introducing synchronous racing, social presence indicators, a simplified completion screen with a single social CTA, and custom post previews for feed engagement.

The core viral loop: completion → one-tap challenge post → feed preview with social proof → new player opens → plays → completes → creates their own challenge.

## Glossary

- **K-factor**: Viral coefficient measuring how many new users each existing user generates (K = invites × conversion rate). K > 1 = exponential growth.
- **Race session**: A time-limited competitive instance where two players solve the same puzzle simultaneously.
- **Presence**: Real-time indicator of how many players are currently active on a post.
- **Custom post preview**: A Devvit blocks-based visual rendered in the Reddit feed before a user opens the post.
- **CTA**: Call to action — a button prompting the user to take a specific action.
- **TTL**: Time to live — automatic expiration of Redis keys after a set duration.

## Requirements

### Requirement 1: Race Matchmaking

**User Story:** As a player who just completed a puzzle, I want to race against another player solving the same puzzle so that I feel social pressure and competition that makes the game more engaging.

#### Acceptance Criteria
- When a player taps "Race", the system checks for a waiting opponent in the queue for that post and grid size.
- If no opponent is queued, the player is added to the queue with a 30-second TTL and receives a "waiting" status with a sessionId.
- If an opponent is already queued (different userId), both players are matched into a race session and receive a "matched" status with the same sessionId and identical puzzle.
- A player cannot be matched with themselves (self-match prevention).
- A player already in an active race session receives an "already_racing" status with their existing sessionId.
- Queue entries auto-expire after 30 seconds if no match is found.
- The race queue is scoped by postId and gridSize (Redis key: `race:queue:{postId}:{gridSize}`).
- A player queued for a 4×4 puzzle is never matched with a player queued for a 6×6 puzzle.

### Requirement 2: Race Session Lifecycle

**User Story:** As a player in a race, I want to see my opponent's progress in real-time and know who won so that the competition feels live and exciting.

#### Acceptance Criteria
- When two players are matched, the server creates a race session as a Redis hash (`race:{postId}:{sessionId}`) with a 5-minute TTL containing both player IDs, identical puzzle data, status, timestamps, progress, and winnerId.
- The client polls `GET /api/race/status/{sessionId}` every 2 seconds receiving: race status (waiting/racing/finished/expired/opponent_left), opponent progress (0-100), and opponent time if finished.
- If the session TTL has elapsed, the poll returns `{ status: 'expired' }`.
- If the opponent hasn't updated progress in 30+ seconds, the poll returns `{ status: 'opponent_left' }`.
- When a player completes the puzzle, `POST /api/race/complete/{sessionId}` records their server-validated time.
- If both players have completed, the winner is the player with the lowest time; status becomes 'finished'.
- If only one player completed, status remains 'racing' with `waitingForOpponent: true`.
- Calling complete twice for the same player is idempotent.
- Race session hash, active race markers, and queue entries all auto-expire via TTL with no permanent storage growth.

### Requirement 3: Race UI

**User Story:** As a player, I want clear visual feedback during matchmaking, racing, and results so that the race experience feels polished and competitive.

#### Acceptance Criteria
- While waiting for a match, the client displays "Searching for opponent..." with a 30-second countdown timer and a cancel button.
- If the timer reaches 0 with no match, UI shows "No opponents found — play solo?" with re-queue and solo options.
- During an active race, the client displays the opponent's progress bar (updated every 2s), opponent username, and a pulsing "racing" indicator.
- The player's puzzle board remains fully interactive during the race.
- When a race finishes, the winner sees "You won! 🏆" with both times; the loser sees "Close one!" with both times.
- Primary CTA after a race win is "Race Again" (re-queue); after a loss is "Challenge Friends" (create challenge post).
- Race completion awards coins, streak, and season points as normal.

### Requirement 4: Social Presence

**User Story:** As a player browsing a puzzle post, I want to see how many other players are active right now so that I feel social pressure and FOMO to play.

#### Acceptance Criteria
- The client sends a presence heartbeat (`POST /api/presence/heartbeat`) every 15 seconds while on a post, starting on load and stopping on navigation away.
- Server records heartbeats via ZADD to `presence:{postId}` sorted set (score = timestamp) and prunes entries older than 60 seconds.
- The sorted set has a 5-minute TTL for auto-cleanup on inactive posts.
- Heartbeat response returns: `activeCount`, `players` array (max 10 with userId, username, isRacing), and `racingCount`.
- `isRacing` is true if `user:{userId}:activeRace` key exists.
- Client displays: "👥 {activeCount} here · ⚡ {racingCount} racing" (or without racing part if 0).
- Presence indicator is visible during gameplay, not just on first screen.
- Presence is non-blocking — failures are silently ignored and gameplay continues.

### Requirement 5: Simplified Completion Screen

**User Story:** As a player who just completed a puzzle, I want a clear single action to take so that I'm not overwhelmed by choices and am more likely to share my result.

#### Acceptance Criteria
- The completion overlay displays exactly one primary CTA: "Challenge Friends" (default), "Race Again" (after race win), or "View Challenge" (if already challenged).
- Primary button uses full-width, bold styling with high contrast.
- One secondary action ("Next Puzzle") is visible below the primary with ghost/outline styling.
- All other actions (comment result, notify toggle, subscribe, missions, achievements, profile, season) are accessible only via a "More" menu button.
- "More" expands a panel with remaining actions in a grid layout (max 6 items), collapsible by tapping again.
- The result card (emoji grid + stats) is shown above CTAs as a compact, non-interactive preview.
- The "Comment Result" action is moved from a standalone button to the "More" menu.

### Requirement 6: Custom Post Preview

**User Story:** As a Reddit user scrolling my feed, I want to see an engaging preview of the puzzle post (with social proof and a challenge) so that I'm compelled to open it and play.

#### Acceptance Criteria
- When a challenge post is created, `setCustomPostPreview` renders a Devvit blocks preview showing: challenger username, completion time, grid size, puzzle grid visual, "Can you beat it?" text, and "{N} attempts · {M} beaten" stats.
- When a daily puzzle post is created, `setCustomPostPreview` renders: "Urjo Puzzle #{number}", grid size, "{N} players today" count, partial puzzle grid visual, and "Play now" text.
- Preview is rendered using Devvit blocks (not webview) for instant feed loading.
- Preview updates when a challenge is beaten for the first time or a new fastest time is set.
- Preview updates are non-blocking and deduped (at most once per state change).

### Requirement 7: Race Analytics Integration

**User Story:** As the game developer, I want race events tracked in the analytics system so that I can measure whether racing improves K-factor and engagement.

#### Acceptance Criteria
- `trackRaceJoin(date, postId, userId)` is called when a player joins the race queue.
- `trackRaceMatch(date, postId, sessionId)` is called when two players are matched.
- `trackRaceComplete(date, postId, sessionId, winnerId)` is called when a race finishes.
- Race completions count toward existing completion metrics (DQE, completion rate).
- Race-originated challenge posts are attributed to the 'race' channel in viral tracking.
- Analytics dashboard displays: races started, races completed, race win rate, average race duration.
- Race metrics appear in the 14-day table as additional columns (only when data exists) and are included in the markdown clipboard export.

### Requirement 8: Storage Efficiency

**User Story:** As the game developer, I want all social features to use ephemeral storage with TTLs so that Redis storage limits are not exceeded and the game leaderboard retains priority.

#### Acceptance Criteria
- Race sessions use 300s TTL; queue entries use 30s TTL; active race markers use 300s TTL.
- Presence sorted sets use 300s TTL on the set with 60s stale threshold for members.
- No new sorted sets or hashes without TTLs are introduced by this feature.
- Peak storage from race + presence features does not exceed 200KB across all active posts (race: ~25KB, presence: ~100KB, queues: negligible).
