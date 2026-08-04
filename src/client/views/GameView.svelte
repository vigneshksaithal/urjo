<script lang="ts">
	import { navigateTo, showLoginPrompt, showToast } from "@devvit/web/client";
	import type { CellColor, CoinReward, Grid, StreakData } from "../../shared/types";
	import type { EngagementCompletionData } from "../../shared/engagement-types";
	import type { SeasonInfo } from "../../shared/growth-types";
	import type { PersonalChallengeData } from "../../shared/social-types";
	import { validateGrid } from "../lib/validation";
	import { computeBoardSize } from "../lib/board-layout";
	import { shouldCompactInlineBoard } from "../lib/inline-layout";
	import { fireOnce } from "../stores/first-action";
	import { getLoginGate, LOGIN_CTA } from "../lib/login-gate";
	import { getEarnedCoins } from "../lib/completion-reward";
	import { serializeGrid } from "../lib/utils";
	import ConfettiEffect from "../components/ConfettiEffect.svelte";
	import GameBoard from "../components/GameBoard.svelte";
	import LeaderboardModal from "../components/LeaderboardModal.svelte";
	import AchievementsPanel from "../components/AchievementsPanel.svelte";
	import StreakMilestoneOverlay from "../components/StreakMilestoneOverlay.svelte";

	import TutorialView from "../views/TutorialView.svelte";
	import ModPreviewPanel from "../components/ModPreviewPanel.svelte";
	import CompletionOverlay from "../components/CompletionOverlay.svelte";
	import LevelPathOverlay from "../components/LevelPathOverlay.svelte";
	import PersonalChallengeBanner from "../components/PersonalChallengeBanner.svelte";
	import SettingsSheet from "../components/SettingsSheet.svelte";
	import ProgressionHub from "../components/ProgressionHub.svelte";
	import UrjoBlitz from "../components/UrjoBlitz.svelte";
	import Flame from "lucide-svelte/icons/flame";
	import Medal from "lucide-svelte/icons/medal";
	import Megaphone from "lucide-svelte/icons/megaphone";
	import Settings from "lucide-svelte/icons/settings";
	import Timer from "lucide-svelte/icons/timer";
	import Trophy from "lucide-svelte/icons/trophy";

	// ─── Grouped Props Types ─────────────────────────────────────────────────────
	// Props are grouped by domain for better API design, type safety, and testing.
	// See CODE_REVIEW_GAMEVIEW.md for rationale.

	type GameProps = {
		grid: Grid;
		gridSize: number;
		isCompleted: boolean;
		completionPending?: boolean;
		completionVerified?: boolean;
		completionId?: string | null;
		timeTaken?: number;
		liveElapsedSeconds?: number;
		puzzleColors?: string;
		puzzleNumber?: number;
	};

	type ProgressionProps = {
		coins?: number;
		coinReward?: CoinReward;
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
		allowsGridSizeChange?: boolean;
		hasChallenged: boolean;
		challengeUrl: string | null;
		sharingChallenge?: boolean;
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
		weekendBonusCoins?: number;
	};

	type SessionProps = {
		sessionRun?: number;
		sessionRunBonusCoins?: number;
	};

	type UserProps = {
		username?: string;
		isLoggedIn?: boolean;
		isMod?: boolean;
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
		onShareChallenge: () => void;
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
		completionPending = false,
		completionVerified = false,
		completionId = null,
		onNextChallenge,
		streakData,
		hasChallenged,
		challengeUrl,
		sharingChallenge = false,
		onChallenge,
		onShareChallenge,
		coins,
		coinReward = undefined,
		onOpenAnalytics,
		isMod = false,
		timeTaken,
		liveElapsedSeconds = 0,
		isLoggedIn = true,
		isChallenge = false,
		allowsGridSizeChange = true,
		onGridSizeChange,
		engagement,
		puzzleColors,
		pathLevel = 1,
		puzzleNumber = 0,
		postId,
		weekendEvent = undefined,
		weekendBonusCoins = 0,
		sessionRunBonusCoins = 0,
		seasonRank = null,
		// hintsDismissed is accepted for forward-compat; wired in task 13.3
		hintsDismissed: _hintsDismissed = {
			numberConstraint: false,
			adjacencyViolation: false,
		},
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
	let showLevelPath = $state(false);
	let commentingVictory = $state(false);
	let dismissedMilestoneKey = $state<string | null>(null);
	let showOptInTutorial = $state(false);
	let showAchievements = $state(false);
	let modSolvePending = $state(false);
	// Personal challenge banner - dismissed when user clicks X
	let showPersonalChallengeBanner = $state(true);

	$effect(() => {
		if (!isCompleted) {
			showLevelPath = false;
		}
	});

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
	let gameHeight = $state(0);
	const boardSize = $derived(
		computeBoardSize(availableWidth, availableHeight),
	);
	const useCompactInlineBoard = $derived(
		shouldCompactInlineBoard(gridSize, gameHeight),
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
	const earnedCoins = $derived(
		getEarnedCoins({
			...(coinReward !== undefined && { coinReward }),
			sessionRunBonusCoins,
			weekendBonusCoins,
		}),
	);

	// Check if user beat a personal challenge (for completion overlay)
	const personalChallengeBeat = $derived(() => {
		if (
			!personalChallenge ||
			!isCompleted ||
			!completionVerified ||
			timeTaken === undefined
		) {
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

	function handlePrimaryCta(): void {
		showLevelPath = true;
	}

	function handleLevelSelect(): void {
		void fireOnce(postId ?? "", "next-puzzle");
		showLevelPath = false;
		onNextChallenge();
	}

	async function submitVictoryComment(commentMessage: string): Promise<void> {
		if (commentingVictory) return;
		if (completionId === null) {
			showToast("Finish a verified puzzle before commenting.");
			return;
		}
		void fireOnce(postId ?? "", "result-comment");
		commentingVictory = true;
		const normalizedCommentMessage = commentMessage.trim();

		try {
			const response = await fetch("/api/game/result-comment", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					completionId,
					commentMessage:
						normalizedCommentMessage.length > 0
							? normalizedCommentMessage
							: undefined,
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
	async function handleModSolve(): Promise<void> {
		if (!isMod || isCompleted || modSolvePending) return;
		modSolvePending = true;
		try {
			const response = await fetch("/api/game/mod-solution", { method: "POST" });
			const data: unknown = await response.json().catch(() => null);
			const solution = readModSolution(data);
			if (!response.ok || !solution || solution.length !== gridSize * gridSize) {
				throw new Error("Could not load the moderator solution");
			}
			for (let row = 0; row < gridSize; row++) {
				for (let col = 0; col < gridSize; col++) {
					const cell = grid[row]?.[col];
					if (!cell || cell.locked) continue;
					const color = solution[row * gridSize + col] === "r" ? "red" : "blue";
					onCellChange(row, col, color);
				}
			}
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Moderator solve failed");
		} finally {
			modSolvePending = false;
		}
	}

	function readModSolution(raw: unknown): string | null {
		if (!raw || typeof raw !== "object" || !("data" in raw)) return null;
		const data = raw.data;
		if (!data || typeof data !== "object" || !("solution" in data)) return null;
		return typeof data.solution === "string" && /^[rb]+$/.test(data.solution)
			? data.solution
			: null;
	}
</script>

<div
	class="h-full w-full flex flex-col overflow-hidden"
	bind:clientHeight={gameHeight}
>
	<!-- Weekend Event banner — persistent across the in-game and completion
	     screens whenever the server reports an active event. Provides the
	     FOMO clock the game previously lacked (CoC builder timer, Subway
	     Surfers daily challenge timer). Tapping it has no action; it's a
	     status indicator, not a CTA. -->
	{#if weekendEvent?.active && !useCompactInlineBoard}
		<section
			class="flex-none w-full bg-amber-400 text-stone-950 shadow-[0_6px_22px_rgba(245,158,11,0.28)]"
			aria-label="{weekendEvent.name} announcement"
		>
			<div
				class="mx-auto flex w-full max-w-xl items-center justify-center gap-2 px-3 py-2"
			>
				<Megaphone
					class="h-5 w-5 shrink-0 text-stone-950"
					aria-hidden="true"
				/>
				<div
					class="flex min-w-0 items-center justify-center gap-2"
				>
					<span class="truncate text-sm font-black leading-tight">
						{weekendEvent.name} · {weekendEvent.multiplier}× coins
					</span>
					{#if weekendEvent.hoursLeft !== null && weekendEvent.hoursLeft > 0}
						<span
							class="shrink-0 border-l border-stone-900/25 pl-2 text-xs font-bold leading-tight text-stone-800"
						>
							Ends in {weekendEvent.hoursLeft}h
						</span>
					{/if}
				</div>
			</div>
		</section>
	{/if}

	<!-- Personal challenge banner — shown when user opens a challenge link -->
	{#if personalChallenge && showPersonalChallengeBanner && !isCompleted && !useCompactInlineBoard}
		<PersonalChallengeBanner
			challenge={personalChallenge}
			onDismiss={() => (showPersonalChallengeBanner = false)}
		/>
	{/if}

	<!-- Unified top bar: streak + timer in a single pill -->
	{#if !isCompleted}
		<div class="flex w-full items-center justify-center px-1 py-2">
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
	{#if !isCompleted && loginGate.showLoginCta && !useCompactInlineBoard}
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

	{#if !isCompleted && useCompactInlineBoard && (personalChallenge || (isChallenge && challengerInfo) || weekendEvent?.active || loginGate.showLoginCta)}
		<div
			data-testid="compact-game-status"
			class="flex-none flex min-w-0 items-center justify-center px-3 pb-1.5 text-xs font-semibold text-theme-text-secondary"
		>
			{#if personalChallenge}
				<span class="truncate">⚔️ Beat {personalChallenge.username}'s {personalChallenge.time}s</span>
			{:else if isChallenge && challengerInfo}
				<span class="truncate">⚔️ Beat {challengerInfo.username}'s {challengerInfo.targetSeconds}s</span>
			{:else if weekendEvent?.active}
				<span class="truncate">{weekendEvent.emoji} {weekendEvent.name} · {weekendEvent.multiplier}× coins</span>
			{:else}
				<button
					onclick={handleLoginPrompt}
					class="rounded-full bg-urjo-blue/10 px-3 py-1 text-urjo-blue transition-all active:scale-95"
				>
					{LOGIN_CTA.button}
				</button>
			{/if}
		</div>
	{/if}

	<!-- Main game area -->
	<main
		class="flex-1 min-h-0 flex items-center justify-center relative overflow-hidden pb-2"
		class:px-1={gridSize >= 8}
		class:px-3={gridSize < 8}
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
	{#if isChallenge && challengerInfo && !isCompleted && !useCompactInlineBoard}
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
	{#if loginGate.showWallet}
		<div class="flex-none space-y-1 px-2 pb-1">
			<UrjoBlitz />
			<ProgressionHub />
		</div>
	{/if}

	<footer class="flex-none flex items-center justify-between gap-2 px-2 pb-1">
		<div class="flex items-center gap-1">
			{#if loginGate.showWallet}
				<button
					onclick={() => (showLeaderboard = true)}
					class="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-theme-text-muted transition-colors hover:bg-theme-hover"
					aria-label="Leaderboard"
				>
					<Trophy class="h-5 w-5" />
				</button>
				<button
					onclick={() => (showAchievements = true)}
					class="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-theme-text-muted transition-colors hover:bg-theme-hover"
					aria-label="Achievements"
				>
					<Medal class="h-5 w-5" />
				</button>
			{/if}
		</div>
		<div class="flex-1 flex justify-center">
			{#if isMod && !isCompleted}
				<button
					onclick={handleModSolve}
					disabled={modSolvePending}
					class="min-h-11 rounded-xl border border-purple-500/40 bg-purple-500/20 px-3 text-xs font-bold text-purple-300 transition-all hover:bg-purple-500/30 active:scale-95 disabled:cursor-wait disabled:opacity-60"
					aria-label="Solve puzzle for moderator testing"
				>
					{modSolvePending ? "Solving…" : "⚡ Solve"}
				</button>
			{/if}
		</div>
		<button
			onclick={() => (showSettings = true)}
			class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-theme-hover"
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
					Tap a dark dot to cycle colors
				</p>
			{/if}
		</div>
	</div>
{/if}

<!-- Completion overlay -->
<CompletionOverlay
	{isCompleted}
	{completionPending}
	{completionVerified}
	timeTaken={timeTaken ?? 0}
	{earnedCoins}
	{seasonRank}
	{pathLevel}
	streak={streakData.currentStreak}
	{loginGate}
	onContinue={handlePrimaryCta}
	onLogin={handleLoginPrompt}
	onCommentVictory={submitVictoryComment}
	{commentingVictory}
		onChallenge={requestChallenge}
		onOpenChallenge={openChallenge}
		{onShareChallenge}
		{sharingChallenge}
	{hasChallenged}
	{gridSize}
	{puzzleNumber}
	editorSeedSolution={serializeGrid(grid)}
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
	showProgression={loginGate.showWallet}
	onLeaderboard={() => (showLeaderboard = true)}
	onAchievements={() => (showAchievements = true)}
	{gridSize}
	allowsGridSizeChange={!isChallenge && allowsGridSizeChange}
	onGridSizeChange={handleGridSizeSelect}
	onTutorial={handleHelpTap}
	{...(onOpenAnalytics !== undefined ? { onOpenAnalytics } : {})}
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
