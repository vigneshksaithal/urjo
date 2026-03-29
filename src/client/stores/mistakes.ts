import { writable } from 'svelte/store'

// Track how many times each cell has been changed (by "row-col" key)
const cellChangeCounts = writable<Record<string, number>>({})
export const mistakeCount = writable(0)

export const recordCellChange = (row: number, col: number) => {
	cellChangeCounts.update(counts => {
		const key = `${row}-${col}`
		const prev = counts[key] ?? 0
		const newCount = prev + 1
		// Each change after the first is a mistake
		if (newCount > 1) {
			mistakeCount.update(m => m + 1)
		}
		return { ...counts, [key]: newCount }
	})
}

export const resetMistakes = () => {
	cellChangeCounts.set({})
	mistakeCount.set(0)
}
