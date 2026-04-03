<script lang="ts">
	import type { CellColor, Grid, StreakData } from "../../shared/types";
	import { validateGrid } from "../lib/validation";
	import ConfettiEffect from "../components/ConfettiEffect.svelte";
	import GameBoard from "../components/GameBoard.svelte";
	import StreakBadge from "../components/StreakBadge.svelte";
	import LeaderboardModal from "../components/LeaderboardModal.svelte";
	import HowToPlayModal from "../components/HowToPlayModal.svelte";
	import CoinDisplay from "../components/CoinDisplay.svelte";
	import Share2 from "lucide-svelte/icons/share-2";
	import CircleHelp from "lucide-svelte/icons/circle-help";
	import Shuffle from "lucide-svelte/icons/shuffle";

	type CoinReward = {
		base: number;
		streakBonus: number;
		speedBonus: number;
		dailyBonus: number;
		perfectBonus: number;
		total: number;
	};

	type Props = {
		grid: Grid;
		gridSize: number;
		onCellChange: (row: number, col: number, color: CellColor) => void;
		isCompleted: boolean;
		onNextChallenge: () => void;
		streakData: StreakData;
		hasShared: boolean;
		onShare: () => void;
		coinReward?: CoinReward;
		coins?: number;
		onOpenShop?: () => void;
		timeTaken?: number;
		mistakes?: number;
	};

	let {
		grid,
		gridSize,
		onCellChange,
		isCompleted,
		onNextChallenge,
		streakData,
		hasShared,
		onShare,
		coinReward,
		coins,
		onOpenShop,
		timeTaken,
		mistakes = 0,
	}: Props = $props();

	let showLeaderboard = $state(false);
	let showHowToPlay = $state(false);
	let hasFiredConfetti = $state(false);

	$effect(() => {
		if (isCompleted && !hasFiredConfetti) {
			hasFiredConfetti = true;
		} else if (!isCompleted) {
			hasFiredConfetti = false;
		}
	});

	const validation = $derived(validateGrid(grid, gridSize));
	const emptyCells = $derived(
		grid.flat().filter((cell) => !cell.locked && cell.color === null).length
	);
</script>

<div class="h-full w-full flex flex-col p-4 overflow-hidden">
	<!-- Header -->
	<header class="flex-none h-10 flex items-center justify-between px-2 gap-2">
		<button
			onclick={() => (showHowToPlay = true)}
			class="btn-icon"
			aria-label="How to Play"
		>
			<CircleHelp class="w-5 h-5 text-urjo-blue" />
		</button>

		<div class="flex items-center gap-2 flex-1 justify-center">
			<StreakBadge streak={streakData} />
			{#if coins !== undefined && onOpenShop}
				<CoinDisplay {coins} onClick={onOpenShop} />
			{/if}
		</div>

		{#if !isCompleted}
			<button
				onclick={onNextChallenge}
				class="btn-icon"
				aria-label="New Puzzle"
			>
				<Shuffle class="w-5 h-5 text-urjo-blue" />
			</button>
		{:else}
			<div class="min-w-[44px] flex-shrink-0"></div>
		{/if}
	</header>

	<!-- Main game area -->
	<main
		class="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 relative"
	>
		<!-- Game board -->
		<GameBoard
			{grid}
			{gridSize}
			{onCellChange}
			violatedRows={validation.violatedRows}
			violatedCols={validation.violatedCols}
		/>

		<!-- Completion overlay -->
		{#if isCompleted}
			<div
				class="absolute inset-0 flex flex-col items-center justify-center z-20 gap-3 p-4 bg-theme-overlay backdrop-blur-sm"
			>
				<div class="flex flex-col items-center gap-3 max-w-sm w-full">
					<!-- Coin reward with inline streak badge -->
					{#if coinReward && coinReward.total > 0}
						<div class="flex items-center gap-2 animate-bounce-in">
							<span class="text-2xl font-bold text-yellow-400"
								>+{coinReward.total} 🪙</span
							>
							{#if streakData.currentStreak > 0}
								<span
									class="px-2 py-0.5 rounded-full bg-theme-hover border border-theme-border text-xs font-bold text-theme-text-primary"
								>
									🔥 {streakData.currentStreak}
								</span>
							{/if}
						</div>
					{:else if streakData.currentStreak > 0}
						<span
							class="px-2 py-0.5 rounded-full bg-theme-hover border border-theme-border text-xs font-bold text-theme-text-primary"
						>
							🔥 {streakData.currentStreak}
						</span>
					{/if}

					<!-- Perfect badge -->
					{#if mistakes === 0}
						<div class="text-sm font-semibold text-green-400">
							🎯 Perfect!
						</div>
					{/if}

					<!-- Primary CTA -->
					<button
						onclick={onNextChallenge}
						class="btn-primary"
					>
						Next Challenge
					</button>

					<!-- Secondary actions -->
					<div class="flex gap-3 w-full">
						<button
							onclick={onShare}
							disabled={hasShared}
							class="btn-secondary w-full"
						>
							{#if hasShared}
								<span>✅ Shared!</span>
							{:else}
								<Share2 class="w-4 h-4" />
								<span>Share</span>
							{/if}
						</button>
					</div>

					<!-- View Leaderboard Link -->
					<button
						onclick={() => (showLeaderboard = true)}
						class="btn-ghost mt-2"
					>
						View Leaderboard
					</button>
				</div>
			</div>
		{/if}
	</main>

	<!-- Footer instructions -->
	<footer class="flex-none h-10 flex items-center justify-center">
		{#if isCompleted}
			<p class="text-xs text-theme-text-muted text-center">
				Solved in {timeTaken ?? 0}s
			</p>
		{:else}
			<p class="text-xs text-theme-text-muted text-center">
				{#if emptyCells > 0}
					{emptyCells} cell{emptyCells === 1 ? "" : "s"} remaining
				{:else}
					All filled — check your work
				{/if}
			</p>
		{/if}
	</footer>
</div>

<!-- Confetti effect -->
{#if isCompleted && hasFiredConfetti}
	<ConfettiEffect />
{/if}

<!-- Leaderboard modal -->
<LeaderboardModal
	isOpen={showLeaderboard}
	onClose={() => (showLeaderboard = false)}
	onNextChallenge={() => {
		showLeaderboard = false;
		onNextChallenge();
	}}
/>

<!-- How to Play modal -->
<HowToPlayModal
	isOpen={showHowToPlay}
	onClose={() => (showHowToPlay = false)}
	{gridSize}
/>
