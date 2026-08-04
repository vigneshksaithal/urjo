export const RESULT_CARD_WIDTH = 1_200
export const RESULT_CARD_HEIGHT = 630

export type ResultCardImageData = {
  puzzleNumber: number
  score: number
  timeSeconds: number
  streak: number
  rank: number | null
}

export const renderResultCardImage = (
  canvas: HTMLCanvasElement,
  data: ResultCardImageData,
): string => {
  const drawingContext = canvas.getContext('2d')
  if (!drawingContext) throw new Error('Canvas 2D context is unavailable')

  canvas.width = RESULT_CARD_WIDTH
  canvas.height = RESULT_CARD_HEIGHT
  drawBackground(drawingContext)
  drawBrand(drawingContext, data.puzzleNumber)
  drawScore(drawingContext, data.score)
  drawResultDetails(drawingContext, data)
  drawChallenge(drawingContext)

  return canvas.toDataURL('image/png')
}

const drawBackground = (context: CanvasRenderingContext2D): void => {
  context.fillStyle = '#07172b'
  context.fillRect(0, 0, RESULT_CARD_WIDTH, RESULT_CARD_HEIGHT)
  context.fillStyle = '#e54e3e'
  context.fillRect(0, 0, 26, RESULT_CARD_HEIGHT)
  context.fillStyle = '#3997d7'
  context.fillRect(RESULT_CARD_WIDTH - 26, 0, 26, RESULT_CARD_HEIGHT)
  drawUrjoMark(context)
}

const drawBrand = (context: CanvasRenderingContext2D, puzzleNumber: number): void => {
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.fillStyle = '#ffffff'
  context.font = '800 52px Arial, sans-serif'
  context.fillText('URJO', 86, 84)
  context.fillStyle = '#9fb1c7'
  context.font = '700 28px Arial, sans-serif'
  context.fillText(`PUZZLE #${Math.max(0, Math.trunc(puzzleNumber))}`, 86, 132)
}

const drawScore = (context: CanvasRenderingContext2D, score: number): void => {
  context.textAlign = 'left'
  context.fillStyle = '#ffffff'
  context.font = '900 152px Arial, sans-serif'
  context.fillText(String(Math.max(0, Math.trunc(score))), 86, 310)
  context.fillStyle = '#9fb1c7'
  context.font = '700 26px Arial, sans-serif'
  context.fillText('SCORE', 94, 407)
}

const drawResultDetails = (
  context: CanvasRenderingContext2D,
  data: ResultCardImageData,
): void => {
  context.fillStyle = '#ffffff'
  context.font = '700 30px Arial, sans-serif'
  context.fillText(formatSeconds(data.timeSeconds), 88, 478)
  context.fillText(`${Math.max(0, Math.trunc(data.streak))} day streak`, 246, 478)
  if (data.rank !== null) {
    context.fillText(`Top #${Math.max(1, Math.trunc(data.rank))}`, 520, 478)
  }
}

const drawChallenge = (context: CanvasRenderingContext2D): void => {
  context.fillStyle = '#9fb1c7'
  context.font = '700 34px Arial, sans-serif'
  context.fillText('Can you beat me?', 86, 555)
}

const drawUrjoMark = (context: CanvasRenderingContext2D): void => {
  const colors = ['#e54e3e', '#3997d7', '#3997d7', '#e54e3e'] as const
  colors.forEach((color, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    context.fillStyle = color
    context.fillRect(930 + column * 76, 170 + row * 76, 60, 60)
  })
}

const formatSeconds = (timeSeconds: number): string => {
  const seconds = Math.max(0, Math.trunc(timeSeconds))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
