<script lang="ts">
	import type { Grid, CellColor } from "../../shared/types";
	import Cell from "./Cell.svelte";

	type Props = {
		grid: Grid;
		gridSize: number;
		onCellChange: (row: number, col: number, color: CellColor) => void;
		violatedRows?: Set<number>;
		violatedCols?: Set<number>;
		completedRows?: Set<number>;
		completedCols?: Set<number>;
	};

	let {
		grid,
		gridSize,
		onCellChange,
		violatedRows = new Set(),
		violatedCols = new Set(),
		completedRows = new Set(),
		completedCols = new Set(),
	}: Props = $props();

	const gridStyle = $derived(
		`grid-template-columns: repeat(${gridSize}, 1fr)`,
	);
	const maxWidth = $derived(
		gridSize === 8 ? "max-w-[480px]" : gridSize === 6 ? "max-w-[400px]" : "max-w-[340px]",
	);
</script>

<div class="grid gap-0 w-full mx-auto {maxWidth}" style={gridStyle}>
	{#each grid as row, rowIndex}
		{#each row as cell, colIndex}
			<Cell
				color={cell.color}
				number={cell.number}
				locked={cell.locked}
				{rowIndex}
				{colIndex}
				isLoading={cell.isLoading ?? false}
				hasError={violatedRows.has(rowIndex) || violatedCols.has(colIndex)}
				isRowComplete={completedRows.has(rowIndex)}
				isColComplete={completedCols.has(colIndex)}
				{gridSize}
				onChange={(color) => onCellChange(rowIndex, colIndex, color)}
			/>
		{/each}
	{/each}
</div>
