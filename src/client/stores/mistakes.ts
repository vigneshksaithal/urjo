import { writable } from 'svelte/store'
import type { CellColor } from '../../shared/types'

/**
 * Mistake tracking using "on leave" approach.
 *
 * A mistake is only counted when a player LEAVES a cell with a wrong color.
 * Cycling colors on the same cell (null→blue→red) is NOT a mistake — only
 * what you leave behind matters.
 *
 * Logic:
 *   - Track the currently active cell (last cell touched)
 *   - When a NEW cell is touched, check if the previous cell's final color
 *     matches the solution. If wrong → count 1 mistake.
 *   - Uses a Set to prevent double-counting the same cell.
 */

export const mistakeCount = writable(0)

// The last cell the player interacted with
let lastActiveCell: { row: number; col: number } | null = null

// Cells already counted as mistakes (prevent re-counting if player returns)
const countedMistakeCells = new Set<string>()

// Current solution string (set when puzzle loads)
let solution = ''
let gridSize = 0

/**
 * Set the current puzzle solution. Call this when a new puzzle loads.
 */
export const setSolution = (sol: string, size: number) => {
	solution = sol
	gridSize = size
}

/**
 * Called when a cell's color changes.
 * Checks if the PREVIOUS cell (before this tap) was left with a wrong color.
 */
export const onCellChange = (
	row: number,
	col: number,
	_newColor: CellColor,
	getGridColor: (r: number, c: number) => CellColor
) => {

	// If tapping a DIFFERENT cell than before, evaluate the previous cell
	if (lastActiveCell && (lastActiveCell.row !== row || lastActiveCell.col !== col)) {
		const prevRow = lastActiveCell.row
		const prevCol = lastActiveCell.col
		const prevKey = `${prevRow}-${prevCol}`

		// Only count if not already counted for this cell
		if (!countedMistakeCells.has(prevKey) && solution) {
			const prevColor = getGridColor(prevRow, prevCol)
			if (prevColor !== null) {
				// Get expected color from solution string
				const solutionIndex = prevRow * gridSize + prevCol
				const solutionChar = solution[solutionIndex]
				const expectedColor: CellColor = solutionChar === 'r' ? 'red' : solutionChar === 'b' ? 'blue' : null

				if (expectedColor !== null && prevColor !== expectedColor) {
					// Player left this cell with the wrong color
					mistakeCount.update(m => m + 1)
					countedMistakeCells.add(prevKey)
				}
			}
		}
	}

	// If the player returns to a previously wrong cell and fixes it,
	// we don't un-count the mistake (it already happened), but we remove
	// it from counted so if they get it wrong AGAIN it counts again
	// Actually — once counted, don't re-count the same cell correction

	lastActiveCell = { row, col }
}

/**
 * Called when the puzzle is completed.
 * Any remaining wrong cells that were never "left" (last active cell) get counted.
 */
export const onPuzzleComplete = (getGridColor: (r: number, c: number) => CellColor) => {
	// The last active cell was never "left" — check it now
	if (lastActiveCell && solution) {
		const { row, col } = lastActiveCell
		const key = `${row}-${col}`
		if (!countedMistakeCells.has(key)) {
			const color = getGridColor(row, col)
			if (color !== null) {
				const idx = row * gridSize + col
				const solutionChar = solution[idx]
				const expected: CellColor = solutionChar === 'r' ? 'red' : 'blue'
				if (color !== expected) {
					mistakeCount.update(m => m + 1)
					countedMistakeCells.add(key)
				}
			}
		}
	}
}

export const resetMistakes = () => {
	mistakeCount.set(0)
	lastActiveCell = null
	countedMistakeCells.clear()
	solution = ''
	gridSize = 0
}
