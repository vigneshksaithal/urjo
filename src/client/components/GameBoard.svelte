<script lang="ts">
	import type { Grid, CellColor } from '../../shared/types'
	import Cell from './Cell.svelte'

	type Props = {
		grid: Grid
		gridSize: number
		onCellChange: (row: number, col: number, color: CellColor) => void
	}

	let { grid, gridSize, onCellChange }: Props = $props()

	const gridStyle = $derived(`grid-template-columns: repeat(${gridSize}, 1fr)`)
	const maxWidth = $derived(gridSize === 6 ? 'max-w-[400px]' : 'max-w-[340px]')
</script>

<div class="grid gap-0 w-full mx-auto {maxWidth}" style={gridStyle}>
	{#each grid as row, rowIndex}
		{#each row as cell, colIndex}
			<Cell
				color={cell.color}
				number={cell.number}
				locked={cell.locked}
				rowIndex={rowIndex}
				colIndex={colIndex}
				isLoading={cell.isLoading ?? false}
				onChange={(color) => onCellChange(rowIndex, colIndex, color)}
			/>
		{/each}
	{/each}
</div>
