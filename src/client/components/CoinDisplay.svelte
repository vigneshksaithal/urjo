<script lang="ts">
	import Flame from "lucide-svelte/icons/flame";

	type Props = {
		streak?: number;
	};

	let { streak = 0 }: Props = $props();
	const streakUnit = $derived(streak === 1 ? "Day" : "Days");
</script>

<div
	class="flex w-full items-center justify-center px-1 pt-3 pb-3"
	aria-label="{streak}-{streakUnit.toLowerCase()} streak"
>
	<div
		class="flex max-w-full min-w-0 items-center justify-center gap-2 rounded-full bg-theme-bg-secondary/85 border border-theme-border/70 px-2 py-2 shadow-sm sm:gap-3 sm:px-3"
	>
		<div
			class="flex shrink-0 items-center gap-2"
			title="{streak} {streakUnit} streak"
		>
			<Flame
				class="size-7 sm:size-5 md:size-6 text-[#E54E3E] fill-[#E54E3E]"
			/>
			<span
				class="text-base font-medium leading-none text-theme-text-primary sm:text-sm"
			>
				{streak} {streakUnit}
			</span>
		</div>
	</div>
</div>
