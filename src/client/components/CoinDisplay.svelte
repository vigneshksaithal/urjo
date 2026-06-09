<script lang="ts">
	import Coins from "lucide-svelte/icons/coins";

	type Props = {
		coins: number;
		onClick?: () => void;
		/** Puzzle completion progress: 0–1. When provided, shows a fill strip to the left of the button. */
		progress?: number;
	};

	let { coins, onClick, progress }: Props = $props();

	const fillPct = $derived(
		progress !== undefined
			? Math.round(Math.min(1, Math.max(0, progress)) * 100)
			: undefined,
	);
</script>

<div class="flex items-center gap-2">
	{#if fillPct !== undefined}
		<div
			class="h-4 w-40 rounded-full bg-theme-border overflow-hidden"
			role="progressbar"
			aria-valuenow={fillPct}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-label="Puzzle progress"
		>
			<div
				class="h-full rounded-full bg-yellow-400 transition-[width] duration-300 ease-out"
				style="width: {fillPct}%"
			></div>
		</div>
	{/if}
	<button
		onclick={onClick}
		class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-theme-bg-secondary hover:bg-theme-hover transition-colors"
		aria-label="Open shop"
	>
		<Coins class="w-4 h-4 text-yellow-400" />
		<span class="text-sm font-bold text-yellow-400">{coins}</span>
	</button>
</div>
