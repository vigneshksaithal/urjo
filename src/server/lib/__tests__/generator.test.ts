import { describe, it, expect } from 'vitest'
import {
	generatePuzzle,
	countSameColorNeighbors,
	countSolutions,
	isBalanced,
	hasAdjacentIdenticalRows,
	hasAdjacentIdenticalColumns,
	serializeGrid,
	serializeNumbers,
	deserializeGrid,
} from '../generator'
import type { Grid, CellColor } from '../../../shared/types'

function gridFromColors(colors: CellColor[][]): Grid {
	return colors.map((row) =>
		row.map((color) => ({ color, number: null, locked: false }))
	)
}

function deserializePuzzle(puzzle: ReturnType<typeof generatePuzzle>): Grid {
	return deserializeGrid(puzzle.colors, puzzle.numbers, puzzle.gridSize, puzzle.colors)
}

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
			const solutionGrid = deserializeGrid(puzzle.solution, '----------------', 4)
			expect(isBalanced(solutionGrid, 4)).toBe(true)
		}
	})

	it('solution has no adjacent identical rows', () => {
		for (let i = 0; i < 5; i++) {
			const puzzle = generatePuzzle('medium')
			const solutionGrid = deserializeGrid(puzzle.solution, '----------------', 4)
			expect(hasAdjacentIdenticalRows(solutionGrid, 4)).toBe(false)
		}
	})

	it('solution has no adjacent identical columns', () => {
		for (let i = 0; i < 5; i++) {
			const puzzle = generatePuzzle('medium')
			const solutionGrid = deserializeGrid(puzzle.solution, '----------------', 4)
			expect(hasAdjacentIdenticalColumns(solutionGrid, 4)).toBe(false)
		}
	})
})

