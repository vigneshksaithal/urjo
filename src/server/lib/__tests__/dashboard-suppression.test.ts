import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
    evaluateKillRules,
    evaluateScaleRules,
} from '../dashboard'
import type {
    KillRule,
    RollingMetrics,
    ScaleRule,
} from '../../../shared/growth-types'

// ─── Shared Arbitraries ────────────────────────────────────────────────────────

/** Non-null, finite RollingMetrics — all fields are real numbers */
const nonNullRollingMetricsArb: fc.Arbitrary<RollingMetrics> = fc.record({
    dqe7d: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
    firstActionRate7d: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    completionRate7d: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    d1ReturnRate7d: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
})

/** RollingMetrics with arbitrary null slots */
const nullableRollingMetricsArb: fc.Arbitrary<RollingMetrics> = fc.record({
    dqe7d: fc.option(fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }), { nil: null }),
    firstActionRate7d: fc.option(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), { nil: null }),
    completionRate7d: fc.option(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), { nil: null }),
    d1ReturnRate7d: fc.option(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), { nil: null }),
})

const metricKeyArb = fc.constantFrom(
    'dqe7d' as const,
    'firstActionRate7d' as const,
    'completionRate7d' as const,
    'd1ReturnRate7d' as const,
)

const killRuleArb: fc.Arbitrary<KillRule> = fc.record({
    id: fc.stringMatching(/^[a-z_]{1,20}$/),
    metric: metricKeyArb,
    threshold: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
    comparison: fc.constantFrom('below' as const, 'above' as const),
    message: fc.stringMatching(/^[A-Za-z0-9 :_-]{1,80}$/),
})

const scaleRuleArb: fc.Arbitrary<ScaleRule> = fc.record({
    id: fc.stringMatching(/^[a-z_]{1,20}$/),
    metric: metricKeyArb,
    threshold: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
    comparison: fc.constantFrom('below' as const, 'above' as const),
    message: fc.stringMatching(/^[A-Za-z0-9 :_-]{1,80}$/),
})

// ─── Property 4: Kill/Scale Rule Suppression Equivalence ─────────────────────

describe('Kill/Scale Rule Suppression Equivalence — Property 4', () => {
    /**
     * **Validates: Requirements 4.1, 4.2, 4.5**
     *
     * Property 4: Kill/Scale Rule Suppression Equivalence
     * For all RollingMetrics inputs M with arbitrary null slots and rule sets R,
     * the union of alert IDs and suppressedRuleIds equals the alert IDs returned
     * when each null slot in M is replaced by its threshold-equal value from R.
     *
     * Concretely: every rule whose metric is null appears in suppressedRuleIds
     * (not in alerts), and every rule whose metric is non-null is never suppressed.
     */

    it('kill rules: null-metric rules are suppressed, non-null-metric rules are not', () => {
        const arbInput = fc.record({
            metrics: nullableRollingMetricsArb,
            // Use uniqueArray to ensure no two rules share the same ID,
            // preventing false failures when a null-metric rule and a non-null-metric
            // rule happen to share the same generated ID.
            rules: fc.uniqueArray(killRuleArb, { minLength: 1, maxLength: 8, selector: (r) => r.id }),
        })

        fc.assert(
            fc.property(arbInput, ({ metrics, rules }) => {
                const { alerts, suppressedRuleIds } = evaluateKillRules(metrics, rules)

                const alertIds = new Set(alerts.map((a) => a.ruleId))
                const suppressedIds = new Set(suppressedRuleIds)

                // No rule ID should appear in both sets
                for (const id of alertIds) {
                    if (suppressedIds.has(id)) {
                        throw new Error(`ruleId "${id}" appears in both alerts and suppressedRuleIds`)
                    }
                }

                // Every rule whose metric is null must be in suppressedRuleIds
                for (const rule of rules) {
                    const metricValue = metrics[rule.metric as keyof RollingMetrics]
                    if (metricValue === null) {
                        if (!suppressedIds.has(rule.id)) {
                            throw new Error(`ruleId "${rule.id}" has null metric but is not in suppressedRuleIds`)
                        }
                    }
                }

                // Every rule whose metric is non-null must NOT be in suppressedRuleIds
                for (const rule of rules) {
                    const metricValue = metrics[rule.metric as keyof RollingMetrics]
                    if (metricValue !== null && metricValue !== undefined) {
                        if (suppressedIds.has(rule.id)) {
                            throw new Error(`ruleId "${rule.id}" has non-null metric but is in suppressedRuleIds`)
                        }
                    }
                }
            }),
            { numRuns: 200 },
        )
    })

    it('scale rules: null-metric rules are suppressed, non-null-metric rules are not', () => {
        const arbInput = fc.record({
            metrics: nullableRollingMetricsArb,
            // Use uniqueArray to ensure no two rules share the same ID
            rules: fc.uniqueArray(scaleRuleArb, { minLength: 1, maxLength: 8, selector: (r) => r.id }),
        })

        fc.assert(
            fc.property(arbInput, ({ metrics, rules }) => {
                const { alerts, suppressedRuleIds } = evaluateScaleRules(metrics, rules)

                const alertIds = new Set(alerts.map((a) => a.ruleId))
                const suppressedIds = new Set(suppressedRuleIds)

                // No rule ID should appear in both sets
                for (const id of alertIds) {
                    if (suppressedIds.has(id)) {
                        throw new Error(`ruleId "${id}" appears in both alerts and suppressedRuleIds`)
                    }
                }

                // Every rule whose metric is null must be in suppressedRuleIds
                for (const rule of rules) {
                    const metricValue = metrics[rule.metric as keyof RollingMetrics]
                    if (metricValue === null) {
                        if (!suppressedIds.has(rule.id)) {
                            throw new Error(`ruleId "${rule.id}" has null metric but is not in suppressedRuleIds`)
                        }
                    }
                }

                // Every rule whose metric is non-null must NOT be in suppressedRuleIds
                for (const rule of rules) {
                    const metricValue = metrics[rule.metric as keyof RollingMetrics]
                    if (metricValue !== null && metricValue !== undefined) {
                        if (suppressedIds.has(rule.id)) {
                            throw new Error(`ruleId "${rule.id}" has non-null metric but is in suppressedRuleIds`)
                        }
                    }
                }
            }),
            { numRuns: 200 },
        )
    })

    it('all-null metrics: all rules are suppressed, no alerts', () => {
        const metrics: RollingMetrics = {
            dqe7d: null,
            firstActionRate7d: null,
            completionRate7d: null,
            d1ReturnRate7d: null,
        }
        const rules: KillRule[] = [
            { id: 'k1', metric: 'dqe7d', threshold: 500, comparison: 'below', message: 'k1' },
            { id: 'k2', metric: 'firstActionRate7d', threshold: 0.5, comparison: 'below', message: 'k2' },
        ]

        const { alerts, suppressedRuleIds } = evaluateKillRules(metrics, rules)
        expect(alerts).toHaveLength(0)
        expect(suppressedRuleIds).toEqual(['k1', 'k2'])
    })

    it('all-non-null metrics: no rules are suppressed', () => {
        const metrics: RollingMetrics = {
            dqe7d: 1000,
            firstActionRate7d: 0.6,
            completionRate7d: 0.5,
            d1ReturnRate7d: 0.2,
        }
        const rules: KillRule[] = [
            { id: 'k1', metric: 'dqe7d', threshold: 500, comparison: 'below', message: 'k1' },
        ]

        const { suppressedRuleIds } = evaluateKillRules(metrics, rules)
        expect(suppressedRuleIds).toHaveLength(0)
    })
})

