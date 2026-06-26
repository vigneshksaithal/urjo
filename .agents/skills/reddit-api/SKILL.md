---
name: reddit-api
description: Interact with the Reddit API from server-side code. Use when reading user info, submitting posts/comments, setting flair, managing post data, or accessing subreddit data.
---

# Use Reddit API

> All code must follow the **Coding Principles** in AGENTS.md (functional, minimal, readable, modular).

## Available imports

```typescript
// In server route handlers
import { reddit, context } from '@devvit/web/server'

// In test files
import { reddit } from '@devvit/reddit'
```

## Context variables

| Variable | Type | Available when |
|----------|------|----------------|
| `context.userId` | `string \| undefined` | User is logged in |
| `context.postId` | `string \| undefined` | Inside a post |
| `context.subredditId` | `string` | Always |
| `context.subredditName` | `string` | Always |
| `context.postData` | `JsonObject \| undefined` | Post has attached data |

Always guard optional context before use (see `api-route` skill for guard helpers).

## Reddit Thing IDs

| Prefix | Type | Example |
|--------|------|---------|
| `t1_` | Comment | `t1_abc123` |
| `t2_` | User | `t2_xyz789` |
| `t3_` | Post | `t3_def456` |
| `t4_` | Message | `t4_ghi012` |
| `t5_` | Subreddit | `t5_jkl345` |

## Common operations

### Get current user

```typescript
const user = await reddit.getCurrentUser()
if (!user) {
  return c.json({ status: 'error', message: 'Not logged in' }, 400)
}
const username = user.username
```

For lightweight username-only access (better performance):

```typescript
const username = await reddit.getCurrentUsername()
```

### Get current subreddit

```typescript
const subreddit = await reddit.getCurrentSubreddit()
```

### Submit a custom post

```typescript
const post = await reddit.submitCustomPost({
  subredditName: context.subredditName!,
  title: 'My Post Title',
  entry: 'default',  // matches entrypoint key in devvit.json
})
// post.id is the new post ID (e.g. "t3_abc")
```

### Submit a post with attached data

Attach up to 2KB of JSON data to a post (readable via `context.postData`):

```typescript
import type { JsonObject } from '@devvit/web/shared'

const postData: JsonObject = {
  gameState: 'active',
  challengeNumber: 42,
}

const post = await reddit.submitCustomPost({
  subredditName: context.subredditName!,
  title: 'Game Post',
  entry: 'default',
  postData,
})
```

### Read and update post data

```typescript
// Read: available on context
const data = context.postData  // JsonObject | undefined

// Update: fetch post and call setPostData (replaces entire object)
const post = await reddit.getPostById(context.postId!)
const currentData = (context.postData || {}) as JsonObject
await post.setPostData({
  ...currentData,
  lastUpdatedAt: new Date().toISOString(),
})
```

### Submit as user (requires permissions)

Requires `permissions.reddit.asUser` in devvit.json:

```typescript
const post = await reddit.submitCustomPost({
  runAs: 'USER',
  userGeneratedContent: {
    text: 'User-authored content for safety review',
  },
  subredditName: context.subredditName!,
  title: 'User Post',
  entry: 'default',
})
```

- `runAs: 'USER'` — submits on behalf of the logged-in user
- `userGeneratedContent` — required when using `runAs: 'USER'` for safety/compliance review
- During playtest, `runAs: 'USER'` falls back to app account for non-owner users
- After app approval, it operates on behalf of all users

### User action review rules

Posting, commenting, and subscribing as the user are Devvit user actions. They must be:

- Triggered by an explicit manual action, such as a clearly labeled button
- Separate from gameplay actions (`Play Again`, `Continue`, `Next Level`)
- Optional and non-gating; never require or encourage posting/commenting/subscribing to progress
- Transparent about what will appear on Reddit and that it will use the user's account

Do not create hidden, automatic, bundled, or surprise user actions. Examples that fail review: `Play Again and Subscribe`, `Post Score to Play Next Level`, `Comment & Continue`.

### Submit a comment

```typescript
await reddit.submitComment({
  postId: context.postId!,
  text: 'Great job! 🎉',
  runAs: 'USER',  // optional — defaults to 'APP'
})
```

Score sharing has stricter rules:

- Generic score comments must use `runAs: 'USER'`
- Generic score comments must reply to one stickied score-thread comment
- Top-level score comments are only appropriate when the user adds meaningful custom commentary
- The share button must be separate from continuing or replaying the game

### Get a post or comment by ID

```typescript
const post = await reddit.getPostById('t3_abc123')
const comment = await reddit.getCommentById('t1_xyz789')
```

### Get user info

```typescript
const user = await reddit.getUserByUsername('bob')
const avatarUrl = await reddit.getSnoovatarUrl('bob')
const karma = await reddit.getUserKarmaFromCurrentSubreddit()
```

### Set user flair

```typescript
await reddit.setUserFlair({
  subredditName: context.subredditName!,
  username: user.username,
  text: 'Champion 🏆',
})
```

### Set post flair

```typescript
await reddit.setPostFlair({
  subredditName: context.subredditName!,
  postId: context.postId!,
  flairId: 'flair-id',
  text: 'Solved',
})
```

### Subscribe to current subreddit

Requires `permissions.reddit.asUser: ["SUBSCRIBE_TO_SUBREDDIT"]` and app approval. `subscribeToCurrentSubreddit()` does not take `runAs`; with approval and permission it subscribes the current user.

```typescript
await reddit.subscribeToCurrentSubreddit()
```

Rules:

- Subscribe only after an explicit subscribe button or equivalent manual action
- Keep subscribe separate from gameplay, score posting, and replay buttons
- Never gate progress, rewards, or access behind subscribing
- There is no API to check whether the user is already subscribed; if needed, store app-local UI state after a subscribe action

### Navigation response (menu items)

When a menu item handler needs to redirect the user to a post:

```typescript
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared'

app.post('/internal/menu/create-game', async (c) => {
  const _input = await c.req.json<MenuItemRequest>()
  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName!,
    title: 'New Game',
    entry: 'default',
  })
  return c.json<UiResponse>({
    navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
  })
})
```

## Constraints
- Reddit API calls are server-side only — never from client Svelte code
- 30-second request timeout applies to all operations
- Post data limited to 2KB per post
- `setPostData()` replaces the entire object — merge existing fields first
- Error handling follows the `api-route` skill pattern (try/catch, `instanceof Error`)
- Prefer `getCurrentUsername()` over `getCurrentUser()` when you only need the name
- Apps cannot upvote/downvote, follow users, or add friends on behalf of users or app accounts
- If storing Reddit user content or identifying data, handle post/comment/account deletion triggers and remove stored content as required by Devvit Rules

## Checklist before finishing
- [ ] Tests written FIRST in `src/server/__tests__/` using `@devvit/test`
- [ ] All Reddit API calls are in server code (`src/server/`)
- [ ] `context.userId` and `context.postId` guarded before use
- [ ] Response uses standard shape from `api-route` skill
- [ ] Menu item handlers return `UiResponse` with appropriate action
- [ ] `runAs: 'USER'` includes `userGeneratedContent` field
- [ ] `permissions.reddit.asUser` added to devvit.json when using user actions
- [ ] User actions are explicit, separate, transparent, and never required for progression
- [ ] Generic score comments reply to one stickied score comment
- [ ] Subscribe action is separate and does not assume subscription state can be read
- [ ] Stored Reddit user content has deletion-trigger cleanup
- [ ] `bun run test` passes with zero failures
