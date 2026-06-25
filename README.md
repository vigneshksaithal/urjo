# Urjo

Urjo is a Devvit webview puzzle game built for Reddit posts. Players solve compact red/blue logic boards, build streaks, earn rewards, compare times, and optionally create Rival Challenge posts for other redditors to beat.

## Growth Loop

- Daily flagship puzzle post with scoreboard, missions, and yesterday's stars.
- First-time players see a custom first screen with the live puzzle preview, one rule, community proof, and a time to beat.
- Completion keeps `Next Puzzle` primary and promotes explicit `Comment Result` and `Create Rival Challenge` actions.
- Rival Challenge posts carry source attribution, chain length, beat events, and leaderboard comments so the loop can be measured instead of guessed.
- Analytics track Daily Active Engagers, D1/D3 return cohorts, challenge post creation, challenge opens, new-player completions, retained challenge completers, and K-factor.

## Compliance Posture

Urjo keeps Reddit actions explicit and separate. The app does not ask for votes, force posting, force subscribing, post public daily mention comments, or auto-crosspost every puzzle. Score comments are explicit user actions that reply under the pinned score thread. Rival Challenge posts are explicit user actions with confirmation before posting. The `r/RedditGames` crosspost path is disabled by default and only runs when the post metadata explicitly approves it.

## Development

```bash
bun install
bun run test
bun run type-check
bun run check
bun run dev
```

## Architecture

```text
src/
  client/   Svelte 5 webview UI
  server/   Hono routes, scheduler, Reddit actions, Redis persistence
  shared/   Shared TypeScript types and pure helpers
```

The app runs inside a Reddit post through Devvit, with data flowing from Svelte to Hono routes and then to Redis or Reddit APIs.
