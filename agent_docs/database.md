# Redis Database Guide

## Overview

Redis is your database in Devvit. It's fast, free, and pre-configured. Each subreddit installation gets 500MB of Redis storage with support for 1,000 commands per second.

## Basic Operations

```typescript
import { redis } from '@devvit/web/server'

// Basic operations
await redis.set('key', 'value')
const value = await redis.get('key')

// Numbers
await redis.incrBy('counter', 1)

// Hashes (objects)
await redis.hSet('user:123', { name: 'Alice', score: '100' })
const user = await redis.hGetAll('user:123')

// Sorted Sets (leaderboards)
await redis.zAdd('leaderboard', { member: 'alice', score: 100 })
const top10 = await redis.zRange('leaderboard', 0, 9, { by: 'score', reverse: true })

// Expiration
await redis.expire('session:abc', 3600) // 1 hour
```

## Redis Key Naming Convention

Use hierarchical, colon-delimited keys:

```text
{entity}:{identifier}:{attribute}
```

| Use Case | Pattern | Example |
|----------|---------|---------|
| Game state | `game:{postId}:state` | `game:t3_abc:state` |
| User stats | `user:{userId}:stats` | `user:t2_xyz:stats` |
| Per-game user data | `user:{userId}:game:{postId}` | `user:t2_xyz:game:t3_abc` |
| Leaderboard | `leaderboard:{scope}:{timeframe}` | `leaderboard:wins:daily:2025-01-15` |
| Global counter | `stats:{metric}` | `stats:totalGames` |

## Example Schema for a Game

```text
┌─────────────────────────────────────────────────────────────────┐
│ GAME INSTANCE                                                   │
├─────────────────────────────────────────────────────────────────┤
│ game:{postId}:puzzle      String   The puzzle (81 chars)        │
│ game:{postId}:solution    String   The solution (81 chars)      │
│ game:{postId}:difficulty  String   easy|medium|hard|expert      │
│ game:{postId}:created     String   ISO timestamp                │
├─────────────────────────────────────────────────────────────────┤
│ USER PROGRESS                                                   │
├─────────────────────────────────────────────────────────────────┤
│ user:{uId}:game:{pId}:board     String   Current state (81)     │
│ user:{uId}:game:{pId}:time      Number   Seconds elapsed        │
│ user:{uId}:game:{pId}:complete  String   "true" or absent       │
├─────────────────────────────────────────────────────────────────┤
│ USER STATS (GLOBAL)                                             │
├─────────────────────────────────────────────────────────────────┤
│ user:{userId}:stats       Hash     {solved, bestTime, streak}   │
├─────────────────────────────────────────────────────────────────┤
│ LEADERBOARDS                                                    │
├─────────────────────────────────────────────────────────────────┤
│ leaderboard:solved        ZSet     userId → solve count         │
│ leaderboard:speed:{diff}  ZSet     `${uId}:${pId}` → time       │
└─────────────────────────────────────────────────────────────────┘
```

## Additional Resources

For a complete list of available Redis commands and advanced usage, use the devvit MCP server:

```text
devvit_search "redis commands"
devvit_search "redis sorted sets"
devvit_search "redis hashes"
```

