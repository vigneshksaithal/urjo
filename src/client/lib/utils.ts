/**
 * Client-side utilities
 */

import type { Cell, Grid, CellColor } from '../../shared/types'

/**
 * Deserialize board and numbers into a Grid.
 * puzzleColors is the initial puzzle state -- determines which cells are locked.
 * gridSize determines the grid dimensions (4 or 6).
 */
export function deserializeGrid(
	colors: string,
	numbers: string,
	puzzleColors: string,
	gridSize: number
): Grid {
	const grid: Grid = []
	let index = 0

	for (let row = 0; row < gridSize; row++) {
		const rowCells: Cell[] = []
		for (let col = 0; col < gridSize; col++) {
			const colorChar = colors[index] ?? '.'
			const numberChar = numbers[index] ?? '-'
			const puzzleColorChar = puzzleColors[index] ?? '.'

			const color: CellColor = colorChar === 'r' ? 'red' : colorChar === 'b' ? 'blue' : null
			const number = numberChar !== '-' ? parseInt(numberChar, 10) : null
			const locked = puzzleColorChar !== '.'

			rowCells.push({ color, number, locked })
			index++
		}
		grid.push(rowCells)
	}

	return grid
}

/**
 * Serialize a Grid back into a board string for completion comparison.
 * Maps: 'red' → 'r', 'blue' → 'b', null → '.'
 */
export function serializeGrid(grid: Grid): string {
	return grid
		.flat()
		.map((cell) => (cell.color === 'red' ? 'r' : cell.color === 'blue' ? 'b' : '.'))
		.join('')
}
