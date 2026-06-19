import { describe, it, expect } from 'vitest'
import {
	WALKTHROUGH_CELLS,
	WALKTHROUGH_STEPS,
	WALKTHROUGH_GRID_SIZE,
	TOTAL_WALKTHROUGH_STEPS,
	isStepSatisfied,
	applyStep,
	buildSolvedGrid,
	cellsToGrid,
} from '../tutorial-walkthrough'
import { isGridComplete, countSameColorNeighbors } from '../validation'

describe('walkthrough board', () => {
	it('has exactly gridSize × gridSize cells', () => {
		expect(WALKTHROUGH_CELLS).toHaveLength(WALKTHROUGH_GRID_SIZE * WALKTHROUGH_GRID_SIZE)
	})

	it('has one step per blank (unlocked) cell', () => {
		const blankIndices = WALKTHROUGH_CELLS.flatMap((cell, i) => (cell.locked ? [] : [i]))
		expect(TOTAL_WALKTHROUGH_STEPS).toBe(blankIndices.length)
	})
})

describe('walkthrough steps', () => {
	it('each step targets a distinct unlocked cell', () => {
		const targets = WALKTHROUGH_STEPS.map((s) => s.targetIndex)
		expect(new Set(targets).size).toBe(targets.length)
		for (const step of WALKTHROUGH_STEPS) {
			expect(WALKTHROUGH_CELLS[step.targetIndex]?.locked).toBe(false)
		}
	})

	it('steps cover every blank cell exactly once', () => {
		const blankIndices = WALKTHROUGH_CELLS.flatMap((cell, i) => (cell.locked ? [] : [i])).sort()
		const targets = WALKTHROUGH_STEPS.map((s) => s.targetIndex).sort()
		expect(targets).toEqual(blankIndices)
	})
})

describe('isStepSatisfied', () => {
	const step = WALKTHROUGH_STEPS[0]!

	it('is true only when the color matches the expected color', () => {
		expect(isStepSatisfied(step.expectedColor, step)).toBe(true)
	})

	it('is false for the wrong color or an empty cell', () => {
		const wrong: 'red' | 'blue' = step.expectedColor === 'red' ? 'blue' : 'red'
		expect(isStepSatisfied(wrong, step)).toBe(false)
		expect(isStepSatisfied(null, step)).toBe(false)
	})
})

describe('applyStep', () => {
	it('fills and locks only the target cell without mutating the input', () => {
		const before = WALKTHROUGH_CELLS.map((c) => ({ ...c }))
		const step = WALKTHROUGH_STEPS[0]!
		const after = applyStep(before, step)

		expect(after[step.targetIndex]).toEqual({
			...before[step.targetIndex],
			color: step.expectedColor,
			locked: true,
		})
		// Original untouched (purity)
		expect(before[step.targetIndex]?.color).toBeNull()
		// Other cells unchanged
		const otherIndex = step.targetIndex === 0 ? 1 : 0
		expect(after[otherIndex]).toEqual(before[otherIndex])
	})
})

describe('solved board', () => {
	it('forms a fully valid completed grid', () => {
		expect(isGridComplete(buildSolvedGrid(), WALKTHROUGH_GRID_SIZE)).toBe(true)
	})

	it("each step's expected color matches the solved board", () => {
		const grid = buildSolvedGrid()
		const size = WALKTHROUGH_GRID_SIZE
		for (const step of WALKTHROUGH_STEPS) {
			const row = Math.floor(step.targetIndex / size)
			const col = step.targetIndex % size
			expect(grid[row]?.[col]?.color).toBe(step.expectedColor)
		}
	})

	it('satisfies the number clues (2 and 4 red neighbors)', () => {
		const grid = buildSolvedGrid()
		const size = WALKTHROUGH_GRID_SIZE
		for (let i = 0; i < WALKTHROUGH_CELLS.length; i++) {
			const clue = WALKTHROUGH_CELLS[i]
			if (clue?.number == null) continue
			const row = Math.floor(i / size)
			const col = i % size
			expect(countSameColorNeighbors(grid, row, col, size)).toBe(clue.number)
		}
	})
})

describe('cellsToGrid', () => {
	it('reshapes the flat cells into a 4×4 grid', () => {
		const grid = cellsToGrid(WALKTHROUGH_CELLS)
		expect(grid).toHaveLength(WALKTHROUGH_GRID_SIZE)
		for (const row of grid) {
			expect(row).toHaveLength(WALKTHROUGH_GRID_SIZE)
		}
		// Clue at flat index 1 → (0,1)
		expect(grid[0]?.[1]?.number).toBe(2)
	})
})
