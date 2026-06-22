/**
 * Login gate — single source of truth for which account-scoped UI is shown.
 *
 * Logged-out Reddit users can play the puzzle, but everything that needs an
 * account (coin wallet, streak, season standing, leaderboards, social
 * actions) is hidden and replaced with a login call-to-action. Centralising
 * the decision here keeps the visibility rules consistent across components
 * and unit-testable away from Svelte.
 */

/** Visibility flags for account-scoped UI. */
export type LoginGate = {
    showWallet: boolean
    showSeason: boolean
    showLeaderboard: boolean
    showSocialActions: boolean
    showLoginCta: boolean
}

/**
 * Compute UI visibility from the viewer's logged-in state.
 *
 * An undefined flag is treated as logged-in so existing flows (which never
 * set it) are unaffected.
 */
export const getLoginGate = (isLoggedIn: boolean | undefined): LoginGate => {
    const loggedIn = isLoggedIn !== false
    return {
        showWallet: loggedIn,
        showSeason: loggedIn,
        showLeaderboard: loggedIn,
        showSocialActions: loggedIn,
        showLoginCta: !loggedIn,
    }
}

/**
 * Copy for the login prompt shown to logged-out users. Pairs the prompt with
 * a clear value proposition (save progress + unlock features), as Reddit's
 * logged-out guide recommends.
 */
export const LOGIN_CTA = {
    title: 'Save your progress',
    body: 'Sign in to save your streak, earn coins, and subscribe for daily puzzles.',
    button: 'Sign in to save',
} as const
