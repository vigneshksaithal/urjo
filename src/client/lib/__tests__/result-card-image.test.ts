import { describe, expect, it, vi } from 'vitest'

import {
  RESULT_CARD_HEIGHT,
  RESULT_CARD_WIDTH,
  renderResultCardImage,
} from '../result-card-image'

type CanvasHarness = {
  canvas: HTMLCanvasElement
  fillText: ReturnType<typeof vi.fn>
  toDataURL: ReturnType<typeof vi.fn>
}

const createCanvasHarness = (): CanvasHarness => {
  const fillText = vi.fn()
  const context = {
    fillRect: vi.fn(),
    fillText,
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  }
  const toDataURL = vi.fn().mockReturnValue('data:image/png;base64,card')
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(context),
    toDataURL,
  } as unknown as HTMLCanvasElement

  return { canvas, fillText, toDataURL }
}

describe('renderResultCardImage', () => {
  it('renders the fixed share-card dimensions as a PNG', () => {
    const harness = createCanvasHarness()

    const result = renderResultCardImage(harness.canvas, {
      puzzleNumber: 42,
      score: 860,
      timeSeconds: 31,
      streak: 7,
      rank: 12,
    })

    expect(harness.canvas.width).toBe(RESULT_CARD_WIDTH)
    expect(harness.canvas.height).toBe(RESULT_CARD_HEIGHT)
    expect(harness.toDataURL).toHaveBeenCalledWith('image/png')
    expect(result).toBe('data:image/png;base64,card')
  })

  it('draws only the fixed result fields supplied by verified game state', () => {
    const harness = createCanvasHarness()

    renderResultCardImage(harness.canvas, {
      puzzleNumber: 42,
      score: 860,
      timeSeconds: 31,
      streak: 7,
      rank: 12,
    })

    const labels = harness.fillText.mock.calls.map(([value]) => value)
    expect(labels).toEqual(expect.arrayContaining([
      'URJO',
      'PUZZLE #42',
      '860',
      '31s',
      '7 day streak',
      'Top #12',
      'Can you beat me?',
    ]))
  })

  it('fails fast when a canvas context is unavailable', () => {
    const canvas = {
      getContext: vi.fn().mockReturnValue(null),
    } as unknown as HTMLCanvasElement

    expect(() => renderResultCardImage(canvas, {
      puzzleNumber: 1,
      score: 10,
      timeSeconds: 5,
      streak: 1,
      rank: null,
    })).toThrow('Canvas 2D context is unavailable')
  })
})
