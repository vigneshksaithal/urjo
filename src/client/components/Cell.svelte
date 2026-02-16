<script lang="ts">
	import type { CellColor } from '../../shared/types'

	type Props = {
		color: CellColor
		number: number | null
		locked: boolean
		rowIndex?: number
		colIndex?: number
		isLoading: boolean
		onChange: (color: CellColor) => void
	}

	let { color, number, locked, rowIndex, colIndex, isLoading = false, onChange }: Props = $props()

	let pointerStartY = $state(0)
	const SWIPE_THRESHOLD = 20

	const animationDelay = $derived(
		rowIndex !== undefined && colIndex !== undefined
			? `${(rowIndex + colIndex) * 50}ms`
			: '0ms'
	)

	function handlePointerDown(e: PointerEvent) {
		if (locked) return
		pointerStartY = e.clientY
		;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
	}

	function handlePointerUp(e: PointerEvent) {
		if (locked) return
		const deltaY = pointerStartY - e.clientY

		if (Math.abs(deltaY) > SWIPE_THRESHOLD) {
			onChange(deltaY > 0 ? 'blue' : 'red')
		} else {
			cycleColor()
		}
	}

	function cycleColor() {
		if (color === null) {
			onChange('blue')
		} else if (color === 'blue') {
			onChange('red')
		} else {
			onChange(null)
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	onpointerdown={handlePointerDown}
	onpointerup={handlePointerUp}
	role={locked ? undefined : 'button'}
	tabindex={locked ? undefined : 0}
	class="
		relative w-full aspect-square rounded-full
		flex items-center justify-center
		touch-none select-none
		transition-transform
		{locked ? 'cursor-default' : 'active:scale-95 cursor-pointer'}
	"
>
	<!-- Loading state: animated empty cell with diagonal split -->
	{#if isLoading && color === null}
		<div class="absolute inset-0 overflow-hidden rounded-full">
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

	<!-- Empty cell: diagonal split with lighter red and blue -->
	{#if !isLoading && color === null}
		<div class="absolute inset-0 overflow-hidden rounded-full">
			<div
				class="absolute inset-0 bg-theme-empty-red"
				style="clip-path: polygon(0 0, 0 100%, 100% 100%)"
			></div>
			<div
				class="absolute inset-0 bg-theme-empty-blue"
				style="clip-path: polygon(0 0, 100% 0, 100% 100%)"
			></div>
		</div>
	{/if}

	<!-- Loading state: animated red cell -->
	{#if isLoading && (color === 'red' || color === null)}
		<div
			class="absolute inset-0 bg-[#E54E3E] rounded-full animate-loading-blue"
			style="animation-delay: {animationDelay}"
		></div>
	{/if}

	<!-- Loading state: animated blue cell -->
	{#if isLoading && color === 'blue'}
		<div
			class="absolute inset-0 bg-[#3997D7] rounded-full animate-loading-red"
			style="animation-delay: {animationDelay}"
		></div>
	{/if}

	<!-- Non-loading: filled red -->
	{#if !isLoading && color === 'red'}
		<div class="absolute inset-0 bg-[#E54E3E] rounded-full transition-opacity duration-500" class:opacity-0={isLoading}></div>
	{/if}

	<!-- Non-loading: filled blue -->
	{#if !isLoading && color === 'blue'}
		<div class="absolute inset-0 bg-[#3997D7] rounded-full transition-opacity duration-500" class:opacity-0={isLoading}></div>
	{/if}

	<!-- Number overlay -->
	{#if number !== null}
		<span
			class="absolute inset-0 flex items-center justify-center
				text-white font-bold text-3xl z-10 select-none pointer-events-none
				drop-shadow-md"
		>
			{number}
		</span>
	{/if}
</div>

<style>
	@keyframes loadingRedBlue {
		0%, 100% {
			background-color: #E54E3E;
		}
		50% {
			background-color: #3997D7;
		}
	}

	@keyframes loadingBlueRed {
		0%, 100% {
			background-color: #3997D7;
		}
		50% {
			background-color: #E54E3E;
		}
	}

	.animate-loading-red {
		animation: loadingRedBlue 600ms ease-in-out infinite;
	}

	.animate-loading-blue {
		animation: loadingBlueRed 600ms ease-in-out infinite;
	}
</style>
