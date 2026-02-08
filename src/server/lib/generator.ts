/**
 * Urjo Puzzle Generator
 * Generates valid 4x4 Urjo puzzles with unique solutions.
 *
 * Rules:
 * 1. Each row and column has exactly 2 red and 2 blue cells.
 * 2. Numbers on a cell indicate how many orthogonal neighbors share
 *    that cell's color. Numbers are ALWAYS colored (never colorless).
 * 3. No two adjacent rows are identical; no two adjacent columns are identical.
 *
 * Valid clue types:
 * - Full clue: colored cell WITH number (locked)
 * - Color-only: colored cell WITHOUT number (locked)
 * - Empty: no color, no number (player fills in)
 */

import type { Cell, Grid, SerializedPuzzle, CellColor } from '../../shared/types'

const GRID_SIZE = 4
const MAX_GENERATION_ATTEMPTS = 200

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Shuffle array in place (Fisher-Yates) and return it.
 */
function shuffle<T>(array: T[]): T[] {
	const arr = [...array]
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		const temp = arr[i]!
		arr[i] = arr[j]!
		arr[j] = temp
	}
	return arr
}

/**
 * Safely access a cell from the grid (returns undefined if out of bounds).
 */
function getCell(grid: Grid, row: number, col: number): Cell | undefined {
	if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return undefined
	return grid[row]![col]!
}

/**
 * Create a deep copy of the grid.
 */
function deepCopyGrid(grid: Grid): Grid {
	return grid.map((row) => row.map((cell) => ({ ...cell })))
}

// ─── Constraint Checkers ─────────────────────────────────────────────────────

/**
 * Count orthogonal neighbors of same color (up, down, left, right only).
 */
export function countSameColorNeighbors(grid: Grid, row: number, col: number): number {
	const cell = getCell(grid, row, col)
	if (!cell || cell.color === null) return 0

	const color = cell.color
	let count = 0
	const neighbors: Array<[number, number]> = [
		[row - 1, col],
		[row + 1, col],
		[row, col - 1],
		[row, col + 1],
	]

	for (const [nr, nc] of neighbors) {
		const neighbor = getCell(grid, nr, nc)
		if (neighbor && neighbor.color === color) {
			count++
		}
	}

	return count
}

/**
 * Check if grid has equal red/blue in all fully-filled rows and columns.
 */
export function isBalanced(grid: Grid): boolean {
	for (let row = 0; row < GRID_SIZE; row++) {
		let redCount = 0
		let blueCount = 0
		for (let col = 0; col < GRID_SIZE; col++) {
			const c = grid[row]![col]!.color
			if (c === 'red') redCount++
			if (c === 'blue') blueCount++
		}
		if (redCount !== 2 || blueCount !== 2) return false
	}

	for (let col = 0; col < GRID_SIZE; col++) {
		let redCount = 0
		let blueCount = 0
		for (let row = 0; row < GRID_SIZE; row++) {
			const c = grid[row]![col]!.color
			if (c === 'red') redCount++
			if (c === 'blue') blueCount++
		}
		if (redCount !== 2 || blueCount !== 2) return false
	}

	return true
}

/**
 * Check if any adjacent rows are identical.
 */
export function hasAdjacentIdenticalRows(grid: Grid): boolean {
	for (let i = 0; i < GRID_SIZE - 1; i++) {
		const row1 = grid[i]!
		const row2 = grid[i + 1]!
		if (row1.every((cell, j) => cell.color === row2[j]!.color)) {
			return true
		}
	}
	return false
}

/**
 * Check if any adjacent columns are identical.
 */
export function hasAdjacentIdenticalColumns(grid: Grid): boolean {
	for (let col = 0; col < GRID_SIZE - 1; col++) {
		let identical = true
		for (let row = 0; row < GRID_SIZE; row++) {
			if (grid[row]![col]!.color !== grid[row]![col + 1]!.color) {
				identical = false
				break
			}
		}
		if (identical) return true
	}
	return false
}

/**
 * Check all number constraints are satisfied.
 * Only checks cells that have BOTH a color and a number (valid Urjo clues).
 */
