<script lang="ts">
	import { fly, fade, scale } from "svelte/transition";
	import { elasticOut } from "svelte/easing";
	import type { CellColor } from "../../shared/types";
	import {
		WALKTHROUGH_CELLS,
		WALKTHROUGH_STEPS,
		WALKTHROUGH_GRID_SIZE,
		TOTAL_WALKTHROUGH_STEPS,
		isStepSatisfied,
		applyStep,
		type WalkCell,
	} from "../lib/tutorial-walkthrough";
	import { computeBoardSize } from "../lib/board-layout";
	import Cell from "../components/Cell.svelte";
	import manicule from "../assets/manicule.svg";

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

	// The canonical rules, shown as a list on the done screen.
	const RULES = [
		{
			id: 1,
			visual: "equal-count",
			text: "Equal red and blue in each line",
		},
		{
			id: 2,
			visual: "tap-cycle",
			text: "Tap to cycle colors",
		},
		{
			id: 3,
			visual: "number",
			text: "Number = touching same color",
		},
		{
			id: 4,
			visual: "different",
			text: "Adjacent lines must differ",
		},
	] as const;

	const size = WALKTHROUGH_GRID_SIZE;
	const canSkip = $derived(mode === "opt-in" || isReplay);

	let stepIndex = $state(0);
	let phase = $state<"playing" | "done">("playing");
	let cells = $state<WalkCell[]>(WALKTHROUGH_CELLS.map((c) => ({ ...c })));

	// Board sizing — matches GameView's dynamic approach
	let availableWidth = $state(0);
	let availableHeight = $state(0);
	const boardSize = $derived(
		computeBoardSize(availableWidth, availableHeight),
	);

	const step = $derived(WALKTHROUGH_STEPS[stepIndex]!);
	const activeIndex = $derived(phase === "playing" ? step.targetIndex : -1);
	const progressPct = $derived(
		phase === "done" ? 100 : (stepIndex / TOTAL_WALKTHROUGH_STEPS) * 100,
	);

	// Determine if the tooltip should be above or below the target cell.
	// Top row cells (row 0-1) get tooltip below to avoid going off-screen.
	const tooltipPosition = $derived.by((): "above" | "below" => {
		if (phase !== "playing") return "above";
		const row = Math.floor(step.targetIndex / size);
		// If cell is in top half of the board, show tooltip below
		return row < size / 2 ? "below" : "above";
	});

	function handleCellChange(index: number, newColor: CellColor): void {
		if (phase !== "playing" || index !== activeIndex) return;
		cells = cells.map((c, i) =>
			i === index ? { ...c, color: newColor } : c,
		);
		if (!isStepSatisfied(newColor, step)) return;
		// Correct color placed — lock it, then move on after a short beat.
		cells = applyStep(cells, step);
		setTimeout(advance, 320);
	}

	function advance(): void {
		if (stepIndex >= TOTAL_WALKTHROUGH_STEPS - 1) {
			phase = "done";
		} else {
			stepIndex += 1;
		}
	}

	function restart(): void {
		cells = WALKTHROUGH_CELLS.map((c) => ({ ...c }));
		stepIndex = 0;
		phase = "playing";
	}
</script>

