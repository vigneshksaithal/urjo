<script lang="ts">
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
	import AchievementsPanel from "../components/AchievementsPanel.svelte";
	import MysteryBoxAnimation from "../components/MysteryBoxAnimation.svelte";
	import StreakMilestoneOverlay from "../components/StreakMilestoneOverlay.svelte";

	import SeasonLeaderboard from "../components/SeasonLeaderboard.svelte";
	import SeasonStrip from "../components/SeasonStrip.svelte";
	import TutorialView from "../views/TutorialView.svelte";
	import ModPreviewPanel from "../components/ModPreviewPanel.svelte";
	import ConfirmDialog from "../components/ConfirmDialog.svelte";
	import CompletionOverlay from "../components/CompletionOverlay.svelte";
	import SettingsSheet from "../components/SettingsSheet.svelte";
	import Settings from "lucide-svelte/icons/settings";

	// ─── Grouped Props Types ─────────────────────────────────────────────────────
	// Props are grouped by domain for better API design, type safety, and testing.
	// See CODE_REVIEW_GAMEVIEW.md for rationale.

	type GameProps = {
		grid: Grid;
		gridSize: number;
		isCompleted: boolean;
		timeTaken?: number;
		mistakes?: number;
		solution?: string;
		puzzleColors?: string;
		puzzleNumber?: number;
	};

	type ProgressionProps = {
		coins?: number;
		streakData: StreakData;
		skillLevel?: number;
		seasonRank?: number | null;
		seasonPoints?: number;
		seasonProgress?:
			| {
					rank: number | null;
					score: number;
			  }
			| undefined;
		currentSeason?: SeasonInfo | undefined;
	};

	type ChallengeProps = {
		isChallenge?: boolean;
		hasChallenged: boolean;
		challengeUrl: string | null;
		challengePromptEligible?: boolean;
	};

	type EventProps = {
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
		engagement?: EngagementCompletionData;
	};

	type SessionProps = {
		sessionRun?: number;
		sessionRunMultiplier?: number;
	};

	type UserProps = {
		username?: string;
		isLoggedIn?: boolean;
		hasJoinedSubreddit?: boolean;
		isMod?: boolean;
		notifyOptIn?: boolean;
		hintsDismissed?: {
			numberConstraint: boolean;
			adjacencyViolation: boolean;
		};
	};

	type ActionProps = {
		onCellChange: (row: number, col: number, color: CellColor) => void;
		onNextChallenge: () => void;
		onRestart: () => void;
		onChallenge: () => void;
		onChallengeAndContinue?: () => void;
		onOpenShop?: () => void;
		onOpenAnalytics?: () => void;
		onSubscribe?: () => void;
		onGridSizeChange?: (size: number) => void;
		onEngagementDismissed?: () => void;
	};

	type Props = GameProps &
		ProgressionProps &
		ChallengeProps &
		EventProps &
		SessionProps &
		UserProps &
		ActionProps & {
			postId?: string | undefined;
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
		hasJoinedSubreddit = false,
		isLoggedIn = true,
		onSubscribe,
		isChallenge = false,
		onGridSizeChange,
		engagement,
		puzzleColors,
		skillLevel = 1,
		seasonRank = null,
		seasonPoints = 0,
		currentSeason,
		postId,
		sessionRun = 0,
		sessionRunMultiplier = 1,
		weekendEvent = undefined,
		seasonProgress = undefined,
	}: Props = $props();

	let showLeaderboard = $state(false);
	let showSettings = $state(false);
	let showModPreview = $state(false);
	let showChallengeConfirm = $state(false);
	let showChallengeAndContinueConfirm = $state(false);
	let showSubscribeConfirm = $state(false);
	let dismissedMysteryBoxKey = $state<string | null>(null);
	let dismissedMilestoneKey = $state<string | null>(null);
	let showSeasonLeaderboard = $state(false);
	let showOptInTutorial = $state(false);

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

	// Build CompletionContext for simplified CTAs (social viral mechanics)
	const completionContext = $derived<CompletionContext>({
		timeTaken: timeTaken ?? 0,
		mistakes,
		streak: streakData.currentStreak,
		skillLevel,
		hasChallenged,
		challengeUrl,
		hasJoinedSubreddit,
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

	function openChallenge(): void {
		if (!challengeUrl) return;
		navigateTo(challengeUrl);
	}

	function confirmSubscribe(): void {
		showSubscribeConfirm = false;
		void fireOnce(postId ?? "", "subscribe");
		onSubscribe?.();
		// Persist join status so the button stays hidden
		fetch("/api/game/subscribe", { method: "POST" }).catch(() => {
			// Non-blocking — UI will still update optimistically
		});
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
	     pattern. Surfaces streak calendar and season standing so meta-progression
	     is never hidden in modals. Only on the in-game view (hidden during
	     completion overlay & challenge posts to avoid clutter). -->
	{#if !isCompleted && !isChallenge && loginGate.showSeason}
		<SeasonStrip
			streak={streakData}
			{currentSeason}
			{seasonProgress}
			onOpenSeason={() => (showSeasonLeaderboard = true)}
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
					{onCellChange}
					violatedRows={validation.violatedRows}
					violatedCols={validation.violatedCols}
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

<!-- Completion overlay -->
<CompletionOverlay
	{isCompleted}
	timeTaken={timeTaken ?? 0}
	{mistakes}
	{coins}
	{streakData}
	{loginGate}
	onContinue={handlePrimaryCta}
	onChallengeAndContinue={onChallengeAndContinue
		? () => (showChallengeAndContinueConfirm = true)
		: undefined}
	onSubscribe={onSubscribe ? () => (showSubscribeConfirm = true) : undefined}
	{hasJoinedSubreddit}
/>

<!-- Confetti effect -->{#if showConfetti}
	<ConfettiEffect />
{/if}

<!-- Challenge confirmation dialog -->
<ConfirmDialog
	isOpen={showChallengeConfirm}
	title="Create Rival Challenge?"
	message="This creates a public post in r/urjo for others to beat."
	confirmLabel="Create"
	onConfirm={confirmChallenge}
	onCancel={() => (showChallengeConfirm = false)}
/>

<!-- Challenge & Continue confirmation dialog -->
<ConfirmDialog
	isOpen={showChallengeAndContinueConfirm}
	title="Challenge & Continue?"
	message="Creates a public post in r/urjo for others to beat, then loads your next puzzle."
	confirmLabel="Challenge & Play"
	confirmVariant="warning"
	onConfirm={confirmChallengeAndContinue}
	onCancel={() => (showChallengeAndContinueConfirm = false)}
/>

<!-- Subscribe confirmation dialog -->
<ConfirmDialog
	isOpen={showSubscribeConfirm}
	title="Join r/urjo?"
	message="This will subscribe you to r/urjo so you get daily puzzle notifications in your feed."
	confirmLabel="Join"
	onConfirm={confirmSubscribe}
	onCancel={() => (showSubscribeConfirm = false)}
/>

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
<SettingsSheet
	isOpen={showSettings}
	onClose={() => (showSettings = false)}
	{isMod}
	onTutorial={handleOpenOptInTutorial}
	{onOpenAnalytics}
	onShowModPreview={() => (showModPreview = true)}
/>

<!-- Engagement modals -->
<AchievementsPanel
	isOpen={showAchievements}
	onClose={() => (showAchievements = false)}
/>

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
