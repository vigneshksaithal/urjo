/**
 * Tutorial lesson definitions — Duolingo-style, one mechanic per lesson.
 *
 * Cell color strings use:
 *   'r' = red (locked)
 *   'b' = blue (locked)
 *   '.' = empty (unlocked, user fills)
 *
 * Number strings use:
 *   '-' = no number
 *   digit = neighbor count clue
 *
 * Each lesson has a small dedicated grid, not the full 4×4 puzzle.
 * Success is gated: the user must get the right answer before advancing.
 *
 * Lesson flow:
 *   L1 — TAP IT         (1×1, any color accepted — teach the tap)
 *   L2 — CYCLE COLORS   (1×1 starting blue, must reach red — teach cycling)
 *   L3 — BALANCE A ROW  (1×4 row, fill 2 empty cells for row balance)
 *   L4 — COLUMNS TOO    (2×4 grid, fill 4 cells satisfying column balance)
 *   L5 — NUMBER CLUES   (info card only — explain neighbor counting)
 *   L6 — MINI PUZZLE    (4×4 with 4 empty cells — put it all together)
 */

import type { CellColor } from '../../shared/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type LessonCell = {
	color: CellColor
	locked: boolean
	number: number | null
	/** The color the user must place here to succeed. null = cell is locked (not a target). */
	expectedColor: CellColor
}

export type SuccessCriteria =
	| 'any-color'      // any non-null color counts (lesson 1)
	| 'exact-targets'  // all target cells must match expectedColor exactly

