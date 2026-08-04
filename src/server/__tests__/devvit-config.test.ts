import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

type DevvitConfig = {
    permissions?: {
        journeys?: boolean
        media?: boolean
        realtime?: boolean
        reddit?: {
            asUser?: string[]
        }
    }
    post?: {
        entrypoints?: Record<string, { entry?: string; height?: string }>
    }
    scheduler?: {
        tasks?: Record<string, { endpoint?: string; cron?: string; data?: { gridSize?: number } }>
    }
}

const readConfig = (): DevvitConfig =>
    JSON.parse(readFileSync(join(process.cwd(), 'devvit.json'), 'utf-8')) as DevvitConfig

describe('devvit.json compliance posture', () => {
    it('requests user subscribe permission for the explicit Join action', () => {
        const config = readConfig()
        const asUser = config.permissions?.reddit?.asUser ?? []

        expect(asUser).toContain('SUBSCRIBE_TO_SUBREDDIT')
    })

    it('enables Devvit Journeys telemetry', () => {
        const config = readConfig()

        expect(config.permissions?.journeys).toBe(true)
    })

    it('loads the game directly from the default inline entrypoint', () => {
        const config = readConfig()

        expect(config.post?.entrypoints?.['default']?.entry).toBe('index.html')
		expect(config.post?.entrypoints?.['default']?.height).toBe('tall')
    })

    it('does not configure a separate expanded-mode entrypoint', () => {
        const entrypoints = readConfig().post?.entrypoints ?? {}

        expect(Object.keys(entrypoints)).toEqual(['default'])
    })

    it('enables Reddit-hosted media for verified result cards', () => {
        const config = readConfig()

        expect(config.permissions?.media).toBe(true)
    })

    it('enables Realtime for the bounded weekly Blitz event', () => {
        const config = readConfig()

        expect(config.permissions?.realtime).toBe(true)
        expect(config.scheduler?.tasks?.['urjo-blitz-start']?.cron).toBe('5 18 * * 5')
        expect(config.scheduler?.tasks?.['urjo-blitz-close']?.cron).toBeUndefined()
    })

    it('preserves four 6x6 and four 8x8 scheduled puzzle posts', () => {
        const tasks = Object.values(readConfig().scheduler?.tasks ?? {})
            .filter((task) => task.endpoint === '/internal/scheduler/daily-puzzle')
        const gridSizes = tasks.map((task) => task.data?.gridSize)

        expect(tasks).toHaveLength(8)
        expect(gridSizes.filter((size) => size === 6)).toHaveLength(4)
        expect(gridSizes.filter((size) => size === 8)).toHaveLength(4)
    })
})
