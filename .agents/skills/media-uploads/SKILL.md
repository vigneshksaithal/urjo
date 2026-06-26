---
name: media-uploads
description: Upload images to Reddit at runtime. Use when users need to share screenshots, generated images, or any dynamic image content.
---

# Media Uploads

> All code must follow the **Coding Principles** in AGENTS.md (functional, minimal, readable, modular).

Apps can only display images hosted on Reddit. Use `media.upload()` to upload images at runtime.

Use bundled client assets for static images that ship with the app. Use `media.upload()` for runtime images, GIFs, videos, screenshots, or user-generated media that must be rendered in posts, comments, RTJSON, or the webview.

## Setup

Enable the `media` permission in devvit.json:

```json
{
  "permissions": {
    "media": true
  }
}
```

## Server-side upload

```typescript
import { media } from '@devvit/media'

app.post('/api/upload-screenshot', async (c) => {
  const { image } = await c.req.json<{ image: string }>()

  const response = await media.upload({
    url: image,       // HTTP URL or data URL
    type: 'image',    // 'image' | 'gif' | 'video'
  })

  return c.json({
    status: 'success',
    data: {
      mediaId: response.mediaId,
      mediaUrl: response.mediaUrl,  // Reddit-hosted URL
    },
  })
})
```

## Client-side: canvas screenshot

```typescript
// Capture canvas as data URL
const canvas = document.querySelector('canvas')
const dataUrl = canvas.toDataURL('image/png')

// Send to server for upload
const res = await fetch('/api/upload-screenshot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image: dataUrl }),
})
```

## Limits

- Supported image formats: PNG, JPEG, WEBP, GIF
- Maximum upload size: 20 MB
- Use `type: 'image'` for PNG, JPEG, and WEBP
- WEBP may be converted to JPEG in the returned Reddit URL
- Only Reddit-hosted URLs can be displayed in posts

## Validation rules

- Validate request body shape before upload
- Accept only data URLs or allowlisted remote URLs
- Bound payload size before passing user input to `media.upload()`
- Do not trust MIME/type strings from the client; derive or validate them server-side
- If uploaded media contains user-generated content, make the user action explicit and preserve a deletion/reporting path

## Testing

```typescript
import { createDevvitTest } from '@devvit/test/server/vitest'
import { media } from '@devvit/media'
import { expect } from 'vitest'

const test = createDevvitTest()

test('uploads media assets', async ({ mocks }) => {
  const response = await media.upload({
    url: 'https://example.com/image.png',
    type: 'image',
  })
  expect(response.mediaId).toBe('media-1')
  expect(response.mediaUrl).toContain('https://i.redd.it/')
  expect(mocks.media.uploads).toHaveLength(1)
})
```

Note: In tests, uploads don't hit the network. The mock records the payload and returns synthetic IDs/URLs.

## Checklist before finishing
- [ ] Tests written FIRST for upload handlers
- [ ] `permissions.media: true` added to devvit.json
- [ ] Upload happens server-side only (not from client)
- [ ] Upload type is `image`, `gif`, or `video` (not file extensions like `png`)
- [ ] Runtime image input is validated and size-bounded
- [ ] Response returns Reddit-hosted URL to client
- [ ] `bun run test` passes with zero failures
