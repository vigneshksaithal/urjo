import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { describe, it, expect } from 'vitest'
import { getTodayUTC, getYesterdayUTC, getDayDifference, getLoginStreak, updateLoginStreak, getGridSizePreference, setGridSizePreference, getGridSkillLevel, setGridSkillLevel, getGridHistory, setGridHistory } from '../helpers'
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

// ─── Grid Size Preference ────────────────────────────────────────────────────

const testGridPreference = createDevvitTest({ userId: 't2_testuser' })

testGridPreference('getGridSizePreference returns default for new user', async () => {
    const preference = await getGridSizePreference('t2_testuser')
    expect(preference).toBe(4)
})

testGridPreference('setGridSizePreference persists a valid grid size', async () => {
    await setGridSizePreference('t2_testuser', 8)
    const preference = await getGridSizePreference('t2_testuser')
    expect(preference).toBe(8)
})

testGridPreference('getGridSizePreference falls back to 4 for invalid stored value', async () => {
    await redis.set('user:t2_testuser:gridSizePreference', '5')
    const preference = await getGridSizePreference('t2_testuser')
    expect(preference).toBe(4)
})

// ─── Per-Grid Skill Level ────────────────────────────────────────────────────

const testGridSkill = createDevvitTest({ userId: 't2_testuser' })

testGridSkill('getGridSkillLevel returns default for new grid size', async () => {
    const level = await getGridSkillLevel('t2_testuser', 6)
    expect(level).toBe(1)
})

testGridSkill('setGridSkillLevel persists levels independently per grid size', async () => {
    await setGridSkillLevel('t2_testuser', 4, 2)
    await setGridSkillLevel('t2_testuser', 6, 3)
    await setGridSkillLevel('t2_testuser', 8, 4)

    expect(await getGridSkillLevel('t2_testuser', 4)).toBe(2)
    expect(await getGridSkillLevel('t2_testuser', 6)).toBe(3)
    expect(await getGridSkillLevel('t2_testuser', 8)).toBe(4)
})

// ─── Per-Grid Game History ───────────────────────────────────────────────────

const testGridHistory = createDevvitTest({ userId: 't2_testuser' })

testGridHistory('getGridHistory returns empty array for new grid size', async () => {
    const history = await getGridHistory('t2_testuser', 4)
    expect(history).toEqual([])
})

testGridHistory('setGridHistory round-trips records for a grid size', async () => {
    const records: GameRecord[] = [
        { level: 1, timeTaken: 45, timestamp: 1000 },
        { level: 2, timeTaken: 90, timestamp: 2000, skipped: true },
    ]

    await setGridHistory('t2_testuser', 6, records)
    const history = await getGridHistory('t2_testuser', 6)
    expect(history).toEqual(records)
})

testGridHistory('getGridHistory is isolated per grid size', async () => {
    const records4: GameRecord[] = [{ level: 1, timeTaken: 45, timestamp: 1000 }]
    const records6: GameRecord[] = [{ level: 2, timeTaken: 120, timestamp: 2000 }]

    await setGridHistory('t2_testuser', 4, records4)
    await setGridHistory('t2_testuser', 6, records6)

    expect(await getGridHistory('t2_testuser', 4)).toEqual(records4)
    expect(await getGridHistory('t2_testuser', 6)).toEqual(records6)
    expect(await getGridHistory('t2_testuser', 8)).toEqual([])
})
