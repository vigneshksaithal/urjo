# Tasks

## Task 1: Create validation pure function and property tests

- [x] 1.1 Create `src/client/lib/validation.ts` with `validateGrid(grid: Grid, gridSize: number): ValidationResult` pure function that returns violated row and column indices where any color count exceeds `gridSize / 2`
- [x] 1.2 Create `src/client/lib/__tests__/validation.test.ts` with property tests using `fast-check`:
  - Property 1 (Feature: ui-critique-improvements, Property 1: Row and column violation detection): generate random grids and gridSizes, assert validateGrid returns exactly the rows/columns exceeding the color limit
  - Property 2 (Feature: ui-critique-improvements, Property 2: Violation correction removes indicator): generate a grid with a violation, fix it, assert the violation is removed from the result
  - Edge case unit tests: empty grid, fully filled valid grid, single row violation, single column violation
- [x] 1.3 Run `bun run test` and confirm all validation tests pass

## Task 2: Create focus trap Svelte action

- [x] 2.1 Create `src/client/lib/focus-trap.ts` implementing a reusable Svelte action that: traps Tab/Shift+Tab within the container, closes on Escape, moves focus to first focusable element on mount, restores focus on destroy
- [x] 2.2 Create `src/client/lib/__tests__/focus-trap.test.ts` with unit tests for the focus trap logic (Tab cycling, Escape handling, focus restoration)
- [x] 2.3 Run `bun run test` and confirm all focus trap tests pass

## Task 3: Streamline the Completion Overlay (Requirement 1)

- [x] 3.1 Update `GameView.svelte` completion overlay: reorder to coin reward → Next Challenge → secondary actions; remove mini leaderboard preview, upvote prompt, cross-promo text; make streak an inline badge next to coin reward
- [x] 3.2 Style "Next Challenge" as primary CTA (filled, full-width) and "Share"/"Restart" as secondary (outlined/text-only)
- [x] 3.3 Remove the `leaderboardPreview` state and `fetchLeaderboardPreview()` function from GameView since the mini leaderboard is removed

## Task 4: Improve Header Layout (Requirement 2)

- [x] 4.1 Replace "How to Play" and "New Puzzle" text links with icon-only buttons (use `CircleHelp` and `Shuffle` from lucide-svelte) with `aria-label` attributes
- [x] 4.2 Add `min-w-[44px] min-h-[44px]` to all header interactive elements for touch targets; use `gap-2` and `flex-shrink-0` to prevent overlap at narrow viewports

## Task 5: Fix StreakBadge (Requirement 2 continued)

- [x] 5.1 Remove `animate-pulse` class from StreakBadge
- [x] 5.2 When `currentStreak === 0`, display only the 🔥 icon without "Start your streak!" text

## Task 6: Wire validation feedback into GameBoard (Requirement 3)

- [x] 6.1 In `GameView.svelte`, call `validateGrid` on every cell change and pass `violatedRows`/`violatedCols` as props to `GameBoard`
- [x] 6.2 Update `GameBoard.svelte` to accept `violatedRows` and `violatedCols` props and pass `hasError` boolean to each `Cell`
- [x] 6.3 Update `Cell.svelte` to accept `hasError` prop and apply a subtle `ring-2 ring-red-400/40` when true

## Task 7: Apply focus trap to all modals (Requirement 4)

- [x] 7.1 Apply the `focusTrap` action to `ShopModal.svelte` dialog container with Escape-to-close support
- [x] 7.2 Apply the `focusTrap` action to `LeaderboardModal.svelte` dialog container with Escape-to-close support
- [x] 7.3 Apply the `focusTrap` action to `HowToPlayModal.svelte` dialog container; add `role="dialog"` and `aria-modal="true"` attributes
- [x] 7.4 Ensure all three modals restore focus to the trigger element on close

## Task 8: Improve empty and error states (Requirement 5)

- [x] 8.1 Update `App.svelte` error view to add suggestion text "Check your connection and try again" below the error message
- [x] 8.2 Update `ShopModal.svelte` empty state message to "Titles unlock as you solve puzzles and build streaks. Keep playing!"
- [x] 8.3 Update `LeaderboardModal.svelte` empty state message to "Solve puzzles to earn your spot on the leaderboard."
- [x] 8.4 Add a "Retry" button to `LeaderboardModal.svelte` error state that calls `fetchLeaderboard()`

## Task 9: Fix HowToPlayModal for variable grid sizes (Requirement 6)

- [x] 9.1 Add `gridSize` prop to `HowToPlayModal.svelte` and compute color count as `gridSize / 2`
- [x] 9.2 Update the rule text to interpolate the computed count: "Fill each row and column with exactly {count} red and {count} blue circles"
- [x] 9.3 Pass `gridSize` from `GameView.svelte` (or `App.svelte`) to `HowToPlayModal`
- [x] 9.4 Add property test (Feature: ui-critique-improvements, Property 3: Color count derived from grid size) verifying `gridSize / 2` computation for any even positive integer

## Task 10: Fix Cell number overlay for 6×6 grids (Requirement 7)

- [x] 10.1 Add `gridSize` prop to `Cell.svelte`
- [x] 10.2 Use `text-3xl` when `gridSize === 4` and `text-xl` when `gridSize === 6` for the number overlay
- [x] 10.3 Pass `gridSize` from `GameBoard.svelte` to each `Cell`

## Task 11: Remove unused CoinDisplay prop (Requirement 8)

- [x] 11.1 Remove `totalCoins` from `CoinDisplay.svelte` Props type and remove the conditional rendering block that references it
- [x] 11.2 Remove any `totalCoins` prop usage from parent components passing it to CoinDisplay
- [x] 11.3 Run `bun run type-check` to confirm no type errors

## Task 12: Restrict confetti to game completion only (Requirement 9)

- [x] 12.1 Remove `<ConfettiEffect />` from `TutorialView.svelte`
- [x] 12.2 Add a `hasFiredConfetti` flag in `GameView.svelte` to prevent duplicate confetti triggers on re-render; reset on new puzzle
- [x] 12.3 Add property test (Feature: ui-critique-improvements, Property 4: Confetti fires at most once) verifying the flag prevents re-firing

## Task 13: Repurpose footer on completion (Requirement 10)

- [x] 13.1 Add `timeTaken` prop to `GameView.svelte` (passed from `App.svelte`)
- [x] 13.2 Update footer: when `isCompleted`, display "Solved in {timeTaken}s"; when not completed, keep "Tap to cycle colors"
- [x] 13.3 Add property test (Feature: ui-critique-improvements, Property 5: Footer displays solve time) verifying the format string for any non-negative timeTaken

## Task 14: Final verification

- [x] 14.1 Run `bun run test` and confirm zero failures
- [x] 14.2 Run `bun run type-check` and confirm zero type errors
