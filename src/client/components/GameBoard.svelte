<script lang="ts">
	import type { Grid, CellColor } from "../../shared/types";
	import Cell from "./Cell.svelte";

	type Props = {
		grid: Grid;
		gridSize: number;
		onCellChange: (row: number, col: number, color: CellColor) => void;
		violatedRows?: Set<number>;
		violatedCols?: Set<number>;
		hintCell?: { row: number; col: number; color: "blue" | "red" } | null;
	};

	let {
		grid,
		gridSize,
		onCellChange,
		violatedRows = new Set(),
		violatedCols = new Set(),
		hintCell = null,
	}: Props = $props();

	const gridStyle = $derived(
		`grid-template-columns: repeat(${gridSize}, 1fr)`,
	);
</script>

<div
	class="grid gap-[clamp(4px,1.4vw,10px)] p-[clamp(2px,0.7vw,6px)] w-full h-full overflow-visible"
	style={gridStyle}
>
	{#each grid as row, rowIndex}
		{#each row as cell, colIndex}
			<Cell
				color={cell.color}
				number={cell.number}
				locked={cell.locked}
				{rowIndex}
				{colIndex}
				isLoading={cell.isLoading ?? false}
				hasError={violatedRows.has(rowIndex) ||
					violatedCols.has(colIndex)}
				{gridSize}
				isHint={hintCell !== null &&
					hintCell.row === rowIndex &&
					hintCell.col === colIndex}
				hintColor={hintCell !== null &&
				hintCell.row === rowIndex &&
				hintCell.col === colIndex
					? hintCell.color
					: undefined}
				onChange={(color) => onCellChange(rowIndex, colIndex, color)}
			/>
		{/each}
	{/each}
</div>
