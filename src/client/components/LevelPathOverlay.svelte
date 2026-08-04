<script lang="ts">
	import { fade } from "svelte/transition";
	import Check from "lucide-svelte/icons/check";
	import Coins from "lucide-svelte/icons/coins";
	import Flame from "lucide-svelte/icons/flame";
	import Lock from "lucide-svelte/icons/lock";
	import Play from "lucide-svelte/icons/play";

	import { buildLevelPath } from "../lib/level-path";

	type Props = {
		isOpen: boolean;
		currentLevel: number;
		streak: number;
		coins: number | undefined;
		puzzleNumber?: number;
		onLevelSelect: () => void;
	};

	const VISIBLE_LEVEL_COUNT = 3;

	let props: Props = $props();

	const levels = $derived(
		buildLevelPath({
			currentLevel: props.currentLevel,
			visibleLevels: VISIBLE_LEVEL_COUNT,
		}),
	);

	const nextPuzzleLabel = $derived(
		(props.puzzleNumber ?? 0) > 0
			? `Puzzle ${(props.puzzleNumber ?? 0) + 1}`
			: "Next puzzle",
	);
</script>

{#if props.isOpen}
	<div
		transition:fade={{ duration: 180 }}
		class="fixed inset-0 z-[60] flex h-full w-full flex-col overflow-hidden bg-[#1C1C1E] text-white"
	>
		<header class="flex-none px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
			<div class="mx-auto flex w-full max-w-sm items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="text-[11px] font-bold uppercase tracking-[0.4px] text-[#60A5FA]">
						{nextPuzzleLabel}
					</p>
					<h2 class="mt-1 text-[22px] font-bold leading-tight">Journey {props.currentLevel}</h2>
					<p class="mt-1 text-[13px] text-[#8E8E93]">Your next stop is ready.</p>
				</div>

				<div class="flex flex-none items-center gap-2">
					<div
						class="flex min-h-10 items-center gap-1.5 rounded-full bg-[#2C2C2E] px-3 text-[13px] font-bold text-[#FCD34D]"
						aria-label="{props.streak} day streak"
					>
						<Flame class="h-4 w-4" />
						<span>{props.streak}</span>
					</div>
					{#if props.coins !== undefined}
						<div
							class="flex min-h-10 items-center gap-1.5 rounded-full bg-[#2C2C2E] px-3 text-[13px] font-bold text-[#FDE68A]"
							aria-label="{props.coins} coins"
						>
							<Coins class="h-4 w-4" />
							<span>{props.coins}</span>
						</div>
					{/if}
				</div>
			</div>
		</header>

		<main class="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 py-3">
			<section class="w-full max-w-sm" aria-label="Level path">
				<p class="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.4px] text-[#8E8E93]">Level path</p>

				<div class="relative flex flex-col gap-3">
					<div class="absolute bottom-10 left-7 top-10 w-1 -translate-x-1/2 rounded-full bg-[#3A3A3C]" aria-hidden="true"></div>

					{#each levels as level (level.level)}
						{#if level.state === "current"}
							<button
								type="button"
								onclick={props.onLevelSelect}
								class="relative flex min-h-24 w-full items-center gap-4 rounded-full bg-[#2563EB] px-4 text-left shadow-[0_6px_0_#1A4FA8] transition-transform active:translate-y-[5px] active:shadow-[0_1px_0_#1A4FA8] animate-cta-pulse"
								aria-label="Play level {level.level}"
							>
								<span class="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-white/15">
									<Play class="h-6 w-6 fill-current" />
								</span>
								<span class="min-w-0 flex-1">
									<span class="block text-[11px] font-bold uppercase tracking-[0.4px] text-white/75">Up next</span>
									<span class="mt-1 block text-[22px] font-black leading-none">Level {level.level}</span>
									<span class="mt-1 block text-[13px] font-semibold text-white/80">Play level</span>
								</span>
							</button>
						{:else}
							<div
								class="relative flex min-h-[72px] w-full items-center gap-4 rounded-[20px] bg-[#2C2C2E] px-4 {level.state === 'locked' ? 'text-[#8E8E93]' : 'text-white'}"
								aria-label="Level {level.level} {level.state}"
							>
								<span class="flex h-10 w-10 flex-none items-center justify-center rounded-full {level.state === 'completed' ? 'bg-[#34C759]/12 text-[#34C759]' : 'bg-[#3A3A3C] text-[#8E8E93]'}">
									{#if level.state === "completed"}
										<Check class="h-5 w-5" strokeWidth={3} />
									{:else}
										<Lock class="h-4 w-4" />
									{/if}
								</span>
								<span class="min-w-0 flex-1">
									<span class="block text-base font-bold">Level {level.level}</span>
									<span class="mt-0.5 block text-[13px] font-semibold {level.state === 'completed' ? 'text-[#34C759]' : 'text-[#8E8E93]'}">
										{level.state === "completed" ? "Completed" : "Locked"}
									</span>
								</span>
							</div>
						{/if}
					{/each}
				</div>
			</section>
		</main>

		<footer class="flex-none px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
			<p class="mx-auto max-w-sm text-center text-[13px] font-semibold text-[#8E8E93]">
				Tap the highlighted level to keep going
			</p>
		</footer>
	</div>
{/if}
