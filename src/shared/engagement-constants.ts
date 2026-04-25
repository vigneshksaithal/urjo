/**
 * Engagement Growth System Constants
 * Mission templates, achievement definitions, reward weights, and flair tiers.
 * All definitions are data-driven — adding new missions or achievements requires no engine changes.
 */

import type { AchievementDef, FlairTierDef, MissionTemplate } from './engagement-types'

// ─── Daily Mission Templates ───────────────────────────────────────────────────

/** Pool of daily mission templates — 3 are selected each UTC day via deterministic seed */
export const DAILY_MISSION_TEMPLATES: readonly MissionTemplate[] = [
    {
        id: 'daily_solve_3',
        type: 'solve_n_puzzles',
        descriptionTemplate: 'Solve {n} puzzles today',
        targetValue: 3,
        coinReward: 15,
        cadence: 'daily',
    },
    {
        id: 'daily_solve_5',
        type: 'solve_n_puzzles',
        descriptionTemplate: 'Solve {n} puzzles today',
        targetValue: 5,
        coinReward: 25,
        cadence: 'daily',
    },
    {
        id: 'daily_speed_60',
        type: 'solve_under_time',
        descriptionTemplate: 'Solve a puzzle in under {n} seconds',
        targetValue: 60,
        coinReward: 20,
        cadence: 'daily',
    },
    {
        id: 'daily_speed_90',
        type: 'solve_under_time',
        descriptionTemplate: 'Solve a puzzle in under {n} seconds',
        targetValue: 90,
        coinReward: 15,
        cadence: 'daily',
    },
    {
        id: 'daily_perfect',
        type: 'solve_zero_mistakes',
        descriptionTemplate: 'Solve a puzzle with zero mistakes',
        targetValue: 1,
        coinReward: 20,
        cadence: 'daily',
    },
    {
        id: 'daily_grid_4',
        type: 'solve_grid_size',
        descriptionTemplate: 'Solve a 4×4 puzzle',
        targetValue: 4,
        coinReward: 10,
        cadence: 'daily',
    },
    {
        id: 'daily_grid_6',
        type: 'solve_grid_size',
        descriptionTemplate: 'Solve a 6×6 puzzle',
        targetValue: 6,
        coinReward: 15,
        cadence: 'daily',
    },
    {
        id: 'daily_grid_8',
        type: 'solve_grid_size',
        descriptionTemplate: 'Solve an 8×8 puzzle',
        targetValue: 8,
        coinReward: 20,
        cadence: 'daily',
    },
    {
        id: 'daily_streak_2',
        type: 'maintain_streak',
        descriptionTemplate: 'Maintain a streak of {n}+ days',
        targetValue: 2,
        coinReward: 10,
        cadence: 'daily',
    },
    {
        id: 'daily_streak_5',
        type: 'maintain_streak',
        descriptionTemplate: 'Maintain a streak of {n}+ days',
        targetValue: 5,
        coinReward: 20,
        cadence: 'daily',
    },
    {
        id: 'daily_earn_30',
        type: 'earn_n_coins',
        descriptionTemplate: 'Earn {n} coins today',
        targetValue: 30,
        coinReward: 15,
        cadence: 'daily',
    },
    {
        id: 'daily_earn_50',
        type: 'earn_n_coins',
        descriptionTemplate: 'Earn {n} coins today',
        targetValue: 50,
        coinReward: 25,
        cadence: 'daily',
    },
] as const

// ─── Weekly Mission Templates ──────────────────────────────────────────────────

