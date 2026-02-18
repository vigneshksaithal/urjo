<script lang="ts">
	import type { LeaderboardData } from '../../shared/types'
	import Trophy from 'lucide-svelte/icons/trophy'
	import Flame from 'lucide-svelte/icons/flame'
	import Zap from 'lucide-svelte/icons/zap'
	import X from 'lucide-svelte/icons/x'
	import Loader2 from 'lucide-svelte/icons/loader-2'

	type Props = {
		isOpen: boolean
		onClose: () => void
		onNextChallenge: () => void
	}

	let { isOpen, onClose, onNextChallenge }: Props = $props()

	let activeTab = $state<'streak' | 'speed' | 'coins'>('streak')
	let leaderboardData = $state<LeaderboardData | null>(null)
	let isLoading = $state(false)
	let error = $state<string | null>(null)

	// Fetch leaderboard data when tab changes
	$effect(() => {
		if (isOpen) {
			fetchLeaderboard()
		}
	})

	async function fetchLeaderboard() {
		isLoading = true
		error = null

		try {
			let url: string
			if (activeTab === 'coins') {
				url = '/api/leaderboard/coins'
			} else {
				url = `/api/game/leaderboard?type=${activeTab}`
			}
			
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to fetch leaderboard')
			
			const data: LeaderboardData = await response.json()
			leaderboardData = data
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load leaderboard'
			leaderboardData = null
		} finally {
			isLoading = false
		}
	}

	function handleTabChange(tab: 'streak' | 'speed' | 'coins') {
		activeTab = tab
		fetchLeaderboard()
	}

	function formatScore(score: number, type: 'streak' | 'speed' | 'coins'): string {
		if (type === 'streak') {
			return `${score} day${score === 1 ? '' : 's'}`
		} else if (type === 'speed') {
			return `${score}s`
		} else {
			return `${score.toLocaleString()} 🪙`
		}
	}
</script>

{#if isOpen}
	<!-- Modal backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-theme-overlay backdrop-blur-sm z-40 flex items-center justify-center p-4"
		onclick={onClose}
	>
		<!-- Modal content -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="bg-theme-bg-modal rounded-xl border border-theme-border w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-theme-border">
				<div class="flex items-center gap-2">
					<Trophy class="w-5 h-5 text-yellow-400" />
					<h2 class="text-lg font-bold text-theme-text-primary">Leaderboard</h2>
				</div>
				<button
					onclick={onClose}
					class="text-theme-text-muted hover:text-theme-text-primary transition-colors p-1"
					aria-label="Close"
				>
					<X class="w-5 h-5" />
				</button>
			</div>

			<!-- Tabs -->
			<div class="flex border-b border-theme-border">
				<button
					onclick={() => handleTabChange('streak')}
					class="flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors
						{activeTab === 'streak' ? 'text-theme-text-primary bg-theme-hover border-b-2 border-yellow-400' : 'text-theme-text-muted hover:text-theme-text-primary'}"
				>
					<Flame class="w-4 h-4" />
					<span>Streaks</span>
				</button>
				<button
					onclick={() => handleTabChange('speed')}
					class="flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors
						{activeTab === 'speed' ? 'text-theme-text-primary bg-theme-hover border-b-2 border-blue-400' : 'text-theme-text-muted hover:text-theme-text-primary'}"
				>
					<Zap class="w-4 h-4" />
					<span>Speed</span>
				</button>
				<button
					onclick={() => handleTabChange('coins')}
					class="flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors
						{activeTab === 'coins' ? 'text-theme-text-primary bg-theme-hover border-b-2 border-yellow-400' : 'text-theme-text-muted hover:text-theme-text-primary'}"
				>
					<span class="text-sm">🪙</span>
					<span>Coins</span>
				</button>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-y-auto">
				{#if isLoading}
					<div class="flex items-center justify-center py-8">
						<Loader2 class="w-8 h-8 text-theme-text-muted animate-spin" />
					</div>
				{:else if error}
					<div class="text-center py-8 text-red-400">
						<p>{error}</p>
					</div>
				{:else if leaderboardData && leaderboardData.entries.length > 0}
					<!-- Table layout -->
					<table class="w-full border-collapse">
						<thead>
							<tr class="border-b border-theme-border text-left text-xs text-theme-text-muted">
								<th class="px-4 py-2 font-medium">Rank</th>
								<th class="px-4 py-2 font-medium">Player</th>
								<th class="px-4 py-2 font-medium text-right">
									{activeTab === 'streak' ? 'Streak' : activeTab === 'speed' ? 'Time' : 'Coins'}
								</th>
							</tr>
						</thead>
						<tbody>
							{#each leaderboardData.entries as entry}
								<tr
									class="border-b border-theme-border transition-colors
										{leaderboardData.userRank === entry.rank ? 'bg-green-500/20 text-green-400' : 'hover:bg-theme-hover'}"
								>
									<td class="px-4 py-3 text-sm text-theme-text-primary">
										{entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `${entry.rank}.`}
									</td>
									<td class="px-4 py-3 text-sm font-medium text-theme-text-primary">
										{entry.username}
									</td>
									<td class="px-4 py-3 text-sm font-bold text-yellow-400 text-right">
										{formatScore(entry.score, activeTab)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<div class="text-center py-8 text-theme-text-muted">
						<p>No entries yet. Be the first!</p>
					</div>
				{/if}
			</div>

			<!-- Footer with Next Challenge button -->
			<div class="border-t border-theme-border p-4 flex gap-2">
				<button
					onclick={onNextChallenge}
					class="flex-1 px-6 py-2.5 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg
						hover:opacity-90 active:scale-95 transition-all"
				>
					Next Challenge
				</button>
			</div>
		</div>
	</div>
{/if}
