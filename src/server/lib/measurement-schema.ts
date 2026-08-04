export const MEASUREMENT_V2_ROLLOUT_DATE = '2026-07-15'
export const MEASUREMENT_DUAL_WRITE_DAYS = 14
export const MEASUREMENT_BACKFILL_POLICY = 'no-backfill' as const

export type MeasurementVersion = 'v1' | 'v2'

export type MeasurementMetadata = {
    definitionVersion: MeasurementVersion
    rolloutDate: string
    dualWriteThroughDate: string
    backfillPolicy: typeof MEASUREMENT_BACKFILL_POLICY
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const parseISODate = (date: string): Date => {
    if (!ISO_DATE_PATTERN.test(date)) throw new Error(`Invalid UTC date: ${date}`)

    const parsed = new Date(`${date}T00:00:00.000Z`)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        throw new Error(`Invalid UTC date: ${date}`)
    }
    return parsed
}

const addUTCDays = (date: string, days: number): string => {
    const parsed = parseISODate(date)
    parsed.setUTCDate(parsed.getUTCDate() + days)
    return parsed.toISOString().slice(0, 10)
}

export const MEASUREMENT_DUAL_WRITE_THROUGH_DATE = addUTCDays(
    MEASUREMENT_V2_ROLLOUT_DATE,
    MEASUREMENT_DUAL_WRITE_DAYS - 1,
)

export const selectMeasurementReadVersion = (date: string): MeasurementVersion => {
    parseISODate(date)
    return date < MEASUREMENT_V2_ROLLOUT_DATE ? 'v1' : 'v2'
}

export const selectMeasurementWriteVersions = (date: string): MeasurementVersion[] => {
    const readVersion = selectMeasurementReadVersion(date)
    if (readVersion === 'v1') return ['v1']
    if (date <= MEASUREMENT_DUAL_WRITE_THROUGH_DATE) return ['v1', 'v2']
    return ['v2']
}

export const buildMeasurementKey = (
    namespace: string,
    version: MeasurementVersion,
    date: string,
    ...parts: string[]
): string => {
    const prefix = version === 'v1' ? `${namespace}:${date}` : `${namespace}:v2:${date}`
    return [prefix, ...parts].join(':')
}

export const getMeasurementMetadata = (date: string): MeasurementMetadata => ({
    definitionVersion: selectMeasurementReadVersion(date),
    rolloutDate: MEASUREMENT_V2_ROLLOUT_DATE,
    dualWriteThroughDate: MEASUREMENT_DUAL_WRITE_THROUGH_DATE,
    backfillPolicy: MEASUREMENT_BACKFILL_POLICY,
})
