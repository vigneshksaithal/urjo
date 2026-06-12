/**
 * Simplified analytics metrics.
 *
 * The single, intentionally small surface for product reporting. Each value
 * is scoped to one UTC date and one subreddit installation (Devvit Redis is
 * siloed per install). Rates are `null` when their cohort window has not
 * closed yet, so the UI renders "—" rather than a misleading 0.
 */
export type SimpleMetrics = {
    /** UTC date these metrics describe (YYYY-MM-DD). */
    date: string
    /**
     * Unique post opens by logged-in users, deduped per user per post per day.
     * Logged-out opens are intentionally excluded so this shares the same
     * population as every other metric here (first-action, completion, dwell
     * all require a userId). Revisit if/when logged-out tracking lands.
     */
    opens: number
    /** Opens that never took a first action (opens − firstActions, floored at 0). */
    views: number
    /** Puzzle completions. */
    completions: number
    /** Mean active-foreground seconds per play session, or null when no sessions. */
    averagePlaySeconds: number | null
    /** Number of play sessions that contributed play time. */
    sessions: number
    /** D1 retention of the day's completer cohort in [0,1], or null if window open / empty. */
    d1Retention: number | null
    /** D7 retention of the day's completer cohort in [0,1], or null if window open / empty. */
    d7Retention: number | null
}
