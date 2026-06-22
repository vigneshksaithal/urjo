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
		cell-shell relative w-full aspect-square rounded-full
		flex items-center justify-center
		touch-none select-none
		transition-[transform,scale,filter,box-shadow]
		{locked ? 'cursor-default' : 'cursor-pointer hover:scale-[1.018]'}
		{hasError ? 'ring-2 ring-red-400/40' : ''}
	"
	class:cell-shell-pressed={isPressed}
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

	<!-- Empty cell: single neutral tone. Animated with a floating effect when
	     it's the tutorial target to draw attention to the cell to tap. -->
	{#if !isLoading && color === null}
		<div
			class="cell-face absolute inset-0 rounded-full pointer-events-none bg-theme-empty-cell
				{isTutorialTarget ? 'animate-tutorial-float' : 'animate-empty-breathe'}"
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
			class="cell-face absolute inset-0 bg-[#E54E3E] rounded-full animate-loading-blue pointer-events-none"
			style="animation-delay: {animationDelay}"
		></div>
	{/if}

	<!-- Loading state: animated blue cell -->
	{#if isLoading && color === "blue"}
		<div
			class="cell-face absolute inset-0 bg-[#3997D7] rounded-full animate-loading-red pointer-events-none"
			style="animation-delay: {animationDelay}"
		></div>
	{/if}

	<!-- Non-loading: filled red -->
	{#if !isLoading && color === "red"}
		<div
			class="cell-face absolute inset-0 bg-[#E54E3E] rounded-full transition-[opacity,transform,scale,filter] pointer-events-none {isPressed
				? 'scale-[1.035]'
				: 'scale-100'}"
			class:opacity-0={isLoading}
		></div>
	{/if}

	<!-- Non-loading: filled blue -->
	{#if !isLoading && color === "blue"}
		<div
			class="cell-face absolute inset-0 bg-[#3997D7] rounded-full transition-[opacity,transform,scale,filter] pointer-events-none {isPressed
				? 'scale-[1.035]'
				: 'scale-100'}"
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
	.cell-shell {
		box-shadow:
			inset 0 1px 1px rgba(255, 255, 255, 0.32),
			inset 0 -3px 5px rgba(0, 0, 0, 0.28),
			0 5px 9px rgba(0, 0, 0, 0.22),
			0 1px 1px rgba(0, 0, 0, 0.22);
		transition-duration: 210ms, 210ms, 210ms, 240ms;
		transition-timing-function:
			cubic-bezier(0.16, 1, 0.3, 1),
			cubic-bezier(0.16, 1, 0.3, 1),
			cubic-bezier(0.16, 1, 0.3, 1),
			cubic-bezier(0.16, 1, 0.3, 1);
	}

	.cell-shell::before,
	.cell-shell::after {
		content: "";
		position: absolute;
		inset: 0;
		z-index: 8;
		border-radius: inherit;
		pointer-events: none;
		transition:
			opacity 210ms cubic-bezier(0.16, 1, 0.3, 1),
			transform 210ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.cell-shell::before {
		border: 1px solid rgba(255, 255, 255, 0.3);
		box-shadow:
			inset 0 1.5px 2px rgba(255, 255, 255, 0.36),
			inset 0 -1px 2px rgba(0, 0, 0, 0.18);
	}

	.cell-shell::after {
		background:
			linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.22) 0%,
				rgba(255, 255, 255, 0.08) 33%,
				rgba(255, 255, 255, 0) 62%
			);
		opacity: 0.72;
	}

	.cell-shell-pressed {
		transform: scale(0.94) translateY(1px);
		filter: saturate(1.06);
		box-shadow:
			inset 0 2px 4px rgba(255, 255, 255, 0.24),
			inset 0 -1px 2px rgba(0, 0, 0, 0.2),
			0 2px 4px rgba(0, 0, 0, 0.2);
		transition-duration: 80ms, 80ms, 80ms, 80ms;
		transition-timing-function:
			cubic-bezier(0.2, 0, 0, 1),
			cubic-bezier(0.2, 0, 0, 1),
			cubic-bezier(0.2, 0, 0, 1),
			cubic-bezier(0.2, 0, 0, 1);
	}

	.cell-shell-pressed::before,
	.cell-shell-pressed::after {
		opacity: 1;
		transform: scale(0.985);
		transition-duration: 80ms;
	}

	.cell-shell-pressed::after {
		background:
			linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.4) 0%,
				rgba(255, 255, 255, 0.2) 38%,
				rgba(255, 255, 255, 0.04) 70%
			);
	}

	.cell-face {
		transition-duration: 210ms;
		transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
	}

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

	@keyframes liquidRelease {
		0% {
			opacity: 0.45;
			transform: scale(0.72);
			box-shadow:
				inset 0 0 0 8px rgba(255, 255, 255, 0.28),
				0 0 0 0 rgba(255, 255, 255, 0.16);
			filter: blur(2px);
		}
		55% {
			opacity: 0.25;
			transform: scale(1.08);
			box-shadow:
				inset 0 0 0 1px rgba(255, 255, 255, 0.22),
				0 8px 26px rgba(255, 255, 255, 0.12);
			filter: blur(5px);
		}
		100% {
			opacity: 0;
			transform: scale(1.28);
			box-shadow:
				inset 0 0 0 0 rgba(255, 255, 255, 0),
				0 0 0 0 rgba(255, 255, 255, 0);
			filter: blur(8px);
		}
	}

	.animate-liquid-release {
		animation: liquidRelease 520ms cubic-bezier(0.2, 0.9, 0.2, 1);
	}

	/* Floating water-like animation for tutorial target cell.
	   Uses --color-urjo-blue for the tint to stay consistent with theme. */
	@keyframes tutorialFloat {
		0%,
		100% {
			transform: translateY(0) scale(1);
			background-color: var(--color-theme-empty-cell);
		}
		25% {
			transform: translateY(-3px) scale(1.03);
			background-color: color-mix(
				in srgb,
				var(--color-theme-empty-cell) 90%,
				var(--color-urjo-blue) 10%
			);
		}
		50% {
			transform: translateY(0) scale(1);
			background-color: color-mix(
				in srgb,
				var(--color-theme-empty-cell) 80%,
				var(--color-urjo-blue) 20%
			);
		}
		75% {
			transform: translateY(3px) scale(1.03);
			background-color: color-mix(
				in srgb,
				var(--color-theme-empty-cell) 90%,
				var(--color-urjo-blue) 10%
			);
		}
	}

	.animate-tutorial-float {
		animation: tutorialFloat 2s ease-in-out infinite;
	}
</style>
