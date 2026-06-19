# User Actions Skill

Guide for implementing Reddit User Actions in Devvit apps - posting, commenting, and subscribing on behalf of users.

## Overview

User Actions allow your Devvit app to perform actions on behalf of the logged-in user (with their explicit permission). This includes:
- Creating posts as the user
- Creating comments as the user
- Subscribing users to subreddits

**When to use:** Any feature where users create content that should appear under their own username rather than the app account.

---

## Mandatory Requirements (NON-NEGOTIABLE)

These requirements are enforced by Reddit during app review. Violations will result in rejection.

### 1. Always Ask Permission

**Your app MUST inform users BEFORE posting, commenting, or subscribing on their behalf.**

✅ **Correct:** A clear button labeled "Post to Reddit" that the user clicks
❌ **Incorrect:** Automatically posting when they complete a game

```
User flow: User clicks "Share my score" → App shows confirmation → User confirms → App posts
```

### 2. No Automated Actions

Users must explicitly opt-in. Do not:
- Auto-post on game completion
- Auto-comment on achievements
- Auto-subscribe when they join
- Batch/mass actions on behalf of users

### 3. Set userGeneratedContent Correctly

For `submitPost()` with `runAs: 'USER'`, you MUST include the `userGeneratedContent` field:

```typescript
await reddit.submitPost({
  runAs: 'USER',
  userGeneratedContent: {
    text: "User's actual content",
    imageUrls: [] // optional, if user provided images
  },
  subredditName,
  title: 'Post Title',
  entry: 'default',
});
```

**Note:** `userGeneratedContent` is required for `submitPost()` and `submitCustomPost()` with `runAs: 'USER'`. For `submitComment()`, it's not required but the `text` field still represents user content.

### 4. Do Not Gate Functionality

Users should never be forced to post/comment/subscribe to continue using your app.

❌ **Prohibited:**
- "Post to Reddit to unlock this feature"
- "Subscribe to see your results"
- "Comment to get bonus points"

### 5. Keep Actions Separate

Each user action must be a distinct, clear choice.

❌ **Prohibited:**
- A single "Share" button that posts AND comments AND subscribes
- Bundling actions in a way users can't distinguish

### 6. Remember the Human

Follow Reddit's safety guidelines:
- No spam-like content
- No misleading titles
- No engagement bait
- No poor user experiences in pursuit of metrics

---

## Configuration

### Enable in devvit.json

Add permissions to your `devvit.json`:

```json
{
  "permissions": {
    "reddit": {
      "asUser": [
        "SUBMIT_POST",
        "SUBMIT_COMMENT",
        "SUBSCRIBE_TO_SUBREDDIT"
      ]
    }
  }
}
```

### Available Scopes

| Scope | What it allows |
|-------|----------------|
| `SUBMIT_POST` | Create posts as the user |
| `SUBMIT_COMMENT` | Create comments as the user |
| `SUBSCRIBE_TO_SUBREDDIT` | Subscribe user to subreddits |

---

## API Reference

### runAs Parameter

All supported methods accept a `runAs` parameter:

| Value | Behavior |
|-------|----------|
| `'USER'` | Perform action on behalf of the logged-in user |
| `'APP'` | Perform action as the app account (default) |

### Supported Methods

| Method | Supports runAs: 'USER' | Requires userGeneratedContent |
|--------|------------------------|-------------------------------|
| `reddit.submitPost()` | ✅ Yes | ✅ Yes |
| `reddit.submitCustomPost()` | ✅ Yes | ✅ Yes |
| `reddit.submitComment()` | ✅ Yes | ❌ No |

---

## Code Examples

### Submit a Post as the User

```typescript
import { reddit, context } from '@devvit/web/server';

app.post('/api/share-score', async (c) => {
  const { subredditName } = context;
  if (!subredditName) {
    return c.json({ status: 'error', message: 'subredditName is required' }, 400);
  }

  // User must have clicked a "Share" button to reach this endpoint
  const score = c.req.query('score');
  
  const post = await reddit.submitPost({
    runAs: 'USER',
    userGeneratedContent: {
      text: `I scored ${score} points!`,
    },
    subredditName,
    title: 'My Game Score',
    entry: 'default',
  });

  return c.json({ success: true, postId: post.id });
});
```

### Submit a Comment as the User