<div class="h-full w-full flex flex-col bg-theme-bg-primary overflow-hidden">
	<!-- Progress bar -->
	<div class="flex-none h-1 bg-theme-bg-secondary w-full relative">
		<div
			class="absolute inset-y-0 left-0 bg-urjo-blue transition-all duration-500 ease-out"
			style="width: {progressPct}%"
		></div>
		{#if canSkip && phase === "playing"}
			<button
				onclick={onDismiss ?? onComplete}
				class="absolute right-2 top-2 text-xs text-theme-text-muted px-2 py-1 rounded-lg hover:bg-theme-hover transition-colors z-10"
			>
				Skip
			</button>
		{/if}
	</div>

	{#if phase === "playing"}
		<!-- Playing phase: instruction above/below target cell, board centered, dots at bottom -->
		<div class="flex-1 min-h-0 flex flex-col">
			<!-- Board container - takes remaining space -->
			<div
				class="flex-1 min-h-0 flex items-center justify-center"
				bind:clientWidth={availableWidth}
				bind:clientHeight={availableHeight}
			>
				<div
					class="relative"
					style="width: {boardSize}px; height: {boardSize}px"
				>
					<!-- Cells grid -->
					<div
						class="grid gap-0.5 w-full h-full"
						style="grid-template-columns: repeat({size}, 1fr)"
					>
						{#each cells as cell, i (i)}
							{@const isActive = i === activeIndex}
							<div class="relative aspect-square">
								<Cell
									color={cell.color}
									number={cell.number}
									locked={cell.locked || !isActive}
									rowIndex={Math.floor(i / size)}
									colIndex={i % size}
									isLoading={false}
									gridSize={size}
									isTutorialTarget={isActive}
									onChange={(c) => handleCellChange(i, c)}
								/>
								{#if isActive}
									<!-- Instruction tooltip positioned based on cell location -->
									<div
										class="pointer-events-none absolute z-20 w-max max-w-[180px] left-1/2 -translate-x-1/2
											{tooltipPosition === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'}"
									>
										{#key stepIndex}
											<p
												in:fly={{
													y:
														tooltipPosition ===
														"above"
															? 6
															: -6,
													duration: 220,
												}}
												class="text-center text-sm font-bold text-theme-text-primary leading-snug bg-theme-bg-primary/95 px-2 py-1.5 rounded-lg shadow-lg border border-theme-border"
											>
												{step.instruction}
											</p>
										{/key}
									</div>
									<!-- Pointing hand -->
									<span
										class="pointer-events-none absolute left-full top-1/2 -ml-2 z-20"
										style="transform: translateY(-8px)"
									>
										<img
											src={manicule}
											alt=""
											class="w-24 max-w-none animate-point drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
										/>
									</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Step dots - fixed at bottom -->
			<div class="flex-none pb-4 flex justify-center">
				<div class="flex gap-1.5">
					{#each WALKTHROUGH_STEPS as _, i (i)}
						<div
							class="h-1.5 rounded-full transition-all duration-300
								{i === stepIndex
								? 'w-5 bg-theme-text-primary'
								: i < stepIndex
									? 'w-1.5 bg-theme-text-primary/50'
									: 'w-1.5 bg-theme-text-primary/20'}"
						></div>
					{/each}
				</div>
			</div>
		</div>
	{:else}
		<!-- Done phase: celebration + rules + CTA -->
		<div
			in:fade={{ duration: 160 }}
			class="flex-1 min-h-0 flex flex-col items-center justify-start pt-6 px-4 gap-3 overflow-y-auto"
		>
			<!-- Celebration -->
			<div in:scale={{ duration: 420, easing: elasticOut, start: 0.5 }}>
				<span class="text-5xl leading-none">🎉</span>
			</div>
			<p class="text-lg font-extrabold text-theme-text-primary">
				You've got it!
			</p>

			<!-- Rules grid - 2x2 -->
			<div class="w-full max-w-[360px] grid grid-cols-2 gap-3">
				{#each RULES as rule (rule.id)}
					<div
						class="flex flex-col items-center gap-2 p-3 rounded-xl bg-theme-bg-secondary border border-theme-border"
					>
						<!-- Visual -->
						<div
							class="flex items-center justify-center w-full h-12"
						>
							{#if rule.visual === "equal-count"}
								<div class="flex gap-2">
									<div
										class="w-8 h-8 rounded-full bg-[#E54E3E]"
									></div>
									<div
										class="w-8 h-8 rounded-full bg-[#3997D7]"
									></div>
								</div>
							{:else if rule.visual === "tap-cycle"}
								<div class="flex items-center gap-1">
									<div
										class="w-6 h-6 rounded-full bg-gray-300"
									></div>
									<span class="text-sm text-theme-text-muted"
										>→</span
									>
									<div
										class="w-6 h-6 rounded-full bg-[#3997D7]"
									></div>
									<span class="text-sm text-theme-text-muted"
										>→</span
									>
									<div
										class="w-6 h-6 rounded-full bg-[#E54E3E]"
									></div>
								</div>
							{:else if rule.visual === "number"}
								<div
									class="w-10 h-10 rounded-full bg-[#E54E3E] flex items-center justify-center"
								>
									<span class="text-white text-base font-bold"
										>3</span
									>
								</div>
							{:else if rule.visual === "different"}
								<div class="flex flex-col gap-1">
									<div class="flex gap-1">
										<div
											class="w-4 h-4 rounded-full bg-[#E54E3E]"
										></div>
										<div
											class="w-4 h-4 rounded-full bg-[#3997D7]"
										></div>
										<div
											class="w-4 h-4 rounded-full bg-[#E54E3E]"
										></div>
									</div>
									<div class="flex gap-1">
										<div
											class="w-4 h-4 rounded-full bg-[#3997D7]"
										></div>
										<div
											class="w-4 h-4 rounded-full bg-[#E54E3E]"
										></div>
										<div
											class="w-4 h-4 rounded-full bg-[#3997D7]"
										></div>
									</div>
								</div>
							{/if}
						</div>
						<!-- Text with number -->
						<span
							class="text-sm text-theme-text-secondary leading-tight text-center"
						>
							<span class="font-bold text-theme-text-primary"
								>{rule.id}.</span
							>
							{rule.text}
						</span>
					</div>
				{/each}
			</div>

			<!-- CTA buttons -->
			<div class="flex flex-col gap-2 w-full max-w-[200px] mt-2 pb-4">
				<button
					onclick={onComplete}
					class="w-full px-4 py-3 bg-urjo-blue text-white font-bold rounded-xl text-base hover:opacity-90 active:scale-95 transition-all"
				>
					Play now!
				</button>
				<button
					onclick={restart}
					class="text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors"
				>
					Replay tutorial
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	@keyframes point {
		0%,
		100% {
			transform: translateX(0) scaleX(-1);
		}
		50% {
			transform: translateX(-6px) scaleX(-1);
		}
	}
	.animate-point {
		animation: point 0.9s ease-in-out infinite;
	}
</style>