export function numberConstraintsSatisfied(grid: Grid): boolean {
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			const cell = grid[row]![col]!
			if (cell.number !== null && cell.color !== null) {
				const actual = countSameColorNeighbors(grid, row, col)
				if (actual !== cell.number) return false
			}
		}
	}
	return true
}

// ─── Solution Generation (Backtracking) ──────────────────────────────────────

/**
 * Generate a valid solution grid using backtracking with constraint propagation.
 * Fills cells left-to-right, top-to-bottom, enforcing row/column balance and
 * adjacent line uniqueness at each step. Randomizes color order for variety.
 */
function generateSolution(): Grid {
	const grid: Grid = []
	for (let r = 0; r < GRID_SIZE; r++) {
		const row: Cell[] = []
		for (let c = 0; c < GRID_SIZE; c++) {
			row.push({ color: null, number: null, locked: false })
		}
		grid.push(row)
	}

	// Track counts for fast constraint checking
	const rowRed = new Array(GRID_SIZE).fill(0) as number[]
	const rowBlue = new Array(GRID_SIZE).fill(0) as number[]
	const colRed = new Array(GRID_SIZE).fill(0) as number[]
	const colBlue = new Array(GRID_SIZE).fill(0) as number[]

	const getRowString = (r: number): string => {
		return grid[r]!.map((c) => c.color).join(',')
	}

	const getColString = (c: number): string => {
		return grid.map((row) => row[c]!.color).join(',')
	}

	const fill = (index: number): boolean => {
		if (index === GRID_SIZE * GRID_SIZE) return true

		const row = Math.floor(index / GRID_SIZE)
		const col = index % GRID_SIZE

		// Randomize color order for diversity
		const colors: CellColor[] = Math.random() < 0.5 ? ['red', 'blue'] : ['blue', 'red']

		for (const color of colors) {
			// Check row balance
			if (color === 'red' && rowRed[row]! >= 2) continue
			if (color === 'blue' && rowBlue[row]! >= 2) continue

			// Check column balance
			if (color === 'red' && colRed[col]! >= 2) continue
			if (color === 'blue' && colBlue[col]! >= 2) continue

			// Place the color
			grid[row]![col]!.color = color
			if (color === 'red') {
				rowRed[row]!++
				colRed[col]!++
			} else {
				rowBlue[row]!++
				colBlue[col]!++
			}

			// Check adjacent row uniqueness when this row is fully filled
			let valid = true
			if (col === GRID_SIZE - 1) {
				// Row is complete — check against adjacent rows
				if (row > 0) {
					const prevFilled = grid[row - 1]!.every((c) => c.color !== null)
					if (prevFilled && getRowString(row) === getRowString(row - 1)) {
						valid = false
					}
				}
			}

			// Check adjacent column uniqueness when this column is fully filled
			if (valid && row === GRID_SIZE - 1) {
				// Column is complete — check against adjacent columns
				if (col > 0) {
					const prevColFilled = grid.every((r) => r[col - 1]!.color !== null)
					if (prevColFilled && getColString(col) === getColString(col - 1)) {
						valid = false
					}
				}
			}

			if (valid && fill(index + 1)) return true

			// Undo
			grid[row]![col]!.color = null
			if (color === 'red') {
				rowRed[row]!--
				colRed[col]!--
			} else {
				rowBlue[row]!--
				colBlue[col]!--
			}
		}

		return false
	}

	if (!fill(0)) {
		throw new Error('Failed to generate valid solution')
	}

	return grid
}

// ─── Brute-Force Uniqueness Checker ──────────────────────────────────────────

/**
 * Check if placing a color at (row, col) could still lead to a valid solution.
 * Used by the brute-force solver for pruning.
 */
