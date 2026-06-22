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
		hintColor?: "blue" | "red" | undefined;
		isTutorialTarget?: boolean;
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
		isTutorialTarget = false,
		onChange,
	}: Props = $props();

	let pointerStartY = $state(0);
	let isPressed = $state(false);
	let releaseToken = $state(0);
	const SWIPE_THRESHOLD = 20;

	const animationDelay = $derived(
		rowIndex !== undefined && colIndex !== undefined
			? `${(rowIndex + colIndex) * 50}ms`
			: "0ms",
	);

	function handlePointerDown(e: PointerEvent) {
		if (locked) return;
		pointerStartY = e.clientY;
		isPressed = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handlePointerUp(e: PointerEvent) {
		if (locked) {
			isPressed = false;
			return;
		}
		const deltaY = pointerStartY - e.clientY;

		if (Math.abs(deltaY) > SWIPE_THRESHOLD) {
			onChange(deltaY > 0 ? "blue" : "red");
		} else {
			cycleColor();
		}
		isPressed = false;
		releaseToken += 1;
	}

	function handlePointerCancel(): void {
		isPressed = false;
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
	onpointercancel={handlePointerCancel}
	onlostpointercapture={handlePointerCancel}
	role={locked ? undefined : "button"}
	tabindex={locked ? undefined : 0}
	class="
		cell-button relative w-full aspect-square rounded-full
		flex items-center justify-center
		touch-none select-none isolate
		{locked ? 'cell-button-locked cursor-default' : 'cursor-pointer'}
		{isPressed ? 'cell-button-pressed z-20' : ''}
		{hasError ? 'ring-2 ring-red-400/40' : ''}
	"
>
	{#key releaseToken}
		{#if releaseToken > 0}
			<div
				class="absolute inset-[-12%] rounded-full pointer-events-none animate-liquid-release"
			></div>
		{/if}
	{/key}

	<!-- Loading state: animated empty cell with diagonal split -->
	{#if isLoading && color === null}
		<div
			class="cell-surface absolute inset-0 overflow-hidden rounded-full pointer-events-none"
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

	<!-- Empty cell: single neutral tone. Animated with a floating effect when
	     it's the tutorial target to draw attention to the cell to tap. -->
	{#if !isLoading && color === null}
		<div
			class="cell-surface absolute inset-0 rounded-full pointer-events-none bg-theme-empty-cell
				{isTutorialTarget ? 'animate-tutorial-float' : 'animate-empty-breathe'}"
		></div>
	{/if}

	<!-- Idle hint: bright pulsating hint color overlay on one correct empty cell -->
	{#if !isLoading && color === null && isHint && hintColor}
		<div
			class="cell-surface absolute inset-0 rounded-full pointer-events-none animate-hint-pulse
				{hintColor === 'blue'
				? 'bg-urjo-blue ring-4 ring-urjo-blue/60'
				: 'bg-urjo-coral ring-4 ring-urjo-coral/60'}"
		></div>
	{/if}

	<!-- Loading state: animated red cell -->
	{#if isLoading && (color === "red" || color === null)}
		<div
			class="cell-surface absolute inset-0 bg-[#E54E3E] rounded-full animate-loading-blue pointer-events-none"
			style="animation-delay: {animationDelay}"
		></div>
	{/if}

	<!-- Loading state: animated blue cell -->
	{#if isLoading && color === "blue"}
		<div
			class="cell-surface absolute inset-0 bg-[#3997D7] rounded-full animate-loading-red pointer-events-none"
			style="animation-delay: {animationDelay}"
		></div>
	{/if}

	<!-- Non-loading: filled red -->
	{#if !isLoading && color === "red"}
		<div
			class="cell-surface absolute inset-0 bg-[#E54E3E] rounded-full pointer-events-none"
			class:opacity-0={isLoading}
		></div>
	{/if}

	<!-- Non-loading: filled blue -->
	{#if !isLoading && color === "blue"}
		<div
			class="cell-surface absolute inset-0 bg-[#3997D7] rounded-full pointer-events-none"
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
