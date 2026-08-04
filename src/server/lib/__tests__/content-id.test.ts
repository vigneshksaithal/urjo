import { describe, expect, it } from 'vitest'

import { createContentId } from '../content-id'

describe('createContentId', () => {
    it('combines the post and issued puzzle into a measurement-safe ID', () => {
        expect(createContentId('t3_board123', 'm1-instance')).toBe(
            't3_board123_m1-instance',
        )
    })

    it('rejects unsafe or oversized identifiers', () => {
        expect(() => createContentId('t3_board', 'bad:value')).toThrow()
        expect(() => createContentId('t3_board', 'x'.repeat(64))).toThrow()
    })
})
