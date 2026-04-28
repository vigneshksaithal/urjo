import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
    computeRollingAverage,
    evaluateKillRules,
    evaluateScaleRules,
    formatDashboardMarkdown,
    computeRoadmapPhase,
    getSuggestedActions,
} from '../dashboard'
import { ROADMAP_PHASES } from '../../../shared/growth-constants'
import type {
    Alert,
    CurrentPhase,
    DailyMetrics,
    DashboardData,
    KillRule,
    RoadmapPhase,
    RollingMetrics,
    ScaleRule,
} from '../../../shared/growth-types'

// ─── computeRollingAverage (unit tests) ────────────────────────────────────────

describe('computeRollingAverage', () => {
    it('returns 0 for empty array', () => {
        expect(computeRollingAverage([])).toBe(0)
    })

    it('returns the single value for array of length 1', () => {
        expect(computeRollingAverage([5])).toBe(5)
    })

    it('returns mean of all values when length < 7', () => {
        expect(computeRollingAverage([2, 4, 6])).toBe(4)
    })

    it('returns mean of last 7 values when length >= 7', () => {
        const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        // Last 7: [4, 5, 6, 7, 8, 9, 10] → mean = 49/7 = 7
        expect(computeRollingAverage(values)).toBe(7)
    })

    it('returns mean of exactly 7 values when length === 7', () => {
        const values = [10, 20, 30, 40, 50, 60, 70]
        expect(computeRollingAverage(values)).toBe(40)
    })
})

// ─── evaluateKillRules / evaluateScaleRules (unit tests) ───────────────────────

describe('evaluateKillRules', () => {
    it('returns alert when metric is below threshold', () => {
        const metrics: RollingMetrics = {
            dqe7d: 100,
            firstActionRate7d: 0.40,
            completionRate7d: 0.50,
            d1ReturnRate7d: 0.20,
        }
        const rules: KillRule[] = [{
            id: 'test_kill',
            metric: 'firstActionRate7d',
            threshold: 0.50,
            comparison: 'below',
            message: 'Test kill alert',
        }]

        const alerts = evaluateKillRules(metrics, rules)
        expect(alerts).toHaveLength(1)
        expect(alerts[0]?.type).toBe('kill')
        expect(alerts[0]?.ruleId).toBe('test_kill')
        expect(alerts[0]?.metricValue).toBe(0.40)
        expect(alerts[0]?.threshold).toBe(0.50)
    })

    it('returns no alert when metric equals threshold (below comparison)', () => {
        const metrics: RollingMetrics = {
            dqe7d: 100,
            firstActionRate7d: 0.50,
            completionRate7d: 0.50,
            d1ReturnRate7d: 0.20,
        }
        const rules: KillRule[] = [{
            id: 'test_kill',
            metric: 'firstActionRate7d',
            threshold: 0.50,
            comparison: 'below',
            message: 'Test kill alert',
        }]

        const alerts = evaluateKillRules(metrics, rules)
        expect(alerts).toHaveLength(0)
    })

    it('returns no alert when metric is above threshold (below comparison)', () => {
        const metrics: RollingMetrics = {
            dqe7d: 100,
            firstActionRate7d: 0.60,
            completionRate7d: 0.50,
            d1ReturnRate7d: 0.20,
        }
        const rules: KillRule[] = [{
            id: 'test_kill',
            metric: 'firstActionRate7d',
            threshold: 0.50,
            comparison: 'below',
            message: 'Test kill alert',
        }]

        const alerts = evaluateKillRules(metrics, rules)
        expect(alerts).toHaveLength(0)
    })
})

describe('evaluateScaleRules', () => {
    it('returns alert when metric is above threshold', () => {
        const metrics: RollingMetrics = {
            dqe7d: 1500,
            firstActionRate7d: 0.60,
            completionRate7d: 0.50,
            d1ReturnRate7d: 0.45,
        }
        const rules: ScaleRule[] = [{
            id: 'test_scale',
            metric: 'dqe7d',
            threshold: 1000,
            comparison: 'above',
            message: 'Test scale alert',
        }]

        const alerts = evaluateScaleRules(metrics, rules)
        expect(alerts).toHaveLength(1)
        expect(alerts[0]?.type).toBe('scale')
        expect(alerts[0]?.ruleId).toBe('test_scale')
    })

    it('returns no alert when metric equals threshold (above comparison)', () => {
        const metrics: RollingMetrics = {
            dqe7d: 1000,
            firstActionRate7d: 0.60,
            completionRate7d: 0.50,
            d1ReturnRate7d: 0.45,
        }
        const rules: ScaleRule[] = [{
            id: 'test_scale',
            metric: 'dqe7d',
            threshold: 1000,
            comparison: 'above',
            message: 'Test scale alert',
        }]

        const alerts = evaluateScaleRules(metrics, rules)
        expect(alerts).toHaveLength(0)
    })
})

