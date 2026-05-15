<script lang="ts">
	import type {
		Grid,
		CellColor,
		GameState,
		NextChallengeResponse,
		StreakData,
		ShareResponse,
		CoinReward,
		GridSizeResponse,
	} from "../shared/types";
	import type { EngagementCompletionData } from "../shared/engagement-types";
	import type { SeasonInfo } from "../shared/growth-types";
	import GameView from "./views/GameView.svelte";
	import TutorialView from "./views/TutorialView.svelte";
	import FirstScreen from "./components/FirstScreen.svelte";
	import ShopModal from "./components/ShopModal.svelte";
	import AnalyticsDashboard from "./components/AnalyticsDashboard.svelte";
	import { deserializeGrid } from "./lib/utils";
	import { isGridComplete } from "./lib/validation";
	import {
		mistakeCount,
		onCellChange,
		onPuzzleComplete,
		resetMistakes,
		setPuzzleData,
	} from "./stores/mistakes";
	import { hydrateFromServer, resetHints } from "./stores/hints";
	import { fireOnce, resetLatch } from "./stores/first-action";

	type EconomyResponse = {
		coins: number;
		totalCoins: number;
		totalSolves: number;
		speedSolves: number;
		equippedTitle: string;
		ownedTitles: string[];
		dailyFirstSolve: string | null;
	};

	type View = "game" | "tutorial" | "first-screen" | "error";

	const PLACEHOLDER_COLORS = "brbbrbbrbrbbrbrbbrbbrbbrbrbbrbrbbrbbrbbrbbrb";
	const PLACEHOLDER_NUMBERS = "----------------";

	let currentView = $state<View>("game");
	let grid = $state<Grid>(createPlaceholderGrid());
	let gridSize = $state(4);
	let isCompleted = $state(false);
	let errorMessage = $state("");
	let puzzleColors = $state(PLACEHOLDER_COLORS);
	let puzzleNumbers = $state(PLACEHOLDER_NUMBERS);
	let tutorialCompleted = $state(false);
	let startTime = $state(0);
	let streakData = $state<StreakData>({
		currentStreak: 0,
		longestStreak: 0,
		lastPlayedDate: null,
	});
	let timeTaken = $state(0);
	let skillLevel = $state(1);
	let showLevelUp = $state(false);
	let levelUpNewLevel = $state(1);
	let hasShared = $state(false);
	let hasChallenged = $state(false);
	let challengeUrl = $state<string | null>(null);
	let showShop = $state(false);
	let showAnalytics = $state(false);
	let coins = $state(0);
	let coinReward: CoinReward | undefined = $state(undefined);
	let username = $state<string | undefined>(undefined);
	let hasSubscribed = $state(false);
	let gridSizePreference = $state(4);
	let isChallenge = $state(false);
	let engagement = $state<EngagementCompletionData | undefined>(undefined);
	let puzzleNumber = $state(0);
	let communityStats = $state<{
		activePlayers: number;
		collectiveStreakDays: number;
	}>({ activePlayers: 0, collectiveStreakDays: 0 });
	let currentSeason = $state<SeasonInfo | undefined>(undefined);
	let seasonRank = $state<number | null>(null);
	let seasonPoints = $state(0);
	let isMod = $state(false);
	let notifyOptIn = $state(false);
	let hintsDismissed = $state<{
		numberConstraint: boolean;
		adjacencyViolation: boolean;
	}>({
		numberConstraint: false,
		adjacencyViolation: false,
	});

	function createPlaceholderGrid(): Grid {
		const result: Grid = [];
		let index = 0;
		for (let row = 0; row < 4; row++) {
			const rowCells = [];
			for (let col = 0; col < 4; col++) {
				const colorChar = PLACEHOLDER_COLORS[index];
				const color: CellColor =
					colorChar === "r"
						? "red"
						: colorChar === "b"
							? "blue"
							: null;
				rowCells.push({
					color,
					number: null,
					locked: false,
					isLoading: true,
				});
				index++;
			}
			result.push(rowCells);
		}
		return result;
	}

	$effect(() => {
		loadGame();
	});

	async function loadGame() {
		resetLatch();
		try {
			const response = await fetch("/api/game/state");
			if (!response.ok) throw new Error("Failed to load game");

			const data: GameState & {
				firstScreen?: {
					samplePuzzle: {
						colors: string;
						numbers: string;
						solution: string;
						difficulty: string;
						gridSize: number;
					};
					instruction: string;
					communityStats: {
						activePlayers: number;
						collectiveStreakDays: number;
					};
				};
			} = await response.json();

			puzzleColors = data.puzzle.colors;
			puzzleNumbers = data.puzzle.numbers;
			tutorialCompleted = data.tutorialCompleted;
			gridSize = data.puzzle.gridSize;
			skillLevel = data.skillLevel;
			gridSizePreference = data.gridSizePreference ?? 4;
			isChallenge = data.isChallenge ?? false;
			puzzleNumber = data.puzzleNumber ?? 0;
			isMod = data.isMod ?? false;

			// Hydrate notify opt-in and hints dismissed from GameState
			notifyOptIn = data.notifyOptIn ?? false;
			const serverHintsDismissed = data.hintsDismissed ?? {
				numberConstraint: false,
				adjacencyViolation: false,
			};
			hintsDismissed = serverHintsDismissed;
			hydrateFromServer(serverHintsDismissed);

			if (data.communityStats) {
				communityStats = data.communityStats;
			}
			if (data.currentSeason) {
				currentSeason = data.currentSeason;
			}

			// Update streak data
			if (data.streak) {
				streakData = data.streak;
			}
			if (data.username) {
				username = data.username;
			}

			grid = deserializeGrid(
				data.puzzle.colors,
				data.puzzle.numbers,
				data.puzzle.colors,
				data.puzzle.gridSize,
			).map((row) => row.map((cell) => ({ ...cell, isLoading: false })));
			isCompleted = false;
			hasShared = false;
			hasChallenged = false;
			challengeUrl = null;
			startTime = Date.now();
			coinReward = undefined;
			seasonRank = null;
			seasonPoints = 0;
			resetMistakes();
			setPuzzleData(data.puzzle.numbers, data.puzzle.gridSize);

			// Reqs 7.1, 7.2, 7.3: all users — new or returning — go directly to
			// GameView. tutorialCompleted is preserved for
			// compatibility but no longer gate the view.
			currentView = "game";

			// Load economy data
			loadEconomy();
			// Check subscription status
			checkSubscription();
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : "Failed to load game";
			currentView = "error";
		}
	}

	async function loadEconomy() {
		try {
			const response = await fetch("/api/economy");
			if (response.ok) {
				const data: EconomyResponse = await response.json();
				coins = data.coins;
			}
		} catch {
			// Non-critical, use defaults
		}
	}

	async function checkSubscription() {
		try {
			const response = await fetch("/api/subscribe/status");
			if (response.ok) {
				const data = await response.json();
				hasSubscribed = data.subscribed;
			}
		} catch {
			// Non-critical
		}
	}

	async function handleSubscribe() {
		if (hasSubscribed) return;
		try {
			const response = await fetch("/api/subscribe", { method: "POST" });
			if (response.ok) {
				hasSubscribed = true;
			}
		} catch {
			// Non-critical
		}
	}

	/**
	 * Handle cell color change during gameplay (purely client-side).
	 */
	function handleCellChange(row: number, col: number, color: CellColor) {
		const gridRow = grid[row];
		if (!gridRow) return;
		const cell = gridRow[col];
		if (!cell) return;
		if (cell.locked) return;

		// Track mistakes: check previous cell when moving to a new one
		onCellChange(row, col, color, grid, gridSize);

		// Fire first-action POST exactly once per session (fire-and-forget)
		void fireOnce("");

		// Update grid immutably to ensure Svelte reactivity
		grid = grid.map((r, ri) =>
			ri === row
				? r.map((c, ci) =>
						ci === col
							? { color, number: c.number, locked: c.locked }
							: c,
					)
				: r,
		);

		// Check completion client-side using full constraint validation
		if (isGridComplete(grid, gridSize)) {
			isCompleted = true;
			timeTaken = Math.round((Date.now() - startTime) / 1000);
			// Check last active cell before reporting
			onPuzzleComplete(grid, gridSize);
			reportCompletion(timeTaken);
		}
	}

	/**
	 * Report puzzle completion to server (non-critical).
	 */
	async function reportCompletion(time: number) {
		try {
			const response = await fetch("/api/game/complete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					timeTaken: time,
					mistakes: $mistakeCount,
				}),
			});

			if (response.ok) {
				const data = await response.json();
				if (data.streak) {
					streakData = data.streak;
				}
				if (data.coinReward) {
					coinReward = data.coinReward;
					// Apply variable reward multiplier to displayed coins
					if (data.coinReward.multiplier) {
						const bonus =
							data.coinReward.base *
							(data.coinReward.multiplier - 1);
						coins += data.coinReward.total + bonus;
					} else {
						coins += data.coinReward.total;
					}
					// Apply mystery box coin reward
					if (data.coinReward.mysteryBox?.type === "coins") {
						coins += data.coinReward.mysteryBox.value;
					}
				}
				// Store engagement data for UI display
				if (data.engagement) {
					engagement = data.engagement as EngagementCompletionData;
				}
				// Level-up feedback
				if (
					data.newSkillLevel &&
					data.previousSkillLevel &&
					data.newSkillLevel > data.previousSkillLevel
				) {
					levelUpNewLevel = data.newSkillLevel;
					skillLevel = data.newSkillLevel;
					showLevelUp = true;
					setTimeout(() => {
						showLevelUp = false;
					}, 3500);
				}
				// Season rank and points from completion response
				if (data.seasonRank !== undefined) {
					seasonRank = data.seasonRank;
				}
				if (data.seasonPoints !== undefined) {
					seasonPoints = data.seasonPoints;
				}
			}
		} catch {
			// Non-critical, continue anyway
		}
	}

	/**
	 * Handle share to comments.
	 */
	async function handleShare() {
		if (hasShared) return;

		try {
			const response = await fetch("/api/game/share", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					timeTaken,
					streak: streakData.currentStreak,
					puzzleColors,
					gridSize,
					skillLevel,
					mistakes: $mistakeCount,
				}),
			});

			if (response.ok) {
				const data: ShareResponse = await response.json();
				if (data.shared) {
					hasShared = true;
				}
			}
		} catch {
			// Non-critical error
		}
	}

	/**
	 * Handle challenge post creation.
	 */
	async function handleChallenge() {
		if (hasChallenged) return;
		try {
			const response = await fetch("/api/game/challenge", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					timeTaken,
					skillLevel,
					mistakes: $mistakeCount,
				}),
			});
			if (response.ok) {
				const data = await response.json();
				if (data.success) {
					hasChallenged = true;
					challengeUrl = data.postUrl ?? null;
				}
			}
		} catch {
			// Non-critical
		}
	}

	/**
	 * Handle "Next Challenge" button.
	 */
	async function handleNextChallenge() {
		hasChallenged = false;
		challengeUrl = null;
		resetLatch();
		resetHints();
		try {
			const timeSpent = Math.round((Date.now() - startTime) / 1000);
			const response = await fetch("/api/game/next-challenge", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ timeSpent }),
			});
			if (!response.ok) throw new Error("Failed to get next challenge");

			const data: NextChallengeResponse = await response.json();

			puzzleColors = data.puzzle.colors;
			puzzleNumbers = data.puzzle.numbers;
			gridSize = data.puzzle.gridSize;
			skillLevel = data.skillLevel;
			grid = deserializeGrid(
				data.puzzle.colors,
				data.puzzle.numbers,
				data.puzzle.colors,
				data.puzzle.gridSize,
			).map((row) => row.map((cell) => ({ ...cell, isLoading: false })));
			isCompleted = false;
			startTime = Date.now();
			resetMistakes();
			setPuzzleData(data.puzzle.numbers, data.puzzle.gridSize);
		} catch (error) {
			errorMessage =
				error instanceof Error
					? error.message
					: "Failed to load next challenge";
			currentView = "error";
		}
	}
	function handleRestart() {
		hasChallenged = false;
		challengeUrl = null;
		resetLatch();
		resetHints();
		grid = deserializeGrid(
			puzzleColors,
			puzzleNumbers,
			puzzleColors,
			gridSize,
		);
		isCompleted = false;
		startTime = Date.now();
		resetMistakes();
		setPuzzleData(puzzleNumbers, gridSize);
	}

	/**
	 * Handle grid size selection change.
	 * Calls POST /api/game/grid-size, updates puzzle state from response.
	 * Reverts to previous size on failure (non-disruptive).
	 */
	async function handleGridSizeChange(newSize: number) {
		const previousSize = gridSizePreference;
		gridSizePreference = newSize;
		resetLatch();
		resetHints();

		try {
			const response = await fetch("/api/game/grid-size", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ gridSize: newSize }),
			});

			if (!response.ok) throw new Error("Failed to set grid size");

			const data: GridSizeResponse = await response.json();

			puzzleColors = data.puzzle.colors;
			puzzleNumbers = data.puzzle.numbers;
			gridSize = data.puzzle.gridSize;
			skillLevel = data.skillLevel;
			gridSizePreference = data.gridSizePreference;
			grid = deserializeGrid(
				data.puzzle.colors,
				data.puzzle.numbers,
				data.puzzle.colors,
				data.puzzle.gridSize,
			).map((row) => row.map((cell) => ({ ...cell, isLoading: false })));
			isCompleted = false;
			hasShared = false;
			hasChallenged = false;
			challengeUrl = null;
			startTime = Date.now();
			coinReward = undefined;
			resetMistakes();
			setPuzzleData(data.puzzle.numbers, data.puzzle.gridSize);
		} catch {
			// Revert to previous size on failure (non-disruptive)
			gridSizePreference = previousSize;
		}
	}

	/**
	 * Handle tutorial completion.
	 */
	async function handleTutorialComplete() {
		try {
			await fetch("/api/game/tutorial-complete", { method: "POST" });
		} catch {
			// Non-critical, continue anyway
		}

		tutorialCompleted = true;
		// Req 7.1: always go to GameView after tutorial — no FirstScreen gate.
		currentView = "game";
	}

	/**
	 * Handle first-screen "Play" CTA — transition directly to the puzzle.
	 */
	function handleFirstScreenPlay() {
		currentView = "game";
		startTime = Date.now();
	}
