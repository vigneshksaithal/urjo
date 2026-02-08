# Color Puzzle Game Rules

## Objective
Fill a 4×4 grid with red and blue colored spots following specific constraints.

## Basic Rules

### 1. Color Balance
- **Each row** must contain exactly **2 red spots** and **2 blue spots**
- **Each column** must contain exactly **2 red spots** and **2 blue spots**

### 2. Unique Lines
- **No two adjacent rows** can be identical (have the same color pattern)
- **No two adjacent columns** can be identical (have the same color pattern)

### 3. Numbered Spots Constraint
Some spots contain numbers (0, 2, 3, 4, etc.). These numbers indicate:
- **How many surrounding spots** (orthogonally adjacent: up, down, left, right) **must be the same color** as the numbered spot itself

**Examples:**
- A **red spot with number 2** must have exactly **2 red spots** surrounding it
- A **blue spot with number 3** must have exactly **3 blue spots** surrounding it  
- A **blue spot with number 0** must have **0 blue spots** surrounding it (all surrounding spots must be red)
- A **red spot with number 4** must have exactly **4 red spots** surrounding it (all four orthogonal neighbors)

## How to Play

**Controls:**
- **Tap and swipe upward** to select **blue**
- **Tap and swipe downward** to select **red**

## Strategy Tips

1. Start with numbered spots as they provide the most constraints
2. Check row and column counts frequently - if a line already has 2 of one color, the remaining spots must be the other color
3. Before placing a color, verify it won't create an identical adjacent line
4. Work systematically, using the process of elimination

## Winning Condition

The puzzle is solved when:
- ✓ All spots are colored (no half-colored spots remain)
- ✓ Every row has exactly 2 red and 2 blue spots
- ✓ Every column has exactly 2 red and 2 blue spots
- ✓ All numbered spot constraints are satisfied
- ✓ No two adjacent rows are identical
- ✓ No two adjacent columns are identical

## Common Mistakes

❌ Having 3 spots of one color and 1 of another in a row/column  
❌ Creating identical patterns in adjacent rows or columns  
❌ Not satisfying numbered spot constraints (e.g., a number 3 having 4 surrounding spots of the same color)
