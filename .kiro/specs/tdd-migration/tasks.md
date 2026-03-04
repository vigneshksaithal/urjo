# Implementation Plan: TDD Migration

## Overview

Migrate the Urjo Devvit app to strict TDD practices by restructuring tests into colocated `__tests__/` directories, exporting the Hono app for testability, adding comprehensive test coverage for all server and shared modules, and refactoring code to align with AGENTS.md coding principles. Each task follows the Red-Green-Refactor cycle.

## Tasks

- [x] 1. Export Hono app and restructure test infrastructure
  - [x] 1.1 Export the Hono `app` instance from `src/server/index.ts` and guard the `serve()` call to prevent side effects during test imports
    - Extract `app` as a named export
    - Wrap `serve()` so it only runs outside test environment (e.g., check `process.env.NODE_ENV !== 'test'` or use a conditional import pattern)
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.2 Relocate `src/server/lib/generator.test.ts` to `src/server/lib/__tests__/generator.test.ts` and update import paths
    - Move the file into the new `__tests__/` directory
    - Update relative imports to point to `../generator`
    - Verify existing tests still pass with `bun run test`
    - _Requirements: 2.2, 2.5_

  - [x] 1.3 Create empty `__tests__/` directories for all test locations
    - `src/server/__tests__/`
    - `src/server/routes/__tests__/`
    - `src/shared/__tests__/`
    - (lib/__tests__/ already created in 1.2)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2. Checkpoint — Ensure existing tests pass after restructure
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Add pure function tests for shared and adaptive modules
  - [x] 3.1 Write unit tests for `src/shared/constants.ts` in `src/shared/__tests__/constants.test.ts`
    - Test `getLevelConfig` returns correct config for each level 1–6
    - Test `getLevelConfig` clamps below minimum (0, -5) to level 1
    - Test `getLevelConfig` clamps above maximum (7, 99) to level 6
    - Test `getTitleById` returns correct TitleDef for known IDs
    - Test `getTitleById` returns undefined for unknown IDs
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.2 Write property test: Level config clamping (Property 1)
    - **Property 1: Level config clamping**
    - For any integer level, `getLevelConfig(level)` returns a DifficultyLevel with level in [1, 6]
    - **Validates: Requirement 3.1**

  - [x] 3.3 Write unit tests for `src/server/lib/adaptive.ts` in `src/server/lib/__tests__/adaptive.test.ts`
    - Test `calculatePerformanceScore` returns 1.0 for instant solve, 0.5 for expected time, 0.0 for 2x expected time
    - Test `calculateSkipScore` returns values in [-0.5, -0.2] range
    - Test `calculateAverageScore` returns 0.5 for empty history
    - Test `determineSkillLevel` returns currentLevel for empty history
    - Test `determineSkillLevel` promotes when average >= 0.70
    - Test `determineSkillLevel` demotes when average <= 0.30
    - Test `shouldForceDemotion` returns true at threshold, false below
    - Test `addGameRecord` caps history at HISTORY_SIZE
    - Test `parseHistory` handles null, undefined, empty string, invalid JSON, non-array JSON, and valid arrays with mixed entries
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13_

  - [x] 3.4 Write property test: Performance score bounded output (Property 2)
    - **Property 2: Performance score bounded output**
    - For any positive timeTaken and valid level in [1, 6], result is in [0.0, 1.0]
    - **Validates: Requirement 3.4**

  - [x] 3.5 Write property test: Skip score bounded output (Property 3)
    - **Property 3: Skip score bounded output**
    - For any non-negative timeSpent and valid level in [1, 6], result is in [-0.5, -0.2]
    - **Validates: Requirement 3.5**

  - [x] 3.6 Write property test: Skill level never escapes valid range (Property 4)
    - **Property 4: Skill level never escapes valid range**
    - For any currentLevel and any GameRecord array, result is in [MIN_SKILL_LEVEL, MAX_SKILL_LEVEL]
    - **Validates: Requirements 3.7, 3.8**

  - [x] 3.7 Write property test: Force demotion threshold (Property 5)
    - **Property 5: Force demotion threshold**
    - `shouldForceDemotion(n)` returns true iff n >= CONSECUTIVE_SKIP_THRESHOLD
    - **Validates: Requirement 3.9**

  - [x] 3.8 Write property test: History size cap (Property 6)
    - **Property 6: History size cap**
    - `addGameRecord(history, record)` returns array with length <= HISTORY_SIZE containing the new record
    - **Validates: Requirement 3.10**

  - [x] 3.9 Write property test: Parse history robustness (Property 7)
    - **Property 7: Parse history robustness and filtering**
    - `parseHistory(input)` never throws and every element in the result matches GameRecord shape
    - **Validates: Requirements 3.12, 3.13**

- [x] 4. Checkpoint — Ensure all pure function tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Add economy function tests (Redis-backed)
  - [x] 5.1 Write integration tests for `src/server/lib/economy.ts` in `src/server/lib/__tests__/economy.test.ts`
    - Test `calculateCoinReward` total equals base + streakBonus + speedBonus + dailyBonus
    - Test `calculateCoinReward` includes COIN_SPEED_BONUS when timeTaken <= parTime
    - Test `calculateCoinReward` includes COIN_DAILY_BONUS when isDailyFirst is true
    - Test `getUserEconomy` returns defaults for new user (0 coins, 'puzzler' title, etc.)
    - Test `saveUserEconomy` persists partial fields and `getUserEconomy` reads them back
    - Test `getUserStreakData` returns defaults for new user (0 streaks, null lastPlayedDate)
    - Use `createDevvitTest()` for per-test Redis isolation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.1, 9.2_

  - [x] 5.2 Write property test: Coin reward algebraic invariant (Property 8)
    - **Property 8: Coin reward algebraic invariant**
    - For any valid inputs, `total === base + streakBonus + speedBonus + dailyBonus`
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [x] 5.3 Write property test: Economy save/load round-trip (Property 9)
    - **Property 9: Economy save/load round-trip**
    - Saving via `saveUserEconomy` then loading via `getUserEconomy` preserves saved field values
    - **Validates: Requirement 4.5**