/** Pool of weekly mission templates — 2 are selected each UTC week via deterministic seed */
export const WEEKLY_MISSION_TEMPLATES: readonly MissionTemplate[] = [
    {
        id: 'weekly_solve_15',
        type: 'solve_n_puzzles',
        descriptionTemplate: 'Solve {n} puzzles this week',
        targetValue: 15,
        coinReward: 50,
        cadence: 'weekly',
    },
    {
        id: 'weekly_solve_25',
        type: 'solve_n_puzzles',
        descriptionTemplate: 'Solve {n} puzzles this week',
        targetValue: 25,
        coinReward: 75,
        cadence: 'weekly',
    },
    {
        id: 'weekly_each_grid',
        type: 'solve_each_grid',
        descriptionTemplate: 'Solve a puzzle on each grid size',
        targetValue: 3,
        coinReward: 40,
        cadence: 'weekly',
    },
    {
        id: 'weekly_speed_5',
        type: 'achieve_speed_solves',
        descriptionTemplate: 'Achieve {n} speed solves this week',
        targetValue: 5,
        coinReward: 50,
        cadence: 'weekly',
    },
    {
        id: 'weekly_speed_10',
        type: 'achieve_speed_solves',
        descriptionTemplate: 'Achieve {n} speed solves this week',
        targetValue: 10,
        coinReward: 75,
        cadence: 'weekly',
    },
    {
        id: 'weekly_earn_200',
        type: 'earn_n_coins',
        descriptionTemplate: 'Earn {n} coins this week',
        targetValue: 200,
        coinReward: 50,
        cadence: 'weekly',
    },
    {
        id: 'weekly_earn_500',
        type: 'earn_n_coins',
        descriptionTemplate: 'Earn {n} coins this week',
        targetValue: 500,
        coinReward: 100,
        cadence: 'weekly',
    },
    {
        id: 'weekly_daily_missions_3',
        type: 'complete_daily_missions',
        descriptionTemplate: 'Complete all daily missions on {n} different days',
        targetValue: 3,
        coinReward: 60,
        cadence: 'weekly',
    },
    {
        id: 'weekly_daily_missions_5',
        type: 'complete_daily_missions',
        descriptionTemplate: 'Complete all daily missions on {n} different days',
        targetValue: 5,
        coinReward: 100,
        cadence: 'weekly',
    },
    {
        id: 'weekly_difficulty_5',
        type: 'solve_difficulty_level',
        descriptionTemplate: 'Solve a puzzle at difficulty level {n}+',
        targetValue: 5,
        coinReward: 40,
        cadence: 'weekly',
    },
    {
        id: 'weekly_difficulty_7',
        type: 'solve_difficulty_level',
        descriptionTemplate: 'Solve a puzzle at difficulty level {n}+',
        targetValue: 7,
        coinReward: 60,
        cadence: 'weekly',
    },
] as const

// ─── Achievement Definitions ───────────────────────────────────────────────────

/** All achievement definitions across categories — checked after every puzzle completion */
export const ACHIEVEMENT_DEFS: readonly AchievementDef[] = [
    // Solve Count
    { id: 'solve_10', category: 'solve_count', label: 'Puzzle Novice', emoji: '🧩', description: 'Solve 10 puzzles', thresholdValue: 10, coinBonus: 25 },
    { id: 'solve_50', category: 'solve_count', label: 'Puzzle Enthusiast', emoji: '🧩', description: 'Solve 50 puzzles', thresholdValue: 50, coinBonus: 50 },
    { id: 'solve_100', category: 'solve_count', label: 'Puzzle Veteran', emoji: '🧩', description: 'Solve 100 puzzles', thresholdValue: 100, coinBonus: 100 },
    { id: 'solve_250', category: 'solve_count', label: 'Puzzle Master', emoji: '🧩', description: 'Solve 250 puzzles', thresholdValue: 250, coinBonus: 200 },
    { id: 'solve_500', category: 'solve_count', label: 'Puzzle Legend', emoji: '🧩', description: 'Solve 500 puzzles', thresholdValue: 500, coinBonus: 500 },

    // Streak
    { id: 'streak_7', category: 'streak', label: 'Week Warrior', emoji: '🔥', description: 'Maintain a 7-day streak', thresholdValue: 7, coinBonus: 50 },
    { id: 'streak_30', category: 'streak', label: 'Monthly Devotee', emoji: '🔥', description: 'Maintain a 30-day streak', thresholdValue: 30, coinBonus: 200 },
    { id: 'streak_100', category: 'streak', label: 'Century Streak', emoji: '🔥', description: 'Maintain a 100-day streak', thresholdValue: 100, coinBonus: 500 },
    { id: 'streak_365', category: 'streak', label: 'Year-Long Flame', emoji: '🔥', description: 'Maintain a 365-day streak', thresholdValue: 365, coinBonus: 1000 },

    // Speed
    { id: 'speed_10', category: 'speed', label: 'Quick Thinker', emoji: '⚡', description: 'Achieve 10 speed solves', thresholdValue: 10, coinBonus: 25 },
    { id: 'speed_50', category: 'speed', label: 'Lightning Fast', emoji: '⚡', description: 'Achieve 50 speed solves', thresholdValue: 50, coinBonus: 75 },
    { id: 'speed_100', category: 'speed', label: 'Speed Demon', emoji: '⚡', description: 'Achieve 100 speed solves', thresholdValue: 100, coinBonus: 150 },

    // Economy
    { id: 'economy_1000', category: 'economy', label: 'Coin Collector', emoji: '💰', description: 'Earn 1,000 total coins', thresholdValue: 1000, coinBonus: 50 },
    { id: 'economy_5000', category: 'economy', label: 'Wealthy Player', emoji: '💰', description: 'Earn 5,000 total coins', thresholdValue: 5000, coinBonus: 150 },
    { id: 'economy_10000', category: 'economy', label: 'Coin Mogul', emoji: '💰', description: 'Earn 10,000 total coins', thresholdValue: 10000, coinBonus: 300 },

    // Mastery
    { id: 'mastery_any_grid', category: 'mastery', label: 'Grid Expert', emoji: '🏆', description: 'Reach level 4 on any grid size', thresholdValue: 4, coinBonus: 100 },
    { id: 'mastery_all_grids', category: 'mastery', label: 'Grand Master', emoji: '🏆', description: 'Reach level 4 on all grid sizes', thresholdValue: 4, coinBonus: 500 },

    // Social
    { id: 'social_shares_5', category: 'social', label: 'Score Sharer', emoji: '📢', description: 'Share your score 5 times', thresholdValue: 5, coinBonus: 25 },
    { id: 'social_challenges_5', category: 'social', label: 'Challenger', emoji: '📢', description: 'Create 5 challenge posts', thresholdValue: 5, coinBonus: 50 },
    { id: 'social_beats_10', category: 'social', label: 'Challenge Champion', emoji: '📢', description: 'Have your challenges beaten 10 times', thresholdValue: 10, coinBonus: 75 },
] as const

