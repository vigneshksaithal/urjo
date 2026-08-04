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

	let releaseToken = $state(0);
	const isInteractive = $derived(!locked && !isLoading);

	const animationDelay = $derived(
		rowIndex !== undefined && colIndex !== undefined
			? `${(rowIndex + colIndex) * 50}ms`
			: "0ms",
	);

	function handleCellClick(): void {
		if (!isInteractive) return;
		cycleColor();
		releaseToken += 1;
	}

	function handleKeyDown(event: KeyboardEvent): void {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		handleCellClick();
	}

	function cycleColor(): void {
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
	onclick={handleCellClick}
	onkeydown={handleKeyDown}
	role={isInteractive ? "button" : undefined}
	tabindex={isInteractive ? 0 : undefined}
	class="
		relative w-full aspect-square rounded-full
		flex items-center justify-center
		touch-manipulation select-none
		transition-[transform,filter] duration-300 ease-[cubic-bezier(0.2,0.9,0.2,1.25)]
		{isInteractive
			? 'group cursor-pointer hover:scale-[1.018] active:scale-[0.91] active:saturate-125'
			: 'cursor-default'}
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
		{#if isTutorialTarget}
			<div
				data-tutorial-glow-halo="true"
				class="absolute inset-[-28%] rounded-full pointer-events-none animate-tutorial-glow-halo"
			></div>
			<div
				data-tutorial-glow-ring="true"
				class="absolute inset-[-10%] rounded-full pointer-events-none animate-tutorial-glow-ring"
			></div>
			<div
				data-tutorial-glow-spark="true"
				class="absolute left-1/2 top-[16%] h-[14%] w-[14%] -translate-x-1/2 rounded-full bg-white/78 pointer-events-none blur-[1px] animate-tutorial-glow-spark"
			></div>
		{/if}
		<div
			data-tutorial-glow={isTutorialTarget ? "true" : undefined}
			class="absolute inset-0 rounded-full pointer-events-none bg-theme-empty-cell
				{isTutorialTarget
				? 'animate-tutorial-float ring-[1.5px] ring-[#94deff]/70 shadow-[inset_0_3px_10px_rgba(255,255,255,0.2),0_0_0_2px_rgba(94,188,255,0.12)]'
				: 'animate-empty-breathe'}"
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
			class="absolute inset-0 scale-100 rounded-full bg-[#E54E3E] blur-0 transition-[opacity,transform,filter] duration-500 ease-[cubic-bezier(0.2,0.9,0.2,1.25)] pointer-events-none group-active:scale-[1.08] group-active:blur-[0.2px]"
			class:opacity-0={isLoading}
		></div>
	{/if}

	<!-- Non-loading: filled blue -->
	{#if !isLoading && color === "blue"}
		<div
			class="absolute inset-0 scale-100 rounded-full bg-[#3997D7] blur-0 transition-[opacity,transform,filter] duration-500 ease-[cubic-bezier(0.2,0.9,0.2,1.25)] pointer-events-none group-active:scale-[1.08] group-active:blur-[0.2px]"
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

	@keyframes tutorialGlowHalo {
		0%,
		100% {
			opacity: 0.5;
			transform: scale(0.88);
			filter: blur(8px);
		}
		50% {
			opacity: 0.95;
			transform: scale(1.12);
			filter: blur(12px);
		}
	}

	.animate-tutorial-glow-halo {
		background: radial-gradient(
			circle,
			rgba(132, 219, 255, 0.32) 0%,
			rgba(85, 184, 255, 0.18) 36%,
			rgba(31, 113, 174, 0.12) 58%,
			rgba(85, 184, 255, 0) 80%
		);
		animation: tutorialGlowHalo 2.2s ease-in-out infinite;
	}

	@keyframes tutorialGlowRing {
		0%,
		100% {
			opacity: 0.45;
			transform: scale(0.9);
		}
		50% {
			opacity: 1;
			transform: scale(1.08);
		}
	}

	.animate-tutorial-glow-ring {
		box-shadow:
			inset 0 0 0 1px rgba(173, 231, 255, 0.72),
			0 0 0 6px rgba(85, 184, 255, 0.07),
			0 0 28px rgba(85, 184, 255, 0.26);
		animation: tutorialGlowRing 1.8s cubic-bezier(0.22, 1, 0.36, 1)
			infinite;
	}

	@keyframes tutorialGlowSpark {
		0%,
		100% {
			opacity: 0.48;
			transform: translateX(-50%) translateY(0) scale(0.88);
		}
		50% {
			opacity: 1;
			transform: translateX(-50%) translateY(-1px) scale(1.18);
		}
	}

	.animate-tutorial-glow-spark {
		box-shadow: 0 0 16px rgba(255, 255, 255, 0.72);
		animation: tutorialGlowSpark 1.35s ease-in-out infinite;
	}
</style>