function couldBeValid(grid: Grid, row: number, col: number): boolean {
	const cell = getCell(grid, row, col)
	if (!cell || cell.color === null) return true

	// Check row balance
	let rRed = 0
	let rBlue = 0
	for (let c = 0; c < GRID_SIZE; c++) {
		const color = grid[row]![c]!.color
		if (color === 'red') rRed++
		if (color === 'blue') rBlue++
	}
	if (rRed > 2 || rBlue > 2) return false

	// Check column balance
	let cRed = 0
	let cBlue = 0
	for (let r = 0; r < GRID_SIZE; r++) {
		const color = grid[r]![col]!.color
		if (color === 'red') cRed++
		if (color === 'blue') cBlue++
	}
	if (cRed > 2 || cBlue > 2) return false

	// Check adjacent row uniqueness when row is fully filled
	const rowFilled = rRed + rBlue === GRID_SIZE
	if (rowFilled) {
		const thisRow = grid[row]!
		if (row > 0) {
			const prevRow = grid[row - 1]!
			const prevFilled = prevRow.every((c) => c.color !== null)
			if (prevFilled && thisRow.every((c, i) => c.color === prevRow[i]!.color)) {
				return false
			}
		}
		if (row < GRID_SIZE - 1) {
			const nextRow = grid[row + 1]!
			const nextFilled = nextRow.every((c) => c.color !== null)
			if (nextFilled && thisRow.every((c, i) => c.color === nextRow[i]!.color)) {
				return false
			}
		}
	}

	// Check adjacent column uniqueness when column is fully filled
	const colFilled = cRed + cBlue === GRID_SIZE
	if (colFilled) {
		if (col > 0) {
			const prevColFilled = grid.every((r) => r[col - 1]!.color !== null)
			if (prevColFilled && grid.every((r) => r[col]!.color === r[col - 1]!.color)) {
				return false
			}
		}
		if (col < GRID_SIZE - 1) {
			const nextColFilled = grid.every((r) => r[col + 1]!.color !== null)
			if (nextColFilled && grid.every((r) => r[col]!.color === r[col + 1]!.color)) {
				return false
			}
		}
	}

	// Check number constraints for this cell and its neighbors.
	// Numbers always have a color in valid Urjo puzzles, so we only
	// check cells where both color and number are present.
	const cellsToCheck: Array<[number, number]> = [
		[row, col],
		[row - 1, col],
		[row + 1, col],
		[row, col - 1],
		[row, col + 1],
	]

	for (const [r, c] of cellsToCheck) {
		const checkCell = getCell(grid, r, c)
		if (!checkCell || checkCell.number === null || checkCell.color === null) continue

		let sameCount = 0
		let unfilledCount = 0
		const dirs: Array<[number, number]> = [
			[r - 1, c],
			[r + 1, c],
			[r, c - 1],
			[r, c + 1],
		]
		for (const [dr, dc] of dirs) {
			const neighbor = getCell(grid, dr, dc)
			if (!neighbor) continue
			if (neighbor.color === null) {
				unfilledCount++
			} else if (neighbor.color === checkCell.color) {
				sameCount++
			}
		}

		// Too many same-color neighbors already
		if (sameCount > checkCell.number) return false
		// Not enough potential neighbors to reach the target
		if (sameCount + unfilledCount < checkCell.number) return false
	}

	return true
}

/**
 * Count solutions for a puzzle grid (early termination at maxCount).
 * Works directly with the grid's embedded number constraints.
 */
function countSolutions(puzzleGrid: Grid, maxCount: number = 2): number {
	const grid = deepCopyGrid(puzzleGrid)

	// Find empty cells (cells the player would need to fill)
	const emptyCells: Array<[number, number]> = []
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			if (grid[row]![col]!.color === null) {
				emptyCells.push([row, col])
			}
		}
	}

	let solutions = 0

	const solve = (index: number): void => {
		if (solutions >= maxCount) return

		if (index === emptyCells.length) {
			if (
				isBalanced(grid) &&
				!hasAdjacentIdenticalRows(grid) &&
				!hasAdjacentIdenticalColumns(grid) &&
				numberConstraintsSatisfied(grid)
			) {
				solutions++
			}
			return
		}

		const pos = emptyCells[index]!
		const [row, col] = pos
		const colors: CellColor[] = ['red', 'blue']

		for (const color of colors) {
			grid[row]![col]!.color = color

			if (couldBeValid(grid, row, col)) {
				solve(index + 1)
			}

			if (solutions >= maxCount) return
		}

		grid[row]![col]!.color = null
	}

	solve(0)
	return solutions
}

