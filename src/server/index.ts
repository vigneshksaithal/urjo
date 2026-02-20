import {
  context,
  createServer,
  getServerPort,
  redis
} from '@devvit/web/server'
import type { TaskResponse } from '@devvit/web/server'
import { serve } from '@hono/node-server'
import type { Context } from 'hono'
import { Hono } from 'hono'

import { createPost } from './post'
import { gameRouter } from './routes/game'
import { economyRouter } from './routes/economy'

const HTTP_STATUS_BAD_REQUEST = 400

const app = new Hono()

const createPostHandler = async (c: Context) => {
  try {
    const post = await createPost()

    return c.json({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`
    })
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Failed to create post'
    return c.json(
      {
        status: 'error',
        message: errorMessage
      },
      HTTP_STATUS_BAD_REQUEST
    )
  }
}

app.post('/internal/on-app-install', createPostHandler)
app.post('/internal/menu/post-create', createPostHandler)

// Scheduler endpoint for twice-daily puzzle posts
app.post('/internal/scheduler/daily-puzzle', async (c: Context) => {
  try {
    // Redis is automatically isolated per subreddit installation
    // Increment counter atomically to get the next puzzle number
    const puzzleNumber = await redis.incrBy('stats:puzzleCounter', 1)
    const title = `Urjo Puzzle #${puzzleNumber}`
    
    console.log(`[Scheduler] Creating post: ${title}`)
    
    const post = await createPost(title)
    
    console.log(`[Scheduler] Post created successfully: ${post.id}`)
    
    return c.json<TaskResponse>({ status: 'ok' })
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Failed to create scheduled post'
    console.error('[Scheduler] Error:', errorMessage)
    return c.json<TaskResponse>(
      { status: 'error', message: errorMessage },
      500
    )
  }
})

// Register game API routes
app.route('/', gameRouter)
app.route('/', economyRouter)

// Start the Devvit-wrapped server so context (reddit, redis, etc.) is available
serve({ fetch: app.fetch, port: getServerPort(), createServer })
