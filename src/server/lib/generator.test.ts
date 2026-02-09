import { describe, it, expect } from 'bun:test'
import {
	generatePuzzle,
	countSameColorNeighbors,
	isBalanced,
	hasAdjacentIdenticalRows,
	hasAdjacentIdenticalColumns,
	numberConstraintsSatisfied,
	serializeGrid,
	serializeNumbers,
	deserializeGrid,
} from './generator'
import type { Grid, CellColor } from '../../shared/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a grid from a 4x4 color array (for quick test setup). */
function gridFromColors(colors: CellColor[][]): Grid {
	return colors.map((row) =>
		row.map((color) => ({ color, number: null, locked: false }))
	)
}

/** Deserialize a puzzle and check if it represents a valid initial state. */
function deserializePuzzle(puzzle: ReturnType<typeof generatePuzzle>): Grid {
	return deserializeGrid(puzzle.colors, puzzle.numbers, puzzle.colors)
}

// ─── Solution Generation ─────────────────────────────────────────────────────

describe('generatePuzzle', () => {
	it('generates a puzzle for each difficulty level', () => {
		for (const difficulty of ['easy', 'medium', 'hard'] as const) {
			const puzzle = generatePuzzle(difficulty)
			expect(puzzle).toBeDefined()
			expect(puzzle.difficulty).toBe(difficulty)
			expect(puzzle.colors).toHaveLength(16)
			expect(puzzle.numbers).toHaveLength(16)
			expect(puzzle.solution).toHaveLength(16)
		}
	})

	it('solution satisfies balance constraint (2 red, 2 blue per row/col)', () => {
		for (let i = 0; i < 5; i++) {
			const puzzle = generatePuzzle('medium')
			const solutionGrid = deserializeGrid(puzzle.solution, '----------------')
			expect(isBalanced(solutionGrid)).toBe(true)
		}
	})

	it('solution has no adjacent identical rows', () => {
		for (let i = 0; i < 5; i++) {
			const puzzle = generatePuzzle('medium')
			const solutionGrid = deserializeGrid(puzzle.solution, '----------------')
			expect(hasAdjacentIdenticalRows(solutionGrid)).toBe(false)
		}
	})

	it('solution has no adjacent identical columns', () => {
		for (let i = 0; i < 5; i++) {
			const puzzle = generatePuzzle('medium')
			const solutionGrid = deserializeGrid(puzzle.solution, '----------------')
			expect(hasAdjacentIdenticalColumns(solutionGrid)).toBe(false)
		}
	})
})

// ─── Clue Type Validity ──────────────────────────────────────────────────────

describe('clue type validity', () => {
	it('never produces number-only clues (number without color)', () => {
		for (let i = 0; i < 10; i++) {
			for (const difficulty of ['easy', 'medium', 'hard'] as const) {
				const puzzle = generatePuzzle(difficulty)
				const grid = deserializePuzzle(puzzle)

				for (let r = 0; r < 4; r++) {
					for (let c = 0; c < 4; c++) {
						const cell = grid[r]![c]!
						// If a cell has a number, it MUST also have a color
						if (cell.number !== null) {
							expect(cell.color).not.toBeNull()
						}
					}
				}
			}
		}
	})

	it('locked cells always have a color', () => {
		for (let i = 0; i < 10; i++) {
			const puzzle = generatePuzzle('medium')
			const grid = deserializePuzzle(puzzle)

			for (let r = 0; r < 4; r++) {
				for (let c = 0; c < 4; c++) {
					const cell = grid[r]![c]!
					if (cell.locked) {
						expect(cell.color).not.toBeNull()
					}
				}
			}
		}
	})

	it('empty cells have no number and no color', () => {
		for (let i = 0; i < 10; i++) {
			const puzzle = generatePuzzle('medium')
			const grid = deserializePuzzle(puzzle)

			for (let r = 0; r < 4; r++) {
				for (let c = 0; c < 4; c++) {
					const cell = grid[r]![c]!
					if (!cell.locked) {
						expect(cell.color).toBeNull()
						expect(cell.number).toBeNull()
					}
				}
			}
		}
	})
})

// ─── Number Constraints ──────────────────────────────────────────────────────

describe('number constraints', () => {
	it('numbers match actual same-color neighbor counts in solution', () => {
		for (let i = 0; i < 5; i++) {
			const puzzle = generatePuzzle('medium')
			// Rebuild the solution grid with puzzle numbers applied
			const solutionGrid = deserializeGrid(puzzle.solution, puzzle.numbers)

			for (let r = 0; r < 4; r++) {
				for (let c = 0; c < 4; c++) {
					const cell = solutionGrid[r]![c]!
					if (cell.number !== null) {
						const actual = countSameColorNeighbors(solutionGrid, r, c)
						expect(actual).toBe(cell.number)
					}
				}
			}
		}
	})
})

// ─── countSameColorNeighbors ─────────────────────────────────────────────────