</script>

<div class="h-full w-full overflow-hidden bg-theme-bg-primary">
	{#if currentView === "error"}
		<div
			class="h-full w-full flex flex-col items-center justify-center p-8"
		>
			<p class="text-xl text-red-400 mb-4">Error: {errorMessage}</p>
			<p class="text-sm text-theme-text-muted mb-6">
				Check your connection and try again
			</p>
			<button
				onclick={loadGame}
				class="px-6 py-2 bg-theme-text-primary text-theme-bg-primary rounded-lg hover:opacity-90"
			>
				Retry
			</button>
		</div>
	{:else if currentView === "tutorial"}
		<TutorialView
			onComplete={handleTutorialComplete}
			isReplay={tutorialCompleted}
		/>
	{:else if currentView === "first-screen"}
		<FirstScreen
			{puzzleNumber}
			{communityStats}
			onPlay={handleFirstScreenPlay}
		/>
	{:else if currentView === "game"}
		{@const gameProps = {
			grid,
			gridSize,
			isCompleted,
			streakData,
			hasShared,
			hasChallenged,
			challengeUrl,
			coins,
			timeTaken,
			mistakes: $mistakeCount,
			hasSubscribed,
			isChallenge,
			onCellChange: handleCellChange,
			onNextChallenge: handleNextChallenge,
			onRestart: handleRestart,
			onShare: handleShare,
			onChallenge: handleChallenge,
			onOpenShop: () => (showShop = true),
			onOpenAnalytics: () => (showAnalytics = true),
			isMod,
			onSubscribe: handleSubscribe,
			onGridSizeChange: handleGridSizeChange,
			puzzleColors,
			skillLevel,
			puzzleNumber,
			seasonRank,
			seasonPoints,
			currentSeason,
			notifyOptIn,
			hintsDismissed,
			...(username !== undefined && { username }),
			...(engagement !== undefined && { engagement }),
		}}
		{#if coinReward}
			<GameView {...gameProps} {coinReward} />
		{:else}
			<GameView {...gameProps} />
		{/if}
	{/if}
</div>

<ShopModal isOpen={showShop} onClose={() => (showShop = false)} />
<AnalyticsDashboard
	isOpen={showAnalytics}
	onClose={() => (showAnalytics = false)}
/>

{#if showLevelUp}
	<div class="level-up-overlay" role="status" aria-live="polite">
		<div class="level-up-card">
			<div class="level-up-icon">⬆️</div>
			<div class="level-up-title">Level Up!</div>
			<div class="level-up-subtitle">
				You're now <strong>Level {levelUpNewLevel}</strong>
			</div>
		</div>
	</div>
{/if}

<style>
	.level-up-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		pointer-events: none;
		animation: fadeInOut 3.5s ease forwards;
	}
	.level-up-card {
		background: linear-gradient(135deg, #1e3a5f, #2d6a4f);
		border: 2px solid #10b981;
		border-radius: 1rem;
		padding: 2rem 3rem;
		text-align: center;
		box-shadow: 0 0 40px rgba(16, 185, 129, 0.4);
	}
	.level-up-icon {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
	}
	.level-up-title {
		font-size: 1.75rem;
		font-weight: bold;
		color: #10b981;
	}
	.level-up-subtitle {
		font-size: 1.1rem;
		color: #d1fae5;
		margin-top: 0.25rem;
	}
	@keyframes fadeInOut {
		0% {
			opacity: 0;
			transform: scale(0.8);
		}
		15% {
			opacity: 1;
			transform: scale(1);
		}
		75% {
			opacity: 1;
			transform: scale(1);
		}
		100% {
			opacity: 0;
			transform: scale(0.95);
		}
	}
</style>
