import { describe, it, expect } from 'vitest'
import { getLoginGate, LOGIN_CTA } from '../login-gate'

describe('getLoginGate', () => {
    it('reveals all account-scoped UI for logged-in users', () => {
        const gate = getLoginGate(true)

        expect(gate.showWallet).toBe(true)
        expect(gate.showSeason).toBe(true)
        expect(gate.showLeaderboard).toBe(true)
        expect(gate.showSocialActions).toBe(true)
        expect(gate.showLoginCta).toBe(false)
    })

    it('hides account-scoped UI and surfaces the login CTA for logged-out users', () => {
        const gate = getLoginGate(false)

        expect(gate.showWallet).toBe(false)
        expect(gate.showSeason).toBe(false)
        expect(gate.showLeaderboard).toBe(false)
        expect(gate.showSocialActions).toBe(false)
        expect(gate.showLoginCta).toBe(true)
    })

    it('treats an undefined flag as logged-in (backwards compatible default)', () => {
        const gate = getLoginGate(undefined)

        expect(gate.showWallet).toBe(true)
        expect(gate.showLoginCta).toBe(false)
    })
})

describe('LOGIN_CTA', () => {
    it('communicates that signing in saves progress and unlocks features', () => {
        // Reddit guidance: the CTA must tell the user their game data will be
        // saved without implying a subscribe action.
        expect(LOGIN_CTA.body.toLowerCase()).toContain('save')
        expect(LOGIN_CTA.body.toLowerCase()).not.toContain('subscribe')
        expect(LOGIN_CTA.title.length).toBeGreaterThan(0)
        expect(LOGIN_CTA.button.length).toBeGreaterThan(0)
    })
})
