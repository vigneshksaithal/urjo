<script lang="ts">
	import type { Grid, CellColor, GameState, MoveResponse } from '../shared/types'
	import WelcomeView from './views/WelcomeView.svelte'
	import GameView from './views/GameView.svelte'
	import { deserializeGrid } from './lib/utils'

	type View = 'welcome' | 'game' | 'loading' | 'error'

	let currentView = $state<View>('welcome')
	let grid = $state<Grid>([])
	let isCompleted = $state(false)
	let errorMessage = $state('')
	let puzzleNumbers = $state('')
	let subredditName = $state('')

	async function handlePlay() {
		currentView = 'loading'

		try {
			const response = await fetch('/api/game/state')
			if (!response.ok) {
				throw new Error('Failed to load game')
			}

			const data: GameState = await response.json()

			// Deserialize the grid
			grid = deserializeGrid(data.userBoard, data.puzzle.numbers)
			puzzleNumbers = data.puzzle.numbers
			isCompleted = data.isCompleted

			// Get subreddit name from the URL or use default
			const pathMatch = window.location.pathname.match(/\/r\/([^/]+)/)
			subredditName = pathMatch ? pathMatch[1] : 'urjo'

			currentView = 'game'
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to load game'
			currentView = 'error'
		}
	}

	async function handleCellChange(row: number, col: number, color: CellColor) {
		// Optimistic update
		grid[row][col] = { ...grid[row][col], color }

		try {
			const response = await fetch('/api/game/move', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ row, col, color }),
			})

			if (!response.ok) {
				throw new Error('Failed to save move')
			}

			const data: MoveResponse = await response.json()

			// Update completed state
			if (data.isComplete) {
				isCompleted = true
			}

			// Update grid from server response (in case of validation issues)
			grid = deserializeGrid(data.board, puzzleNumbers)
		} catch (error) {
			console.error('Error saving move:', error)
			// Revert on error - refetch state
			const response = await fetch('/api/game/state')
			const data: GameState = await response.json()
			grid = deserializeGrid(data.userBoard, data.puzzle.numbers)
		}
	}
</script>

<div class="h-full w-full overflow-hidden bg-white dark:bg-[#0f0f0f]">
	{#if currentView === 'welcome'}
		<WelcomeView onPlay={handlePlay} />
	{:else if currentView === 'loading'}
		<div class="h-full w-full flex items-center justify-center">
			<p class="text-xl text-gray-600 dark:text-gray-300">Loading game...</p>
		</div>
	{:else if currentView === 'error'}
		<div class="h-full w-full flex flex-col items-center justify-center p-8">
			<p class="text-xl text-red-600 dark:text-red-400 mb-4">Error: {errorMessage}</p>
			<button
				onclick={() => (currentView = 'welcome')}
				class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
			>
				Back
			</button>
		</div>
	{:else if currentView === 'game'}
		<GameView {grid} {isCompleted} {subredditName} onCellChange={handleCellChange} />
	{/if}
</div>
