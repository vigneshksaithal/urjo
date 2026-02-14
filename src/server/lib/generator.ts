/**
 * Urjo Puzzle Generator
 * Generates valid Urjo puzzles with unique solutions.
 * Supports 4x4 and 6x6 grid sizes.
 *
 * Rules:
 * 1. Each row and column has exactly gridSize/2 red and gridSize/2 blue cells.
 * 2. Numbers on a cell indicate how many surrounding neighbors (including
 *    diagonals) share that cell's color. Numbers are ALWAYS colored (never colorless).
 * 3. No two adjacent rows are identical; no two adjacent columns are identical.
 *
 * Valid clue types:
 * - Full clue: colored cell WITH number (locked)
 * - Color-only: colored cell WITHOUT number (locked)
 * - Empty: no color, no number (player fills in)
 */

import type { Cell, Grid, SerializedPuzzle, CellColor } from '../../shared/types'
import type { Difficulty } from '../../shared/constants'

const MAX_GENERATION_ATTEMPTS = 200

/** All 8 surrounding directions (orthogonal + diagonal). */
const ALL_DIRECTIONS: ReadonlyArray<[number, number]> = [
	[-1, -1], [-1, 0], [-1, 1],
	[ 0, -1],          [ 0, 1],
	[ 1, -1], [ 1, 0], [ 1, 1],
]

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
function getCell(grid: Grid, row: number, col: number, gridSize: number): Cell | undefined {
	if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return undefined
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
 * Count all surrounding neighbors (including diagonals) of same color.
 * Checks all 8 directions: up, down, left, right, and 4 diagonals.
 */
export function countSameColorNeighbors(grid: Grid, row: number, col: number, gridSize: number): number {
	const cell = getCell(grid, row, col, gridSize)
	if (!cell || cell.color === null) return 0

	const color = cell.color
	let count = 0

	for (const [dr, dc] of ALL_DIRECTIONS) {
		const neighbor = getCell(grid, row + dr, col + dc, gridSize)
		if (neighbor && neighbor.color === color) {
			count++
		}
	}

	return count
}

/**
 * Check if grid has equal red/blue in all fully-filled rows and columns.
 */
export function isBalanced(grid: Grid, gridSize: number): boolean {
	const half = gridSize / 2

	for (let row = 0; row < gridSize; row++) {
		let redCount = 0
		let blueCount = 0
		for (let col = 0; col < gridSize; col++) {
			const c = grid[row]![col]!.color
			if (c === 'red') redCount++
			if (c === 'blue') blueCount++
		}
		if (redCount !== half || blueCount !== half) return false
	}

	for (let col = 0; col < gridSize; col++) {
		let redCount = 0
		let blueCount = 0
		for (let row = 0; row < gridSize; row++) {
			const c = grid[row]![col]!.color
			if (c === 'red') redCount++
			if (c === 'blue') blueCount++
		}
		if (redCount !== half || blueCount !== half) return false
	}

	return true
}

/**
 * Check if any adjacent rows are identical.
 */
export function hasAdjacentIdenticalRows(grid: Grid, gridSize: number): boolean {
	for (let i = 0; i < gridSize - 1; i++) {
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
export function hasAdjacentIdenticalColumns(grid: Grid, gridSize: number): boolean {
	for (let col = 0; col < gridSize - 1; col++) {
		let identical = true
		for (let row = 0; row < gridSize; row++) {
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
export function numberConstraintsSatisfied(grid: Grid, gridSize: number): boolean {
	for (let row = 0; row < gridSize; row++) {
		for (let col = 0; col < gridSize; col++) {
			const cell = grid[row]![col]!
			if (cell.number !== null && cell.color !== null) {
				const actual = countSameColorNeighbors(grid, row, col, gridSize)
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
function generateSolution(gridSize: number): Grid {
	const half = gridSize / 2
	const grid: Grid = []
	for (let r = 0; r < gridSize; r++) {
		const row: Cell[] = []
		for (let c = 0; c < gridSize; c++) {
			row.push({ color: null, number: null, locked: false })
		}
		grid.push(row)
	}

	// Track counts for fast constraint checking
	const rowRed = new Array(gridSize).fill(0) as number[]
	const rowBlue = new Array(gridSize).fill(0) as number[]
	const colRed = new Array(gridSize).fill(0) as number[]
	const colBlue = new Array(gridSize).fill(0) as number[]

	const getRowString = (r: number): string => {
		return grid[r]!.map((c) => c.color).join(',')
	}

	const getColString = (c: number): string => {
		return grid.map((row) => row[c]!.color).join(',')
	}

	const fill = (index: number): boolean => {
		if (index === gridSize * gridSize) return true

		const row = Math.floor(index / gridSize)
		const col = index % gridSize

		// Randomize color order for diversity
		const colors: CellColor[] = Math.random() < 0.5 ? ['red', 'blue'] : ['blue', 'red']

		for (const color of colors) {
			// Check row balance
			if (color === 'red' && rowRed[row]! >= half) continue
			if (color === 'blue' && rowBlue[row]! >= half) continue

			// Check column balance
			if (color === 'red' && colRed[col]! >= half) continue
			if (color === 'blue' && colBlue[col]! >= half) continue

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
			if (col === gridSize - 1) {
				// Row is complete — check against adjacent rows
				if (row > 0) {
					const prevFilled = grid[row - 1]!.every((c) => c.color !== null)
					if (prevFilled && getRowString(row) === getRowString(row - 1)) {
						valid = false
					}
				}
			}

			// Check adjacent column uniqueness when this column is fully filled
			if (valid && row === gridSize - 1) {
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
function couldBeValid(grid: Grid, row: number, col: number, gridSize: number): boolean {
	const half = gridSize / 2
	const cell = getCell(grid, row, col, gridSize)
	if (!cell || cell.color === null) return true

	// Check row balance
	let rRed = 0
	let rBlue = 0
	for (let c = 0; c < gridSize; c++) {
		const color = grid[row]![c]!.color
		if (color === 'red') rRed++
		if (color === 'blue') rBlue++
	}
	if (rRed > half || rBlue > half) return false

	// Check column balance
	let cRed = 0
	let cBlue = 0
	for (let r = 0; r < gridSize; r++) {
		const color = grid[r]![col]!.color
		if (color === 'red') cRed++
		if (color === 'blue') cBlue++
	}
	if (cRed > half || cBlue > half) return false

	// Check adjacent row uniqueness when row is fully filled
	const rowFilled = rRed + rBlue === gridSize
	if (rowFilled) {
		const thisRow = grid[row]!
		if (row > 0) {
			const prevRow = grid[row - 1]!
			const prevFilled = prevRow.every((c) => c.color !== null)
			if (prevFilled && thisRow.every((c, i) => c.color === prevRow[i]!.color)) {
				return false
			}
		}
		if (row < gridSize - 1) {
			const nextRow = grid[row + 1]!
			const nextFilled = nextRow.every((c) => c.color !== null)
			if (nextFilled && thisRow.every((c, i) => c.color === nextRow[i]!.color)) {
				return false
			}
		}
	}

	// Check adjacent column uniqueness when column is fully filled
	const colFilled = cRed + cBlue === gridSize
	if (colFilled) {
		if (col > 0) {
			const prevColFilled = grid.every((r) => r[col - 1]!.color !== null)
			if (prevColFilled && grid.every((r) => r[col]!.color === r[col - 1]!.color)) {
				return false
			}
		}
		if (col < gridSize - 1) {
			const nextColFilled = grid.every((r) => r[col + 1]!.color !== null)
			if (nextColFilled && grid.every((r) => r[col]!.color === r[col + 1]!.color)) {
				return false
			}
		}
	}

	// Check number constraints for this cell and all 8 surrounding neighbors.
	const cellsToCheck: Array<[number, number]> = [[row, col]]
	for (const [dr, dc] of ALL_DIRECTIONS) {
		cellsToCheck.push([row + dr, col + dc])
	}

	for (const [r, c] of cellsToCheck) {
		const checkCell = getCell(grid, r, c, gridSize)
		if (!checkCell || checkCell.number === null || checkCell.color === null) continue

		let sameCount = 0
		let unfilledCount = 0
		for (const [dr, dc] of ALL_DIRECTIONS) {
			const neighbor = getCell(grid, r + dr, c + dc, gridSize)
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
function countSolutions(puzzleGrid: Grid, gridSize: number, maxCount: number = 2): number {
	const grid = deepCopyGrid(puzzleGrid)

	// Find empty cells (cells the player would need to fill)
	const emptyCells: Array<[number, number]> = []
	for (let row = 0; row < gridSize; row++) {
		for (let col = 0; col < gridSize; col++) {
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
				isBalanced(grid, gridSize) &&
				!hasAdjacentIdenticalRows(grid, gridSize) &&
				!hasAdjacentIdenticalColumns(grid, gridSize) &&
				numberConstraintsSatisfied(grid, gridSize)
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

			if (couldBeValid(grid, row, col, gridSize)) {
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
function propagateConstraints(grid: Grid, gridSize: number): 'invalid' | 'progress' | 'stable' {
	const half = gridSize / 2
	let anyProgress = false
	let changed = true

	while (changed) {
		changed = false

		// ── Rule 1: Row balance forcing ──
		for (let row = 0; row < gridSize; row++) {
			let red = 0
			let blue = 0
			const empty: number[] = []
			for (let col = 0; col < gridSize; col++) {
				const c = grid[row]![col]!.color
				if (c === 'red') red++
				else if (c === 'blue') blue++
				else empty.push(col)
			}
			if (red > half || blue > half) return 'invalid'
			if (empty.length > 0) {
				if (red === half) {
					for (const col of empty) {
						grid[row]![col]!.color = 'blue'
					}
					changed = true
					anyProgress = true
				} else if (blue === half) {
					for (const col of empty) {
						grid[row]![col]!.color = 'red'
					}
					changed = true
					anyProgress = true
				}
			}
		}

		// ── Rule 1: Column balance forcing ──
		for (let col = 0; col < gridSize; col++) {
			let red = 0
			let blue = 0
			const empty: number[] = []
			for (let row = 0; row < gridSize; row++) {
				const c = grid[row]![col]!.color
				if (c === 'red') red++
				else if (c === 'blue') blue++
				else empty.push(row)
			}
			if (red > half || blue > half) return 'invalid'
			if (empty.length > 0) {
				if (red === half) {
					for (const row of empty) {
						grid[row]![col]!.color = 'blue'
					}
					changed = true
					anyProgress = true
				} else if (blue === half) {
					for (const row of empty) {
						grid[row]![col]!.color = 'red'
					}
					changed = true
					anyProgress = true
				}
			}
		}

		// ── Rule 2: Number constraint forcing ──
		for (let row = 0; row < gridSize; row++) {
			for (let col = 0; col < gridSize; col++) {
				const cell = grid[row]![col]!
				if (cell.number === null || cell.color === null) continue

				let sameCount = 0
				const unfilled: Array<[number, number]> = []

				for (const [dr, dc] of ALL_DIRECTIONS) {
					const n = getCell(grid, row + dr, col + dc, gridSize)
					if (!n) continue
					if (n.color === null) unfilled.push([row + dr, col + dc])
					else if (n.color === cell.color) sameCount++
				}

				if (sameCount > cell.number) return 'invalid'
				if (sameCount + unfilled.length < cell.number) return 'invalid'

				if (unfilled.length > 0) {
					if (sameCount === cell.number) {
						const opp: CellColor = cell.color === 'red' ? 'blue' : 'red'
						for (const [r, c] of unfilled) {
							grid[r]![c]!.color = opp
						}
						changed = true
						anyProgress = true
					} else if (sameCount + unfilled.length === cell.number) {
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
		for (let i = 0; i < gridSize; i++) {
			const row = grid[i]!
			const emptyCols: number[] = []
			for (let col = 0; col < gridSize; col++) {
				if (row[col]!.color === null) emptyCols.push(col)
			}
			if (emptyCols.length !== 1) continue
			const emptyCol = emptyCols[0]!

			for (const adj of [i - 1, i + 1]) {
				if (adj < 0 || adj >= gridSize) continue
				const adjRow = grid[adj]!
				if (!adjRow.every((c) => c.color !== null)) continue

				let allMatch = true
				for (let col = 0; col < gridSize; col++) {
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
		for (let col = 0; col < gridSize; col++) {
			const emptyRows: number[] = []
			for (let row = 0; row < gridSize; row++) {
				if (grid[row]![col]!.color === null) emptyRows.push(row)
			}
			if (emptyRows.length !== 1) continue
			const emptyRow = emptyRows[0]!

			for (const adj of [col - 1, col + 1]) {
				if (adj < 0 || adj >= gridSize) continue
				if (!grid.every((r) => r[adj]!.color !== null)) continue

				let allMatch = true
				for (let row = 0; row < gridSize; row++) {
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
		for (let i = 0; i < gridSize - 1; i++) {
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
		for (let col = 0; col < gridSize - 1; col++) {
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
function canPlaceColor(grid: Grid, row: number, col: number, color: CellColor, gridSize: number): boolean {
	const test = deepCopyGrid(grid)
	test[row]![col]!.color = color
	return propagateConstraints(test, gridSize) !== 'invalid'
}

/**
 * Solve a puzzle using only deterministic logic (no guessing/backtracking).
 * Returns 'solved' if fully determined, 'stuck' if progress stalls,
 * or 'invalid' if a contradiction is found.
 */
function solveByLogic(puzzleGrid: Grid, gridSize: number): 'solved' | 'stuck' | 'invalid' {
	const grid = deepCopyGrid(puzzleGrid)

	let progress = true
	while (progress) {
		progress = false

		const result = propagateConstraints(grid, gridSize)
		if (result === 'invalid') return 'invalid'
		if (result === 'progress') {
			progress = true
			continue
		}

		// Rule 4: Elimination — for each empty cell, try both colors.
		for (let row = 0; row < gridSize; row++) {
			for (let col = 0; col < gridSize; col++) {
				if (grid[row]![col]!.color !== null) continue

				const canRed = canPlaceColor(grid, row, col, 'red', gridSize)
				const canBlue = canPlaceColor(grid, row, col, 'blue', gridSize)

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

	if (!isBalanced(grid, gridSize)) return 'invalid'
	if (hasAdjacentIdenticalRows(grid, gridSize)) return 'invalid'
	if (hasAdjacentIdenticalColumns(grid, gridSize)) return 'invalid'
	if (!numberConstraintsSatisfied(grid, gridSize)) return 'invalid'

	return 'solved'
}

// ─── Clue Generation via Removal ─────────────────────────────────────────────

type DifficultyTarget = {
	minClues: number
	minNumbers: number
}

/**
 * Difficulty targets per grid size and difficulty level.
 * Controls how many clues and numbers remain in the puzzle.
 */
const DIFFICULTY_TARGETS: Record<number, Record<Difficulty, DifficultyTarget>> = {
	4: {
		easy: { minClues: 6, minNumbers: 3 },
		medium: { minClues: 5, minNumbers: 2 },
		hard: { minClues: 4, minNumbers: 1 },
	},
	6: {
		easy: { minClues: 14, minNumbers: 6 },
		medium: { minClues: 11, minNumbers: 4 },
		hard: { minClues: 9, minNumbers: 2 },
	},
}

/**
 * Count the number of clue cells (cells that give the player information).
 */
function countClues(grid: Grid, gridSize: number): number {
	let count = 0
	for (let row = 0; row < gridSize; row++) {
		for (let col = 0; col < gridSize; col++) {
			if (grid[row]![col]!.locked) count++
		}
	}
	return count
}

/**
 * Count the number of cells that have a number clue.
 */
function countNumbers(grid: Grid, gridSize: number): number {
	let count = 0
	for (let row = 0; row < gridSize; row++) {
		for (let col = 0; col < gridSize; col++) {
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
 */
function generateClues(
	solution: Grid,
	difficulty: Difficulty,
	gridSize: number
): { puzzle: Grid; solution: Grid } | null {
	const sizeTargets = DIFFICULTY_TARGETS[gridSize]
	if (!sizeTargets) throw new Error(`Unsupported grid size: ${gridSize}`)
	const targets = sizeTargets[difficulty]

	// Compute neighbor counts for every cell in the solution
	const neighborCounts: number[][] = []
	for (let row = 0; row < gridSize; row++) {
		const rowCounts: number[] = []
		for (let col = 0; col < gridSize; col++) {
			rowCounts.push(countSameColorNeighbors(solution, row, col, gridSize))
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
	for (let row = 0; row < gridSize; row++) {
		for (let col = 0; col < gridSize; col++) {
			positions.push({ row, col })
		}
	}

	// Phase 1: Remove numbers from cells (keep color, drop number).
	for (const { row, col } of shuffle(positions)) {
		if (countNumbers(puzzle, gridSize) <= targets.minNumbers) break

		const cell = puzzle[row]![col]!
		if (!cell.locked || cell.number === null) continue

		const savedNumber = cell.number
		cell.number = null

		if (solveByLogic(puzzle, gridSize) !== 'solved') {
			cell.number = savedNumber
		}
	}

	// Phase 2: Remove entire cells (make empty).
	for (const { row, col } of shuffle(positions)) {
		if (countClues(puzzle, gridSize) <= targets.minClues) break

		const cell = puzzle[row]![col]!
		if (!cell.locked) continue

		if (cell.number !== null && countNumbers(puzzle, gridSize) <= targets.minNumbers) continue

		const saved = { ...cell }

		puzzle[row]![col]! = { color: null, number: null, locked: false }

		if (solveByLogic(puzzle, gridSize) !== 'solved') {
			puzzle[row]![col]! = saved
		}
	}

	// Phase 3: Final cleanup — try removing numbers from remaining locked cells.
	for (const { row, col } of shuffle(positions)) {
		if (countNumbers(puzzle, gridSize) <= targets.minNumbers) break

		const cell = puzzle[row]![col]!
		if (!cell.locked || cell.number === null) continue

		const savedNumber = cell.number
		cell.number = null

		if (solveByLogic(puzzle, gridSize) !== 'solved') {
			cell.number = savedNumber
		}
	}

	// Safety net: verify unique solution with brute-force solver
	if (countSolutions(puzzle, gridSize) !== 1) return null

	return { puzzle, solution }
}

// ─── Serialization ───────────────────────────────────────────────────────────

/**
 * Serialize grid colors to string: 'r' = red, 'b' = blue, '.' = empty
 */
export function serializeGrid(grid: Grid, gridSize: number): string {
	let result = ''
	for (let row = 0; row < gridSize; row++) {
		for (let col = 0; col < gridSize; col++) {
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
export function serializeNumbers(grid: Grid, gridSize: number): string {
	let result = ''
	for (let row = 0; row < gridSize; row++) {
		for (let col = 0; col < gridSize; col++) {
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
export function deserializeGrid(colors: string, numbers: string, gridSize: number, puzzleColors?: string): Grid {
	const grid: Grid = []
	let index = 0

	for (let row = 0; row < gridSize; row++) {
		const rowCells: Cell[] = []
		for (let col = 0; col < gridSize; col++) {
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
	difficulty: Difficulty = 'medium',
	gridSize: 4 | 6 = 4
): SerializedPuzzle {
	for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
		const solution = generateSolution(gridSize)
		const result = generateClues(solution, difficulty, gridSize)

		if (result) {
			return {
				colors: serializeGrid(result.puzzle, gridSize),
				numbers: serializeNumbers(result.puzzle, gridSize),
				solution: serializeGrid(result.solution, gridSize),
				difficulty,
				gridSize,
			}
		}
	}

	throw new Error('Failed to generate puzzle with unique solution')
}
