<script lang="ts">
	import type { StreakData } from "../../shared/types";

	type Props = {
		streak: StreakData;
	};

	let { streak }: Props = $props();

	const hasStreak = $derived(streak.currentStreak > 0);
	const displayText = $derived(
		hasStreak
			? `🔥 ${streak.currentStreak} day${streak.currentStreak === 1 ? "" : "s"}`
			: "🔥",
	);
</script>

<div class="flex flex-col items-center">
	<div
		class="px-3 py-1 rounded-full bg-theme-hover backdrop-blur-sm border border-theme-border
			transition-all duration-300 hover:bg-theme-hover"
	>
		<span
			class="text-xs font-bold text-theme-text-primary whitespace-nowrap"
		>
			{displayText}
		</span>
	</div>
</div>
