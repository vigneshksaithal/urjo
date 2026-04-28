import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
    KILL_RULES,
    SCALE_RULES,
    ROADMAP_PHASES,
} from '../growth-constants'

describe('Feature: urjo-growth-roadmap, Property 10: Growth Constants JSON Round-Trip', () => {
    /**
     * Property 10: Growth Constants JSON Round-Trip
     * For all KillRule, ScaleRule, and RoadmapPhase objects,
     * JSON.parse(JSON.stringify(obj)) produces a deeply equal object.
     * This verifies that all constant types use only JSON-safe primitives
     * (strings, numbers, arrays) with no functions, undefined values, or circular references.
     *
     * **Validates: Requirements 14.5, 14.6, 14.7**
     */

    // ─── KillRule round-trip ───────────────────────────────────────────────────

    it('all KILL_RULES entries survive JSON round-trip', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...KILL_RULES),
                (rule) => {
                    const roundTripped = JSON.parse(JSON.stringify(rule))
                    expect(roundTripped).toStrictEqual(rule)
                }
            ),
            { numRuns: KILL_RULES.length * 5 }
        )
    })

    it('each KILL_RULES entry produces a deeply equal object after round-trip', () => {
        for (const rule of KILL_RULES) {
            const roundTripped = JSON.parse(JSON.stringify(rule))
            expect(roundTripped).toStrictEqual(rule)
        }
    })

    // ─── ScaleRule round-trip ──────────────────────────────────────────────────

    it('all SCALE_RULES entries survive JSON round-trip', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...SCALE_RULES),
                (rule) => {
                    const roundTripped = JSON.parse(JSON.stringify(rule))
                    expect(roundTripped).toStrictEqual(rule)
                }
            ),
            { numRuns: SCALE_RULES.length * 5 }
        )
    })

    it('each SCALE_RULES entry produces a deeply equal object after round-trip', () => {
        for (const rule of SCALE_RULES) {
            const roundTripped = JSON.parse(JSON.stringify(rule))
            expect(roundTripped).toStrictEqual(rule)
        }
    })

    // ─── RoadmapPhase round-trip ───────────────────────────────────────────────

    it('all ROADMAP_PHASES entries survive JSON round-trip', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...ROADMAP_PHASES),
                (phase) => {
                    const roundTripped = JSON.parse(JSON.stringify(phase))
                    expect(roundTripped).toStrictEqual(phase)
                }
            ),
            { numRuns: ROADMAP_PHASES.length * 5 }
        )
    })

    it('each ROADMAP_PHASES entry produces a deeply equal object after round-trip', () => {
        for (const phase of ROADMAP_PHASES) {
            const roundTripped = JSON.parse(JSON.stringify(phase))
            expect(roundTripped).toStrictEqual(phase)
        }
    })

    // ─── Arbitrary generated objects round-trip ────────────────────────────────

    const killRuleArb = fc.record({
        id: fc.string({ minLength: 1, maxLength: 50 }),
        metric: fc.string({ minLength: 1, maxLength: 50 }),
        threshold: fc.double({ min: 0, max: 10000, noNaN: true }),
        comparison: fc.constantFrom('below' as const, 'above' as const),
        message: fc.string({ minLength: 1, maxLength: 200 }),
    })

    const scaleRuleArb = fc.record({
        id: fc.string({ minLength: 1, maxLength: 50 }),
        metric: fc.string({ minLength: 1, maxLength: 50 }),
        threshold: fc.double({ min: 0, max: 10000, noNaN: true }),
        comparison: fc.constantFrom('below' as const, 'above' as const),
        message: fc.string({ minLength: 1, maxLength: 200 }),
    })

    const roadmapPhaseArb = fc.record({
        phase: fc.integer({ min: 1, max: 10 }),
        startDay: fc.integer({ min: 1, max: 100 }),
        endDay: fc.integer({ min: 1, max: 100 }),
        label: fc.string({ minLength: 1, maxLength: 50 }),
        suggestedActions: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
    })

    it('arbitrary KillRule objects survive JSON round-trip', () => {
        fc.assert(
            fc.property(killRuleArb, (rule) => {
                const roundTripped = JSON.parse(JSON.stringify(rule))
                expect(roundTripped).toEqual(rule)
            }),
            { numRuns: 100 }
        )
    })

    it('arbitrary ScaleRule objects survive JSON round-trip', () => {
        fc.assert(
            fc.property(scaleRuleArb, (rule) => {
                const roundTripped = JSON.parse(JSON.stringify(rule))
                expect(roundTripped).toEqual(rule)
            }),
            { numRuns: 100 }
        )
    })

    it('arbitrary RoadmapPhase objects survive JSON round-trip', () => {
        fc.assert(
            fc.property(roadmapPhaseArb, (phase) => {
                const roundTripped = JSON.parse(JSON.stringify(phase))
                expect(roundTripped).toEqual(phase)
            }),
            { numRuns: 100 }
        )
    })
})
