<script lang="ts">
	import type { CellColor, Grid, StreakData } from "../../shared/types";
	import { validateGrid } from "../lib/validation";
	import ConfettiEffect from "../components/ConfettiEffect.svelte";
	import GameBoard from "../components/GameBoard.svelte";
	import StreakBadge from "../components/StreakBadge.svelte";
	import LeaderboardModal from "../components/LeaderboardModal.svelte";
	import HowToPlayModal from "../components/HowToPlayModal.svelte";
	import CoinDisplay from "../components/CoinDisplay.svelte";
	import Trophy from "lucide-svelte/icons/trophy";
	import Share2 from "lucide-svelte/icons/share-2";
	import CircleHelp from "lucide-svelte/icons/circle-help";
	import Shuffle from "lucide-svelte/icons/shuffle";

	type CoinReward = {
		base: number;
		streakBonus: number;
		speedBonus: number;
		dailyBonus: number;
		total: number;
	};

	type Props = {
		grid: Grid;
		gridSize: number;
		onCellChange: (row: number, col: number, color: CellColor) => void;
		isCompleted: boolean;
		onNextChallenge: () => void;
		onRestart: () => void;
		streakData: StreakData;
		hasShared: boolean;
		onShare: () => void;
		coinReward?: CoinReward;
		coins?: number;
		onOpenShop?: () => void;
		timeTaken?: number;
	};

	let {
		grid,
		gridSize,
		onCellChange,
		isCompleted,
		onNextChallenge,
		onRestart,
		streakData,
		hasShared,
		onShare,
		coinReward,
		coins,
		onOpenShop,
		timeTaken,
	}: Props = $props();

	let showLeaderboard = $state(false);
	let showHowToPlay = $state(false);
	let hasFiredConfetti = $state(false);


	$effect(() => {
		if (isCompleted && !hasFiredConfetti) {
			hasFiredConfetti = true;
			if (typeof navigator !== "undefined" && navigator.vibrate) {
				navigator.vibrate([100, 50, 100]);
			}
		} else if (!isCompleted) {
			hasFiredConfetti = false;
		}
	});

	const validation = $derived(validateGrid(grid, gridSize));
</script>

<div class="h-full w-full flex flex-col p-4 overflow-hidden">
	<!-- Header -->
	<header class="flex-none h-10 flex items-center justify-between px-2 gap-2">
		<button
			onclick={() => (showHowToPlay = true)}
			class="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg hover:bg-theme-hover transition-colors flex-shrink-0"
			aria-label="How to Play"
		>
			<CircleHelp class="w-5 h-5 text-urjo-blue" />
		</button>

		<div class="flex items-center gap-2 flex-1 justify-center">
			<StreakBadge streak={streakData} />
			{#if coins !== undefined && onOpenShop}
				<CoinDisplay {coins} onClick={onOpenShop} />
			{/if}
			<button
				onclick={() => (showLeaderboard = true)}
				class="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg hover:bg-theme-hover transition-colors flex-shrink-0"
				aria-label="View leaderboard"
			>
				<Trophy class="w-5 h-5 text-yellow-400" />
			</button>
		</div>

		{#if !isCompleted}
			<button
				onclick={onNextChallenge}
				class="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg hover:bg-theme-hover transition-colors flex-shrink-0"
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
						<div
							class="flex flex-col items-center gap-1 animate-bounce-in"
						>
							<div class="flex items-center gap-2">
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
							<div class="flex gap-2 text-xs text-gray-400">
								{#if coinReward.streakBonus > 0}
									<span>🔥 +{coinReward.streakBonus}</span>
								{/if}
								{#if coinReward.speedBonus > 0}
									<span>⚡ +{coinReward.speedBonus}</span>
								{/if}
								{#if coinReward.dailyBonus > 0}
									<span>📅 +{coinReward.dailyBonus}</span>
								{/if}
							</div>
						</div>
					{:else if streakData.currentStreak > 0}
						<span
							class="px-2 py-0.5 rounded-full bg-theme-hover border border-theme-border text-xs font-bold text-theme-text-primary"
						>
							🔥 {streakData.currentStreak}
						</span>
					{/if}

					<!-- Primary CTA -->
					<button
						onclick={onNextChallenge}
						class="px-8 py-2.5 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg
							text-base hover:opacity-90 active:scale-95 transition-all w-full shadow-lg"
					>
						Next Challenge
					</button>

					<!-- Secondary actions -->
					<div class="flex gap-3 w-full">
						<button
							onclick={onShare}
							disabled={hasShared}
							class="flex-1 px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg
								text-sm hover:bg-theme-hover active:scale-95 transition-all
								disabled:opacity-50 disabled:cursor-not-allowed
								flex items-center justify-center gap-2"
						>
							{#if hasShared}
								<span>✅ Shared!</span>
							{:else}
								<Share2 class="w-4 h-4" />
								<span>Share</span>
							{/if}
						</button>
						<button
							onclick={onRestart}
							class="flex-1 px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg
								text-sm hover:bg-theme-hover active:scale-95 transition-all"
						>
							Restart
						</button>
					</div>
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
				Tap to cycle colors
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
