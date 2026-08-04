import { describe, expect, it } from 'vitest'

import {
    MEASUREMENT_BACKFILL_POLICY,
    MEASUREMENT_DUAL_WRITE_DAYS,
    MEASUREMENT_V2_ROLLOUT_DATE,
    buildMeasurementKey,
    getMeasurementMetadata,
    selectMeasurementReadVersion,
    selectMeasurementWriteVersions,
} from '../measurement-schema'

describe('measurement rollout selector', () => {
    it('reads and writes only v1 before the rollout date', () => {
        expect(selectMeasurementReadVersion('2026-07-14')).toBe('v1')
        expect(selectMeasurementWriteVersions('2026-07-14')).toEqual(['v1'])
    })

    it('reads v2 and dual-writes for fourteen rollout days', () => {
        expect(MEASUREMENT_V2_ROLLOUT_DATE).toBe('2026-07-15')
        expect(MEASUREMENT_DUAL_WRITE_DAYS).toBe(14)
        expect(selectMeasurementReadVersion('2026-07-15')).toBe('v2')
        expect(selectMeasurementWriteVersions('2026-07-15')).toEqual(['v1', 'v2'])
        expect(selectMeasurementWriteVersions('2026-07-28')).toEqual(['v1', 'v2'])
    })

    it('writes only v2 after the compatibility window', () => {
        expect(selectMeasurementReadVersion('2026-07-29')).toBe('v2')
        expect(selectMeasurementWriteVersions('2026-07-29')).toEqual(['v2'])
    })

    it('builds legacy-compatible v1 keys and namespaced v2 keys', () => {
        expect(buildMeasurementKey('s2r', 'v1', '2026-07-15', 'low:easy', 'eligible'))
            .toBe('s2r:2026-07-15:low:easy:eligible')
        expect(buildMeasurementKey('s2r', 'v2', '2026-07-15', 'low:easy', 'eligible'))
            .toBe('s2r:v2:2026-07-15:low:easy:eligible')
    })

    it('exposes explicit no-backfill metadata', () => {
        expect(MEASUREMENT_BACKFILL_POLICY).toBe('no-backfill')
        expect(getMeasurementMetadata('2026-07-20')).toEqual({
            definitionVersion: 'v2',
            rolloutDate: '2026-07-15',
            dualWriteThroughDate: '2026-07-28',
            backfillPolicy: 'no-backfill',
        })
    })
})
