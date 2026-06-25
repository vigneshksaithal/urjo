/**
 * Economy Route Integration Tests
 * Tests all economy API endpoints via app.request() with seeded Redis data.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 9.1, 9.2
 */

import { createDevvitTest } from '@devvit/test/server/vitest'
import { expect } from 'vitest'
import { app } from '../../index'
import { getUserEconomy, saveUserEconomy } from '../../lib/economy'
import { MAX_STREAK_FREEZES } from '../../../shared/constants'

const USER_ID = 't2_testuser'

// ─── GET /api/economy ─────────────────────────────────────────────────────────

const testEconomy = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

/**
 * Requirement 6.1: GET /api/economy returns 200 with user economy data
 */
testEconomy('GET /api/economy returns 200 with user economy data', async () => {
    const res = await app.request('/api/economy')
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.coins).toBeDefined()
    expect(json.equippedTitle).toBeDefined()
    expect(json.ownedTitles).toBeDefined()
})

// ─── GET /api/shop ────────────────────────────────────────────────────────────

const testShop = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

/**
 * Requirement 6.2: GET /api/shop returns 200 with shop items and coin balance
 */
testShop('GET /api/shop returns 200 with shop items and coin balance', async () => {
    const res = await app.request('/api/shop')
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.items).toBeDefined()
    expect(Array.isArray(json.items)).toBe(true)
    expect(json.coins).toBeDefined()
})

// ─── POST /api/shop/buy — success ─────────────────────────────────────────────

const testBuySuccess = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

/**
 * Requirement 6.3: POST /api/shop/buy returns 200 with success=true and updated balance
 * Seed user with 200 coins, buy 'streak_lord' which costs 100
 */
testBuySuccess('POST /api/shop/buy returns 200 with success and updated balance for valid purchase', async () => {
    await saveUserEconomy(USER_ID, { coins: 200, ownedTitles: ['puzzler'] })

    const res = await app.request('/api/shop/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleId: 'streak_lord' }),
    })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.newBalance).toBe(100) // 200 - 100
})

// ─── POST /api/shop/buy — insufficient coins ──────────────────────────────────

const testBuyInsufficient = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

/**
 * Requirement 6.4: POST /api/shop/buy returns 400 for insufficient coins
 * User has 0 coins (default), try to buy 'streak_lord' at cost 100
 */
testBuyInsufficient('POST /api/shop/buy returns 400 for insufficient coins', async () => {
    // No seeding — user defaults to 0 coins

    const res = await app.request('/api/shop/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleId: 'streak_lord' }),
    })
    expect(res.status).toBe(400)
})

// ─── POST /api/shop/equip — owned title ───────────────────────────────────────

const testEquipOwned = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

/**
 * Requirement 6.5: POST /api/shop/equip returns 200 for owned title
 * Seed user owning 'streak_lord', equip it
 */
testEquipOwned('POST /api/shop/equip returns 200 for owned title', async () => {
    await saveUserEconomy(USER_ID, { ownedTitles: ['puzzler', 'streak_lord'] })

    const res = await app.request('/api/shop/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleId: 'streak_lord' }),
    })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.success).toBe(true)
})

// ─── POST /api/shop/equip — unowned title ─────────────────────────────────────

const testEquipUnowned = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

/**
 * Requirement 6.6: POST /api/shop/equip returns 400 for unowned title
 * User only owns 'puzzler' (default), try to equip 'streak_lord'
 */
testEquipUnowned('POST /api/shop/equip returns 400 for unowned title', async () => {
    // No seeding — user defaults to owning only 'puzzler'

    const res = await app.request('/api/shop/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleId: 'streak_lord' }),
    })
    expect(res.status).toBe(400)
})

// ─── Atomic coin spend — no double-spend / negative balance (H1) ─────────────

const testConcurrentBuy = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

/**
 * Two concurrent purchases of the same title must not double-spend or drive the
 * balance negative: the coin debit is atomic, so exactly one buy succeeds and
 * the title is owned exactly once.
 */
testConcurrentBuy('POST /api/shop/buy: concurrent buys never double-spend or go negative', async () => {
    // Exactly enough for one purchase.
    await saveUserEconomy(USER_ID, { coins: 100, ownedTitles: ['puzzler'] })

    const buy = () =>
        app.request('/api/shop/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titleId: 'streak_lord' }),
        })

    const [r1, r2] = await Promise.all([buy(), buy()])
    const successes = [r1, r2].filter((r) => r.status === 200).length

    // At most one purchase can succeed for a single affordable title.
    expect(successes).toBe(1)

    const econ = await getUserEconomy(USER_ID)
    // Balance is never negative, and exactly one title's cost was debited.
    expect(econ.coins).toBe(0)
    // The title is owned exactly once (no duplicate append).
    expect(econ.ownedTitles.filter((t) => t === 'streak_lord')).toHaveLength(1)
})

const testStreakFreezeCap = createDevvitTest({ userId: USER_ID, subredditName: 'testsub' })

/**
 * Concurrent streak-freeze purchases respect the cap and never over-debit: the
 * cap is enforced on the atomic post-increment value.
 */
testStreakFreezeCap('POST /api/shop/buy-streak-freeze: concurrent buys respect the cap atomically', async () => {
    // Plenty of coins; already at one below the cap so only one buy can land.
    await saveUserEconomy(USER_ID, { coins: 100000, streakFreezes: MAX_STREAK_FREEZES - 1 })

    const buy = () =>
        app.request('/api/shop/buy-streak-freeze', { method: 'POST' })

    const [r1, r2] = await Promise.all([buy(), buy()])
    const successes = [r1, r2].filter((r) => r.status === 200).length
    expect(successes).toBe(1)

    const econ = await getUserEconomy(USER_ID)
    expect(econ.streakFreezes).toBe(MAX_STREAK_FREEZES)
})