```typescript
import { reddit, context } from '@devvit/web/server';

app.post('/api/comment', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json({ status: 'error', message: 'postId is required' }, 400);
  }

  await reddit.submitComment({
    runAs: 'USER',
    id: postId,
    text: 'Thanks for playing!',
  });

  return c.json({ success: true });
});
```

### Submit a Comment as the App

```typescript
import { reddit, context } from '@devvit/web/server';

// Default behavior (runAs: 'APP' is implied)
await reddit.submitComment({
  id: context.postId!,
  text: 'Game results are in!',
});
```

### Subscribe User to Subreddit

```typescript
import { reddit } from '@devvit/web/server';

// Note: Subscription on behalf of users requires Reddit approval
// See: https://developers.reddit.com/docs/capabilities/server/userActions
await reddit.subscribeToCurrentSubreddit();
```

---

## Playtesting Behavior

User actions behave differently during playtesting vs. production.

| Environment | runAs: 'USER' Behavior |
|-------------|------------------------|
| **Unapproved/playtest** | Posts as the app account for regular users; as the app owner when they take the action |
| **Approved app** | Posts on behalf of the user for all users |

**Critical distinction during playtesting:**
- **App owner's actions:** `runAs: 'USER'` → posts under app owner's username
- **Other users' actions:** `runAs: 'USER'` → posts under the **app account** (not the user's account)

This means you cannot fully test the user-attribution flow until the app is approved. Test your own actions during playtesting, but understand other testers will see content from the app account.

---

## Rate Limiting

Reddit enforces rate limits on API calls. Handle them gracefully:

### Known Limits

- Reddit's general API limit is approximately 60 requests per minute for authenticated clients
- Devvit may have additional limits specific to the platform

### Handling Rate Limits

```typescript
try {
  const post = await reddit.submitPost({ /* ... */ });
  return c.json({ success: true, postId: post.id });
} catch (error) {
  if (isRateLimitError(error)) {
    // Do NOT retry immediately — respect the rate limit
    return c.json({ 
      error: 'Too many requests. Please wait a moment and try again.',
      retryAfter: 60 // seconds
    }, 429);
  }
  throw error;
}

function isRateLimitError(error: unknown): boolean {
  // Check for rate limit indicators in the error
  return error instanceof Error && 
    (error.message.includes('rate') || error.message.includes('429'));
}
```

**Best practices:**
- Don't retry on 429 errors — let the user wait and retry manually
- Track recent submissions in Redis to prevent accidental spam
- Show clear feedback when rate-limited

---

## Content Validation

User-generated content must be validated before submission.

### What Reddit Handles

Reddit automatically checks for:
- Content policy violations
- Spam detection
- Rate limiting

### What You Must Handle

- **Length limits:** Post titles have a max length (300 chars); body text varies
- **Empty content:** Don't submit empty posts or comments
- **Prohibited content:** Don't submit content you know violates policy
- **Double-submission:** Prevent users from accidentally posting twice

### Preventing Double-Submission

```typescript
// Check if user recently posted
const recentPostKey = `user:${username}:recentPost`;
const recentPost = await redis.get(recentPostKey);

if (recentPost) {
  return c.json({ error: 'Please wait before posting again' }, 429);
}

// Submit the post
const post = await reddit.submitPost({ /* ... */ });

// Mark as recently posted (expires in 60 seconds)
await redis.set(recentPostKey, post.id, { expiration: 60 });

return c.json({ success: true, postId: post.id });
```

---

## Common Patterns

### Confirmation Dialog Before Posting

```svelte
<script lang="ts">
  interface Props {
    subredditName: string;
    onPosted?: (postId: string) => void;
  }

  let { subredditName, onPosted }: Props = $props();
  
  let showConfirm = $state(false);
  let isPosting = $state(false);
  let error = $state<string | null>(null);

  async function shareScore() {
    showConfirm = true;
  }

  async function confirmPost() {
    isPosting = true;
    error = null;
    
    try {
      const res = await fetch('/api/share-score', { method: 'POST' });
      const data = await res.json();
      
      if (!res.ok) {
        error = data.error || 'Failed to post';
        return;
      }
      
      showConfirm = false;
      onPosted?.(data.postId);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Network error. Please try again.';
    } finally {
      isPosting = false;
    }
  }

  function cancel() {
    showConfirm = false;
    error = null;
  }
</script>

<button onclick={shareScore}>Share My Score</button>

{#if showConfirm}
  <div class="dialog" role="dialog" aria-modal="true">
    <p>This will post your score to r/{subredditName} under your username.</p>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    <button onclick={confirmPost} disabled={isPosting}>
      {isPosting ? 'Posting...' : 'Confirm'}
    </button>
    <button onclick={cancel} disabled={isPosting}>Cancel</button>
  </div>
{/if}
```

