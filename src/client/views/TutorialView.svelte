<script lang="ts">
	import { fly, fade, scale } from "svelte/transition";
	import { elasticOut } from "svelte/easing";
	import type { CellColor } from "../../shared/types";
	import { TUTORIAL_LESSONS, TOTAL_LESSONS } from "../lib/tutorial-data";
	import type { LessonCell } from "../lib/tutorial-data";
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

	// ── State ────────────────────────────────────────────────────────────────────

	let lessonIndex = $state(0);
	let phase = $state<"playing" | "celebrating">("playing");
	let cells = $state<LessonCell[]>([]);
	let feedbackMsg = $state<string | null>(null);
	let feedbackType = $state<"error" | "hint">("hint");
	let shakeIndex = $state<number | null>(null);
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
	let hintTimer: ReturnType<typeof setTimeout> | null = null;

	// ── Derived ──────────────────────────────────────────────────────────────────

	const lesson = $derived(TUTORIAL_LESSONS[lessonIndex]!);
	const progressPct = $derived(
		((lessonIndex + (phase === "celebrating" ? 1 : 0)) / TOTAL_LESSONS) *
			100,
	);
	const isLastLesson = $derived(lessonIndex === TOTAL_LESSONS - 1);

	// ── Lesson init ──────────────────────────────────────────────────────────────

	function initLesson(index: number): void {
		const l = TUTORIAL_LESSONS[index];
		if (!l) return;
		cells = l.cells.map((c) => ({ ...c }));
		feedbackMsg = l.subtitle; // subtitle as initial soft hint
		feedbackType = "hint";
		shakeIndex = null;
		clearTimers();
		// After 4s, show the contextual hint if user is idle
		hintTimer = setTimeout(() => {
			if (feedbackType !== "error") {
				feedbackMsg = l.hint || l.subtitle;
				feedbackType = "hint";
			}
		}, 4000);
	}

	$effect(() => {
		initLesson(lessonIndex);
	});

	function clearTimers(): void {
		if (feedbackTimer) {
			clearTimeout(feedbackTimer);
			feedbackTimer = null;
		}
		if (hintTimer) {
			clearTimeout(hintTimer);
			hintTimer = null;
		}
	}

	// ── Cell interaction ─────────────────────────────────────────────────────────

	function handleCellChange(flatIndex: number, newColor: CellColor): void {
		if (phase !== "playing") return;
		const cell = cells[flatIndex];
		if (!cell || cell.locked) return;

		// On first interaction, clear the subtitle hint
		if (feedbackType === "hint") {
			feedbackMsg = null;
			clearTimers();
		}

		cells = cells.map((c, i) =>
			i === flatIndex ? { ...c, color: newColor } : c,
		);

		if (lesson.successCriteria === "exact-targets" && newColor !== null) {
			const expected = cells[flatIndex]?.expectedColor;
			if (expected && newColor !== expected) {
				triggerError(flatIndex, lesson.errorMessage);
				return;
			}
		}

		if (checkSuccess()) {
			feedbackMsg = null;
			clearTimers();
			setTimeout(() => advanceLesson(), 300);
		}
	}

	function triggerError(index: number, message: string): void {
		clearTimers();
		feedbackMsg = message;
		feedbackType = "error";
		shakeIndex = index;
		feedbackTimer = setTimeout(() => {
			feedbackMsg = lesson.hint || null;
			feedbackType = "hint";
			shakeIndex = null;
		}, 1600);
	}

	// ── Success logic ────────────────────────────────────────────────────────────

	function checkSuccess(): boolean {
		if (lesson.successCriteria === "any-color") {
			return cells.some((c) => !c.locked && c.color !== null);
		}
		if (lesson.id === "balance-row") {
			const reds = cells.filter((c) => c.color === "red").length;
			const blues = cells.filter((c) => c.color === "blue").length;
			return reds === 2 && blues === 2;
		}
		return cells.every(
			(c) =>
				c.locked ||
				c.expectedColor === null ||
				c.color === c.expectedColor,
		);
	}

	// ── Progression ──────────────────────────────────────────────────────────────

	function advanceLesson(): void {
		clearTimers();
		phase = "celebrating";
	}

	function afterCelebration(): void {
		if (isLastLesson) {
			onComplete();
		} else {
			lessonIndex += 1;
			phase = "playing";
		}
	}