// ─── Property 5: Rule Evaluator Idempotence ───────────────────────────────────

describe('Rule Evaluator Idempotence — Property 5', () => {
    /**
     * **Validates: Requirement 4.6**
     *
     * Property 5: Rule Evaluator Idempotence
     * For all non-null, finite RollingMetrics inputs M and rule sets R,
     * calling the evaluator twice on the same inputs returns alert sets
     * equal under set equality.
     */

    it('evaluateKillRules returns the same alert IDs on repeated calls', () => {
        const arbInput = fc.record({
            metrics: nonNullRollingMetricsArb,
            rules: fc.array(killRuleArb, { minLength: 0, maxLength: 10 }),
        })

        fc.assert(
            fc.property(arbInput, ({ metrics, rules }) => {
                const firstCall = evaluateKillRules(metrics, rules)
                const secondCall = evaluateKillRules(metrics, rules)

                const firstIds = new Set(firstCall.alerts.map((a) => a.ruleId))
                const secondIds = new Set(secondCall.alerts.map((a) => a.ruleId))

                // Set equality: every ID in first is in second and vice versa
                for (const id of firstIds) {
                    if (!secondIds.has(id)) throw new Error(`ruleId "${id}" missing from second call`)
                }
                for (const id of secondIds) {
                    if (!firstIds.has(id)) throw new Error(`ruleId "${id}" missing from first call`)
                }
            }),
            { numRuns: 200 },
        )
    })

    it('evaluateScaleRules returns the same alert IDs on repeated calls', () => {
        const arbInput = fc.record({
            metrics: nonNullRollingMetricsArb,
            rules: fc.array(scaleRuleArb, { minLength: 0, maxLength: 10 }),
        })

        fc.assert(
            fc.property(arbInput, ({ metrics, rules }) => {
                const firstCall = evaluateScaleRules(metrics, rules)
                const secondCall = evaluateScaleRules(metrics, rules)

                const firstIds = new Set(firstCall.alerts.map((a) => a.ruleId))
                const secondIds = new Set(secondCall.alerts.map((a) => a.ruleId))

                for (const id of firstIds) {
                    if (!secondIds.has(id)) throw new Error(`ruleId "${id}" missing from second call`)
                }
                for (const id of secondIds) {
                    if (!firstIds.has(id)) throw new Error(`ruleId "${id}" missing from first call`)
                }
            }),
            { numRuns: 200 },
        )
    })

    it('evaluateKillRules returns identical alert counts on repeated calls', () => {
        const arbInput = fc.record({
            metrics: nonNullRollingMetricsArb,
            rules: fc.array(killRuleArb, { minLength: 0, maxLength: 10 }),
        })

        fc.assert(
            fc.property(arbInput, ({ metrics, rules }) => {
                const firstCall = evaluateKillRules(metrics, rules)
                const secondCall = evaluateKillRules(metrics, rules)

                if (firstCall.alerts.length !== secondCall.alerts.length) {
                    throw new Error(
                        `Alert count mismatch: first=${firstCall.alerts.length}, second=${secondCall.alerts.length}`,
                    )
                }
            }),
            { numRuns: 200 },
        )
    })

    it('evaluateScaleRules returns identical alert counts on repeated calls', () => {
        const arbInput = fc.record({
            metrics: nonNullRollingMetricsArb,
            rules: fc.array(scaleRuleArb, { minLength: 0, maxLength: 10 }),
        })

        fc.assert(
            fc.property(arbInput, ({ metrics, rules }) => {
                const firstCall = evaluateScaleRules(metrics, rules)
                const secondCall = evaluateScaleRules(metrics, rules)

                if (firstCall.alerts.length !== secondCall.alerts.length) {
                    throw new Error(
                        `Alert count mismatch: first=${firstCall.alerts.length}, second=${secondCall.alerts.length}`,
                    )
                }
            }),
            { numRuns: 200 },
        )
    })
})
