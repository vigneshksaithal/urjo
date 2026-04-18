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
		skillLevel?: number;
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
		isPersonalBest?: boolean;
		personalBestTime?: number;
		gridFilter?: GridFilter;
		onFilterChange?: (filter: GridFilter) => void;
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
		isPersonalBest = false,
		personalBestTime,
		skillLevel = 1,
		gridFilter = 'all' as GridFilter,
		onFilterChange = undefined,
	}: Props = $props();

	// Difficulty label derived from gridSize + skillLevel
	const DIFFICULTY_LABELS: Record<number, string> = {
		1: '4×4 · Easy', 2: '6×6 · Easy', 3: '4×4 · Hard',
		4: '6×6 · Medium', 5: '6×6 · Hard', 6: '4×4 · Expert',
		7: '6×6 · Hard+', 8: '8×8 · Easy', 9: '8×8 · Medium',
	};
	const difficultyLabel = $derived(DIFFICULTY_LABELS[skillLevel] ?? `${gridSize}×${gridSize}`);

	// Contextual completion message
	const completionMessage = $derived(
		!isCompleted ? '' :
		(isPersonalBest && personalBestTime !== undefined && personalBestTime < 999) ? `⚡ New best: ${personalBestTime}s!` :
		streakData.currentStreak === 3 ? '🔥 3-day streak! Warming up!' :
		streakData.currentStreak === 7 ? '🔥 One week! On fire!' :
		streakData.currentStreak === 14 ? '⚡ Two weeks! Unstoppable!' :
		streakData.currentStreak === 30 ? '🏆 30 days! Legend!' :
		streakData.currentStreak === 50 ? '💎 50-day streak! Unreal!' :
		streakData.currentStreak === 100 ? '👑 100 days! Urjo King!' :
		(skillLevel === 1 && gridSize === 4) ? '🎯 Nice! Next: 6×6 👀' :
		(skillLevel >= 2 && (mistakes ?? 0) === 0) ? '✨ Perfect solve!' :
		'✅ Solved!'
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


	<!-- Main game area -->
	<main
		class="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 relative"
	>
		<!-- Difficulty badge -->
		{#if !isCompleted}
			<div class="flex items-center gap-2">
				<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide
					bg-theme-hover border border-theme-border text-theme-text-muted">
					{difficultyLabel}
				</span>
			</div>
		{/if}

		<!-- Grid size filter -->
		{#if !isCompleted && onFilterChange}
			<div class="flex items-center gap-1.5">
				{#each ([['all', 'All'], ['4x4', '4×4'], ['6x6', '6×6']] as const) as [value, label] (value)}
					<button
						onclick={() => onFilterChange?.(value as GridFilter)}
						class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide border transition-colors
							{gridFilter === value
								? 'bg-urjo-blue border-urjo-blue text-white'
								: 'bg-theme-hover border-theme-border text-theme-text-muted hover:text-theme-text-secondary'}"
					>
						{label}
					</button>
				{/each}
			</div>
		{/if}

		<!-- Game board -->
		<GameBoard
			{grid}
			{gridSize}
			{onCellChange}
			violatedRows={validation.violatedRows}
			violatedCols={validation.violatedCols}
			completedRows={validation.completedRows}
			completedCols={validation.completedCols}
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

					<!-- Contextual message (PB / streak milestone / hint) -->
					{#if completionMessage}
						<div class="text-sm font-bold text-center animate-bounce-in
							{isPersonalBest ? 'text-yellow-300' : 'text-green-400'}">
							{completionMessage}
						</div>
					{/if}

					<!-- Mistakes badge -->
					{#if mistakes !== undefined && mistakes > 0}
						<div class="text-xs text-yellow-400">
							⚠️ {mistakes} mistake{mistakes === 1 ? "" : "s"}
						</div>
					{/if}

					<!-- Primary CTA -->
					<button
						onclick={onNextChallenge}
						class="px-8 py-2.5 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg
							text-base hover:opacity-90 active:scale-95 transition-all w-full shadow-lg"
					>
						Next Challenge →
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