describe('countSameColorNeighbors (8-directional)', () => {
	it('counts diagonal neighbor for a corner cell', () => {
		const grid = gridFromColors([
			['red', 'blue', 'red', 'blue'],
			['blue', 'red', 'blue', 'red'],
			['red', 'blue', 'red', 'blue'],
			['blue', 'red', 'blue', 'red'],
		])
		// (0,0) is red; 8-dir neighbors: right=blue, below=blue, diagonal(1,1)=red → 1
		expect(countSameColorNeighbors(grid, 0, 0)).toBe(1)
	})

	it('counts all 8 directions for an interior cell', () => {
		const grid = gridFromColors([
			['red', 'red', 'blue', 'blue'],
			['red', 'red', 'blue', 'blue'],
			['blue', 'blue', 'red', 'red'],
			['blue', 'blue', 'red', 'red'],
		])
		// (1,1) is red; 8-dir neighbors:
		//   (0,0)=R, (0,1)=R, (0,2)=B,
		//   (1,0)=R,          (1,2)=B,
		//   (2,0)=B, (2,1)=B, (2,2)=R → 4 red
		expect(countSameColorNeighbors(grid, 1, 1)).toBe(4)
	})

	it('returns 0 for a corner cell surrounded by opposite color', () => {
		const grid = gridFromColors([
			['red', 'blue', 'red', 'blue'],
			['blue', 'blue', 'red', 'blue'],
			['red', 'blue', 'red', 'blue'],
			['blue', 'red', 'blue', 'red'],
		])
		// (0,0) is red; 8-dir neighbors: (0,1)=blue, (1,0)=blue, (1,1)=blue → 0
		expect(countSameColorNeighbors(grid, 0, 0)).toBe(0)
	})

	it('returns 0 for null-colored cell', () => {
		const grid = gridFromColors([
			[null, 'red', 'blue', 'blue'],
			['red', 'red', 'blue', 'blue'],
			['blue', 'blue', 'red', 'red'],
			['blue', 'blue', 'red', 'red'],
		])
		expect(countSameColorNeighbors(grid, 0, 0)).toBe(0)
	})

	it('counts edge cell neighbors correctly (5 possible neighbors)', () => {
		const grid = gridFromColors([
			['red', 'red', 'red', 'blue'],
			['red', 'red', 'blue', 'blue'],
			['blue', 'blue', 'red', 'red'],
			['blue', 'blue', 'red', 'red'],
		])
		// (0,1) is red; 8-dir neighbors:
		//   (0,0)=R,          (0,2)=R,
		//   (1,0)=R, (1,1)=R, (1,2)=B → 4 red (out of 5 possible)
		expect(countSameColorNeighbors(grid, 0, 1)).toBe(4)
	})
})

// ─── Serialization ───────────────────────────────────────────────────────────

describe('serialization', () => {
	it('serializeGrid produces correct string', () => {
		const grid = gridFromColors([
			['red', 'blue', 'red', 'blue'],
			['blue', 'red', 'blue', 'red'],
			['red', 'blue', null, 'blue'],
			['blue', 'red', 'blue', null],
		])
		// Row 0: r b r b → "rbrb"
		// Row 1: b r b r → "brbr"
		// Row 2: r b . b → "rb.b"
		// Row 3: b r b . → "brb."
		expect(serializeGrid(grid)).toBe('rbrbbrbrrb.bbrb.')
	})

	it('round-trips through serialize/deserialize', () => {
		const puzzle = generatePuzzle('medium')
		const grid = deserializeGrid(puzzle.colors, puzzle.numbers, puzzle.colors)
		const reColors = serializeGrid(grid)
		const reNumbers = serializeNumbers(grid)
		expect(reColors).toBe(puzzle.colors)
		expect(reNumbers).toBe(puzzle.numbers)
	})
})

// ─── Difficulty Scaling ──────────────────────────────────────────────────────

describe('difficulty scaling', () => {
	it('easy puzzles have more clues than hard puzzles on average', () => {
		let easyClues = 0
		let hardClues = 0
		const runs = 10

		for (let i = 0; i < runs; i++) {
			const easy = generatePuzzle('easy')
			const hard = generatePuzzle('hard')

			// Count non-empty cells in puzzle
			easyClues += easy.colors.split('').filter((c) => c !== '.').length
			hardClues += hard.colors.split('').filter((c) => c !== '.').length
		}

		expect(easyClues / runs).toBeGreaterThanOrEqual(hardClues / runs)
	})

	it('puzzles have at least the minimum clue count for their difficulty', () => {
		const minClues = { easy: 6, medium: 5, hard: 4 } as const

		for (const difficulty of ['easy', 'medium', 'hard'] as const) {
			for (let i = 0; i < 5; i++) {
				const puzzle = generatePuzzle(difficulty)
				const clueCount = puzzle.colors.split('').filter((c) => c !== '.').length
				expect(clueCount).toBeGreaterThanOrEqual(minClues[difficulty])
			}
		}
	})
})

// ─── Puzzle Diversity ────────────────────────────────────────────────────────

describe('puzzle diversity', () => {
	it('generates different puzzles on successive calls', () => {
		const solutions = new Set<string>()
		for (let i = 0; i < 10; i++) {
			const puzzle = generatePuzzle('medium')
			solutions.add(puzzle.solution)
		}
		// With a 4x4 grid, we should get at least a few different solutions
		expect(solutions.size).toBeGreaterThan(1)
	})
})
