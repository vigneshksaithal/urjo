# Requirements Document

## Introduction

The Grid Size Selector feature decouples grid size from the adaptive difficulty level, allowing users to manually choose their preferred grid size (4×4, 6×6, or 8×8) while the adaptive difficulty system continues to control puzzle difficulty (easy/medium/hard/diabolical) within the chosen grid size. This addresses user complaints about being locked into 4×4 grids due to steep promotion thresholds in the current difficulty ladder.

## Glossary

- **Grid_Size_Selector**: A UI control that allows the user to choose between 4×4, 6×6, and 8×8 puzzle grid sizes
- **Grid_Size_Preference**: The user's persisted grid size choice, stored in Redis as one of the values 4, 6, or 8
- **Adaptive_Difficulty_System**: The server-side algorithm that adjusts puzzle difficulty (easy/medium/hard/diabolical) based on recent performance history
- **Difficulty_Ladder**: The mapping from skill level to a (gridSize, difficulty) pair, currently defined in `DIFFICULTY_LADDER` in constants.ts
- **Per_Grid_Difficulty_Ladder**: A new mapping structure where each grid size has its own independent progression of difficulty levels
- **Skill_Level**: A numeric value (1–N) representing the user's current difficulty tier within a specific grid size
- **Coin_Reward_System**: The economy subsystem that calculates coin rewards for puzzle completions based on level, speed, streak, and other factors
- **Game_State_API**: The `/api/game/state` endpoint that returns the current puzzle and player metadata to the client
- **Next_Challenge_API**: The `/api/game/next-challenge` endpoint that generates a new puzzle for the user
- **Challenge_Post**: A Reddit post containing a fixed puzzle created by a user for others to beat

## Requirements

### Requirement 1: Grid Size Preference Persistence

**User Story:** As a player, I want my grid size preference to be saved, so that I get my preferred grid size every time I play without re-selecting it.

#### Acceptance Criteria

1. WHEN a user selects a grid size via the Grid_Size_Selector, THE Server SHALL persist the Grid_Size_Preference to Redis under the key `user:{userId}:gridSizePreference`
2. WHEN a user has no stored Grid_Size_Preference, THE Server SHALL default to grid size 4
3. WHEN the Game_State_API is called, THE Server SHALL include the user's Grid_Size_Preference in the response
4. THE Server SHALL accept only the values 4, 6, or 8 as valid Grid_Size_Preference values
5. IF an invalid Grid_Size_Preference value is submitted, THEN THE Server SHALL return a 400 error with a descriptive message

### Requirement 2: Per-Grid Difficulty Ladder

**User Story:** As a player, I want difficulty to progress independently within my chosen grid size, so that I experience easy-to-hard puzzles regardless of which grid size I pick.

#### Acceptance Criteria

1. THE Per_Grid_Difficulty_Ladder SHALL define independent difficulty progressions for each grid size: 4×4 (levels 1–4: easy, medium, hard, diabolical), 6×6 (levels 1–4: easy, medium, hard, diabolical), and 8×8 (levels 1–4: easy, medium, hard, diabolical)
2. THE Server SHALL store a separate Skill_Level per grid size per user in Redis under the key `user:{userId}:skillLevel:{gridSize}`
3. WHEN a user changes their Grid_Size_Preference, THE Adaptive_Difficulty_System SHALL use the Skill_Level stored for the newly selected grid size
4. WHEN a user has no stored Skill_Level for a grid size, THE Server SHALL default to level 1 for that grid size
5. THE Per_Grid_Difficulty_Ladder SHALL include an `expectedTime` value for each (gridSize, difficulty) combination for use in performance scoring

### Requirement 3: Grid Size Selector UI

**User Story:** As a player, I want a visible control to switch between grid sizes, so that I can play on the board size I enjoy most.

#### Acceptance Criteria

1. THE Grid_Size_Selector SHALL display three options: 4×4, 6×6, and 8×8
2. THE Grid_Size_Selector SHALL visually indicate the currently active grid size
3. WHEN a user taps a grid size option, THE Client SHALL send the selection to the Server and load a new puzzle at that grid size
4. WHILE a puzzle is in the completed state, THE Grid_Size_Selector SHALL remain interactive so the user can switch sizes before starting the next puzzle
5. THE Grid_Size_Selector SHALL be displayed in the game header area, accessible without navigating away from the game screen

### Requirement 4: Puzzle Generation Respects Grid Size Preference

**User Story:** As a player, I want new puzzles to match my selected grid size, so that I always play on the board size I chose.

