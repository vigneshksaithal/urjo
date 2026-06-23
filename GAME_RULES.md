# Urjo — Complete Game Rules & Mechanics

Urjo is a binary grid puzzle game. Every cell in the grid is one of two colors: **red** or **blue**. You start with a partially filled board and must fill in the rest without breaking any of the rules.

---

## The Grid

The board is a square grid. Three sizes are available:

| Size | Cells | Per row/column |
|------|-------|----------------|
| 4×4  | 16    | 2 red + 2 blue |
| 6×6  | 36    | 3 red + 3 blue |
| 8×8  | 64    | 4 red + 4 blue |

**Locked cells** (pre-filled clues) are shown at the start of the puzzle. You cannot change them. Everything else starts empty.

---

## The Four Rules

A puzzle is solved only when **all four rules are satisfied simultaneously**.

### Rule 1 — Balance
Every row and every column must contain exactly equal counts of red and blue.

- On a 4×4 grid: 2 red + 2 blue per row, 2 red + 2 blue per column.
- On a 6×6 grid: 3 red + 3 blue per row/column.
- On an 8×8 grid: 4 red + 4 blue per row/column.

### Rule 2 — No Identical Adjacent Rows
No two rows that are next to each other can have the same color pattern from left to right. This only applies when both rows are fully filled.

✅ `R B R B` next to `B R B R` — different, allowed  
❌ `R B R B` next to `R B R B` — identical, not allowed

### Rule 3 — No Identical Adjacent Columns
Same rule applies to columns. Two neighboring columns cannot have the same color pattern top to bottom.

### Rule 4 — Number Constraints
Some locked cells display a number. That number tells you exactly how many of its surrounding cells (up to 8 neighbors, including diagonals) share the same color as that numbered cell.

- A **red cell showing `2`** must touch exactly 2 red cells among its neighbors.
- A **blue cell showing `4`** must touch exactly 4 blue cells.

The count includes all 8 surrounding positions — orthogonal and diagonal.

---

## How to Interact with Cells

**Tap** cycles the cell through three states:
```
empty → blue → red → empty → ...
```

**Swipe up** on a cell → sets it to blue  
**Swipe down** on a cell → sets it to red

Locked cells (pre-filled clues) cannot be changed.

---

## Real-Time Feedback

The board gives live feedback as you fill in cells:

- **Row/column turns red** when you exceed the color limit for that line (e.g., 3 reds in a row on a 4×4 grid). This means you have a definite violation — you need to fix it.
- Individual cells highlight errors when number constraints are broken (too many same-color neighbors, or all neighbors filled but count doesn't match).
- Errors only flag **definite** violations, not speculative future ones.

---

## Winning

The puzzle is complete when:
1. Every cell is filled (no empty cells).
2. Every row has exactly `gridSize/2` red and `gridSize/2` blue.
3. Every column has exactly `gridSize/2` red and `gridSize/2` blue.
4. No two adjacent rows have the same color pattern.
5. No two adjacent columns have the same color pattern.
6. All numbered cells have exactly the right number of same-color neighbors.

When you solve it, the completion screen shows your **time in seconds**.

---

## Tutorial (Worked Example)

The built-in tutorial uses a 4×4 board. You fill in 4 cells, one at a time:

**Starting board** (R = red, B = blue, `_` = empty, numbers shown in brackets):

```
_   R[2]  B    B
B   B     _    R
R   _     R[4] B
B   R     _    R
```

Steps:
1. **Cell (3,2)** → tap to color it blue. Teaches: "tap an empty cell to color it."
2. **Cell (1,2)** → tap twice to reach red. Teaches: "tap again to cycle the color."
3. **Cell (2,1)** → color it blue. Teaches: "every line needs 2 red + 2 blue — this row already has 2 red."
4. **Cell (0,0)** → color it red. Teaches: "the red `2` at (0,1) needs exactly one more red neighbor — diagonals count."

Final solved board:
```
R   R[2]  B    B
B   B     R    R
R   B     R[4] B
B   R     B    R
```

---

## Scoring & Progression

### Coins
- Earned each time you complete a puzzle.
- Displayed in the header alongside your streak.

### Streak
- Increments each day you solve at least one puzzle.
- Displayed as a flame icon + day count.
- Streak milestones (e.g., 7 days, 30 days) trigger a bonus coin reward and a celebratory overlay.

### Hints
- A hint highlights one correct empty cell in its target color with a pulsing animation.
- One hint is active at a time.

---

## Social Features

### Leaderboard
- Shows top solve times for the current puzzle.
- Accessible from the game screen.

### Comment Your Victory
- After solving, you can post a public victory comment on the puzzle post showing your time, mistake count, and solve stats.

### Rival Challenge
- After solving, you can create a **rival challenge post** in the subreddit.
- Other players can open your challenge link and try to beat your time on the same puzzle.
- When you open someone else's challenge link, a banner shows the challenger's username and their time to beat.
- If you beat their time, the completion screen announces it.

---

## Weekend Events
- Occasionally, a timed event runs (shown as a banner at the top of the screen).
- Events multiply coins earned for the duration (e.g., `2× coins`).
- The banner shows the event name, multiplier, and hours remaining.

---

## Seasons
- Periodic leaderboards where players accumulate points across puzzles.
- Rank and score are shown in the progression strip.

---

## Grid Size Selection
- On regular puzzle posts, you can switch between 4×4, 6×6, and 8×8 grids.
- Challenge posts are locked to the grid size used when the challenge was created.

---

## UI Summary

| Element | What it does |
|---------|-------------|
| Header | Puzzle number (left), coin balance (right) |
| Coin + streak strip | Below header; hidden for logged-out users |
| Game board | Square, centered, fills available vertical space |
| Footer | Settings button (right); mod "⚡ Solve" button (center, mod-only) |
| Completion overlay | Full-screen; shows time, coins, action buttons |
| Settings sheet | Bottom drawer; "How to Play" tutorial replay |

---

## Constraints Reference

```
isGridComplete = (grid, gridSize) =>
  allCellsFilled
  && each row has exactly gridSize/2 red and gridSize/2 blue
  && each col has exactly gridSize/2 red and gridSize/2 blue
  && no two adjacent rows are identical (when both fully filled)
  && no two adjacent cols are identical (when both fully filled)
  && all numbered cells have sameColorNeighborCount === cell.number
```

`sameColorNeighborCount` counts all 8 surrounding positions (orthogonal + diagonal) that share the cell's color.
