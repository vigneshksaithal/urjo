<script lang="ts">
	import type { CellColor, Grid, Cell } from "../../shared/types";
	import {
		TUTORIAL_COLORS,
		TUTORIAL_NUMBERS,
		TUTORIAL_STEPS,
	} from "../lib/tutorial-data";
	import type { TutorialStep } from "../lib/tutorial-data";
	import GameBoard from "../components/GameBoard.svelte";
	import ArrowDownLeft from "lucide-svelte/icons/arrow-down-left";

	type Props = {
		onComplete: () => void;
		isReplay?: boolean;
	};

	let { onComplete, isReplay = false }: Props = $props();

	const GRID_SIZE = 4;

	let currentStepIndex = $state(0);
	let tutorialDone = $state(false);
	let showSkip = $state(false);

	// Show skip button after 4 seconds
	$effect(() => {
		const timeout = setTimeout(() => {
			showSkip = true;
		}, 4000);
		return () => clearTimeout(timeout);
	});

	function buildInitialGrid(): Grid {
		const grid: Grid = [];
		let index = 0;
		for (let row = 0; row < GRID_SIZE; row++) {
			const rowCells: Cell[] = [];
			for (let col = 0; col < GRID_SIZE; col++) {
				const colorChar = TUTORIAL_COLORS[index] ?? ".";
				const numberChar = TUTORIAL_NUMBERS[index] ?? "-";
				const color: CellColor =
					colorChar === "r"
						? "red"
						: colorChar === "b"
							? "blue"
							: null;
				const number =
					numberChar !== "-" ? parseInt(numberChar, 10) : null;
				const locked = colorChar !== ".";
				rowCells.push({ color, number, locked });
				index++;
			}
			grid.push(rowCells);
		}
		return grid;
	}

	let grid = $state<Grid>(buildInitialGrid());

	let currentStep = $derived<TutorialStep | null>(
		currentStepIndex < TUTORIAL_STEPS.length
			? (TUTORIAL_STEPS[currentStepIndex] ?? null)
			: null,
	);

	/**
	 * Check if a cell is a target for the current step (allows cycling even if already colored).
	 */
	function isTargetCell(row: number, col: number): boolean {
		if (!currentStep) return false;
		return currentStep.targetCells.some(
			(t) => t.row === row && t.col === col,
		);
	}

	/**
	 * Handle cell tap in tutorial -- normal cycling (blue → red → empty),
	 * step advances only when ALL target cells have their correct color.
	 */
	function handleCellChange(row: number, col: number, color: CellColor) {
		if (tutorialDone) return;
		if (!isTargetCell(row, col)) return;

		// Apply the cycled color from Cell (normal tap behavior)
		grid = grid.map((r, ri) =>
			ri === row
				? r.map((c, ci) =>
						ci === col
							? { color, number: c.number, locked: c.locked }
							: c,
					)
				: r,
		);

		// Check if ALL target cells now have their expected color
		const allCorrect = currentStep!.targetCells.every((t) => {
			const r = grid[t.row];
			if (!r) return false;
			const c = r[t.col];
			return c ? c.color === t.expectedColor : false;
		});

		if (allCorrect) {
			setTimeout(() => {
				if (currentStepIndex < TUTORIAL_STEPS.length - 1) {
					currentStepIndex++;
				} else {
					tutorialDone = true;
				}
			}, 400);
		}
	}

	function getHighlightStyle(step: TutorialStep): string {
		const cellPercent = 25;

		if (step.highlightType === "row") {
			const top = step.highlightIndex * cellPercent;
			return `top: ${top}%; left: -2%; width: 104%; height: ${cellPercent}%;`;
		} else {
			const left = step.highlightIndex * cellPercent;
			return `top: -2%; left: ${left}%; width: ${cellPercent}%; height: 104%;`;
		}
	}

	function getArrowStyle(step: TutorialStep): string {
		const cellPercent = 25;
		// Position arrow outside and above the target cell, pointing towards it
		const top = step.handRow * cellPercent - 8; // 8% above the cell
		const left = step.handCol * cellPercent + cellPercent * 1.1; // Slightly to the right
		return `top: ${top}%; left: ${left}%;`;
	}

	function handleRestart() {
		grid = buildInitialGrid();
		currentStepIndex = 0;
		tutorialDone = false;
	}
