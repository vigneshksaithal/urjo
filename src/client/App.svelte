<script lang="ts">
	import { onMount } from "svelte";
	import {
		getShareData,
		showShareSheet,
		showToast,
	} from "@devvit/web/client";
	import type {
		Grid,
		CellColor,
		GameState,
		NextChallengeResponse,
		StreakData,
		CoinReward,
		GridSizeResponse,
		FirstScreenData,
		CompleteResponse,
		ChallengeResponse,
		OnboardingChoiceResponse,
	} from "../shared/types";
	import type { EngagementCompletionData } from "../shared/engagement-types";
	import type { SeasonInfo } from "../shared/growth-types";
	import type { PersonalChallengeData } from "../shared/social-types";
	import { validatePersonalChallengeData } from "../shared/social-types";
	import GameView from "./views/GameView.svelte";
	import WarmupChoice from "./components/WarmupChoice.svelte";
	import AnalyticsDashboard from "./components/AnalyticsDashboard.svelte";
	import { deserializeGrid, serializeGrid } from "./lib/utils";
	import { isGridComplete } from "./lib/validation";
	import { getCompletedSeconds, getElapsedSeconds } from "./lib/elapsed-time";
	import { getInitialView } from "./lib/initial-view";
	import {
		mistakeCount,
		onCellChange,
		onPuzzleComplete,
		resetMistakes,
	} from "./stores/mistakes";
	import { hydrateFromServer, resetHints } from "./stores/hints";
	import {
		fireOnce,
		resetLatch,
		setFirstActionContentId,
	} from "./stores/first-action";
	import { incrementSessionRun, getSessionRun } from "./stores/session-run";
	import {
		startHeartbeat,
		type HeartbeatHandle,
	} from "./lib/dwell-heartbeat";
	import {
		getSessionId,
		measurementHeaders,
		renewAttemptId,
		sessionHeaders,
	} from "./lib/session-id";
	import {
		writeLoggedOutMigration,
		readLoggedOutMigration,
		clearLoggedOutMigration,
	} from "./lib/logged-out-migration";
	import { urjoJourney } from "./lib/journeys";

	type EconomyResponse = {
		coins: number;
		totalCoins: number;
		totalSolves: number;
		speedSolves: number;
		equippedTitle: string;
		ownedTitles: string[];
		dailyFirstSolve: string | null;
	};

	type View = "game" | "error" | "warmup-choice";

	const PLACEHOLDER_COLORS = "brbbrbbrbrbbrbrbbrbbrbbrbrbbrbrbbrbbrbbrbbrb";
	const PLACEHOLDER_NUMBERS = "----------------";

	let currentView = $state<View>("game");
	let grid = $state<Grid>(createPlaceholderGrid());
	let gridSize = $state(4);
	let isCompleted = $state(false);
	let errorMessage = $state("");
	let puzzleColors = $state(PLACEHOLDER_COLORS);
	let puzzleNumbers = $state(PLACEHOLDER_NUMBERS);
	let startTime = $state(0);
	// The puzzle timer starts on the user's first cell touch (see
	// handleCellChange), not on load, so time spent reading the board before
	// engaging isn't counted. Reset to false whenever a new puzzle begins.
	let timerStarted = $state(false);
	let streakData = $state<StreakData>({
		currentStreak: 0,
		longestStreak: 0,
		lastPlayedDate: null,
	});
	let timeTaken = $state(0);
	let completionPending = $state(false);
	let completionVerified = $state(false);
	let liveElapsedSeconds = $state(0);
	let skillLevel = $state(1);
	let pathLevel = $state(1);
	let showLevelUp = $state(false);
	let levelUpNewLevel = $state(1);
	let hasChallenged = $state(false);
	let challengeUrl = $state<string | null>(null);
	let challengePostId = $state<`t3_${string}` | null>(null);
	let sharingChallenge = $state(false);
	let challengePromptEligible = $state(false);
	let showAnalytics = $state(false);
	let coins = $state(0);
	let coinReward: CoinReward | undefined = $state(undefined);
	let username = $state<string | undefined>(undefined);
	let isLoggedIn = $state(true);
	// Run-again loop state — persisted via sessionStorage in session-run store.
	let sessionRun = $state(getSessionRun());
	let sessionRunBonusCoins = $state(0);
	// Weekend Event payload — hydrated from /api/game/state on load and
	// refreshed on /api/game/complete. Drives the in-game banner + result
	// screen "weekend bonus" chip.
	let weekendEvent = $state<
		| {
				active: boolean;
				multiplier: number;
				name: string;
				emoji: string;
				endsAtMs: number | null;
				hoursLeft: number | null;
		  }
		| undefined
	>(undefined);
	let weekendBonusCoins = $state(0);
	// Always-on progression strip data — hydrated from /api/game/state.
	let seasonProgress = $state<
		{ rank: number | null; score: number } | undefined
	>(undefined);
	let gridSizePreference = $state(4);
	let isChallenge = $state(false);
	let allowsGridSizeChange = $state(true);
	let engagement = $state<EngagementCompletionData | undefined>(undefined);
	let puzzleNumber = $state(0);
	let currentSeason = $state<SeasonInfo | undefined>(undefined);
	let isFirstTimeUser = $state(false);
	let seasonRank = $state<number | null>(null);
	let seasonPoints = $state(0);
	let isMod = $state(false);
	let postId = $state<string | undefined>(undefined);
	let hintsDismissed = $state<{
		numberConstraint: boolean;
		adjacencyViolation: boolean;
	}>({
		numberConstraint: false,
		adjacencyViolation: false,
	});
	// Personal challenge data from deeplink share (getShareData)
	let personalChallenge = $state<PersonalChallengeData | null>(null);
	let challengerInfo = $state<GameState["challengerInfo"]>(undefined);
	// Variant C uses non-blocking guidance over the directly playable board.
	let showVariantCOverlay = $state(false);
	let firstScreenData = $state<FirstScreenData | undefined>(undefined);
	let communityActivePlayers = $state(0);
	let advertisedGridSize = $state<6 | 8>(6);
	let onboardingChoicePending = $state(false);
	let contentId = $state("content_initial");
	let completionId = $state<string | null>(null);

	$effect(() => {
		if (isCompleted) {
			liveElapsedSeconds = timeTaken;
			return;
		}
		if (!timerStarted) {
			liveElapsedSeconds = 0;
			return;
		}

		const updateElapsedSeconds = (): void => {
			liveElapsedSeconds = getElapsedSeconds(startTime);
		};

		updateElapsedSeconds();
		const interval = setInterval(updateElapsedSeconds, 1000);
		return () => clearInterval(interval);
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

	onMount(() => {
		// Check for personal challenge deeplink data from shared link
		const rawShareData = readShareData();
		const validation = validatePersonalChallengeData(rawShareData);
		if (validation.valid) {
			personalChallenge = validation.data;
		}

		void loadGame();
		// DQP dwell heartbeat: starts a single per-page-load session and
		// emits /api/dwell/tick every ~5s of active foreground time. Stops
		// itself once the server-side cap is reached.
		const heartbeat: HeartbeatHandle = startHeartbeat({
			sessionId: getSessionId(),
		});
		return () => heartbeat.stop();
	});

	function readShareData(): string | null | undefined {
		try {
			return getShareData();
		} catch {
			return null;
		}
	}

	function beginAttempt(nextContentId: string): void {
		contentId = nextContentId;
		completionId = null;
		renewAttemptId();
		setFirstActionContentId(nextContentId);
		resetLatch();
	}

	async function loadGame() {
		resetLatch();
		try {
			const response = await fetch("/api/game/state", {
				headers: sessionHeaders(),
			});
			if (!response.ok) throw new Error("Failed to load game");

			const data: GameState = await response.json();
			beginAttempt(data.contentId);

			isLoggedIn = data.isLoggedIn !== false;
			puzzleColors = data.puzzle.colors;
			puzzleNumbers = data.puzzle.numbers;
			gridSize = data.puzzle.gridSize;
			skillLevel = data.skillLevel;
			pathLevel = data.pathLevel;
			gridSizePreference = data.gridSizePreference ?? 4;
			isChallenge = data.isChallenge ?? false;
			allowsGridSizeChange = data.allowsGridSizeChange ?? !isChallenge;
			isFirstTimeUser = data.isFirstTimeUser ?? false;
			challengerInfo = data.challengerInfo;
			puzzleNumber = data.puzzleNumber ?? 0;
			isMod = data.isMod ?? false;
			communityActivePlayers = data.communityStats?.activePlayers ?? 0;

			// Hydrate postId from server context
			postId = data.postId;

			// Hydrate hint-dismissal state from GameState.
			const serverHintsDismissed = data.hintsDismissed ?? {
				numberConstraint: false,
				adjacencyViolation: false,
			};
			hintsDismissed = serverHintsDismissed;
			hydrateFromServer(serverHintsDismissed);

			if (data.currentSeason) {
				currentSeason = data.currentSeason;
			}

			// Weekend Event hydration. Always set it (active or inactive) so
			// the banner can render or hide based on the freshest server state.
			if (data.weekendEvent) {
				weekendEvent = data.weekendEvent;
			}
			// Always-on strip data — both fields are optional, set when
			// present and clear otherwise so previous renders don't ghost.
			seasonProgress = data.seasonProgress;

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
			completionPending = false;
			completionVerified = false;
			hasChallenged = false;
			challengeUrl = null;
			challengePostId = null;
			startTime = Date.now();
			timerStarted = false;
			coinReward = undefined;
			seasonRank = null;
			seasonPoints = 0;
			resetMistakes();

			firstScreenData = data.firstScreen;
			const initialView = getInitialView({
				isChallenge,
				isFirstTimeUser,
				warmupChoiceAvailable:
					data.onboardingChoiceRequired ??
					(!isChallenge && !allowsGridSizeChange && gridSize > 4),
				hasPlayedToday: data.hasPlayedToday ?? false,
				variant: data.variant,
				firstScreenAvailable: data.firstScreen !== undefined,
			});
			currentView = initialView.view;
			if (initialView.view === "warmup-choice") {
				advertisedGridSize = gridSize === 8 ? 8 : 6;
			}
			showVariantCOverlay = initialView.showOnboardingOverlay;

			// Load economy data (logged-in only — no wallet for anon users)
			if (isLoggedIn) {
				loadEconomy();
				// Migrate any logged-out score stashed before the user signed
				// in, so the freshly-authenticated account gets credit.
				void migrateLoggedOutScore();
			}
			void urjoJourney.markAppReady();
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
	 * Claim a short-lived server receipt after the login reload. The browser
	 * stores no score, board, or mistake data and therefore cannot forge credit.
	 */
	async function migrateLoggedOutScore() {
		if (!postId) return;
		const stashed = readLoggedOutMigration(postId);
		if (!stashed) return;
		try {
			const response = await fetch("/api/game/migrate-logged-out-score", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ migrationToken: stashed.migrationToken }),
			});
			if (response.ok) {
				const data = await response.json();
				clearLoggedOutMigration(postId);
				if (data.streak) streakData = data.streak;
				if (data.coinReward?.total) coins += data.coinReward.total;
			}
		} catch {
			// Non-critical — score stays stashed for a later retry.
		}
	}

	async function startServerTimer(): Promise<void> {
		try {
			await fetch("/api/game/timer-start", {
				method: "POST",
				headers: measurementHeaders(contentId),
			});
		} catch {
			// The server retains its issuance-time fallback if this request fails.
		}
	}

	/**
	 * Handle cell color change during gameplay (purely client-side).
	 */
	function handleCellChange(row: number, col: number, color: CellColor) {
		// Dismiss Variant C onboarding overlay on the first board interaction.
		if (showVariantCOverlay) showVariantCOverlay = false;
		const gridRow = grid[row];
		if (!gridRow) return;
		const cell = gridRow[col];
		if (!cell) return;
		if (cell.locked) return;

		// Start the puzzle timer on the first cell touch of this puzzle.
		const startsPuzzle = !timerStarted;
		if (!timerStarted) {
			startTime = Date.now();
			timerStarted = true;
		}
		if (startsPuzzle) {
			void startServerTimer();
			void urjoJourney.beginPuzzle(gridSize);
		}

		// Track mistakes: check previous cell when moving to a new one
		onCellChange(row, col, grid, gridSize);

		// Fire first-action POST exactly once per session (fire-and-forget)
		void fireOnce(postId ?? "", "cell");

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
			completionPending = true;
			completionVerified = false;
			timeTaken = getCompletedSeconds(startTime);
			// Check last active cell before reporting
			onPuzzleComplete(grid, gridSize);
			reportCompletion(timeTaken);
		}
	}

	/**
	 * Report puzzle completion to server (non-critical).
	 */
	async function reportCompletion(time: number) {
		// Check if user beat a personal challenge
		const beatPersonalChallenge =
			personalChallenge !== null && time < personalChallenge.time;

		// Serialize the solved board so the server can verify the solution
		// before crediting anything (completion is never taken on trust).
		const solvedBoard = serializeGrid(grid);

		// Keep an optimistic local run count for immediate UI feedback. The
		// response replaces it with the server-verified count used for rewards.
		const newSessionRun = incrementSessionRun();
		sessionRun = newSessionRun;

		try {
			const response = await fetch("/api/game/complete", {
				method: "POST",
				headers: measurementHeaders(contentId),
				body: JSON.stringify({
					timeTaken: time,
					mistakes: $mistakeCount,
					board: solvedBoard,
					// Include personal challenge beat info for bonus reward
					...(beatPersonalChallenge && personalChallenge
						? {
								personalChallengeBeat: {
									challengerUsername:
										personalChallenge.username,
									challengerTime: personalChallenge.time,
								},
							}
						: {}),
				}),
			});

			if (response.ok) {
				const data: CompleteResponse = await response.json();
				if (!isLoggedIn && postId && data.migrationToken) {
					writeLoggedOutMigration({
						postId,
						migrationToken: data.migrationToken,
					});
				}
				completionId = data.completionId ?? null;
				timeTaken = data.timeTaken;
				completionVerified = true;
				const performanceScore =
					typeof data.performanceScore === "number"
						? data.performanceScore
						: Math.max(0, Math.round(10000 / Math.max(data.timeTaken, 1)));
				void urjoJourney.completePuzzle({
					performanceScore,
					timeTaken: data.timeTaken,
					mistakes: $mistakeCount,
				});
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
				if (typeof data.pathLevel === "number") {
					pathLevel = data.pathLevel;
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
				// Perfect-solve challenge prompt eligibility (explicit opt-in share)
				challengePromptEligible = data.challengePromptEligible === true;
				// Run-again loop: hydrate the session-streak chip + roll the
				// bonus coins into the wallet so the CountUp lands on the
				// fully-paid total.
				if (typeof data.sessionRun === "number") {
					sessionRun = data.sessionRun;
				}
				if (typeof data.sessionRunBonusCoins === "number") {
					sessionRunBonusCoins = data.sessionRunBonusCoins;
					if (data.sessionRunBonusCoins > 0) {
						coins += data.sessionRunBonusCoins;
					}
				}
				// Weekend Event refresh: server is source of truth for both
				// the banner countdown (hoursLeft) and the per-completion
				// bonus. Any positive bonus is folded into the displayed
				// wallet so CountUp lands on the fully-paid total.
				if (data.weekendEvent) {
					weekendEvent = data.weekendEvent;
				}
				if (typeof data.weekendBonusCoins === "number") {
					weekendBonusCoins = data.weekendBonusCoins;
					if (data.weekendBonusCoins > 0) {
						coins += data.weekendBonusCoins;
					}
				}
			} else {
				void urjoJourney.abandonPuzzle("verification_failed");
				showToast("Solve could not be verified, so it was not ranked.");
			}
		} catch {
			void urjoJourney.abandonPuzzle("network_error");
			showToast("Solve could not be verified, so it was not ranked.");
		} finally {
			completionPending = false;
		}
	}

	/**
	 * Handle challenge post creation.
	 */
	async function handleChallenge(customTitle?: string) {
		if (hasChallenged) return;
		if (completionId === null) {
			showToast("Finish a verified puzzle before creating a challenge.");
			return;
		}
		void fireOnce(postId ?? "", "challenge");
		try {
			const challengeBody = {
				completionId,
				...(customTitle && { customTitle }),
			};
			const response = await fetch("/api/game/challenge", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(challengeBody),
			});
			const data: ChallengeResponse = await response.json();
			if (response.ok && data.success) {
				hasChallenged = true;
				challengeUrl = data.postUrl ?? null;
				challengePostId = data.postId ?? null;
				showToast("Challenge post created!");
			} else {
				const reason: string =
					typeof data?.error === "string"
						? data.error
						: "Failed to create challenge";
				showToast(reason);
			}
		} catch {
			showToast("Could not create challenge — check your connection");
		}
	}

	async function handleShareChallenge(): Promise<void> {
		if (challengePostId === null || sharingChallenge) return;
		sharingChallenge = true;
		try {
			await showShareSheet({
				post: challengePostId,
				title: "Can you beat my Urjo time?",
				text: `I solved Puzzle #${puzzleNumber} in ${timeTaken}s. Can you beat it?`,
			});
		} catch {
			// Cancelling or closing the native share sheet leaves the Rival post intact.
		} finally {
			sharingChallenge = false;
		}
	}

	/**
	 * Handle "Next Challenge" button.
	 */
	async function handleNextChallenge() {
		void urjoJourney.abandonPuzzle("next_puzzle");
		hasChallenged = false;
		challengeUrl = null;
		challengePostId = null;
		challengePromptEligible = false;
		resetHints();
		try {
			const timeSpent = timerStarted
				? getElapsedSeconds(startTime)
				: 0;
			const response = await fetch("/api/game/next-challenge", {
				method: "POST",
				headers: sessionHeaders(),
				body: JSON.stringify({ timeSpent }),
			});
			if (!response.ok) throw new Error("Failed to get next challenge");

			const data: NextChallengeResponse = await response.json();
			beginAttempt(data.contentId);

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
			completionPending = false;
			completionVerified = false;
			startTime = Date.now();
			timerStarted = false;
			resetMistakes();
		} catch (error) {
			errorMessage =
				error instanceof Error
					? error.message
					: "Failed to load next challenge";
			currentView = "error";
		}
	}
	function handleRestart() {
		void urjoJourney.abandonPuzzle("restart");
		hasChallenged = false;
		challengeUrl = null;
		challengePostId = null;
		challengePromptEligible = false;
		completionId = null;
		setFirstActionContentId(contentId);
		resetLatch();
		resetHints();
		grid = deserializeGrid(
			puzzleColors,
			puzzleNumbers,
			puzzleColors,
			gridSize,
		);
		isCompleted = false;
		completionPending = false;
		completionVerified = false;
		startTime = Date.now();
		timerStarted = false;
		resetMistakes();
	}

	/**
	 * Handle grid size selection change.
	 * Calls POST /api/game/grid-size, updates puzzle state from response.
	 * Reverts to previous size on failure (non-disruptive).
	 */
	async function handleGridSizeChange(newSize: number) {
		void fireOnce(postId ?? "", "grid-size");
		const previousSize = gridSizePreference;
		gridSizePreference = newSize;
		resetHints();

		try {
			const response = await fetch("/api/game/grid-size", {
				method: "POST",
				headers: sessionHeaders(),
				body: JSON.stringify({ gridSize: newSize }),
			});

			if (!response.ok) throw new Error("Failed to set grid size");

			const data: GridSizeResponse = await response.json();
			beginAttempt(data.contentId);

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
			void urjoJourney.abandonPuzzle("grid_size_changed");
			isCompleted = false;
			completionPending = false;
			completionVerified = false;
				hasChallenged = false;
				challengeUrl = null;
				challengePostId = null;
			challengePromptEligible = false;
			startTime = Date.now();
			timerStarted = false;
			coinReward = undefined;
			resetMistakes();
		} catch {
			// Revert to previous size on failure (non-disruptive)
			gridSizePreference = previousSize;
		}
	}

	async function handleOnboardingChoice(
		choice: "warmup" | "advertised",
	): Promise<void> {
		if (onboardingChoicePending) return;
		onboardingChoicePending = true;
		try {
			const response = await fetch("/api/game/onboarding-choice", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ choice }),
			});
			if (!response.ok) throw new Error("Choice was not accepted");

			const data: OnboardingChoiceResponse = await response.json();
			beginAttempt(data.contentId);
			puzzleColors = data.puzzle.colors;
			puzzleNumbers = data.puzzle.numbers;
			gridSize = data.puzzle.gridSize;
			gridSizePreference = data.puzzle.gridSize;
			skillLevel = data.skillLevel;
			grid = deserializeGrid(
				data.puzzle.colors,
				data.puzzle.numbers,
				data.puzzle.colors,
				data.puzzle.gridSize,
			).map((row) => row.map((cell) => ({ ...cell, isLoading: false })));
			isCompleted = false;
			completionPending = false;
			completionVerified = false;
			startTime = Date.now();
			timerStarted = false;
			resetMistakes();
			showVariantCOverlay = true;
			currentView = "game";
		} catch {
			showToast("That choice could not be loaded. Please try again.");
		} finally {
			onboardingChoicePending = false;
		}
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
	{:else if currentView === "warmup-choice"}
		<WarmupChoice
			{advertisedGridSize}
			loading={onboardingChoicePending}
			onChoose={handleOnboardingChoice}
		/>
		{:else if currentView === "game"}
			{@const gameProps = {
				grid,
				gridSize,
				isCompleted,
					completionPending,
					completionVerified,
					completionId,
				streakData,
			hasChallenged,
			challengeUrl,
			coins,
			timeTaken,
			liveElapsedSeconds,
			mistakes: $mistakeCount,
			isLoggedIn,
			isChallenge,
			postId,
			onCellChange: handleCellChange,
			onNextChallenge: handleNextChallenge,
			onRestart: handleRestart,
				onChallenge: handleChallenge,
				onShareChallenge: handleShareChallenge,
				sharingChallenge,
			onOpenAnalytics: () => (showAnalytics = true),
			isMod,
			onGridSizeChange: handleGridSizeChange,
			allowsGridSizeChange,
			puzzleColors,
			skillLevel,
			pathLevel,
			puzzleNumber,
			seasonRank,
			seasonPoints,
			currentSeason,
			hintsDismissed,
			challengePromptEligible,
			sessionRun,
			sessionRunBonusCoins,
			weekendEvent,
			weekendBonusCoins,
			seasonProgress,
			personalChallenge,
			...(challengerInfo !== undefined && { challengerInfo }),
			...(username !== undefined && { username }),
			...(engagement !== undefined && { engagement }),
				...(coinReward !== undefined && { coinReward }),
				showOnboardingOverlay: showVariantCOverlay,
				...(showVariantCOverlay && {
					onboardingOverlay: {
						activePlayers:
							firstScreenData?.communityStats.activePlayers ??
							communityActivePlayers,
						...(firstScreenData?.targetToBeat !== undefined && {
							targetToBeat: firstScreenData.targetToBeat,
						}),
					},
				}),
			}}
		<GameView {...gameProps} />
	{/if}
</div>

<AnalyticsDashboard
	isOpen={showAnalytics}
	onClose={() => (showAnalytics = false)}
/>

{#if showLevelUp}
	<div class="level-up-overlay" role="status" aria-live="polite">
		<div class="level-up-card">
			<div class="level-up-icon">⬆️</div>
			<div class="level-up-title">Skill Up!</div>
			<div class="level-up-subtitle">
				You're now <strong>Skill Level {levelUpNewLevel}</strong>
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
