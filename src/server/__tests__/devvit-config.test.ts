import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

type DevvitConfig = {
    permissions?: {
        reddit?: {
            asUser?: string[]
        }
    }
}

const readConfig = (): DevvitConfig =>
    JSON.parse(readFileSync(join(process.cwd(), 'devvit.json'), 'utf-8')) as DevvitConfig

describe('devvit.json compliance posture', () => {
    it('does not request user subscribe permission when no subscribe action exists', () => {
        const config = readConfig()
        const asUser = config.permissions?.reddit?.asUser ?? []

        expect(asUser).not.toContain('SUBSCRIBE_TO_SUBREDDIT')
    })
})
