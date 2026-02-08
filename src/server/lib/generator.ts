/**
 * Urjo Puzzle Generator
 * Generates valid 4x4 Urjo puzzles with unique solutions
 */

import type { Cell, Grid, SerializedPuzzle, CellColor } from '../../shared/types'

const GRID_SIZE = 4
const MAX_GENERATION_ATTEMPTS = 200
const MAX_HINT_ATTEMPTS = 50

/**
 * Shuffle array (Fisher-Yates)
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
 * Safely access a cell from the grid (returns undefined if out of bounds)
 */
function getCell(grid: Grid, row: number, col: number): Cell | undefined {
	if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return undefined
	return grid[row]![col]!
}

/**
 * Count orthogonal neighbors of same color (up, down, left, right only)
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
 * Check if grid has equal red/blue in all rows and columns
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
 * Check if any adjacent rows are identical
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
 * Check if any adjacent columns are identical
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

/**
 * Generate a valid solution grid.
 */
function generateSolution(): Grid {
	for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
		const grid: Grid = []

		for (let i = 0; i < GRID_SIZE; i++) {
			const rowColors = shuffle<CellColor>(['red', 'red', 'blue', 'blue'])
			const row: Cell[] = rowColors.map((color) => ({
				color,
				number: null,
				locked: false,
			}))
			grid.push(row)
		}

		if (
			isBalanced(grid) &&
			!hasAdjacentIdenticalRows(grid) &&
			!hasAdjacentIdenticalColumns(grid)
		) {
			return grid
		}
	}

	throw new Error('Failed to generate valid solution')
}

// ─── Solution Uniqueness Solver ──────────────────────────────────────────────

/**
 * Check if placing a color at (row, col) could still lead to a valid solution.
 */
function couldBeValid(grid: Grid, row: number, col: number): boolean {
	const cell = getCell(grid, row, col)
	if (!cell || cell.color === null) return true

	// Check row balance
	let rowRed = 0
	let rowBlue = 0
	for (let c = 0; c < GRID_SIZE; c++) {
		const color = grid[row]![c]!.color
		if (color === 'red') rowRed++
		if (color === 'blue') rowBlue++
	}
	if (rowRed > 2 || rowBlue > 2) return false

	// Check column balance
	let colRed = 0
	let colBlue = 0
	for (let r = 0; r < GRID_SIZE; r++) {
		const color = grid[r]![col]!.color
		if (color === 'red') colRed++
		if (color === 'blue') colBlue++
	}
	if (colRed > 2 || colBlue > 2) return false

	// Check adjacent row uniqueness when row is fully filled
	const rowFilled = rowRed + rowBlue === GRID_SIZE
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
	const colFilled = colRed + colBlue === GRID_SIZE
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

	// Check number constraints for this cell and its neighbors
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

		if (sameCount > checkCell.number) return false
		if (sameCount + unfilledCount < checkCell.number) return false
	}

	return true
}

/**
 * Count solutions for a puzzle grid (early termination at maxCount).
 */
function countSolutions(
	puzzleGrid: Grid,
	numbersMap: Map<string, number>,
	maxCount: number = 2
): number {
	// Deep copy
	const grid: Grid = puzzleGrid.map((row) =>
		row.map((cell) => ({ ...cell }))
	)

	// Apply numbers from map
	for (const [key, num] of numbersMap) {
		const parts = key.split(',')
		const r = parseInt(parts[0]!, 10)
		const c = parseInt(parts[1]!, 10)
		grid[r]![c]!.number = num
	}

	// Find empty cells
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

// ─── Hint Placement ──────────────────────────────────────────────────────────

type HintBudget = {
	lockedMin: number
	lockedMax: number
	numberOnlyMin: number
	numberOnlyMax: number
}

const HINT_BUDGETS: Record<'easy' | 'medium' | 'hard', HintBudget> = {
	easy: { lockedMin: 4, lockedMax: 6, numberOnlyMin: 2, numberOnlyMax: 3 },
	medium: { lockedMin: 2, lockedMax: 4, numberOnlyMin: 2, numberOnlyMax: 3 },
	hard: { lockedMin: 1, lockedMax: 2, numberOnlyMin: 1, numberOnlyMax: 2 },
}

function randomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Add hints to puzzle with three cell types and verify unique solution.
 */
function addConstraints(
	solution: Grid,
	difficulty: 'easy' | 'medium' | 'hard'
): { puzzle: Grid; solution: Grid } | null {
	const budget = HINT_BUDGETS[difficulty]

	for (let attempt = 0; attempt < MAX_HINT_ATTEMPTS; attempt++) {
		// Start with all cells empty
		const puzzle: Grid = solution.map((row) =>
			row.map(() => ({
				color: null as CellColor,
				number: null as number | null,
				locked: false,
			}))
		)

		// Generate and shuffle all positions
		const positions: Array<{ row: number; col: number }> = []
		for (let row = 0; row < GRID_SIZE; row++) {
			for (let col = 0; col < GRID_SIZE; col++) {
				positions.push({ row, col })
			}
		}
		const shuffled = shuffle(positions)

		const lockedCount = randomInt(budget.lockedMin, budget.lockedMax)
		const numberOnlyCount = randomInt(budget.numberOnlyMin, budget.numberOnlyMax)

		const lockedPositions = shuffled.slice(0, lockedCount)
		const numberOnlyPositions = shuffled.slice(lockedCount, lockedCount + numberOnlyCount)

		// Apply locked cells
		for (const { row, col } of lockedPositions) {
			const neighborCount = countSameColorNeighbors(solution, row, col)
			const showNumber = Math.random() < 0.5
			puzzle[row]![col]! = {
				color: solution[row]![col]!.color,
				number: showNumber ? neighborCount : null,
				locked: true,
			}
		}

		// Apply number-only cells
		const numbersMap = new Map<string, number>()
		for (const { row, col } of numberOnlyPositions) {
			const neighborCount = countSameColorNeighbors(solution, row, col)
			puzzle[row]![col]! = {
				color: null,
				number: neighborCount,
				locked: false,
			}
			numbersMap.set(`${row},${col}`, neighborCount)
		}

		// Check uniqueness
		const solutionCount = countSolutions(puzzle, numbersMap)

		if (solutionCount === 1) {
			return { puzzle, solution }
		}

		// If multiple solutions, try adding more locked cells
		if (solutionCount > 1) {
			const remaining = shuffled.slice(lockedCount + numberOnlyCount)
			let found = false

			for (const { row, col } of remaining) {
				const cell = puzzle[row]![col]!
				if (cell.color !== null || cell.number !== null) continue

				puzzle[row]![col]! = {
					color: solution[row]![col]!.color,
					number: null,
					locked: true,
				}

				const newCount = countSolutions(puzzle, numbersMap)
				if (newCount === 1) {
					found = true
					break
				}
				if (newCount === 0) {
					puzzle[row]![col]! = { color: null, number: null, locked: false }
				}
			}

			if (found) {
				return { puzzle, solution }
			}
		}
	}

	return null
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
			const locked = puzzleColors ? (puzzleColors[index] ?? '.') !== '.' : number !== null

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
		const result = addConstraints(solution, difficulty)

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
