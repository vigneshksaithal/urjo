# Requirements Document

## Introduction

This feature addresses UI issues identified in a design critique of the Urjo puzzle game. The improvements span five priority areas — completion screen hierarchy, header layout, wrong-move feedback, modal accessibility, and empty/error states — plus several minor fixes for consistency and correctness. The goal is a cleaner, more accessible, and more informative player experience within the existing Svelte 5 + Tailwind CSS 4 Devvit webview architecture.

## Glossary

- **Completion_Overlay**: The overlay displayed on top of the game board in GameView when the player solves the puzzle, containing reward info and action buttons.
- **Header**: The 40px-tall bar at the top of GameView containing navigation, streak, coins, and leaderboard controls.
- **GameBoard**: The grid component (`GameBoard.svelte`) rendering the puzzle cells.
- **Cell**: An individual grid cell (`Cell.svelte`) that the player taps to cycle colors.
- **Validation_Feedback**: Visual indicators on rows, columns, or cells that communicate correctness or constraint violations during gameplay.
- **Modal**: A dialog overlay (ShopModal, LeaderboardModal, HowToPlayModal) displayed above the game content.
- **Focus_Trap**: A mechanism that constrains keyboard Tab focus to elements within an open Modal, preventing focus from escaping behind the overlay.
- **Confetti_Effect**: The canvas-confetti animation fired on puzzle or tutorial completion (`ConfettiEffect.svelte`).
- **CoinDisplay**: The component showing the player's coin balance in the Header (`CoinDisplay.svelte`).
- **StreakBadge**: The component showing the player's current streak in the Header (`StreakBadge.svelte`).
- **Grid_Size**: The dimension of the puzzle board, either 4×4 or 6×6.

## Requirements

### Requirement 1: Streamline the Completion Overlay

**User Story:** As a player, I want a clear, focused completion screen so that I immediately see my reward and know what to do next.

#### Acceptance Criteria

1. WHEN the puzzle is solved, THE Completion_Overlay SHALL display elements in this order from top to bottom: coin reward summary, primary "Next Challenge" button, secondary actions group.
2. THE Completion_Overlay SHALL display a maximum of two secondary actions: "Share to Comments" and "Restart".
3. THE Completion_Overlay SHALL remove the inline mini leaderboard preview, the upvote prompt text, and the cross-promo text from the completion screen.
4. WHEN the player has an active streak, THE Completion_Overlay SHALL display the streak count as a compact inline badge next to the coin reward, not as a separate large-text block.
5. THE "Next Challenge" button SHALL be the only element styled as a primary call-to-action (filled background, full width) in the Completion_Overlay.
6. THE "Share to Comments" and "Restart" buttons SHALL be styled as secondary actions (outlined or text-only, reduced visual weight) in the Completion_Overlay.

### Requirement 2: Improve Header Layout and Clarity

**User Story:** As a player, I want a clean, readable header that works on all screen sizes so that I can access game controls without visual clutter.

#### Acceptance Criteria

1. THE Header SHALL render "How to Play" and "New Puzzle" as icon-only buttons with accessible `aria-label` attributes instead of text links.
2. THE StreakBadge SHALL remove the `animate-pulse` CSS class during active gameplay.
3. WHEN the player has no active streak (currentStreak equals 0), THE StreakBadge SHALL display only the fire emoji icon without the "Start your streak!" text.
4. THE Header SHALL maintain a minimum touch target size of 44×44 CSS pixels for all interactive elements.
5. THE Header SHALL use `gap` spacing and `flex-shrink` properties to prevent element overlap on viewports as narrow as 300px.

### Requirement 3: Provide Visual Feedback for Wrong Moves

**User Story:** As a player, I want to see when a row or column violates the puzzle rules so that I can correct mistakes without guessing.

#### Acceptance Criteria

1. WHEN a row contains more than the allowed count of one color (more than 2 for 4×4 grids, more than 3 for 6×6 grids), THE GameBoard SHALL apply a visual error indicator to that row within 100ms of the cell change.
2. WHEN a column contains more than the allowed count of one color, THE GameBoard SHALL apply a visual error indicator to that column within 100ms of the cell change.
3. THE Validation_Feedback error indicator SHALL be a subtle highlight (e.g., a colored border or background tint on the affected cells) that does not obscure cell content.
4. WHEN the violation is corrected by a subsequent cell change, THE GameBoard SHALL remove the error indicator from the affected row or column within 100ms.
5. THE Validation_Feedback logic SHALL be implemented as a pure function that accepts a Grid and Grid_Size and returns a set of violated row and column indices.
6. WHEN all cells are filled and the board does not match the solution, THE GameBoard SHALL keep the per-row and per-column error indicators visible (no additional "wrong board" overlay).

