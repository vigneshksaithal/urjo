# Implementation Plan: Grid Size Selector

## Overview

Decouple grid size from the adaptive difficulty ladder so players can choose their preferred board size (4×4, 6×6, 8×8) independently. Each grid size gets its own 4-level difficulty progression, per-grid skill tracking, grid-size-aware coin rewards, and scoped speed leaderboards. Existing users are migrated lazily on first load.

## Tasks

- [x] 1. Add shared constants and types for per-grid difficulty system
  - [x] 1.1 Add per-grid difficulty ladder constants to `src/shared/constants.ts`
    - Add `GridSize` type, `VALID_GRID_SIZES`, `DEFAULT_GRID_SIZE`
    - Add `GridDifficultyLevel` type and `PER_GRID_LADDER` record with 4 levels per grid size (easy/medium/hard/diabolical) and `expectedTime` values from the design table
    - Add `PER_GRID_MAX_LEVEL = 4` and `PER_GRID_MIN_LEVEL = 1`
    - Add `GRID_SIZE_MULTIPLIERS` record (`4: 1.0, 6: 1.5, 8: 2.0`)
    - Add `getGridLevelConfig(gridSize, level)` function with clamping
    - Add `isValidGridSize(value)` type guard function
    - _Requirements: 2.1, 2.5, 1.4_
  - [x] 1.2 Write property tests for grid size validation (Property 1)
    - **Property 1: Grid size validation rejects all non-standard sizes**
    - **Validates: Requirements 1.4**
  - [x] 1.3 Write property tests for per-grid ladder completeness (Property 2)
    - **Property 2: Per-grid ladder completeness and ordering**
    - **Validates: Requirements 2.1, 2.5**
  - [x] 1.4 Write property tests for skill level clamping (Property 3)
    - **Property 3: Skill level clamping within grid bounds**
    - **Validates: Requirements 5.5**
  - [x] 1.5 Update shared types in `src/shared/types.ts`
    - Add `gridSizePreference: number` to `GameState`
    - Add `gridSizeMultiplier: number` to `CoinReward`
    - Add `gridSizePreference: number` to `NextChallengeResponse`
    - Add `GridSizeRequest` and `GridSizeResponse` types
    - _Requirements: 1.3, 6.4_

- [x] 2. Implement server-side grid helpers and migration
  - [x] 2.1 Add grid-aware helper functions to `src/server/lib/helpers.ts`
    - Implement `getGridSizePreference(userId)` — reads from Redis, defaults to 4
    - Implement `setGridSizePreference(userId, gridSize)` — validates and persists
    - Implement `getGridSkillLevel(userId, gridSize)` — reads per-grid skill level, defaults to 1
    - Implement `setGridSkillLevel(userId, gridSize, level)` — persists per-grid skill level
    - Implement `getGridHistory(userId, gridSize)` — reads per-grid game history
    - Implement `setGridHistory(userId, gridSize, history)` — persists per-grid game history
    - _Requirements: 1.1, 1.2, 2.2, 2.4, 5.2_
  - [x] 2.2 Write unit tests for grid helper functions
    - Test `getGridSizePreference` returns 4 for new user, stored value for existing user
    - Test `getGridSkillLevel` returns 1 for new user, stored value for existing user
    - Test `getGridHistory` returns empty array for new user
    - _Requirements: 1.2, 2.4_
  - [x] 2.3 Create migration module `src/server/lib/migration.ts`
    - Implement `migrateUserToPerGrid(userId)` — maps old global skill level to (gridSize, perGridLevel) per design mapping table, sets `gridSizePreference`, `skillLevel:{gridSize}`, and `gridMigrated` flag
    - Implement `isUserMigrated(userId)` — checks `user:{userId}:gridMigrated` flag
    - Extract pure `mapOldLevelToGrid(oldLevel)` function for the mapping logic (levels 1–3 → 4×4, 4–6 → 6×6, 7–9 → 8×8)
    - Handle edge cases: missing old skill level (default to 1), out-of-range values (clamp to 1–9)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 2.4 Write property tests for migration mapping (Property 6)
    - **Property 6: Migration mapping round-trip consistency**
    - **Validates: Requirements 8.1, 8.2, 8.3**
  - [x] 2.5 Write unit tests for migration module
    - Test level 1 → (4, 1), level 5 → (6, 2), level 9 → (8, 3)
    - Test already-migrated user is a no-op
    - Test missing old skill level defaults to level 1
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update economy and adaptive systems for grid-size awareness
  - [x] 4.1 Update `calculateCoinReward` in `src/server/lib/economy.ts`
    - Add `gridSize` parameter (type `GridSize`)
    - Apply `GRID_SIZE_MULTIPLIERS[gridSize]` to the base reward
    - Round the final total to the nearest integer using `Math.round`
    - Include `gridSizeMultiplier` in the returned `CoinReward` object
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 4.2 Write property tests for coin reward grid scaling (Property 4)
    - **Property 4: Coin reward scales monotonically with grid size**
    - **Validates: Requirements 6.1, 6.2**
  - [x] 4.3 Write property tests for coin reward integer total (Property 5)
    - **Property 5: Coin reward total is always an integer**
    - **Validates: Requirements 6.3**
  - [x] 4.4 Write unit tests for updated `calculateCoinReward`
    - Test 4×4 applies 1.0× multiplier, 6×6 applies 1.5×, 8×8 applies 2.0×
    - Test total is always an integer
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 4.5 Update adaptive difficulty to use per-grid constants
    - Update `calculatePerformanceScore` in `src/server/lib/adaptive.ts` to accept `gridSize` and use `getGridLevelConfig` instead of `getLevelConfig`
    - Update `calculateSkipScore` similarly
    - Ensure `determineSkillLevel` clamps to `PER_GRID_MAX_LEVEL` instead of `MAX_SKILL_LEVEL`
    - _Requirements: 5.1, 5.4, 5.5_
  - [x] 4.6 Write unit tests for updated adaptive functions
    - Test performance score uses per-grid expected times
    - Test skill level is capped at 4 (per-grid max)
    - _Requirements: 5.4, 5.5_

