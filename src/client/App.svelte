<script lang="ts">
	import type {
		Grid,
		CellColor,
		GameState,
		NextChallengeResponse,
		StreakData,
		ShareResponse,
		UGCPuzzle,
	} from "../shared/types";
	import GameView from "./views/GameView.svelte";
	import TutorialView from "./views/TutorialView.svelte";
	import ShopModal from "./components/ShopModal.svelte";
	import BuilderModal from "./components/BuilderModal.svelte";
	import CommunityModal from "./components/CommunityModal.svelte";
	import { deserializeGrid, serializeGrid } from "./lib/utils";

	type CoinReward = {
		base: number;
		streakBonus: number;
		speedBonus: number;
		dailyBonus: number;
		total: number;
	};

	type EconomyResponse = {
		coins: number;
		totalCoins: number;
		totalSolves: number;
		speedSolves: number;
		equippedTitle: string;
		ownedTitles: string[];
		dailyFirstSolve: string | null;
	};

	type View = "game" | "tutorial" | "error";

	const PLACEHOLDER_COLORS = "brbbrbbrbrbbrbrbbrbbrbbrbrbbrbrbbrbbrbbrbbrb";
	const PLACEHOLDER_NUMBERS = "----------------";

	let currentView = $state<View>("game");
	let grid = $state<Grid>(createPlaceholderGrid());
	let gridSize = $state(4);
	let isCompleted = $state(false);
	let errorMessage = $state("");
	let puzzleColors = $state(PLACEHOLDER_COLORS);
	let puzzleNumbers = $state(PLACEHOLDER_NUMBERS);
	let puzzleSolution = $state("");
	let tutorialCompleted = $state(false);
	let startTime = $state(0);
	let streakData = $state<StreakData>({
		currentStreak: 0,
		longestStreak: 0,
		lastPlayedDate: null,
	});
	let timeTaken = $state(0);
	let hasShared = $state(false);
	let showShop = $state(false);
	let showBuilder = $state(false);
	let showCommunity = $state(false);
	let coins = $state(0);
	let coinReward: CoinReward | undefined = $state(undefined);

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
		try {
			const response = await fetch("/api/game/state");
			if (!response.ok) throw new Error("Failed to load game");

			const data: GameState = await response.json();

			puzzleColors = data.puzzle.colors;
			puzzleNumbers = data.puzzle.numbers;
			puzzleSolution = data.puzzle.solution;
			tutorialCompleted = data.tutorialCompleted;
			gridSize = data.puzzle.gridSize;

			// Update streak data
			if (data.streak) {
				streakData = data.streak;
			}

			grid = deserializeGrid(
				data.puzzle.colors,
				data.puzzle.numbers,
				data.puzzle.colors,
				data.puzzle.gridSize,
			).map((row) => row.map((cell) => ({ ...cell, isLoading: false })));
			isCompleted = false;
			hasShared = false;
			startTime = Date.now();
			coinReward = undefined;

			if (!data.tutorialCompleted) {
				currentView = "tutorial";
			}

			// Load economy data
			loadEconomy();
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

	/**
	 * Handle cell color change during gameplay (purely client-side).
	 */
	function handleCellChange(row: number, col: number, color: CellColor) {
		const gridRow = grid[row];
		if (!gridRow) return;
		const cell = gridRow[col];
		if (!cell) return;
		if (cell.locked) return;

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

		// Check completion client-side
		const boardString = serializeGrid(grid);
		if (boardString === puzzleSolution) {
			isCompleted = true;
			timeTaken = Math.round((Date.now() - startTime) / 1000);
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
				body: JSON.stringify({ timeTaken: time }),
			});

			if (response.ok) {
				const data = await response.json();
				if (data.streak) {
					streakData = data.streak;
				}
				if (data.coinReward) {
					coinReward = data.coinReward;
					coins += data.coinReward.total;
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
	 * Handle "Next Challenge" button.
	 */
	async function handleNextChallenge() {
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
			puzzleSolution = data.puzzle.solution;
			gridSize = data.puzzle.gridSize;
			grid = deserializeGrid(
				data.puzzle.colors,
				data.puzzle.numbers,
				data.puzzle.colors,
				data.puzzle.gridSize,
			).map((row) => row.map((cell) => ({ ...cell, isLoading: false })));
			isCompleted = false;
			startTime = Date.now();
		} catch (error) {
			errorMessage =
				error instanceof Error
					? error.message
					: "Failed to load next challenge";
			currentView = "error";
		}
	}

	/**
	 * Handle "Restart" button (purely client-side).
	 */
	function handleRestart() {
		grid = deserializeGrid(
			puzzleColors,
			puzzleNumbers,
			puzzleColors,
			gridSize,
		);
		isCompleted = false;
		startTime = Date.now();
	}

	/**
	 * Play a community puzzle.
	 */
	function handlePlayCommunity(puzzle: UGCPuzzle) {
		showCommunity = false;
		puzzleColors = puzzle.colors;
		puzzleNumbers = puzzle.numbers;
		puzzleSolution = puzzle.solution;
		gridSize = puzzle.gridSize;
		grid = deserializeGrid(
			puzzle.colors,
			puzzle.numbers,
			puzzle.colors,
			puzzle.gridSize,
		).map((row) => row.map((cell) => ({ ...cell, isLoading: false })));
		isCompleted = false;
		hasShared = false;
		startTime = Date.now();
		coinReward = undefined;
		currentView = "game";

		// Record solve asynchronously when completed
		// (handled via the existing reportCompletion + a separate call below)
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
		currentView = "game";
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
	{:else if currentView === "game"}
		{@const gameProps = {
			grid,
			gridSize,
			isCompleted,
			streakData,
			hasShared,
			coins,
			timeTaken,
			onCellChange: handleCellChange,
			onNextChallenge: handleNextChallenge,
			onRestart: handleRestart,
			onShare: handleShare,
			onOpenShop: () => (showShop = true),
			onOpenBuilder: () => (showBuilder = true),
			onOpenCommunity: () => (showCommunity = true),
		}}
		{#if coinReward}
			<GameView {...gameProps} {coinReward} />
		{:else}
			<GameView {...gameProps} />
		{/if}
	{/if}
</div>

<ShopModal isOpen={showShop} onClose={() => (showShop = false)} />

{#if showBuilder}
	<BuilderModal
		onClose={() => (showBuilder = false)}
		onPublished={() => {
			showBuilder = false;
			loadEconomy();
		}}
	/>
{/if}

<CommunityModal
	isOpen={showCommunity}
	onClose={() => (showCommunity = false)}
	onPlay={handlePlayCommunity}
/>