</script>

<div
	class="h-full w-full flex flex-col bg-theme-bg-primary overflow-hidden relative"
>
	<!-- ── Slim progress bar ─────────────────────────────────────────────────── -->
	<div class="flex-none relative h-1 bg-theme-bg-secondary w-full">
		<div
			class="absolute inset-y-0 left-0 bg-urjo-blue transition-all duration-500 ease-out"
			style="width: {progressPct}%"
		></div>
		{#if mode === "opt-in" || isReplay}
			<button
				onclick={onDismiss ?? onComplete}
				class="absolute right-3 top-3 text-xs text-theme-text-muted px-2 py-1 rounded-lg hover:bg-theme-hover transition-colors z-10"
			>
				Skip
			</button>
		{/if}
	</div>

	<!-- ── Playing phase ─────────────────────────────────────────────────────── -->
	{#if phase === "playing"}
		<div
			class="flex-1 min-h-0 flex flex-col items-center justify-center px-6 gap-3"
		>
			{#if lesson.isInfoOnly}
				<!-- ── Number-clue info card ──────────────────────────────── -->
				<div
					in:scale={{
						duration: 300,
						easing: elasticOut,
						start: 0.88,
					}}
					class="w-full max-w-xs flex flex-col items-center gap-5"
				>
					<!-- Diagram -->
					<div
						class="grid gap-2"
						style="grid-template-columns: repeat(3, 3.5rem);"
					>
						<div
							class="w-14 h-14 rounded-full bg-urjo-coral ring-2 ring-white/50"
						></div>
						<div
							class="w-14 h-14 rounded-full bg-urjo-coral ring-2 ring-white/50"
						></div>
						<div
							class="w-14 h-14 rounded-full bg-theme-empty-cell"
						></div>
						<div
							class="w-14 h-14 rounded-full bg-urjo-coral ring-2 ring-white/50"
						></div>
						<div
							class="w-14 h-14 rounded-full bg-urjo-coral relative flex items-center justify-center"
						>
							<span
								class="text-white font-bold text-2xl drop-shadow"
								>3</span
							>
						</div>
						<div
							class="w-14 h-14 rounded-full bg-theme-empty-cell"
						></div>
						<div
							class="w-14 h-14 rounded-full bg-theme-empty-cell"
						></div>
						<div
							class="w-14 h-14 rounded-full bg-theme-empty-cell"
						></div>
						<div
							class="w-14 h-14 rounded-full bg-theme-empty-cell"
						></div>
					</div>

					<!-- Label — the only text on this screen -->
					<p
						class="text-base font-bold text-theme-text-primary text-center leading-snug"
					>
						<span class="text-urjo-coral">3</span> red neighbors =
						shows <span class="text-urjo-coral">3</span>
					</p>
					<p class="text-sm text-theme-text-muted text-center">
						Diagonals count too ↗↘
					</p>

					<button
						onclick={() => advanceLesson()}
						class="mt-2 w-full px-4 py-4 bg-theme-text-primary text-theme-bg-primary font-bold rounded-xl text-base hover:opacity-90 active:scale-95 transition-all"
					>
						Got it →
					</button>
				</div>
			{:else}
				<!-- ── Interactive grid ───────────────────────────────────── -->
				{@const gridStyle = `grid-template-columns: repeat(${lesson.gridCols}, 1fr)`}
				{@const maxWidth =
					lesson.gridCols === 1 ? "max-w-[7rem]" : "max-w-[272px]"}

				<!-- Instruction bubble — directly above grid, nowhere else -->
				<div class="w-full {maxWidth} mx-auto">
					{#key feedbackMsg}
						<div
							in:fly={{ y: -6, duration: 200 }}
							class="mb-3 px-3 py-2 rounded-xl text-center
								{feedbackType === 'error'
								? 'bg-red-500/12 border border-red-400/30'
								: 'bg-theme-bg-secondary border border-theme-border'}"
						>
							{#if feedbackType === "error"}
								<p class="text-sm font-semibold text-red-400">
									{feedbackMsg}
								</p>
							{:else if feedbackMsg}
								<p
									class="text-sm font-bold text-theme-text-primary"
								>
									{feedbackMsg}
								</p>
							{:else}
								<!-- empty spacer so layout doesn't jump -->
								<p class="text-sm invisible">_</p>
							{/if}
						</div>
					{/key}

					<!-- Grid -->
					<div class="grid gap-2" style={gridStyle}>
						{#each cells as cell, i (i)}
							{@const row = Math.floor(i / lesson.gridCols)}
							{@const col = i % lesson.gridCols}
							<div
								class="aspect-square {shakeIndex === i
									? 'animate-shake'
									: ''}"
							>
								<Cell
									color={cell.color}
									number={cell.number}
									locked={cell.locked}
									rowIndex={row}
									colIndex={col}
									isLoading={false}
									hasError={shakeIndex === i}
									gridSize={4}
									onChange={(newColor) =>
										handleCellChange(i, newColor)}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Step dots — only visual chrome remaining at bottom -->
			<div class="flex gap-1.5 mt-2">
				{#each TUTORIAL_LESSONS as _, i (i)}
					<div
						class="h-1.5 rounded-full transition-all duration-300
							{i === lessonIndex
							? 'w-5 bg-theme-text-primary'
							: i < lessonIndex
								? 'w-1.5 bg-theme-text-primary/50'
								: 'w-1.5 bg-theme-text-primary/20'}"
					></div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- ── Celebration overlay ───────────────────────────────────────────────── -->
	{#if phase === "celebrating"}
		<div
			in:fade={{ duration: 160 }}
			class="absolute inset-0 z-30 flex flex-col items-center justify-center bg-theme-bg-primary px-8"
		>
			<div
				in:scale={{ duration: 420, easing: elasticOut, start: 0.5 }}
				class="flex flex-col items-center gap-5 text-center"
			>
				<span class="text-8xl leading-none"
					>{lesson.celebrationEmoji}</span
				>

				<p class="text-2xl font-extrabold text-theme-text-primary">
					{lesson.celebrationTitle}
				</p>
				<!-- One line of reinforcement — no walls of text -->
				<p
					class="text-sm text-theme-text-secondary leading-snug max-w-[240px]"
				>
					{lesson.celebrationSub}
				</p>

				{#if isLastLesson}
					<div class="flex flex-col gap-3 w-full max-w-[240px] mt-1">
						<button
							onclick={onComplete}
							class="w-full px-4 py-4 bg-urjo-blue text-white font-bold rounded-xl text-lg hover:opacity-90 active:scale-95 transition-all animate-bounce-btn"
						>
							Play now! 🎮
						</button>
						<button
							onclick={() => {
								lessonIndex = 0;
								phase = "playing";
							}}
							class="text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors"
						>
							Replay tutorial
						</button>
					</div>
				{:else}
					<button
						onclick={afterCelebration}
						class="px-8 py-3.5 bg-theme-text-primary text-theme-bg-primary font-bold rounded-xl text-base hover:opacity-90 active:scale-95 transition-all"
					>
						Next →
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	@keyframes shake {
		0%,
		100% {
			transform: translateX(0);
		}
		20% {
			transform: translateX(-6px);
		}
		40% {
			transform: translateX(6px);
		}
		60% {
			transform: translateX(-4px);
		}
		80% {
			transform: translateX(4px);
		}
	}
	.animate-shake {
		animation: shake 0.35s ease-in-out;
	}
</style>