- [x] 5. Update server routes for grid-size-aware game flow
  - [x] 5.1 Add `POST /api/game/grid-size` endpoint to `src/server/routes/game.ts`
    - Validate grid size (must be 4, 6, or 8; return 400 otherwise)
    - Persist preference via `setGridSizePreference`
    - Read skill level for the selected grid size
    - Generate a new puzzle at the selected grid size and skill level
    - Store puzzle in Redis and return `GridSizeResponse`
    - _Requirements: 1.1, 1.4, 1.5, 4.4_
  - [x] 5.2 Update `GET /api/game/state` route
    - Run migration check (`isUserMigrated` → `migrateUserToPerGrid` if needed)
    - Read `gridSizePreference` and include in response
    - For non-challenge posts: use preference to determine grid size and per-grid skill level for puzzle generation
    - For challenge posts: use the baked-in grid size from the challenge puzzle
    - _Requirements: 1.3, 4.2, 4.3, 8.1_
  - [x] 5.3 Update `POST /api/game/complete` route
    - Read grid size from the completed puzzle
    - Update `skillLevel:{gridSize}` and `history:{gridSize}` (not global keys)
    - Pass `gridSize` to `calculateCoinReward`
    - Record speed to `leaderboard:speed:{date}:{gridSize}` instead of `leaderboard:speed:{date}`
    - _Requirements: 5.1, 5.2, 6.2, 7.1_
  - [x] 5.4 Update `POST /api/game/next-challenge` route
    - Read `gridSizePreference` to determine grid size
    - Generate puzzle at the preferred grid size and per-grid skill level
    - Record skip in `history:{gridSize}` and update `consecutiveSkips:{gridSize}`
    - _Requirements: 4.1, 5.3_
  - [x] 5.5 Update `GET /api/game/leaderboard` route for speed type
    - For speed leaderboard, read from `leaderboard:speed:{date}:{gridSize}` using user's grid size preference
    - Streak and coins leaderboards remain global (unchanged)
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 5.6 Update share and challenge routes for grid size context
    - In `POST /api/game/share`: include grid size label (e.g., "6×6") in the comment text
    - In `POST /api/game/challenge`: include grid size in the challenge post title
    - _Requirements: 9.1, 9.2_
  - [x] 5.7 Write integration tests for grid-size-aware routes
    - Test `POST /api/game/grid-size` with valid sizes (4, 6, 8) and invalid size (5)
    - Test `GET /api/game/state` triggers migration for old users
    - Test `POST /api/game/complete` updates per-grid skill level only
    - Test `POST /api/game/next-challenge` uses grid size preference
    - Test speed leaderboard is scoped by grid size
    - _Requirements: 1.1, 1.4, 1.5, 4.1, 5.1, 7.1_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement client-side grid size selector UI
  - [x] 7.1 Create `GridSizeSelector.svelte` component in `src/client/components/`
    - Render three toggle buttons: 4×4, 6×6, 8×8
    - Visually highlight the currently active grid size
    - Emit a change event when a different size is tapped
    - Remain interactive when puzzle is in completed state
    - _Requirements: 3.1, 3.2, 3.4_
  - [x] 7.2 Integrate `GridSizeSelector` into `GameView.svelte`
    - Display the selector in the game header area
    - Hide the selector when playing a challenge post (grid size is fixed by the challenge)
    - _Requirements: 3.5, 9.3_
  - [x] 7.3 Update `App.svelte` to handle grid size state and API calls
    - Track `gridSizePreference` state from `GameState` response
    - On grid size change: call `POST /api/game/grid-size`, update puzzle and grid state from response
    - Revert selector to previous value on API failure (non-disruptive error handling)
    - Default to 4 if `gridSizePreference` is missing from response (backward compatibility)
    - Pass `isChallenge` flag to `GameView` based on challenge post detection
    - _Requirements: 3.3, 4.4, 9.3_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- The project uses TypeScript throughout (Svelte 5 client, Hono server, shared types)
- Run `bun run test` after each implementation task per the TDD workflow
