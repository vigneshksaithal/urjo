# Implementation Plan: Social Viral Mechanics

## Overview

This plan implements four interconnected social mechanics to achieve K-factor > 0.5: synchronous racing, social presence, simplified completion screen, and custom post previews. Tasks are ordered by dependency — shared types first, then server libs, then routes, then client components, then integration.

## Tasks

- [x] 1. Create shared race types
  - [x] 1.1 Create `src/shared/race-types.ts` with types: `RaceSession`, `QueueEntry`, `JoinRaceResult`, `RaceStatus`, `RaceCompleteResult`, `PresenceData`, `PresencePlayer`, `CompletionAction`, `CompletionActionId`, `CompletionContext`, `ChallengePreviewData`, `DailyPreviewData`. Run `bun run type-check` to confirm no errors.
    - _Requirements: 1, 2, 4, 5, 6_

- [x] 2. Implement race session manager
  - [x] 2.1 Create `src/server/lib/race.ts` implementing `joinRace()`, `getRaceStatus()`, `completeRace()`, `abandonRace()`. joinRace checks active race, attempts queue match (30s TTL), creates session (5min TTL). completeRace records time, determines winner atomically. Write tests in `src/server/lib/__tests__/race.test.ts` covering queue join, match, self-match prevention, already-racing guard, winner determination, idempotent completion, expiry. Run `bun run test`.
    - _Requirements: 1, 2, 8_

- [x] 3. Implement presence manager
  - [x] 3.1 Create `src/server/lib/presence.ts` implementing `heartbeat()` and `getPresence()`. heartbeat does ZADD + ZREMRANGEBYSCORE (prune >60s) + EXPIRE (5min) + ZRANGE (read active, max 10). Check `user:{userId}:activeRace` for isRacing. Write tests in `src/server/lib/__tests__/presence.test.ts`. Run `bun run test`.
    - _Requirements: 4, 8_

- [x] 4. Create race API routes
  - [x] 4.1 Create `src/server/routes/race.ts` with Hono router: `POST /api/race/join`, `GET /api/race/status/:sessionId`, `POST /api/race/complete/:sessionId`, `POST /api/race/abandon/:sessionId`. Validate inputs, use server-side time tracking, award coins/streak on race finish. Register in main entry. Write tests in `src/server/__tests__/race-routes.test.ts`. Run `bun run test`.
    - _Requirements: 1, 2, 7_

- [x] 5. Create presence API route
  - [x] 5.1 Create `src/server/routes/presence.ts` with `POST /api/presence/heartbeat`. Call presence manager, fetch usernames for active players, return PresenceData. Register in main entry. Write tests in `src/server/__tests__/presence-routes.test.ts`. Run `bun run test`.
    - _Requirements: 4_

- [x] 6. Implement simplified completion CTAs
  - [x] 6.1 Update `src/client/lib/completion-ctas.ts`: add `getSimplifiedCompletionCtas()` returning single primary CTA ("Challenge Friends" default, "Race Again" after race win, "View Challenge" if challenged) and secondary ("Next Puzzle"). Update tests in `src/client/lib/__tests__/completion-ctas.test.ts`. Run `bun run test`.
    - _Requirements: 5_

- [x] 7. Create RaceOverlay component
  - [x] 7.1 Create `src/client/components/RaceOverlay.svelte` with three states: waiting (30s countdown + cancel), racing (opponent progress bar + username + pulsing indicator), finished (won/lost + times + CTA). Implement 2s polling loop. Cleanup intervals on destroy.
    - _Requirements: 3_

- [x] 8. Create PresenceBar component
  - [x] 8.1 Create `src/client/components/PresenceBar.svelte` displaying "👥 {activeCount} here · ⚡ {racingCount} racing". Implement 15s heartbeat loop. Start on mount, stop on destroy. Handle errors silently.
    - _Requirements: 4_

