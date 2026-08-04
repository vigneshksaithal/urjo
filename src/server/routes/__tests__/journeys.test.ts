import { createDevvitTest } from '@devvit/test/server/vitest'
import { runWithContext } from '@devvit/web/server'
import { Context } from '@devvit/server'
import { expect } from 'vitest'

import { app } from '../../index'

const TEST_HEADERS = {
    'devvit-user': 't2_journey_user',
    'devvit-app-user': 't2_app_user',
    'devvit-subreddit': 't5_testsub',
    'devvit-subreddit-name': 'testsub',
    'devvit-app': 'urjo-game',
    'devvit-version': '0.13.7-test',
    'devvit-app-viewer-authorization': 'test-token',
    'devvit-post': 't3_journey_post',
}

const requestWithContext = (url: string, init?: RequestInit): Promise<Response> =>
    runWithContext(Context(TEST_HEADERS), () => app.request(url, init))

const postJson = (url: string, body?: unknown): Promise<Response> =>
    requestWithContext(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

const startJourney = async (): Promise<string> => {
    const res = await postJson('/api/telemetry/journey/start')
    const body = await res.json() as { journeyId?: string }
    if (!body.journeyId) throw new Error('Expected journey id')
    return body.journeyId
}

const testTelemetry = createDevvitTest({
    userId: 't2_journey_user',
    subredditId: 't5_testsub',
    subredditName: 'testsub',
})

testTelemetry('POST /api/telemetry/journey/start starts a Journey and returns a receipt', async ({ mocks }) => {
    const res = await postJson('/api/telemetry/journey/start')
    const body = await res.json() as { journeyId?: string; receipt?: { status?: string } }

    expect(res.status).toBe(200)
    expect(body.journeyId).toMatch(/^journey_/)
    expect(body.receipt?.status).toBe('JOURNEY_RECEIPT_VALID')
    expect(mocks.telemetry.getJourneys()).toHaveLength(1)
})

testTelemetry('POST /api/telemetry/journey/progress records bounded Journey progress', async ({ mocks }) => {
    const journeyId = await startJourney()

    const res = await postJson('/api/telemetry/journey/progress', {
        journeyId,
        progress: 0.25,
        action: 'first_cell',
        actionDetails: 'grid:4',
    })

    expect(res.status).toBe(200)
    expect(mocks.telemetry.getJourney(journeyId)?.progressEvents).toEqual([
        {
            journeyId,
            progress: 0.25,
            action: 'first_cell',
            actionDetails: 'grid:4',
        },
    ])
})

testTelemetry('POST /api/telemetry/journey/progress rejects out-of-range progress', async () => {
    const res = await postJson('/api/telemetry/journey/progress', {
        journeyId: 'journey-1',
        progress: 2,
    })
    const body = await res.json() as { error?: string; receipt?: { status?: string } }

    expect(res.status).toBe(400)
    expect(body.error).toBe('progress must be between 0 and 1.')
    expect(body.receipt?.status).toBe('JOURNEY_RECEIPT_INVALID')
})

testTelemetry('POST /api/telemetry/journey/interaction records non-PII action labels', async ({ mocks }) => {
    const journeyId = await startJourney()

    const res = await postJson('/api/telemetry/journey/interaction', {
        journeyId,
        action: 'next_puzzle',
        actionDetails: 'manual',
    })

    expect(res.status).toBe(200)
    expect(mocks.telemetry.getJourney(journeyId)?.interactionEvents).toEqual([
        {
            journeyId,
            action: 'next_puzzle',
            actionDetails: 'manual',
        },
    ])
})

testTelemetry('POST /api/telemetry/journey/end records completion and game score', async ({ mocks }) => {
    const journeyId = await startJourney()

    const res = await postJson('/api/telemetry/journey/end', {
        journeyId,
        complete: true,
        game: { win: true, score: 875 },
    })

    expect(res.status).toBe(200)
    expect(mocks.telemetry.getJourney(journeyId)?.endRequest).toEqual({
        journeyId,
        complete: true,
        game: { win: true, score: 875 },
    })
})

testTelemetry('POST /api/telemetry/journey/app-ready records app readiness', async ({ mocks }) => {
    const res = await postJson('/api/telemetry/journey/app-ready')

    expect(res.status).toBe(200)
    expect(mocks.telemetry.getAppReadyEvents()).toHaveLength(1)
})
