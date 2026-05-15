/**
 * Dashboard Engine
 * Pure rule evaluation, rolling average computation, roadmap phase tracking,
 * markdown formatting, and Redis-backed dashboard aggregation.
 */

import { redis } from '@devvit/web/server'

import type {
    Alert,
    CurrentPhase,
    DashboardData,
    DailyMetrics,
    KillRule,
    RoadmapPhase,
    RollingMetrics,
    ScaleRule,
} from '../../shared/growth-types'
import { KILL_RULES, ROADMAP_PHASES, SCALE_RULES } from '../../shared/growth-constants'
import { getDailyMetrics } from './analytics'

// ─── Key Builders ──────────────────────────────────────────────────────────────

const dashboardKey = (date: string): string =>
    `dashboard:${date}`

const roadmapStartDateKey = (): string =>
    'roadmap:startDate'

const seasonLeaderboardKey = (seasonId: string): string =>
    `season:${seasonId}:leaderboard`

// ─── Pure Functions ────────────────────────────────────────────────────────────

/**
 * Compute the 7-day rolling average of a nullable numeric array.
 * Filters out null values before averaging.
 * Uses the last 7 values when length >= 7, otherwise the mean of all values.
 * Returns null when all values are null or the array is empty.
 */
export const computeRollingAverage = (values: readonly (number | null)[]): number | null => {
    const slice = values.length >= 7
        ? values.slice(-7)
        : values

    const nonNull = slice.filter((v): v is number => v !== null)

    if (nonNull.length === 0) return null

    const sum = nonNull.reduce((acc, v) => acc + v, 0)
    return sum / nonNull.length
}

/** Result of evaluating a set of rules against rolling metrics. */
export type RuleEvaluationResult = {
    alerts: Alert[]
    suppressedRuleIds: string[]
}

/**
 * Generic rule evaluator — shared logic for kill and scale rules.
 * Skips rules whose target metric is null and records them in suppressedRuleIds.
 */
const evaluateRules = (
    metrics: RollingMetrics,
    rules: readonly (KillRule | ScaleRule)[],
    type: 'kill' | 'scale',
): RuleEvaluationResult =>
    rules.reduce<RuleEvaluationResult>(({ alerts, suppressedRuleIds }, rule) => {
        const metricValue = metrics[rule.metric as keyof RollingMetrics]

        // Null metric → suppress this rule entirely
        if (metricValue === null || metricValue === undefined) {
            return { alerts, suppressedRuleIds: [...suppressedRuleIds, rule.id] }
        }

        const triggered = rule.comparison === 'below'
            ? metricValue < rule.threshold
            : metricValue > rule.threshold

        if (triggered) {
            return {
                alerts: [...alerts, {
                    ruleId: rule.id,
                    type,
                    message: rule.message,
                    metricValue,
                    threshold: rule.threshold,
                }],
                suppressedRuleIds,
            }
        }

        return { alerts, suppressedRuleIds }
    }, { alerts: [], suppressedRuleIds: [] })

/**
 * Evaluate kill rules against rolling metrics.
 * Skips rules whose target metric is null; returns alerts and suppressedRuleIds.
 */
export const evaluateKillRules = (
    metrics: RollingMetrics,
    rules: readonly KillRule[],
): RuleEvaluationResult =>
    evaluateRules(metrics, rules, 'kill')

/**
 * Evaluate scale rules against rolling metrics.
 * Skips rules whose target metric is null; returns alerts and suppressedRuleIds.
 */
export const evaluateScaleRules = (
    metrics: RollingMetrics,
    rules: readonly ScaleRule[],
): RuleEvaluationResult =>
    evaluateRules(metrics, rules, 'scale')

/**
 * Compute the current roadmap phase from start and current ISO date strings.
 * Day 1 = startDate. When dayNumber > 60, returns Phase 4 with isComplete = true.
 */
export const computeRoadmapPhase = (
    startDate: string,
    currentDate: string,
    phases: readonly RoadmapPhase[],
): CurrentPhase => {
    const startMs = new Date(`${startDate}T00:00:00Z`).getTime()
    const currentMs = new Date(`${currentDate}T00:00:00Z`).getTime()
    const dayNumber = Math.floor((currentMs - startMs) / 86400000) + 1

    if (dayNumber > 60) {
        const lastPhase = phases[phases.length - 1]
        return {
            phase: 4,
            label: lastPhase?.label ?? 'Payout Maximization',
            dayNumber,
            isComplete: true,
            suggestedActions: lastPhase?.suggestedActions ?? [],
        }
    }

    const matchingPhase = phases.find(
        (p) => dayNumber >= p.startDay && dayNumber <= p.endDay,
    )

    // Fallback to last phase if no range matches (shouldn't happen with well-defined phases)
    const phase = matchingPhase ?? phases[phases.length - 1]!

    return {
        phase: phase.phase,
        label: phase.label,
        dayNumber,
        isComplete: false,
        suggestedActions: phase.suggestedActions,
    }
}

/**
 * Get suggested actions for a roadmap phase.
 */
export const getSuggestedActions = (phase: RoadmapPhase): readonly string[] =>
    phase.suggestedActions

