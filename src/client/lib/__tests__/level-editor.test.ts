import { describe, expect, it } from 'vitest'

import {
    createEditorSolution,
    getEditorCompletion,
    resizeEditorSolution,
    updateEditorCell,
} from '../level-editor'

describe('level editor state', () => {
    it('seeds the editor from a same-size solved board', () => {
        expect(createEditorSolution(4, 'rrbbrbbrbbrrbrrb')).toBe('rrbbrbbrbbrrbrrb')
    })

    it('starts empty when the seed has a different size', () => {
        expect(createEditorSolution(6, 'rrbbrbbrbrrbbrbr')).toBe('.'.repeat(36))
    })

    it('cycles an editor cell from empty to blue to red to empty', () => {
        const empty = createEditorSolution(4)
        const blue = updateEditorCell(empty, 0)
        const red = updateEditorCell(blue, 0)
        const cleared = updateEditorCell(red, 0)

        expect([blue[0], red[0], cleared[0]]).toEqual(['b', 'r', '.'])
    })

    it('preserves a matching seed and clears the board when resized', () => {
        expect(resizeEditorSolution('rrbbrbbrbbrrbrrb', 6)).toBe('.'.repeat(36))
    })

    it('reports filled-cell progress', () => {
        expect(getEditorCompletion('rb..', 4)).toEqual({ filled: 2, total: 16, percent: 13 })
    })
})