// ─── Logic Solver ────────────────────────────────────────────────────────────

/**
 * Propagate deterministic constraints on the grid (mutates in place).
 * Applies balance forcing, number constraints, and adjacent uniqueness.
 * Returns 'invalid' on contradiction, 'progress' if cells were filled,
 * or 'stable' if no changes were made.
 */
function propagateConstraints(grid: Grid): 'invalid' | 'progress' | 'stable' {
	let anyProgress = false
	let changed = true

	while (changed) {
		changed = false

		// ── Rule 1: Row balance forcing ──
		// If a row already has 2 of one color, remaining empty cells must be the other.
		for (let row = 0; row < GRID_SIZE; row++) {
			let red = 0
			let blue = 0
			const empty: number[] = []
			for (let col = 0; col < GRID_SIZE; col++) {
				const c = grid[row]![col]!.color
				if (c === 'red') red++
				else if (c === 'blue') blue++
				else empty.push(col)
			}
			if (red > 2 || blue > 2) return 'invalid'
			if (empty.length > 0) {
				if (red === 2) {
					for (const col of empty) {
						grid[row]![col]!.color = 'blue'
					}
					changed = true
					anyProgress = true
				} else if (blue === 2) {
					for (const col of empty) {
						grid[row]![col]!.color = 'red'
					}
					changed = true
					anyProgress = true
				}
			}
		}

		// ── Rule 1: Column balance forcing ──
		for (let col = 0; col < GRID_SIZE; col++) {
			let red = 0
			let blue = 0
			const empty: number[] = []
			for (let row = 0; row < GRID_SIZE; row++) {
				const c = grid[row]![col]!.color
				if (c === 'red') red++
				else if (c === 'blue') blue++
				else empty.push(row)
			}
			if (red > 2 || blue > 2) return 'invalid'
			if (empty.length > 0) {
				if (red === 2) {
					for (const row of empty) {
						grid[row]![col]!.color = 'blue'
					}
					changed = true
					anyProgress = true
				} else if (blue === 2) {
					for (const row of empty) {
						grid[row]![col]!.color = 'red'
					}
					changed = true
					anyProgress = true
				}
			}
		}

		// ── Rule 2: Number constraint forcing ──
		// Numbers always have a color in valid Urjo puzzles.
		// If a numbered cell's same-color neighbor count is satisfied, remaining
		// neighbors must be the opposite color. If all unfilled neighbors are
		// needed to reach the count, they must all be the same color.
		for (let row = 0; row < GRID_SIZE; row++) {
			for (let col = 0; col < GRID_SIZE; col++) {
				const cell = grid[row]![col]!
				// Only process cells with both a color and a number
				if (cell.number === null || cell.color === null) continue

				const dirs: Array<[number, number]> = [
					[row - 1, col],
					[row + 1, col],
					[row, col - 1],
					[row, col + 1],
				]
				let sameCount = 0
				const unfilled: Array<[number, number]> = []

				for (const [r, c] of dirs) {
					const n = getCell(grid, r, c)
					if (!n) continue
					if (n.color === null) unfilled.push([r, c])
					else if (n.color === cell.color) sameCount++
				}

				if (sameCount > cell.number) return 'invalid'
				if (sameCount + unfilled.length < cell.number) return 'invalid'

				if (unfilled.length > 0) {
					// All needed neighbors satisfied — rest must be opposite
					if (sameCount === cell.number) {
						const opp: CellColor = cell.color === 'red' ? 'blue' : 'red'
						for (const [r, c] of unfilled) {
							grid[r]![c]!.color = opp
						}
						changed = true
						anyProgress = true
					}
					// All unfilled neighbors needed — they must all match
					else if (sameCount + unfilled.length === cell.number) {
						for (const [r, c] of unfilled) {
							grid[r]![c]!.color = cell.color
						}
						changed = true
						anyProgress = true
					}
				}
			}
		}

		// ── Rule 3: Adjacent row uniqueness (rows with 1 empty cell) ──
		// If a row has exactly one empty cell and an adjacent row is fully filled,
		// the empty cell must differ from the adjacent row's cell at that position
		// (otherwise the two rows would be identical).
		for (let i = 0; i < GRID_SIZE; i++) {
			const row = grid[i]!
			const emptyCols: number[] = []
			for (let col = 0; col < GRID_SIZE; col++) {
				if (row[col]!.color === null) emptyCols.push(col)
			}
			if (emptyCols.length !== 1) continue
			const emptyCol = emptyCols[0]!

			for (const adj of [i - 1, i + 1]) {
				if (adj < 0 || adj >= GRID_SIZE) continue
				const adjRow = grid[adj]!
				if (!adjRow.every((c) => c.color !== null)) continue

				let allMatch = true
				for (let col = 0; col < GRID_SIZE; col++) {
					if (col === emptyCol) continue
					if (row[col]!.color !== adjRow[col]!.color) {
						allMatch = false
						break
					}
				}

				if (allMatch) {
					const forbidden = adjRow[emptyCol]!.color!
					row[emptyCol]!.color = forbidden === 'red' ? 'blue' : 'red'
					changed = true
					anyProgress = true
				}
			}
		}

		// ── Rule 3: Adjacent column uniqueness (columns with 1 empty cell) ──
		for (let col = 0; col < GRID_SIZE; col++) {
			const emptyRows: number[] = []
			for (let row = 0; row < GRID_SIZE; row++) {
				if (grid[row]![col]!.color === null) emptyRows.push(row)
			}
			if (emptyRows.length !== 1) continue
			const emptyRow = emptyRows[0]!

			for (const adj of [col - 1, col + 1]) {
				if (adj < 0 || adj >= GRID_SIZE) continue
				if (!grid.every((r) => r[adj]!.color !== null)) continue

				let allMatch = true
				for (let row = 0; row < GRID_SIZE; row++) {
					if (row === emptyRow) continue
					if (grid[row]![col]!.color !== grid[row]![adj]!.color) {
						allMatch = false
						break
					}
				}

				if (allMatch) {
					const forbidden = grid[emptyRow]![adj]!.color!
					grid[emptyRow]![col]!.color = forbidden === 'red' ? 'blue' : 'red'
					changed = true
					anyProgress = true
				}
			}
		}

		// ── Validity: Detect contradictions from identical adjacent filled lines ──
		for (let i = 0; i < GRID_SIZE - 1; i++) {
			const r1 = grid[i]!
			const r2 = grid[i + 1]!
			if (
				r1.every((c) => c.color !== null) &&
				r2.every((c) => c.color !== null) &&
				r1.every((c, j) => c.color === r2[j]!.color)
			) {
				return 'invalid'
			}
		}
		for (let col = 0; col < GRID_SIZE - 1; col++) {
			if (
				grid.every((r) => r[col]!.color !== null) &&
				grid.every((r) => r[col + 1]!.color !== null) &&
				grid.every((r) => r[col]!.color === r[col + 1]!.color)
			) {
				return 'invalid'
			}
		}
	}

	return anyProgress ? 'progress' : 'stable'
}

