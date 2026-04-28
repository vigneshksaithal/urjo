<script lang="ts">
	import type {
		CellColor,
		Grid,
		StreakData,
		CoinReward,
	} from "../../shared/types";
	import type { EngagementCompletionData } from "../../shared/engagement-types";
	import type { SeasonInfo } from "../../shared/growth-types";
	import { validateGrid } from "../lib/validation";
	import ConfettiEffect from "../components/ConfettiEffect.svelte";
	import GameBoard from "../components/GameBoard.svelte";
	import StreakBadge from "../components/StreakBadge.svelte";
	import LeaderboardModal from "../components/LeaderboardModal.svelte";
	import HowToPlayModal from "../components/HowToPlayModal.svelte";
	import CoinDisplay from "../components/CoinDisplay.svelte";
	import GridSizeSelector from "../components/GridSizeSelector.svelte";
	import MissionsPanel from "../components/MissionsPanel.svelte";
	import AchievementsPanel from "../components/AchievementsPanel.svelte";
	import ProfilePanel from "../components/ProfilePanel.svelte";
	import MysteryBoxAnimation from "../components/MysteryBoxAnimation.svelte";
	import StreakMilestoneOverlay from "../components/StreakMilestoneOverlay.svelte";
	import ResultCard from "../components/ResultCard.svelte";
	import SeasonLeaderboard from "../components/SeasonLeaderboard.svelte";
	import Trophy from "lucide-svelte/icons/trophy";
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
		isChallenge?: boolean;
		onGridSizeChange?: (size: number) => void;
		engagement?: EngagementCompletionData;
		onEngagementDismissed?: () => void;
		puzzleColors?: string;
		skillLevel?: number;
		puzzleNumber?: number;
		seasonRank?: number | null;
		seasonPoints?: number;
		currentSeason?: SeasonInfo | undefined;
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
		isChallenge = false,
		onGridSizeChange,
		engagement,
		onEngagementDismissed,
		puzzleColors,
		skillLevel = 1,
		puzzleNumber = 0,
		seasonRank = null,
		seasonPoints = 0,
		currentSeason,
	}: Props = $props();

	let showLeaderboard = $state(false);
	let showHowToPlay = $state(false);
	let showShareConfirm = $state(false);
	let showChallengeConfirm = $state(false);
	let showSubscribeConfirm = $state(false);
	let hasFiredConfetti = $state(false);
	let showMissions = $state(false);
	let showAchievements = $state(false);
	let showProfile = $state(false);
	let showMysteryBox = $state(false);
	let showStreakMilestone = $state(false);
	let mysteryBoxDismissed = $state(false);
	let milestoneDismissed = $state(false);
	let showSeasonLeaderboard = $state(false);
	let hasCommentedResult = $state(false);

	$effect(() => {
		if (isCompleted && !hasFiredConfetti) {
			hasFiredConfetti = true;
		} else if (!isCompleted) {
			hasFiredConfetti = false;
			mysteryBoxDismissed = false;
			milestoneDismissed = false;
		}
	});

	// Show mystery box animation when engagement data arrives with a box reward
	$effect(() => {
		if (engagement?.variableReward.mysteryBox && !mysteryBoxDismissed) {
			showMysteryBox = true;
		}
	});

	// Show streak milestone overlay when a milestone is reached
	$effect(() => {
		if (engagement?.streakMilestone && !milestoneDismissed) {
			showStreakMilestone = true;
		}
	});

	const validation = $derived(validateGrid(grid, gridSize));
	const boardSizeStyle = $derived(
		`width: min(100%, calc(100vh - ${!isChallenge && onGridSizeChange ? "148px" : "116px"})); max-width: 100%;`,
	);

	// Tomorrow's streak bonus: current streak + 1 day worth of bonus coins
	const tomorrowStreakBonus = $derived(
		streakData.currentStreak > 0
			? Math.min(streakData.currentStreak + 1, 30)
			: 1,
	);

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

	function dismissMysteryBox() {
		showMysteryBox = false;
		mysteryBoxDismissed = true;
	}

	function dismissMilestone() {
		showStreakMilestone = false;
		milestoneDismissed = true;
	}
</script>

