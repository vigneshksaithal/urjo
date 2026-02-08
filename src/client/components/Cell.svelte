<script lang="ts">
	import type { CellColor } from '../../shared/types'

	type Props = {
		color: CellColor
		number: number | null
		locked: boolean
		onChange: (color: CellColor) => void
	}

	let { color, number, locked, onChange }: Props = $props()

	let touchStartY = $state(0)
	const SWIPE_THRESHOLD = 20

	function handleTouchStart(e: TouchEvent) {
		if (locked) return
		touchStartY = e.touches[0]?.clientY ?? 0
	}

	function handleTouchEnd(e: TouchEvent) {
		if (locked) return
		const touchEndY = e.changedTouches[0]?.clientY ?? 0
		const deltaY = touchStartY - touchEndY

		if (Math.abs(deltaY) > SWIPE_THRESHOLD) {
			if (deltaY > 0) {
				onChange('blue')
			} else {
				onChange('red')
			}
		} else {
			cycleColor()
		}
	}

	function cycleColor() {
		if (locked) return
		if (color === null) {
			onChange('blue')
		} else if (color === 'blue') {
			onChange('red')
		} else {
			onChange(null)
		}
	}

	function handleClick() {
		if (locked) return
		cycleColor()
	}
</script>

<button
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
	onclick={handleClick}
	disabled={locked}
	class="
		relative w-full aspect-square rounded-full
		flex items-center justify-center
		transition-transform
		{locked ? 'cursor-default' : 'active:scale-95 cursor-pointer'}
	"
>
	<!-- Empty cell: diagonal split with dark colors -->
	{#if color === null}
		<div class="absolute inset-0 overflow-hidden rounded-full">
			<div
				class="absolute inset-0 bg-[#8B4A3E]"
				style="clip-path: polygon(0 0, 0 100%, 100% 100%)"
			></div>
			<div
				class="absolute inset-0 bg-[#3D5A6F]"
				style="clip-path: polygon(0 0, 100% 0, 100% 100%)"
			></div>
		</div>
	{/if}

	<!-- Filled red -->
	{#if color === 'red'}
		<div class="absolute inset-0 bg-[#E17560] rounded-full"></div>
	{/if}

	<!-- Filled blue -->
	{#if color === 'blue'}
		<div class="absolute inset-0 bg-[#5B9BD5] rounded-full"></div>
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
</button>
