import { telemetry } from '@devvit/analytics/server/reddit'
import type {
    JourneyReceipt,
} from '@devvit/analytics/shared/reddit'
import { Hono } from 'hono'
import type { Context } from 'hono'

export const journeysRouter = new Hono()

type ValidationResult<T> = { value: T } | { error: string }
type ProgressRequest = Parameters<typeof telemetry.journeyProgress>[0]
type InteractionRequest = Parameters<typeof telemetry.journeyInteraction>[0]
type EndRequest = Parameters<typeof telemetry.endJourney>[0]

const HTTP_STATUS_BAD_REQUEST = 400
const HTTP_STATUS_INTERNAL_ERROR = 500

const invalidReceipt: JourneyReceipt = {
    status: 'JOURNEY_RECEIPT_INVALID',
    message: 'Invalid: Event payload was not recorded.',
}

const unspecifiedReceipt: JourneyReceipt = {
    status: 'JOURNEY_RECEIPT_UNSPECIFIED',
    message: 'Unknown: Telemetry recording status could not be confirmed.',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value)

const badRequest = (c: Context, error: string): Response =>
    c.json({ error, receipt: invalidReceipt }, HTTP_STATUS_BAD_REQUEST)

const serverError = (c: Context, error: unknown): Response => {
    console.error('[Journeys] Telemetry route failed:', error)
    return c.json(
        { error: 'Internal server error', receipt: unspecifiedReceipt },
        HTTP_STATUS_INTERNAL_ERROR,
    )
}

const readJsonBody = async (c: Context): Promise<unknown> =>
    c.req.json().catch(() => null)

const parseProgressRequest = (raw: unknown): ValidationResult<ProgressRequest> => {
    if (!isRecord(raw)) return { error: 'Expected a JSON object body.' }

    const { journeyId, progress, action, actionDetails } = raw
    if (!isNonEmptyString(journeyId)) return { error: 'journeyId is required.' }
    if (!isFiniteNumber(progress)) return { error: 'progress must be a number between 0 and 1.' }
    if (progress < 0 || progress > 1) return { error: 'progress must be between 0 and 1.' }
    if (action !== undefined && !isNonEmptyString(action)) {
        return { error: 'action must be a non-empty string.' }
    }
    if (actionDetails !== undefined && !isNonEmptyString(actionDetails)) {
        return { error: 'actionDetails must be a non-empty string.' }
    }

    return {
        value: {
            journeyId,
            progress,
            ...(action !== undefined ? { action } : {}),
            ...(actionDetails !== undefined ? { actionDetails } : {}),
        },
    }
}

const parseInteractionRequest = (raw: unknown): ValidationResult<InteractionRequest> => {
    if (!isRecord(raw)) return { error: 'Expected a JSON object body.' }

    const { journeyId, action, actionDetails } = raw
    if (journeyId !== undefined && typeof journeyId !== 'string') {
        return { error: 'journeyId must be a string.' }
    }
    if (!isNonEmptyString(action)) return { error: 'action is required.' }
    if (actionDetails !== undefined && !isNonEmptyString(actionDetails)) {
        return { error: 'actionDetails must be a non-empty string.' }
    }

    return {
        value: {
            journeyId: isNonEmptyString(journeyId) ? journeyId : '',
            action,
            actionDetails: isNonEmptyString(actionDetails) ? actionDetails : '',
        },
    }
}

const parseEndRequest = (raw: unknown): ValidationResult<EndRequest> => {
    if (!isRecord(raw)) return { error: 'Expected a JSON object body.' }

    const { journeyId, complete, game } = raw
    if (!isNonEmptyString(journeyId)) return { error: 'journeyId is required.' }
    if (complete !== undefined && typeof complete !== 'boolean') {
        return { error: 'complete must be a boolean.' }
    }
    if (game !== undefined && !isValidGameResult(game)) {
        return { error: 'game must include boolean win and numeric score.' }
    }

    return {
        value: {
            journeyId,
            complete: complete ?? false,
            ...(game !== undefined ? { game } : {}),
        },
    }
}

const isValidGameResult = (value: unknown): value is EndRequest['game'] =>
    isRecord(value) &&
    typeof value.win === 'boolean' &&
    isFiniteNumber(value.score)

journeysRouter.post('/api/telemetry/journey/start', async (c) => {
    try {
        const response = await telemetry.startJourney()
        return c.json(response)
    } catch (error) {
        return serverError(c, error)
    }
})

journeysRouter.post('/api/telemetry/journey/progress', async (c) => {
    try {
        const parsed = parseProgressRequest(await readJsonBody(c))
        if ('error' in parsed) return badRequest(c, parsed.error)

        const response = await telemetry.journeyProgress(parsed.value)
        return c.json(response)
    } catch (error) {
        return serverError(c, error)
    }
})

journeysRouter.post('/api/telemetry/journey/interaction', async (c) => {
    try {
        const parsed = parseInteractionRequest(await readJsonBody(c))
        if ('error' in parsed) return badRequest(c, parsed.error)

        const response = await telemetry.journeyInteraction(parsed.value)
        return c.json(response)
    } catch (error) {
        return serverError(c, error)
    }
})

journeysRouter.post('/api/telemetry/journey/end', async (c) => {
    try {
        const parsed = parseEndRequest(await readJsonBody(c))
        if ('error' in parsed) return badRequest(c, parsed.error)

        const response = await telemetry.endJourney(parsed.value)
        return c.json(response)
    } catch (error) {
        return serverError(c, error)
    }
})

journeysRouter.post('/api/telemetry/journey/app-ready', async (c) => {
    try {
        const response = await telemetry.appReady()
        return c.json(response)
    } catch (error) {
        return serverError(c, error)
    }
})
