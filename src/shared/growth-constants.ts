/**
 * Growth Roadmap Constants
 * Kill rules, scale rules, roadmap phases, and season scoring.
 * All definitions are data-driven — adjusting thresholds requires no engine changes.
 */

import type { KillRule, RoadmapPhase, ScaleRule, SeasonTopReward } from './growth-types'

// ─── Season Scoring ────────────────────────────────────────────────────────────

/** Base points awarded per puzzle completion in a season */
export const SEASON_BASE_POINTS = 10

/** Bonus points for completing a puzzle within par time */
export const SEASON_SPEED_BONUS = 5

/** Bonus points for completing a puzzle with zero mistakes */
export const SEASON_PERFECT_BONUS = 10

/** Coin rewards for top-ranked season players */
export const SEASON_TOP_REWARDS: readonly SeasonTopReward[] = [
    { rank: 1, coins: 500 },
    { rank: 2, coins: 250 },
    { rank: 3, coins: 100 },
] as const

// ─── Kill Rules ────────────────────────────────────────────────────────────────

/** Metric thresholds that trigger "stop investing" alerts */
export const KILL_RULES: readonly KillRule[] = [
    {
        id: 'kill_first_action_rate',
        metric: 'firstActionRate7d',
        threshold: 0.50,
        comparison: 'below',
        message: 'KILL: Users not understanding first screen',
    },
    {
        id: 'kill_completion_rate',
        metric: 'completionRate7d',
        threshold: 0.30,
        comparison: 'below',
        message: 'KILL: Puzzle too hard or UX broken',
    },
    {
        id: 'kill_d1_return_rate',
        metric: 'd1ReturnRate7d',
        threshold: 0.15,
        comparison: 'below',
        message: 'KILL: No return habit forming',
    },
] as const

// ─── Scale Rules ───────────────────────────────────────────────────────────────

/** Metric thresholds that trigger "double down" alerts */
export const SCALE_RULES: readonly ScaleRule[] = [
    {
        id: 'scale_d1_return',
        metric: 'd1ReturnRate7d',
        threshold: 0.40,
        comparison: 'above',
        message: 'SCALE: Strong return habit — add more streak/reset mechanics',
    },
    {
        id: 'scale_result_copies',
        metric: 'dailyResultCopies',
        threshold: 10,
        comparison: 'above',
        message: 'SCALE: Users sharing organically — prioritize share card polish',
    },
    {
        id: 'scale_dqe_tier2',
        metric: 'dqe7d',
        threshold: 1000,
        comparison: 'above',
        message: 'SCALE: Tier 2 reached — focus on stability',
    },
    {
        id: 'k_factor_viral',
        metric: 'kFactor7d',
        threshold: 1.0,
        comparison: 'above',
        message: 'SCALE: K-factor > 1 — viral growth achieved, double down on share mechanics',
    },
] as const

// ─── Roadmap Phases ────────────────────────────────────────────────────────────

/** 60-day roadmap phase definitions with day boundaries and suggested actions */
export const ROADMAP_PHASES: readonly RoadmapPhase[] = [
    {
        phase: 1, startDay: 1, endDay: 14, label: 'Distribution Sprint',
        suggestedActions: [
            'Pitch to 2 subreddit mods today',
            'Polish inline onboarding guidance',
            'Check install conversion',
        ],
    },
    {
        phase: 2, startDay: 15, endDay: 30, label: 'Retention & Polish',
        suggestedActions: [
            'Review completion rate drop-offs',
            'A/B test result card format',
            'Add social posting prompts',
        ],
    },
    {
        phase: 3, startDay: 31, endDay: 45, label: 'Scale',
        suggestedActions: [
            'Launch weekly event',
            'Push for Reddit featuring',
            'Review season engagement',
        ],
    },
    {
        phase: 4, startDay: 46, endDay: 60, label: 'Payout Maximization',
        suggestedActions: [
            'No new features',
            'Monitor stability',
            'Optimize existing flows',
        ],
    },
] as const
