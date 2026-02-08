# Changelog

## [Unreleased]

### Added
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
- **Puzzle generation**: Replaced empty grid output with full hint placement and uniqueness verification
- **GameState type**: Added `solveCount` and `tutorialCompleted` fields
- **Cell component**: Now displays numbers, supports locked state
- **WelcomeView**: Updated with game logo and description
