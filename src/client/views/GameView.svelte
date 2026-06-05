<script lang="ts">
	import { navigateTo, showLoginPrompt } from "@devvit/web/client";
	import type { CellColor, Grid, StreakData } from "../../shared/types";
	import type { EngagementCompletionData } from "../../shared/engagement-types";
	import type { SeasonInfo } from "../../shared/growth-types";
	import type { CompletionContext } from "../../shared/social-types";
	import { validateGrid } from "../lib/validation";
	import { computeBoardSize } from "../lib/board-layout";
	import { hintShownStore, markShown } from "../stores/hints";
	import { fireOnce } from "../stores/first-action";
	import { getSimplifiedCompletionCtas } from "../lib/completion-ctas";
	import { getLoginGate, LOGIN_CTA } from "../lib/login-gate";
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
	import SeasonStrip from "../components/SeasonStrip.svelte";
	import TutorialView from "../views/TutorialView.svelte";
	import Trophy from "lucide-svelte/icons/trophy";
	import CircleHelp from "lucide-svelte/icons/circle-help";
	import Shuffle from "lucide-svelte/icons/shuffle";
	import BarChart2 from "lucide-svelte/icons/bar-chart-2";
	import ExternalLink from "lucide-svelte/icons/external-link";
	import MoreHorizontal from "lucide-svelte/icons/more-horizontal";

	type Props = {
		grid: Grid;
		gridSize: number;
		onCellChange: (row: number, col: number, color: CellColor) => void;
		isCompleted: boolean;
		onNextChallenge: () => void;
		onRestart: () => void;
		streakData: StreakData;
		hasChallenged: boolean;
		challengeUrl: string | null;
		onChallenge: () => void;
		coins?: number;
		onOpenShop?: () => void;
		onOpenAnalytics?: () => void;
		isMod?: boolean;
		timeTaken?: number;
		mistakes?: number;
		username?: string;
		hasSubscribed?: boolean;
		/** False when the viewer is a logged-out Reddit user. Drives the
		 *  login gate — account-scoped UI is hidden and a sign-in CTA shows. */
		isLoggedIn?: boolean;
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
		postId?: string | undefined;
		/** True on a perfect solve — surfaces an explicit "Challenge friends"
		 *  prompt. The challenge post is only created on an explicit tap. */
		challengePromptEligible?: boolean;
		/** Run-again loop: number of solves this session (incl. the latest). */
		sessionRun?: number;
		/** Coin multiplier already applied for this session run. */
		sessionRunMultiplier?: number;
		/** Active Weekend Event payload — when active, shows a persistent
		 *  banner with countdown + applies a coin multiplier to all solves. */
		weekendEvent?:
			| {
					active: boolean;
					multiplier: number;
					name: string;
					emoji: string;
					endsAtMs: number | null;
					hoursLeft: number | null;
			  }
			| undefined;
		/** Always-on progression strip data — player rank/score in the
		 *  current season. Optional; the strip hides cleanly without it. */
		seasonProgress?:
			| {
					rank: number | null;
					score: number;
			  }
			| undefined;
		/** First incomplete daily mission for the always-on strip preview. */
		nextMission?:
			| {
					templateId: string;
					description: string;
					currentProgress: number;
					targetValue: number;
					coinReward: number;
			  }
			| undefined;
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
		onChallenge,
		coins,
		onOpenShop,
		onOpenAnalytics,
		isMod = false,
		timeTaken,
		mistakes = 0,
		username,
		hasSubscribed = false,
		isLoggedIn = true,
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
		postId,
		challengePromptEligible = false,
		sessionRun = 0,
		sessionRunMultiplier = 1,
		weekendEvent = undefined,
		seasonProgress = undefined,
		nextMission = undefined,
		// hintsDismissed is accepted for forward-compat; wired in task 13.3
		hintsDismissed: _hintsDismissed = {
			numberConstraint: false,
			adjacencyViolation: false,
		},
	}: Props = $props();

	let showLeaderboard = $state(false);
	let showHowToPlay = $state(false);
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
	let showOptInTutorial = $state(false);
	let challengePromptDismissed = $state(false);

	// Reset the challenge prompt each time a new perfect solve is signalled —
	// prevents a previous dismiss from suppressing the nudge on future solves.
	$effect(() => {
		if (challengePromptEligible) {
			challengePromptDismissed = false;
		}
	});

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
		void fireOnce(postId ?? "", "help");
		showHowToPlay = true;
		if (helpTapFired) return;
		helpTapFired = true;
		fetch("/api/game/help-tap", { method: "POST" }).catch(() => {
			// Non-blocking: tracking failure does not affect gameplay
		});
	}

	const validation = $derived(validateGrid(grid, gridSize));

	// ─── Board square sizing ─────────────────────────────────────────────────
	// Measure the board wrapper's content-box via bind:clientWidth/Height and
	// clamp the board to a square whose side is min(width, height). This keeps
	// the board within the viewport width on narrow screens (no right-column
	// clipping) while staying square. See src/client/lib/board-layout.ts.
	let availableWidth = $state(0);
	let availableHeight = $state(0);
	const boardSize = $derived(
		computeBoardSize(availableWidth, availableHeight),
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

	// Build CompletionContext for simplified CTAs (social viral mechanics)
	const completionContext = $derived<CompletionContext>({
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

	// Login gate — single source of truth for which account-scoped UI shows.
	// Logged-out users see the puzzle only; wallet/streak/season/leaderboard/
	// social actions are hidden and a sign-in CTA appears instead.
	const loginGate = $derived(getLoginGate(isLoggedIn));

	function handleLoginPrompt(): void {
		showLoginPrompt();
	}

	function confirmChallenge(): void {
		showChallengeConfirm = false;
		onChallenge();
	}

	function handlePrimaryCta(): void {
		// Primary CTA is now always "Next Puzzle" (the in-flow continuation).
		// We still route through the simplifiedCtas object so the label/id
		// remain in sync with completion-ctas.ts.
		const id = simplifiedCtas.primary.id;
		if (id === "next-puzzle") {
			void fireOnce(postId ?? "", "next-puzzle");
			onNextChallenge();
		}
	}

	function handleSecondaryCta(id: string): void {
		// Secondary CTA is the demoted social action. Old primary handlers move
		// here so "Challenge Friends" / "View Challenge" still work — they just
		// live in the secondary slot now.
		if (id === "challenge-friends") {
			void fireOnce(postId ?? "", "challenge");
			showChallengeConfirm = true;
		} else if (id === "view-challenge") {
			openChallenge();
		} else if (id === "next-puzzle") {
			// Backwards compat in case anything is still routed here
			onNextChallenge();
		}
	}

	function openChallenge(): void {
		if (!challengeUrl) return;
		navigateTo(challengeUrl);
	}

	function confirmSubscribe(): void {
		showSubscribeConfirm = false;
		void fireOnce(postId ?? "", "subscribe");
		onSubscribe?.();
	}

	function handleHeaderNextPuzzle(): void {
		void fireOnce(postId ?? "", "next-puzzle");
		onNextChallenge();
	}

	function handleGridSizeSelect(size: number): void {
		void fireOnce(postId ?? "", "grid-size");
		onGridSizeChange?.(size);
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
		void fireOnce(postId ?? "", "notify");
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

	function startPerfectChallenge(): void {
		void fireOnce(postId ?? "", "challenge");
		showChallengeConfirm = true;
	}

	function dismissChallengePrompt(): void {
		challengePromptDismissed = true;
	}
</script>

<div class="h-full w-full flex flex-col p-3 gap-2 overflow-hidden">
	<!-- Header: help | streak · coins · trophy | shuffle -->
	<!-- flex-wrap lets trailing controls drop to a second line instead of
	     clipping when the row can't fit; the side clusters stay shrink-0 so
	     icon tap targets are preserved and only the centre cluster compresses. -->
	<header class="flex-none flex flex-wrap items-center justify-between gap-2">
		<button
			onclick={handleHelpTap}
			class="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-theme-hover transition-colors shrink-0"
			aria-label="How to Play"
		>
			<CircleHelp class="w-5 h-5 text-urjo-blue" />
		</button>

		<!-- Centre cluster — min-w-0 lets it shrink below its content width so
		     the shrink-0 trailing controls are never pushed off-screen. -->
		<div class="flex items-center gap-2 flex-1 min-w-0 justify-center">
			{#if loginGate.showStreak}
				<StreakBadge streak={streakData} />
			{/if}
			{#if sessionRun >= 2}
				<!-- Session run chip — Subway Surfers' "5 in a row" momentum
				     indicator. Hidden for first solve so it doesn't appear
				     before the player has earned anything. -->
				<div
					class="px-2 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center gap-1"
					title="Keep playing for bigger coin bonuses"
				>
					<span class="text-xs">🏃</span>
					<span class="text-xs font-bold text-orange-300">
						{sessionRun} in a row
					</span>
					{#if sessionRunMultiplier > 1}
						<span class="text-[10px] text-orange-200/80"
							>· {sessionRunMultiplier.toFixed(2)}×</span
						>
					{/if}
				</div>
			{/if}
			{#if loginGate.showWallet && coins !== undefined && onOpenShop}
				<CoinDisplay {coins} onClick={onOpenShop} />
			{/if}
			{#if loginGate.showLeaderboard}
				<button
					onclick={() => (showLeaderboard = true)}
					class="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-theme-hover transition-colors shrink-0"
					aria-label="View leaderboard"
				>
					<Trophy class="w-5 h-5 text-yellow-400" />
				</button>
			{/if}
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
				<button
					onclick={handleHeaderNextPuzzle}
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

	<!-- Weekend Event banner — persistent across the in-game and completion
	     screens whenever the server reports an active event. Provides the
	     FOMO clock the game previously lacked (CoC builder timer, Subway
	     Surfers daily challenge timer). Tapping it has no action; it's a
	     status indicator, not a CTA. -->
	{#if weekendEvent?.active}
		<div class="flex-none flex justify-center px-3">
			<div
				class="flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-fuchsia-500/15 via-orange-500/15 to-amber-500/15 border border-orange-500/40 shadow-sm"
			>
				<span class="text-base">{weekendEvent.emoji}</span>
				<span class="text-xs font-bold text-orange-200">
					{weekendEvent.name} · {weekendEvent.multiplier}× coins
				</span>
				{#if weekendEvent.hoursLeft !== null && weekendEvent.hoursLeft > 0}
					<span
						class="text-[10px] text-orange-100/70 border-l border-orange-500/30 pl-2"
					>
						ends in {weekendEvent.hoursLeft}h
					</span>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Always-on progression strip — Subway Surfers / CoC home-screen
	     pattern. Surfaces streak calendar, season standing, and next daily
	     mission so meta-progression is never hidden in modals. Only on the
	     in-game view (hidden during completion overlay & challenge posts to
	     avoid clutter). -->
	{#if !isCompleted && !isChallenge && loginGate.showSeason}
		<SeasonStrip
			streak={streakData}
			{currentSeason}
			{seasonProgress}
			{nextMission}
			onOpenSeason={() => (showSeasonLeaderboard = true)}
			onOpenMissions={() => (showMissions = true)}
		/>
	{/if}

	<!-- Logged-out sign-in banner — sits where the progression strip would be
	     for signed-in users. Pairs the prompt with a clear value proposition
	     (save progress + unlock) per Reddit's logged-out guidance. Triggered
	     only by the user's tap, so it's a natural conversion moment. -->
	{#if !isCompleted && loginGate.showLoginCta}
		<div class="flex-none flex justify-center px-3">
			<button
				onclick={handleLoginPrompt}
				class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-urjo-blue/10 border border-urjo-blue/40 hover:bg-urjo-blue/20 active:scale-95 transition-all"
			>
				<span class="text-sm">🔓</span>
				<span class="text-xs font-semibold text-urjo-blue">
					{LOGIN_CTA.button}
				</span>
			</button>
		</div>
	{/if}

	<!-- Grid size selector: its own row, centred, hidden for challenge posts -->
	{#if !isChallenge && onGridSizeChange}
		<div class="flex-none flex justify-center">
			<GridSizeSelector
				{gridSize}
				onGridSizeChange={handleGridSizeSelect}
			/>
		</div>
	{/if}

	<!-- Main game area -->
	<main
		class="flex-1 min-h-0 flex items-center justify-center relative overflow-hidden p-2"
	>
		<!-- Board wrapper: maintains square aspect ratio within available space.
		     The outer div is measured (bind:clientWidth/Height) to get the
		     available content-box; the inner square is sized to
		     min(width, height) via boardSize so it never overflows the width.
		     The parent's overflow-hidden prevents any spillover. -->
		<div
			class="w-full h-full flex items-center justify-center"
			bind:clientWidth={availableWidth}
			bind:clientHeight={availableHeight}
		>
			<div style="width: {boardSize}px; height: {boardSize}px">
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

					<!-- Perfect-solve challenge prompt (VIRAL: explicit, opt-in share) -->
					<!-- Reddit policy: posting as the user must be a clear, manual
					     action. This nudge only opens the confirm dialog — the post
					     is created as the user only after they confirm. -->
					{#if challengePromptEligible && loginGate.showSocialActions && !challengePromptDismissed && !hasChallenged}
						<div
							class="w-full px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center justify-between gap-2 animate-bounce-in"
						>
							<div class="flex items-center gap-2 min-w-0">
								<span class="text-lg shrink-0">🎯</span>
								<span
									class="text-sm text-green-400 font-medium truncate"
									>Perfect solve! Challenge others to beat it?</span
								>
							</div>
							<div class="flex items-center gap-1 shrink-0">
								<button
									onclick={startPerfectChallenge}
									class="px-2 py-1 text-xs font-semibold text-green-400 hover:text-green-300 transition-colors"
								>
									Post as {username
										? `u/${username}`
										: "yourself"}
								</button>
								<button
									onclick={dismissChallengePrompt}
									class="px-1 py-1 text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors"
									aria-label="Dismiss"
								>
									✕
								</button>
							</div>
						</div>
					{/if}

					<!-- View link after the player has posted their challenge -->
					{#if hasChallenged && challengeUrl}
						<a
							href={challengeUrl}
							target="_blank"
							rel="noopener"
							class="w-full px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold text-green-400 hover:text-green-300 transition-colors animate-bounce-in"
						>
							🎯 Your challenge is live — view it
						</a>
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
								showCommentAction={loginGate.showSocialActions}
								{username}
								onCommentResult={() =>
									(hasCommentedResult = true)}
							/>
						</div>
					{/if}

					<!-- ── Zone 3: Actions ── -->
					<!-- Primary CTA — always "Next Puzzle" so the in-flow player
					     can keep playing with one tap. Pulses gently to draw
					     the eye, the way Subway Surfers' Run-Again button does. -->
					<button
						onclick={handlePrimaryCta}
						class="w-full px-4 py-3 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg text-base hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 animate-cta-pulse"
					>
						{#if simplifiedCtas.primary.id === "next-puzzle"}
							<Shuffle class="w-4 h-4" />
						{/if}
						<span>{simplifiedCtas.primary.label}</span>
					</button>

					<!-- Secondary CTA — ghost/outline styling. This is where
					     "Challenge Friends" / "View Challenge"
					     now live (demoted from primary). -->
					{#if loginGate.showSocialActions}
						{#each simplifiedCtas.secondary as cta (cta.id)}
							<button
								onclick={() => handleSecondaryCta(cta.id)}
								class="w-full px-4 py-2 border border-theme-border text-theme-text-secondary font-semibold rounded-lg text-sm hover:bg-theme-hover active:scale-95 transition-all flex items-center justify-center gap-2"
							>
								{#if cta.id === "view-challenge"}
									<ExternalLink class="w-4 h-4" />
								{/if}
								<span>{cta.label}</span>
							</button>
						{/each}
					{/if}

					<!-- Logged-out conversion CTA — shown at the natural
					     breakpoint (result screen) per Reddit's logged-out
					     guide. Pairs the prompt with a clear value proposition:
					     signing in saves the run and unlocks coins/streak. -->
					{#if loginGate.showLoginCta}
						<div
							class="w-full flex flex-col items-center gap-2 px-4 py-3 rounded-lg bg-urjo-blue/10 border border-urjo-blue/40"
						>
							<p
								class="text-sm font-bold text-theme-text-primary text-center"
							>
								{LOGIN_CTA.title}
							</p>
							<p
								class="text-xs text-theme-text-secondary text-center"
							>
								{LOGIN_CTA.body}
							</p>
							<button
								onclick={handleLoginPrompt}
								class="w-full px-4 py-2 bg-urjo-blue text-white font-bold rounded-lg text-sm hover:opacity-90 active:scale-95 transition-all"
							>
								{LOGIN_CTA.button}
							</button>
						</div>
					{/if}

					<!-- Free-freeze grant celebration — fires when the server's
					     7-day cadence handed the player a Streak Freeze. -->
					{#if streakData.freeFreezeGranted}
						<div
							class="text-xs text-center px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/40 text-blue-300 font-semibold"
						>
							🧊 Free Streak Freeze granted! Stored in your shop.
						</div>
					{/if}

					{#if loginGate.showSocialActions}
						<div class="grid grid-cols-2 gap-2 w-full">
							<button
								onclick={handleNotifyToggle}
								disabled={notifySubmitting}
								class="px-3 py-2 border border-theme-border text-theme-text-secondary rounded-lg text-xs font-semibold hover:bg-theme-hover active:scale-95 transition-all disabled:opacity-50"
							>
								{localNotifyOptIn ? "Notify on" : "Notify me"}
							</button>
							{#if onSubscribe && !hasSubscribed}
								<button
									onclick={() =>
										(showSubscribeConfirm = true)}
									class="px-3 py-2 border border-theme-border text-theme-text-secondary rounded-lg text-xs font-semibold hover:bg-theme-hover active:scale-95 transition-all"
								>
									Subscribe
								</button>
							{:else}
								<button
									onclick={() =>
										(showSeasonLeaderboard = true)}
									class="px-3 py-2 border border-theme-border text-theme-text-secondary rounded-lg text-xs font-semibold hover:bg-theme-hover active:scale-95 transition-all"
								>
									Season
								</button>
							{/if}
						</div>

						<!-- "More" button — toggles collapsible panel -->
						<button
							onclick={toggleMoreActions}
							class="w-full px-3 py-1.5 text-theme-text-muted rounded-lg text-xs hover:bg-theme-hover transition-all flex items-center justify-center gap-1"
						>
							<MoreHorizontal class="w-4 h-4" />
							<span>More</span>
						</button>
					{/if}

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
		{#if isCompleted}
			<p class="text-xs text-theme-text-muted text-center">
				Solved in {timeTaken ?? 0}s
			</p>
		{/if}
	</footer>
</div>

<!-- Confetti effect -->
{#if showConfetti}
	<ConfettiEffect />
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
