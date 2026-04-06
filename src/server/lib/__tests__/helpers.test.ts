import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { describe, it, expect } from 'vitest'
import { getTodayUTC, getYesterdayUTC, getDayDifference, getSkillLevel, fetchUsername, getLoginStreak, updateLoginStreak } from '../helpers'
import { DEFAULT_SKILL_LEVEL } from '../../../shared/constants'

// ─── getTodayUTC ──────────────────────────────────────────────────────────────

describe('getTodayUTC', () => {
    it('returns a string in YYYY-MM-DD format', () => {
        const result = getTodayUTC()
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('returns the current UTC date', () => {
        const result = getTodayUTC()
        const expected = new Date().toISOString().split('T')[0]
        expect(result).toBe(expected)
    })
})

// ─── getSkillLevel ────────────────────────────────────────────────────────────

const testSkill = createDevvitTest({ userId: 't2_testuser' })

testSkill('getSkillLevel returns DEFAULT_SKILL_LEVEL for new user', async () => {
    const level = await getSkillLevel('t2_testuser')
    expect(level).toBe(DEFAULT_SKILL_LEVEL)
})

const testSkillSet = createDevvitTest({ userId: 't2_testuser' })

testSkillSet('getSkillLevel returns stored value when set', async () => {
    await redis.set('user:t2_testuser:skillLevel', '5')
    const level = await getSkillLevel('t2_testuser')
    expect(level).toBe(5)
})

// ─── fetchUsername ────────────────────────────────────────────────────────────

const testFetchSelf = createDevvitTest({ userId: 't2_testuser' })

testFetchSelf('fetchUsername returns "You" when targetUserId matches currentUserId', async () => {
    const username = await fetchUsername('t2_testuser', 't2_testuser')
    expect(username).toBe('You')
})

const testFetchCached = createDevvitTest({ userId: 't2_testuser' })

testFetchCached('fetchUsername returns cached value from Redis', async () => {
    await redis.set('user:t2_other:username', 'cachedUser')
    const username = await fetchUsername('t2_other', 't2_testuser')
    expect(username).toBe('cachedUser')
})

// ─── getYesterdayUTC ──────────────────────────────────────────────────────────

describe('getYesterdayUTC', () => {
    it('returns a string in YYYY-MM-DD format', () => {
        const result = getYesterdayUTC()
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('returns the day before today', () => {
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setUTCDate(yesterday.getUTCDate() - 1)
        const expected = yesterday.toISOString().split('T')[0]
        expect(getYesterdayUTC()).toBe(expected)
    })
})

// ─── getDayDifference ─────────────────────────────────────────────────────────

describe('getDayDifference', () => {
    it('returns 0 for the same date', () => {
        expect(getDayDifference('2025-06-15', '2025-06-15')).toBe(0)
    })

    it('returns 1 when date2 is one day after date1', () => {
        expect(getDayDifference('2025-06-15', '2025-06-16')).toBe(1)
    })

    it('returns -1 when date2 is one day before date1', () => {
        expect(getDayDifference('2025-06-16', '2025-06-15')).toBe(-1)
    })

    it('handles month boundaries', () => {
        expect(getDayDifference('2025-01-31', '2025-02-01')).toBe(1)
    })

    it('handles year boundaries', () => {
        expect(getDayDifference('2024-12-31', '2025-01-01')).toBe(1)
    })

    it('returns large positive for distant future', () => {
        expect(getDayDifference('2025-01-01', '2025-12-31')).toBe(364)
    })
})

// ─── getLoginStreak ───────────────────────────────────────────────────────────

const testLoginDefault = createDevvitTest({ userId: 't2_testuser' })

testLoginDefault('getLoginStreak returns defaults for new user', async () => {
    const streak = await getLoginStreak('t2_testuser')
    expect(streak.days).toBe(0)
    expect(streak.lastDate).toBeNull()
})

const testLoginStored = createDevvitTest({ userId: 't2_testuser' })

testLoginStored('getLoginStreak returns stored values', async () => {
    await redis.hSet('user:t2_testuser:loginStreak', { days: '5', lastDate: '2025-06-15' })
    const streak = await getLoginStreak('t2_testuser')
    expect(streak.days).toBe(5)
    expect(streak.lastDate).toBe('2025-06-15')
})

// ─── updateLoginStreak ────────────────────────────────────────────────────────

const testLoginNotDaily = createDevvitTest({ userId: 't2_testuser' })

testLoginNotDaily('updateLoginStreak returns 0 when isDailyFirst is false (no Redis call)', async () => {
    const days = await updateLoginStreak('t2_testuser', false)
    expect(days).toBe(0)
    // Verify no data was written
    const streak = await getLoginStreak('t2_testuser')
    expect(streak.days).toBe(0)
})

const testLoginFirstEver = createDevvitTest({ userId: 't2_testuser' })

testLoginFirstEver('updateLoginStreak sets days to 1 on first-ever login', async () => {
    const days = await updateLoginStreak('t2_testuser', true)
    expect(days).toBe(1)
    const streak = await getLoginStreak('t2_testuser')
    expect(streak.days).toBe(1)
})

const testLoginConsecutive = createDevvitTest({ userId: 't2_testuser' })

testLoginConsecutive('updateLoginStreak increments on consecutive day', async () => {
    const yesterday = getYesterdayUTC()
    await redis.hSet('user:t2_testuser:loginStreak', { days: '3', lastDate: yesterday })
    const days = await updateLoginStreak('t2_testuser', true)
    expect(days).toBe(4)
})

const testLoginSameDay = createDevvitTest({ userId: 't2_testuser' })

testLoginSameDay('updateLoginStreak returns current count if already logged in today', async () => {
    const today = getTodayUTC()
    await redis.hSet('user:t2_testuser:loginStreak', { days: '7', lastDate: today })
    const days = await updateLoginStreak('t2_testuser', true)
    expect(days).toBe(7)
})

const testLoginGap = createDevvitTest({ userId: 't2_testuser' })

testLoginGap('updateLoginStreak resets to 1 when a day is missed', async () => {
    await redis.hSet('user:t2_testuser:loginStreak', { days: '10', lastDate: '2025-01-01' })
    const days = await updateLoginStreak('t2_testuser', true)
    expect(days).toBe(1)
})
