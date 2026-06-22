<script lang="ts">
	import { onDestroy } from "svelte";
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

	type InteractionState = "idle" | "pressing" | "releasing";

	let pointerStartY = $state(0);
	let interactionState = $state<InteractionState>("idle");
	let releaseToken = $state(0);
	let pressX = $state(50);
	let pressY = $state(50);
	let pressStartedAt = 0;
	let pointerActive = false;
	let pressure = $state(0);
	let targetPressure = 0;
	let pressureVelocity = 0;
	let lastSpringAt = 0;
	let queuedColor: CellColor | undefined;
	let releaseTimer: ReturnType<typeof setTimeout> | undefined;
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	let springFrame: ReturnType<typeof requestAnimationFrame> | undefined;
	const SWIPE_THRESHOLD = 20;
	const MIN_PRESS_MS = 260;
	const RELEASE_SETTLE_MS = 680;
	const SPRING_STIFFNESS = 38;
	const SPRING_DAMPING = 8.7;
	const PRESS_IMPULSE = 2.25;
	const RELEASE_IMPULSE = -1.15;

	const animationDelay = $derived(
		rowIndex !== undefined && colIndex !== undefined
			? `${(rowIndex + colIndex) * 50}ms`
			: "0ms",
	);
	const pressScale = $derived(
		gridSize === 8 ? 1.075 : gridSize === 6 ? 1.1 : 1.145,
	);
	const driftX = $derived((pressX - 50) * 0.035);
	const driftY = $derived((pressY - 50) * 0.035);
	const isActive = $derived(interactionState !== "idle");
	const visualPressure = $derived(Math.max(-0.08, Math.min(1.08, pressure)));
	const positivePressure = $derived(Math.max(0, visualPressure));
	const scale = $derived(1 + (pressScale - 1) * visualPressure);
	const lift = $derived(-1.45 * visualPressure);
	const shadowY = $derived(3 + 9 * positivePressure);
	const shadowBlur = $derived(4 + 14 * positivePressure);
	const shadowAlpha = $derived(0.12 + 0.1 * positivePressure);
	const surfaceScaleX = $derived(1 + 0.018 * visualPressure);
	const surfaceScaleY = $derived(1 - 0.012 * visualPressure);
	const glassOpacity = $derived(0.46 + 0.28 * positivePressure);
	const glassScale = $derived(1 - 0.026 * visualPressure);
	const glassLift = $derived(-1.05 * visualPressure);
	const fillBlur = $derived(0.2 * positivePressure);
	const rimAlpha = $derived(0.13 + 0.05 * positivePressure);
	const rimHighlight = $derived(0.14 + 0.06 * positivePressure);
	const rimShadow = $derived(0.12 + 0.01 * positivePressure);
	const fillColor = $derived(
		color === "red"
			? "#E54E3E"
			: color === "blue"
				? "#3997D7"
				: "var(--color-theme-empty-cell)",
	);
	const cellStyle = $derived(
		`--cell-scale: ${scale}; --cell-lift: ${lift}%; --cell-shadow-y: ${shadowY}px; --cell-shadow-blur: ${shadowBlur}px; --cell-shadow-alpha: ${shadowAlpha}; --cell-press-x: ${pressX}%; --cell-press-y: ${pressY}%; --cell-drift-x: ${driftX}%; --cell-drift-y: ${driftY}%; --cell-surface-scale-x: ${surfaceScaleX}; --cell-surface-scale-y: ${surfaceScaleY}; --cell-glass-opacity: ${glassOpacity}; --cell-glass-scale: ${glassScale}; --cell-glass-lift: ${glassLift}%; --cell-fill-blur: ${fillBlur}px; --cell-rim-alpha: ${rimAlpha}; --cell-rim-highlight: ${rimHighlight}; --cell-rim-shadow: ${rimShadow}; --cell-fill: ${fillColor}`,
	);

	function updatePressPoint(e: PointerEvent): void {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		pressX = ((e.clientX - rect.left) / rect.width) * 100;
		pressY = ((e.clientY - rect.top) / rect.height) * 100;
	}

	function handlePointerDown(e: PointerEvent) {
		if (locked) return;
		clearMotionTimers();
		pointerStartY = e.clientY;
		updatePressPoint(e);
		pressStartedAt = performance.now();
		pointerActive = true;
		interactionState = "pressing";
		setPressureTarget(1, PRESS_IMPULSE);
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent): void {
		if (interactionState === "idle" || locked) return;
		updatePressPoint(e);
	}

	function handlePointerUp(e: PointerEvent) {
		pointerActive = false;
		if (locked) {
			scheduleRelease();
			return;
		}
		const deltaY = pointerStartY - e.clientY;
		const nextColor =
			Math.abs(deltaY) > SWIPE_THRESHOLD
				? deltaY > 0
					? "blue"
					: "red"
				: getNextColor();

		queuedColor = nextColor;
		scheduleRelease();
	}

	function handlePointerCancel(): void {
		pointerActive = false;
		queuedColor = undefined;
		scheduleRelease();
	}

	function handleLostPointerCapture(): void {
		if (!pointerActive) return;
		handlePointerCancel();
	}

	function getNextColor(): CellColor {
		if (color === null) {
			return "blue";
		}
		return color === "blue" ? "red" : null;
	}

	function scheduleRelease(): void {
		clearReleaseTimer();
		const elapsed = performance.now() - pressStartedAt;
		const delay = Math.max(MIN_PRESS_MS - elapsed, 90);
		releaseTimer = setTimeout(() => {
			if (queuedColor !== undefined) {
				onChange(queuedColor);
				queuedColor = undefined;
			}
			interactionState = "releasing";
			setPressureTarget(0, RELEASE_IMPULSE);
			releaseToken += 1;
			releaseTimer = undefined;
			idleTimer = setTimeout(() => {
				interactionState = "idle";
				idleTimer = undefined;
			}, RELEASE_SETTLE_MS);
		}, delay);
	}

	function clearReleaseTimer(): void {
		if (releaseTimer === undefined) return;
		clearTimeout(releaseTimer);
		releaseTimer = undefined;
	}

	function clearIdleTimer(): void {
		if (idleTimer === undefined) return;
		clearTimeout(idleTimer);
		idleTimer = undefined;
	}

	function clearMotionTimers(): void {
		clearReleaseTimer();
		clearIdleTimer();
		queuedColor = undefined;
	}

	function setPressureTarget(nextTarget: number, impulse = 0): void {
		targetPressure = nextTarget;
		if (impulse > 0) {
			pressureVelocity = Math.max(pressureVelocity, impulse);
		} else if (impulse < 0) {
			pressureVelocity = Math.min(pressureVelocity, impulse);
		}
		startSpring();
	}

	function startSpring(): void {
		if (springFrame !== undefined) return;
		lastSpringAt = performance.now();
		springFrame = requestAnimationFrame(stepSpring);
	}

	function stepSpring(now: number): void {
		const dt = Math.min((now - lastSpringAt) / 1000, 0.032);
		lastSpringAt = now;

		const acceleration =
			(targetPressure - pressure) * SPRING_STIFFNESS -
			pressureVelocity * SPRING_DAMPING;
		pressureVelocity += acceleration * dt;
		pressure += pressureVelocity * dt;

		if (
			Math.abs(targetPressure - pressure) < 0.001 &&
			Math.abs(pressureVelocity) < 0.001
		) {
			pressure = targetPressure;
			pressureVelocity = 0;
			springFrame = undefined;
			return;
		}

		springFrame = requestAnimationFrame(stepSpring);
	}

	function stopSpring(): void {
		if (springFrame === undefined) return;
		cancelAnimationFrame(springFrame);
		springFrame = undefined;
	}

	onDestroy(() => {
		clearMotionTimers();
		stopSpring();
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerCancel}
	onlostpointercapture={handleLostPointerCapture}
	role={locked ? undefined : "button"}
	tabindex={locked ? undefined : 0}
	style={cellStyle}
	class="
		cell-button relative w-full aspect-square rounded-full
		flex items-center justify-center
		touch-none select-none
		{locked ? 'cursor-default' : 'cursor-pointer'}
		{interactionState === 'pressing' ? 'is-pressing' : ''}
		{interactionState === 'releasing' ? 'is-releasing' : ''}
		{isActive ? 'is-active' : ''}
		{hasError ? 'ring-2 ring-red-400/40' : ''}
	"
>
	{#key releaseToken}
		{#if releaseToken > 0}
			<div
				class="absolute inset-[-16%] rounded-full pointer-events-none animate-liquid-release"
			></div>
		{/if}
	{/key}

	<div class="absolute inset-0 rounded-full pointer-events-none cell-depth"></div>

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

	<!-- Stable non-loading surface: keep one layer mounted so fill changes can
	     animate instead of swapping whole colored circles. -->
	{#if !isLoading}
		<div
			class="absolute inset-0 rounded-full pointer-events-none cell-surface cell-fill
				{color === null
				? isTutorialTarget
					? 'animate-tutorial-float'
					: 'animate-empty-breathe'
				: ''}"
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
			class="absolute inset-0 bg-[#E54E3E] rounded-full animate-loading-blue pointer-events-none cell-surface"
			style="animation-delay: {animationDelay}"
		></div>
	{/if}

	<!-- Loading state: animated blue cell -->
	{#if isLoading && color === "blue"}
		<div
			class="absolute inset-0 bg-[#3997D7] rounded-full animate-loading-red pointer-events-none cell-surface"
			style="animation-delay: {animationDelay}"
		></div>
	{/if}

	<div class="absolute inset-0 rounded-full pointer-events-none cell-glass"></div>
	<div class="absolute inset-0 rounded-full pointer-events-none cell-rim"></div>

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
	.cell-button {
		isolation: isolate;
		overflow: visible;
		transform: translateY(var(--cell-lift)) scale(var(--cell-scale))
			translateZ(0);
		transform-origin: center;
		will-change: transform, filter;
		filter: drop-shadow(
			0 var(--cell-shadow-y) var(--cell-shadow-blur)
				rgba(0, 0, 0, var(--cell-shadow-alpha))
		);
	}

	.cell-button.is-pressing {
		z-index: 20;
	}

	.cell-button.is-releasing {
		z-index: 20;
	}

	.cell-depth {
		z-index: 0;
		box-shadow:
			0 5px 7px rgba(0, 0, 0, 0.2),
			0 1px 1px rgba(255, 255, 255, 0.08),
			inset 0 1px 1px rgba(255, 255, 255, 0.18),
			inset 0 -2px 3px rgba(0, 0, 0, 0.16);
	}

	.cell-button.is-active .cell-depth {
		box-shadow:
			0 15px 24px rgba(0, 0, 0, 0.32),
			0 4px 7px rgba(255, 255, 255, 0.1),
			inset 0 1px 2px rgba(255, 255, 255, 0.22),
			inset 0 -3px 6px rgba(0, 0, 0, 0.18);
	}

	.cell-surface {
		z-index: 1;
		box-shadow:
			inset 0 1px 1.5px rgba(255, 255, 255, 0.12),
			inset 0 -2px 3px rgba(0, 0, 0, 0.12);
		transform: scaleX(var(--cell-surface-scale-x))
			scaleY(var(--cell-surface-scale-y))
			translate(var(--cell-drift-x), var(--cell-drift-y));
		transform-origin: center;
		will-change: transform, filter;
	}

	.cell-fill {
		background-color: var(--cell-fill);
		filter: blur(var(--cell-fill-blur));
		transition:
			background-color 360ms cubic-bezier(0.2, 0.8, 0.2, 1),
			filter 420ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.cell-glass {
		z-index: 3;
		opacity: var(--cell-glass-opacity);
		background:
			radial-gradient(
				circle at var(--cell-press-x) var(--cell-press-y),
				rgba(255, 255, 255, 0.2),
				rgba(255, 255, 255, 0.06) 21%,
				transparent 42%
			),
			linear-gradient(
				150deg,
				rgba(255, 255, 255, 0.12) 0%,
				rgba(255, 255, 255, 0.04) 26%,
				transparent 52%,
				rgba(0, 0, 0, 0.08) 100%
			);
		transform: translateY(var(--cell-glass-lift))
			scale(var(--cell-glass-scale));
	}

	.cell-rim {
		z-index: 4;
		box-shadow:
			inset 0 0 0 0.75px rgba(255, 255, 255, var(--cell-rim-alpha)),
			inset 0 1px 0.5px rgba(255, 255, 255, var(--cell-rim-highlight)),
			inset 0 -1px 0.5px rgba(0, 0, 0, var(--cell-rim-shadow));
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
			opacity: 0.28;
			transform: scale(0.82);
			box-shadow:
				inset 0 0 0 3px rgba(255, 255, 255, 0.16),
				0 0 0 0 rgba(255, 255, 255, 0.08);
			filter: blur(1px);
		}
		48% {
			opacity: 0.2;
			transform: scale(1.03);
			box-shadow:
				inset 0 0 0 0.75px rgba(255, 255, 255, 0.14),
				0 6px 18px rgba(255, 255, 255, 0.07);
			filter: blur(4px);
		}
		100% {
			opacity: 0;
			transform: scale(1.16);
			box-shadow:
				inset 0 0 0 0 rgba(255, 255, 255, 0),
				0 0 0 0 rgba(255, 255, 255, 0);
			filter: blur(7px);
		}
	}

	.animate-liquid-release {
		z-index: 5;
		animation: liquidRelease 620ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	@media (prefers-reduced-motion: reduce) {
		.animate-liquid-release {
			animation: none;
		}
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
