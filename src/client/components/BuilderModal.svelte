<script lang="ts">
	import type { CellColor, Grid } from "../../shared/types";
	import type {
		BuilderValidateResponse,
		BuilderPublishResponse,
		UGCPuzzle,
	} from "../../shared/types";
	import GameBoard from "../components/GameBoard.svelte";
	import { serializeGrid } from "../lib/utils";
	import CheckCircle from "lucide-svelte/icons/check-circle";
	import AlertCircle from "lucide-svelte/icons/alert-circle";
	import Send from "lucide-svelte/icons/send";
	import RotateCcw from "lucide-svelte/icons/rotate-ccw";

	type Props = {
		onClose: () => void;
		onPublished?: (puzzle: UGCPuzzle) => void;
	};

	let { onClose, onPublished }: Props = $props();

	// ── State ──────────────────────────────────────────────────────────────
	type BuilderStep = "design" | "solution" | "title" | "published";

	let step = $state<BuilderStep>("design");
	let gridSize = $state<4 | 6>(4);
	let title = $state("");

	// Design grid: where user paints locked clue cells
	let designGrid = $state<Grid>(makeEmptyGrid(4));

	// Solution grid: user fills in the complete solution
	let solutionGrid = $state<Grid>(makeEmptyGrid(4));

	let validationResult = $state<BuilderValidateResponse | null>(null);
	let isValidating = $state(false);
	let isPublishing = $state(false);
	let publishError = $state<string | null>(null);
	let publishedPuzzle = $state<UGCPuzzle | null>(null);

	// ── Grid helpers ────────────────────────────────────────────────────────

	function makeEmptyGrid(size: number): Grid {
		return Array.from({ length: size }, () =>
			Array.from({ length: size }, () => ({
				color: null as CellColor,
				number: null,
				locked: false,
			})),
		);
	}

	function changeGridSize(size: 4 | 6) {
		gridSize = size;
		designGrid = makeEmptyGrid(size);
		solutionGrid = makeEmptyGrid(size);
		validationResult = null;
	}

	function handleDesignCellChange(row: number, col: number, color: CellColor) {
		designGrid = designGrid.map((r, ri) =>
			ri === row
				? r.map((c, ci) =>
						ci === col
							? { color, number: c.number, locked: color !== null }
							: c,
					)
				: r,
		);
		// Reset solution when design changes
		solutionGrid = designGrid.map((r) =>
			r.map((c) => ({
				...c,
				locked: c.color !== null, // locked cells carry over from design
			})),
		);
		validationResult = null;
	}

	function handleSolutionCellChange(
		row: number,
		col: number,
		color: CellColor,
	) {
		solutionGrid = solutionGrid.map((r, ri) =>
			ri === row
				? r.map((c, ci) =>
						ci === col && !c.locked ? { ...c, color } : c,
					)
				: r,
		);
		validationResult = null;
	}

	function handleClearDesign() {
		designGrid = makeEmptyGrid(gridSize);
		solutionGrid = makeEmptyGrid(gridSize);
		validationResult = null;
	}

	// ── Solution completeness ────────────────────────────────────────────────

	const solutionComplete = $derived(
		solutionGrid.every((row) => row.every((cell) => cell.color !== null)),
	);

	const serializedDesign = $derived(serializeGrid(designGrid));
	const serializedSolution = $derived(serializeGrid(solutionGrid));

	// ── Validation ───────────────────────────────────────────────────────────

	async function handleValidate() {
		if (!solutionComplete) return;
		isValidating = true;
		validationResult = null;

		try {
			const resp = await fetch("/api/builder/validate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					colors: serializedDesign,
					numbers: serializeNumbers(designGrid),
					solution: serializedSolution,
					gridSize,
				}),
			});
			validationResult = await resp.json();
		} catch {
			validationResult = {
				valid: false,
				solutionCount: 0,
				error: "Validation failed — try again",
			};
		} finally {
			isValidating = false;
		}
	}

	function serializeNumbers(grid: Grid): string {
		return grid
			.flat()
			.map((c) => (c.number !== null ? c.number.toString() : "-"))
			.join("");
	}

	// ── Publish ──────────────────────────────────────────────────────────────

	async function handlePublish() {
		if (!validationResult?.valid || !title.trim()) return;
		isPublishing = true;
		publishError = null;

		try {
			const resp = await fetch("/api/builder/publish", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					colors: serializedDesign,
					numbers: serializeNumbers(designGrid),
					solution: serializedSolution,
					gridSize,
					title: title.trim(),
				}),
			});
			const data: BuilderPublishResponse = await resp.json();

			if (data.success && data.puzzleId) {
				publishedPuzzle = {
					id: data.puzzleId,
					authorId: "",
					authorName: "You",
					colors: serializedDesign,
					numbers: serializeNumbers(designGrid),
					solution: serializedSolution,
					gridSize,
					title: title.trim(),
					createdAt: Date.now(),
					solveCount: 0,
					upvotes: 0,
					postId: data.postId,
				};
				step = "published";
				onPublished?.(publishedPuzzle);
			} else {
				publishError = data.error ?? "Failed to publish";
			}
		} catch {
			publishError = "Publish failed — try again";
		} finally {
			isPublishing = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 bg-theme-bg-primary flex flex-col overflow-hidden"
>
	<!-- Header -->
	<header
		class="flex-none h-12 flex items-center justify-between px-4 border-b border-theme-border"
	>
		<button
			onclick={onClose}
			class="text-sm text-theme-text-secondary hover:text-theme-text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center"
		>
			✕ Close
		</button>
		<h1 class="text-base font-bold text-theme-text-primary">
			{#if step === "design"}
				Design Clues
			{:else if step === "solution"}
				Fill Solution
			{:else if step === "title"}
				Name Your Puzzle
			{:else}
				Published! 🎉
			{/if}
		</h1>
		<div class="min-w-[44px]"></div>
	</header>

	<!-- Step indicator -->
	{#if step !== "published"}
		<div class="flex-none flex gap-1 px-4 py-2">
			{#each ["design", "solution", "title"] as s, i}
				<div
					class="flex-1 h-1 rounded-full transition-colors {step === s
						? 'bg-urjo-blue'
						: ['design', 'solution', 'title'].indexOf(step) > i
							? 'bg-urjo-blue/50'
							: 'bg-theme-border'}"
				></div>
			{/each}
		</div>
	{/if}

	<!-- Content -->
	<div class="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-4">
		<!-- STEP: Design -->
		{#if step === "design"}
			<div class="flex flex-col gap-3">
				<!-- Grid size picker -->
				<div class="flex gap-2">
					<button
						onclick={() => changeGridSize(4)}
						class="flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
							{gridSize === 4
							? 'bg-urjo-blue text-white border-urjo-blue'
							: 'border-theme-border text-theme-text-secondary hover:bg-theme-hover'}"
					>
						4×4
					</button>
					<button
						onclick={() => changeGridSize(6)}
						class="flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
							{gridSize === 6
							? 'bg-urjo-blue text-white border-urjo-blue'
							: 'border-theme-border text-theme-text-secondary hover:bg-theme-hover'}"
					>
						6×6
					</button>
				</div>

				<p class="text-xs text-theme-text-muted text-center">
					Tap cells to set clues (locked colors). Leave empty cells for
					players to solve.
				</p>

				<GameBoard
					grid={designGrid}
					{gridSize}
					onCellChange={handleDesignCellChange}
				/>

				<button
					onclick={handleClearDesign}
					class="flex items-center justify-center gap-2 py-2 text-sm text-theme-text-secondary
						hover:text-theme-text-primary transition-colors"
				>
					<RotateCcw class="w-4 h-4" />
					Clear
				</button>

				<button
					onclick={() => (step = "solution")}
					disabled={designGrid.every((r) => r.every((c) => c.color === null))}
					class="w-full py-3 bg-urjo-blue text-white font-bold rounded-lg
						hover:opacity-90 active:scale-95 transition-all
						disabled:opacity-40 disabled:cursor-not-allowed"
				>
					Next: Fill Solution →
				</button>
			</div>

		<!-- STEP: Solution -->
		{:else if step === "solution"}
			<div class="flex flex-col gap-3">
				<p class="text-xs text-theme-text-muted text-center">
					Fill in the complete solution. Locked cells (your clues) are
					fixed.
				</p>

				<GameBoard
					grid={solutionGrid}
					{gridSize}
					onCellChange={handleSolutionCellChange}
				/>

				<!-- Validation feedback -->
				{#if validationResult}
					<div
						class="flex items-start gap-2 p-3 rounded-lg
							{validationResult.valid
							? 'bg-green-500/10 border border-green-500/30'
							: 'bg-red-500/10 border border-red-500/30'}"
					>
						{#if validationResult.valid}
							<CheckCircle class="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
							<span class="text-xs text-green-400">
								✓ Unique solution — puzzle is valid!
							</span>
						{:else}
							<AlertCircle
								class="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"
							/>
							<span class="text-xs text-red-400">
								{validationResult.error ?? "Invalid puzzle"}
								{#if validationResult.solutionCount > 1}
									— add more clues in the design step.
								{/if}
							</span>
						{/if}
					</div>
				{/if}

				<div class="flex gap-2">
					<button
						onclick={() => (step = "design")}
						class="flex-1 py-3 border border-theme-border text-theme-text-secondary
							font-semibold rounded-lg hover:bg-theme-hover transition-colors text-sm"
					>
						← Back
					</button>

					{#if validationResult?.valid}
						<button
							onclick={() => (step = "title")}
							class="flex-1 py-3 bg-urjo-blue text-white font-bold rounded-lg
								hover:opacity-90 active:scale-95 transition-all text-sm"
						>
							Next: Name It →
						</button>
					{:else}
						<button
							onclick={handleValidate}
							disabled={!solutionComplete || isValidating}
							class="flex-1 py-3 bg-urjo-blue text-white font-bold rounded-lg
								hover:opacity-90 active:scale-95 transition-all text-sm
								disabled:opacity-40 disabled:cursor-not-allowed"
						>
							{isValidating ? "Checking..." : "Validate"}
						</button>
					{/if}
				</div>
			</div>

		<!-- STEP: Title -->
		{:else if step === "title"}
			<div class="flex flex-col gap-4">
				<p class="text-sm text-theme-text-secondary text-center">
					Give your puzzle a name before sharing it with the community.
				</p>

				<input
					type="text"
					bind:value={title}
					maxlength={80}
					placeholder="e.g. The Zigzag Challenge"
					class="w-full px-4 py-3 bg-theme-hover border border-theme-border rounded-lg
						text-theme-text-primary placeholder:text-theme-text-muted
						focus:outline-none focus:border-urjo-blue text-sm"
				/>

				<p class="text-xs text-theme-text-muted text-center">
					Publishing posts your puzzle to r/urjo and awards you 🪙 20 coins.
				</p>

				{#if publishError}
					<p class="text-xs text-red-400 text-center">{publishError}</p>
				{/if}

				<div class="flex gap-2">
					<button
						onclick={() => (step = "solution")}
						class="flex-1 py-3 border border-theme-border text-theme-text-secondary
							font-semibold rounded-lg hover:bg-theme-hover transition-colors text-sm"
					>
						← Back
					</button>

					<button
						onclick={handlePublish}
						disabled={!title.trim() || isPublishing}
						class="flex-1 py-3 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg
							hover:opacity-90 active:scale-95 transition-all text-sm
							disabled:opacity-40 disabled:cursor-not-allowed
							flex items-center justify-center gap-2"
					>
						{#if isPublishing}
							Publishing...
						{:else}
							<Send class="w-4 h-4" />
							Publish
						{/if}
					</button>
				</div>
			</div>

		<!-- STEP: Published -->
		{:else if step === "published" && publishedPuzzle}
			<div class="flex flex-col items-center gap-4 py-8">
				<div class="text-5xl">🎉</div>
				<h2 class="text-xl font-bold text-theme-text-primary text-center">
					"{publishedPuzzle.title}" is live!
				</h2>
				<p class="text-sm text-theme-text-secondary text-center">
					Your puzzle was posted to r/urjo. Other players can now solve
					it!
				</p>
				<div
					class="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30
					px-4 py-2 rounded-lg"
				>
					<span class="text-yellow-400 font-bold">+20 🪙</span>
					<span class="text-xs text-theme-text-muted"
						>Coins for publishing</span
					>
				</div>
				<button
					onclick={onClose}
					class="w-full py-3 bg-theme-text-primary text-theme-bg-primary font-bold
						rounded-lg hover:opacity-90 active:scale-95 transition-all"
				>
					Done
				</button>
			</div>
		{/if}
	</div>
</div>