- [x] 9. Refactor GameView completion overlay
  - [x] 9.1 Refactor `src/client/views/GameView.svelte` completion overlay: replace multi-button layout with result card (non-interactive) → primary CTA (full-width bold) → secondary CTA (ghost) → "More" button. Move comment result, notify, subscribe, missions, achievements, profile, season to collapsible "More" panel (2-col grid, max 6 items). Add "Race" button to game header.
    - _Requirements: 3, 5_

- [x] 10. Add PresenceBar to GameView
  - [x] 10.1 Add `PresenceBar` to `src/client/views/GameView.svelte` footer area. Show during gameplay. Pass postId for heartbeat scoping. Ensure no layout interference with game board.
    - _Requirements: 4_

- [x] 11. Implement custom post preview
  - [x] 11.1 Create `src/server/lib/preview.ts` with `buildChallengePreview()` and `buildDailyPreview()`. In challenge post creation handler (`src/server/routes/game.ts`), call `setCustomPostPreview` with blocks showing challenger username, time, grid size, emoji grid, "Can you beat it?", attempts/beats stats. Write tests in `src/server/lib/__tests__/preview.test.ts`. Run `bun run test`.
    - _Requirements: 6_

- [x] 12. Add daily puzzle preview
  - [x] 12.1 In scheduler daily-puzzle handler, call `setCustomPostPreview` with daily preview blocks: "Urjo Puzzle #{number}", grid size, partial grid visual, "{N} players today", "Play now". Update preview on first completion (deduped, non-blocking).
    - _Requirements: 6_

- [x] 13. Update challenge beat preview
  - [x] 13.1 In `checkChallengeBeat()` in `src/server/routes/game.ts`, update post preview after leaderboard comment update. Show "Beaten! Champion: u/{winner} in {time}s". Dedup with Redis flag + TTL. Non-blocking (try/catch).
    - _Requirements: 6_

- [x] 14. Add race analytics tracking
  - [x] 14.1 Add `trackRaceJoin()`, `trackRaceMatch()`, `trackRaceComplete()` to `src/server/lib/analytics.ts` using HINCRBY pattern. Add 'race' to `InviteChannel` in `src/shared/growth-types.ts`. Call from race routes. Write tests. Run `bun run test`.
    - _Requirements: 7_

- [x] 15. Update analytics dashboard with race metrics
  - [x] 15.1 Update `src/server/lib/dashboard.ts` to include race metrics. Update `GrowthLoopMetrics` type. Update `src/client/components/AnalyticsDashboard.svelte` to show race columns conditionally. Include in markdown export. Run `bun run type-check`.
    - _Requirements: 7_

- [x] 16. Wire race flow in App.svelte
  - [x] 16.1 Wire race flow in `src/client/App.svelte`: add race state (isRacing, raceSessionId, raceResult), "Race" button handler calling `POST /api/race/join`, match transition, race completion triggering `reportCompletion()`, abandon/timeout fallback. Ensure race completions trigger same analytics as solo.
    - _Requirements: 1, 2, 3_

- [x] 17. Final verification
  - [x] 17.1 Run `bun run test && bun run type-check`. Verify: race join→match→poll→complete→winner, presence heartbeat lifecycle, simplified completion CTA, custom preview on challenge creation, all Redis keys have TTLs.
    - _Requirements: 1, 2, 3, 4, 5, 6, 7, 8_

## Notes

- Tasks 2-5 (server libs + routes) can be parallelized with tasks 6-8 (client logic + components) since they share only the types from task 1.
- Task 11 (preview) depends on understanding `setCustomPostPreview` API — may need Devvit MCP lookup during implementation.
- All race/presence Redis keys use TTLs — verify in task 17 that no permanent keys are introduced.
- The existing challenge system in `src/server/routes/game.ts` is enhanced (not replaced) — challenge posts still work the same way, just with added preview.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "6.1", "7.1", "8.1"] },
    { "id": 2, "tasks": ["4.1", "5.1", "9.1", "10.1", "11.1", "14.1"] },
    { "id": 3, "tasks": ["12.1", "13.1", "15.1", "16.1"] },
    { "id": 4, "tasks": ["17.1"] }
  ]
}
```