// ─── computeRoadmapPhase (unit tests) ──────────────────────────────────────────

describe('computeRoadmapPhase', () => {
    it('day 1 returns Phase 1', () => {
        const result = computeRoadmapPhase('2025-01-01', '2025-01-01', ROADMAP_PHASES)
        expect(result.phase).toBe(1)
        expect(result.dayNumber).toBe(1)
        expect(result.isComplete).toBe(false)
    })

    it('day 14 returns Phase 1', () => {
        const result = computeRoadmapPhase('2025-01-01', '2025-01-14', ROADMAP_PHASES)
        expect(result.phase).toBe(1)
        expect(result.dayNumber).toBe(14)
    })

    it('day 15 returns Phase 2', () => {
        const result = computeRoadmapPhase('2025-01-01', '2025-01-15', ROADMAP_PHASES)
        expect(result.phase).toBe(2)
        expect(result.dayNumber).toBe(15)
    })

    it('day 60 returns Phase 4 not complete', () => {
        const result = computeRoadmapPhase('2025-01-01', '2025-03-01', ROADMAP_PHASES)
        expect(result.phase).toBe(4)
        expect(result.dayNumber).toBe(60)
        expect(result.isComplete).toBe(false)
    })

    it('day 61 returns Phase 4 with isComplete', () => {
        const result = computeRoadmapPhase('2025-01-01', '2025-03-02', ROADMAP_PHASES)
        expect(result.phase).toBe(4)
        expect(result.dayNumber).toBe(61)
        expect(result.isComplete).toBe(true)
    })

    it('day 100 returns Phase 4 with isComplete', () => {
        const result = computeRoadmapPhase('2025-01-01', '2025-04-11', ROADMAP_PHASES)
        expect(result.phase).toBe(4)
        expect(result.isComplete).toBe(true)
    })
})

// ─── getSuggestedActions (unit tests) ──────────────────────────────────────────

describe('getSuggestedActions', () => {
    it('returns the phase suggestedActions', () => {
        const phase = ROADMAP_PHASES[0]!
        const actions = getSuggestedActions(phase)
        expect(actions).toEqual(phase.suggestedActions)
    })
})

// ─── formatDashboardMarkdown (unit tests) ──────────────────────────────────────

describe('formatDashboardMarkdown', () => {
    it('includes metric values in table', () => {
        const data = makeDashboardData({ rolling: { dqe7d: 500, firstActionRate7d: 0.6, completionRate7d: 0.4, d1ReturnRate7d: 0.25 } })
        const md = formatDashboardMarkdown(data)

        expect(md).toContain('500')
        expect(md).toContain('0.6')
        expect(md).toContain('0.4')
        expect(md).toContain('0.25')
    })

    it('includes kill alerts with 🚨 prefix', () => {
        const data = makeDashboardData({
            alerts: [{ ruleId: 'k1', type: 'kill', message: 'KILL: test', metricValue: 0.1, threshold: 0.5 }],
        })
        const md = formatDashboardMarkdown(data)
        expect(md).toContain('🚨 KILL: test')
    })

    it('includes scale alerts with 🚀 prefix', () => {
        const data = makeDashboardData({
            alerts: [{ ruleId: 's1', type: 'scale', message: 'SCALE: test', metricValue: 1500, threshold: 1000 }],
        })
        const md = formatDashboardMarkdown(data)
        expect(md).toContain('🚀 SCALE: test')
    })

    it('includes phase number and day count', () => {
        const data = makeDashboardData({
            currentPhase: { phase: 2, label: 'Retention & Polish', dayNumber: 20, isComplete: false, suggestedActions: [] },
        })
        const md = formatDashboardMarkdown(data)
        expect(md).toContain('Phase 2')
        expect(md).toContain('Day 20')
    })
})

// ─── Property 6: Rolling Average Computation ──────────────────────────────────

