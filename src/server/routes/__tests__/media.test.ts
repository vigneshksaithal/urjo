import { createDevvitTest } from '@devvit/test/server/vitest'
import { media } from '@devvit/media'
import { runWithContext } from '@devvit/web/server'
import { expect, vi } from 'vitest'

import { createCompletionSnapshot } from '../../lib/completion-snapshot'
import { MAX_RESULT_IMAGE_BYTES, mediaRouter } from '../media'

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
const JPEG_DATA_URL = 'data:image/jpeg;base64,/9j/2Q=='

const USER_ID = 't2_player1'

const createReceipt = async (userId = USER_ID): Promise<string> => {
  const snapshot = await createCompletionSnapshot({
    userId,
    sourcePostId: 't3_testpost',
    puzzleInstanceId: 'verified-instance',
    puzzleNumber: 42,
    gridSize: 4,
    skillLevel: 3,
    timeTaken: 23,
    streak: 5,
    colorGrid: Array.from({ length: 4 }, () => Array(4).fill('red') as 'red'[]),
  })
  return snapshot.completionId
}

const upload = async (image: unknown, completionId?: string): Promise<Response> => {
  const receipt = completionId ?? await createReceipt()
  return mediaRouter.request('/api/media/result-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, completionId: receipt }),
  })
}

const test = createDevvitTest({
  userId: USER_ID,
  postId: 't3_testpost',
  subredditName: 'testsub',
  subredditId: 't5_testsub',
})

test('uploads a bounded PNG and returns its Reddit-hosted URL', async ({ mocks }) => {
  const response = await upload(PNG_DATA_URL)

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({
    status: 'success',
    data: { mediaUrl: 'https://i.redd.it/bogus-for-testing/media-1.png' },
  })
  expect(mocks.media.uploads).toEqual([{ url: PNG_DATA_URL, type: 'image' }])
})

test('accepts a JPEG data URL', async ({ mocks }) => {
  const response = await upload(JPEG_DATA_URL)

  expect(response.status).toBe(200)
  expect(mocks.media.uploads).toEqual([{ url: JPEG_DATA_URL, type: 'image' }])
})

test('rejects a missing image field', async () => {
  const completionId = await createReceipt()
  const response = await mediaRouter.request('/api/media/result-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completionId }),
  })

  expect(response.status).toBe(400)
})

test('requires a completion receipt', async ({ mocks }) => {
  const response = await mediaRouter.request('/api/media/result-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: PNG_DATA_URL }),
  })

  expect(response.status).toBe(400)
  expect(mocks.media.uploads).toHaveLength(0)
})

test('requires a logged-in receipt owner', async ({ mocks }) => {
  const completionId = await createReceipt()
  const response = await runWithContext({
    userId: undefined,
    postId: 't3_testpost',
    subredditName: 'testsub',
    subredditId: 't5_testsub',
  } as Parameters<typeof runWithContext>[0], () => upload(PNG_DATA_URL, completionId))

  expect(response.status).toBe(401)
  expect(mocks.media.uploads).toHaveLength(0)
})

test('rejects a completion receipt owned by another player', async ({ mocks }) => {
  const completionId = await createReceipt('t2_other')

  const response = await upload(PNG_DATA_URL, completionId)

  expect(response.status).toBe(403)
  expect(mocks.media.uploads).toHaveLength(0)
})

test('rejects remote URLs and unsupported image formats', async () => {
  const remoteResponse = await upload('https://example.com/card.png')
  const gifResponse = await upload('data:image/gif;base64,R0lGODlh')

  expect(remoteResponse.status).toBe(400)
  expect(gifResponse.status).toBe(400)
})

test('rejects a MIME type that does not match the encoded image signature', async () => {
  const response = await upload(`data:image/jpeg;base64,${PNG_DATA_URL.split(',')[1]}`)

  expect(response.status).toBe(400)
})

test('rejects decoded images larger than the result-card limit', async ({ mocks }) => {
  const oversizedBase64 = 'A'.repeat(4 * Math.ceil((MAX_RESULT_IMAGE_BYTES + 1) / 3))
  const response = await upload(`data:image/png;base64,${oversizedBase64}`)

  expect(response.status).toBe(413)
  expect(mocks.media.uploads).toHaveLength(0)
})

test('returns a stable error response when Reddit media upload fails', async () => {
  vi.spyOn(media, 'upload').mockRejectedValue(new Error('media unavailable'))

  const response = await upload(PNG_DATA_URL)

  expect(response.status).toBe(500)
  await expect(response.json()).resolves.toEqual({
    status: 'error',
    message: 'media unavailable',
  })
})
