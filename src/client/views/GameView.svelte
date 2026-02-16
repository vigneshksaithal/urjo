<script lang="ts">
	import type { CellColor, Grid, StreakData, LeaderboardData } from '../../shared/types'
	import ConfettiEffect from '../components/ConfettiEffect.svelte'
	import GameBoard from '../components/GameBoard.svelte'
	import StreakBadge from '../components/StreakBadge.svelte'
	import LeaderboardModal from '../components/LeaderboardModal.svelte'
	import Trophy from 'lucide-svelte/icons/trophy'
	import Share2 from 'lucide-svelte/icons/share-2'

	type Props = {
		grid: Grid
		gridSize: number
		onCellChange: (row: number, col: number, color: CellColor) => void
		isCompleted: boolean
		onNextChallenge: () => void
		onRestart: () => void
		onHowToPlay: () => void
		streakData: StreakData
		timeTaken: number
		hasShared: boolean
		onShare: () => void
	}

	let {
		grid,
		gridSize,
		onCellChange,
		isCompleted,
		onNextChallenge,
		onRestart,
		onHowToPlay,
		streakData,
		timeTaken,
		hasShared,
		onShare,
	}: Props = $props()

	let showLeaderboard = $state(false)
	let leaderboardPreview = $state<LeaderboardData | null>(null)

	// Fetch mini leaderboard preview when completed
	$effect(() => {
		if (isCompleted && !leaderboardPreview) {
			fetchLeaderboardPreview()
		}
	})

	async function fetchLeaderboardPreview() {
		try {
			const response = await fetch('/api/game/leaderboard?type=speed')
			if (response.ok) {
				leaderboardPreview = await response.json()
			}
		} catch {
			// Non-critical
		}
	}
</script>

<div class="h-full w-full flex flex-col p-4 overflow-hidden">
	<!-- Header -->
	<header class="flex-none h-10 flex items-center justify-between px-2 gap-2">
		<button
			onclick={onHowToPlay}
			class="text-sm font-medium text-urjo-blue hover:underline flex-shrink-0"
		>
			How to Play
		</button>
		
		<div class="flex items-center gap-2 flex-1 justify-center">
			<StreakBadge streak={streakData} />
			<button
				onclick={() => showLeaderboard = true}
				class="p-1.5 rounded-lg hover:bg-theme-hover transition-colors"
				aria-label="View leaderboard"
			>
				<Trophy class="w-5 h-5 text-yellow-400" />
			</button>
		</div>
		
		{#if !isCompleted}
			<button
				onclick={onNextChallenge}
				class="text-sm font-medium text-urjo-blue hover:underline flex-shrink-0"
			>
				New Puzzle
			</button>
		{:else}
			<div class="w-20 flex-shrink-0"></div>
		{/if}
	</header>

	<!-- Main game area -->
	<main class="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 relative">
		<!-- Upvote request -->
		<p class="text-sm text-theme-text-muted text-center">
			Enjoying Urjo? Upvote if you like it!
		</p>

		<!-- Game board -->
		<GameBoard {grid} {gridSize} {onCellChange} />

		<!-- Completion overlay -->
		{#if isCompleted}
			<div class="absolute inset-0 flex flex-col items-center justify-center z-20 gap-3 p-4 bg-theme-overlay backdrop-blur-sm">
				<div class="flex flex-col items-center gap-3 max-w-sm w-full">
					<!-- Primary CTA -->
					<button
						onclick={onNextChallenge}
						class="px-8 py-2.5 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg
							text-base hover:opacity-90 active:scale-95 transition-all w-full shadow-lg"
					>
						Next Challenge
					</button>

					<!-- Streak display -->
					{#if streakData.currentStreak > 0}
						<div class="text-center">
							<p class="text-3xl font-bold text-theme-text-primary drop-shadow-lg">
								🔥 {streakData.currentStreak} Day Streak!
							</p>
						</div>
					{/if}

					<!-- Mini leaderboard preview -->
					{#if leaderboardPreview && leaderboardPreview.entries.length > 0}
						<div class="w-full bg-theme-bg-secondary backdrop-blur-md rounded-lg p-3 border border-theme-border">
							<div class="flex items-center justify-between mb-2">
								<h3 class="text-sm font-bold text-theme-text-primary flex items-center gap-1">
									<Trophy class="w-4 h-4 text-yellow-400" />
									Top 3 Today
								</h3>
								<button
									onclick={() => showLeaderboard = true}
									class="text-xs text-urjo-blue hover:underline"
								>
									View All
								</button>
							</div>
							<div class="space-y-1">
								{#each leaderboardPreview.entries.slice(0, 3) as entry}
									<div class="flex items-center justify-between text-xs">
										<span class="text-theme-text-secondary">
											{entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}
											{entry.username}
										</span>
										<span class="text-yellow-400 font-bold">{entry.score}s</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Share button -->
					<button
						onclick={onShare}
						disabled={hasShared}
						class="px-6 py-2 border-2 border-theme-text-primary text-theme-text-primary rounded-lg
							text-sm hover:bg-theme-hover active:scale-95 transition-all
							disabled:opacity-50 disabled:cursor-not-allowed w-full
							flex items-center justify-center gap-2"
					>
						{#if hasShared}
							<span>✅ Shared!</span>
						{:else}
							<Share2 class="w-4 h-4" />
							<span>Share to Comments</span>
						{/if}
					</button>

					<!-- Restart button -->
					<button
						onclick={onRestart}
						class="px-6 py-1.5 border border-theme-border text-theme-text-secondary rounded-lg
							text-sm hover:bg-theme-hover active:scale-95 transition-all"
					>
						Restart
					</button>
				</div>
			</div>
		{/if}
	</main>

	<!-- Footer instructions -->
	<footer class="flex-none h-10 flex items-center justify-center">
		{#if !isCompleted}
			<p class="text-xs text-theme-text-muted text-center">
				Tap to cycle colors
			</p>
		{/if}
	</footer>
</div>

<!-- Confetti effect -->
{#if isCompleted}
	<ConfettiEffect />
{/if}

<!-- Leaderboard modal -->
<LeaderboardModal
	isOpen={showLeaderboard}
	onClose={() => showLeaderboard = false}
	onNextChallenge={() => {
		showLeaderboard = false
		onNextChallenge()
	}}
/>
