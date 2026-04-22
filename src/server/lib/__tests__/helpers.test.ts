import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { describe, it, expect } from 'vitest'
import { getTodayUTC, getYesterdayUTC, getDayDifference, getSkillLevel, fetchUsername, getLoginStreak, updateLoginStreak, getGridSizePreference, setGridSizePreference, getGridSkillLevel, setGridSkillLevel, getGridHistory, setGridHistory } from '../helpers'
import { DEFAULT_SKILL_LEVEL } from '../../../shared/constants'
import type { GameRecord } from '../../../shared/types'

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

// ─── getGridSizePreference ────────────────────────────────────────────────────

const testGridPrefDefault = createDevvitTest({ userId: 't2_testuser' })

testGridPrefDefault('getGridSizePreference returns 4 for new user', async () => {
    const pref = await getGridSizePreference('t2_testuser')
    expect(pref).toBe(4)
})

const testGridPrefStored = createDevvitTest({ userId: 't2_testuser' })

testGridPrefStored('getGridSizePreference returns stored value when set', async () => {
    await redis.set('user:t2_testuser:gridSizePreference', '6')
    const pref = await getGridSizePreference('t2_testuser')
    expect(pref).toBe(6)
})

const testGridPrefSet = createDevvitTest({ userId: 't2_testuser' })

testGridPrefSet('setGridSizePreference persists value to Redis', async () => {
    await setGridSizePreference('t2_testuser', 8)
    const pref = await getGridSizePreference('t2_testuser')
    expect(pref).toBe(8)
})

const testGridPrefInvalid = createDevvitTest({ userId: 't2_testuser' })

testGridPrefInvalid('getGridSizePreference falls back to 4 for invalid stored value', async () => {
    await redis.set('user:t2_testuser:gridSizePreference', '5')
    const pref = await getGridSizePreference('t2_testuser')
    expect(pref).toBe(4)
})

// ─── getGridSkillLevel ────────────────────────────────────────────────────────

const testGridSkillDefault = createDevvitTest({ userId: 't2_testuser' })

testGridSkillDefault('getGridSkillLevel returns 1 for new user', async () => {
    const level = await getGridSkillLevel('t2_testuser', 4)
    expect(level).toBe(1)
})

const testGridSkillStored = createDevvitTest({ userId: 't2_testuser' })

testGridSkillStored('getGridSkillLevel returns stored value when set', async () => {
    await redis.set('user:t2_testuser:skillLevel:6', '3')
    const level = await getGridSkillLevel('t2_testuser', 6)
    expect(level).toBe(3)
})

const testGridSkillSet = createDevvitTest({ userId: 't2_testuser' })

testGridSkillSet('setGridSkillLevel persists value to Redis', async () => {
    await setGridSkillLevel('t2_testuser', 8, 2)
    const level = await getGridSkillLevel('t2_testuser', 8)
    expect(level).toBe(2)
})

const testGridSkillIsolated = createDevvitTest({ userId: 't2_testuser' })

testGridSkillIsolated('getGridSkillLevel is isolated per grid size', async () => {
    await setGridSkillLevel('t2_testuser', 4, 2)
    await setGridSkillLevel('t2_testuser', 6, 3)
    await setGridSkillLevel('t2_testuser', 8, 4)
    expect(await getGridSkillLevel('t2_testuser', 4)).toBe(2)
    expect(await getGridSkillLevel('t2_testuser', 6)).toBe(3)
    expect(await getGridSkillLevel('t2_testuser', 8)).toBe(4)
})

// ─── getGridHistory ───────────────────────────────────────────────────────────

const testGridHistoryDefault = createDevvitTest({ userId: 't2_testuser' })

testGridHistoryDefault('getGridHistory returns empty array for new user', async () => {
    const history = await getGridHistory('t2_testuser', 4)
    expect(history).toEqual([])
})

const testGridHistoryStored = createDevvitTest({ userId: 't2_testuser' })

testGridHistoryStored('getGridHistory returns stored history', async () => {
    const records: GameRecord[] = [
        { level: 1, timeTaken: 45, timestamp: 1000 },
        { level: 2, timeTaken: 90, timestamp: 2000, skipped: true },
    ]
    await redis.set('user:t2_testuser:history:6', JSON.stringify(records))
    const history = await getGridHistory('t2_testuser', 6)
    expect(history).toEqual(records)
})

const testGridHistorySet = createDevvitTest({ userId: 't2_testuser' })

testGridHistorySet('setGridHistory persists history to Redis', async () => {
    const records: GameRecord[] = [{ level: 1, timeTaken: 60, timestamp: 3000 }]
    await setGridHistory('t2_testuser', 8, records)
    const history = await getGridHistory('t2_testuser', 8)
    expect(history).toEqual(records)
})

const testGridHistoryIsolated = createDevvitTest({ userId: 't2_testuser' })

testGridHistoryIsolated('getGridHistory is isolated per grid size', async () => {
    const records4: GameRecord[] = [{ level: 1, timeTaken: 45, timestamp: 1000 }]
    const records6: GameRecord[] = [{ level: 2, timeTaken: 120, timestamp: 2000 }]
    await setGridHistory('t2_testuser', 4, records4)
    await setGridHistory('t2_testuser', 6, records6)
    expect(await getGridHistory('t2_testuser', 4)).toEqual(records4)
    expect(await getGridHistory('t2_testuser', 6)).toEqual(records6)
    expect(await getGridHistory('t2_testuser', 8)).toEqual([])
})