/**
 * Format dashboard data as a Reddit markdown table with alerts and phase info.
 */
export const formatDashboardMarkdown = (data: DashboardData): string => {
    const lines: string[] = []

    // Metrics table
    lines.push('| Metric | Value |')
    lines.push('|---|---|')
    lines.push(`| DQE (7d avg) | ${data.rolling.dqe7d} |`)
    lines.push(`| First Action Rate (7d) | ${data.rolling.firstActionRate7d} |`)
    lines.push(`| Completion Rate (7d) | ${data.rolling.completionRate7d} |`)
    lines.push(`| D1 Return Rate (7d) | ${data.rolling.d1ReturnRate7d} |`)
    lines.push('')

    // Alerts
    const killAlerts = data.alerts.filter((a) => a.type === 'kill')
    const scaleAlerts = data.alerts.filter((a) => a.type === 'scale')

    if (killAlerts.length > 0) {
        for (const alert of killAlerts) {
            lines.push(`🚨 ${alert.message} (value: ${alert.metricValue}, threshold: ${alert.threshold})`)
        }
        lines.push('')
    }

    if (scaleAlerts.length > 0) {
        for (const alert of scaleAlerts) {
            lines.push(`🚀 ${alert.message} (value: ${alert.metricValue}, threshold: ${alert.threshold})`)
        }
        lines.push('')
    }

    // Roadmap phase
    lines.push(`**Phase ${data.currentPhase.phase}:** ${data.currentPhase.label} (Day ${data.currentPhase.dayNumber})`)

    if (data.currentPhase.isComplete) {
        lines.push('✅ Roadmap Complete')
    }

    return lines.join('\n')
}

// ─── Redis Persistence ─────────────────────────────────────────────────────────

/**
 * Build an array of ISO date strings for the last N days ending at the given date.
 */
const getDateRange = (endDate: string, days: number): string[] => {
    const end = new Date(`${endDate}T00:00:00Z`)
    const dates: string[] = []

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(end.getTime() - i * 86400000)
        dates.push(d.toISOString().split('T')[0]!)
    }

    return dates
}

/**
 * Get the ISO week season ID for a given date string.
 */
const getSeasonIdForDate = (date: string): string => {
    const d = new Date(`${date}T00:00:00Z`)
    const dayOfWeek = d.getUTCDay() || 7
    const monday = new Date(Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate() - (dayOfWeek - 1),
    ))
    const thursday = new Date(Date.UTC(
        monday.getUTCFullYear(),
        monday.getUTCMonth(),
        monday.getUTCDate() + 3,
    ))
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
    const weekNum = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

/**
 * Compute and store the full dashboard for a given date.
 * Aggregates daily metrics, computes rolling averages, evaluates rules,
 * determines roadmap phase, and persists to Redis.
 */
export const computeDashboard = async (date: string): Promise<DashboardData> => {
    // Fetch last 7 days of metrics for rolling averages
    const dates = getDateRange(date, 7)
    const dailyMetricsList: DailyMetrics[] = await Promise.all(
        dates.map((d) => getDailyMetrics(d)),
    )

    // Current day's metrics (last in the list)
    const daily = dailyMetricsList[dailyMetricsList.length - 1]!

    // Compute rolling averages
    const rolling: RollingMetrics = {
        dqe7d: computeRollingAverage(dailyMetricsList.map((m) => m.estimatedDQE)),
        firstActionRate7d: computeRollingAverage(dailyMetricsList.map((m) => m.firstActionRate)),
        completionRate7d: computeRollingAverage(dailyMetricsList.map((m) => m.completionRate)),
        d1ReturnRate7d: computeRollingAverage(dailyMetricsList.map((m) => m.d1ReturnRate)),
    }

    // Evaluate rules (null metrics are suppressed, not alerted)
    const killResult = evaluateKillRules(rolling, KILL_RULES)
    const scaleResult = evaluateScaleRules(rolling, SCALE_RULES)
    const alerts = [...killResult.alerts, ...scaleResult.alerts]
    const dqSuppressedRuleIds = [...killResult.suppressedRuleIds, ...scaleResult.suppressedRuleIds]

    // Compute roadmap phase
    const startDateStr = await redis.get(roadmapStartDateKey())
    const roadmapStart = startDateStr ?? date
    const currentPhase = computeRoadmapPhase(roadmapStart, date, ROADMAP_PHASES)

    // Count season participants
    const seasonId = getSeasonIdForDate(date)
    const seasonEntries = await redis.zRange(seasonLeaderboardKey(seasonId), 0, -1, { by: 'rank' })
    const seasonParticipants = seasonEntries.length

    const dashboardData: DashboardData = {
        date,
        daily,
        rolling,
        alerts,
        currentPhase,
        seasonParticipants,
        dqSuppressedRuleIds,
        backfillPolicy: 'no-backfill',
    }

    // Store in Redis with 90-day TTL
    await redis.set(dashboardKey(date), JSON.stringify(dashboardData))
    await redis.expire(dashboardKey(date), 7776000)

    return dashboardData
}
