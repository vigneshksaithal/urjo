# Puzzle Generation Algorithm Design

## Overview
This document outlines the algorithmic approach to generating valid, solvable, and interesting puzzles for the color grid game.

---

## Phase 1: Generate a Valid Solution Grid

### Approach 1: Backtracking with Constraint Propagation

**Algorithm:**
1. Start with an empty 4×4 grid
2. Fill cells one by one (left-to-right, top-to-bottom)
3. For each empty cell:
   - Try red, then blue
   - Check if placement violates any constraints
   - If valid, move to next cell
   - If stuck, backtrack to previous cell and try alternate color
4. Continue until grid is complete

**Constraints to Check During Generation:**
- Row count: Does this row already have 2 reds or 2 blues?
- Column count: Does this column already have 2 reds or 2 blues?
- Row uniqueness: When completing a row, is it identical to the previous row?
- Column uniqueness: When completing a column, is it identical to an adjacent column?

**Optimization:**
Use constraint propagation to reduce search space:
- If a row has 2 reds, remaining cells in that row MUST be blue
- If a column has 2 blues, remaining cells in that column MUST be red
- Fill "forced" cells first before trying alternatives

---

### Approach 2: Pattern-Based Generation

**Pre-computation:**
Generate all valid row patterns:
- There are C(4,2) = 6 possible arrangements of 2 reds and 2 blues:
  1. RRBB
  2. RBRB  
  3. RBBR
  4. BRRB
  5. BRBR
  6. BBRR

**Algorithm:**
1. Select row 1: Choose randomly from 6 patterns
2. Select row 2: Choose from patterns ≠ row 1 (5 options)
3. Select row 3: Choose from patterns ≠ row 2 AND satisfying column constraints
4. Select row 4: Must satisfy column constraints AND ≠ row 3

**Column Constraint Checking:**
After placing each row, verify columns are tracking toward 2R/2B:
- Count reds/blues in each column so far
- Ensure no column has exceeded 2 of either color
- When placing final rows, calculate required colors per column

**Advantages:**
- Faster than pure backtracking
- Easier to ensure row uniqueness
- Can pre-validate common invalid combinations

---

### Approach 3: Randomized Valid Grid Generation

**Algorithm:**
1. Generate a random valid starting grid using pattern library
2. Apply random transformations that preserve validity:
   - **Row swaps**: Swap non-adjacent rows
   - **Column swaps**: Swap non-adjacent columns  
   - **Color inversion**: Flip all reds to blue and blues to red
   - **Reflection**: Mirror grid horizontally or vertically
   - **Rotation**: Rotate grid 90°, 180°, or 270°

**Validation After Transformation:**
Check that no adjacent rows/columns became identical after transformation

**Benefits:**
- Creates diverse puzzles from seed templates
- Computationally cheap
- Guarantees validity if transformations are proven to preserve constraints

---

## Phase 2: Hint Placement (Number Selection)

Once you have a valid solution grid, determine which cells should display numbers.

### Step 1: Calculate All Neighbor Counts

For each cell in the solution:
1. Count orthogonally adjacent cells (up, down, left, right) with matching color
2. Store this count (0-4)

**Example:**
```
If cell (1,1) is RED and its neighbors are:
  - Up: (0,1) = BLUE
  - Down: (2,1) = RED
  - Left: (1,0) = RED  
  - Right: (1,2) = BLUE
Then cell (1,1) has count = 2 (two red neighbors)
```

### Step 2: Strategic Hint Selection

**Difficulty Tiers:**

**Easy Puzzles:**
- Show 6-8 numbers
- Include numbers at strategic positions (corners, edges)
- Include at least one "0" if available (very constraining)
- Include at least one "4" in middle of grid (very constraining)

**Medium Puzzles:**
- Show 4-6 numbers
- Avoid clustering hints
- Mix constraint strengths (some 1s, 2s, 3s)

**Hard Puzzles:**
- Show 3-4 numbers
- Place hints symmetrically for aesthetic appeal
- Avoid highly constraining numbers (0, 4)
- Prefer numbers that require multi-step deduction

