import { describe, expect, test } from 'vitest'
import { isBoardSolved } from '../board'

describe('isBoardSolved', () => {
	const solution = 'rbrbbrbrrbbbbrbr'

	test('accepts a board that equals the stored solution', () => {
		expect(isBoardSolved(solution, solution)).toBe(true)
	})

	test('rejects a board that differs from the solution', () => {
		expect(isBoardSolved('bbbbrrrrbbbbrrrr', solution)).toBe(false)
	})

	test('rejects a board with the wrong length', () => {
		expect(isBoardSolved('rb', solution)).toBe(false)
		expect(isBoardSolved(solution + 'r', solution)).toBe(false)
	})

	test('fails closed when no solution is stored', () => {
		expect(isBoardSolved(solution, '')).toBe(false)
		expect(isBoardSolved('', '')).toBe(false)
	})

	test('rejects non-string submissions', () => {
		expect(isBoardSolved(undefined, solution)).toBe(false)
		expect(isBoardSolved(null, solution)).toBe(false)
		expect(isBoardSolved(123, solution)).toBe(false)
		expect(isBoardSolved({ board: solution }, solution)).toBe(false)
	})
})