- [x] 6. Add game route integration tests
  - [x] 6.1 Write route tests for `src/server/routes/game.ts` in `src/server/routes/__tests__/game.test.ts`
    - Test `GET /api/game/state` returns 200 with GameState JSON when puzzle is seeded
    - Test `GET /api/game/state` returns 400 when userId is missing
    - Test `POST /api/game/complete` returns 200 with performanceScore, newSkillLevel, previousSkillLevel, streak, coinReward
    - Test `POST /api/game/complete` returns 400 for invalid timeTaken (non-number, <= 0)
    - Test `POST /api/game/next-challenge` returns 200 with new puzzle and skillLevel
    - Test `GET /api/game/leaderboard` returns 200 with type and entries fields
    - Use `app.request()` with seeded Redis data and `createDevvitTest()` for isolation
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 9.1, 9.2_

- [x] 7. Add economy route integration tests
  - [x] 7.1 Write route tests for `src/server/routes/economy.ts` in `src/server/routes/__tests__/economy.test.ts`
    - Test `GET /api/economy` returns 200 with user economy data
    - Test `GET /api/shop` returns 200 with shop items and coin balance
    - Test `POST /api/shop/buy` returns 200 with success and updated balance for valid purchase
    - Test `POST /api/shop/buy` returns 400 for insufficient coins
    - Test `POST /api/shop/equip` returns 200 for owned title
    - Test `POST /api/shop/equip` returns 400 for unowned title
    - Use `app.request()` with seeded Redis data and `createDevvitTest()` for isolation
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 9.1, 9.2_

- [x] 8. Add post creation tests
  - [x] 8.1 Write integration tests for `src/server/post.ts` in `src/server/__tests__/post.test.ts`
    - Test `createPost` creates a Reddit custom post and stores puzzle in Redis
    - Test `createPost` throws Error with 'subredditName is required' when subredditName is missing
    - Use `createDevvitTest()` with mocked Reddit API
    - _Requirements: 7.1, 7.2, 9.1_

- [x] 9. Checkpoint — Ensure all tests pass before refactoring
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Refactor code to AGENTS.md coding principles
  - [x] 10.1 Refactor `src/server/lib/economy.ts` — convert `function` declarations to arrow function expressions, add explicit return types, replace dynamic `import()` in `fetchUsernameFromReddit` with static import
    - Convert `getEconomyKey`, `getTodayUTC`, `getUserEconomy`, `saveUserEconomy`, `checkTitleCondition`, `getShopItems`, `checkTitleConditionSync`, `getUserDisplay`, `fetchUsernameFromReddit`, `getUserStreakData` to arrow functions
    - Add explicit return types on all exports
    - Replace `await import('@devvit/web/server')` with the existing static `import { redis } from '@devvit/web/server'` at top of file (reddit is already available)
    - _Requirements: 8.1, 8.2, 8.4, 8.5_

  - [x] 10.2 Refactor `src/server/routes/game.ts` — convert `function` declarations to arrow function expressions, add explicit return types, extract functions exceeding 30 lines
    - Convert `fetchUsername`, `getSkillLevel`, `getHistory`, `generatePuzzleForLevel`, `getCurrentPuzzle`, `getStreakData`, `getTodayUTC`, `getDayDifference`, `updateStreak` to arrow functions
    - The `POST /api/game/complete` handler exceeds 30 lines — extract coin reward logic into a helper function
    - Replace `await import('../lib/economy')` in the complete handler with a static import at the top of the file
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 10.3 Refactor `src/server/routes/economy.ts` — convert `function` declarations to arrow function expressions, add explicit return types
    - Convert `getSkillLevel`, `checkCondition` to arrow functions
    - Add explicit return types on all exports
    - _Requirements: 8.1, 8.2, 8.5_

  - [x] 10.4 Refactor `src/server/index.ts` — convert `function` declarations to arrow function expressions, extract `buildStatsComment` and `resolveUsernames` into composable functions ≤30 lines each
    - Convert `buildStatsComment`, `resolveUsernames` to arrow functions
    - `buildStatsComment` exceeds 30 lines — extract leaderboard section formatting into a helper
    - Add explicit return types on all exports
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

- [x] 11. Final checkpoint — Ensure all tests pass after refactoring
  - Ensure all tests pass, ask the user if questions arise.
  - Verify refactored code preserves all existing behavior (no test regressions)
  - Run `bun run type-check` to confirm TypeScript compilation
  - _Requirements: 8.5, 9.3_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each phase
- Property tests validate universal correctness properties from the design document
- All tests use `createDevvitTest()` from `@devvit/test` for per-test isolation (Requirement 9.1, 9.2)
- Route tests use `app.request()` on the exported Hono app instance
- Refactoring tasks come last to ensure tests are green before changing code structure
