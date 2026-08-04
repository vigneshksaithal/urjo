import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    writeLoggedOutMigration,
    readLoggedOutMigration,
    clearLoggedOutMigration,
    loggedOutMigrationKey,
} from '../logged-out-migration'

// ─── In-memory localStorage stub ───────────────────────────────────────────────

const makeStorage = (): Storage => {
    const map = new Map<string, string>()
    return {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: (k: string) => void map.delete(k),
        clear: () => map.clear(),
        key: (i: number) => Array.from(map.keys())[i] ?? null,
        get length() {
            return map.size
        },
    } as Storage
}

beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage())
})

describe('loggedOutMigrationKey', () => {
    it('namespaces by postId so different posts do not collide', () => {
        expect(loggedOutMigrationKey('t3_a')).not.toBe(loggedOutMigrationKey('t3_b'))
        expect(loggedOutMigrationKey('t3_a')).toContain('t3_a')
    })
})

describe('writeLoggedOutMigration / readLoggedOutMigration', () => {
    it('round-trips only the opaque server receipt', () => {
        writeLoggedOutMigration({ postId: 't3_a', migrationToken: 'migration_token_123' })
        expect(readLoggedOutMigration('t3_a')).toEqual({
            postId: 't3_a',
            migrationToken: 'migration_token_123',
        })
        expect(localStorage.getItem(loggedOutMigrationKey('t3_a'))).not.toContain('timeTaken')
        expect(localStorage.getItem(loggedOutMigrationKey('t3_a'))).not.toContain('mistakes')
        expect(localStorage.getItem(loggedOutMigrationKey('t3_a'))).not.toContain('board')
    })

    it('returns null when nothing is stored', () => {
        expect(readLoggedOutMigration('t3_missing')).toBeNull()
    })

    it('returns null and does not throw on corrupt JSON', () => {
        localStorage.setItem(loggedOutMigrationKey('t3_a'), '{not json')
        expect(readLoggedOutMigration('t3_a')).toBeNull()
    })

    it('returns null when the stored shape is invalid', () => {
        localStorage.setItem(
            loggedOutMigrationKey('t3_a'),
            JSON.stringify({ postId: 't3_a', timeTaken: 'fast' }),
        )
        expect(readLoggedOutMigration('t3_a')).toBeNull()
    })

    it('rejects untrusted legacy score payloads', () => {
        localStorage.setItem(
            loggedOutMigrationKey('t3_a'),
            JSON.stringify({ postId: 't3_a', timeTaken: 42, mistakes: 0, board: 'rbrb' }),
        )
        expect(readLoggedOutMigration('t3_a')).toBeNull()
    })

    it('never throws when localStorage is unavailable', () => {
        vi.stubGlobal('localStorage', undefined)
        expect(() =>
            writeLoggedOutMigration({ postId: 't3_a', migrationToken: 'migration_token_123' }),
        ).not.toThrow()
        expect(readLoggedOutMigration('t3_a')).toBeNull()
    })
})

describe('clearLoggedOutMigration', () => {
    it('removes a stored receipt', () => {
        writeLoggedOutMigration({ postId: 't3_a', migrationToken: 'migration_token_123' })
        clearLoggedOutMigration('t3_a')
        expect(readLoggedOutMigration('t3_a')).toBeNull()
    })

    it('does not throw when clearing a missing key', () => {
        expect(() => clearLoggedOutMigration('t3_missing')).not.toThrow()
    })
})
