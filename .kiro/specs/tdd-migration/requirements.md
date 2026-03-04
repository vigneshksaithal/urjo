# Requirements Document

## Introduction

This document defines the requirements for migrating the Urjo Devvit app to a strict Test-Driven Development (TDD) workflow. The migration restructures existing tests into colocated `__tests__/` directories, adds comprehensive test coverage for all server and shared modules, refactors code to align with AGENTS.md coding principles, and ensures the Hono app is exported for testability.

## Glossary

- **App**: The Hono HTTP application instance that handles all API routes for the Urjo Devvit app
- **Test_Infrastructure**: The combination of Vitest, `@devvit/test`, and the exported Hono app that enables isolated, repeatable test execution
- **Pure_Function**: A function with no side effects whose output depends only on its inputs (e.g., `calculatePerformanceScore`, `getLevelConfig`)
- **Redis_Helper**: A function that reads from or writes to Redis to manage persistent state (e.g., `getUserEconomy`, `saveUserEconomy`)
- **Route_Handler**: A Hono route handler that processes HTTP requests, interacts with Redis/Reddit APIs, and returns JSON responses
- **Test_Directory**: A `__tests__/` directory colocated with the source files it tests
- **Code_Refactor**: Transforming existing code to use arrow function expressions, explicit return types, and functions of 30 lines or fewer without changing behavior
- **Skill_Level**: An integer in [1, 6] representing the user's adaptive difficulty level
- **Performance_Score**: A floating-point number in [0.0, 1.0] representing how fast a user solved a puzzle relative to expected time
- **Coin_Reward**: A breakdown object containing base, streakBonus, speedBonus, dailyBonus, and total fields representing coins earned

## Requirements

### Requirement 1: Hono App Export for Testability

**User Story:** As a developer, I want the Hono app instance exported from `src/server/index.ts`, so that I can write route integration tests using `app.request()`.

#### Acceptance Criteria

1. THE App SHALL be exported as a named export from `src/server/index.ts`
2. WHEN the App module is imported in a test environment, THE App SHALL not trigger side effects such as starting an HTTP server
3. WHEN a test calls `app.request()` with a valid route path, THE App SHALL process the request and return a Response object

### Requirement 2: Test Directory Structure

**User Story:** As a developer, I want tests organized in colocated `__tests__/` directories, so that tests are discoverable and follow the TDD skill conventions.

#### Acceptance Criteria

1. THE Test_Infrastructure SHALL place server integration tests in `src/server/__tests__/`
2. THE Test_Infrastructure SHALL place library unit tests in `src/server/lib/__tests__/`
3. THE Test_Infrastructure SHALL place route integration tests in `src/server/routes/__tests__/`
4. THE Test_Infrastructure SHALL place shared module tests in `src/shared/__tests__/`
5. WHEN the existing `src/server/lib/generator.test.ts` is migrated, THE Test_Infrastructure SHALL relocate the file to `src/server/lib/__tests__/generator.test.ts` with updated import paths

### Requirement 3: Pure Function Test Coverage

**User Story:** As a developer, I want all pure functions tested with unit tests, so that I can refactor with confidence and catch regressions early.

#### Acceptance Criteria

1. WHEN `getLevelConfig` is called with any integer, THE Pure_Function SHALL return a valid DifficultyLevel with the level clamped to [1, 6]
2. WHEN `getTitleById` is called with a valid title ID, THE Pure_Function SHALL return the matching TitleDef object
3. WHEN `getTitleById` is called with an unknown ID, THE Pure_Function SHALL return undefined
4. WHEN `calculatePerformanceScore` is called with a positive timeTaken and a valid level, THE Pure_Function SHALL return a number in [0.0, 1.0]
5. WHEN `calculateSkipScore` is called with a non-negative timeSpent and a valid level, THE Pure_Function SHALL return a number in [-0.5, -0.2]
6. WHEN `calculateAverageScore` is called with an empty history array, THE Pure_Function SHALL return 0.5
7. WHEN `determineSkillLevel` is called with any currentLevel and history, THE Pure_Function SHALL return an integer in [1, 6]
8. WHEN `determineSkillLevel` is called with an empty history, THE Pure_Function SHALL return the currentLevel unchanged
9. WHEN `shouldForceDemotion` is called with a consecutiveSkips count, THE Pure_Function SHALL return true if and only if the count is greater than or equal to the CONSECUTIVE_SKIP_THRESHOLD
10. WHEN `addGameRecord` is called with a history and a new record, THE Pure_Function SHALL return a new array containing the record with length capped at HISTORY_SIZE
11. WHEN `parseHistory` is called with null, undefined, or an empty string, THE Pure_Function SHALL return an empty array
12. WHEN `parseHistory` is called with invalid JSON or a non-array JSON value, THE Pure_Function SHALL return an empty array without throwing
13. WHEN `parseHistory` is called with a valid JSON array, THE Pure_Function SHALL filter and return only entries matching the GameRecord shape

### Requirement 4: Economy Function Test Coverage

**User Story:** As a developer, I want economy functions tested with Redis-backed integration tests, so that coin rewards, title purchases, and user data persistence are verified.

