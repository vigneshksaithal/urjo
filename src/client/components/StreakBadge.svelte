<script lang="ts">
	import type { StreakData } from '../../shared/types'

	type Props = {
		streak: StreakData
	}

	let { streak }: Props = $props()

	const hasStreak = $derived(streak.currentStreak > 0)
	const displayText = $derived(
		hasStreak ? `🔥 ${streak.currentStreak} day${streak.currentStreak === 1 ? '' : 's'}` : 'Start your streak!'
	)
</script>

<div class="flex flex-col items-center">
	<div
		class="px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20
			transition-all duration-300 hover:bg-white/20"
		class:animate-pulse={hasStreak}
	>
		<span class="text-xs font-bold text-white whitespace-nowrap">
			{displayText}
		</span>
	</div>
	{#if streak.longestStreak > 0 && streak.longestStreak > streak.currentStreak}
		<span class="text-[10px] text-gray-500 mt-0.5">
			Best: {streak.longestStreak}
		</span>
	{/if}
</div>
