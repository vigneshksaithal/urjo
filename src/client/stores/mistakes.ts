import { writable } from 'svelte/store'
import type { CellColor, Grid } from '../../shared/types'
import { doesCellViolateConstraints } from '../lib/validation'

/**
 * Mistake tracking using "on leave" approach with constraint-based checking.
 *
 * A mistake is only counted when a player LEAVES a cell that violates constraints.
 * Cycling colors on the same cell (null→blue→red) is NOT a mistake — only
 * what you leave behind matters.
 *
 * Logic:
 *   - Track the currently active cell (last cell touched)
 *   - When a NEW cell is touched, check if the previous cell's final color
 *     violates any constraint (balance, adjacency, number). If so → count 1 mistake.
 *   - Uses a Set to prevent double-counting the same cell.
 *
 * This replaces the old single-solution string comparison, so valid alternate
 * solutions are never incorrectly flagged as mistakes.
 */

export const mistakeCount = writable(0)

// The last cell the player interacted with
let lastActiveCell: { row: number; col: number } | null = null

// Cells already counted as mistakes (prevent re-counting if player returns)
const countedMistakeCells = new Set<string>()

/**
 * Set the current puzzle data. Call this when a new puzzle loads.
 * The numbers string is accepted for API compatibility but constraint
 * checking uses the grid directly (which already has number data from deserialization).
 */
export const setPuzzleData = (_numbers: string, _size: number): void => {
	// No state needed: constraint checking uses the grid passed to onCellChange directly.
}

/**
 * Called when a cell's color changes.
 * Checks if the PREVIOUS cell (before this tap) was left violating any constraint.
 */
export const onCellChange = (
	row: number,
	col: number,
	_newColor: CellColor,
	grid: Grid,
	gridSize: number
): void => {
	// If tapping a DIFFERENT cell than before, evaluate the previous cell
	if (lastActiveCell && (lastActiveCell.row !== row || lastActiveCell.col !== col)) {
		const prevRow = lastActiveCell.row
		const prevCol = lastActiveCell.col
		const prevKey = `${prevRow}-${prevCol}`

		// Only count if not already counted for this cell
		if (!countedMistakeCells.has(prevKey)) {
			const prevCell = grid[prevRow]?.[prevCol]
			if (prevCell && prevCell.color !== null) {
				if (doesCellViolateConstraints(grid, prevRow, prevCol, gridSize)) {
					mistakeCount.update(m => m + 1)
					countedMistakeCells.add(prevKey)
				}
			}
		}
	}

	lastActiveCell = { row, col }
}

/**
 * Called when the puzzle is completed.
 * The last active cell was never "left" — check it now.
 */
export const onPuzzleComplete = (
	grid: Grid,
	gridSize: number
): void => {
	if (lastActiveCell) {
		const { row, col } = lastActiveCell
		const key = `${row}-${col}`
		if (!countedMistakeCells.has(key)) {
			const cell = grid[row]?.[col]
			if (cell && cell.color !== null) {
				if (doesCellViolateConstraints(grid, row, col, gridSize)) {
					mistakeCount.update(m => m + 1)
					countedMistakeCells.add(key)
				}
			}
		}
	}
}

export const resetMistakes = (): void => {
	mistakeCount.set(0)
	lastActiveCell = null
	countedMistakeCells.clear()
}
