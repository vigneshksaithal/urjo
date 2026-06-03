/**
 * First-action source attribution.
 *
 * Shared between the client (which tags each first-intent tap) and the server
 * (which validates the incoming value and increments a per-source counter).
 */

/** The CTA that triggered a player's first action in a session. */
export type FirstActionSource =
    | 'play'
    | 'cell'
    | 'help'
    | 'next-puzzle'
    | 'result-comment'
    | 'challenge'
    | 'notify'
    | 'subscribe'
    | 'grid-size'
    | 'unknown'

/** Canonical list of every valid source — drives runtime validation. */
export const FIRST_ACTION_SOURCES: readonly FirstActionSource[] = [
    'play',
    'cell',
    'help',
    'next-puzzle',
    'result-comment',
    'challenge',
    'notify',
    'subscribe',
    'grid-size',
    'unknown',
] as const

/** Narrow an untrusted value to a known source, defaulting to `'unknown'`. */
export const normalizeFirstActionSource = (source: unknown): FirstActionSource =>
    typeof source === 'string' &&
        (FIRST_ACTION_SOURCES as readonly string[]).includes(source)
        ? (source as FirstActionSource)
        : 'unknown'
