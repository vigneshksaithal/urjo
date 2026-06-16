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
		{ emoji: "🔴🔵", text: "Each line needs equal red and blue spots" },
		{ emoji: "👆👆", text: "Tap to color blue, double-tap to change to red" },
		{ emoji: "🔢", text: "A number shows how many touching spots share its color (diagonals count)" },
		{ emoji: "↕️↔️", text: "Two lines next to each other must be different" },
	] as const;

	const size = WALKTHROUGH_GRID_SIZE;
	const canSkip = $derived(mode === "opt-in" || isReplay);

	let stepIndex = $state(0);
	let phase = $state<"playing" | "done">("playing");
	let cells = $state<WalkCell[]>(WALKTHROUGH_CELLS.map((c) => ({ ...c })));

	const step = $derived(WALKTHROUGH_STEPS[stepIndex]!);
	const activeIndex = $derived(phase === "playing" ? step.targetIndex : -1);
	const progressPct = $derived(
		phase === "done" ? 100 : (stepIndex / TOTAL_WALKTHROUGH_STEPS) * 100,
	);

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

	// Outline placement on an overlay grid that mirrors the board template.
	const highlightStyle = $derived.by((): string | null => {
		if (phase !== "playing") return null;
		const h = step.highlight;
		if (h.type === "row")
			return `grid-column: 1 / span ${size}; grid-row: ${h.index + 1} / span 1;`;
		if (h.type === "col")
			return `grid-column: ${h.index + 1} / span 1; grid-row: 1 / span ${size};`;
		const r = Math.floor(h.index / size);
		const c = h.index % size;
		return `grid-column: ${c + 1} / span 1; grid-row: ${r + 1} / span 1;`;
	});
</script>

<div
	class="h-full w-full flex flex-col bg-theme-bg-primary overflow-hidden relative"
>
	<!-- Progress bar -->
	<div class="flex-none relative h-1 bg-theme-bg-secondary w-full">
		<div
			class="absolute inset-y-0 left-0 bg-urjo-blue transition-all duration-500 ease-out"
			style="width: {progressPct}%"
		></div>
		{#if canSkip && phase === "playing"}
			<button
				onclick={onDismiss ?? onComplete}
				class="absolute right-3 top-3 text-xs text-theme-text-muted px-2 py-1 rounded-lg hover:bg-theme-hover transition-colors z-10"
			>
				Skip
			</button>
		{/if}
	</div>

	{#if phase === "playing"}
		<div class="flex-1 min-h-0 flex flex-col items-center justify-center px-6">
			<!-- Instruction line -->
			<div class="w-full max-w-[300px] min-h-[3.5rem] flex items-center justify-center mb-2">
				{#key stepIndex}
					<p
						in:fly={{ y: -6, duration: 220 }}
						class="text-center text-sm font-bold text-theme-text-primary leading-snug"
					>
						{step.instruction}
					</p>
				{/key}
			</div>

			<!-- Board + overlays -->
			<div class="relative w-full max-w-[280px] mx-auto mt-8">
				<!-- Cells -->
				<div
					class="grid gap-0.5"
					style="grid-template-columns: repeat({size}, 1fr)"
				>
					{#each cells as cell, i (i)}
						{@const isActive = i === activeIndex}
						<div
							class="relative aspect-square transition-opacity duration-300 {!cell.locked &&
							!isActive
								? 'opacity-30'
								: ''}"
						>
							<Cell
								color={cell.color}
								number={cell.number}
								locked={cell.locked || !isActive}
								rowIndex={Math.floor(i / size)}
								colIndex={i % size}
								isLoading={false}
								gridSize={size}
								onChange={(c) => handleCellChange(i, c)}
							/>
							{#if isActive}
								<span
									class="pointer-events-none absolute left-full top-1/2 -ml-2 z-10"
									style="transform: translateY(-8px)"
								>
									<img
										src={manicule}
										alt=""
										class="w-20 max-w-none animate-point drop-shadow-md"
									/>
								</span>
							{/if}
						</div>
					{/each}
				</div>

				<!-- Highlight outline -->
				{#if highlightStyle}
					<div
						class="pointer-events-none absolute inset-0 grid gap-0.5"
						style="grid-template-columns: repeat({size}, 1fr); grid-template-rows: repeat({size}, 1fr)"
					>
						<div
							class="rounded-2xl border-2 border-white/80 transition-all duration-300"
							style={highlightStyle}
						></div>
					</div>
				{/if}
			</div>

			<!-- Step dots -->
			<div class="flex gap-1.5 mt-10">
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
	{:else}
		<!-- Done -->
		<div
			in:fade={{ duration: 160 }}
			class="flex-1 min-h-0 flex flex-col items-center justify-center px-8 text-center gap-5"
		>
			<div in:scale={{ duration: 420, easing: elasticOut, start: 0.5 }}>
				<span class="text-7xl leading-none">🎉</span>
			</div>
			<p class="text-2xl font-extrabold text-theme-text-primary">
				You've got it!
			</p>
			<ul class="w-full max-w-[300px] flex flex-col gap-2 text-left">
				{#each RULES as rule (rule.emoji)}
					<li class="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-theme-bg-secondary border border-theme-border">
						<span class="text-base shrink-0 leading-snug">{rule.emoji}</span>
						<span class="text-sm text-theme-text-secondary leading-snug">{rule.text}</span>
					</li>
				{/each}
			</ul>
			<div class="flex flex-col gap-3 w-full max-w-[240px] mt-1">
				<button
					onclick={onComplete}
					class="w-full px-4 py-4 bg-urjo-blue text-white font-bold rounded-xl text-lg hover:opacity-90 active:scale-95 transition-all"
				>
					Play now! 🎮
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