// ─── Flair Tier Definitions ────────────────────────────────────────────────────

/** Flair tiers based on achievement count — forms a complete partition of [1, ∞) */
export const FLAIR_TIER_DEFS: readonly FlairTierDef[] = [
    { tier: 'bronze', minAchievements: 1, maxAchievements: 3, emoji: '🥉', label: 'Bronze' },
    { tier: 'silver', minAchievements: 4, maxAchievements: 7, emoji: '🥈', label: 'Silver' },
    { tier: 'gold', minAchievements: 8, maxAchievements: 12, emoji: '🥇', label: 'Gold' },
    { tier: 'diamond', minAchievements: 13, maxAchievements: 17, emoji: '💎', label: 'Diamond' },
    { tier: 'master', minAchievements: 18, maxAchievements: Infinity, emoji: '👑', label: 'Master' },
] as const

// ─── Variable Reward Weights ───────────────────────────────────────────────────

/** Bonus multiplier probability weights — must sum to 1.0 */
export const BONUS_MULTIPLIER_WEIGHTS = {
    none: 0.80,
    double: 0.15,
    triple: 0.05,
} as const

/** Mystery box reward type weights — must sum to 1.0 */
export const MYSTERY_BOX_WEIGHTS = {
    coins: 0.50,
    streakFreeze: 0.30,
    cosmeticTitle: 0.20,
} as const

/** Base probability of a mystery box drop per puzzle completion */
export const MYSTERY_BOX_BASE_DROP_RATE = 0.10

/** Additional drop rate per consecutive streak day */
export const MYSTERY_BOX_STREAK_BONUS = 0.02

/** Maximum mystery box drop rate (base + streak bonus capped here) */
export const MYSTERY_BOX_MAX_DROP_RATE = 0.30

/** Coin range for mystery box coin rewards */
export const MYSTERY_BOX_COIN_RANGE = { min: 10, max: 50 } as const

/** Coins awarded when mystery box rolls a cosmetic title but user owns all titles */
export const MYSTERY_BOX_TITLE_SUBSTITUTE_COINS = 100

// ─── Streak Milestones ─────────────────────────────────────────────────────────

/** Streak milestone thresholds and their bonus coin rewards */
export const STREAK_MILESTONES = [
    { threshold: 7, bonus: 50 },
    { threshold: 30, bonus: 200 },
    { threshold: 100, bonus: 500 },
    { threshold: 365, bonus: 1000 },
] as const

// ─── Referral Constants ────────────────────────────────────────────────────────

/** Coins awarded to challenge creator when a new player completes their challenge */
export const REFERRAL_BONUS = 25

/** Maximum referral bonuses per challenge post */
export const REFERRAL_CAP_PER_POST = 10

// ─── Mission Completion Bonuses ────────────────────────────────────────────────

/** Bonus coins for completing all 3 daily missions in a single day */
export const ALL_DAILY_BONUS = 25

/** Bonus coins for completing both weekly missions in a single week */
export const ALL_WEEKLY_BONUS = 75
