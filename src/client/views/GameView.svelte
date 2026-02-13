<script lang="ts">
	import type { CellColor, Grid } from '../../shared/types'
	import ConfettiEffect from '../components/ConfettiEffect.svelte'
	import GameBoard from '../components/GameBoard.svelte'

	type Props = {
		grid: Grid
		onCellChange: (row: number, col: number, color: CellColor) => void
		isCompleted: boolean
		onNextChallenge: () => void
		onRestart: () => void
		onHowToPlay: () => void
	}

	let {
		grid,
		onCellChange,
		isCompleted,
		onNextChallenge,
		onRestart,
		onHowToPlay,
	}: Props = $props()
</script>

<div class="h-full w-full flex flex-col p-4 overflow-hidden">
	<!-- Header -->
	<header class="flex-none h-10 flex items-center justify-between px-2">
		<button
			onclick={onHowToPlay}
			class="text-sm font-medium text-blue-400 hover:underline"
		>
			How to Play
		</button>
		<h1 class="text-xl font-bold text-white">Urjo</h1>
		{#if !isCompleted}
			<button
				onclick={onNextChallenge}
				class="text-sm font-medium text-blue-400 hover:underline"
			>
				New Puzzle
			</button>
		{:else}
			<div class="w-20"></div>
		{/if}
	</header>

	<!-- Main game area -->
	<main class="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 relative">
		<!-- Upvote request -->
		<p class="text-sm text-gray-500 text-center">
			Enjoying Urjo? Upvote if you like it!
		</p>

		<!-- Game board -->
		<GameBoard {grid} {onCellChange} />

		<!-- Completion overlay -->
		{#if isCompleted}
			<div class="absolute inset-0 flex flex-col items-center justify-center z-20">
				<div class="flex flex-col items-center gap-3">
					<p class="text-lg font-bold text-white font-mono">
						Puzzle complete!
					</p>
					<button
						onclick={onNextChallenge}
						class="px-8 py-2.5 bg-white text-black font-bold rounded-lg
							text-base hover:bg-gray-100 active:scale-95 transition-all"
					>
						Next Challenge
					</button>
					<button
						onclick={onRestart}
						class="px-6 py-1.5 border border-white/50 text-white/80 rounded-lg
							text-sm hover:bg-white/10 active:scale-95 transition-all"
					>
						Restart
					</button>
				</div>
			</div>
		{/if}
	</main>

	<!-- Footer instructions -->
	<footer class="flex-none h-10 flex items-center justify-center">
		{#if !isCompleted}
			<p class="text-xs text-gray-400 text-center">
				Tap to cycle colors
			</p>
		{/if}
	</footer>
</div>

<!-- Confetti effect -->
{#if isCompleted}
	<ConfettiEffect />
{/if}
