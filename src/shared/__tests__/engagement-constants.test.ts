import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
    DAILY_MISSION_TEMPLATES,
    WEEKLY_MISSION_TEMPLATES,
    ACHIEVEMENT_DEFS,
} from '../engagement-constants'

describe('MissionTemplate round-trip serialization — Property 11', () => {
    /**
     * Property 11: MissionTemplate Round-Trip Serialization
     * For all MissionTemplate objects in DAILY_MISSION_TEMPLATES and WEEKLY_MISSION_TEMPLATES,
     * JSON.parse(JSON.stringify(template)) produces a deeply equal object.
     * Validates: Requirements 11.4
     */

    const allTemplates = [...DAILY_MISSION_TEMPLATES, ...WEEKLY_MISSION_TEMPLATES]

    it('all mission templates survive JSON round-trip serialization', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...allTemplates),
                (template) => {
                    const roundTripped = JSON.parse(JSON.stringify(template))
                    expect(roundTripped).toStrictEqual(template)
                }
            ),
            { numRuns: allTemplates.length * 5 }
        )
    })

    it('daily mission templates each produce a deeply equal object after round-trip', () => {
        for (const template of DAILY_MISSION_TEMPLATES) {
            const roundTripped = JSON.parse(JSON.stringify(template))
            expect(roundTripped).toStrictEqual(template)
        }
    })

    it('weekly mission templates each produce a deeply equal object after round-trip', () => {
        for (const template of WEEKLY_MISSION_TEMPLATES) {
            const roundTripped = JSON.parse(JSON.stringify(template))
            expect(roundTripped).toStrictEqual(template)
        }
    })
})

describe('AchievementDef round-trip serialization — Property 12', () => {
    /**
     * Property 12: AchievementDef Round-Trip Serialization
     * For all AchievementDef objects in ACHIEVEMENT_DEFS,
     * JSON.parse(JSON.stringify(def)) produces a deeply equal object.
     * Validates: Requirements 11.5
     */

    it('all achievement definitions survive JSON round-trip serialization', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...ACHIEVEMENT_DEFS),
                (def) => {
                    const roundTripped = JSON.parse(JSON.stringify(def))
                    expect(roundTripped).toStrictEqual(def)
                }
            ),
            { numRuns: ACHIEVEMENT_DEFS.length * 5 }
        )
    })

    it('each achievement definition produces a deeply equal object after round-trip', () => {
        for (const def of ACHIEVEMENT_DEFS) {
            const roundTripped = JSON.parse(JSON.stringify(def))
            expect(roundTripped).toStrictEqual(def)
        }
    })
})
