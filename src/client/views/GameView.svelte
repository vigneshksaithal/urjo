<script lang="ts">
	import { navigateTo } from "@devvit/web/client";
	import type {
		CellColor,
		Grid,
		StreakData,
		CoinReward,
	} from "../../shared/types";
	import type { EngagementCompletionData } from "../../shared/engagement-types";
	import type { SeasonInfo } from "../../shared/growth-types";
	import type { CompletionContext } from "../../shared/race-types";
	import { validateGrid } from "../lib/validation";
	import { hintShownStore, markShown } from "../stores/hints";
	import { getSimplifiedCompletionCtas } from "../lib/completion-ctas";
	import { get } from "svelte/store";
	import ConfettiEffect from "../components/ConfettiEffect.svelte";
	import GameBoard from "../components/GameBoard.svelte";
	import InlineHint from "../components/InlineHint.svelte";
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
	import PresenceBar from "../components/PresenceBar.svelte";
	import TutorialView from "../views/TutorialView.svelte";
	import Trophy from "lucide-svelte/icons/trophy";
	import CircleHelp from "lucide-svelte/icons/circle-help";
	import Shuffle from "lucide-svelte/icons/shuffle";
	import BarChart2 from "lucide-svelte/icons/bar-chart-2";
	import ExternalLink from "lucide-svelte/icons/external-link";
	import MoreHorizontal from "lucide-svelte/icons/more-horizontal";
	import Zap from "lucide-svelte/icons/zap";

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
		onOpenAnalytics?: () => void;
		isMod?: boolean;
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
		notifyOptIn?: boolean;
		onRace?: () => void;
		isRaceResult?: boolean;
		raceWon?: boolean;
		postId?: string;
		autoChallengeUrl?: string | null;
		hintsDismissed?: {
			numberConstraint: boolean;
			adjacencyViolation: boolean;
		};
	};

	let {
		grid,
		gridSize,
		onCellChange,
		isCompleted,
		onNextChallenge,
		streakData,
		hasChallenged,
		challengeUrl,
		onShare,
		onChallenge,
		coinReward,
		coins,
		onOpenShop,
		onOpenAnalytics,
		isMod = false,
		timeTaken,
		mistakes = 0,
		username,
		hasSubscribed = false,
		onSubscribe,
		isChallenge = false,
		onGridSizeChange,
		engagement,
		puzzleColors,
		skillLevel = 1,
		puzzleNumber = 0,
		seasonRank = null,
		seasonPoints = 0,
		currentSeason,
		notifyOptIn = false,
		onRace,
		isRaceResult = false,
		raceWon = false,
		postId,
		autoChallengeUrl = null,
		// hintsDismissed is accepted for forward-compat; wired in task 13.3
		hintsDismissed: _hintsDismissed = {
			numberConstraint: false,
			adjacencyViolation: false,
		},
	}: Props = $props();

	let showLeaderboard = $state(false);
	let showHowToPlay = $state(false);
	let showShareConfirm = $state(false);
	let showChallengeConfirm = $state(false);
	let showSubscribeConfirm = $state(false);
	let showMissions = $state(false);
	let showAchievements = $state(false);
	let showProfile = $state(false);
	let dismissedMysteryBoxKey = $state<string | null>(null);
	let dismissedMilestoneKey = $state<string | null>(null);
	let showSeasonLeaderboard = $state(false);
	let hasCommentedResult = $state(false);
	let openMoreActionsKey = $state<string | null>(null);
	let showCoinBreakdown = $state(false);
	let showOptInTutorial = $state(false);
	let autoChallengeToastVisible = $state(true);
	let autoChallengeDismissed = $state(false);

	// Notify toggle — initialised from prop, updated optimistically on tap (Reqs 13.1–13.5)
	// Using a function initialiser avoids the Svelte "captures initial value" warning
	// while still seeding from the server-provided prop on first render.
	let localNotifyOptIn = $state((() => notifyOptIn)());
	let notifySubmitting = $state(false);
	let notifyError = $state<string | null>(null);

	// ─── Inline hint visibility flags ────────────────────────────────────────
	// These control whether the InlineHint bubble is currently mounted.
	// The hintShownStore flags prevent re-display within the same session.
	let showNumberHint = $state(false);
	let showAdjacencyHint = $state(false);

	// Tracks whether the help-tap POST has already fired this session (Req 11.1).
	let helpTapFired = $state(false);

	// ─── Inline hint trigger logic ───────────────────────────────────────────
	// Wraps the parent's onCellChange to intercept taps and surface inline hints.
	// The number-constraint hint fires when the tapped cell has a non-null number
	// (Req 8.1). The adjacency-violation hint fires when validateGrid detects a
	// violated row or column after the mutation (Req 9.1). Both are shown at most
	// once per session via the hintShownStore flags (Reqs 8.4, 9.4).

	function handleCellChange(
		row: number,
		col: number,
		color: CellColor,
	): void {
		// Capture the tapped cell's number BEFORE the parent mutates the grid,
		// so we can decide whether to show the number-constraint hint.
		const tappedCell = grid[row]?.[col];
		const tappedCellHasNumber =
			tappedCell !== undefined && tappedCell.number !== null;

		// Delegate to parent — this triggers a grid prop update on the next tick.
		onCellChange(row, col, color);

		// Number-constraint hint: show once per session when a numbered cell is tapped.
		const hints = get(hintShownStore);
		if (tappedCellHasNumber && !hints.numberConstraintShown) {
			markShown("numberConstraint");
			showNumberHint = true;
		}

		// Adjacency-violation hint: show once per session when validateGrid detects
		// a violated row or column. We re-run validateGrid on the updated grid
		// synchronously — the parent's grid prop update may not have propagated yet,
		// so we compute it ourselves using the new color value.
		const updatedGrid: Grid = grid.map((r, ri) =>
			ri === row
				? r.map((c, ci) =>
						ci === col
							? { color, number: c.number, locked: c.locked }
							: c,
					)
				: r,
		);
		const updatedValidation = validateGrid(updatedGrid, gridSize);
		const hasViolation =
			updatedValidation.violatedRows.size > 0 ||
			updatedValidation.violatedCols.size > 0;

		const hintsAfter = get(hintShownStore);
		if (hasViolation && !hintsAfter.adjacencyViolationShown) {
			markShown("adjacencyViolation");
			showAdjacencyHint = true;
		}
	}

	// ─── Help-tap tracking ────────────────────────────────────────────────────
	// POST to /api/game/help-tap on the first Help icon tap per session (Req 11.1).
	// Fire-and-forget — failures are silently ignored so gameplay is never blocked.

	function handleHelpTap(): void {
		showHowToPlay = true;
		if (helpTapFired) return;
		helpTapFired = true;
		fetch("/api/game/help-tap", { method: "POST" }).catch(() => {
			// Non-blocking: tracking failure does not affect gameplay
		});
	}

	const validation = $derived(validateGrid(grid, gridSize));
	const boardSizeStyle = $derived(
		`width: min(100%, calc(100vh - ${!isChallenge && onGridSizeChange ? "148px" : "116px"})); max-width: min(100%, calc(100vh - ${!isChallenge && onGridSizeChange ? "148px" : "116px"})); max-height: 100%;`,
	);
	const currentCompletionKey = $derived(
		isCompleted ? `${timeTaken ?? 0}:${puzzleColors ?? ""}` : null,
	);
	const showConfetti = $derived(isCompleted);
	const mysteryBoxKey = $derived(
		engagement?.variableReward.mysteryBox && currentCompletionKey
			? `${currentCompletionKey}:mystery`
			: null,
	);
	const showMysteryBoxOverlay = $derived(
		mysteryBoxKey !== null && dismissedMysteryBoxKey !== mysteryBoxKey,
	);
	const milestoneKey = $derived(
		engagement?.streakMilestone && currentCompletionKey
			? `${currentCompletionKey}:milestone`
			: null,
	);
	const showStreakMilestoneOverlay = $derived(
		milestoneKey !== null && dismissedMilestoneKey !== milestoneKey,
	);
	const showMoreActionsPanel = $derived(
		currentCompletionKey !== null &&
			openMoreActionsKey === currentCompletionKey,
	);

	// Tomorrow's streak bonus: current streak + 1 day worth of bonus coins
	const tomorrowStreakBonus = $derived(
		streakData.currentStreak > 0
			? Math.min(streakData.currentStreak + 1, 30)
			: 1,
	);
	// Build CompletionContext for simplified CTAs (social viral mechanics)
	const completionContext = $derived<CompletionContext>({
		isRaceResult,
		raceWon,
		timeTaken: timeTaken ?? 0,
		mistakes,
		streak: streakData.currentStreak,
		skillLevel,
		hasChallenged,
		challengeUrl,
		hasSubscribed,
	});
	const simplifiedCtas = $derived(
		getSimplifiedCompletionCtas(completionContext),
	);

	function confirmShare(): void {
		showShareConfirm = false;
		onShare();
	}

	function confirmChallenge(): void {
		showChallengeConfirm = false;
		onChallenge();
	}

	function handlePrimaryCta(): void {
		const id = simplifiedCtas.primary.id;
		if (id === "challenge-friends") {
			showChallengeConfirm = true;
		} else if (id === "race-rematch") {
			onRace?.();
		} else if (id === "view-challenge") {
			openChallenge();
		}
	}

	function handleSecondaryCta(id: string): void {
		if (id === "next-puzzle") {
			onNextChallenge();
		}
	}

	function openChallenge(): void {
		if (!challengeUrl) return;
		navigateTo(challengeUrl);
	}

	function confirmSubscribe(): void {
		showSubscribeConfirm = false;
		onSubscribe?.();
	}

	function dismissMysteryBox(): void {
		dismissedMysteryBoxKey = mysteryBoxKey;
	}

	function dismissMilestone(): void {
		dismissedMilestoneKey = milestoneKey;
	}

	function toggleMoreActions(): void {
		if (currentCompletionKey === null) return;
		openMoreActionsKey = showMoreActionsPanel ? null : currentCompletionKey;
	}

	// Notify toggle handler — optimistic update, revert on failure (Req 13.5)
	async function handleNotifyToggle(): Promise<void> {
		if (notifySubmitting) return;
		notifySubmitting = true;
		notifyError = null;
		const previous = localNotifyOptIn;
		localNotifyOptIn = !previous;
		const endpoint = previous
			? "/api/game/notify/opt-out"
			: "/api/game/notify/opt-in";
		try {
			const res = await fetch(endpoint, { method: "POST" });
			if (!res.ok) throw new Error("Request failed");
			const json = (await res.json()) as { optedIn: boolean };
			localNotifyOptIn = json.optedIn;
		} catch {
			// Revert on failure and show inline error (Req 13.5)
			localNotifyOptIn = previous;
			notifyError =
				"Could not update notification preference. Try again.";
		} finally {
			notifySubmitting = false;
		}
	}

	function handleOpenOptInTutorial(): void {
		showOptInTutorial = true;
	}

	async function handleOptInTutorialComplete(): Promise<void> {
		showOptInTutorial = false;
		try {
			await fetch("/api/game/tutorial-complete", { method: "POST" });
		} catch {
			// Non-critical — tutorial flag is informational only
		}
	}

	function handleOptInTutorialDismiss(): void {
		showOptInTutorial = false;
	}

	async function handleAutoChallengeOptOut(): Promise<void> {
		autoChallengeDismissed = true;
		autoChallengeToastVisible = false;
		try {
			await fetch("/api/game/auto-challenge/opt-out", { method: "POST" });
		} catch {
			// Non-blocking — opt-out preference is best-effort
		}
	}

	function dismissAutoChallengeToast(): void {
		autoChallengeToastVisible = false;
	}