describe('Rolling Average Computation — Property 6', () => {
    /**
     * **Validates: Requirements 6.2**
     *
     * Property 6: Rolling Average Computation
     * For any array of 7+ values, the 7-day rolling average equals the mean
     * of the last 7; for < 7 values, equals the mean of all.
     */
    it('for 7+ values, equals mean of last 7', () => {
        const valuesArb = fc.array(
            fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
            { minLength: 7, maxLength: 100 },
        )

        fc.assert(
            fc.property(valuesArb, (values) => {
                const result = computeRollingAverage(values)
                const last7 = values.slice(-7)
                const expected = last7.reduce((a, b) => a + b, 0) / 7

                expect(result).toBeCloseTo(expected, 10)
            }),
            { numRuns: 100 },
        )
    })

    it('for < 7 values, equals mean of all values', () => {
        const valuesArb = fc.array(
            fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
            { minLength: 1, maxLength: 6 },
        )

        fc.assert(
            fc.property(valuesArb, (values) => {
                const result = computeRollingAverage(values)
                const expected = values.reduce((a, b) => a + b, 0) / values.length

                expect(result).toBeCloseTo(expected, 10)
            }),
            { numRuns: 100 },
        )
    })

    it('returns 0 for empty array', () => {
        expect(computeRollingAverage([])).toBe(0)
    })
})

// ─── Property 7: Kill and Scale Rule Evaluation ───────────────────────────────

describe('Kill and Scale Rule Evaluation — Property 7', () => {
    /**
     * **Validates: Requirements 6.3, 6.4**
     *
     * Property 7: Kill and Scale Rule Evaluation
     * For any metrics and rule, an alert is produced iff the metric is below
     * threshold (for 'below' comparison) or above threshold (for 'above'
     * comparison); alert contains rule id, message, metric value, and threshold.
     */
    const metricKeyArb = fc.constantFrom(
        'dqe7d' as const,
        'firstActionRate7d' as const,
        'completionRate7d' as const,
        'd1ReturnRate7d' as const,
    )

    const ruleArb = fc.record({
        id: fc.stringMatching(/^[a-z_]{1,30}$/),
        threshold: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
        comparison: fc.constantFrom('below' as const, 'above' as const),
        message: fc.stringMatching(/^[A-Za-z0-9 :_-]{1,100}$/),
    })

    it('kill rule produces alert iff metric breaches threshold', () => {
        const arbInput = fc.record({
            metricKey: metricKeyArb,
            metricValue: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
            rule: ruleArb,
        })

        fc.assert(
            fc.property(arbInput, ({ metricKey, metricValue, rule }) => {
                const metrics: RollingMetrics = {
                    dqe7d: 0,
                    firstActionRate7d: 0,
                    completionRate7d: 0,
                    d1ReturnRate7d: 0,
                    [metricKey]: metricValue,
                }

                const killRule: KillRule = { ...rule, metric: metricKey }
                const alerts = evaluateKillRules(metrics, [killRule])

                const shouldTrigger = rule.comparison === 'below'
                    ? metricValue < rule.threshold
                    : metricValue > rule.threshold

                if (shouldTrigger) {
                    expect(alerts).toHaveLength(1)
                    expect(alerts[0]?.ruleId).toBe(rule.id)
                    expect(alerts[0]?.message).toBe(rule.message)
                    expect(alerts[0]?.metricValue).toBe(metricValue)
                    expect(alerts[0]?.threshold).toBe(rule.threshold)
                    expect(alerts[0]?.type).toBe('kill')
                } else {
                    expect(alerts).toHaveLength(0)
                }
            }),
            { numRuns: 100 },
        )
    })

    it('scale rule produces alert iff metric breaches threshold', () => {
        const arbInput = fc.record({
            metricKey: metricKeyArb,
            metricValue: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
            rule: ruleArb,
        })

        fc.assert(
            fc.property(arbInput, ({ metricKey, metricValue, rule }) => {
                const metrics: RollingMetrics = {
                    dqe7d: 0,
                    firstActionRate7d: 0,
                    completionRate7d: 0,
                    d1ReturnRate7d: 0,
                    [metricKey]: metricValue,
                }

                const scaleRule: ScaleRule = { ...rule, metric: metricKey }
                const alerts = evaluateScaleRules(metrics, [scaleRule])

                const shouldTrigger = rule.comparison === 'below'
                    ? metricValue < rule.threshold
                    : metricValue > rule.threshold

                if (shouldTrigger) {
                    expect(alerts).toHaveLength(1)
                    expect(alerts[0]?.ruleId).toBe(rule.id)
                    expect(alerts[0]?.message).toBe(rule.message)
                    expect(alerts[0]?.metricValue).toBe(metricValue)
                    expect(alerts[0]?.threshold).toBe(rule.threshold)
                    expect(alerts[0]?.type).toBe('scale')
                } else {
                    expect(alerts).toHaveLength(0)
                }
            }),
            { numRuns: 100 },
        )
    })
})

