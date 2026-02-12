<script lang="ts">
	import type { Grid, CellColor, GameState, NextChallengeResponse } from '../shared/types'
	import GameView from './views/GameView.svelte'
	import TutorialView from './views/TutorialView.svelte'
	import { deserializeGrid, serializeGrid } from './lib/utils'

	type View = 'game' | 'tutorial' | 'error'

	const PLACEHOLDER_COLORS = 'brbbrbbrbrbbrbrbbrbbrbbrbrbbrbrbbrbbrbbrbbrb'
	const PLACEHOLDER_NUMBERS = '----------------'

	let currentView = $state<View>('game')
	let grid = $state<Grid>(createPlaceholderGrid())
	let isCompleted = $state(false)
	let errorMessage = $state('')
	let puzzleColors = $state(PLACEHOLDER_COLORS)
	let puzzleNumbers = $state(PLACEHOLDER_NUMBERS)
	let puzzleSolution = $state('')
	let tutorialCompleted = $state(false)

	function createPlaceholderGrid(): Grid {
		const result: Grid = []
		let index = 0
		for (let row = 0; row < 4; row++) {
			const rowCells = []
			for (let col = 0; col < 4; col++) {
				const colorChar = PLACEHOLDER_COLORS[index]
				const color: CellColor = colorChar === 'r' ? 'red' : colorChar === 'b' ? 'blue' : null
				rowCells.push({ color, number: null, locked: false, isLoading: true })
				index++
			}
			result.push(rowCells)
		}
		return result
	}

	$effect(() => {
		loadGame()
	})

	async function loadGame() {
		try {
			const response = await fetch('/api/game/state')
			if (!response.ok) throw new Error('Failed to load game')

			const data: GameState = await response.json()

			puzzleColors = data.puzzle.colors
			puzzleNumbers = data.puzzle.numbers
			puzzleSolution = data.puzzle.solution
			tutorialCompleted = data.tutorialCompleted

			grid = deserializeGrid(data.puzzle.colors, data.puzzle.numbers, data.puzzle.colors)
				.map(row => row.map(cell => ({ ...cell, isLoading: false })))
			isCompleted = false

			if (!data.tutorialCompleted) {
				currentView = 'tutorial'
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
		try {
			const response = await fetch('/api/game/next-challenge', { method: 'POST' })
			if (!response.ok) throw new Error('Failed to get next challenge')

			const data: NextChallengeResponse = await response.json()

			puzzleColors = data.puzzle.colors
			puzzleNumbers = data.puzzle.numbers
			puzzleSolution = data.puzzle.solution
			grid = deserializeGrid(data.puzzle.colors, data.puzzle.numbers, data.puzzle.colors)
				.map(row => row.map(cell => ({ ...cell, isLoading: false })))
			isCompleted = false
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
	{#if currentView === 'error'}
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
