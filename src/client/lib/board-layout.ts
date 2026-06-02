/**
 * Pure board-layout sizing helper for the puzzle board.
 *
 * `computeBoardSize` is the single source of truth for the board's square
 * pixel side, derived from the measured content-box dimensions of the board
 * wrapper.
 *
 * The board is constrained to a square whose side is the SMALLER of the
 * available width and height — `min(availableWidth, availableHeight)` — clamped
 * at 0. This guarantees the board never exceeds the viewport width (no
 * horizontal clipping of the rightmost column) while staying square, and where
 * content already fits (`availableHeight <= availableWidth`) the side equals the
 * original height-derived square, so the fitting layout is preserved.
 */

/**
 * Returns the board's square pixel side given the available content-box
 * dimensions of the board wrapper.
 *
 * The side is `min(availableWidth, availableHeight)`, clamped at 0 to defend
 * against collapsed or not-yet-measured containers (negative/zero dimensions).
 */
export const computeBoardSize = (availableWidth: number, availableHeight: number): number => {
    return Math.max(0, Math.min(availableWidth, availableHeight))
}