</script>

<div class="h-full w-full flex flex-col p-3 gap-2 overflow-hidden">
	<!-- Header: help | streak · coins · trophy | shuffle -->
	<header class="flex-none flex items-center justify-between gap-3">
		<button
			onclick={handleHelpTap}
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
			{#if isMod && onOpenAnalytics}
				<button
					onclick={onOpenAnalytics}
					class="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-theme-hover transition-colors shrink-0"
					aria-label="Analytics dashboard"
				>
					<BarChart2 class="w-5 h-5 text-blue-400" />
				</button>
			{/if}
		</div>

		{#if !isCompleted}
			<div class="flex items-center gap-1 shrink-0">
				{#if onRace}
					<button
						onclick={onRace}
						class="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-theme-hover transition-colors"
						aria-label="Race"
					>
						<Zap class="w-5 h-5 text-yellow-400" />
					</button>
				{/if}
				<button
					onclick={onNextChallenge}
					class="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-theme-hover transition-colors"
					aria-label="New Puzzle"
				>
					<Shuffle class="w-5 h-5 text-urjo-blue" />
				</button>
			</div>
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
		class="flex-1 min-h-0 flex flex-col items-center justify-center relative overflow-hidden"
		style="container-type: size;"
	>
		<!-- Board: square, never taller than available height -->
		<div class="w-full min-h-0 flex items-center justify-center flex-1 overflow-hidden">
			<div class="aspect-square overflow-hidden" style={boardSizeStyle}>
				<GameBoard
					{grid}
					{gridSize}
					onCellChange={handleCellChange}
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
					class="flex flex-col items-center gap-3 max-w-sm w-full my-auto"
				>
					<!-- ── Zone 1: Celebration header ── -->
					<!-- Single row: coins · streak · perfect/mistakes · multiplier -->
					<div
						class="flex flex-col items-center gap-1 animate-bounce-in"
					>
						<div
							class="flex items-center gap-2 flex-wrap justify-center"
						>
							{#if coinReward && coinReward.total > 0}
								<button
									onclick={() =>
										(showCoinBreakdown =
											!showCoinBreakdown)}
									class="text-2xl font-bold text-yellow-400 hover:opacity-80 transition-opacity"
									aria-label="Toggle coin breakdown"
								>
									+{coinReward.total} 🪙
								</button>
								{#if coinReward.multiplier}
									<span
										class="px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/50 text-xs font-bold text-yellow-400"
									>
										{coinReward.multiplier}× BONUS!
									</span>
								{/if}
							{/if}
							{#if streakData.currentStreak > 0}
								<span
									class="px-2 py-0.5 rounded-full bg-theme-hover border border-theme-border text-xs font-bold text-theme-text-primary"
								>
									🔥 {streakData.currentStreak}
								</span>
							{/if}
							{#if mistakes === 0}
								<span
									class="text-sm font-semibold text-green-400"
									>🎯 Perfect!</span
								>
							{:else}
								<span class="text-sm text-yellow-400"
									>⚠️ {mistakes} mistake{mistakes === 1
										? ""
										: "s"}</span
								>
							{/if}
						</div>

						<!-- Coin breakdown — collapsed by default, tap coin total to expand -->
						{#if showCoinBreakdown && coinReward}
							<div
								class="flex gap-2 text-xs text-gray-400 flex-wrap justify-center"
							>
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
						{/if}
					</div>

					<!-- New achievement unlocks -->
					{#if engagement?.newAchievements && engagement.newAchievements.length > 0}
						<div class="flex flex-col items-center gap-1">
							{#each engagement.newAchievements as achievement (achievement.id)}
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

					<!-- Auto-challenge toast (VIRAL: shows when challenge was auto-posted) -->
					{#if autoChallengeUrl && autoChallengeToastVisible && !autoChallengeDismissed}
						<div class="w-full px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center justify-between gap-2 animate-bounce-in">
							<div class="flex items-center gap-2 min-w-0">
								<span class="text-lg shrink-0">🎯</span>
								<span class="text-sm text-green-400 font-medium truncate">Your perfect solve is live!</span>
							</div>
							<div class="flex items-center gap-1 shrink-0">
								<a
									href={autoChallengeUrl}
									target="_blank"
									rel="noopener"
									class="px-2 py-1 text-xs font-semibold text-green-400 hover:text-green-300 transition-colors"
								>
									View
								</a>
								<button
									onclick={handleAutoChallengeOptOut}
									class="px-2 py-1 text-xs text-theme-text-muted hover:text-red-400 transition-colors"
									title="Stop auto-sharing perfect solves"
								>
									Don't auto-share
								</button>
								<button
									onclick={dismissAutoChallengeToast}
									class="px-1 py-1 text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors"
									aria-label="Dismiss"
								>
									✕
								</button>
							</div>
						</div>
					{/if}

					<!-- ── Zone 2: Result card (visual hero) ── -->
					<!-- Season rank is now inside the card; no standalone row needed -->
					{#if puzzleColors}
						<div class="w-full">
							<ResultCard
								{puzzleColors}
								{gridSize}
								{skillLevel}
								{puzzleNumber}
								streak={streakData.currentStreak}
								timeTaken={timeTaken ?? 0}
								{mistakes}
								seasonNumber={currentSeason?.isActive
									? currentSeason.seasonNumber
									: null}
								{seasonRank}
								{seasonPoints}
								hasCommented={hasCommentedResult}
								onCommentResult={() =>
									(hasCommentedResult = true)}
							/>
						</div>
					{/if}

					<!-- ── Zone 3: Actions ── -->
					<!-- Primary CTA — full-width, bold, high contrast -->
					<button
						onclick={handlePrimaryCta}
						class="w-full px-4 py-3 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg text-base hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
					>
						{#if simplifiedCtas.primary.id === "view-challenge"}
							<ExternalLink class="w-4 h-4" />
						{/if}
						<span>{simplifiedCtas.primary.label}</span>
					</button>

					<!-- Secondary CTA — ghost/outline styling -->
					{#each simplifiedCtas.secondary as cta (cta.id)}
						<button
							onclick={() => handleSecondaryCta(cta.id)}
							class="w-full px-4 py-2 border border-theme-border text-theme-text-secondary font-semibold rounded-lg text-sm hover:bg-theme-hover active:scale-95 transition-all"
						>
							{cta.label}
						</button>
					{/each}

					<!-- Retention hook — promoted visibility -->
					<div
						class="text-sm text-theme-text-secondary text-center px-3 py-1 rounded-full bg-theme-hover"
					>
						🔥 Return tomorrow for +{tomorrowStreakBonus} streak bonus
						coins
					</div>

					<!-- "More" button — toggles collapsible panel -->
					<button
						onclick={toggleMoreActions}
						class="w-full px-3 py-1.5 text-theme-text-muted rounded-lg text-xs hover:bg-theme-hover transition-all flex items-center justify-center gap-1"
					>
						<MoreHorizontal class="w-4 h-4" />
						<span>More</span>
					</button>

					<!-- Collapsible "More" panel: 2-col grid -->
					{#if showMoreActionsPanel}
						<div class="grid grid-cols-2 gap-2 w-full">
							<!-- Notify toggle -->
							<button
								onclick={() => {
									openMoreActionsKey = null;
									handleNotifyToggle();
								}}
								class="px-3 py-1.5 border border-theme-border text-theme-text-muted rounded-lg text-xs hover:bg-theme-hover transition-all"
							>
								{localNotifyOptIn
									? "🔕 Notify off"
									: "🔔 Notify me"}
							</button>
							<!-- Subscribe -->
							{#if onSubscribe && !hasSubscribed}
								<button
									onclick={() => {
										openMoreActionsKey = null;
										showSubscribeConfirm = true;
									}}
									class="px-3 py-1.5 border border-theme-border text-theme-text-muted rounded-lg text-xs hover:bg-theme-hover transition-all"
								>
									🔔 Subscribe
								</button>
							{/if}
							<!-- Missions -->
							<button
								onclick={() => {
									openMoreActionsKey = null;
									showMissions = true;
								}}
								class="px-3 py-1.5 border border-theme-border text-theme-text-muted rounded-lg text-xs hover:bg-theme-hover transition-all"
							>
								Missions
							</button>
							<!-- Achievements -->
							<button
								onclick={() => {
									openMoreActionsKey = null;
									showAchievements = true;
								}}
								class="px-3 py-1.5 border border-theme-border text-theme-text-muted rounded-lg text-xs hover:bg-theme-hover transition-all"
							>
								Achievements
							</button>
							<!-- Profile -->
							<button
								onclick={() => {
									openMoreActionsKey = null;
									showProfile = true;
								}}
								class="px-3 py-1.5 border border-theme-border text-theme-text-muted rounded-lg text-xs hover:bg-theme-hover transition-all"
							>
								Profile
							</button>
							<!-- Season -->
							{#if currentSeason?.isActive}
								<button
									onclick={() => {
										openMoreActionsKey = null;
										showSeasonLeaderboard = true;
									}}
									class="px-3 py-1.5 border border-theme-border text-theme-text-muted rounded-lg text-xs hover:bg-theme-hover transition-all"
								>
									Season
								</button>
							{/if}
						</div>
					{/if}

					{#if notifyError}
						<p class="text-xs text-red-400 text-center">
							{notifyError}
						</p>
					{/if}
				</div>
			</div>
		{/if}
	</main>

	<!-- Inline hints — rendered outside the board so they float above everything -->
	{#if showNumberHint}
		<InlineHint
			text="The number shows how many same-color neighbors this cell has, counting all 8 surrounding cells including diagonals."
			kind="numberConstraint"
			onDismiss={() => (showNumberHint = false)}
		/>
	{/if}

	{#if showAdjacencyHint}
		<InlineHint
			text="No row or column may contain three of the same color in a row."
			kind="adjacencyViolation"
			onDismiss={() => (showAdjacencyHint = false)}
		/>
	{/if}

	<!-- Footer -->
	<footer class="flex-none flex flex-col items-center justify-center gap-0.5">
		<p class="text-xs text-theme-text-muted text-center">
			{#if isCompleted}
				Solved in {timeTaken ?? 0}s
			{:else if mistakes === 0}
				✓ Perfect so far
			{:else}
				Mistakes: {mistakes}
			{/if}
		</p>
		{#if !isCompleted && postId}
			<PresenceBar {postId} />
		{/if}
	</footer>
</div>

<!-- Confetti effect -->
{#if showConfetti}
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
				Create Rival Challenge?
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
					Create
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
	onOpenTutorial={handleOpenOptInTutorial}
/>

<!-- Engagement modals -->
<MissionsPanel isOpen={showMissions} onClose={() => (showMissions = false)} />
<AchievementsPanel
	isOpen={showAchievements}
	onClose={() => (showAchievements = false)}
/>
<ProfilePanel isOpen={showProfile} onClose={() => (showProfile = false)} />

<!-- Mystery box animation -->
{#if showMysteryBoxOverlay && engagement?.variableReward.mysteryBox}
	<MysteryBoxAnimation
		reward={engagement.variableReward.mysteryBox}
		onDismiss={dismissMysteryBox}
	/>
{/if}

<!-- Streak milestone overlay -->
{#if showStreakMilestoneOverlay && engagement?.streakMilestone}
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

<!-- Opt-in tutorial overlay -->
{#if showOptInTutorial}
	<div class="fixed inset-0 z-50 bg-theme-bg-primary">
		<TutorialView
			mode="opt-in"
			onComplete={handleOptInTutorialComplete}
			onDismiss={handleOptInTutorialDismiss}
			isReplay={true}
		/>
	</div>
{/if}
