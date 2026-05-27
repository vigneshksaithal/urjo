/**
 * Growth Roadmap Types
 * Shared between client and server
 */

// ─── Result Card ───────────────────────────────────────────────────────────────

/** Data needed to generate a shareable result card */
export type ResultCardData = {
    puzzleNumber: number
    gridSize: 4 | 6 | 8
    skillLevel: number
    colorGrid: ('red' | 'blue')[][]
    timeTaken: number
    mistakes: number
    streak: number
}

// ─── Viral Loop ────────────────────────────────────────────────────────────────

/** Distinct mechanism through which existing users expose the game to potential new users */
export type InviteChannel = 'challenge_post' | 'result_comment' | 'result_copy' | 'race'

/** Metrics for a single invite channel */
export type ChannelMetrics = {
    opens: number
    conversions: number
    conversionRate: number | null
}

/** Per-channel metrics for all invite channels */
export type PerChannelMetrics = {
    challenge_post: ChannelMetrics
    result_comment: ChannelMetrics
    result_copy: ChannelMetrics
    race: ChannelMetrics
}

// ─── Analytics ─────────────────────────────────────────────────────────────────

/** Daily funnel metrics for a single date */
export type DailyMetrics = {
    date: string
    postOpens: number
    firstActions: number
    completions: number
    resultCopies: number
    helpTaps: number
    firstActionRate: number | null
    completionRate: number | null
    d1ReturnRate: number | null
    d3ReturnRate?: number | null
    estimatedDQE: number
    /**
     * Data-quality flags. Each true value means the corresponding metric
     * is unreliable for the given date and downstream consumers should
     * treat the related rates as null rather than as zeros.
     *
     * - firstActionMissing: completions > 0 but first_actions == 0 (instrumentation gap)
     * - d1WindowIncomplete: the D+1 cohort window has not closed yet,
     *   so D1-derived rates (d1ReturnRate, challengeD1RetainedShare, kFactor) are unknown
     */
    dq: {
        firstActionMissing: boolean
        d1WindowIncomplete?: boolean
    }
    helpTapRate: number | null
    growth?: GrowthLoopMetrics
}

/** Reddit-native growth loop metrics for a single date */
export type GrowthLoopMetrics = {
    dailyActiveEngagers: number
    resultComments: number
    challengePosts: number
    challengeOpens: number
    challengeCompletions: number
    newPlayerChallengeCompletions: number
    notifyOptIns: number
    subscribeTaps: number
    challengePostsPerCompleter: number
    newCompletersPerChallenge: number
    /**
     * D1 return rate of users acquired via challenge posts on this date.
     * Null when the D+1 cohort window has not closed yet.
     */
    challengeD1RetainedShare: number | null
    /**
     * Viral coefficient. Null when any input is unknown — most commonly
     * because challengeD1RetainedShare's window has not closed yet.
     */
    kFactor: number | null
    shareRate: number | null
    viralCycleTimeHours: number | null
    perChannelMetrics: PerChannelMetrics | null
    raceJoins: number
    raceMatches: number
    raceCompletions: number
    raceWinRate: number | null
    avgRaceDuration: number | null
}

/** 7-day rolling averages for key growth metrics */
export type RollingMetrics = {
    dqe7d: number | null
    firstActionRate7d: number | null
    completionRate7d: number | null
    d1ReturnRate7d: number | null
    shareRate7d: number | null
    kFactor7d: number | null
    viralCycleTimeHours7d: number | null
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

/** Alert triggered by a kill or scale rule evaluation */
export type Alert = {
    ruleId: string
    type: 'kill' | 'scale'
    message: string
    metricValue: number
    threshold: number
}

/** Current roadmap phase with suggested actions */
export type CurrentPhase = {
    phase: number
    label: string
    dayNumber: number
    isComplete: boolean
    suggestedActions: readonly string[]
}

/** Full dashboard data for a single date */
export type DashboardData = {
    date: string
    daily: DailyMetrics
    rolling: RollingMetrics
    alerts: Alert[]
    currentPhase: CurrentPhase
    seasonParticipants: number
    dqSuppressedRuleIds: string[]
    backfillPolicy: 'no-backfill'
}

// ─── Seasons ───────────────────────────────────────────────────────────────────

/** Metadata for a single 7-day competitive season */
export type SeasonInfo = {
    seasonId: string
    seasonNumber: number
    startDate: string
    endDate: string
    isActive: boolean
}

/** Single entry in a season leaderboard */
export type SeasonLeaderboardEntry = {
    rank: number
    userId: string
    username: string
    score: number
}

/** Full season leaderboard response */
export type SeasonLeaderboardResponse = {
    season: SeasonInfo
    entries: SeasonLeaderboardEntry[]
    playerRank: number | null
    playerScore: number
}

/** Season recap data for end-of-season summary */
export type SeasonRecap = {
    seasonId: string
    topPlayers: { userId: string; username: string; score: number }[]
    totalParticipants: number
}

// ─── Subreddit Config ──────────────────────────────────────────────────────────

/** How often puzzle posts are created */
export type PostFrequency = 'once_daily' | 'twice_daily' | 'thrice_daily'

/** Per-subreddit configuration stored in Redis */
export type SubredditConfig = {
    postFrequency: PostFrequency
    defaultGridSize: 4 | 6 | 8
    brandingEmoji: string
    welcomeMessage: string
}

/** Installation record for a subreddit */
export type InstallationInfo = {
    subredditId: string
    subredditName: string
    installedAt: number
    installedBy: string
    dqeLast7Days?: number[] | undefined
}

// ─── Constants Types ───────────────────────────────────────────────────────────

/** Kill rule: metric threshold that triggers a "stop investing" alert */
export type KillRule = {
    readonly id: string
    readonly metric: string
    readonly threshold: number
    readonly comparison: 'below' | 'above'
    readonly message: string
}

/** Scale rule: metric threshold that triggers a "double down" alert */
export type ScaleRule = {
    readonly id: string
    readonly metric: string
    readonly threshold: number
    readonly comparison: 'below' | 'above'
    readonly message: string
}

/** Roadmap phase definition with day boundaries and suggested actions */
export type RoadmapPhase = {
    readonly phase: number
    readonly startDay: number
    readonly endDay: number
    readonly label: string
    readonly suggestedActions: readonly string[]
}

/** Season reward for a top-ranked player */
export type SeasonTopReward = {
    readonly rank: number
    readonly coins: number
}
