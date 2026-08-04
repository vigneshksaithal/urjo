import { describe, expect, it, vi } from 'vitest'

import { joinCommunity, loadCommunityStatus } from '../community'

describe('community client adapter', () => {
    it('loads the app-recorded Join status', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            status: 'success',
            data: { joinedViaUrjo: false },
        })))

        await expect(loadCommunityStatus(fetcher)).resolves.toEqual({ joinedViaUrjo: false })
        expect(fetcher).toHaveBeenCalledWith('/api/community/status')
    })

    it('joins through an explicit POST', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            status: 'success',
            data: { joined: true, subredditName: 'urjo' },
        })))

        await expect(joinCommunity(fetcher)).resolves.toEqual({
            joined: true,
            subredditName: 'urjo',
        })
        expect(fetcher).toHaveBeenCalledWith('/api/community/join', { method: 'POST' })
    })

    it('surfaces Reddit permission and network failures', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            status: 'error',
            message: 'Reddit could not join r/urjo',
        }), { status: 502 }))

        await expect(joinCommunity(fetcher)).rejects.toThrow('Reddit could not join r/urjo')
    })
})
