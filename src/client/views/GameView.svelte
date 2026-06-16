<script lang="ts">
	import { onMount } from "svelte";
	import { navigateTo, showLoginPrompt } from "@devvit/web/client";
	import type { CellColor, Grid, StreakData } from "../../shared/types";
	import type { EngagementCompletionData } from "../../shared/engagement-types";
	import type { SeasonInfo } from "../../shared/growth-types";
	import type { CompletionContext } from "../../shared/social-types";
	import { validateGrid } from "../lib/validation";
	import { computeBoardSize } from "../lib/board-layout";
	import { fireOnce } from "../stores/first-action";
	import { getSimplifiedCompletionCtas } from "../lib/completion-ctas";
	import { getLoginGate, LOGIN_CTA } from "../lib/login-gate";
	import ConfettiEffect from "../components/ConfettiEffect.svelte";
	import GameBoard from "../components/GameBoard.svelte";
	import LeaderboardModal from "../components/LeaderboardModal.svelte";
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
	import ModPreviewPanel from "../components/ModPreviewPanel.svelte";
	import { fly, fade } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import CircleHelp from "lucide-svelte/icons/circle-help";
	import Settings from "lucide-svelte/icons/settings";
	import ExternalLink from "lucide-svelte/icons/external-link";
	import MoreHorizontal from "lucide-svelte/icons/more-horizontal";
	import Trophy from "lucide-svelte/icons/trophy";
	import Clock from "lucide-svelte/icons/clock";
	import Coins from "lucide-svelte/icons/coins";
	import Flame from "lucide-svelte/icons/flame";

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
		onChallengeAndContinue?: () => void;
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
		/** Solution string (e.g. "rbbrrbbr...") used to compute the idle hint. */
		solution?: string;
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
		onChallengeAndContinue,
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
		solution = "",
	}: Props = $props();

	let showLeaderboard = $state(false);
	let showSettings = $state(false);
	let showModPreview = $state(false);
	let showChallengeConfirm = $state(false);
	let showChallengeAndContinueConfirm = $state(false);
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

	// ─── Idle hint ────────────────────────────────────────────────────────────
	// After 3s of no cell interaction, reveal one correct cell as a dull
	// pulsating hint. Resets whenever the user taps a cell.
	const HINT_DELAY_MS = 3000;
	// Idle/auto hints are DISABLED. They were launched enabled and drew
	// many "I hate the auto hints" comments while engagement dropped (the
	// game was partly solving itself). Do NOT flip this back to true — if
	// hints return, make them an explicit user-initiated "Hint" button, not
	// an automatic reveal. See the funnel post-mortem for context.
	const HINTS_ENABLED = false;
	let hintCell = $state<{
		row: number;
		col: number;
		color: "blue" | "red";
	} | null>(null);
	// Plain let — not $state — so writes never trigger reactive re-runs.
	let hintTimerId: ReturnType<typeof setTimeout> | null = null;

	function scheduleHint(): void {
		if (!HINTS_ENABLED) return;
		if (hintTimerId !== null) clearTimeout(hintTimerId);
		hintTimerId = setTimeout(() => {
			hintCell = computeHintCell(grid, solution, gridSize);
		}, HINT_DELAY_MS);
	}

	function cancelHint(): void {
		if (hintTimerId !== null) {
			clearTimeout(hintTimerId);
			hintTimerId = null;
		}
		hintCell = null;
	}

	function computeHintCell(
		currentGrid: Grid,
		sol: string,
		size: number,
	): { row: number; col: number; color: "blue" | "red" } | null {
		if (!sol) return null;
		const candidates: {
			row: number;
			col: number;
			color: "blue" | "red";
		}[] = [];
		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				const cell = currentGrid[r]?.[c];
				if (!cell || cell.locked || cell.color !== null) continue;
				const idx = r * size + c;
				const solChar = sol[idx];
				if (solChar === "b")
					candidates.push({ row: r, col: c, color: "blue" });
				else if (solChar === "r")
					candidates.push({ row: r, col: c, color: "red" });
			}
		}
		if (candidates.length === 0) return null;
		return (
			candidates[Math.floor(Math.random() * candidates.length)] ?? null
		);
	}

	// Kick off the initial hint timer on mount; clean up on unmount.
	onMount(() => {
		if (!isCompleted) scheduleHint();
		return () => {
			if (hintTimerId !== null) clearTimeout(hintTimerId);
		};
	});

	// Cancel hint when puzzle is completed.
	$effect(() => {
		if (isCompleted) cancelHint();
	});

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

	// ─── Help-tap tracking ────────────────────────────────────────────────────
	// POST to /api/game/help-tap on the first Help icon tap per session (Req 11.1).
	// Fire-and-forget — failures are silently ignored so gameplay is never blocked.

	function handleHelpTap(): void {
		void fireOnce(postId ?? "", "help");
		handleOpenOptInTutorial();
		fetch("/api/game/help-tap", { method: "POST" }).catch(() => {
			// Non-blocking: tracking failure does not affect gameplay
		});
	}

	function handleCellChangeWithHint(
		row: number,
		col: number,
		color: import("../../shared/types").CellColor,
	): void {
		// Reset idle hint whenever the user interacts with a cell
		cancelHint();
		scheduleHint();
		onCellChange(row, col, color);
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

	// Puzzle completion progress: fraction of cells that have been filled (color !== null).
	// Used to drive the progress bar beside the coins button.
	const puzzleProgress = $derived((): number => {
		const total = gridSize * gridSize;
		if (total === 0) return 0;
		let filled = 0;
		for (const row of grid) {
			for (const cell of row) {
				if (cell.color !== null) filled++;
			}
		}
		return filled / total;
	});

	function handleLoginPrompt(): void {
		showLoginPrompt();
	}

	function confirmChallenge(): void {
		showChallengeConfirm = false;
		onChallenge();
	}

	function confirmChallengeAndContinue(): void {
		showChallengeAndContinueConfirm = false;
		onChallengeAndContinue?.();
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
	<!-- Header: coins · session run -->
	<header class="flex-none flex flex-wrap items-center justify-between gap-2">
		<!-- Left spacer to balance layout -->
		<div class="w-9 shrink-0"></div>

		<!-- Centre cluster -->
		<div class="flex items-center gap-2 flex-1 min-w-0 justify-center">
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
				<CoinDisplay
					{coins}
					onClick={onOpenShop}
					progress={puzzleProgress()}
				/>
			{/if}
		</div>

		<div class="w-9 shrink-0"></div>
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
					onCellChange={handleCellChangeWithHint}
					violatedRows={validation.violatedRows}
					violatedCols={validation.violatedCols}
					{hintCell}
				/>
			</div>
		</div>

		<!-- Completion overlay — now a bottom sheet rendered outside <main> -->
	</main>

	<!-- Footer -->
	<footer class="flex-none flex items-center justify-between gap-2 px-1">
		<div class="w-9"></div>
		<div class="flex-1 flex justify-center"></div>
		<button
			onclick={() => (showSettings = true)}
			class="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-theme-hover transition-colors shrink-0"
			aria-label="Settings"
		>
			<Settings class="w-5 h-5 text-theme-text-muted" />
		</button>
	</footer>
</div>

<!-- Success full-screen -->
{#if isCompleted}
	<div
		transition:fade={{ duration: 200 }}
		class="fixed inset-0 z-50 flex flex-col items-center justify-between bg-theme-bg-primary px-6 py-10"
	>
		<!-- Top spacer -->
		<div class="flex-1"></div>

		<!-- Hero -->
		<div class="flex flex-col items-center gap-5">
			<div class="text-8xl leading-none select-none" aria-hidden="true">
				🏆
			</div>
			<p class="text-3xl font-bold text-yellow-400 text-center">
				Solved in {timeTaken ?? 0}s!
			</p>
		</div>

		<!-- Stats row: time | coins | streak -->
		<div class="grid grid-cols-3 gap-3 w-full mt-10">
			<!-- Time -->
			<div
				class="flex flex-col items-center gap-1 px-3 py-4 rounded-2xl border border-theme-border bg-theme-hover"
			>
				<Clock class="w-6 h-6 text-urjo-blue" />
				<span
					class="text-xl font-bold text-theme-text-primary leading-none"
					>{timeTaken ?? 0}s</span
				>
				<span
					class="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wide"
					>Time</span
				>
			</div>
			<!-- Coins -->
			{#if loginGate.showWallet && coins !== undefined}
				<div
					class="flex flex-col items-center gap-1 px-3 py-4 rounded-2xl border border-yellow-500/40 bg-yellow-500/10"
				>
					<Coins class="w-6 h-6 text-yellow-400" />
					<span class="text-xl font-bold text-yellow-300 leading-none"
						>{coins}</span
					>
					<span
						class="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wide"
						>Coins</span
					>
				</div>
			{:else}
				<div
					class="flex flex-col items-center gap-1 px-3 py-4 rounded-2xl border border-theme-border bg-theme-hover"
				>
					<Coins class="w-6 h-6 text-theme-text-muted" />
					<span
						class="text-xl font-bold text-theme-text-muted leading-none"
						>—</span
					>
					<span
						class="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wide"
						>Coins</span
					>
				</div>
			{/if}
			<!-- Streak -->
			{#if loginGate.showStreak}
				<div
					class="flex flex-col items-center gap-1 px-3 py-4 rounded-2xl border border-orange-500/40 bg-orange-500/10"
				>
					<Flame class="w-6 h-6 text-orange-400" />
					<span class="text-xl font-bold text-orange-300 leading-none"
						>{streakData.currentStreak}</span
					>
					<span
						class="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wide"
						>Streak</span
					>
				</div>
			{:else}
				<div
					class="flex flex-col items-center gap-1 px-3 py-4 rounded-2xl border border-theme-border bg-theme-hover"
				>
					<Flame class="w-6 h-6 text-theme-text-muted" />
					<span
						class="text-xl font-bold text-theme-text-muted leading-none"
						>—</span
					>
					<span
						class="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wide"
						>Streak</span
					>
				</div>
			{/if}
		</div>

		<!-- Bottom spacer -->
		<div class="flex-1"></div>

		<!-- Action buttons -->
		<div class="flex flex-col gap-3 w-full">
			<button
				onclick={handlePrimaryCta}
				class="w-full px-4 py-4 bg-urjo-blue text-white font-bold rounded-2xl text-base hover:opacity-90 active:scale-95 transition-all uppercase tracking-wide"
			>
				Continue
			</button>
			{#if onChallengeAndContinue && loginGate.showSocialActions}
				<button
					onclick={() => (showChallengeAndContinueConfirm = true)}
					class="w-full px-4 py-3.5 border border-yellow-500/60 text-yellow-400 font-semibold rounded-2xl text-sm hover:bg-yellow-500/10 active:scale-95 transition-all"
				>
					Challenge &amp; Continue
				</button>
			{/if}
			{#if onSubscribe && !hasSubscribed && loginGate.showSocialActions}
				<button
					onclick={() => (showSubscribeConfirm = true)}
					class="w-full px-4 py-3.5 border border-theme-border text-theme-text-secondary font-semibold rounded-2xl text-sm hover:bg-theme-hover active:scale-95 transition-all"
				>
					Join r/urjo
				</button>
			{/if}
		</div>
	</div>
{/if}

<!-- Confetti effect -->{#if showConfetti}
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

<!-- Challenge & Continue confirmation dialog -->
{#if showChallengeAndContinueConfirm}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
	>
		<div
			class="bg-theme-bg-primary border border-theme-border rounded-xl p-5 max-w-xs w-full flex flex-col gap-4 shadow-2xl"
		>
			<h2 class="text-base font-bold text-theme-text-primary">
				Challenge &amp; Continue?
			</h2>
			<p class="text-sm text-theme-text-secondary">
				Creates a public post in r/urjo with your time{username
					? ` as u/${username}`
					: ""} for others to beat, then loads your next puzzle.
			</p>
			<div class="flex gap-3">
				<button
					onclick={() => (showChallengeAndContinueConfirm = false)}
					class="flex-1 px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg text-sm hover:bg-theme-hover transition-all"
				>
					Cancel
				</button>
				<button
					onclick={confirmChallengeAndContinue}
					class="flex-1 px-4 py-2 bg-yellow-500 text-black font-bold rounded-lg text-sm hover:opacity-90 transition-all"
				>
					Challenge &amp; Play
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

<!-- Settings bottom sheet -->
{#if showSettings}
	<!-- Backdrop — fades in/out -->
	<div
		transition:fade={{ duration: 250 }}
		class="fixed inset-0 z-50 bg-black/60"
		role="button"
		tabindex="-1"
		aria-label="Close settings"
		onclick={() => (showSettings = false)}
		onkeydown={(e) => e.key === "Escape" && (showSettings = false)}
	></div>
	<!-- Sheet — springs up from bottom, slides back down on close -->
	<div
		transition:fly={{ y: 400, duration: 380, easing: cubicOut }}
		class="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-theme-bg-primary border-t border-theme-border rounded-t-2xl shadow-2xl"
		style="max-height: 60vh;"
	>
		<!-- Drag handle -->
		<div class="flex justify-center pt-3 pb-1 shrink-0">
			<div class="w-10 h-1 rounded-full bg-theme-border"></div>
		</div>
		<!-- Header -->
		<div class="flex items-center justify-between px-5 py-3 shrink-0">
			<h2 class="text-base font-bold text-theme-text-primary">
				Settings
			</h2>
			<button
				onclick={() => (showSettings = false)}
				class="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-theme-hover transition-colors text-theme-text-muted"
				aria-label="Close settings">✕</button
			>
		</div>
		<!-- Options -->
		<div class="flex flex-col gap-2 px-4 pb-8 overflow-y-auto">
			<button
				onclick={() => {
					showSettings = false;
					handleOpenOptInTutorial();
				}}
				class="w-full px-4 py-3.5 border border-theme-border text-theme-text-secondary font-semibold rounded-xl text-sm hover:bg-theme-hover active:scale-95 transition-all text-left flex items-center gap-3"
			>
				<CircleHelp class="w-5 h-5 text-urjo-blue shrink-0" />
				<span>How to Play / Tutorial</span>
			</button>
			{#if isMod && onOpenAnalytics}
				<button
					onclick={() => {
						showSettings = false;
						onOpenAnalytics?.();
					}}
					class="w-full px-4 py-3.5 border border-theme-border text-theme-text-secondary font-semibold rounded-xl text-sm hover:bg-theme-hover active:scale-95 transition-all text-left flex items-center gap-3"
				>
					<Settings class="w-5 h-5 text-blue-400 shrink-0" />
					<span>Analytics Dashboard</span>
				</button>
			{/if}
			{#if isMod}
				<button
					onclick={() => {
						showSettings = false;
						showModPreview = true;
					}}
					class="w-full px-4 py-3.5 border border-theme-border text-theme-text-secondary font-semibold rounded-xl text-sm hover:bg-theme-hover active:scale-95 transition-all text-left flex items-center gap-3"
				>
					<Settings class="w-5 h-5 text-theme-text-muted shrink-0" />
					<span>Component Preview</span>
				</button>
			{/if}
		</div>
	</div>
{/if}

<!-- Engagement modals -->
<MissionsPanel
	isOpen={showMissions}
	onClose={() => (showMissions = false)}
/><AchievementsPanel
	isOpen={showAchievements}
	onClose={() => (showAchievements = false)}
/>
<ProfilePanel isOpen={showProfile} onClose={() => (showProfile = false)} />

<!-- Mod component preview panel -->
{#if isMod}
	<ModPreviewPanel
		isOpen={showModPreview}
		onClose={() => (showModPreview = false)}
	/>
{/if}

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
