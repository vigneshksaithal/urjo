/**
 * Logged-out score persistence across the login boundary.
 *
 * The Reddit login/sign-up flow reloads the webview, wiping in-memory state.
 * To make signing in feel rewarding, we stash a logged-out player's last
 * result in localStorage keyed by postId, then migrate it to the server once
 * they return with a userId. See Reddit's "Building for Logged Out Players".
 *
 * ── localStorage exception ────────────────────────────────────────────────
 * The project's svelte-component skill normally forbids localStorage. This
 * module is the single, deliberate exception: it is the only mechanism that
 * survives the login page reload (server Redis can't be keyed without a
 * userId, and in-memory state is gone). Scope is intentionally tiny — one
 * key per post, only gameplay continuity data (time + mistakes), no PII.
 * Limitations (per the guide): localStorage resets on new app versions and
 * does not persist across browsers.
 */

/** Minimal score payload persisted for a logged-out solve. */
export type LoggedOutScore = {
    postId: string
    timeTaken: number
    mistakes: number
}

/** Build the namespaced storage key for a post's logged-out score. */
export const loggedOutScoreKey = (postId: string): string =>
    `urjo:loggedOutScore:${postId}`

/** Safely access localStorage — returns null in non-browser/test contexts. */
const getStorage = (): Storage | null => {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null
    } catch {
        return null
    }
}

/**
 * Persist a logged-out score. Best-effort: storage failures (quota, private
 * mode, missing API) are swallowed so gameplay is never blocked.
 */
export const writeLoggedOutScore = (value: LoggedOutScore): void => {
    const storage = getStorage()
    if (!storage) return
    try {
        storage.setItem(loggedOutScoreKey(value.postId), JSON.stringify(value))
    } catch {
        // Best-effort only.
    }
}

/**
 * Read a previously stored logged-out score. Returns null when absent,
 * corrupt, or shape-invalid (treat stored data as untrusted).
 */
export const readLoggedOutScore = (postId: string): LoggedOutScore | null => {
    const storage = getStorage()
    if (!storage) return null
    try {
        const raw = storage.getItem(loggedOutScoreKey(postId))
        if (!raw) return null

        const parsed: unknown = JSON.parse(raw)
        if (!isLoggedOutScore(parsed)) return null
        return parsed
    } catch {
        return null
    }
}

/** Remove a stored logged-out score. Best-effort. */
export const clearLoggedOutScore = (postId: string): void => {
    const storage = getStorage()
    if (!storage) return
    try {
        storage.removeItem(loggedOutScoreKey(postId))
    } catch {
        // Best-effort only.
    }
}

const isLoggedOutScore = (value: unknown): value is LoggedOutScore => {
    if (!value || typeof value !== 'object') return false
    const obj = value as Record<string, unknown>
    return (
        typeof obj.postId === 'string' &&
        typeof obj.timeTaken === 'number' &&
        typeof obj.mistakes === 'number'
    )
}
