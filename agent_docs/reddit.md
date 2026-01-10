# Reddit API Guide

## Overview

The Reddit API allows you to access Reddit data for users, posts, comments, and moderation. All Reddit API calls are made from server-side code only.

## Common Operations

```typescript
import { reddit, context } from '@devvit/web/server'

// Get current user
const user = await reddit.getCurrentUser()
console.log(user?.username)

// Get current subreddit
const subreddit = await reddit.getCurrentSubreddit()

// Submit a comment
await reddit.submitComment({
  postId: context.postId!,
  text: 'Great solve! 🎉'
})

// Set user flair
await reddit.setUserFlair({
  subredditName: context.subredditName!,
  username: user!.username,
  text: 'Game Master 🏆'
})
```

## Context Variables

The `context` object provides information about the current request:

| Variable | Type | Example | When Available |
|----------|------|---------|----------------|
| `userId` | `string` | `"t2_abc123"` | If user logged in |
| `postId` | `string` | `"t3_xyz789"` | In post context |
| `subredditId` | `string` | `"t5_2qh1o"` | Always |
| `subredditName` | `string` | `"gaming"` | Always |

## Additional Resources

For complete Reddit API documentation and advanced features, use the devvit MCP server:

```text
devvit_search "reddit api"
devvit_search "submit comment"
devvit_search "user flair"
devvit_search "getCurrentUser"
```