### Server-Side Handler

```typescript
// server/routes/share-score.ts
import { reddit, context, redis } from '@devvit/web/server';
import type { Context } from 'hono';

export async function handleShareScore(c: Context) {
  // 1. Validate user is logged in
  const username = await reddit.getCurrentUsername();
  if (!username) {
    return c.json({ error: 'Must be logged in to share' }, 401);
  }

  // 2. Get subreddit
  const { subredditName } = context;
  if (!subredditName) {
    return c.json({ error: 'No subreddit context' }, 400);
  }

  // 3. Check for recent submission (prevent double-posting)
  const recentKey = `user:${username}:recentPost`;
  const recent = await redis.get(recentKey);
  if (recent) {
    return c.json({ error: 'Please wait before posting again' }, 429);
  }

  // 4. Get user's score from Redis
  const score = await redis.get(`user:${username}:score`);
  if (!score) {
    return c.json({ error: 'No score to share' }, 400);
  }

  // 5. Post as the user
  try {
    const post = await reddit.submitPost({
      runAs: 'USER',
      userGeneratedContent: {
        text: `I scored ${score} points! Can you beat me?`,
      },
      subredditName,
      title: `My Score: ${score} points`,
      entry: 'default',
    });

    // 6. Mark as recently posted
    await redis.set(recentKey, post.id, { expiration: 60 });

    return c.json({ 
      success: true, 
      postId: post.id,
      postUrl: `https://reddit.com${post.permalink}`
    });
  } catch (error) {
    console.error('Failed to submit post:', error);
    
    // Distinguish between error types
    if (error instanceof Error && error.message.includes('rate')) {
      return c.json({ error: 'Too many requests. Please wait and try again.' }, 429);
    }
    
    return c.json({ error: 'Failed to create post. Please try again.' }, 500);
  }
}
```

---

## Error Handling

Handle errors explicitly and provide actionable feedback to users:

```typescript
try {
  const post = await reddit.submitPost({
    runAs: 'USER',
    userGeneratedContent: { text: content },
    subredditName,
    title,
    entry: 'default',
  });
  return c.json({ success: true, postId: post.id });
} catch (error) {
  console.error('Failed to submit post:', error);
  
  // Note: Devvit may export specific error types in future versions.
  // Currently using string matching as a workaround.
  // See: https://developers.reddit.com/docs/api/redditapi/RedditAPIClient
  
  // Map errors to user-friendly messages
  if (error instanceof Error) {
    if (error.message.includes('rate') || error.message.includes('429')) {
      return c.json({ error: 'Too many requests. Please wait a moment.' }, 429);
    }
    if (error.message.includes('unauthorized') || error.message.includes('401')) {
      return c.json({ error: 'You must be logged in to post.' }, 401);
    }
    if (error.message.includes('forbidden') || error.message.includes('403')) {
      return c.json({ error: 'You don\'t have permission to post here.' }, 403);
    }
  }
  
  // Generic fallback
  return c.json({ error: 'Failed to create post. Please try again.' }, 500);
}
```

---

## Testing Checklist

Before submitting for review, verify:

- [ ] `devvit.json` has correct permissions
- [ ] User sees a confirmation before any user action
- [ ] `userGeneratedContent` is set for posts with `runAs: 'USER'`
- [ ] No functionality is gated behind posting/commenting/subscribing
- [ ] Each action is a separate, clear choice
- [ ] Content follows Reddit's content policy
- [ ] Error states are handled gracefully with user-friendly messages
- [ ] Rate limiting is handled (no auto-retry on 429)
- [ ] Double-submission is prevented
- [ ] Works correctly during playtesting (app owner sees their username)

---

## Further Reading

- [Reddit API Client Reference](https://developers.reddit.com/docs/api/redditapi/RedditAPIClient/classes/RedditAPIClient)
- [Devvit Rules - User Actions](https://developers.reddit.com/docs/devvit_rules#user-action-requirements)
- [Reddit Developer Terms](https://www.redditinc.com/policies/developer-terms)
- [Reddit Content Policy](https://www.redditinc.com/policies/content-policy)
