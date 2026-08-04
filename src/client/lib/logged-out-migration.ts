import { isMeasurementId } from '../../shared/measurement-contract'

export type LoggedOutMigration = Readonly<{
    postId: string
    migrationToken: string
}>

export const loggedOutMigrationKey = (postId: string): string =>
    `urjo:loggedOutMigration:${postId}`

export const writeLoggedOutMigration = (value: LoggedOutMigration): void => {
    const storage = getStorage()
    if (storage === null || !isLoggedOutMigration(value)) return
    try {
        const safeValue: LoggedOutMigration = {
            postId: value.postId,
            migrationToken: value.migrationToken,
        }
        storage.setItem(loggedOutMigrationKey(value.postId), JSON.stringify(safeValue))
    } catch {
        // Best-effort continuity must never block logged-out gameplay.
    }
}

export const readLoggedOutMigration = (postId: string): LoggedOutMigration | null => {
    const storage = getStorage()
    if (storage === null) return null
    try {
        const raw = storage.getItem(loggedOutMigrationKey(postId))
        if (raw === null) return null
        const parsed: unknown = JSON.parse(raw)
        return isLoggedOutMigration(parsed) && parsed.postId === postId ? parsed : null
    } catch {
        return null
    }
}

export const clearLoggedOutMigration = (postId: string): void => {
    const storage = getStorage()
    if (storage === null) return
    try {
        storage.removeItem(loggedOutMigrationKey(postId))
    } catch {
        // Best-effort cleanup.
    }
}

const getStorage = (): Storage | null => {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
        return null
    }
}

const isLoggedOutMigration = (value: unknown): value is LoggedOutMigration => {
    if (!value || typeof value !== 'object') return false
    const record = value as Record<string, unknown>
    return (
        typeof record.postId === 'string' &&
        /^t3_[A-Za-z0-9_-]+$/.test(record.postId) &&
        isMeasurementId(record.migrationToken)
    )
}
