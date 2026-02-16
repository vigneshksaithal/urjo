# Changelog

## [Unreleased]

### Added
- **Daily Streak System**: Track consecutive days played with 48-hour grace period
- **Streak Badge**: Displays current streak with fire emoji and pulse animation in game header
- **Longest Streak Tracking**: Stores and displays all-time longest streak
- **Leaderboard System**: Two-tab modal showing top 10 players
  - **Speed Leaderboard**: Today's fastest completion times (resets daily)
  - **Streak Leaderboard**: Current streaks across all players (all-time)
- **Leaderboard Features**: Medal icons for top 3, current user highlighting, username caching
- **Viral Sharing**: Share completion to post comments with single-share prevention
- **Share Format**: `"🎯 I solved today's Urjo puzzle in {time}s! 🔥 {streak} day streak | Play at r/urjo"`
- **Completion UI Enhancements**: Added streak display, mini leaderboard preview, and share button
- **API endpoints**: `/api/game/streak`, `/api/game/leaderboard`, `/api/game/share`
- **Puzzle Generator**: Full backtracking solver with unique solution verification
- **Three cell types**: Locked (pre-filled color), numbered-only (user picks color), empty
- **Progressive difficulty**: Easy (1-3 solves), Medium (4-7), Hard (8+)
- **Number constraints**: Cells show count of orthogonal same-color neighbors
- **Interactive tutorial**: 8-step guided walkthrough teaching column/row balance, number constraints, and adjacent line uniqueness
- **Tutorial auto-show**: First-time users see tutorial before playing; completion persisted in Redis
- **"How to Play" button**: Replay tutorial anytime from game header
- **Completion overlay**: "Puzzle Complete!" with "Next Challenge" and "Restart" buttons
- **Next Challenge**: Generates a new puzzle within the same post (difficulty based on solve count)
- **Restart**: Resets user moves to initial puzzle state
- **API endpoints**: `/api/game/restart`, `/api/game/next-challenge`, `/api/game/tutorial-complete`

### Fixed
- **Neighbor counting**: Changed from 8-directional to 4 orthogonal directions (up/down/left/right)
- **Column uniqueness**: Added check for adjacent identical columns (was only checking rows)
- **Locked cell enforcement**: Server rejects moves on pre-filled cells
- **Full validation**: `validateSolution` now checks all rules (balance, row/column uniqueness, number constraints)
- **Cell locked derivation**: `locked` status now derived from initial puzzle colors, not number presence

### Changed
- **Devvit permissions**: Updated `devvit.json` to use new `scope: "user"` format instead of deprecated `asUser` array
- **GameState type**: Added `streak`, `longestStreak`, `lastPlayedDate` fields
- **CompleteResponse type**: Extended to include streak data
- **Complete endpoint**: Now calculates streaks, updates leaderboards, and increments solve count
- **Game state endpoint**: Returns streak data along with puzzle state
- **Puzzle generation**: Replaced empty grid output with full hint placement and uniqueness verification
- **GameState type**: Added `solveCount` and `tutorialCompleted` fields
- **Cell component**: Now displays numbers, supports locked state
- **WelcomeView**: Updated with game logo and description
