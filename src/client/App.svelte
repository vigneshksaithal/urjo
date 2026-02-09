<script lang="ts">
	import type { Grid, CellColor, GameState, NextChallengeResponse } from '../shared/types'
	import GameView from './views/GameView.svelte'
	import TutorialView from './views/TutorialView.svelte'
	import { deserializeGrid, serializeGrid } from './lib/utils'

	type View = 'tutorial' | 'game' | 'loading' | 'error'

	let currentView = $state<View>('loading')
	let grid = $state<Grid>([])
	let isCompleted = $state(false)
	let errorMessage = $state('')
	let puzzleColors = $state('')
	let puzzleNumbers = $state('')
	let puzzleSolution = $state('')
	let tutorialCompleted = $state(false)

	/**
	 * Auto-load game on mount.
	 */
	$effect(() => {
		loadGame()
	})

	/**
	 * Load game state from server.
	 */
	async function loadGame() {
		currentView = 'loading'

		try {
			const response = await fetch('/api/game/state')
			if (!response.ok) throw new Error('Failed to load game')

			const data: GameState = await response.json()

			puzzleColors = data.puzzle.colors
			puzzleNumbers = data.puzzle.numbers
			puzzleSolution = data.puzzle.solution
			tutorialCompleted = data.tutorialCompleted

			grid = deserializeGrid(data.puzzle.colors, data.puzzle.numbers, data.puzzle.colors)
			isCompleted = false

			if (!data.tutorialCompleted) {
				currentView = 'tutorial'
			} else {
				currentView = 'game'
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to load game'
			currentView = 'error'
		}
	}

	/**
	 * Handle cell color change during gameplay (purely client-side).
	 */
	function handleCellChange(row: number, col: number, color: CellColor) {
		const gridRow = grid[row]
		if (!gridRow) return
		const cell = gridRow[col]
		if (!cell) return
		if (cell.locked) return

		// Update grid immutably to ensure Svelte reactivity
		grid = grid.map((r, ri) =>
			ri === row
				? r.map((c, ci) =>
						ci === col ? { color, number: c.number, locked: c.locked } : c
					)
				: r
		)

		// Check completion client-side
		const boardString = serializeGrid(grid)
		if (boardString === puzzleSolution) {
			isCompleted = true
		}
	}

	/**
	 * Handle "Next Challenge" button.
	 */
	async function handleNextChallenge() {
		currentView = 'loading'

		try {
			const response = await fetch('/api/game/next-challenge', { method: 'POST' })
			if (!response.ok) throw new Error('Failed to get next challenge')

			const data: NextChallengeResponse = await response.json()

			puzzleColors = data.puzzle.colors
			puzzleNumbers = data.puzzle.numbers
			puzzleSolution = data.puzzle.solution
			grid = deserializeGrid(data.puzzle.colors, data.puzzle.numbers, data.puzzle.colors)
			isCompleted = false
			currentView = 'game'
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to load next challenge'
			currentView = 'error'
		}
	}

	/**
	 * Handle "Restart" button (purely client-side).
	 */
	function handleRestart() {
		grid = deserializeGrid(puzzleColors, puzzleNumbers, puzzleColors)
		isCompleted = false
	}

	/**
	 * Handle "How to Play" button.
	 */
	function handleHowToPlay() {
		currentView = 'tutorial'
	}

	/**
	 * Handle tutorial completion.
	 */
	async function handleTutorialComplete() {
		try {
			await fetch('/api/game/tutorial-complete', { method: 'POST' })
		} catch {
			// Non-critical, continue anyway
		}

		tutorialCompleted = true
		currentView = 'game'
	}
</script>

<div class="h-full w-full overflow-hidden bg-[#1a1a1a]">
	{#if currentView === 'loading'}
		<div class="h-full w-full flex flex-col items-center justify-center gap-6 p-8">
			<!-- Urjo Title -->
			<h1 class="text-5xl font-bold text-white">Urjo</h1>
			
			<!-- Skeleton Grid -->
			<div class="grid grid-cols-4 gap-2 w-full max-w-[340px]">
				{#each Array(16) as _, i}
					<div 
						class="w-full aspect-square rounded-full bg-gradient-to-br from-[#E54E3E]/30 to-[#3997D7]/30 animate-pulse-skeleton"
						style="animation-delay: {i * 50}ms"
					></div>
				{/each}
			</div>
			
			<!-- Loading Text -->
			<p class="text-sm text-gray-400">Loading your puzzle...</p>
		</div>
	{:else if currentView === 'error'}
		<div class="h-full w-full flex flex-col items-center justify-center p-8">
			<p class="text-xl text-red-400 mb-4">Error: {errorMessage}</p>
			<button
				onclick={loadGame}
				class="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
			>
				Retry
			</button>
		</div>
	{:else if currentView === 'tutorial'}
		<TutorialView
			onComplete={handleTutorialComplete}
			isReplay={tutorialCompleted}
		/>
	{:else if currentView === 'game'}
		<GameView
			{grid}
			{isCompleted}
			onCellChange={handleCellChange}
			onNextChallenge={handleNextChallenge}
			onRestart={handleRestart}
			onHowToPlay={handleHowToPlay}
		/>
	{/if}
</div>