</script>

<div class="h-full w-full flex flex-col p-4 overflow-hidden">
	<!-- Instruction text at top with white border box -->
	<div
		class="flex-none min-h-[60px] flex items-center justify-center px-2 mb-2"
	>
		{#if tutorialDone}
			<div
				class="border-2 border-theme-border rounded-lg px-4 py-3 bg-theme-bg-secondary backdrop-blur-sm"
			>
				<p
					class="text-theme-text-primary font-mono text-sm text-center leading-relaxed"
				>
					Tutorial complete. Continue below.
				</p>
			</div>
		{:else if currentStep}
			<div
				class="border-2 border-theme-border rounded-lg px-4 py-3 bg-theme-bg-secondary backdrop-blur-sm"
			>
				<p
					class="text-theme-text-primary font-mono text-sm text-center leading-relaxed"
				>
					{currentStep.instruction}
				</p>
			</div>
		{/if}
	</div>

	<!-- Game board with overlays -->
	<main class="flex-1 min-h-0 flex flex-col items-center justify-center">
		<div class="relative w-full max-w-[340px] mx-auto">
			<!-- The game board -->
			<GameBoard
				{grid}
				gridSize={GRID_SIZE}
				onCellChange={handleCellChange}
			/>

			<!-- Highlight overlay -->
			{#if currentStep && !tutorialDone}
				<div
					class="absolute pointer-events-none border-2 border-theme-text-primary/70 rounded-xl z-10"
					style={getHighlightStyle(currentStep)}
				></div>
			{/if}

			<!-- Arrow pointer: positioned outside, pointing towards cell to tap -->
			{#if currentStep && !tutorialDone}
				<div
					class="absolute pointer-events-none z-20"
					style={getArrowStyle(currentStep)}
				>
					<ArrowDownLeft
						size={40}
						color="var(--theme-text-primary)"
						strokeWidth={3}
						class="drop-shadow-lg animate-bounce"
					/>
				</div>
			{/if}

			<!-- Completion overlay -->
			{#if tutorialDone}
				<div
					class="absolute inset-0 flex flex-col items-center justify-center z-20 bg-theme-overlay backdrop-blur-sm"
				>
					<div class="flex flex-col items-center gap-3">
						<button
							onclick={onComplete}
							class="px-8 py-2.5 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg
								text-base hover:opacity-90 active:scale-95 transition-all shadow-lg"
						>
							{isReplay ? "Back to Game" : "Next Challenge"}
						</button>
						<button
							onclick={handleRestart}
							class="px-6 py-1.5 border border-theme-border text-theme-text-secondary rounded-lg
								text-sm hover:bg-theme-hover active:scale-95 transition-all"
						>
							Restart Tutorial
						</button>
					</div>
				</div>
			{/if}
		</div>
	</main>

	 <!-- Step indicator -->
	<footer class="flex-none h-10 flex items-center justify-center relative">
		{#if !tutorialDone}
			<div class="flex gap-1.5">
				{#each TUTORIAL_STEPS as _, i (i)}
					<div
						class="w-2 h-2 rounded-full transition-colors
							{i === currentStepIndex
							? 'bg-theme-text-primary'
							: i < currentStepIndex
								? 'bg-theme-text-primary/50'
								: 'bg-theme-text-primary/20'}"
					></div>
				{/each}
			</div>
		{/if}

		<!-- Skip tutorial button -->
		{#if showSkip && !tutorialDone}
			<button
				onclick={onComplete}
				class="absolute right-0 top-1/2 -translate-y-1/2 px-3 py-1 text-xs text-theme-text-secondary/70
					hover:text-theme-text-primary active:scale-95 transition-all"
			>
				Skip tutorial →
			</button>
		{/if}
	</footer>
</div>
