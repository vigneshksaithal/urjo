<script lang="ts">
	import type { Grid, CellColor } from '../../shared/types'
	import Cell from './Cell.svelte'

	type Props = {
		grid: Grid
		onCellChange: (row: number, col: number, color: CellColor) => void
	}

	let { grid, onCellChange }: Props = $props()
</script>

<div class="grid grid-cols-4 gap-3 max-w-[352px] mx-auto">
	{#each grid as row, rowIndex}
		{#each row as cell, colIndex}
			<Cell color={cell.color} onChange={(color) => onCellChange(rowIndex, colIndex, color)} />
		{/each}
	{/each}
</div>
