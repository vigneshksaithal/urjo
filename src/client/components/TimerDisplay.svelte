<script lang="ts">
	import Timer from "lucide-svelte/icons/timer";

	type Props = {
		elapsedSeconds?: number;
	};

	let { elapsedSeconds = 0 }: Props = $props();
</script>

<div
	class="flex w-full items-center justify-center px-1 pt-3 pb-3"
	aria-label="{elapsedSeconds} seconds elapsed"
>
	<div
		class="flex max-w-full min-w-0 items-center justify-center gap-2 rounded-full bg-theme-bg-secondary/85 border border-theme-border/70 px-3 py-2 shadow-sm"
		title="{elapsedSeconds}s elapsed"
	>
		<Timer class="size-6 text-theme-text-secondary sm:size-4 md:size-5" />
		<span
			class="text-base font-medium leading-none text-theme-text-secondary sm:text-sm"
		>
			{elapsedSeconds}s
		</span>
	</div>
</div>