describe('clue type validity', () => {
	it('never produces number-only clues (number without color)', () => {
		for (let i = 0; i < 10; i++) {
			for (const difficulty of ['easy', 'medium', 'hard'] as const) {
				const puzzle = generatePuzzle(difficulty)
				const grid = deserializePuzzle(puzzle)

				for (let r = 0; r < 4; r++) {
					for (let c = 0; c < 4; c++) {
						const cell = grid[r]![c]!
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

describe('number constraints', () => {
	it('numbers match actual same-color neighbor counts in solution', () => {
		for (let i = 0; i < 5; i++) {
			const puzzle = generatePuzzle('medium')
			const solutionGrid = deserializeGrid(puzzle.solution, puzzle.numbers, 4)

			for (let r = 0; r < 4; r++) {
				for (let c = 0; c < 4; c++) {
					const cell = solutionGrid[r]![c]!
					if (cell.number !== null) {
						const actual = countSameColorNeighbors(solutionGrid, r, c, 4)
						expect(actual).toBe(cell.number)
					}
				}
			}
		}
	})
})

describe('countSameColorNeighbors (8-directional)', () => {
	it('counts diagonal neighbor for a corner cell', () => {
		const grid = gridFromColors([
			['red', 'blue', 'red', 'blue'],
			['blue', 'red', 'blue', 'red'],
			['red', 'blue', 'red', 'blue'],
			['blue', 'red', 'blue', 'red'],
		])
		expect(countSameColorNeighbors(grid, 0, 0, 4)).toBe(1)
	})

	it('counts all 8 directions for an interior cell', () => {
		const grid = gridFromColors([
			['red', 'red', 'blue', 'blue'],
			['red', 'red', 'blue', 'blue'],
			['blue', 'blue', 'red', 'red'],
			['blue', 'blue', 'red', 'red'],
		])
		expect(countSameColorNeighbors(grid, 1, 1, 4)).toBe(4)
	})

	it('returns 0 for a corner cell surrounded by opposite color', () => {
		const grid = gridFromColors([
			['red', 'blue', 'red', 'blue'],
			['blue', 'blue', 'red', 'blue'],
			['red', 'blue', 'red', 'blue'],
			['blue', 'red', 'blue', 'red'],
		])
		expect(countSameColorNeighbors(grid, 0, 0, 4)).toBe(0)
	})

	it('returns 0 for null-colored cell', () => {
		const grid = gridFromColors([
			[null, 'red', 'blue', 'blue'],
			['red', 'red', 'blue', 'blue'],
			['blue', 'blue', 'red', 'red'],
			['blue', 'blue', 'red', 'red'],
		])
		expect(countSameColorNeighbors(grid, 0, 0, 4)).toBe(0)
	})

	it('counts edge cell neighbors correctly (5 possible neighbors)', () => {
		const grid = gridFromColors([
			['red', 'red', 'red', 'blue'],
			['red', 'red', 'blue', 'blue'],
			['blue', 'blue', 'red', 'red'],
			['blue', 'blue', 'red', 'red'],
		])
		expect(countSameColorNeighbors(grid, 0, 1, 4)).toBe(4)
	})
})

describe('serialization', () => {
	it('serializeGrid produces correct string', () => {
		const grid = gridFromColors([
			['red', 'blue', 'red', 'blue'],
			['blue', 'red', 'blue', 'red'],
			['red', 'blue', null, 'blue'],
			['blue', 'red', 'blue', null],
		])
		expect(serializeGrid(grid, 4)).toBe('rbrbbrbrrb.bbrb.')
	})

	it('round-trips through serialize/deserialize', () => {
		const puzzle = generatePuzzle('medium')
		const grid = deserializeGrid(puzzle.colors, puzzle.numbers, 4, puzzle.colors)
		const reColors = serializeGrid(grid, 4)
		const reNumbers = serializeNumbers(grid, 4)
		expect(reColors).toBe(puzzle.colors)
		expect(reNumbers).toBe(puzzle.numbers)
	})
})

describe('difficulty scaling', () => {
	it('easy puzzles have more clues than hard puzzles on average', () => {
		let easyClues = 0
		let hardClues = 0
		const runs = 10

		for (let i = 0; i < runs; i++) {
			const easy = generatePuzzle('easy')
			const hard = generatePuzzle('hard')

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

describe('puzzle diversity', () => {
	it('generates different puzzles on successive calls', () => {
		const solutions = new Set<string>()
		for (let i = 0; i < 10; i++) {
			const puzzle = generatePuzzle('medium')
			solutions.add(puzzle.solution)
		}
		expect(solutions.size).toBeGreaterThan(1)
	})
})

describe('generatePuzzle — Property 4: Preservation - Unique Puzzle Generation Unchanged', () => {
	it('every generated puzzle has exactly 1 solution', () => {
		// Validates: Requirements 3.3
		// Property: for any puzzle produced by generatePuzzle, countSolutions returns 1.
		// This preserves the uniqueness guarantee for correctly generated puzzles.
		for (let i = 0; i < 10; i++) {
			for (const difficulty of ['easy', 'medium', 'hard'] as const) {
				const puzzle = generatePuzzle(difficulty)
				const grid = deserializeGrid(puzzle.colors, puzzle.numbers, puzzle.gridSize, puzzle.colors)
				expect(countSolutions(grid, puzzle.gridSize)).toBe(1)
			}
		}
	})
})

describe('countSolutions', () => {
	// Puzzle with 4 empty cells forming an X-wing in the top-left 2×2 block.
	//
	// The locked cells fix rows 2–3 completely and columns 2–3 of rows 0–1,
	// leaving (0,0), (0,1), (1,0), (1,1) empty. Both of these completions
	// satisfy all constraints:
	//   Solution A: (0,0)=r (0,1)=b (1,0)=b (1,1)=r
	//   Solution B: (0,0)=b (0,1)=r (1,0)=r (1,1)=b
	//
	// Requirements: 2.3, 3.3
	it('returns 2 for a 4×4 grid with a known X-wing pattern (2 valid solutions)', () => {
		const puzzleGrid = [
			[
				{ color: null, number: null, locked: false },
				{ color: null, number: null, locked: false },
				{ color: 'red' as const, number: null, locked: true },
				{ color: 'blue' as const, number: null, locked: true },
			],
			[
				{ color: null, number: null, locked: false },
				{ color: null, number: null, locked: false },
				{ color: 'blue' as const, number: null, locked: true },
				{ color: 'red' as const, number: null, locked: true },
			],
			[
				{ color: 'red' as const, number: null, locked: true },
				{ color: 'blue' as const, number: null, locked: true },
				{ color: 'red' as const, number: null, locked: true },
				{ color: 'blue' as const, number: null, locked: true },
			],
			[
				{ color: 'blue' as const, number: null, locked: true },
				{ color: 'red' as const, number: null, locked: true },
				{ color: 'blue' as const, number: null, locked: true },
				{ color: 'red' as const, number: null, locked: true },
			],
		]

		expect(countSolutions(puzzleGrid, 4)).toBe(2)
	})

	// Adding a clue at (0,0) = red forces Solution A and eliminates Solution B,
	// leaving exactly one valid completion.
	//
	// Requirements: 2.3, 3.3
	it('returns 1 for a 4×4 grid where a clue breaks the X-wing symmetry (unique solution)', () => {
		const uniquePuzzleGrid = [
			[
				{ color: 'red' as const, number: null, locked: true },
				{ color: null, number: null, locked: false },
				{ color: 'red' as const, number: null, locked: true },
				{ color: 'blue' as const, number: null, locked: true },
			],
			[
				{ color: null, number: null, locked: false },
				{ color: null, number: null, locked: false },
				{ color: 'blue' as const, number: null, locked: true },
				{ color: 'red' as const, number: null, locked: true },
			],
			[
				{ color: 'red' as const, number: null, locked: true },
				{ color: 'blue' as const, number: null, locked: true },
				{ color: 'red' as const, number: null, locked: true },
				{ color: 'blue' as const, number: null, locked: true },
			],
			[
				{ color: 'blue' as const, number: null, locked: true },
				{ color: 'red' as const, number: null, locked: true },
				{ color: 'blue' as const, number: null, locked: true },
				{ color: 'red' as const, number: null, locked: true },
			],
		]

		expect(countSolutions(uniquePuzzleGrid, 4)).toBe(1)
	})
})
