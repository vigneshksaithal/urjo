import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    writeLoggedOutScore,
    readLoggedOutScore,
    clearLoggedOutScore,
    loggedOutScoreKey,
} from '../logged-out-score'

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

describe('loggedOutScoreKey', () => {
    it('namespaces by postId so different posts do not collide', () => {
        expect(loggedOutScoreKey('t3_a')).not.toBe(loggedOutScoreKey('t3_b'))
        expect(loggedOutScoreKey('t3_a')).toContain('t3_a')
    })
})

describe('writeLoggedOutScore / readLoggedOutScore', () => {
    it('round-trips a valid score', () => {
        writeLoggedOutScore({ postId: 't3_a', timeTaken: 42, mistakes: 1, board: 'rbrb' })
        expect(readLoggedOutScore('t3_a')).toEqual({
            postId: 't3_a',
            timeTaken: 42,
            mistakes: 1,
            board: 'rbrb',
        })
    })

    it('returns null when nothing is stored', () => {
        expect(readLoggedOutScore('t3_missing')).toBeNull()
    })

    it('returns null and does not throw on corrupt JSON', () => {
        localStorage.setItem(loggedOutScoreKey('t3_a'), '{not json')
        expect(readLoggedOutScore('t3_a')).toBeNull()
    })

    it('returns null when the stored shape is invalid', () => {
        localStorage.setItem(
            loggedOutScoreKey('t3_a'),
            JSON.stringify({ postId: 't3_a', timeTaken: 'fast' }),
        )
        expect(readLoggedOutScore('t3_a')).toBeNull()
    })

    it('returns null when the board is missing (untrusted legacy payload)', () => {
        localStorage.setItem(
            loggedOutScoreKey('t3_a'),
            JSON.stringify({ postId: 't3_a', timeTaken: 42, mistakes: 0 }),
        )
        expect(readLoggedOutScore('t3_a')).toBeNull()
    })

    it('never throws when localStorage is unavailable', () => {
        vi.stubGlobal('localStorage', undefined)
        expect(() =>
            writeLoggedOutScore({ postId: 't3_a', timeTaken: 10, mistakes: 0, board: 'rbrb' }),
        ).not.toThrow()
        expect(readLoggedOutScore('t3_a')).toBeNull()
    })
})

describe('clearLoggedOutScore', () => {
    it('removes a stored score', () => {
        writeLoggedOutScore({ postId: 't3_a', timeTaken: 42, mistakes: 0, board: 'rbrb' })
        clearLoggedOutScore('t3_a')
        expect(readLoggedOutScore('t3_a')).toBeNull()
    })

    it('does not throw when clearing a missing key', () => {
        expect(() => clearLoggedOutScore('t3_missing')).not.toThrow()
    })
})