/**
 * Check if placing a color at (row, col) leads to a contradiction
 * by propagating all deterministic constraints on a deep copy.
 */
function canPlaceColor(grid: Grid, row: number, col: number, color: CellColor): boolean {
	const test = deepCopyGrid(grid)
	test[row]![col]!.color = color
	return propagateConstraints(test) !== 'invalid'
}

/**
 * Solve a puzzle using only deterministic logic (no guessing/backtracking).
 * Returns 'solved' if fully determined, 'stuck' if progress stalls,
 * or 'invalid' if a contradiction is found.
 */
function solveByLogic(puzzleGrid: Grid): 'solved' | 'stuck' | 'invalid' {
	const grid = deepCopyGrid(puzzleGrid)

	let progress = true
	while (progress) {
		progress = false

		const result = propagateConstraints(grid)
		if (result === 'invalid') return 'invalid'
		if (result === 'progress') {
			progress = true
			continue
		}

		// Rule 4: Elimination — for each empty cell, try both colors.
		// If one leads to immediate contradiction (via propagation), the
		// other must be correct. This is a human-applicable technique
		// ("if red here, then row overflows → must be blue").
		for (let row = 0; row < GRID_SIZE; row++) {
			for (let col = 0; col < GRID_SIZE; col++) {
				if (grid[row]![col]!.color !== null) continue

				const canRed = canPlaceColor(grid, row, col, 'red')
				const canBlue = canPlaceColor(grid, row, col, 'blue')

				if (!canRed && !canBlue) return 'invalid'
				if (canRed && !canBlue) {
					grid[row]![col]!.color = 'red'
					progress = true
				} else if (!canRed && canBlue) {
					grid[row]![col]!.color = 'blue'
					progress = true
				}
			}
		}
	}

	const allFilled = grid.every((row) => row.every((cell) => cell.color !== null))
	if (!allFilled) return 'stuck'

	if (!isBalanced(grid)) return 'invalid'
	if (hasAdjacentIdenticalRows(grid)) return 'invalid'
	if (hasAdjacentIdenticalColumns(grid)) return 'invalid'
	if (!numberConstraintsSatisfied(grid)) return 'invalid'

	return 'solved'
}

