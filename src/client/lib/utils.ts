/**
 * Client-side utilities
 */

import type { Grid, Cell, CellColor } from '../../shared/types'

const GRID_SIZE = 4

/**
 * Deserialize board and numbers into a Grid.
 * puzzleColors is the initial puzzle state -- determines which cells are locked.
 */
export function deserializeGrid(colors: string, numbers: string, puzzleColors: string): Grid {
	const grid: Grid = []
	let index = 0

	for (let row = 0; row < GRID_SIZE; row++) {
		const rowCells: Cell[] = []
		for (let col = 0; col < GRID_SIZE; col++) {
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
