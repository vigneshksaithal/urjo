import { createDevvitTest } from '@devvit/test/server/vitest'
import { redis } from '@devvit/web/server'
import { describe, it, expect } from 'vitest'
import { getTodayUTC, getSkillLevel, fetchUsername } from '../helpers'
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
