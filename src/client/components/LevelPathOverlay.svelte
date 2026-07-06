<script lang="ts">
	import { fade, fly } from "svelte/transition";
	import Coins from "lucide-svelte/icons/coins";
	import Flame from "lucide-svelte/icons/flame";
	import Lock from "lucide-svelte/icons/lock";
	import Play from "lucide-svelte/icons/play";
	import { buildLevelPath, type LevelPathNode } from "../lib/level-path";

	type Props = {
		isOpen: boolean;
		currentLevel: number;
		streak: number;
		coins: number | undefined;
		puzzleNumber?: number;
		onLevelSelect: () => void;
	};

	let props: Props = $props();

	type NodePosition = {
		left: string;
		top: string;
	};

	const fallbackNodePosition: NodePosition = {
		left: "50%",
		top: "50%",
	};

	// Hand-tuned positions along the SVG path — one per rendered node. The
	// path artwork below is drawn for exactly this many stops, so the level
	// window is sized to match rather than hardcoded separately: passing a
	// visibleLevels count larger than this array would stack extra nodes on
	// the fallback position with no path to sit on.
	const nodePositions: readonly NodePosition[] = [
		{ left: "26%", top: "70%" },
		{ left: "50%", top: "52%" },
		{ left: "74%", top: "33%" },
	] as const;

	const levels = $derived(
		buildLevelPath({
			currentLevel: props.currentLevel,
			visibleLevels: nodePositions.length,
		}),
	);

	const nextPuzzleLabel = $derived(
		(props.puzzleNumber ?? 0) > 0
			? `Puzzle ${(props.puzzleNumber ?? 0) + 1}`
			: "Next puzzle",
	);

	const getNodePosition = (index: number): NodePosition => {
		return nodePositions[index] ?? fallbackNodePosition;
	};

	const getNodeClass = (state: LevelPathNode["state"]): string => {
		if (state === "completed") {
			return "bg-emerald-300 text-emerald-950 border-white/70 shadow-[0_8px_0_#047857,0_18px_24px_rgba(4,120,87,0.24)]";
		}
		if (state === "current") {
			return "bg-[#ffe01b] text-slate-950 border-white shadow-[0_10px_0_#d7b400,0_0_0_14px_rgba(255,224,27,0.28),0_0_0_28px_rgba(255,224,27,0.16)] animate-cta-pulse";
		}
		return "bg-[#455d6f] text-slate-100 border-[#6f8798] shadow-[0_8px_0_#304757] opacity-95";
	};
</script>

{#if props.isOpen}
	<div
		transition:fade={{ duration: 180 }}
		class="fixed inset-0 z-[60] flex h-full w-full flex-col overflow-hidden bg-[#092126]"
	>
		<div
			class="pointer-events-none absolute inset-x-0 top-0 z-10 px-5 pt-5 text-white"
			transition:fly={{ y: -12, duration: 220 }}
		>
			<div class="flex items-center justify-between gap-3">
				<div class="flex min-w-0 flex-col">
					<p
						class="text-xs font-black uppercase tracking-[0.12em] text-cyan-100"
					>
						{nextPuzzleLabel}
					</p>
					<h2
						class="text-3xl font-black leading-tight text-white drop-shadow"
					>
						Level {props.currentLevel}
					</h2>
				</div>
				<div class="flex items-center gap-2">
					<div
						class="flex min-h-10 items-center gap-1.5 rounded-full bg-orange-400 px-3 font-black text-stone-950 shadow-[0_5px_0_#c2410c]"
						aria-label="{props.streak} day streak"
					>
						<Flame class="h-5 w-5 fill-current" />
						<span>{props.streak}</span>
					</div>
					{#if props.coins !== undefined}
						<div
							class="flex min-h-10 items-center gap-1.5 rounded-full bg-sky-300 px-3 font-black text-slate-950 shadow-[0_5px_0_#0284c7]"
							aria-label="{props.coins} coins"
						>
							<Coins class="h-5 w-5" />
							<span>{props.coins}</span>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<div class="relative min-h-0 flex-1 overflow-hidden">
			<div
				class="absolute left-1/2 top-[54%] h-[94%] w-[138%] -translate-x-1/2 -translate-y-1/2 rounded-[52%] bg-[linear-gradient(180deg,#5fd3d0_0%,#c7e9d6_56%,#f28b7e_100%)] shadow-[inset_0_42px_80px_rgba(255,255,255,0.28)]"
			></div>
			<div
				class="absolute left-[-12%] top-[9%] h-14 w-44 rounded-full bg-white/35 blur-[2px]"
				aria-hidden="true"
			></div>
			<div
				class="absolute right-[-2%] top-[18%] h-14 w-32 rounded-full bg-white/35 blur-[2px]"
				aria-hidden="true"
			></div>
			<div
				class="absolute left-[1%] bottom-[3%] h-28 w-28 rounded-full bg-yellow-300/30 blur-sm"
				aria-hidden="true"
			></div>
			<div
				class="absolute left-[-3%] bottom-[5%] text-6xl drop-shadow-lg"
				aria-hidden="true"
			>
				⛺
			</div>
			<div
				class="absolute right-[8%] top-[10%] text-5xl drop-shadow-lg"
				aria-hidden="true"
			>
				🏝️
			</div>
			<div
				class="absolute right-[13%] bottom-[18%] text-4xl drop-shadow-lg"
				aria-hidden="true"
			>
				🎁
			</div>

			<div
				class="absolute left-1/2 top-[49%] h-[76%] w-[68%] -translate-x-1/2 -translate-y-1/2"
				aria-hidden="true"
			>
				<svg
					viewBox="0 0 100 100"
					class="h-full w-full overflow-visible"
					role="img"
					aria-label="Level path"
				>
					<path
						d="M14 74 C31 71 37 61 44 57 S60 49 67 42 S77 33 86 24"
						fill="none"
						stroke="rgba(50,111,126,0.48)"
						stroke-width="10"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M14 74 C31 71 37 61 44 57 S60 49 67 42 S77 33 86 24"
						fill="none"
						stroke="rgba(225,245,247,0.9)"
						stroke-width="5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M14 74 C31 71 37 61 44 57 S60 49 67 42 S77 33 86 24"
						fill="none"
						stroke="rgba(255,255,255,0.26)"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</div>

			{#each levels as level, index (level.level)}
				{@const position = getNodePosition(index)}
				<div
					class="absolute -translate-x-1/2 -translate-y-1/2"
					style="left: {position.left}; top: {position.top};"
				>
					{#if level.state === "current"}
						<button
							onclick={props.onLevelSelect}
							class="group flex h-[98px] w-[98px] flex-col items-center justify-center rounded-full border-[7px] font-black transition-transform active:translate-y-1 active:shadow-none {getNodeClass(
								level.state,
							)}"
							aria-label="Start level {level.level}"
						>
							<Play
								class="h-10 w-10 fill-current transition-transform group-active:scale-95"
							/>
							<span class="text-xl leading-none"
								>{level.level}</span
							>
						</button>
					{:else}
						<div
							class="flex h-[78px] w-[78px] flex-col items-center justify-center rounded-full border-[6px] font-black {getNodeClass(
								level.state,
							)}"
							aria-label="Level {level.level} {level.state}"
						>
							<Lock class="h-7 w-7" />
							<span class="text-lg leading-none"
								>{level.level}</span
							>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}