// ─── Property 8: Dashboard Markdown Formatting ────────────────────────────────

describe('Dashboard Markdown Formatting — Property 8', () => {
    /**
     * **Validates: Requirements 7.2, 7.3, 7.4, 7.5**
     *
     * Property 8: Dashboard Markdown Formatting
     * For any valid DashboardData, the formatted markdown contains metric values,
     * kill alerts prefixed with "🚨", scale alerts prefixed with "🚀",
     * and roadmap phase number and day count.
     */
    const rollingMetricsArb = fc.record({
        dqe7d: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
        firstActionRate7d: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        completionRate7d: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        d1ReturnRate7d: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    })

    const alertArb = fc.record({
        ruleId: fc.stringMatching(/^[a-z_]{1,20}$/),
        type: fc.constantFrom('kill' as const, 'scale' as const),
        message: fc.stringMatching(/^[A-Za-z0-9 :_-]{1,80}$/),
        metricValue: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
        threshold: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
    })

    const phaseArb = fc.record({
        phase: fc.integer({ min: 1, max: 4 }),
        label: fc.stringMatching(/^[A-Za-z0-9 &-]{1,40}$/),
        dayNumber: fc.integer({ min: 1, max: 200 }),
        isComplete: fc.boolean(),
        suggestedActions: fc.array(fc.stringMatching(/^[A-Za-z0-9 ]{1,40}$/), { minLength: 0, maxLength: 3 }),
    })

    const dailyMetricsArb: fc.Arbitrary<DailyMetrics> = fc.record({
        date: fc.constant('2025-01-15'),
        postOpens: fc.nat({ max: 10000 }),
        firstActions: fc.nat({ max: 10000 }),
        completions: fc.nat({ max: 10000 }),
        resultCopies: fc.nat({ max: 10000 }),
        firstActionRate: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        completionRate: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        d1ReturnRate: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        estimatedDQE: fc.nat({ max: 10000 }),
    })

    const dashboardDataArb: fc.Arbitrary<DashboardData> = fc.record({
        date: fc.constant('2025-01-15'),
        daily: dailyMetricsArb,
        rolling: rollingMetricsArb,
        alerts: fc.array(alertArb, { minLength: 0, maxLength: 5 }),
        currentPhase: phaseArb,
        seasonParticipants: fc.nat({ max: 10000 }),
    })

    it('contains metric values in the markdown table', () => {
        fc.assert(
            fc.property(dashboardDataArb, (data) => {
                const md = formatDashboardMarkdown(data)

                expect(md).toContain(String(data.rolling.dqe7d))
                expect(md).toContain(String(data.rolling.firstActionRate7d))
                expect(md).toContain(String(data.rolling.completionRate7d))
                expect(md).toContain(String(data.rolling.d1ReturnRate7d))
            }),
            { numRuns: 100 },
        )
    })

    it('kill alerts are prefixed with 🚨', () => {
        fc.assert(
            fc.property(dashboardDataArb, (data) => {
                const md = formatDashboardMarkdown(data)
                const killAlerts = data.alerts.filter((a) => a.type === 'kill')

                for (const alert of killAlerts) {
                    expect(md).toContain(`🚨 ${alert.message}`)
                }
            }),
            { numRuns: 100 },
        )
    })

    it('scale alerts are prefixed with 🚀', () => {
        fc.assert(
            fc.property(dashboardDataArb, (data) => {
                const md = formatDashboardMarkdown(data)
                const scaleAlerts = data.alerts.filter((a) => a.type === 'scale')

                for (const alert of scaleAlerts) {
                    expect(md).toContain(`🚀 ${alert.message}`)
                }
            }),
            { numRuns: 100 },
        )
    })

    it('contains roadmap phase number and day count', () => {
        fc.assert(
            fc.property(dashboardDataArb, (data) => {
                const md = formatDashboardMarkdown(data)

                expect(md).toContain(`Phase ${data.currentPhase.phase}`)
                expect(md).toContain(`Day ${data.currentPhase.dayNumber}`)
            }),
            { numRuns: 100 },
        )
    })
})

// ─── Property 9: Roadmap Phase Computation ────────────────────────────────────

