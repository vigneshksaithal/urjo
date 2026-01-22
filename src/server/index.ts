import {
  context,
  createServer,
  getServerPort
} from '@devvit/web/server'
import { serve } from '@hono/node-server'
import type { Context } from 'hono'
import { Hono } from 'hono'

import { createPost } from './post'
import { gameRouter } from './routes/game'

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

// Scheduler endpoint for daily puzzle posts
app.post('/internal/scheduler/daily-puzzle', async (c: Context) => {
  try {
    const date = new Date()
    const formattedDate = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    const title = `Daily Urjo Puzzle - ${formattedDate}`
    
    await createPost(title)
    
    return c.json({ status: 'ok' })
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Failed to create scheduled post'
    console.error('Scheduler error:', errorMessage)
    return c.json(
      {
        status: 'error',
        message: errorMessage
      },
      HTTP_STATUS_BAD_REQUEST
    )
  }
})

// Register game API routes
app.route('/', gameRouter)

// Start the Devvit-wrapped server so context (reddit, redis, etc.) is available
serve({ fetch: app.fetch, port: getServerPort(), createServer })
