<script lang="ts">
	import type { Grid, CellColor } from '../../shared/types'
	import Cell from './Cell.svelte'

	type Props = {
		grid: Grid
		onCellChange: (row: number, col: number, color: CellColor) => void
	}

	let { grid, onCellChange }: Props = $props()
</script>

<div class="grid grid-cols-4 gap-2 w-full max-w-[340px] mx-auto">
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
