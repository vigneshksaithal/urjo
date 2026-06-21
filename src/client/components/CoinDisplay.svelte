<script lang="ts">
	import BadgeDollarSign from "lucide-svelte/icons/badge-dollar-sign";
	import Check from "lucide-svelte/icons/check";
	import Flame from "lucide-svelte/icons/flame";

	const STREAK_DAYS = [0, 1, 2] as const;
	const CURRENT_STREAK_DAY_INDEX = 1;

	type Props = {
		coins: number;
		streak?: number;
	};

	let { coins, streak = 0 }: Props = $props();
	const streakUnit = $derived(streak === 1 ? "Day" : "Days");
</script>

<div
	class="flex w-full items-center justify-center px-1 pt-3 pb-3"
	aria-label="{streak}-{streakUnit.toLowerCase()} streak and {coins} coins"
>
	<div
		class="flex max-w-full min-w-0 items-center justify-center gap-2 rounded-full bg-theme-bg-secondary/85 border border-theme-border/70 px-2 py-2 shadow-sm sm:gap-3 sm:px-3"
	>
		<div
			class="flex shrink-0 items-center gap-2"
			title="{coins} coins"
		>
			<BadgeDollarSign
				class="size-6 text-amber-500"
			/>
			<span
				class="text-lg font-extrabold leading-none text-amber-500 sm:text-sm"
			>
				{coins}
			</span>
		</div>
		<div
			class="flex shrink-0 items-center gap-2 border-l border-theme-border/80 pl-2 sm:pl-3"
			title="{streak} {streakUnit} streak"
		>
			<Flame
				class="size-6 text-[#E54E3E] fill-[#E54E3E]"
			/>
			<span
				class="text-lg font-extrabold leading-none text-theme-text-primary sm:text-sm"
			>
				{streak} {streakUnit}
			</span>
		</div>
		<div class="flex items-center" aria-hidden="true">
			{#each STREAK_DAYS as day}
				<div class="flex items-center">
					<div
						class="flex size-7 items-center justify-center rounded-full border-4 transition-transform {day <
						CURRENT_STREAK_DAY_INDEX + 1
							? 'border-[#3997D7] bg-[#3997D7] shadow-[0_5px_14px_rgba(57,151,215,0.28)]'
							: 'border-[#E54E3E] bg-theme-bg-primary sm:border-dashed'} sm:size-6 sm:border-2"
					>
						{#if day < CURRENT_STREAK_DAY_INDEX + 1}
							<Check
								class="size-6 text-white stroke-[3]"
							/>
						{/if}
					</div>
					{#if day < STREAK_DAYS.length - 1}
						<div
							class="h-0.5 w-2 {day < CURRENT_STREAK_DAY_INDEX
								? 'bg-[#3997D7]'
								: 'bg-[#E54E3E]/45 border-t border-dashed border-[#E54E3E]/70'} sm:w-3"
						></div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>
