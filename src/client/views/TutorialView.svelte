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
	import { computeTutorialLayout } from "../lib/tutorial-layout";
	import Cell from "../components/Cell.svelte";

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
	const tutorialLayout = $derived(
		computeTutorialLayout(availableWidth, availableHeight),
	);
	const boardSize = $derived(tutorialLayout.boardSize);

	const step = $derived(WALKTHROUGH_STEPS[stepIndex]!);
	const activeIndex = $derived(phase === "playing" ? step.targetIndex : -1);
	const isIntroStep = $derived(phase === "playing" && stepIndex === 0);
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
</script>

<div
	class="relative h-full w-full flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#16384a_0%,#0a1822_46%,#04090f_100%)] text-white"
>
	<div class="pointer-events-none absolute inset-0">
		<div
			class="absolute left-1/2 top-[-14%] h-60 w-60 -translate-x-1/2 rounded-full bg-[#66d2ff]/18 blur-3xl"
		></div>
		<div
			class="absolute left-[-10%] bottom-[18%] h-40 w-40 rounded-full bg-[#3997d7]/14 blur-3xl"
		></div>
		<div
			class="absolute right-[-6%] top-[24%] h-32 w-32 rounded-full bg-white/8 blur-3xl"
		></div>
	</div>
	<!-- Progress bar -->
	<div class="relative z-10 flex-none h-1 w-full bg-white/10">
		<div
			class="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,#6ad4ff_0%,#3997d7_100%)] transition-all duration-500 ease-out"
			style="width: {progressPct}%"
		></div>
		{#if canSkip && phase === "playing"}
			<button
				onclick={onDismiss ?? onComplete}
				class="absolute right-3 top-3 z-10 rounded-full bg-white/7 px-3 py-1 text-xs font-semibold text-white/72 transition-colors hover:bg-white/12"
			>
				Skip
			</button>
		{/if}
	</div>

	{#if phase === "playing"}
		<!-- Playing phase: top instruction, board centered, dots at bottom -->
		<div class="relative z-10 flex flex-1 min-h-0 flex-col px-4 pt-3 sm:px-6">
			<div
				data-tutorial-instruction="top"
				class="pointer-events-none flex flex-none flex-col items-center justify-center gap-2 pt-2 pb-2"
			>
				{#key stepIndex}
					<div
						data-tutorial-headline="compact"
						in:fly={{ y: -8, duration: 220 }}
						class="w-full max-w-[18rem] rounded-[1.65rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.06))] px-4 py-3 text-center shadow-[0_18px_50px_rgba(0,0,0,0.28)] ring-1 ring-white/10 backdrop-blur-sm"
					>
						<p
							class="mb-1 text-[0.62rem] font-black uppercase tracking-[0.28em] text-[#9edfff]/72"
						>
							Step {stepIndex + 1} of {TOTAL_WALKTHROUGH_STEPS}
						</p>
						{#if isIntroStep}
							<p
								class="text-[1.42rem] font-extrabold leading-[1.1] tracking-[-0.03em] text-white"
							>
								Tap the <span class="text-[#8fdcff]">glowing</span>
								dot to turn it blue.
							</p>
						{:else}
							<p
								class="text-[1.18rem] font-extrabold leading-[1.16] tracking-[-0.02em] text-white"
							>
								{step.instruction}
							</p>
						{/if}
					</div>
				{/key}
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					class="h-4 w-4 text-white/45"
				>
					<path
						d="M 6 9 L 12 15 L 18 9"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</div>

			<!-- Board container - takes remaining space -->
			<div
				class="flex-1 min-h-0 flex items-center justify-center py-2"
				bind:clientWidth={availableWidth}
				bind:clientHeight={availableHeight}
			>
				<div
					class="relative"
					style="width: {boardSize}px; height: {boardSize}px"
				>
					<div
						data-tutorial-spotlight="true"
						class="absolute left-1/2 top-[-18%] h-[72%] w-[76%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(122,215,255,0.28)_0%,rgba(122,215,255,0.12)_48%,rgba(122,215,255,0)_74%)] blur-2xl"
					></div>
					<div
						data-tutorial-stage="true"
						class="absolute inset-[-1.1rem] rounded-[2rem] bg-[linear-gradient(180deg,rgba(18,53,70,0.96)_0%,rgba(8,27,38,0.94)_100%)] shadow-[0_22px_50px_rgba(0,0,0,0.38)] ring-1 ring-white/8"
					></div>
					<div
						class="absolute inset-x-[12%] bottom-[-0.55rem] h-6 rounded-full bg-[#071018]/90 blur-md"
					></div>
					<div
						class="absolute inset-[-0.3rem] rounded-[1.7rem] bg-[radial-gradient(circle_at_top,rgba(150,224,255,0.17)_0%,rgba(150,224,255,0.08)_28%,rgba(150,224,255,0)_62%)]"
					></div>
					<!-- Cells grid -->
					<div
						class="relative z-10 grid h-full w-full gap-0.5 rounded-[1.45rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.02))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
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
								? 'w-5 bg-[#8fdcff]'
								: i < stepIndex
									? 'w-1.5 bg-white/45'
									: 'w-1.5 bg-white/18'}"
						></div>
					{/each}
				</div>
			</div>
		</div>
	{:else}
		<!-- Done phase: celebration + rules + CTA -->
		<div
			in:fade={{ duration: 160 }}
			class="flex-1 min-h-0 flex flex-col items-center justify-start pt-8 px-4 gap-3 overflow-y-auto"
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