describe('Roadmap Phase Computation — Property 9', () => {
    /**
     * **Validates: Requirements 10.2, 10.3**
     *
     * Property 9: Roadmap Phase Computation
     * For any (startDate, currentDate) where current >= start, day number =
     * days elapsed + 1, phase matches the range containing day number,
     * day > 60 → Phase 4 with isComplete = true.
     */

    // Generate a start date and a non-negative offset in days
    const dateOffsetArb = fc.record({
        startYear: fc.integer({ min: 2020, max: 2030 }),
        startMonth: fc.integer({ min: 0, max: 11 }),
        startDay: fc.integer({ min: 1, max: 28 }),
        offsetDays: fc.integer({ min: 0, max: 200 }),
    })

    it('day number equals days elapsed + 1', () => {
        fc.assert(
            fc.property(dateOffsetArb, ({ startYear, startMonth, startDay, offsetDays }) => {
                const start = new Date(Date.UTC(startYear, startMonth, startDay))
                const current = new Date(start.getTime() + offsetDays * 86400000)

                const startStr = start.toISOString().split('T')[0]!
                const currentStr = current.toISOString().split('T')[0]!

                const result = computeRoadmapPhase(startStr, currentStr, ROADMAP_PHASES)
                expect(result.dayNumber).toBe(offsetDays + 1)
            }),
            { numRuns: 100 },
        )
    })

    it('phase matches the range containing day number (for days 1-60)', () => {
        const arb = fc.record({
            startYear: fc.integer({ min: 2020, max: 2030 }),
            startMonth: fc.integer({ min: 0, max: 11 }),
            startDay: fc.integer({ min: 1, max: 28 }),
            offsetDays: fc.integer({ min: 0, max: 59 }),
        })

        fc.assert(
            fc.property(arb, ({ startYear, startMonth, startDay, offsetDays }) => {
                const start = new Date(Date.UTC(startYear, startMonth, startDay))
                const current = new Date(start.getTime() + offsetDays * 86400000)

                const startStr = start.toISOString().split('T')[0]!
                const currentStr = current.toISOString().split('T')[0]!

                const result = computeRoadmapPhase(startStr, currentStr, ROADMAP_PHASES)
                const dayNumber = offsetDays + 1

                const expectedPhase = ROADMAP_PHASES.find(
                    (p) => dayNumber >= p.startDay && dayNumber <= p.endDay,
                )

                expect(expectedPhase).toBeDefined()
                expect(result.phase).toBe(expectedPhase!.phase)
                expect(result.isComplete).toBe(false)
            }),
            { numRuns: 100 },
        )
    })

    it('day > 60 returns Phase 4 with isComplete = true', () => {
        const arb = fc.record({
            startYear: fc.integer({ min: 2020, max: 2030 }),
            startMonth: fc.integer({ min: 0, max: 11 }),
            startDay: fc.integer({ min: 1, max: 28 }),
            offsetDays: fc.integer({ min: 60, max: 200 }),
        })

        fc.assert(
            fc.property(arb, ({ startYear, startMonth, startDay, offsetDays }) => {
                const start = new Date(Date.UTC(startYear, startMonth, startDay))
                const current = new Date(start.getTime() + offsetDays * 86400000)

                const startStr = start.toISOString().split('T')[0]!
                const currentStr = current.toISOString().split('T')[0]!

                const result = computeRoadmapPhase(startStr, currentStr, ROADMAP_PHASES)

                expect(result.phase).toBe(4)
                expect(result.isComplete).toBe(true)
                expect(result.dayNumber).toBe(offsetDays + 1)
            }),
            { numRuns: 100 },
        )
    })
})

// ─── Test Helpers ──────────────────────────────────────────────────────────────

/** Build a DashboardData with sensible defaults, overridable via partial. */
const makeDashboardData = (overrides: Partial<DashboardData> = {}): DashboardData => ({
    date: '2025-01-15',
    daily: {
        date: '2025-01-15',
        postOpens: 100,
        firstActions: 60,
        completions: 30,
        resultCopies: 5,
        firstActionRate: 0.6,
        completionRate: 0.5,
        d1ReturnRate: 0.2,
        estimatedDQE: 30,
    },
    rolling: {
        dqe7d: 25,
        firstActionRate7d: 0.55,
        completionRate7d: 0.45,
        d1ReturnRate7d: 0.18,
    },
    alerts: [],
    currentPhase: {
        phase: 1,
        label: 'Distribution Sprint',
        dayNumber: 5,
        isComplete: false,
        suggestedActions: ['Pitch to 2 subreddit mods today'],
    },
    seasonParticipants: 10,
    ...overrides,
})
