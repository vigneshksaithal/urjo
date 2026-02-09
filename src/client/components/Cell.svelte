<script lang="ts">
	import type { CellColor } from '../../shared/types'

	type Props = {
		color: CellColor
		number: number | null
		locked: boolean
		onChange: (color: CellColor) => void
	}

	let { color, number, locked, onChange }: Props = $props()

	let pointerStartY = $state(0)
	const SWIPE_THRESHOLD = 20

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
	<!-- Empty cell: diagonal split with dark colors -->
	{#if color === null}
		<div class="absolute inset-0 overflow-hidden rounded-full">
			<div
				class="absolute inset-0 bg-[#7B2D25]"
				style="clip-path: polygon(0 0, 0 100%, 100% 100%)"
			></div>
			<div
				class="absolute inset-0 bg-[#28516E]"
				style="clip-path: polygon(0 0, 100% 0, 100% 100%)"
			></div>
		</div>
	{/if}

	<!-- Filled red -->
	{#if color === 'red'}
		<div class="absolute inset-0 bg-[#E54E3E] rounded-full"></div>
	{/if}

	<!-- Filled blue -->
	{#if color === 'blue'}
		<div class="absolute inset-0 bg-[#3997D7] rounded-full"></div>
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
