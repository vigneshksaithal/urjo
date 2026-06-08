/**
 * Tutorial puzzle and step definitions.
 *
 * Tutorial solution grid (4×4):
 *   R B B R    (row 0)
 *   R R B B    (row 1)
 *   B R R B    (row 2)
 *   B B R R    (row 3)
 *
 * Pre-filled locked cells: (0,0)=R, (0,1)=B, (1,0)=R with number 3, (2,0)=B, (2,3)=B
 */

import type { CellColor } from '../../shared/types'

export const TUTORIAL_SOLUTION = ['rbbr', 'rrbb', 'brrb', 'bbrr'].join('')

// Pre-filled: (0,0)=R, (0,1)=B, (1,0)=R, (2,0)=B, (2,3)=B
export const TUTORIAL_COLORS = ['rb..', 'r...', 'b..b', '....'].join('')

// Numbers: (1,0)=3
export const TUTORIAL_NUMBERS = ['----', '3---', '----', '----'].join('')

export type TutorialStep = {
	/** Short bold headline shown large above the board */
	headline: string
	/** One-sentence explanation shown below the headline */
	detail: string
	highlightType: 'row' | 'column'
	highlightIndex: number
	targetCells: Array<{ row: number; col: number; expectedColor: CellColor }>
	handRow: number
	handCol: number
}

export const TUTORIAL_STEPS: TutorialStep[] = [
	{
		// Step 1: TAP to cycle colors — teach the basic interaction
		headline: 'Tap a circle to color it',
		detail: 'Tap once for 🔴, again for 🔵, again to clear.',
		highlightType: 'column',
		highlightIndex: 0,
		targetCells: [{ row: 3, col: 0, expectedColor: 'blue' }],
		handRow: 3,
		handCol: 0,
	},
	{
		// Step 2: Each row needs exactly 2 red + 2 blue
		headline: 'Each row: 2 red + 2 blue',
		detail: 'This row already has 2 blue. Fill the rest with red.',
		highlightType: 'row',
		highlightIndex: 2,
		targetCells: [
			{ row: 2, col: 1, expectedColor: 'red' },
			{ row: 2, col: 2, expectedColor: 'red' },
		],
		handRow: 2,
		handCol: 1,
	},
	{
		// Step 3: Same rule for columns
		headline: 'Same rule for columns',
		detail: 'Each column also needs exactly 2 red + 2 blue.',
		highlightType: 'column',
		highlightIndex: 3,
		targetCells: [
			{ row: 0, col: 3, expectedColor: 'red' },
			{ row: 3, col: 3, expectedColor: 'red' },
		],
		handRow: 0,
		handCol: 3,
	},
	{
		// Step 4: Numbers = neighbor count (including diagonals)
		headline: 'Numbers = how many same-color neighbors',
		detail: 'The "3" means 3 red circles surround it (diagonals count). Tap to place the missing red.',
		highlightType: 'row',
		highlightIndex: 1,
		targetCells: [{ row: 1, col: 1, expectedColor: 'red' }],
		handRow: 1,
		handCol: 1,
	},
]
