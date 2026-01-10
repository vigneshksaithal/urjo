<script lang="ts">
	import { navigateTo } from '@devvit/web/client'
	import type { CellColor, Grid } from '../../shared/types'
	import ConfettiEffect from '../components/ConfettiEffect.svelte'
	import GameBoard from '../components/GameBoard.svelte'
	import HowToPlayModal from '../components/HowToPlayModal.svelte'

	type Props = {
		grid: Grid
		onCellChange: (row: number, col: number, color: CellColor) => void
		isCompleted: boolean
		subredditName?: string
	}

	let {
		grid,
		onCellChange,
		isCompleted,
		subredditName = 'urjo',
	}: Props = $props()
	let showHowToPlay = $state(false)
</script>

<div class="h-full w-full flex flex-col p-4">
	<!-- Header -->
	<header class="flex-none h-12 flex items-center justify-between px-4">
		<button
			onclick={() => (showHowToPlay = true)}
			class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
		>
			How to Play
		</button>
		<h1 class="text-2xl font-bold text-gray-800 dark:text-white">Urjo Game</h1>
		<div class="w-20"></div>
		<!-- Spacer for centering -->
	</header>

	<!-- Main game area -->
	<main class="flex-1 min-h-0 flex flex-col items-center justify-center gap-4">
		<!-- Join message -->
		<p class="text-sm text-gray-600 dark:text-gray-300 text-center">
			Join <button
				onclick={() => navigateTo(`https://www.reddit.com/r/${subredditName}`)}
				class="text-blue-600 dark:text-blue-400 font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer"
				>r/{subredditName}</button
			>
			for more puzzles!
		</p>

		<!-- Game board -->
		<GameBoard {grid} {onCellChange} />

		<!-- Completion message -->
		{#if isCompleted}
			<p
				class="text-lg font-bold text-green-600 dark:text-green-400 animate-pulse"
			>
				🎉 Completed!
			</p>
		{/if}
	</main>

	<!-- Footer with instructions -->
	<footer class="flex-none h-16 flex items-center justify-center">
		<p class="text-xs text-gray-500 dark:text-gray-400 text-center">
			Tap to cycle colors
		</p>
	</footer>
</div>

<!-- Confetti effect -->
{#if isCompleted}
	<ConfettiEffect />
{/if}

<!-- How to Play modal -->
<HowToPlayModal
	isOpen={showHowToPlay}
	onClose={() => (showHowToPlay = false)}
/>
