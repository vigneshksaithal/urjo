export type EditorCell = '.' | 'b' | 'r'

export const createEditorSolution = (gridSize: number, seed?: string): string => {
    const cellCount = gridSize * gridSize
    return seed?.length === cellCount && /^[rb]+$/.test(seed)
        ? seed
        : '.'.repeat(cellCount)
}

export const updateEditorCell = (solution: string, index: number): string => {
    if (index < 0 || index >= solution.length) return solution
    const current = solution[index]
    const next: EditorCell = current === '.' ? 'b' : current === 'b' ? 'r' : '.'
    return `${solution.slice(0, index)}${next}${solution.slice(index + 1)}`
}

export const resizeEditorSolution = (_solution: string, gridSize: number): string =>
    createEditorSolution(gridSize)

export const getEditorCompletion = (
    solution: string,
    gridSize: number,
): { filled: number; total: number; percent: number } => {
    const total = gridSize * gridSize
    const filled = solution.slice(0, total).split('').filter((cell) => cell !== '.').length
    return {
        filled,
        total,
        percent: Math.round((filled / total) * 100),
    }
}