export type TutorialLesson = {
	id: string
	/** Big heading — max ~20 chars */
	title: string
	/** One-line context — max ~50 chars */
	subtitle: string
	/** Hint shown after 2s idle or after a wrong tap */
	hint: string
	/** Shown briefly when the user taps the wrong color */
	errorMessage: string
	/** Full-screen celebration after lesson completes */
	celebrationEmoji: string
	celebrationTitle: string
	celebrationSub: string
	gridRows: number
	gridCols: number
	/** Flat array, row-major order (row0col0, row0col1, … rowNcolM) */
	cells: LessonCell[]
	successCriteria: SuccessCriteria
	/** If true, show only an info card — no interactive grid */
	isInfoOnly?: boolean
	/** For info-only lessons: the visual explanation card text */
	infoLines?: string[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function locked(color: CellColor, number: number | null = null): LessonCell {
	return { color, locked: true, number, expectedColor: null }
}

function target(expectedColor: CellColor): LessonCell {
	return { color: null, locked: false, number: null, expectedColor }
}


// ─── Lessons ───────────────────────────────────────────────────────────────────

export const TUTORIAL_LESSONS: TutorialLesson[] = [
	// ── L1: TAP IT ──────────────────────────────────────────────────────────────
	{
		id: 'tap-it',
		title: 'Tap to color 👆',
		subtitle: 'Touch the circle',
		hint: 'Just tap it!',
		errorMessage: '',
		celebrationEmoji: '🎉',
		celebrationTitle: 'You tapped it!',
		celebrationSub: 'Tap cycles: empty → 🔵 → 🔴 → empty',
		gridRows: 1,
		gridCols: 1,
		cells: [
			// 1×1 grid — tap anything to succeed
			target('blue'),
		],
		successCriteria: 'any-color',
	},

	// ── L2: CYCLE COLORS ────────────────────────────────────────────────────────
	{
		id: 'cycle-colors',
		title: 'Tap again 🔄',
		subtitle: 'Turn it red 🔴',
		hint: 'Keep tapping to cycle colors',
		errorMessage: 'Not red yet — tap again!',
		celebrationEmoji: '🔥',
		celebrationTitle: 'Colors change!',
		celebrationSub: '🔵 → 🔴 → empty → 🔵 → ...',
		gridRows: 1,
		gridCols: 1,
		cells: [
			// Starts blue (unlocked), user must reach red
			{ color: 'blue', locked: false, number: null, expectedColor: 'red' },
		],
		successCriteria: 'exact-targets',
	},

	// ── L3: BALANCE A ROW ───────────────────────────────────────────────────────
	{
		id: 'balance-row',
		title: 'Balance the row ⚖️',
		subtitle: 'Every row: 2 red + 2 blue',
		hint: 'Count the colors — need one more of each',
		errorMessage: 'Too many of that color! Try the other one',
		celebrationEmoji: '✅',
		celebrationTitle: 'Row balanced!',
		celebrationSub: '2 red + 2 blue in every row',
		gridRows: 1,
		gridCols: 4,
		// Row: R _ _ B  →  user fills pos 1=R, pos 2=B (or pos 1=B, pos 2=R)
		// Both orders give a valid 2R+2B row, so we use 'any-color' per cell
		// and validate the full row instead. The success criteria handles this.
		cells: [
			locked('red'),
			target('red'),   // or blue — L3 accepts either ordering
			target('blue'),  // success when row has exactly 2R + 2B
			locked('blue'),
		],
		// Custom: treat as row-balance — see TutorialView for logic
		successCriteria: 'exact-targets',
	},

	// ── L4: COLUMNS TOO ─────────────────────────────────────────────────────────
	{
		id: 'columns-too',
		title: 'Columns too! ↕️',
		subtitle: 'Every column needs balance too',
		hint: 'Look up and down — what color is missing?',
		errorMessage: 'That column would be off-balance',
		celebrationEmoji: '💡',
		celebrationTitle: 'You got it!',
		celebrationSub: 'Rows AND columns must balance',
		gridRows: 2,
		gridCols: 4,
		//
		// Solution:
		//   Row 0: R  B  B  R
		//   Row 1: B  R  R  B
		//
		// Pre-filled (locked): all of row 0 + col 2 and col 3 of row 1
		//   Row 0: R(lock) B(lock) B(lock) R(lock)
		//   Row 1: ?(target B) ?(target R) R(lock) B(lock)
		//
		// Targets: (1,0)=B, (1,1)=R
		// Column check: col0 has R→B ✓, col1 has B→R ✓, col2 has B→R ✓, col3 has R→B ✓
		// Row 1 check: B R R B = 2R 2B ✓
		cells: [
			// Row 0 (all locked)
			locked('red'),
			locked('blue'),
			locked('blue'),
			locked('red'),
			// Row 1
			target('blue'),
			target('red'),
			locked('red'),
			locked('blue'),
		],
		successCriteria: 'exact-targets',
	},

	// ── L5: NUMBER CLUES (info only) ────────────────────────────────────────────
	{
		id: 'number-clues',
		title: 'Number = neighbors 🔢',
		subtitle: 'A clue tells you how many same-color circles touch it',
		hint: '',
		errorMessage: '',
		celebrationEmoji: '🧠',
		celebrationTitle: 'Got the clue!',
		celebrationSub: 'Numbers are your hint, not the answer',
		gridRows: 0,
		gridCols: 0,
		cells: [],
		successCriteria: 'any-color',
		isInfoOnly: true,
		infoLines: [
			'The number on a circle = how many',
			'same-color circles are touching it',
			'(including diagonals — all 8 directions)',
		],
	},

	// ── L6: MINI PUZZLE (integration) ───────────────────────────────────────────
	{
		id: 'mini-puzzle',
		title: 'Your first puzzle! 🧩',
		subtitle: 'Use everything you learned',
		hint: 'Each row and column needs 2 red + 2 blue',
		errorMessage: 'Check the rows and columns — something is off',
		celebrationEmoji: '🏆',
		celebrationTitle: 'Puzzle solved!',
		celebrationSub: "Now you know how to play Urjo!",
		gridRows: 4,
		gridCols: 4,
		//
		// Full solution: R B B R / R R B B / B R R B / B B R R
		//
		// Locked: 12 cells, 4 empty targets
		// Empty cells: (0,2)=B, (1,0)=R, (2,3)=B, (3,1)=B
		// Each can be deduced by row+column logic alone:
		//   (0,2): row0 has R,B,_,R → needs B; col2 has _,B,R,R → needs B ✓
		//   (1,0): row1 has _,R,B,B → needs R; col0 has R,_,B,B → needs R ✓
		//   (2,3): row2 has B,R,R,_ → needs B; col3 has R,B,_,R → needs B ✓
		//   (3,1): row3 has B,_,R,R → needs B; col1 has B,R,R,_ → needs B ✓
		//
		// Number clue: (0,1)=B has number 2
		//   (0,1)'s neighbors: (0,0)=R, (0,2)=B, (1,0)=R, (1,1)=R, (1,2)=B
		//   Blue neighbors: (0,2), (1,2) → count = 2 ✓
		cells: [
			// Row 0: R  B(2)  _  R
			locked('red'),
			locked('blue', 2),
			target('blue'),
			locked('red'),
			// Row 1: _  R  B  B
			target('red'),
			locked('red'),
			locked('blue'),
			locked('blue'),
			// Row 2: B  R  R  _
			locked('blue'),
			locked('red'),
			locked('red'),
			target('blue'),
			// Row 3: B  _  R  R
			locked('blue'),
			target('blue'),
			locked('red'),
			locked('red'),
		],
		successCriteria: 'exact-targets',
	},
]

export const TOTAL_LESSONS = TUTORIAL_LESSONS.length
