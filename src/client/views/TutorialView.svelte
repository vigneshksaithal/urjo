<script lang="ts">
	import type { CellColor, Grid, Cell } from "../../shared/types";
	import {
		TUTORIAL_COLORS,
		TUTORIAL_NUMBERS,
		TUTORIAL_STEPS,
	} from "../lib/tutorial-data";
	import type { TutorialStep } from "../lib/tutorial-data";
	import GameBoard from "../components/GameBoard.svelte";

	type Props = {
		onComplete: () => void;
		onDismiss?: () => void;
		isReplay?: boolean;
		mode?: "mandatory" | "opt-in";
	};

	let {
		onComplete,
		onDismiss,
		isReplay = false,
		mode = "mandatory",
	}: Props = $props();

	const GRID_SIZE = 4;

	let currentStepIndex = $state(0);
	let tutorialDone = $state(false);

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

	function isTargetCell(row: number, col: number): boolean {
		if (!currentStep) return false;
		return currentStep.targetCells.some(
			(t) => t.row === row && t.col === col,
		);
	}

	function handleCellChange(row: number, col: number, color: CellColor) {
		if (tutorialDone) return;
		if (!isTargetCell(row, col)) return;

		grid = grid.map((r, ri) =>
			ri === row
				? r.map((c, ci) =>
						ci === col
							? { color, number: c.number, locked: c.locked }
							: c,
					)
				: r,
		);

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
			}, 350);
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

	function getHandStyle(step: TutorialStep): string {
		const cellPercent = 25;
		// Position the hand emoji just below-right of the target cell
		const top = step.handRow * cellPercent + cellPercent * 0.55;
		const left = step.handCol * cellPercent + cellPercent * 0.55;
		return `top: ${top}%; left: ${left}%;`;
	}

	function handleRestart() {
		grid = buildInitialGrid();
		currentStepIndex = 0;
		tutorialDone = false;
	}

	const completionLabel = $derived(
		mode === "opt-in" || isReplay ? "Back to Game" : "Start Playing",
	);

	const totalSteps = TUTORIAL_STEPS.length;
</script>

<div class="h-full w-full flex flex-col bg-theme-bg-primary overflow-hidden">
	<!-- Top bar -->
	<div class="flex-none flex items-center justify-between px-4 pt-4 pb-2">
		<span
			class="text-xs font-semibold text-theme-text-muted uppercase tracking-widest"
		>
			How to Play
		</span>
		{#if mode === "opt-in" || isReplay}
			<button
				onclick={onDismiss ?? onComplete}
				class="text-xs text-theme-text-muted px-2 py-1 rounded-lg hover:bg-theme-hover transition-colors"
			>
				Skip
			</button>
		{/if}
	</div>

	<!-- Step instruction card -->
	<div class="flex-none px-4 pb-3">
		{#if tutorialDone}
			<div
				class="rounded-2xl bg-green-500/10 border border-green-500/30 px-4 py-4 text-center"
			>
				<p class="text-xl font-bold text-green-400">You got it! 🎉</p>
				<p class="text-sm text-theme-text-secondary mt-1">
					Now try the real puzzle.
				</p>
			</div>
		{:else if currentStep}
			<div
				class="rounded-2xl bg-theme-bg-secondary border border-theme-border px-4 py-4"
			>
				<p
					class="text-lg font-bold text-theme-text-primary leading-snug"
				>
					{currentStep.headline}
				</p>
				<p
					class="text-sm text-theme-text-secondary mt-1 leading-relaxed"
				>
					{currentStep.detail}
				</p>
			</div>
		{/if}
	</div>

	<!-- Board area -->
	<main class="flex-1 min-h-0 flex flex-col items-center justify-center px-6">
		<div class="relative w-full max-w-[300px] mx-auto">
			<GameBoard
				{grid}
				gridSize={GRID_SIZE}
				onCellChange={handleCellChange}
			/>

			<!-- Row / column highlight ring -->
			{#if currentStep && !tutorialDone}
				<div
					class="absolute pointer-events-none border-2 border-white/60 rounded-xl z-10"
					style={getHighlightStyle(currentStep)}
				></div>
			{/if}

			<!-- Animated hand pointer -->
			{#if currentStep && !tutorialDone}
				<div
					class="absolute pointer-events-none z-20 text-2xl animate-bounce"
					style={getHandStyle(currentStep)}
				>
					👆
				</div>
			{/if}

			<!-- Done overlay — just dim board, buttons are below -->
			{#if tutorialDone}
				<div
					class="absolute inset-0 rounded-xl bg-black/20 pointer-events-none z-10"
				></div>
			{/if}
		</div>
	</main>

	<!-- Footer: dots + buttons -->
	<footer class="flex-none px-4 pb-8 pt-4 flex flex-col gap-3">
		<!-- Progress dots -->
		{#if !tutorialDone}
			<div class="flex gap-1.5 justify-center mb-1">
				{#each TUTORIAL_STEPS as _, i (i)}
					<div
						class="h-1.5 rounded-full transition-all duration-300
							{i === currentStepIndex
							? 'w-6 bg-theme-text-primary'
							: i < currentStepIndex
								? 'w-1.5 bg-theme-text-primary/50'
								: 'w-1.5 bg-theme-text-primary/20'}"
					></div>
				{/each}
			</div>
		{/if}

		{#if tutorialDone}
			<button
				onclick={onComplete}
				class="w-full px-4 py-3.5 bg-theme-text-primary text-theme-bg-primary font-bold rounded-xl text-base hover:opacity-90 active:scale-95 transition-all"
			>
				{completionLabel}
			</button>
			<button
				onclick={handleRestart}
				class="w-full px-4 py-2.5 border border-theme-border text-theme-text-secondary font-semibold rounded-xl text-sm hover:bg-theme-hover active:scale-95 transition-all"
			>
				Replay Tutorial
			</button>
		{:else}
			<!-- Step counter -->
			<p class="text-center text-xs text-theme-text-muted">
				Step {currentStepIndex + 1} of {totalSteps} — follow the arrow
			</p>
		{/if}
	</footer>
</div>
