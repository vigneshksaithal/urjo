/**
 * Guided walkthrough tutorial — a single 4×4 board the player solves one cell
 * at a time, led by the pointing hand and a one-line instruction per step.
 *
 * Unlike the old multi-grid lesson flow, the board never changes: each step
 * unlocks exactly one cell, tells the player what to do, and points at it.
 * Completing every step fills the board into a fully valid solution.
 *
 * Solution (row-major):
 *   R R B B
 *   B B R R
 *   R B R B
 *   B R B R
 *
 * Number clues live on locked cells and are satisfied by the final solution:
 *   index 1  (row0,col1) = red, shows 2  → touches exactly 2 red spots
 *   index 10 (row2,col2) = red, shows 4  → touches exactly 4 red spots
 *
 * The player fills four cells, each one teaching a single mechanic:
 *   step 1 → tap to color a spot (reach blue)
 *   step 2 → tap again to cycle the color (reach red)
 *   step 3 → balance a line (2 red + 2 blue)
 *   step 4 → use a number clue to deduce a color
 */

import type { Cell, CellColor, Grid } from '../../shared/types'

export const WALKTHROUGH_GRID_SIZE = 4 as const

/** A non-null cell color the player can place. */
export type WalkColor = Exclude<CellColor, null>

export type WalkCell = {
	color: CellColor
	number: number | null
	/** Locked cells are pre-filled clues the player cannot change. */
	locked: boolean
}

export type WalkStep = {
	/** One-line instruction shown near the target cell. */
	instruction: string
	/** Flat index (row-major) of the cell the player must fill this step. */
	targetIndex: number
	/** The color the target cell must become for the step to complete. */
	expectedColor: WalkColor
}

// ─── Board ───────────────────────────────────────────────────────────────────

const R = 'red'
const B = 'blue'

function given(color: WalkColor, number: number | null = null): WalkCell {
	return { color, number, locked: true }
}

function blank(): WalkCell {
	return { color: null, number: null, locked: false }
}

/**
 * Initial board: twelve locked clues and four blank cells the player fills.
 * Blank cell indices: 0, 6, 9, 14.
 */
export const WALKTHROUGH_CELLS: readonly WalkCell[] = [
	/* 0 */ blank(),        /* 1 */ given(R, 2), /* 2 */ given(B),     /* 3 */ given(B),
	/* 4 */ given(B),       /* 5 */ given(B),     /* 6 */ blank(),       /* 7 */ given(R),
	/* 8 */ given(R),       /* 9 */ blank(),       /* 10 */ given(R, 4), /* 11 */ given(B),
	/* 12 */ given(B),      /* 13 */ given(R),    /* 14 */ blank(),      /* 15 */ given(R),
]

// ─── Steps ─────────────────────────────────────────────────────────────────────

export const WALKTHROUGH_STEPS: readonly WalkStep[] = [
	{
		instruction: 'Tap an empty spot to color it. Make this one blue.',
		targetIndex: 14,
		expectedColor: 'blue',
	},
	{
		instruction: 'Double-tap to change the color. Make this spot red.',
		targetIndex: 6,
		expectedColor: 'red',
	},
	{
		instruction: 'Every line needs 2 red and 2 blue. This row has 2 red — color this one blue.',
		targetIndex: 9,
		expectedColor: 'blue',
	},
	{
		instruction: 'A number counts touching same-color spots (diagonals too). This red 2 needs one more red.',
		targetIndex: 0,
		expectedColor: 'red',
	},
]

export const TOTAL_WALKTHROUGH_STEPS = WALKTHROUGH_STEPS.length

// ─── Logic ─────────────────────────────────────────────────────────────────────

/** True when a tapped color satisfies the step's requirement. */
export const isStepSatisfied = (color: CellColor, step: WalkStep): boolean =>
	color === step.expectedColor

/**
 * Returns a new cells array with the step's target filled to its expected
 * color and locked. Pure — the input array is not mutated.
 */
export const applyStep = (cells: readonly WalkCell[], step: WalkStep): WalkCell[] =>
	cells.map((cell, i) =>
		i === step.targetIndex
			? { ...cell, color: step.expectedColor, locked: true }
			: { ...cell },
	)

/** Converts a flat cells array into the nested Grid shape used by validation. */
export const cellsToGrid = (cells: readonly WalkCell[]): Grid => {
	const size = WALKTHROUGH_GRID_SIZE
	const grid: Grid = []
	for (let row = 0; row < size; row++) {
		const rowCells: Cell[] = []
		for (let col = 0; col < size; col++) {
			const cell = cells[row * size + col]
			rowCells.push({
				color: cell?.color ?? null,
				number: cell?.number ?? null,
				locked: cell?.locked ?? false,
			})
		}
		grid.push(rowCells)
	}
	return grid
}

/** The fully solved board after every step has been applied, as a Grid. */
export const buildSolvedGrid = (): Grid => {
	const solved = WALKTHROUGH_STEPS.reduce<WalkCell[]>(
		(cells, step) => applyStep(cells, step),
		WALKTHROUGH_CELLS.map((c) => ({ ...c })),
	)
	return cellsToGrid(solved)
}
