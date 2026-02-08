<script lang="ts">
	import type { CellColor, Grid, Cell } from '../../shared/types'
	import {
		TUTORIAL_COLORS,
		TUTORIAL_NUMBERS,
		TUTORIAL_STEPS,
	} from '../lib/tutorial-data'
	import type { TutorialStep } from '../lib/tutorial-data'
	import GameBoard from '../components/GameBoard.svelte'
	import ConfettiEffect from '../components/ConfettiEffect.svelte'

	type Props = {
		onComplete: () => void
		isReplay?: boolean
	}

	let { onComplete, isReplay = false }: Props = $props()

	const GRID_SIZE = 4

	let currentStepIndex = $state(0)
	let tutorialDone = $state(false)

	function buildInitialGrid(): Grid {
		const grid: Grid = []
		let index = 0
		for (let row = 0; row < GRID_SIZE; row++) {
			const rowCells: Cell[] = []
			for (let col = 0; col < GRID_SIZE; col++) {
				const colorChar = TUTORIAL_COLORS[index] ?? '.'
				const numberChar = TUTORIAL_NUMBERS[index] ?? '-'
				const color: CellColor =
					colorChar === 'r' ? 'red' : colorChar === 'b' ? 'blue' : null
				const number = numberChar !== '-' ? parseInt(numberChar, 10) : null
				const locked = colorChar !== '.'
				rowCells.push({ color, number, locked })
				index++
			}
			grid.push(rowCells)
		}
		return grid
	}

	let grid = $state<Grid>(buildInitialGrid())

	let currentStep = $derived<TutorialStep | null>(
		currentStepIndex < TUTORIAL_STEPS.length
			? (TUTORIAL_STEPS[currentStepIndex] ?? null)
			: null
	)

	/**
	 * Check if a cell is a target for the current step (allows cycling even if already colored).
	 */
	function isTargetCell(row: number, col: number): boolean {
		if (!currentStep) return false
		return currentStep.targetCells.some((t) => t.row === row && t.col === col)
	}

	/**
	 * Handle cell tap in tutorial -- normal cycling (blue → red → empty),
	 * step advances only when ALL target cells have their correct color.
	 */
	function handleCellChange(row: number, col: number, color: CellColor) {
		if (tutorialDone) return
		if (!isTargetCell(row, col)) return

		// Apply the cycled color from Cell (normal tap behavior)
		grid = grid.map((r, ri) =>
			ri === row
				? r.map((c, ci) =>
						ci === col ? { color, number: c.number, locked: c.locked } : c
					)
				: r
		)

		// Check if ALL target cells now have their expected color
		const allCorrect = currentStep!.targetCells.every((t) => {
			const r = grid[t.row]
			if (!r) return false
			const c = r[t.col]
			return c ? c.color === t.expectedColor : false
		})

		if (allCorrect) {
			setTimeout(() => {
				if (currentStepIndex < TUTORIAL_STEPS.length - 1) {
					currentStepIndex++
				} else {
					tutorialDone = true
				}
			}, 400)
		}
	}

	function getHighlightStyle(step: TutorialStep): string {
		const cellPercent = 25

		if (step.highlightType === 'row') {
			const top = step.highlightIndex * cellPercent
			return `top: ${top}%; left: -2%; width: 104%; height: ${cellPercent}%;`
		} else {
			const left = step.highlightIndex * cellPercent
			return `top: -2%; left: ${left}%; width: ${cellPercent}%; height: 104%;`
		}
	}

	function getHandStyle(step: TutorialStep): string {
		const cellPercent = 25
		const top = step.handRow * cellPercent + cellPercent * 0.6
		const left = step.handCol * cellPercent + cellPercent * 0.3
		return `top: ${top}%; left: ${left}%;`
	}

	function handleRestart() {
		grid = buildInitialGrid()
		currentStepIndex = 0
		tutorialDone = false
	}
</script>

<div class="h-full w-full flex flex-col p-4 overflow-hidden">
	<!-- Instruction text at top -->
	<div class="flex-none min-h-[60px] flex items-center justify-center px-2 mb-2">
		{#if tutorialDone}
			<p class="text-white font-mono text-sm text-center leading-relaxed">
				Tutorial complete. Continue below.
			</p>
		{:else if currentStep}
			<p class="text-white font-mono text-sm text-center leading-relaxed">
				{currentStep.instruction}
			</p>
		{/if}
	</div>

	<!-- Game board with overlays -->
	<main class="flex-1 min-h-0 flex flex-col items-center justify-center">
		<div class="relative w-full max-w-[340px] mx-auto">
			<!-- The game board -->
			<GameBoard {grid} onCellChange={handleCellChange} />

			<!-- Highlight overlay -->
			{#if currentStep && !tutorialDone}
				<div
					class="absolute pointer-events-none border-2 border-white/70 rounded-xl z-10"
					style={getHighlightStyle(currentStep)}
				></div>
			{/if}

			<!-- Hand icon -->
			{#if currentStep && !tutorialDone}
				<div
					class="absolute pointer-events-none z-20 w-12 h-12"
					style={getHandStyle(currentStep)}
				>
					<svg
						viewBox="0 0 64 64"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
						class="w-full h-full drop-shadow-lg"
					>
						<path
							d="M32 4C30 4 28 6 28 8V28L16 24C14 23.3 12 24 11 26C10 28 11 30 13 31L28 36V48C28 52 30 56 34 56H42C46 56 50 52 50 48V24C50 12 44 4 32 4Z"
							fill="white"
							stroke="#333"
							stroke-width="2"
						/>
						<path
							d="M36 8V28M42 12V28M28 28V8"
							stroke="#333"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
				</div>
			{/if}

			<!-- Completion overlay -->
			{#if tutorialDone}
				<div class="absolute inset-0 flex flex-col items-center justify-center z-20">
					<div class="flex flex-col items-center gap-3">
						<button
							onclick={onComplete}
							class="px-8 py-2.5 bg-white text-black font-bold rounded-lg
								text-base hover:bg-gray-100 active:scale-95 transition-all"
						>
							{isReplay ? 'Back to Game' : 'Next Challenge'}
						</button>
						<button
							onclick={handleRestart}
							class="px-6 py-1.5 border border-white/50 text-white/80 rounded-lg
								text-sm hover:bg-white/10 active:scale-95 transition-all"
						>
							Restart Tutorial
						</button>
					</div>
				</div>
			{/if}
		</div>
	</main>

	<!-- Step indicator -->
	<footer class="flex-none h-10 flex items-center justify-center">
		{#if !tutorialDone}
			<div class="flex gap-1.5">
				{#each TUTORIAL_STEPS as _, i (i)}
					<div
						class="w-2 h-2 rounded-full transition-colors
							{i === currentStepIndex ? 'bg-white' : i < currentStepIndex ? 'bg-white/50' : 'bg-white/20'}"
					></div>
				{/each}
			</div>
		{/if}
	</footer>
</div>

{#if tutorialDone}
	<ConfettiEffect />
{/if}
