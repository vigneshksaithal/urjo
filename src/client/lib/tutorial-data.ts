/**
 * Hardcoded tutorial puzzle and step definitions.
 *
 * Tutorial solution grid:
 *   R B B R    (row 0)
 *   R R B B    (row 1)
 *   B R R B    (row 2)
 *   B B R R    (row 3)
 *
 * Pre-filled cells:
 *   (0,0) = R locked
 *   (1,0) = R with number "2" locked
 *   (2,0) = B locked
 *   (2,1) = number "2" only (no pre-filled color)
 *   (2,3) = B locked
 */

import type { CellColor } from '../../shared/types'

// Build solution string from rows to avoid typos
export const TUTORIAL_SOLUTION = ['rbbr', 'rrbb', 'brrb', 'bbrr'].join('')

// Pre-filled cells: (0,0)=r, (1,0)=r, (2,0)=b, (2,3)=b. Rest = '.'
export const TUTORIAL_COLORS = ['r...', 'r...', 'b..b', '....'].join('')

// Numbers: (1,0)=2 at index 4, (2,1)=2 at index 9. Rest = '-'
export const TUTORIAL_NUMBERS = ['----', '2---', '-2--', '----'].join('')

export type TutorialStep = {
	instruction: string
	highlightType: 'row' | 'column'
	highlightIndex: number
	targetCells: Array<{ row: number; col: number; expectedColor: CellColor }>
	handRow: number
	handCol: number
}

export const TUTORIAL_STEPS: TutorialStep[] = [
	{
		// Step 1: Teach column balance
		instruction: 'Each line requires 2 red and 2 blue spots. Select blue.',
		highlightType: 'column',
		highlightIndex: 0,
		targetCells: [{ row: 3, col: 0, expectedColor: 'blue' }],
		handRow: 3,
		handCol: 0,
	},
	{
		// Step 2: Teach row balance
		instruction:
			'This line already contains 2 blue spots. Color the remaining spots red.',
		highlightType: 'row',
		highlightIndex: 2,
		targetCells: [
			{ row: 2, col: 1, expectedColor: 'red' },
			{ row: 2, col: 2, expectedColor: 'red' },
		],
		handRow: 2,
		handCol: 2,
	},
	{
		// Step 3: Teach number constraint -- fill needed red
		instruction:
			'Red spot with number 2 must have 2 red spots around it.',
		highlightType: 'column',
		highlightIndex: 0,
		targetCells: [{ row: 1, col: 1, expectedColor: 'red' }],
		handRow: 1,
		handCol: 1,
	},
	{
		// Step 4: Teach number deduction -- remaining spots are blue
		instruction:
			'Red spot with number 2 must have 2 red spots around it. Color the remaining spots blue.',
		highlightType: 'column',
		highlightIndex: 1,
		targetCells: [{ row: 0, col: 1, expectedColor: 'blue' }],
		handRow: 0,
		handCol: 1,
	},
	{
		// Step 5: Teach adjacent line uniqueness
		instruction:
			'Adjacent lines must be different. This spot cannot be red, as it would create identical lines.',
		highlightType: 'row',
		highlightIndex: 2,
		targetCells: [{ row: 3, col: 1, expectedColor: 'blue' }],
		handRow: 3,
		handCol: 1,
	},
	{
		// Step 6: Row balance for row 3
		instruction: 'Required: 2 red and 2 blue spots.',
		highlightType: 'row',
		highlightIndex: 3,
		targetCells: [
			{ row: 3, col: 2, expectedColor: 'red' },
			{ row: 3, col: 3, expectedColor: 'red' },
		],
		handRow: 3,
		handCol: 2,
	},
	{
		// Step 7: Row balance for row 1
		instruction: 'Required: 2 red and 2 blue spots.',
		highlightType: 'row',
		highlightIndex: 1,
		targetCells: [
			{ row: 1, col: 2, expectedColor: 'blue' },
			{ row: 1, col: 3, expectedColor: 'blue' },
		],
		handRow: 1,
		handCol: 2,
	},
	{
		// Step 8: Complete the puzzle
		instruction: 'Complete the remaining spots.',
		highlightType: 'row',
		highlightIndex: 0,
		targetCells: [
			{ row: 0, col: 2, expectedColor: 'blue' },
			{ row: 0, col: 3, expectedColor: 'red' },
		],
		handRow: 0,
		handCol: 3,
	},
]