### Step 3: Hint Placement Strategies

**Distribution Guidelines:**
- Spread hints across grid (avoid clustering in one region)
- Ensure at least one hint in each quadrant
- Balance hints between edges and center

**Information Value:**
Different positions provide different information density:
- **Corner cells** (2 neighbors): Lower information
- **Edge cells** (3 neighbors): Medium information  
- **Center cells** (4 neighbors): Higher information

**Symmetry:**
For aesthetic appeal, consider symmetric hint placement:
- Rotational symmetry (180°)
- Reflective symmetry (horizontal/vertical)
- Diagonal symmetry

---

## Phase 3: Uniqueness Verification

Critical: The puzzle must have **exactly one solution**.

### Algorithm: Solution Counter with Early Termination

```
function countSolutions(puzzle):
    solutions = 0
    
    function solve(grid, position):
        if solutions > 1:
            return  // Early termination - multiple solutions found
            
        if position == 16:  // All cells filled
            if isValid(grid):
                solutions++
            return
            
        if grid[position] is a hint:
            solve(grid, position + 1)  // Skip hint cells
        else:
            // Try red
            grid[position] = RED
            if couldBeValid(grid, position):
                solve(grid, position + 1)
            
            // Try blue
            grid[position] = BLUE
            if couldBeValid(grid, position):
                solve(grid, position + 1)
            
            grid[position] = EMPTY
    
    solve(puzzle, 0)
    return solutions
```

**Usage:**
- If `countSolutions(puzzle) == 1`: Valid puzzle ✓
- If `countSolutions(puzzle) == 0`: No solution (error in generation)
- If `countSolutions(puzzle) > 1`: Multiple solutions - add more hints

**Optimization:**
Use constraint propagation during solving to prune invalid branches early:
- Check row/column counts as you fill
- Check adjacent line uniqueness incrementally

---

## Phase 4: Difficulty Calibration

### Metrics for Difficulty Assessment

**1. Hint Count**
- More hints → Easier
- Typical range: 3-8 hints

**2. Logical Complexity**
Classify required solving techniques:

**Level 1 - Direct Deduction:**
- "This row has 2 reds, remaining cells must be blue"
- "Number 0 means all neighbors must be opposite color"

**Level 2 - Constraint Intersection:**
- "This cell must be red because column needs 1 more red AND row needs 1 more red"

**Level 3 - Uniqueness Constraint:**
- "If this cell is red, row becomes identical to row above, so must be blue"

**Level 4 - Multi-Step Deduction:**
- Requires chaining multiple constraints
- "If A is red, then B must be blue, which means C must be red, which violates column count, so A must be blue"

**3. Forced Moves Ratio**
- Count cells that have only one valid option at each step
- Higher ratio → Easier
- Lower ratio → Requires trial-and-error or deeper reasoning

**4. Branching Factor**
- How many decision points require guessing vs. pure logic?
- Puzzles solvable without guessing are more satisfying

### Difficulty Algorithm

```
function assessDifficulty(puzzle):
    difficulty = 0
    
    // Factor 1: Hint count (inverse relationship)
    difficulty += (8 - hintCount) * 10
    
    // Factor 2: Solve complexity
    techniques = simulateSolve(puzzle)
    for each technique used:
        difficulty += technique.weight
    
    // Factor 3: Branching points
    difficulty += branchingPoints * 15
    
    return difficulty
```

---

## Complete Generation Pipeline

### High-Level Flow

```
1. Generate Valid Solution Grid
   ├─ Use Pattern-Based or Backtracking approach
   └─ Verify all constraints satisfied

2. Calculate Neighbor Counts
   └─ For every cell, count matching neighbors

3. Place Initial Hints
   ├─ Choose 4-6 strategic positions
   └─ Record their numbers

4. Verify Uniqueness
   ├─ Run solution counter
   └─ If multiple solutions → Add more hints → Retry

5. Assess Difficulty
   ├─ Simulate solve with human techniques
   └─ Classify as Easy/Medium/Hard

6. Polish (Optional)
   ├─ Improve hint symmetry
   ├─ Ensure good distribution
   └─ Adjust for target difficulty

7. Output Puzzle
```

