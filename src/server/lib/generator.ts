/**
 * Urjo Puzzle Generator
 * Generates valid 4x4 Urjo puzzles with unique solutions
 */

import type { Cell, Grid, SerializedPuzzle, CellColor } from '../../shared/types'

const GRID_SIZE = 4

/**
 * Shuffle array in place (Fisher-Yates)
 */
function shuffle<T>(array: T[]): T[] {
	const arr = [...array]
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[arr[i], arr[j]] = [arr[j], arr[i]]
	}
	return arr
}

/**
 * Check if two rows are identical
 */
function areRowsIdentical(row1: Cell[], row2: Cell[]): boolean {
	return row1.every((cell, i) => cell.color === row2[i].color)
}

/**
 * Count neighbors of same color (8 directions)
 */
function countSameColorNeighbors(grid: Grid, row: number, col: number): number {
	const color = grid[row][col].color
	if (color === null) return 0

	let count = 0
	const directions = [
		[-1, -1],
		[-1, 0],
		[-1, 1],
		[0, -1],
		[0, 1],
		[1, -1],
		[1, 0],
		[1, 1],
	]

	for (const [dr, dc] of directions) {
		const newRow = row + dr
		const newCol = col + dc
		if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE) {
			if (grid[newRow][newCol].color === color) {
				count++
			}
		}
	}

	return count
}

/**
 * Generate a valid row with equal red and blue cells
 */
function generateRow(): CellColor[] {
	const row: CellColor[] = ['red', 'red', 'blue', 'blue']
	return shuffle(row)
}

/**
 * Check if grid has equal red/blue in all rows and columns
 */
function isBalanced(grid: Grid): boolean {
	// Check rows
	for (let row = 0; row < GRID_SIZE; row++) {
		let redCount = 0
		let blueCount = 0
		for (let col = 0; col < GRID_SIZE; col++) {
			if (grid[row][col].color === 'red') redCount++
			if (grid[row][col].color === 'blue') blueCount++
		}
		if (redCount !== 2 || blueCount !== 2) return false
	}

	// Check columns
	for (let col = 0; col < GRID_SIZE; col++) {
		let redCount = 0
		let blueCount = 0
		for (let row = 0; row < GRID_SIZE; row++) {
			if (grid[row][col].color === 'red') redCount++
			if (grid[row][col].color === 'blue') blueCount++
		}
		if (redCount !== 2 || blueCount !== 2) return false
	}

	return true
}

/**
 * Check if any adjacent rows are identical
 */
function hasAdjacentIdenticalRows(grid: Grid): boolean {
	for (let i = 0; i < GRID_SIZE - 1; i++) {
		if (areRowsIdentical(grid[i], grid[i + 1])) {
			return true
		}
	}
	return false
}

/**
 * Generate a valid solution grid
 */
function generateSolution(): Grid {
	const MAX_ATTEMPTS = 1000
	let attempts = 0

	while (attempts < MAX_ATTEMPTS) {
		const grid: Grid = []

		// Generate 4 rows
		for (let i = 0; i < GRID_SIZE; i++) {
			const rowColors = generateRow()
			const row: Cell[] = rowColors.map((color) => ({
				color,
				number: null,
				locked: false,
			}))
			grid.push(row)
		}

		// Check if valid (balanced and no identical adjacent rows)
		if (isBalanced(grid) && !hasAdjacentIdenticalRows(grid)) {
			return grid
		}

		attempts++
	}

	throw new Error('Failed to generate valid solution')
}

/**
 * Add number constraints to the puzzle
 */
function addConstraints(
	solution: Grid,
	difficulty: 'easy' | 'medium' | 'hard'
): { puzzle: Grid; solution: Grid } {
	const puzzle = solution.map((row) =>
		row.map((cell) => ({
			...cell,
			color: null, // Start with empty cells
			locked: false,
		}))
	)

	// Determine how many clues to add based on difficulty
	const clueCount = {
		easy: 10,
		medium: 7,
		hard: 5,
	}[difficulty]

	// Generate random positions for clues
	const positions: Array<{ row: number; col: number }> = []
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			positions.push({ row, col })
		}
	}

	const shuffledPositions = shuffle(positions)
	const selectedPositions = shuffledPositions.slice(0, clueCount)

	// Add clues
	for (const { row, col } of selectedPositions) {
		const neighborCount = countSameColorNeighbors(solution, row, col)
		puzzle[row][col] = {
			color: null,
			number: neighborCount,
			locked: true,
		}
	}

	return { puzzle, solution }
}

/**
 * Serialize grid to string format
 */
export function serializeGrid(grid: Grid): string {
	let result = ''
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			const color = grid[row][col].color
			if (color === 'red') result += 'r'
			else if (color === 'blue') result += 'b'
			else result += '.'
		}
	}
	return result
}

/**
 * Serialize numbers to string format
 */
function serializeNumbers(grid: Grid): string {
	let result = ''
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			const number = grid[row][col].number
			if (number !== null) result += number.toString()
			else result += '-'
		}
	}
	return result
}

/**
 * Deserialize string to grid
 */
export function deserializeGrid(colors: string, numbers: string): Grid {
	const grid: Grid = []
	let index = 0

	for (let row = 0; row < GRID_SIZE; row++) {
		const rowCells: Cell[] = []
		for (let col = 0; col < GRID_SIZE; col++) {
			const colorChar = colors[index]
			const numberChar = numbers[index]

			const color: CellColor = colorChar === 'r' ? 'red' : colorChar === 'b' ? 'blue' : null
			const number = numberChar !== '-' ? parseInt(numberChar, 10) : null
			const locked = number !== null

			rowCells.push({ color, number, locked })
			index++
		}
		grid.push(rowCells)
	}

	return grid
}

/**
 * Generate a complete Urjo puzzle (simplified MVP - no number constraints)
 */
export function generatePuzzle(
	difficulty: 'easy' | 'medium' | 'hard' = 'medium'
): SerializedPuzzle {
	// Generate valid solution (2 red, 2 blue per row/column, no adjacent identical rows)
	const solution = generateSolution()

	// Create empty puzzle grid - all cells unlocked and empty
	const puzzle: Grid = []
	for (let row = 0; row < GRID_SIZE; row++) {
		const rowCells: Cell[] = []
		for (let col = 0; col < GRID_SIZE; col++) {
			rowCells.push({
				color: null, // Empty
				number: null, // No numbers
				locked: false, // All cells editable
			})
		}
		puzzle.push(rowCells)
	}

	// Serialize
	const serializedPuzzle: SerializedPuzzle = {
		colors: serializeGrid(puzzle), // "................" (16 dots - all empty)
		numbers: serializeNumbers(puzzle), // "----------------" (16 dashes - no numbers)
		solution: serializeGrid(solution), // "rbbrrbbrrbbrrbbb" (the answer)
		difficulty,
	}

	return serializedPuzzle
}