// ─── Clue Generation via Removal ─────────────────────────────────────────────

type DifficultyTarget = {
	minClues: number
	minNumbers: number
}

const DIFFICULTY_TARGETS: Record<'easy' | 'medium' | 'hard', DifficultyTarget> = {
	easy: { minClues: 6, minNumbers: 3 },
	medium: { minClues: 5, minNumbers: 2 },
	hard: { minClues: 4, minNumbers: 1 },
}

/**
 * Count the number of clue cells (cells that give the player information).
 * A clue is any cell that is locked (has a color) — it may or may not have a number.
 */
function countClues(grid: Grid): number {
	let count = 0
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			if (grid[row]![col]!.locked) count++
		}
	}
	return count
}

/**
 * Count the number of cells that have a number clue.
 */
function countNumbers(grid: Grid): number {
	let count = 0
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			if (grid[row]![col]!.number !== null) count++
		}
	}
	return count
}

/**
 * Generate puzzle clues by starting with the full solution and progressively
 * removing information while verifying logic solvability at each step.
 *
 * Three-phase removal strategy:
 * 1. Remove numbers from cells (keep color visible, drop the number).
 * 2. Remove entire cells (make them empty — player deduces color).
 * 3. Clean up remaining numbers on locked cells that aren't needed.
 *
 * This ensures every puzzle:
 * - Is solvable through pure logical deduction (no guessing)
 * - Has a unique solution
 * - Only uses valid Urjo clue types (numbers always have a color)
 */
