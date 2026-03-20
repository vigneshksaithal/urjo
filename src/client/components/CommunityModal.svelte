<script lang="ts">
	import type { UGCPuzzle, CommunityPuzzlesResponse } from "../../shared/types";
	import Users from "lucide-svelte/icons/users";
	import Puzzle from "lucide-svelte/icons/puzzle";
	import X from "lucide-svelte/icons/x";

	type Props = {
		isOpen: boolean;
		onClose: () => void;
		onPlay: (puzzle: UGCPuzzle) => void;
	};

	let { isOpen, onClose, onPlay }: Props = $props();

	let puzzles = $state<UGCPuzzle[]>([]);
	let isLoading = $state(false);
	let hasLoaded = $state(false);
	let total = $state(0);

	$effect(() => {
		if (isOpen && !hasLoaded) {
			loadPuzzles();
		}
	});

	async function loadPuzzles() {
		isLoading = true;
		try {
			const resp = await fetch("/api/builder/community?limit=20");
			if (resp.ok) {
				const data: CommunityPuzzlesResponse = await resp.json();
				puzzles = data.puzzles;
				total = data.total;
				hasLoaded = true;
			}
		} catch {
			// Non-critical
		} finally {
			isLoading = false;
		}
	}

	function formatTime(ms: number): string {
		const date = new Date(ms);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffH = Math.floor(diffMs / 3_600_000);
		const diffD = Math.floor(diffH / 24);
		if (diffD > 0) return `${diffD}d ago`;
		if (diffH > 0) return `${diffH}h ago`;
		return "just now";
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-40 flex flex-col bg-theme-bg-primary overflow-hidden"
	>
		<!-- Header -->
		<header
			class="flex-none h-12 flex items-center justify-between px-4 border-b border-theme-border"
		>
			<div class="flex items-center gap-2">
				<Users class="w-4 h-4 text-urjo-blue" />
				<h2 class="text-base font-bold text-theme-text-primary">
					Community Puzzles
				</h2>
				{#if total > 0}
					<span
						class="text-xs text-theme-text-muted bg-theme-hover px-2 py-0.5 rounded-full"
					>
						{total}
					</span>
				{/if}
			</div>
			<button
				onclick={onClose}
				class="min-w-[44px] min-h-[44px] flex items-center justify-center
					text-theme-text-secondary hover:text-theme-text-primary transition-colors"
			>
				<X class="w-5 h-5" />
			</button>
		</header>

		<!-- List -->
		<div class="flex-1 min-h-0 overflow-y-auto">
			{#if isLoading}
				<div class="flex items-center justify-center h-32">
					<div
						class="w-6 h-6 border-2 border-urjo-blue border-t-transparent rounded-full animate-spin"
					></div>
				</div>
			{:else if puzzles.length === 0}
				<div
					class="flex flex-col items-center justify-center h-48 gap-3 text-center px-8"
				>
					<Puzzle class="w-10 h-10 text-theme-text-muted" />
					<p class="text-sm text-theme-text-secondary">
						No community puzzles yet.<br />Be the first to create one!
					</p>
				</div>
			{:else}
				<ul class="divide-y divide-theme-border">
					{#each puzzles as puzzle (puzzle.id)}
						<li>
							<button
								onclick={() => onPlay(puzzle)}
								class="w-full text-left px-4 py-3 hover:bg-theme-hover
									active:bg-theme-hover/80 transition-colors"
							>
								<div class="flex items-start justify-between gap-3">
									<div class="flex-1 min-w-0">
										<p
											class="text-sm font-semibold text-theme-text-primary truncate"
										>
											{puzzle.title}
										</p>
										<p class="text-xs text-theme-text-muted mt-0.5">
											by u/{puzzle.authorName} · {puzzle.gridSize}×{puzzle.gridSize}
											· {formatTime(puzzle.createdAt)}
										</p>
									</div>
									<div class="flex flex-col items-end gap-1 flex-shrink-0">
										{#if puzzle.solveCount > 0}
											<span class="text-xs text-green-400">
												✓ {puzzle.solveCount} solved
											</span>
										{/if}
									</div>
								</div>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}
