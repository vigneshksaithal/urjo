<script lang="ts">
	import { navigateTo, showLoginPrompt, showToast } from "@devvit/web/client";
	import type { CellColor, Grid, StreakData } from "../../shared/types";
	import type { EngagementCompletionData } from "../../shared/engagement-types";
	import type { SeasonInfo } from "../../shared/growth-types";
	import type { PersonalChallengeData } from "../../shared/social-types";
	import { validateGrid } from "../lib/validation";
	import { computeBoardSize } from "../lib/board-layout";
	import { fireOnce } from "../stores/first-action";
	import { getLoginGate, LOGIN_CTA } from "../lib/login-gate";
	import ConfettiEffect from "../components/ConfettiEffect.svelte";
	import GameBoard from "../components/GameBoard.svelte";
	import LeaderboardModal from "../components/LeaderboardModal.svelte";
	import GridSizeSelector from "../components/GridSizeSelector.svelte";
	import AchievementsPanel from "../components/AchievementsPanel.svelte";
	import StreakMilestoneOverlay from "../components/StreakMilestoneOverlay.svelte";

	import TutorialView from "../views/TutorialView.svelte";
	import ModPreviewPanel from "../components/ModPreviewPanel.svelte";
	import ConfirmDialog from "../components/ConfirmDialog.svelte";
	import CompletionOverlay from "../components/CompletionOverlay.svelte";
	import LevelPathOverlay from "../components/LevelPathOverlay.svelte";
	import PersonalChallengeBanner from "../components/PersonalChallengeBanner.svelte";
	import SettingsSheet from "../components/SettingsSheet.svelte";
	import Flame from "lucide-svelte/icons/flame";
	import Megaphone from "lucide-svelte/icons/megaphone";
	import Settings from "lucide-svelte/icons/settings";
	import Timer from "lucide-svelte/icons/timer";

	// ─── Grouped Props Types ─────────────────────────────────────────────────────
	// Props are grouped by domain for better API design, type safety, and testing.
	// See CODE_REVIEW_GAMEVIEW.md for rationale.

	type GameProps = {
		grid: Grid;
		gridSize: number;
		isCompleted: boolean;
		timeTaken?: number;
		liveElapsedSeconds?: number;
		mistakes?: number;
		solution?: string;
		puzzleColors?: string;
		puzzleNumber?: number;
	};

	type ProgressionProps = {
		coins?: number;
		streakData: StreakData;
		skillLevel?: number;
		pathLevel?: number;
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
		challengerInfo?: {
			username: string;
			avatarUrl?: string;
			targetSeconds: number;
		};
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
		onChallenge: (customTitle?: string) => void;
		onOpenAnalytics?: () => void;
		onGridSizeChange?: (size: number) => void;
		onEngagementDismissed?: () => void;
	};

	type OnboardingOverlay = {
		activePlayers: number;
		targetToBeat?: { seconds: number; username?: string };
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
			/** Variant C: show dismissible info overlay on top of the game board. */
			showOnboardingOverlay?: boolean;
			onboardingOverlay?: OnboardingOverlay;
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
		onOpenAnalytics,
		isMod = false,
		timeTaken,
		liveElapsedSeconds = 0,
		mistakes = 0,
		username,
		isLoggedIn = true,
		isChallenge = false,
		onGridSizeChange,
		engagement,
		puzzleColors,
		skillLevel = 1,
		pathLevel = 1,
		puzzleNumber = 0,
		notifyOptIn = false,
		postId,
		challengePromptEligible = false,
		weekendEvent = undefined,
		// hintsDismissed is accepted for forward-compat; wired in task 13.3
		hintsDismissed: _hintsDismissed = {
			numberConstraint: false,
			adjacencyViolation: false,
		},
		solution = "",
		personalChallenge = null,
		challengerInfo = undefined,
		showOnboardingOverlay = false,
		onboardingOverlay = undefined,
	}: Props = $props();

	let showLeaderboard = $state(false);
	let showSettings = $state(false);

	// Variant C: onboarding overlay — auto-dismisses after 3 s.
	// Also dismissed immediately by App.svelte on the first cell change.
	let overlayVisible = $state(false);
	$effect(() => {
		if (!showOnboardingOverlay) {
			overlayVisible = false;
			return;
		}
		overlayVisible = true;
		const timer = setTimeout(() => {
			overlayVisible = false;
		}, 3000);
		return () => clearTimeout(timer);
	});
	let showModPreview = $state(false);
	let showVictoryCommentConfirm = $state(false);
	let showLevelPath = $state(false);
	let commentingVictory = $state(false);
	let hasCommentedVictory = $state(false);
	let dismissedMilestoneKey = $state<string | null>(null);
	let showOptInTutorial = $state(false);
	let showAchievements = $state(false);
	// Personal challenge banner - dismissed when user clicks X
	let showPersonalChallengeBanner = $state(true);

	$effect(() => {
		if (!isCompleted) {
			showLevelPath = false;
		}
	});

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
	const milestoneKey = $derived(
		engagement?.streakMilestone && currentCompletionKey
			? `${currentCompletionKey}:milestone`
			: null,
	);
	const showStreakMilestoneOverlay = $derived(
		milestoneKey !== null && dismissedMilestoneKey !== milestoneKey,
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

	function requestChallenge(customTitle?: string): void {
		onChallenge(customTitle);
	}

	function buildChallengePostTitle(): string {
		const seconds = Math.max(timeTaken ?? 0, 1);
		const perfectTag = mistakes === 0 ? " (zero mistakes)" : "";
		const challenger = username ? ` from u/${username}` : "";
		return `Urjo ${gridSize}×${gridSize} challenge${challenger}: ${seconds}s target${perfectTag}`;
	}

	function handlePrimaryCta(): void {
		showLevelPath = true;
	}

	function handleLevelSelect(): void {
		void fireOnce(postId ?? "", "next-puzzle");
		showLevelPath = false;
		hasCommentedVictory = false;
		onNextChallenge();
	}

	async function confirmVictoryComment(): Promise<void> {
		if (commentingVictory || hasCommentedVictory) return;
		if (!puzzleNumber) {
			showToast("Puzzle not ready yet — try again in a moment.");
			return;
		}
		void fireOnce(postId ?? "", "result-comment");
		commentingVictory = true;

		try {
			const response = await fetch("/api/game/result-comment", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					puzzleNumber,
					gridSize,
					skillLevel,
					timeTaken: Math.max(timeTaken ?? 0, 1),
					mistakes,
					streak: streakData.currentStreak,
					colorGrid: buildVictoryColorGrid(
						puzzleColors ?? "",
						gridSize,
					),
				}),
			});

			if (!response.ok) {
				const data = await response.json().catch(() => null);
				const message =
					data && typeof data === "object" && "error" in data
						? String(data.error)
						: "Failed to post victory comment";
				throw new Error(message);
			}

			hasCommentedVictory = true;
			showVictoryCommentConfirm = false;
			showToast("Victory commented!");
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to post victory comment",
			);
		} finally {
			commentingVictory = false;
		}
	}

	function openChallenge(): void {
		if (!challengeUrl) return;
		navigateTo(challengeUrl);
	}

	function handleGridSizeSelect(size: number): void {
		void fireOnce(postId ?? "", "grid-size");
		onGridSizeChange?.(size);
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

	function buildVictoryColorGrid(
		colors: string,
		size: number,
	): ("red" | "blue")[][] {
		if (colors.length < size * size) return [];
		const rows: ("red" | "blue")[][] = [];
		for (let row = 0; row < size; row++) {
			const cells: ("red" | "blue")[] = [];
			for (let col = 0; col < size; col++) {
				cells.push(colors[row * size + col] === "r" ? "red" : "blue");
			}
			rows.push(cells);
		}
		return rows;
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

	<!-- Unified top bar: streak + timer in a single pill -->
	{#if !isCompleted}
		<div class="flex w-full items-center justify-center px-1 pt-3 pb-3">
			<div
				class="flex items-center gap-5 rounded-full bg-theme-bg-secondary/85 border border-theme-border/70 px-4 py-2 shadow-sm"
				aria-label="{liveElapsedSeconds ?? 0} seconds elapsed"
			>
				{#if loginGate.showWallet}
					<div class="flex items-center gap-2">
						<Flame class="size-6 text-[#E54E3E] fill-[#E54E3E]" />
						<span
							class="text-base font-medium leading-none text-theme-text-primary"
							>{streakData.currentStreak}
							{streakData.currentStreak === 1
								? "Day"
								: "Days"}</span
						>
					</div>
				{/if}
				<div class="flex items-center gap-2">
					<Timer class="size-6 text-amber-400" />
					<span
						class="text-base font-medium leading-none text-theme-text-secondary"
					>
						{liveElapsedSeconds ?? 0}s
					</span>
				</div>
			</div>
		</div>
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

	<!-- Challenger strip — shown below the board on challenge posts -->
	{#if isChallenge && challengerInfo && !isCompleted}
		<div class="flex-none flex items-center justify-center gap-3 px-4 pb-2">
			{#if challengerInfo.avatarUrl}
				<img
					src={challengerInfo.avatarUrl}
					alt={challengerInfo.username}
					class="w-10 h-10 rounded-full object-cover shrink-0"
				/>
			{:else}
				<div
					class="w-10 h-10 rounded-full bg-theme-hover flex items-center justify-center shrink-0 text-xl leading-none"
					aria-hidden="true"
				>
					👤
				</div>
			{/if}
			<p class="text-sm leading-tight text-theme-text-secondary">
				Beat {challengerInfo.username}'s {challengerInfo.targetSeconds}s
			</p>
		</div>
	{/if}

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

<!-- Variant C onboarding overlay — pointer-events: none so all game taps pass
     through unblocked. Auto-dismisses after 3 s; App.svelte also sets
     showOnboardingOverlay=false on the first cell change. -->
{#if showOnboardingOverlay && onboardingOverlay && overlayVisible}
	<div
		class="pointer-events-none fixed inset-0 z-20 flex items-start justify-center pt-10 transition-opacity duration-300"
		aria-hidden="true"
	>
		<div
			class="mx-4 flex flex-col items-center gap-0.5 rounded-2xl bg-theme-bg-primary/85 px-5 py-3.5 shadow-lg backdrop-blur-sm"
		>
			<p class="text-sm font-bold text-theme-text-primary">
				{#if puzzleNumber > 0}Puzzle #{puzzleNumber} ·{/if}
				{#if onboardingOverlay.activePlayers > 0}
					{onboardingOverlay.activePlayers.toLocaleString()} played today
				{/if}
			</p>
			{#if onboardingOverlay.targetToBeat}
				<p class="text-xs text-theme-text-muted">
					Beat {onboardingOverlay.targetToBeat.username ??
						"the record"}'s {onboardingOverlay.targetToBeat
						.seconds}s
				</p>
			{:else}
				<p class="text-xs text-theme-text-muted">
					Tap any cell to start
				</p>
			{/if}
		</div>
	</div>
{/if}

<!-- Completion overlay -->
<CompletionOverlay
	{isCompleted}
	timeTaken={timeTaken ?? 0}
	{coins}
	{loginGate}
	onContinue={handlePrimaryCta}
	onCommentVictory={() => (showVictoryCommentConfirm = true)}
	{hasCommentedVictory}
	{commentingVictory}
	onChallenge={requestChallenge}
	{hasChallenged}
	defaultChallengeTitle={buildChallengePostTitle()}
	{puzzleColors}
	{gridSize}
	{puzzleNumber}
	personalChallengeBeat={personalChallengeBeat()}
/>

{#if showLevelPath}
	<LevelPathOverlay
		isOpen={true}
		currentLevel={pathLevel}
		streak={streakData.currentStreak}
		{coins}
		{puzzleNumber}
		onLevelSelect={handleLevelSelect}
	/>
{/if}

<!-- Confetti effect -->{#if showConfetti}
	<ConfettiEffect />
{/if}

<!-- Victory comment confirmation dialog -->
<ConfirmDialog
	isOpen={showVictoryCommentConfirm}
	title="Comment Your Victory?"
	message="Posts your victory publicly{username
		? ` as u/${username}`
		: ' as your Reddit account'} as a reply to the pinned comment on this post. Others will see it."
	confirmLabel={commentingVictory ? "Commenting..." : "Comment"}
	onConfirm={confirmVictoryComment}
	onCancel={() => (showVictoryCommentConfirm = false)}
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

<!-- Streak milestone overlay -->
{#if showStreakMilestoneOverlay && engagement?.streakMilestone}
	<StreakMilestoneOverlay
		threshold={engagement.streakMilestone.threshold}
		bonus={engagement.streakMilestone.bonus}
		onDismiss={dismissMilestone}
	/>
{/if}

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
