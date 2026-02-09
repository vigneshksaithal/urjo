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
 *   (0,1) = B locked
 *   (1,0) = R with number "3" locked (3 same-color neighbors including diagonals)
 *   (2,0) = B locked
 *   (2,3) = B locked
 *
 * 8-directional neighbor counts for the solution:
 *   2 2 3 0
 *   3 4 4 3
 *   2 4 4 2
 *   2 2 3 2
 */

import type { CellColor } from '../../shared/types'

// Build solution string from rows to avoid typos
export const TUTORIAL_SOLUTION = ['rbbr', 'rrbb', 'brrb', 'bbrr'].join('')

// Pre-filled cells: (0,0)=r, (0,1)=b, (1,0)=r, (2,0)=b, (2,3)=b. Rest = '.'
export const TUTORIAL_COLORS = ['rb..', 'r...', 'b..b', '....'].join('')

// Numbers: (1,0)=3 at index 4. Rest = '-'
export const TUTORIAL_NUMBERS = ['----', '3---', '----', '----'].join('')

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
		// Col 0 = R, R, B, ? → already 2 red → must be blue
		instruction: 'Each line requires 2 red and 2 blue spots. Select blue.',
		highlightType: 'column',
		highlightIndex: 0,
		targetCells: [{ row: 3, col: 0, expectedColor: 'blue' }],
		handRow: 3,
		handCol: 0,
	},
	{
		// Step 2: Teach row balance
		// Row 2 = B, ?, ?, B → already 2 blue → remaining must be red
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
		// Step 3: Teach number constraint WITH diagonals (key new concept!)
		// (1,0)=R has number 3. Its surrounding neighbors (including diagonals):
		//   (0,0)=R ✓, (0,1)=B ✗, (1,1)=?, (2,0)=B ✗, (2,1)=R ✓ (diagonal!)
		// Same-color count = 2, needs 3 → (1,1) must be red
		instruction:
			'Red number 3 needs 3 red spots around it. Diagonals count too!',
		highlightType: 'row',
		highlightIndex: 1,
		targetCells: [{ row: 1, col: 1, expectedColor: 'red' }],
		handRow: 1,
		handCol: 1,
	},
	{
		// Step 4: Row balance for row 1
		// Row 1 = R, R, ?, ? → already 2 red → remaining must be blue
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
		// Step 5: Column balance for column 3
		// Col 3 = ?, B, B, ? → already 2 blue → remaining must be red
		instruction:
			'This line already contains 2 blue spots. Color the remaining spots red.',
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
		// Step 6: Row balance for row 0
		// Row 0 = R, B, ?, R → already 2 red → (0,2) must be blue
		instruction: 'Required: 2 red and 2 blue spots.',
		highlightType: 'row',
		highlightIndex: 0,
		targetCells: [{ row: 0, col: 2, expectedColor: 'blue' }],
		handRow: 0,
		handCol: 2,
	},
	{
		// Step 7: Teach adjacent line uniqueness
		// Col 1 = B, R, R, ? → already 2 red → (3,1) must be blue
		// Also: row 3 must differ from adjacent row 2
		instruction:
			'Adjacent lines must be different. This line already has 2 red spots.',
		highlightType: 'column',
		highlightIndex: 1,
		targetCells: [{ row: 3, col: 1, expectedColor: 'blue' }],
		handRow: 3,
		handCol: 1,
	},
	{
		// Step 8: Complete the puzzle
		// Row 3 = B, B, ?, R → needs 1 more red → (3,2) = red
		instruction: 'Complete the remaining spots.',
		highlightType: 'row',
		highlightIndex: 3,
		targetCells: [{ row: 3, col: 2, expectedColor: 'red' }],
		handRow: 3,
		handCol: 2,
	},
]