#### Acceptance Criteria

1. WHEN `calculateCoinReward` is called with valid inputs, THE Redis_Helper SHALL return a CoinReward where total equals base + streakBonus + speedBonus + dailyBonus
2. WHEN `calculateCoinReward` is called with a timeTaken at or below par time, THE Redis_Helper SHALL include COIN_SPEED_BONUS in the speedBonus field
3. WHEN `calculateCoinReward` is called with isDailyFirst set to true, THE Redis_Helper SHALL include COIN_DAILY_BONUS in the dailyBonus field
4. WHEN `getUserEconomy` is called for a user with no stored data, THE Redis_Helper SHALL return default values: 0 coins, 0 totalCoins, 0 totalSolves, 0 speedSolves, 'puzzler' equippedTitle, ['puzzler'] ownedTitles, and null dailyFirstSolve
5. WHEN `saveUserEconomy` is called with partial economy data, THE Redis_Helper SHALL persist only the provided fields to Redis
6. WHEN `getUserStreakData` is called for a user with no stored streak, THE Redis_Helper SHALL return 0 currentStreak, 0 longestStreak, and null lastPlayedDate

### Requirement 5: Game Route Test Coverage

**User Story:** As a developer, I want all game route handlers tested via `app.request()`, so that API contracts and error handling are verified end-to-end.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/game/state` with a seeded puzzle, THE Route_Handler SHALL return HTTP 200 with a GameState JSON body containing puzzle, skillLevel, tutorialCompleted, and streak fields
2. WHEN a GET request is made to `/api/game/state` without a userId in context, THE Route_Handler SHALL return HTTP 400 with an error message
3. WHEN a POST request is made to `/api/game/complete` with a valid timeTaken, THE Route_Handler SHALL return HTTP 200 with performanceScore, newSkillLevel, previousSkillLevel, streak, and coinReward fields
4. WHEN a POST request is made to `/api/game/complete` with an invalid timeTaken (non-number or <= 0), THE Route_Handler SHALL return HTTP 400 with an error message
5. WHEN a POST request is made to `/api/game/next-challenge`, THE Route_Handler SHALL return HTTP 200 with a new puzzle and updated skillLevel
6. WHEN a GET request is made to `/api/game/leaderboard`, THE Route_Handler SHALL return HTTP 200 with a LeaderboardData JSON body containing type and entries fields

### Requirement 6: Economy Route Test Coverage

**User Story:** As a developer, I want all economy route handlers tested via `app.request()`, so that shop purchases, title equipping, and leaderboard queries are verified.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/economy` with a valid userId, THE Route_Handler SHALL return HTTP 200 with the user's economy data
2. WHEN a GET request is made to `/api/shop` with a valid userId, THE Route_Handler SHALL return HTTP 200 with shop items and the user's coin balance
3. WHEN a POST request is made to `/api/shop/buy` with a valid titleId and sufficient coins, THE Route_Handler SHALL return HTTP 200 with success true and the updated coin balance
4. WHEN a POST request is made to `/api/shop/buy` with insufficient coins, THE Route_Handler SHALL return HTTP 400 with an error message
5. WHEN a POST request is made to `/api/shop/equip` with an owned titleId, THE Route_Handler SHALL return HTTP 200 with success true
6. WHEN a POST request is made to `/api/shop/equip` with an unowned titleId, THE Route_Handler SHALL return HTTP 400 with an error message

### Requirement 7: Post Creation Test Coverage

**User Story:** As a developer, I want post creation logic tested with mocked Reddit API, so that puzzle generation and Redis persistence during post creation are verified.

#### Acceptance Criteria

1. WHEN `createPost` is called with a valid subredditName in context, THE Route_Handler SHALL create a Reddit custom post and store the generated puzzle in Redis
2. WHEN `createPost` is called without a subredditName in context, THE Route_Handler SHALL throw an Error with the message 'subredditName is required'

### Requirement 8: Code Refactoring to AGENTS.md Principles

**User Story:** As a developer, I want existing code refactored to follow AGENTS.md coding principles, so that the codebase is consistent, readable, and maintainable.

#### Acceptance Criteria

1. THE Code_Refactor SHALL convert all `function` declarations in server and shared modules to arrow function expressions
2. THE Code_Refactor SHALL add explicit return types on all exported functions
3. THE Code_Refactor SHALL extract any function exceeding 30 lines into smaller composable functions
4. THE Code_Refactor SHALL replace dynamic `import()` calls in `src/server/routes/game.ts` with static imports
5. WHEN code is refactored, THE Code_Refactor SHALL preserve all existing behavior as verified by passing tests

### Requirement 9: Test Isolation and Infrastructure

**User Story:** As a developer, I want each test to run in complete isolation with fresh Redis state, so that tests are deterministic and do not interfere with each other.

#### Acceptance Criteria

1. THE Test_Infrastructure SHALL use `createDevvitTest()` from `@devvit/test` to provide per-test isolated Redis and Reddit API mocks
2. WHEN any test completes, THE Test_Infrastructure SHALL ensure Redis state from that test is not visible to subsequent tests
3. THE Test_Infrastructure SHALL require zero test failures before any code is considered complete
