import { writable } from 'svelte/store'
import type { Grid } from '../../shared/types'
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
 *
 * NOTE: This module uses singleton state. Call resetMistakes() when starting a new puzzle.
 */

export const mistakeCount = writable(0)

// The last cell the player interacted with
let lastActiveCell: { row: number; col: number } | null = null

// Cells already counted as mistakes (prevent re-counting if player returns)
const countedMistakeCells = new Set<string>()

/**
 * Check if a cell violates constraints and count it as a mistake if so.
 * Returns true if a mistake was counted.
 */
const checkAndCountMistake = (row: number, col: number, grid: Grid, gridSize: number): boolean => {
	const key = `${row}-${col}`
	if (countedMistakeCells.has(key)) return false

	const cell = grid[row]?.[col]
	if (!cell || cell.color === null) return false

	if (doesCellViolateConstraints(grid, row, col, gridSize)) {
		mistakeCount.update(m => m + 1)
		countedMistakeCells.add(key)
		return true
	}
	return false
}

/**
 * Called when a cell's color changes.
 * Checks if the PREVIOUS cell (before this tap) was left violating any constraint.
 */
export const onCellChange = (
	row: number,
	col: number,
	grid: Grid,
	gridSize: number
): void => {
	// If tapping a DIFFERENT cell than before, evaluate the previous cell
	if (lastActiveCell && (lastActiveCell.row !== row || lastActiveCell.col !== col)) {
		checkAndCountMistake(lastActiveCell.row, lastActiveCell.col, grid, gridSize)
	}

	lastActiveCell = { row, col }
}

/**
 * Called when the puzzle is completed.
 * Checks the last active cell since the player never "left" it to trigger the normal check.
 */
export const onPuzzleComplete = (grid: Grid, gridSize: number): void => {
	if (lastActiveCell) {
		checkAndCountMistake(lastActiveCell.row, lastActiveCell.col, grid, gridSize)
	}
}

export const resetMistakes = (): void => {
	mistakeCount.set(0)
	lastActiveCell = null
	countedMistakeCells.clear()
}