#### Acceptance Criteria

1. WHEN the Next_Challenge_API is called, THE Server SHALL generate a puzzle using the user's stored Grid_Size_Preference and the Skill_Level for that grid size
2. WHEN the Game_State_API is called for a non-challenge post, THE Server SHALL generate the initial puzzle using the user's Grid_Size_Preference
3. WHEN the Game_State_API is called for a Challenge_Post, THE Server SHALL use the grid size baked into the challenge puzzle regardless of the user's Grid_Size_Preference
4. WHEN a user changes grid size via the Grid_Size_Selector, THE Server SHALL generate a new puzzle at the selected grid size and the user's Skill_Level for that grid size

### Requirement 5: Adaptive Difficulty Within Grid Size

**User Story:** As a player, I want the game to still adjust difficulty based on my performance, so that puzzles stay challenging but not frustrating within my chosen grid size.

#### Acceptance Criteria

1. WHEN a puzzle is completed, THE Adaptive_Difficulty_System SHALL update the Skill_Level for the grid size of the completed puzzle only
2. THE Adaptive_Difficulty_System SHALL maintain separate game history per grid size per user in Redis under the key `user:{userId}:history:{gridSize}`
3. WHEN a puzzle is skipped via the Next_Challenge_API, THE Adaptive_Difficulty_System SHALL record the skip in the history for the current Grid_Size_Preference
4. THE Adaptive_Difficulty_System SHALL use the same promotion and demotion thresholds defined in constants.ts, applied independently per grid size
5. THE Adaptive_Difficulty_System SHALL cap the Skill_Level at the maximum level defined in the Per_Grid_Difficulty_Ladder for the active grid size

### Requirement 6: Coin Rewards Account for Grid Size

**User Story:** As a player, I want to earn more coins for solving larger puzzles, so that I am rewarded for taking on bigger challenges.

#### Acceptance Criteria

1. THE Coin_Reward_System SHALL apply a grid size multiplier to the base coin reward: 1.0× for 4×4, 1.5× for 6×6, and 2.0× for 8×8
2. WHEN a puzzle is completed, THE Coin_Reward_System SHALL calculate the base reward using the Skill_Level within the active grid size and then apply the grid size multiplier
3. THE Coin_Reward_System SHALL round the final coin total to the nearest integer
4. THE Server SHALL include the grid size multiplier breakdown in the CoinReward response so the client can display it

### Requirement 7: Leaderboard Grid Size Context

**User Story:** As a player, I want leaderboards to be fair, so that my speed times are compared against others playing the same grid size.

#### Acceptance Criteria

1. WHEN a puzzle is completed, THE Server SHALL record the speed time in a grid-size-specific daily leaderboard under the key `leaderboard:speed:{date}:{gridSize}`
2. WHEN the leaderboard API is called for speed type, THE Server SHALL return entries for the user's current Grid_Size_Preference
3. THE Server SHALL continue to use a single global streak leaderboard (not segmented by grid size) since streaks are grid-size-independent

### Requirement 8: Migration of Existing Skill Levels

**User Story:** As an existing player, I want my current progress to carry over, so that I do not lose my difficulty level when the new system launches.

#### Acceptance Criteria

1. WHEN an existing user's game state is loaded and no per-grid Skill_Level exists, THE Server SHALL migrate the user's current global Skill_Level to the appropriate grid size based on the old Difficulty_Ladder mapping (levels 1–3 → 4×4, levels 4–6 → 6×6, levels 7–9 → 8×8)
2. WHEN migrating, THE Server SHALL set the user's Grid_Size_Preference to the grid size corresponding to their old Skill_Level
3. WHEN migrating, THE Server SHALL map the old level to the equivalent per-grid level (e.g., old level 5 → 6×6 level 2, old level 8 → 8×8 level 2)
4. THE Server SHALL perform migration at most once per user and store a migration flag in Redis under the key `user:{userId}:gridMigrated`

### Requirement 9: Grid Size in Share and Challenge Flows

**User Story:** As a player, I want my shared scores and challenges to show the grid size, so that others know what board size I solved.

#### Acceptance Criteria

1. WHEN a score is shared via comment, THE Server SHALL include the grid size label (e.g., "6×6") in the comment text
2. WHEN a Challenge_Post is created, THE Server SHALL include the grid size in the challenge post title
3. WHEN a user plays a Challenge_Post, THE Client SHALL display the challenge's grid size and hide the Grid_Size_Selector since the grid size is fixed by the challenge
