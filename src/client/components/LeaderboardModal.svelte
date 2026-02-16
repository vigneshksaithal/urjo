<script lang="ts">
	import type { LeaderboardData } from '../../shared/types'
	import Trophy from 'lucide-svelte/icons/trophy'
	import Flame from 'lucide-svelte/icons/flame'
	import Zap from 'lucide-svelte/icons/zap'
	import X from 'lucide-svelte/icons/x'

	type Props = {
		isOpen: boolean
		onClose: () => void
		onNextChallenge: () => void
	}

	let { isOpen, onClose, onNextChallenge }: Props = $props()

	let activeTab = $state<'streak' | 'speed'>('streak')
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
			const response = await fetch(`/api/game/leaderboard?type=${activeTab}`)
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

	function handleTabChange(tab: 'streak' | 'speed') {
		activeTab = tab
		fetchLeaderboard()
	}

	function formatScore(score: number, type: 'streak' | 'speed'): string {
		if (type === 'streak') {
			return `${score} day${score === 1 ? '' : 's'}`
		} else {
			return `${score}s`
		}
	}
</script>

{#if isOpen}
	<!-- Modal backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4"
		onclick={onClose}
	>
		<!-- Modal content -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="bg-[#1a1a1a] rounded-xl border border-white/20 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-white/10">
				<div class="flex items-center gap-2">
					<Trophy class="w-5 h-5 text-yellow-400" />
					<h2 class="text-lg font-bold text-white">Leaderboard</h2>
				</div>
				<button
					onclick={onClose}
					class="text-gray-400 hover:text-white transition-colors p-1"
					aria-label="Close"
				>
					<X class="w-5 h-5" />
				</button>
			</div>

			<!-- Tabs -->
			<div class="flex border-b border-white/10">
				<button
					onclick={() => handleTabChange('streak')}
					class="flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors
						{activeTab === 'streak' ? 'text-white bg-white/10 border-b-2 border-yellow-400' : 'text-gray-400 hover:text-white'}"
				>
					<Flame class="w-4 h-4" />
					<span>Streaks</span>
				</button>
				<button
					onclick={() => handleTabChange('speed')}
					class="flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors
						{activeTab === 'speed' ? 'text-white bg-white/10 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}"
				>
					<Zap class="w-4 h-4" />
					<span>Speed (Today)</span>
				</button>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-y-auto">
				{#if isLoading}
					<div class="flex items-center justify-center py-8">
						<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
					</div>
				{:else if error}
					<div class="text-center py-8 text-red-400">
						<p>{error}</p>
					</div>
				{:else if leaderboardData && leaderboardData.entries.length > 0}
					<!-- Table layout -->
					<table class="w-full border-collapse">
						<thead>
							<tr class="border-b border-white/10 text-left text-xs text-gray-400">
								<th class="px-4 py-2 font-medium">Rank</th>
								<th class="px-4 py-2 font-medium">Player</th>
								<th class="px-4 py-2 font-medium text-right">
									{activeTab === 'streak' ? 'Streak' : 'Time'}
								</th>
							</tr>
						</thead>
						<tbody>
							{#each leaderboardData.entries as entry}
								<tr
									class="border-b border-white/10 transition-colors
										{leaderboardData.userRank === entry.rank ? 'bg-green-500/20 text-green-400' : 'hover:bg-white/5'}"
								>
									<td class="px-4 py-3 text-sm">
										{entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `${entry.rank}.`}
									</td>
									<td class="px-4 py-3 text-sm font-medium">
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
					<div class="text-center py-8 text-gray-400">
						<p>No entries yet. Be the first!</p>
					</div>
				{/if}
			</div>

			<!-- Footer with Next Challenge button -->
			<div class="border-t border-white/10 p-4 flex gap-2">
				<button
					onclick={onNextChallenge}
					class="flex-1 px-6 py-2.5 bg-[#f5f5dc] text-gray-900 font-bold rounded-lg
						hover:bg-[#e8e6d0] active:scale-95 transition-all"
				>
					Next Challenge
				</button>
			</div>
		</div>
	</div>
{/if}
