/**
 * Server-authoritative completion check.
 *
 * Every puzzle the generator produces has a single unique solution (the
 * generator only removes a clue while the remaining puzzle still solves to
 * exactly one board). The only board that counts as "solved" is therefore the
 * stored solution string itself. Comparing a submitted board to that solution
 * is both necessary and sufficient to prove a real solve — and it cannot be
 * forged without actually producing the solution.
 *
 * The client detects completion with the richer constraint validator
 * (client/lib/validation.ts) for live UI feedback; this function is the
 * trust boundary the server uses to authorize rewards. They agree because, for
 * a unique-solution puzzle, "satisfies every constraint" ⇔ "equals the
 * solution".
 */
export const isBoardSolved = (submittedBoard: unknown, solution: string): boolean => {
	if (typeof submittedBoard !== 'string') return false
	// A puzzle with no stored solution can't be verified — fail closed.
	if (solution.length === 0) return false
	return submittedBoard === solution
}
