import { telemetry } from '@devvit/analytics/client/reddit'
import type {
    JourneyReceipt,
    TelemetryJourneyEndRequest,
    TelemetryJourneyEventResponse,
    TelemetryJourneyInteractionRequest,
    TelemetryJourneyProgressRequest,
    TelemetryJourneyStartResponse,
} from '@devvit/analytics/shared/reddit'

type JourneyClient = {
    appReady: () => Promise<TelemetryJourneyEventResponse>
    startJourney: () => Promise<TelemetryJourneyStartResponse>
    progress: (input: Omit<TelemetryJourneyProgressRequest, 'journeyId'>) => Promise<TelemetryJourneyEventResponse>
    interaction: (
        input: Omit<TelemetryJourneyInteractionRequest, 'journeyId'>,
    ) => Promise<TelemetryJourneyEventResponse>
    endJourney: (input?: Omit<TelemetryJourneyEndRequest, 'journeyId'>) => Promise<TelemetryJourneyEventResponse>
}

type JourneyLogger = {
    warn: (message: string) => void
}

type EndPuzzleInput = {
    performanceScore: number
    timeTaken: number
    mistakes: number
}

type UrjoJourneyTracker = {
    markAppReady: () => Promise<void>
    beginPuzzle: (gridSize: number) => Promise<void>
    markInteraction: (action: string, actionDetails: string) => Promise<void>
    completePuzzle: (input: EndPuzzleInput) => Promise<void>
    abandonPuzzle: (reason: string) => Promise<void>
}

const RECEIPT_VALID = 'JOURNEY_RECEIPT_VALID'

const logReceipt = (label: string, receipt: JourneyReceipt, logger: JourneyLogger): void => {
    if (receipt.status === RECEIPT_VALID) return
    logger.warn(`[Journeys] ${label}: ${receipt.status} - ${receipt.message}`)
}

const runTelemetry = async (
    label: string,
    logger: JourneyLogger,
    callback: () => Promise<TelemetryJourneyEventResponse | TelemetryJourneyStartResponse>,
): Promise<void> => {
    try {
        const response = await callback()
        logReceipt(label, response.receipt, logger)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error'
        logger.warn(`[Journeys] ${label}: ${message}`)
    }
}

const resolved = Promise.resolve()

export const createUrjoJourneyTracker = (
    client: JourneyClient = telemetry,
    logger: JourneyLogger = console,
): UrjoJourneyTracker => {
    let appReadyPromise: Promise<void> | null = null
    let beginPromise: Promise<void> | null = null
    let terminalPromise: Promise<void> | null = null

    const markAppReady = (): Promise<void> => {
        appReadyPromise ??= runTelemetry('app_ready', logger, () => client.appReady())
        return appReadyPromise
    }

    const beginPuzzle = (gridSize: number): Promise<void> => {
        if (beginPromise !== null) return beginPromise

        const previousTerminal = terminalPromise ?? resolved
        beginPromise = previousTerminal.then(async () => {
            await runTelemetry('puzzle_start', logger, () => client.startJourney())
            await runTelemetry('first_cell', logger, () =>
                client.progress({
                    progress: 0.25,
                    action: 'first_cell',
                    actionDetails: `grid:${gridSize}`,
                }),
            )
        })
        return beginPromise
    }

    const endActivePuzzle = (
        callback: () => Promise<void>,
    ): Promise<void> => {
        if (terminalPromise !== null) return terminalPromise
        if (beginPromise === null) return resolved

        const activeBegin = beginPromise
        beginPromise = null
        const currentTerminal = activeBegin.then(callback)
        terminalPromise = currentTerminal
        void currentTerminal.finally(() => {
            if (terminalPromise === currentTerminal) terminalPromise = null
        })
        return currentTerminal
    }

    return {
        markAppReady,
        beginPuzzle,
        markInteraction: (action, actionDetails) =>
            runTelemetry(action, logger, () =>
                client.interaction({ action, actionDetails }),
            ),
        completePuzzle: ({ performanceScore }) =>
            endActivePuzzle(() =>
                runTelemetry('puzzle_complete', logger, () =>
                    client.endJourney({
                        complete: true,
                        game: { win: true, score: performanceScore },
                    }),
                ),
            ),
        abandonPuzzle: (reason) =>
            endActivePuzzle(async () => {
                await runTelemetry('puzzle_abandoned', logger, () =>
                    client.interaction({
                        action: 'puzzle_abandoned',
                        actionDetails: reason,
                    }),
                )
                await runTelemetry('puzzle_incomplete', logger, () =>
                    client.endJourney({ complete: false }),
                )
            }),
    }
}

export const urjoJourney = createUrjoJourneyTracker()
