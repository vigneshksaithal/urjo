<script lang="ts">
	import type { CellColor } from '../../shared/types'

	type Props = {
		color: CellColor
		onChange: (color: CellColor) => void
	}

	let { color, onChange }: Props = $props()

	let touchStartY = $state(0)
	const SWIPE_THRESHOLD = 20

	function handleTouchStart(e: TouchEvent) {
		touchStartY = e.touches[0].clientY
	}

	function handleTouchEnd(e: TouchEvent) {
		const touchEndY = e.changedTouches[0].clientY
		const deltaY = touchStartY - touchEndY

		if (Math.abs(deltaY) > SWIPE_THRESHOLD) {
			// Swipe detected
			if (deltaY > 0) {
				// Swipe up → blue
				onChange('blue')
			} else {
				// Swipe down → red
				onChange('red')
			}
		} else {
			// Tap → cycle colors
			cycleColor()
		}
	}

	function cycleColor() {
		if (color === null) {
			onChange('red')
		} else if (color === 'red') {
			onChange('blue')
		} else {
			onChange(null)
		}
	}
</script>

<button
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
	onclick={cycleColor}
	class="
    relative h-20 w-20 rounded-full
    flex items-center justify-center
    transition-transform active:scale-95
  "
>
	<!-- Empty cells: diagonal split with DARK colors -->
	{#if color === null}
		<div class="absolute inset-0 overflow-hidden rounded-full">
			<!-- Dark coral half (bottom-left triangle) -->
			<div
				class="absolute inset-0 bg-[#8B4A3E]"
				style="clip-path: polygon(0 0, 0 100%, 100% 100%)"
			></div>
			<!-- Dark blue half (top-right triangle) -->
			<div
				class="absolute inset-0 bg-[#3D5A6F]"
				style="clip-path: polygon(0 0, 100% 0, 100% 100%)"
			></div>
		</div>
	{/if}

	<!-- Filled cells: bright solid colors -->
	{#if color === 'red'}
		<div class="absolute inset-0 bg-[#E17560] rounded-full"></div>
	{/if}
	{#if color === 'blue'}
		<div class="absolute inset-0 bg-[#5B9BD5] rounded-full"></div>
	{/if}
</button>
