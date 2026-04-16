<script lang="ts">
	import type {
		CellColor,
		Grid,
		StreakData,
		CoinReward,
		GridFilter,
	} from "../../shared/types";
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

	type Props = {
		grid: Grid;
		gridSize: number;
		onCellChange: (row: number, col: number, color: CellColor) => void;
		isCompleted: boolean;
		onNextChallenge: () => void;
		onRestart: () => void;
		streakData: StreakData;
		hasShared: boolean;
		hasChallenged: boolean;
		challengeUrl: string | null;
		onShare: () => void;
		onChallenge: () => void;
		coinReward?: CoinReward;
		coins?: number;
		onOpenShop?: () => void;
		timeTaken?: number;
		mistakes?: number;
		username?: string;
		hasSubscribed?: boolean;
		onSubscribe?: () => void;
		gridFilter?: GridFilter;
		onGridFilterChange?: (filter: GridFilter) => void;
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
		hasChallenged,
		onShare,
		onChallenge,
		coinReward,
		coins,
		onOpenShop,
		timeTaken,
		mistakes = 0,
		username,
		hasSubscribed = false,
		onSubscribe,
		gridFilter = 'all',
		onGridFilterChange,
	}: Props = $props();

	// Streak milestone messages (variable reward — Hooked framework)
	const STREAK_MILESTONES: Record<number, string> = {
		3: '🔥 3-day streak! You\'re warming up!',
		7: '🔥 One week! You\'re on fire!',
		14: '⚡ Two weeks strong! Impressive!',
		30: '🏆 30 days! You\'re a legend!',
		50: '💎 50-day streak! Unreal!',
		100: '👑 100 days! Urjo King!',
	};

	const streakMilestoneMessage = $derived(
		streakData.currentStreak > 0 && isCompleted
			? STREAK_MILESTONES[streakData.currentStreak] ?? null
			: null
	);

	let showLeaderboard = $state(false);
	let showHowToPlay = $state(false);
	let showShareConfirm = $state(false);
	let showChallengeConfirm = $state(false);
	let showSubscribeConfirm = $state(false);
	let hasFiredConfetti = $state(false);

	$effect(() => {
		if (isCompleted && !hasFiredConfetti) {
			hasFiredConfetti = true;
		} else if (!isCompleted) {
			hasFiredConfetti = false;
		}
	});

	const validation = $derived(validateGrid(grid, gridSize));

	function confirmShare() {
		showShareConfirm = false;
		onShare();
	}

	function confirmChallenge() {
		showChallengeConfirm = false;
		onChallenge();
	}

	function confirmSubscribe() {
		showSubscribeConfirm = false;
		onSubscribe?.();
	}
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

	<!-- Grid size filter toggle -->
	{#if onGridFilterChange}
		<div class="flex-none flex items-center justify-center gap-1 py-1">
			{#each [['all', 'All'], ['4x4', '4×4'], ['6x6', '6×6']] as [value, label]}
				<button
					onclick={() => onGridFilterChange?.(value as GridFilter)}
					class="px-3 py-1 rounded-full text-xs font-semibold transition-all
						{gridFilter === value
							? 'bg-urjo-blue text-white'
							: 'bg-theme-hover text-theme-text-secondary hover:text-theme-text-primary'}"
					aria-pressed={gridFilter === value}
				>
					{label}
				</button>
			{/each}
		</div>
	{/if}

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
								{#if coinReward.perfectBonus > 0}
									<span>🎯 +{coinReward.perfectBonus}</span>
								{/if}
								{#if coinReward.loginBonus > 0}
									<span
										>🎁 +{coinReward.loginBonus} login bonus</span
									>
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

					<!-- Streak milestone message (variable reward) -->
					{#if streakMilestoneMessage}
						<div class="text-sm font-bold text-yellow-300 animate-bounce-in text-center">
							{streakMilestoneMessage}
						</div>
					{/if}

					<!-- Perfect / mistakes badge -->
					{#if mistakes === 0}
						<div class="text-sm font-semibold text-green-400">
							🎯 Perfect!
						</div>
					{:else}
						<div class="text-sm text-yellow-400">
							⚠️ {mistakes} mistake{mistakes === 1 ? "" : "s"}
						</div>
					{/if}

					<!-- Primary CTA -->
					<button
						onclick={onNextChallenge}
						class="px-8 py-2.5 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg
							text-base hover:opacity-90 active:scale-95 transition-all w-full shadow-lg"
					>
						Next Challenge
					</button>

					<!-- User actions row (Reddit interactions) -->
					<div class="flex gap-3 w-full">
						<button
							onclick={() => {
								if (!hasShared) showShareConfirm = true;
							}}
							disabled={hasShared}
							class="flex-1 px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg
								text-sm hover:bg-theme-hover active:scale-95 transition-all
								disabled:opacity-50 disabled:cursor-not-allowed
								flex items-center justify-center gap-2"
						>
							{#if hasShared}
								<span>✅ Commented!</span>
							{:else}
								<Share2 class="w-4 h-4" />
								<span>Comment Score</span>
							{/if}
						</button>
						<button
							onclick={() => {
								if (!hasChallenged) showChallengeConfirm = true;
							}}
							disabled={hasChallenged}
							class="flex-1 px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg
								text-sm hover:bg-theme-hover active:scale-95 transition-all
								disabled:opacity-50 disabled:cursor-not-allowed
								flex items-center justify-center gap-2"
						>
							{#if hasChallenged}
								<span>⚔️ Challenged!</span>
							{:else}
								<span>⚔️ Challenge</span>
							{/if}
						</button>
					</div>

					<!-- Subreddit subscribe CTA -->
					{#if onSubscribe && !hasSubscribed}
						<button
							onclick={() => (showSubscribeConfirm = true)}
							class="px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg
								text-sm hover:bg-theme-hover active:scale-95 transition-all w-full
								flex items-center justify-center gap-2"
						>
							🔔 Join r/urjo for daily puzzles
						</button>
					{/if}
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
				{#if mistakes === 0}
					✓ Perfect so far
				{:else}
					Mistakes: {mistakes}
				{/if}
			</p>
		{/if}
	</footer>
</div>

<!-- Confetti effect -->
{#if isCompleted && hasFiredConfetti}
	<ConfettiEffect />
{/if}

<!-- Share confirmation dialog -->
{#if showShareConfirm}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
	>
		<div
			class="bg-theme-bg-primary border border-theme-border rounded-xl p-5 max-w-xs w-full flex flex-col gap-4 shadow-2xl"
		>
			<h2 class="text-base font-bold text-theme-text-primary">
				Post your score?
			</h2>
			<p class="text-sm text-theme-text-secondary">
				This will post a comment with your score{username
					? ` as u/${username}`
					: ""}. Others can see it.
			</p>
			<div class="flex gap-3">
				<button
					onclick={() => (showShareConfirm = false)}
					class="flex-1 px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg text-sm hover:bg-theme-hover transition-all"
				>
					Cancel
				</button>
				<button
					onclick={confirmShare}
					class="flex-1 px-4 py-2 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg text-sm hover:opacity-90 transition-all"
				>
					Post Score
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Challenge confirmation dialog -->
{#if showChallengeConfirm}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
	>
		<div
			class="bg-theme-bg-primary border border-theme-border rounded-xl p-5 max-w-xs w-full flex flex-col gap-4 shadow-2xl"
		>
			<h2 class="text-base font-bold text-theme-text-primary">
				Issue a challenge?
			</h2>
			<p class="text-sm text-theme-text-secondary">
				This creates a public post in r/urjo with your time{username
					? ` as u/${username}`
					: ""} for others to beat.
			</p>
			<div class="flex gap-3">
				<button
					onclick={() => (showChallengeConfirm = false)}
					class="flex-1 px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg text-sm hover:bg-theme-hover transition-all"
				>
					Cancel
				</button>
				<button
					onclick={confirmChallenge}
					class="flex-1 px-4 py-2 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg text-sm hover:opacity-90 transition-all"
				>
					Post Challenge
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Subscribe confirmation dialog -->
{#if showSubscribeConfirm}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
	>
		<div
			class="bg-theme-bg-primary border border-theme-border rounded-xl p-5 max-w-xs w-full flex flex-col gap-4 shadow-2xl"
		>
			<h2 class="text-base font-bold text-theme-text-primary">
				Join r/urjo?
			</h2>
			<p class="text-sm text-theme-text-secondary">
				This will subscribe you to r/urjo so you get daily puzzle
				notifications in your feed.
			</p>
			<div class="flex gap-3">
				<button
					onclick={() => (showSubscribeConfirm = false)}
					class="flex-1 px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg text-sm hover:bg-theme-hover transition-all"
				>
					Cancel
				</button>
				<button
					onclick={confirmSubscribe}
					class="flex-1 px-4 py-2 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg text-sm hover:opacity-90 transition-all"
				>
					Join
				</button>
			</div>
		</div>
	</div>
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
