<script lang="ts">
	import type { Grid, CellColor, GameState, MoveResponse, NextChallengeResponse, RestartResponse } from '../shared/types'
	import WelcomeView from './views/WelcomeView.svelte'
	import GameView from './views/GameView.svelte'
	import TutorialView from './views/TutorialView.svelte'
	import { deserializeGrid } from './lib/utils'

	type View = 'welcome' | 'tutorial' | 'game' | 'loading' | 'error'

	let currentView = $state<View>('welcome')
	let grid = $state<Grid>([])
	let isCompleted = $state(false)
	let errorMessage = $state('')
	let puzzleColors = $state('')
	let puzzleNumbers = $state('')
	let tutorialCompleted = $state(false)

	/**
	 * Handle "Play" button from welcome screen.
	 */
	async function handlePlay() {
		currentView = 'loading'

		try {
			const response = await fetch('/api/game/state')
			if (!response.ok) throw new Error('Failed to load game')

			const data: GameState = await response.json()

			puzzleColors = data.puzzle.colors
			puzzleNumbers = data.puzzle.numbers
			tutorialCompleted = data.tutorialCompleted

			grid = deserializeGrid(data.userBoard, data.puzzle.numbers, data.puzzle.colors)
			isCompleted = data.isCompleted

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
	 * Handle cell color change during gameplay.
	 */
	async function handleCellChange(row: number, col: number, color: CellColor) {
		const gridRow = grid[row]
		if (!gridRow) return
		const cell = gridRow[col]
		if (!cell) return
		if (cell.locked) return

		// Optimistic update -- immutable to ensure Svelte reactivity
		grid = grid.map((r, ri) =>
			ri === row
				? r.map((c, ci) =>
						ci === col ? { color, number: c.number, locked: c.locked } : c
					)
				: r
		)

		try {
			const response = await fetch('/api/game/move', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ row, col, color }),
			})

			if (!response.ok) throw new Error('Failed to save move')

			const data: MoveResponse = await response.json()

			if (data.isComplete) {
				isCompleted = true
			}

			grid = deserializeGrid(data.board, puzzleNumbers, puzzleColors)
		} catch (error) {
			console.error('Error saving move:', error)
			try {
				const response = await fetch('/api/game/state')
				const data: GameState = await response.json()
				grid = deserializeGrid(data.userBoard, data.puzzle.numbers, data.puzzle.colors)
			} catch {
				// silent fallback
			}
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
			grid = deserializeGrid(data.userBoard, data.puzzle.numbers, data.puzzle.colors)
			isCompleted = false
			currentView = 'game'
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to load next challenge'
			currentView = 'error'
		}
	}

	/**
	 * Handle "Restart" button.
	 */
	async function handleRestart() {
		currentView = 'loading'

		try {
			const response = await fetch('/api/game/restart', { method: 'POST' })
			if (!response.ok) throw new Error('Failed to restart')

			const data: RestartResponse = await response.json()

			grid = deserializeGrid(data.userBoard, puzzleNumbers, puzzleColors)
			isCompleted = false
			currentView = 'game'
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to restart'
			currentView = 'error'
		}
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
	{#if currentView === 'welcome'}
		<WelcomeView onPlay={handlePlay} />
	{:else if currentView === 'loading'}
		<div class="h-full w-full flex items-center justify-center">
			<p class="text-xl text-gray-300">Loading...</p>
		</div>
	{:else if currentView === 'error'}
		<div class="h-full w-full flex flex-col items-center justify-center p-8">
			<p class="text-xl text-red-400 mb-4">Error: {errorMessage}</p>
			<button
				onclick={() => (currentView = 'welcome')}
				class="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
			>
				Back
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
