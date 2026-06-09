<script lang="ts">
	import type { CellColor } from "../../shared/types";

	type Props = {
		color: CellColor;
		number: number | null;
		locked: boolean;
		rowIndex?: number;
		colIndex?: number;
		isLoading: boolean;
		hasError?: boolean;
		gridSize?: number;
		isHint?: boolean;
		hintColor?: "blue" | "red";
		onChange: (color: CellColor) => void;
	};

	let {
		color,
		number,
		locked,
		rowIndex,
		colIndex,
		isLoading = false,
		hasError = false,
		gridSize,
		isHint = false,
		hintColor,
		onChange,
	}: Props = $props();

	let pointerStartY = $state(0);
	const SWIPE_THRESHOLD = 20;

	const animationDelay = $derived(
		rowIndex !== undefined && colIndex !== undefined
			? `${(rowIndex + colIndex) * 50}ms`
			: "0ms",
	);

	function handlePointerDown(e: PointerEvent) {
		if (locked) return;
		pointerStartY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handlePointerUp(e: PointerEvent) {
		if (locked) return;
		const deltaY = pointerStartY - e.clientY;

		if (Math.abs(deltaY) > SWIPE_THRESHOLD) {
			onChange(deltaY > 0 ? "blue" : "red");
		} else {
			cycleColor();
		}
	}

	function cycleColor() {
		if (color === null) {
			onChange("blue");
		} else if (color === "blue") {
			onChange("red");
		} else {
			onChange(null);
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	onpointerdown={handlePointerDown}
	onpointerup={handlePointerUp}
	role={locked ? undefined : "button"}
	tabindex={locked ? undefined : 0}
	class="
		relative w-full aspect-square rounded-full
		flex items-center justify-center
		touch-none select-none
		transition-transform
		{locked ? 'cursor-default' : 'active:scale-95 cursor-pointer'}
		{hasError ? 'ring-2 ring-red-400/40' : ''}
	"
>
	<!-- Loading state: animated empty cell with diagonal split -->
	{#if isLoading && color === null}
		<div
			class="absolute inset-0 overflow-hidden rounded-full pointer-events-none"
		>
			<div
				class="absolute inset-0 bg-[#E54E3E] animate-loading-red"
				style="clip-path: polygon(0 0, 0 100%, 100% 100%); animation-delay: {animationDelay}"
			></div>
			<div
				class="absolute inset-0 bg-[#3997D7] animate-loading-blue"
				style="clip-path: polygon(0 0, 100% 0, 100% 100%); animation-delay: {animationDelay}"
			></div>
		</div>
	{/if}

	<!-- Empty cell: single neutral tone — replaces the old red/blue split that
	     ambiguously implied "this cell is both colors". Subtle ambient breathe
	     keeps the board feeling alive while the player is thinking. -->
	{#if !isLoading && color === null}
		<div
			class="absolute inset-0 rounded-full pointer-events-none bg-theme-empty-cell animate-empty-breathe"
		></div>
	{/if}

	<!-- Idle hint: bright pulsating hint color overlay on one correct empty cell -->
	{#if !isLoading && color === null && isHint && hintColor}
		<div
			class="absolute inset-0 rounded-full pointer-events-none animate-hint-pulse
				{hintColor === 'blue'
				? 'bg-urjo-blue ring-4 ring-urjo-blue/60'
				: 'bg-urjo-coral ring-4 ring-urjo-coral/60'}"
		></div>
	{/if}

	<!-- Loading state: animated red cell -->
	{#if isLoading && (color === "red" || color === null)}
		<div
			class="absolute inset-0 bg-[#E54E3E] rounded-full animate-loading-blue pointer-events-none"
			style="animation-delay: {animationDelay}"
		></div>
	{/if}

	<!-- Loading state: animated blue cell -->
	{#if isLoading && color === "blue"}
		<div
			class="absolute inset-0 bg-[#3997D7] rounded-full animate-loading-red pointer-events-none"
			style="animation-delay: {animationDelay}"
		></div>
	{/if}

	<!-- Non-loading: filled red -->
	{#if !isLoading && color === "red"}
		<div
			class="absolute inset-0 bg-[#E54E3E] rounded-full transition-opacity duration-500 pointer-events-none"
			class:opacity-0={isLoading}
		></div>
	{/if}

	<!-- Non-loading: filled blue -->
	{#if !isLoading && color === "blue"}
		<div
			class="absolute inset-0 bg-[#3997D7] rounded-full transition-opacity duration-500 pointer-events-none"
			class:opacity-0={isLoading}
		></div>
	{/if}

	<!-- Number overlay -->
	{#if number !== null}
		<span
			class="absolute inset-0 flex items-center justify-center
				text-white font-medium {gridSize === 8
				? 'text-xl'
				: gridSize === 6
					? 'text-4xl'
					: 'text-6xl'} z-10 select-none pointer-events-none
				drop-shadow-md"
		>
			{number}
		</span>
	{/if}
</div>

<style>
	@keyframes loadingRedBlue {
		0%,
		100% {
			background-color: #e54e3e;
		}
		50% {
			background-color: #3997d7;
		}
	}

	@keyframes loadingBlueRed {
		0%,
		100% {
			background-color: #3997d7;
		}
		50% {
			background-color: #e54e3e;
		}
	}

	.animate-loading-red {
		animation: loadingRedBlue 600ms ease-in-out infinite;
	}

	.animate-loading-blue {
		animation: loadingBlueRed 600ms ease-in-out infinite;
	}

	@keyframes hintPulse {
		0%,
		100% {
			opacity: 0.5;
			transform: scale(0.88);
		}
		50% {
			opacity: 1;
			transform: scale(1.05);
		}
	}

	.animate-hint-pulse {
		animation: hintPulse 1s ease-in-out infinite;
	}
</style>