function generateClues(
	solution: Grid,
	difficulty: 'easy' | 'medium' | 'hard'
): { puzzle: Grid; solution: Grid } | null {
	const targets = DIFFICULTY_TARGETS[difficulty]

	// Compute neighbor counts for every cell in the solution
	const neighborCounts: number[][] = []
	for (let row = 0; row < GRID_SIZE; row++) {
		const rowCounts: number[] = []
		for (let col = 0; col < GRID_SIZE; col++) {
			rowCounts.push(countSameColorNeighbors(solution, row, col))
		}
		neighborCounts.push(rowCounts)
	}

	// Start with full puzzle: all cells locked with color + number
	const puzzle: Grid = solution.map((row, r) =>
		row.map((cell, c) => ({
			color: cell.color,
			number: neighborCounts[r]![c]!,
			locked: true,
		}))
	)

	// Build shuffled position list
	const positions: Array<{ row: number; col: number }> = []
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			positions.push({ row, col })
		}
	}

	// Phase 1: Remove numbers from cells (keep color, drop number).
	// This reduces visual clutter while keeping the color as a hint.
	// Stop early if we've reached the minimum number of number clues.
	for (const { row, col } of shuffle(positions)) {
		if (countNumbers(puzzle) <= targets.minNumbers) break

		const cell = puzzle[row]![col]!
		if (!cell.locked || cell.number === null) continue

		const savedNumber = cell.number
		cell.number = null

		if (solveByLogic(puzzle) !== 'solved') {
			cell.number = savedNumber
		}
	}

	// Phase 2: Remove entire cells (make empty).
	// Try to remove cells to reach the difficulty target.
	// Also ensure removing a numbered cell doesn't drop below minNumbers.
	for (const { row, col } of shuffle(positions)) {
		if (countClues(puzzle) <= targets.minClues) break

		const cell = puzzle[row]![col]!
		if (!cell.locked) continue

		// Don't remove a numbered cell if it would drop below the minimum
		if (cell.number !== null && countNumbers(puzzle) <= targets.minNumbers) continue

		const saved = { ...cell }

		// Try making cell completely empty
		puzzle[row]![col]! = { color: null, number: null, locked: false }

		if (solveByLogic(puzzle) !== 'solved') {
			// Can't remove — restore
			puzzle[row]![col]! = saved
		}
	}

	// Phase 3: Final cleanup — try removing numbers from remaining locked cells
	// that still have them, in case earlier removals made them redundant.
	// Respect the minimum number count for the difficulty level.
	for (const { row, col } of shuffle(positions)) {
		if (countNumbers(puzzle) <= targets.minNumbers) break

		const cell = puzzle[row]![col]!
		if (!cell.locked || cell.number === null) continue

		const savedNumber = cell.number
		cell.number = null

		if (solveByLogic(puzzle) !== 'solved') {
			cell.number = savedNumber
		}
	}

	// Safety net: verify unique solution with brute-force solver
	if (countSolutions(puzzle) !== 1) return null

	return { puzzle, solution }
}

// ─── Serialization ───────────────────────────────────────────────────────────

/**
 * Serialize grid colors to string: 'r' = red, 'b' = blue, '.' = empty
 */
export function serializeGrid(grid: Grid): string {
	let result = ''
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			const color = grid[row]![col]!.color
			if (color === 'red') result += 'r'
			else if (color === 'blue') result += 'b'
			else result += '.'
		}
	}
	return result
}

/**
 * Serialize numbers to string: digit for number, '-' for no number
 */
export function serializeNumbers(grid: Grid): string {
	let result = ''
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			const num = grid[row]![col]!.number
			if (num !== null) result += num.toString()
			else result += '-'
		}
	}
	return result
}

/**
 * Deserialize string to grid.
 * puzzleColors determines which cells are locked (initial puzzle state).
 */
export function deserializeGrid(colors: string, numbers: string, puzzleColors?: string): Grid {
	const grid: Grid = []
	let index = 0

	for (let row = 0; row < GRID_SIZE; row++) {
		const rowCells: Cell[] = []
		for (let col = 0; col < GRID_SIZE; col++) {
			const colorChar = colors[index] ?? '.'
			const numberChar = numbers[index] ?? '-'

			const color: CellColor = colorChar === 'r' ? 'red' : colorChar === 'b' ? 'blue' : null
			const number = numberChar !== '-' ? parseInt(numberChar, 10) : null
			const locked = puzzleColors ? (puzzleColors[index] ?? '.') !== '.' : color !== null

			rowCells.push({ color, number, locked })
			index++
		}
		grid.push(rowCells)
	}

	return grid
}

// ─── Main Generator ──────────────────────────────────────────────────────────

/**
 * Generate a complete Urjo puzzle with proper hints and unique solution.
 */
export function generatePuzzle(
	difficulty: 'easy' | 'medium' | 'hard' = 'medium'
): SerializedPuzzle {
	for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
		const solution = generateSolution()
		const result = generateClues(solution, difficulty)

		if (result) {
			return {
				colors: serializeGrid(result.puzzle),
				numbers: serializeNumbers(result.puzzle),
				solution: serializeGrid(result.solution),
				difficulty,
			}
		}
	}

	throw new Error('Failed to generate puzzle with unique solution')
}
