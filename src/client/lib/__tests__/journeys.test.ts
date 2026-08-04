import { describe, expect, it, vi } from 'vitest'

import { createUrjoJourneyTracker } from '../journeys'

const validReceipt = {
    receipt: {
        status: 'JOURNEY_RECEIPT_VALID' as const,
        message: 'Success: Event was recorded.',
    },
}

const createClient = () => ({
    appReady: vi.fn().mockResolvedValue(validReceipt),
    startJourney: vi.fn().mockResolvedValue({ journeyId: 'journey-1', ...validReceipt }),
    progress: vi.fn().mockResolvedValue(validReceipt),
    interaction: vi.fn().mockResolvedValue(validReceipt),
    endJourney: vi.fn().mockResolvedValue(validReceipt),
})

describe('createUrjoJourneyTracker', () => {
    it('marks app readiness once per page load', async () => {
        const client = createClient()
        const tracker = createUrjoJourneyTracker(client)

        await tracker.markAppReady()
        await tracker.markAppReady()

        expect(client.appReady).toHaveBeenCalledOnce()
    })

    it('starts one journey and records first-cell progress together', async () => {
        const client = createClient()
        const tracker = createUrjoJourneyTracker(client)

        await tracker.beginPuzzle(6)

        expect(client.startJourney).toHaveBeenCalledOnce()
        expect(client.progress).toHaveBeenCalledWith({
            progress: 0.25,
            action: 'first_cell',
            actionDetails: 'grid:6',
        })
    })

    it('deduplicates concurrent first-cell calls for the same puzzle', async () => {
        const client = createClient()
        const tracker = createUrjoJourneyTracker(client)

        await Promise.all([
            tracker.beginPuzzle(4),
            tracker.beginPuzzle(4),
            tracker.beginPuzzle(4),
        ])

        expect(client.startJourney).toHaveBeenCalledOnce()
        expect(client.progress).toHaveBeenCalledOnce()
    })

    it('records one verified completion terminal event', async () => {
        const client = createClient()
        const tracker = createUrjoJourneyTracker(client)

        await tracker.beginPuzzle(4)
        await tracker.completePuzzle({ performanceScore: 912, timeTaken: 12, mistakes: 1 })
        await tracker.completePuzzle({ performanceScore: 912, timeTaken: 12, mistakes: 1 })

        expect(client.endJourney).toHaveBeenCalledOnce()
        expect(client.endJourney).toHaveBeenCalledWith({
            complete: true,
            game: { win: true, score: 912 },
        })
    })

    it('records an abandoned started puzzle as incomplete', async () => {
        const client = createClient()
        const tracker = createUrjoJourneyTracker(client)

        await tracker.beginPuzzle(4)
        await tracker.abandonPuzzle('grid_size_changed')

        expect(client.interaction).toHaveBeenCalledWith({
            action: 'puzzle_abandoned',
            actionDetails: 'grid_size_changed',
        })
        expect(client.endJourney).toHaveBeenCalledWith({ complete: false })
    })

    it('does not emit a terminal event when the puzzle never started', async () => {
        const client = createClient()
        const tracker = createUrjoJourneyTracker(client)

        await tracker.abandonPuzzle('replaced_before_start')

        expect(client.endJourney).not.toHaveBeenCalled()
    })

    it('waits for a pending terminal event before starting the next puzzle', async () => {
        const client = createClient()
        let finishEnd: (() => void) | undefined
        client.endJourney.mockImplementation(() => new Promise((resolve) => {
            finishEnd = () => resolve(validReceipt)
        }))
        const tracker = createUrjoJourneyTracker(client)

        await tracker.beginPuzzle(4)
        const ending = tracker.completePuzzle({ performanceScore: 900, timeTaken: 10, mistakes: 0 })
        const nextBeginning = tracker.beginPuzzle(6)
        await Promise.resolve()

        expect(client.startJourney).toHaveBeenCalledOnce()
        finishEnd?.()
        await ending
        await nextBeginning
        expect(client.startJourney).toHaveBeenCalledTimes(2)
    })

    it('logs non-valid receipts for diagnostics without throwing', async () => {
        const warn = vi.fn()
        const client = createClient()
        client.interaction.mockResolvedValue({
            receipt: {
                status: 'JOURNEY_RECEIPT_DENIED_NOT_ALLOWLISTED',
                message: 'Denied: Your app is not allowlisted for Journey telemetry yet.',
            },
        })
        const tracker = createUrjoJourneyTracker(client, { warn })

        await tracker.markInteraction('challenge_post', 'created')

        expect(warn).toHaveBeenCalledWith(
            '[Journeys] challenge_post: JOURNEY_RECEIPT_DENIED_NOT_ALLOWLISTED - Denied: Your app is not allowlisted for Journey telemetry yet.',
        )
    })

    it('logs an invalid first-cell receipt independently from the start receipt', async () => {
        const warn = vi.fn()
        const client = createClient()
        client.progress.mockResolvedValue({
            receipt: {
                status: 'JOURNEY_RECEIPT_INVALID',
                message: 'Invalid: progress was rejected.',
            },
        })
        const tracker = createUrjoJourneyTracker(client, { warn })

        await tracker.beginPuzzle(4)

        expect(warn).toHaveBeenCalledWith(
            '[Journeys] first_cell: JOURNEY_RECEIPT_INVALID - Invalid: progress was rejected.',
        )
    })
})
