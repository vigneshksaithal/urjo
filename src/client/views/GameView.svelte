<script lang="ts">
	import { navigateTo, showLoginPrompt } from "@devvit/web/client";
	import type { CellColor, Grid, StreakData } from "../../shared/types";
	import type { EngagementCompletionData } from "../../shared/engagement-types";
	import type { SeasonInfo } from "../../shared/growth-types";
	import type {
		CompletionContext,
		PersonalChallengeData,
	} from "../../shared/social-types";
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
	import PersonalChallengeBanner from "../components/PersonalChallengeBanner.svelte";
	import SettingsSheet from "../components/SettingsSheet.svelte";
	import Megaphone from "lucide-svelte/icons/megaphone";
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
		hasSubscribed?: boolean;
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
			personalChallenge?: PersonalChallengeData | null;
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
		// hintsDismissed is accepted for forward-compat; wired in task 13.3
		hintsDismissed: _hintsDismissed = {
			numberConstraint: false,
			adjacencyViolation: false,
		},
		solution = "",
		personalChallenge = null,
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
	let showAchievements = $state(false);
	// Personal challenge banner - dismissed when user clicks X
	let showPersonalChallengeBanner = $state(true);

	// ─── Notify toggle ─────────────────────────────────────────────────────────
	// Optimistic update with revert on failure (Reqs 13.1–13.5)
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
		hasSubscribed,
	});
	const simplifiedCtas = $derived(
		getSimplifiedCompletionCtas(completionContext),
	);

	// Login gate — single source of truth for which account-scoped UI shows.
	// Logged-out users see the puzzle only; wallet/streak/season/leaderboard/
	// social actions are hidden and a sign-in CTA appears instead.
	const loginGate = $derived(getLoginGate(isLoggedIn));

	// Check if user beat a personal challenge (for completion overlay)
	const personalChallengeBeat = $derived(() => {
		if (!personalChallenge || !isCompleted || timeTaken === undefined) {
			return null;
		}
		if (timeTaken < personalChallenge.time) {
			return {
				challengerUsername: personalChallenge.username,
				challengerTime: personalChallenge.time,
			};
		}
		return null;
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

	// ─── Mod Debug: Instant Solve ────────────────────────────────────────────────
	// Testing-only feature for mods. Fills the entire grid with the correct solution.
	function handleModSolve(): void {
		if (!solution || isCompleted) return;

		// Parse solution string (e.g., "rbbrrbbrrbbrrbbb")
		const solutionColors: CellColor[] = solution.split("").map((char) => {
			if (char === "r") return "red";
			if (char === "b") return "blue";
			return null;
		});

		// Fill each cell with the solution color
		for (let row = 0; row < gridSize; row++) {
			for (let col = 0; col < gridSize; col++) {
				const index = row * gridSize + col;
				const cell = grid[row]?.[col];
				if (cell && !cell.locked && solutionColors[index]) {
					onCellChange(row, col, solutionColors[index]!);
				}
			}
		}
	}
</script>

<div class="h-full w-full flex flex-col overflow-hidden">
	<!-- Weekend Event banner — persistent across the in-game and completion
	     screens whenever the server reports an active event. Provides the
	     FOMO clock the game previously lacked (CoC builder timer, Subway
	     Surfers daily challenge timer). Tapping it has no action; it's a
	     status indicator, not a CTA. -->
	{#if weekendEvent?.active}
		<section
			class="flex-none w-full bg-amber-400 text-stone-950 shadow-[0_6px_22px_rgba(245,158,11,0.28)]"
			aria-label="{weekendEvent.name} announcement"
		>
			<div
				class="mx-auto flex w-full max-w-xl items-start gap-3 px-4 py-3 sm:items-center sm:justify-center"
			>
				<Megaphone
					class="h-7 w-7 shrink-0 text-stone-950 sm:h-6 sm:w-6"
					aria-hidden="true"
				/>
				<div
					class="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-center sm:gap-3"
				>
					<span class="text-lg font-black leading-tight sm:text-base">
						{weekendEvent.name} · {weekendEvent.multiplier}× coins
					</span>
					{#if weekendEvent.hoursLeft !== null && weekendEvent.hoursLeft > 0}
						<span
							class="text-sm font-bold leading-tight text-stone-800 sm:border-l sm:border-stone-900/25 sm:pl-3 sm:text-xs"
						>
							Ends in {weekendEvent.hoursLeft}h
						</span>
					{/if}
				</div>
			</div>
		</section>
	{/if}

	<!-- Personal challenge banner — shown when user opens a challenge link -->
	{#if personalChallenge && showPersonalChallengeBanner && !isCompleted}
		<PersonalChallengeBanner
			challenge={personalChallenge}
			onDismiss={() => (showPersonalChallengeBanner = false)}
		/>
	{/if}

	<!-- Streak and coins sit above the puzzle as one centered status row. -->
	{#if loginGate.showWallet && coins !== undefined}
		<CoinDisplay {coins} streak={streakData.currentStreak} />
	{/if}

	{#if sessionRun >= 2}
		<div class="flex-none flex justify-center px-3 pb-2">
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
		</div>
	{/if}

	<!-- Always-on progression strip — Subway Surfers / CoC home-screen
	     pattern. Surfaces streak calendar and season standing so meta-progression
	     is never hidden in modals. Only on the in-game view (hidden during
	     completion overlay & challenge posts to avoid clutter). -->
	{#if !isCompleted && !isChallenge && loginGate.showSeason && currentSeason?.isActive}
		<SeasonStrip
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
		<div class="flex-none flex justify-center px-3 pb-2">
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
		<div class="flex-none flex justify-center px-3 pb-2">
			<GridSizeSelector
				{gridSize}
				onGridSizeChange={handleGridSizeSelect}
			/>
		</div>
	{/if}

	<!-- Main game area -->
	<main
		class="flex-1 min-h-0 flex items-center justify-center relative overflow-hidden px-3 pb-2"
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
		<div class="flex-1 flex justify-center">
			{#if isMod && !isCompleted}
				<button
					onclick={handleModSolve}
					class="px-3 py-1.5 text-xs font-bold rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300 hover:bg-purple-500/30 active:scale-95 transition-all"
				>
					⚡ Solve
				</button>
			{/if}
		</div>
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
	{hasSubscribed}
	{postId}
	{gridSize}
	{username}
	personalChallengeBeat={personalChallengeBeat()}
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
	confirmLabel="Challenge"
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
