import { media } from '@devvit/media'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { context } from '@devvit/web/server'

import { getOwnedCompletionSnapshot } from '../lib/completion-snapshot'

const HTTP_STATUS_BAD_REQUEST = 400
const HTTP_STATUS_UNAUTHORIZED = 401
const HTTP_STATUS_FORBIDDEN = 403
const HTTP_STATUS_PAYLOAD_TOO_LARGE = 413
const HTTP_STATUS_INTERNAL_ERROR = 500
const PNG_PREFIX = 'iVBORw0KGgo'
const JPEG_PREFIX = '/9j/'
const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/
const COMPLETION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/

export const MAX_RESULT_IMAGE_BYTES = 2 * 1_024 * 1_024

type ValidImage = { valid: true; dataUrl: string }
type InvalidImage = {
  valid: false
  status: typeof HTTP_STATUS_BAD_REQUEST | typeof HTTP_STATUS_PAYLOAD_TOO_LARGE
  message: string
}

export const mediaRouter = new Hono()

const uploadResultCard = async (c: Context): Promise<Response> => {
  const body: unknown = await c.req.json().catch(() => null)
  if (!isRecord(body) || !isValidCompletionId(body.completionId)) {
    return c.json({ status: 'error', message: 'A verified completion is required' }, HTTP_STATUS_BAD_REQUEST)
  }

  const { userId } = context
  if (!userId) {
    return c.json({ status: 'error', message: 'Log in to upload a result card' }, HTTP_STATUS_UNAUTHORIZED)
  }

  const snapshot = await getOwnedCompletionSnapshot(userId, body.completionId)
  if (snapshot === null) {
    return c.json({ status: 'error', message: 'Verified completion not found' }, HTTP_STATUS_FORBIDDEN)
  }

  const parsed = parseImageBody(body)
  if (!parsed.valid) {
    return c.json({ status: 'error', message: parsed.message }, parsed.status)
  }

  try {
    const uploaded = await media.upload({ url: parsed.dataUrl, type: 'image' })
    return c.json({
      status: 'success',
      data: { mediaUrl: uploaded.mediaUrl },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload result card'
    return c.json({ status: 'error', message }, HTTP_STATUS_INTERNAL_ERROR)
  }
}

mediaRouter.post('/api/media/result-card', uploadResultCard)

const parseImageBody = (body: unknown): ValidImage | InvalidImage => {
  if (!isRecord(body) || typeof body.image !== 'string') {
    return invalidImage('A PNG or JPEG data URL is required')
  }

  const maximumEncodedLength = 4 * Math.ceil(MAX_RESULT_IMAGE_BYTES / 3)
  if (body.image.length > maximumEncodedLength + 32) {
    return oversizedImage()
  }

  const match = DATA_URL_PATTERN.exec(body.image)
  if (!match) return invalidImage('Image must be a base64 PNG or JPEG data URL')

  const mimeType = match[1]
  const encoded = match[2]
  if (!mimeType || !encoded || encoded.length % 4 !== 0) {
    return invalidImage('Image data is not valid base64')
  }
  if (getDecodedByteLength(encoded) > MAX_RESULT_IMAGE_BYTES) return oversizedImage()
  if (!hasExpectedSignature(mimeType, encoded)) {
    return invalidImage('Image signature does not match its MIME type')
  }

  return { valid: true, dataUrl: body.image }
}

const getDecodedByteLength = (encoded: string): number => {
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  return (encoded.length * 3) / 4 - padding
}

const hasExpectedSignature = (mimeType: string, encoded: string): boolean =>
  mimeType === 'image/png'
    ? encoded.startsWith(PNG_PREFIX)
    : encoded.startsWith(JPEG_PREFIX)

const invalidImage = (message: string): InvalidImage => ({
  valid: false,
  status: HTTP_STATUS_BAD_REQUEST,
  message,
})

const oversizedImage = (): InvalidImage => ({
  valid: false,
  status: HTTP_STATUS_PAYLOAD_TOO_LARGE,
  message: 'Result card exceeds the 2 MB upload limit',
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isValidCompletionId = (value: unknown): value is string =>
  typeof value === 'string' && COMPLETION_ID_PATTERN.test(value)
