<script lang="ts">
	import Coins from "lucide-svelte/icons/coins";

	type Props = {
		coins: number;
		onClick?: () => void;
	};

	let { coins, onClick }: Props = $props();
</script>

<button
	onclick={onClick}
	class="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-theme-bg-secondary hover:bg-theme-hover transition-colors"
	aria-label="Open shop"
>
	<Coins class="w-4 h-4 text-yellow-400" />
	<span class="text-sm font-bold text-yellow-400">{coins}</span>
</button>