---

## Advanced Techniques

### Generating Themed Difficulty Sets

**Progressive Difficulty:**
1. Generate many puzzles (e.g., 100)
2. Sort by difficulty score
3. Select spread across difficulty spectrum
4. Provide as "level progression"

### Ensuring Variety

**Avoid Pattern Repetition:**
- Track solution grids generated
- Ensure new puzzles have different solution patterns
- Use transformation library to create variations

**Hint Pattern Variety:**
- Track which cells have been used as hints
- Rotate hint positions across puzzle set
- Ensure diverse number distributions (mix of 0s, 1s, 2s, 3s, 4s)

### Player Skill Adaptation

**Dynamic Difficulty:**
1. Track player solve times and error rates
2. If player solves quickly with few errors → Increase difficulty
3. If player struggles → Decrease difficulty  
4. Maintain engagement by matching puzzle difficulty to skill level

---

## Implementation Considerations

### Performance Optimization

**Grid Size:**
- 4×4 grid is small → Brute force acceptable
- For larger grids (6×6, 8×8), constraint propagation critical

**Caching:**
- Pre-generate valid row patterns
- Cache column constraint checks
- Memoize partial solutions in backtracking

**Parallel Generation:**
- Generate multiple puzzles simultaneously
- Especially useful for creating puzzle banks

### Quality Assurance

**Test Suite:**
- Verify all generated puzzles are solvable
- Verify uniqueness of solutions
- Verify difficulty ratings align with player data
- Test edge cases (minimum hints, maximum difficulty)

**Validation:**
- Run automated solver on every puzzle
- Log any puzzles that fail validation
- Track generation success rate

---

## Summary of Key Algorithms

| Phase | Algorithm | Purpose | Complexity |
|-------|-----------|---------|------------|
| Solution Generation | Backtracking + Constraint Propagation | Create valid grid | O(2^n) with pruning |
| Solution Generation | Pattern-Based Selection | Faster valid grid | O(n) with validation |
| Hint Placement | Greedy Strategic Selection | Choose informative hints | O(n²) |
| Uniqueness Check | Solution Counter with Early Exit | Ensure single solution | O(2^n) worst case |
| Difficulty Rating | Technique Classification | Assess puzzle difficulty | O(n²) |

---

## Example Generation Walkthrough

**Target:** Generate a Medium difficulty puzzle

1. **Generate Solution:**
   - Use pattern-based approach
   - Result: 
     ```
     R R B B
     B R R B
     R B B R
     B B R R
     ```

2. **Calculate Neighbors:**
   - Cell (0,0) = R, neighbors: R(right), B(down) → count = 1
   - Cell (1,1) = R, neighbors: R(left), R(right), R(up), B(down) → count = 3
   - ... (calculate for all 16 cells)

3. **Select Hints (targeting 5 hints):**
   - Place number at (0,1): R with count 2
   - Place number at (1,3): B with count 1
   - Place number at (2,0): R with count 0
   - Place number at (2,2): B with count 3
   - Place number at (3,1): B with count 2

4. **Verify Uniqueness:**
   - Run solver: Exactly 1 solution ✓

5. **Assess Difficulty:**
   - 5 hints → Medium range
   - Requires Level 2 techniques → Medium complexity
   - Few forced moves initially → Moderate difficulty
   - **Rating: Medium** ✓

6. **Output Puzzle:**
   ```
   - [2] - -
   - - - [1]
   [0] - [3] -
   - [2] - -
   ```

---

## Conclusion

Effective puzzle generation requires balancing:
- **Validity** (satisfying all constraints)
- **Solvability** (exactly one solution)
- **Difficulty** (appropriate challenge level)
- **Variety** (avoiding repetitive patterns)
- **Aesthetics** (pleasing hint distribution)

The algorithms outlined above provide a framework for generating high-quality puzzles programmatically while maintaining these desirable properties.