### Requirement 4: Add Focus Trapping and Keyboard Support to Modals

**User Story:** As a player using a keyboard or assistive technology, I want modals to trap focus and respond to keyboard input so that I can navigate the app without getting lost behind overlays.

#### Acceptance Criteria

1. WHEN a Modal is opened, THE Modal SHALL set `role="dialog"` and `aria-modal="true"` on the dialog container (applies to ShopModal, LeaderboardModal, and HowToPlayModal).
2. WHEN a Modal is opened, THE Modal SHALL move focus to the first focusable element inside the dialog.
3. WHILE a Modal is open, THE Focus_Trap SHALL constrain Tab and Shift+Tab cycling to focusable elements within the Modal.
4. WHEN the Escape key is pressed while a Modal is open, THE Modal SHALL close.
5. WHEN a Modal is closed, THE Modal SHALL return focus to the element that triggered the Modal opening.
6. THE Focus_Trap logic SHALL be implemented as a reusable Svelte action or utility function shared across all three Modals.

### Requirement 5: Improve Empty and Error States

**User Story:** As a player, I want helpful guidance when something goes wrong or when content is empty so that I understand what happened and what to do next.

#### Acceptance Criteria

1. WHEN the game fails to load, THE error view in App.svelte SHALL display a descriptive message, a "Retry" button, and a brief suggestion (e.g., "Check your connection and try again").
2. WHEN the ShopModal has no titles available, THE ShopModal SHALL display an explanatory message describing how titles are unlocked (e.g., "Titles unlock as you solve puzzles and build streaks. Keep playing!").
3. WHEN the LeaderboardModal has no entries, THE LeaderboardModal SHALL display an explanatory message describing how to appear on the leaderboard (e.g., "Solve puzzles to earn your spot on the leaderboard.").
4. WHEN a leaderboard fetch fails, THE LeaderboardModal SHALL display the error message and a "Retry" button that re-fetches the data.

### Requirement 6: Fix HowToPlayModal Color Count for Variable Grid Sizes

**User Story:** As a player on a 6×6 grid, I want the "How to Play" instructions to show the correct color counts so that the rules are accurate.

#### Acceptance Criteria

1. THE HowToPlayModal SHALL accept a `gridSize` prop of type number.
2. WHEN gridSize is 4, THE HowToPlayModal SHALL display "2 red and 2 blue" in the row/column balance rule.
3. WHEN gridSize is 6, THE HowToPlayModal SHALL display "3 red and 3 blue" in the row/column balance rule.
4. THE color count SHALL be computed as `gridSize / 2` rather than hardcoded.

### Requirement 7: Fix Cell Number Overlay Sizing for 6×6 Grids

**User Story:** As a player on a 6×6 grid, I want cell numbers to fit within the smaller cells so that numbers are readable and do not overflow.

#### Acceptance Criteria

1. WHEN Grid_Size is 4, THE Cell number overlay SHALL use a font size class of `text-3xl`.
2. WHEN Grid_Size is 6, THE Cell number overlay SHALL use a smaller font size class (e.g., `text-xl`) to prevent overflow.
3. THE Cell component SHALL accept a `gridSize` prop to determine the appropriate font size.

### Requirement 8: Remove Unused CoinDisplay Prop

**User Story:** As a developer, I want to remove dead code so that the component interface is accurate and maintainable.

#### Acceptance Criteria

1. THE CoinDisplay component SHALL remove the `totalCoins` optional prop from its type definition.
2. THE CoinDisplay component SHALL remove all rendering logic that references `totalCoins`.

### Requirement 9: Restrict Confetti to Game Completion Only

**User Story:** As a player, I want confetti to feel special by only appearing when I complete a real puzzle, not during the tutorial.

#### Acceptance Criteria

1. WHEN the player completes the tutorial, THE TutorialView SHALL NOT fire the Confetti_Effect.
2. WHEN the player solves a game puzzle, THE GameView SHALL fire the Confetti_Effect.
3. THE Confetti_Effect SHALL fire at most once per puzzle completion (no duplicate triggers on re-render).

### Requirement 10: Repurpose Empty Footer Space on Completion

**User Story:** As a player, I want the footer area to remain useful after solving a puzzle instead of showing blank space.

#### Acceptance Criteria

1. WHEN the puzzle is not completed, THE footer SHALL display "Tap to cycle colors" instruction text.
2. WHEN the puzzle is completed, THE footer SHALL display the time taken to solve (e.g., "Solved in 42s") instead of empty space.