<div class="h-full w-full flex flex-col p-3 gap-2 overflow-hidden">
	<!-- Header: help | streak · coins · trophy | shuffle -->
	<header class="flex-none flex items-center justify-between gap-3">
		<button
			onclick={() => (showHowToPlay = true)}
			class="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-theme-hover transition-colors shrink-0"
			aria-label="How to Play"
		>
			<CircleHelp class="w-5 h-5 text-urjo-blue" />
		</button>

		<!-- Centre cluster -->
		<div class="flex items-center gap-3 flex-1 justify-center">
			<StreakBadge streak={streakData} />
			{#if coins !== undefined && onOpenShop}
				<CoinDisplay {coins} onClick={onOpenShop} />
			{/if}
			<button
				onclick={() => (showLeaderboard = true)}
				class="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-theme-hover transition-colors shrink-0"
				aria-label="View leaderboard"
			>
				<Trophy class="w-5 h-5 text-yellow-400" />
			</button>
		</div>

		{#if !isCompleted}
			<button
				onclick={onNextChallenge}
				class="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-theme-hover transition-colors shrink-0"
				aria-label="New Puzzle"
			>
				<Shuffle class="w-5 h-5 text-urjo-blue" />
			</button>
		{:else}
			<div class="w-9 shrink-0"></div>
		{/if}
	</header>

	<!-- Grid size selector: its own row, centred, hidden for challenge posts -->
	{#if !isChallenge && onGridSizeChange}
		<div class="flex-none flex justify-center">
			<GridSizeSelector {gridSize} {onGridSizeChange} />
		</div>
	{/if}

	<!-- Main game area -->
	<main
		class="flex-1 min-h-0 flex flex-col items-center justify-center relative"
	>
		<!-- Board: square, never taller than available height -->
		<div class="w-full min-h-0 flex items-center justify-center flex-1">
			<div class="aspect-square" style={boardSizeStyle}>
				<GameBoard
					{grid}
					{gridSize}
					{onCellChange}
					violatedRows={validation.violatedRows}
					violatedCols={validation.violatedCols}
				/>
			</div>
		</div>

		<!-- Completion overlay -->
		{#if isCompleted}
			<div
				class="fixed inset-0 flex flex-col items-center z-20 p-3 bg-theme-overlay backdrop-blur-sm overflow-y-auto"
			>
				<div
					class="flex flex-col items-center gap-2 max-w-sm w-full my-auto"
				>
					<!-- Coin reward with inline streak badge -->
					{#if coinReward && coinReward.total > 0}
						<div
							class="flex flex-col items-center gap-1 animate-bounce-in"
						>
							<div class="flex items-center gap-2">
								<span class="text-2xl font-bold text-yellow-400"
									>+{coinReward.total} 🪙</span
								>
								{#if coinReward.multiplier}
									<span
										class="px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/50 text-xs font-bold text-yellow-400"
									>
										{coinReward.multiplier}× BONUS!
									</span>
								{/if}
								{#if streakData.currentStreak > 0}
									<span
										class="px-2 py-0.5 rounded-full bg-theme-hover border border-theme-border text-xs font-bold text-theme-text-primary"
									>
										🔥 {streakData.currentStreak}
									</span>
								{/if}
							</div>
							<div class="flex gap-2 text-xs text-gray-400">
								{#if coinReward.streakBonus > 0}<span
										>🔥 +{coinReward.streakBonus}</span
									>{/if}
								{#if coinReward.speedBonus > 0}<span
										>⚡ +{coinReward.speedBonus}</span
									>{/if}
								{#if coinReward.dailyBonus > 0}<span
										>📅 +{coinReward.dailyBonus}</span
									>{/if}
								{#if coinReward.perfectBonus > 0}<span
										>🎯 +{coinReward.perfectBonus}</span
									>{/if}
								{#if coinReward.loginBonus > 0}<span
										>🎁 +{coinReward.loginBonus} login bonus</span
									>{/if}
							</div>
						</div>
					{:else if streakData.currentStreak > 0}
						<span
							class="px-2 py-0.5 rounded-full bg-theme-hover border border-theme-border text-xs font-bold text-theme-text-primary"
						>
							🔥 {streakData.currentStreak}
						</span>
					{/if}

					<!-- New achievement unlocks -->
					{#if engagement?.newAchievements && engagement.newAchievements.length > 0}
						<div class="flex flex-col items-center gap-1">
							{#each engagement.newAchievements as achievement}
								<div
									class="flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-xs"
								>
									<span>{achievement.emoji}</span>
									<span class="text-yellow-400 font-semibold"
										>{achievement.label} unlocked!</span
									>
								</div>
							{/each}
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

					<!-- Season rank and points -->
					{#if currentSeason?.isActive && (seasonRank !== null || seasonPoints > 0)}
						<div
							class="flex items-center gap-2 text-xs text-theme-text-muted"
						>
							<span>🏆 Season {currentSeason.seasonNumber}</span>
							{#if seasonRank !== null}
								<span class="font-semibold text-yellow-400"
									>Rank #{seasonRank}</span
								>
							{/if}
							{#if seasonPoints > 0}
								<span>· {seasonPoints} pts</span>
							{/if}
						</div>
					{/if}

					<!-- Result card preview -->
					{#if puzzleColors}
						<ResultCard
							{puzzleColors}
							{gridSize}
							{skillLevel}
							{puzzleNumber}
							streak={streakData.currentStreak}
							timeTaken={timeTaken ?? 0}
							{mistakes}
							hasCommented={hasCommentedResult}
							onCommentResult={() => (hasCommentedResult = true)}
						/>
					{/if}

					<!-- Tomorrow's streak bonus preview -->
					<div class="text-xs text-theme-text-muted text-center">
						🔥 Return tomorrow for +{tomorrowStreakBonus} streak bonus
						coins
					</div>

					<!-- Challenge a Friend -->
					<button
						onclick={() => {
							if (!hasChallenged) showChallengeConfirm = true;
						}}
						disabled={hasChallenged}
						class="w-full px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg text-sm hover:bg-theme-hover active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
					>
						{#if hasChallenged}<span>⚔️ Challenged!</span
							>{:else}<span>⚔️ Challenge a Friend</span>{/if}
					</button>

					<!-- Next Puzzle -->
					<button
						onclick={onNextChallenge}
						class="px-8 py-2.5 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg text-base hover:opacity-90 active:scale-95 transition-all w-full shadow-lg"
					>
						Next Puzzle
					</button>

					{#if onSubscribe && !hasSubscribed}
						<button
							onclick={() => (showSubscribeConfirm = true)}
							class="px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg text-sm hover:bg-theme-hover active:scale-95 transition-all w-full flex items-center justify-center gap-2"
						>
							🔔 Join r/urjo for daily puzzles
						</button>
					{/if}

					<!-- Engagement navigation -->
					<div class="flex gap-2 w-full">
						<button
							onclick={() => (showMissions = true)}
							class="flex-1 px-3 py-1.5 border border-theme-border text-theme-text-muted rounded-lg text-xs hover:bg-theme-hover transition-all"
						>
							🎯 Missions
						</button>
						<button
							onclick={() => (showAchievements = true)}
							class="flex-1 px-3 py-1.5 border border-theme-border text-theme-text-muted rounded-lg text-xs hover:bg-theme-hover transition-all"
						>
							🏅 Achievements
						</button>
						<button
							onclick={() => (showProfile = true)}
							class="flex-1 px-3 py-1.5 border border-theme-border text-theme-text-muted rounded-lg text-xs hover:bg-theme-hover transition-all"
						>
							📊 Profile
						</button>
						{#if currentSeason?.isActive}
							<button
								onclick={() => (showSeasonLeaderboard = true)}
								class="flex-1 px-3 py-1.5 border border-theme-border text-theme-text-muted rounded-lg text-xs hover:bg-theme-hover transition-all"
							>
								🏆 Season
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</main>

	<!-- Footer -->
	<footer class="flex-none flex items-center justify-center h-8">
		<p class="text-xs text-theme-text-muted text-center">
			{#if isCompleted}
				Solved in {timeTaken ?? 0}s
			{:else if mistakes === 0}
				✓ Perfect so far
			{:else}
				Mistakes: {mistakes}
			{/if}
		</p>
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

<!-- Engagement modals -->
<MissionsPanel isOpen={showMissions} onClose={() => (showMissions = false)} />
<AchievementsPanel
	isOpen={showAchievements}
	onClose={() => (showAchievements = false)}
/>
<ProfilePanel isOpen={showProfile} onClose={() => (showProfile = false)} />

<!-- Mystery box animation -->
{#if showMysteryBox && engagement?.variableReward.mysteryBox}
	<MysteryBoxAnimation
		reward={engagement.variableReward.mysteryBox}
		onDismiss={dismissMysteryBox}
	/>
{/if}

<!-- Streak milestone overlay -->
{#if showStreakMilestone && engagement?.streakMilestone}
	<StreakMilestoneOverlay
		threshold={engagement.streakMilestone.threshold}
		bonus={engagement.streakMilestone.bonus}
		onDismiss={dismissMilestone}
	/>
{/if}

<!-- Season leaderboard modal -->
<SeasonLeaderboard
	isOpen={showSeasonLeaderboard}
	onClose={() => (showSeasonLeaderboard = false)}
/>
