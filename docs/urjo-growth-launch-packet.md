# Urjo growth launch and readiness packet

- **Prepared:** 2026-07-15
- **Primary community:** r/urjo
- **Status:** implementation/readiness plan only — no deployment, live Reddit action, advertising spend, crosspost, notification, or permission request has been performed by this work
- **Decision owner:** Urjo owner/mod team

## 1. Executive decision

Urjo should launch this growth build inside r/urjo first, keep the existing eight-post schedule intact, establish 14 clean days of attempt-level measurement, and earn broader distribution only after activation, retention, integrity, and moderation gates pass.

The eight daily posts are intentional and must not be collapsed during this launch:

| UTC | Slot key | Advertised board |
|---:|---|---:|
| 01:00 | `6x6-0100` | 6×6 |
| 02:30 | `8x8-0230` | 8×8 |
| 14:00 | `6x6-1400` | 6×6 |
| 16:00 | `8x8-1600` | 8×8 |
| 18:00 | `6x6-1800` | 6×6 |
| 20:00 | `8x8-2000` | 8×8 |
| 22:00 | `6x6-2200` | 6×6 |
| 23:30 | `8x8-2330` | 8×8 |

That preserves four 6×6 and four 8×8 posts, reflecting existing-player feedback that 4×4 appeared too often. Every returning player, and every newcomer who selects the advertised board, receives that post's exact 6×6 or 8×8 board.

New players are not silently downgraded. On an advertised 6×6/8×8 post, a first-time signed-in player explicitly chooses:

1. **Warm up with 4×4.** Urjo issues one learning board, remembers the exact advertised board, then returns the player to that same original 6×6/8×8 board after the warm-up.
2. **Play the advertised board now.** Urjo starts the original board immediately.

The full game loads directly in the default Reddit post and is playable inline. There is no separate feed-preview launcher, blocking Play screen, or expanded-mode transition. This is a product constraint grounded in observed player behavior: the previous expanded-mode experience was disliked and coincided with a large player drop. Board cells therefore use tap/click interaction and must preserve natural vertical feed scrolling rather than capturing swipe gestures. The explicit first-time signed-in warm-up choice remains the only pre-board decision.

The growth strategy is not an “algorithm hack.” Reddit does not publish a deterministic ranking formula that Urjo can exploit. The defensible levers are an immediately playable inline board, a fast first meaningful action, verified completions, useful discussion and rivalry, repeat visits, fresh but non-spammy content, and low hide/report/removal rates. Never solicit votes, coordinate engagement, hide user actions, or manufacture comments.

## 2. Status legend and release boundary

| Mark | Meaning |
|---|---|
| **CODE** | Present in the current working tree; still requires the final test/build/playtest gate and deployment by the owner. |
| **GATED** | Requires Reddit/Devvit availability, review, permission, or another community's approval. It must not be represented as live. |
| **OPS** | A manual r/urjo or campaign operating step. |
| **FUTURE** | Deliberately not part of this release. |

Nothing in this packet authorizes a deploy, spend, permission escalation, notification, crosspost, or mutation of live Reddit state.

### Local verification completed

- All 1,370 tests in 116 files pass.
- Svelte diagnostics report zero errors and zero warnings; the TypeScript build check and production Vite build pass.
- Inline game, warm-up, completion, Rival management, progression, Blitz, and 8×8 game states were reviewed at 375×667 and 390×844; tablet bounds were verified at 768×1024 with no horizontal overflow. On the narrowest view, 8×8 cells measure 44.1px, one tap advances one color, and a vertical drag neither changes a cell nor leaves pressed styling behind.
- Visual QA caught and fixed an invalid hyphenated Realtime channel name and a clipped Rival-removal control before handoff.
- A Reddit-backed playtest is still required for scheduler boundaries, user-action permissions, Realtime delivery, and native Reddit mutations.

## 3. Evidence and what it does not prove

The source snapshot is the two Reddit exports supplied on 2026-07-15 plus the current repository audit in `analysis/urjo-growth-2026-07-15/artifact.json`.

| Evidence | Readout | Correct interpretation |
|---|---:|---|
| Latest seven-day qualified-engager average | 4,747/day | Up 3.8% versus the preceding seven days. It is close to 5,000, but not proof of durable retention. |
| Latest 14-day average | 4,660/day | Up 105.3% versus the preceding non-overlapping 14 days. The live deployment date is unknown, so this cannot be causally assigned to a release. |
| Journey Ready → Start, Jul 10–13 | 14.64% | An event ratio, not a unique-person conversion rate. It identifies activation as the largest measurable leak. |
| Journey End / Start, Jul 10–13 | 67.72% | Also an event ratio. It suggests people who begin often reach an end event, but receipts and attempt semantics must be validated. |
| Latest median Journey duration | 12.958 seconds | Consistent with a snackable interaction; not evidence by itself of satisfaction or retention. |

Known caveats:

- The analytics CSV required a reviewed positional reconstruction because its fields were malformed.
- The Journey export contains event counts, not deduplicated people.
- The July 9 Journey row appears to be a partial/instrumentation boundary and is excluded from the comparable aggregate.
- No advertising ran during the observed period.
- The original deployment date and equivalence between the exported live build and this working tree are unknown.
- Therefore, use these values as a baseline for measurement design, not as causal proof or a forecast to millions.

## 4. What is in this growth build

### CODE — trust and server authority

- Puzzle solutions stay server-side; public puzzle responses omit the solution.
- Completion is accepted only after the server verifies the solved board.
- The normal signed-in verified-completion path does not use client-reported mistakes for public rewards, progression, adaptive skill, or competitive records.
- Session-run rewards are calculated from a server-side session counter, not a client counter.
- A verified completion creates an opaque, immutable 30-day completion receipt containing the server-known source post, puzzle instance, board, grid, skill, time, streak, and solved color grid.
- Rival Challenge creation requires an owned receipt for the currently active puzzle, uses the receipt's time/skill, is idempotent per receipt, and is limited to three creator posts per UTC day.
- Season rewards are guarded for exactly-once application.
- Current-day content is the only source of streak credit; archive play must not manufacture a current streak.
- Logged-out play uses a server-stored puzzle, first-cell timer, board verification, and short-lived opaque migration receipt. The browser stores only that receipt—not time, mistakes, or board data. After sign-in, only a receipt completed on today's scheduled slot can receive streak, coins, speed, or season credit; unscheduled or stale receipts are consumed without competitive credit. Viewers without measurement headers may still finish an unranked local result, but receive no migration receipt.

### CODE — feed, onboarding, sharing, and identity

- The default Reddit post entrypoint loads the full game directly inline, with no separate preview, blocking Play action, or expanded-mode request.
- Board cells use tap/click interaction and do not capture vertical swipe gestures, so players can continue scrolling the Reddit feed naturally.
- Loading skeleton cells are non-interactive, so a slow state response cannot consume the player's first measured action.
- First-time signed-in players get the explicit warm-up/advertised choice described above; the selection is stored per account/post so reopening before the first solve does not show the choice again.
- The current warm-up choice is account-scoped: logged-out viewers remain able to play immediately but receive the advertised baked-in board. If “every first-time viewer” is intended to include anonymous traffic, add a session-safe anonymous choice/return path before claiming universal coverage.
- Scheduled posts remain locked to their advertised grid.
- Daily completion proof updates from every unique verified completion rather than freezing after the first.
- Rival creation, opening the new post, sharing it, commenting a result, and continuing are separate non-gating actions. The native share sheet opens only after a distinct **Share rival** tap; cancellation leaves the created Rival intact and does not affect replay or progression.
- A compact progression hub exposes streak, per-grid path levels, season rank/points, coins, next goal, and deterministically rotated verified daily missions.
- Mission rewards are claimed explicitly and exactly once.
- Result-card image rendering and a receipt-gated Reddit media-upload route exist. Receipt ownership authorizes the upload but does not prove arbitrary client-supplied pixels match the snapshot; before using the image as authoritative score proof or `shareImageUrl`, render trusted fields server-side (or keep server fallback data authoritative and treat the image as decorative).
- App-authored and user-authored posts should have spoiler-free text fallback so the premise is legible outside the webview.

### CODE — weekly live operation

- **Urjo Blitz** is a Friday 18:05 UTC opt-in event lasting 48 hours.
- Only players who explicitly join the event participate.
- Verified completion receipts score 1 point for 4×4, 2 for 6×6, and 3 for 8×8; one receipt cannot score twice.
- The top 10 and each viewer's own status are server-authoritative; Realtime publishes bounded summary updates.
- Event data expires after 30 days and has account-deletion cleanup.
- The scheduler budget is now effectively full: eight puzzle crons + drift check + Blitz start = 10 recurring tasks. Add no new recurring job until an existing job is consolidated or removed. Blitz close is a runtime one-off task, not another recurring cron.
- Blitz starts at 18:05 UTC, five minutes after `6x6-1800`; its 48-hour one-off close therefore lands Sunday at 18:05. Playtest both boundaries and downstream latency, but the known same-minute scheduler collision has been removed without changing any puzzle slot.

### GATED or external

- **Join r/urjo:** the working tree includes a separate post-completion button, server route, and `SUBSCRIBE_TO_SUBREDDIT` request, but the action remains externally gated by Devvit user-action approval. No subscription-status read API exists; app-local state can only mean “this app observed a successful Join action.”
- **Push notifications:** limited/gated availability, opt-in, approved copy, Devvit-native delivery, rate-limit compliance, and a real opt-out lifecycle are required. The prior Redis-only Settings reminder toggle has been removed from the working tree; keep it absent until the platform path is approved and tested.
- **Journeys:** code/configuration can emit events, but production availability and valid receipts must be confirmed before the dashboard is treated as decision-grade.
- **Account deletion:** the cleanup endpoint and Redis coverage exist, but the supported Devvit Web configuration/event wiring for account deletion must be confirmed with the platform team.
- **Crossposting/featuring:** requires written destination/mod approval and a Reddit/Devvit featuring request. The code path remains off unless per-post approval metadata is deliberately set.
- **Paid acquisition:** plan only. No campaign, budget, audience, creative, or spend has been activated.

### FUTURE, not a launch dependency

- Payments, boosts, or monetization.
- App Mention triggers or unsolicited bot replies.
- Open-ended text/image level creation beyond the constrained Rival Challenge format.
- Any reduction of the eight daily slots. Cadence changes require a separate owner decision after clean slot-level evidence.

### Working-tree implementation map

| Area | Primary files |
|---|---|
| Eight-slot schedule, Realtime/media/Journeys permissions | `devvit.json` |
| Scheduled post creation, slot dimensions, crosspost guard | `src/server/index.ts`, `src/server/post.ts` |
| Directly playable inline entrypoint and scroll-safe cells | `devvit.json`, `src/client/index.html`, `src/client/App.svelte`, `src/client/components/Cell.svelte`, `src/client/views/GameView.svelte` |
| Warm-up choice and exact return | `src/client/components/WarmupChoice.svelte`, `src/client/App.svelte`, `src/server/routes/game.ts` |
| Measurement IDs/versioning/S2R/slot metrics | `src/shared/measurement-contract.ts`, `src/server/lib/measurement-schema.ts`, `src/server/lib/s2r.ts`, `src/server/lib/slot-metrics.ts` |
| Verified receipts and public actions | `src/server/lib/completion-snapshot.ts`, `src/server/routes/game.ts` |
| Progression/missions | `src/client/components/ProgressionHub.svelte`, `src/server/routes/progression.ts`, `src/server/lib/progression-missions.ts` |
| Result media | `src/client/lib/result-card-image.ts`, `src/server/routes/media.ts` |
| Creator Rival management | `src/client/components/ChallengeManager.svelte` mounted inside the signed-in `SettingsSheet.svelte`, plus `src/server/routes/challenge-management.ts` |
| Explicit Join (externally gated) | `src/client/components/CommunityJoin.svelte`, `src/server/routes/community.ts`, `devvit.json` |
| Urjo Blitz | `src/client/components/UrjoBlitz.svelte`, `src/server/routes/urjo-blitz.ts`, `src/server/lib/urjo-blitz.ts` |
| User/account cleanup | `src/server/lib/account-deletion.ts`, deletion handlers in `src/server/index.ts` |

## 5. Measurement contract

### 5.1 Identity and grain

Every measurement event must preserve the following identifiers:

| Identifier | Lifetime | Purpose |
|---|---|---|
| `sessionId` | One page/webview load | Groups a visit without treating multiple page loads as one session. |
| `contentId` | One server-issued puzzle instance in a post | Prevents a post ID from conflating warm-up, advertised, next, restart, or changed-grid boards. |
| `attemptId` | One issued-puzzle attempt | Regenerated whenever a new board is issued; prevents refresh/retry duplication. |
| `eventId` | One emitted event | Idempotency and receipt reconciliation. |
| `completionId` | One server-verified solve | Authorizes exactly-once downstream public actions without trusting client score fields. |

The canonical `contentId` is derived from server-known post ID plus puzzle-instance ID. Invalid/missing IDs do not become user-level growth events.

Required dimensions for every slot report are: UTC date, `slotKey`, advertised grid, issued grid, onboarding choice, post ID, content ID, attempt ID, source/channel, login state, and build/schema version. Keep anonymous playtime aggregated; do not add anonymous sessions to retention or user-level cohorts.

Current implementation caveat: the signed-out state path returns before user-scoped open/slot tracking, so those slot counters must be labeled **signed-in only** unless privacy-safe aggregate anonymous attempt counters are added. Do not compare a signed-in-only slot rate directly with an all-traffic Journey event ratio.

### 5.2 Funnel definitions

| Layer | Metric | Definition |
|---|---|---|
| North star | Daily Verified Solvers | Unique signed-in users with at least one server-verified completion on that UTC day. |
| Discovery | Eligible exposure/open → Ready | Unique content attempts that reach interactive readiness, segmented by post/slot/source. Treat Reddit's platform impression metric separately if available. |
| Activation | Ready → Start | Unique ready attempts with explicit Play or the first meaningful cell action. |
| Value | Start → verified completion | Started attempts ending in a server-verified solve. |
| Continuation | S2R | Page sessions whose first verified completion is followed by the first action on a distinct attempt within 60 seconds. The next attempt may be in the same or another post. |
| Retention | D1/D3/D7 | Unique verified-solver cohort members who return for a verified start or completion on the exact target day. Do not use an open alone. |
| Virality | New-completer K | Rival creators per verified solver × unique new recipients per creator × recipient verified-completion rate. Record a recipient open on actual recipient entry, never at creator-post time. |
| Community | Join/contribution | Explicit Join actions and meaningful strategy/UGC contributions per verified solver. Generic app comments are not community contribution. |
| Quality | Reliability/negative feedback | p50/p95 Ready latency, route errors, failed completions, duplicates, hides, reports, removals, opt-outs, and moderator interventions. |

### 5.3 V2 rollout and historical boundary

- V2 rollout date: **2026-07-15 UTC**.
- Dual-write window: **2026-07-15 through 2026-07-28 inclusive** (14 UTC dates).
- This versioning contract applies only to a measurement surface that actually writes a schema version. In the current working tree, S2R is the implemented V1/V2 dual-written surface; general analytics and scheduled-slot counters are still unversioned.
- During that window, write compatible **S2R** aggregates to V1 and V2, but read/report S2R dates on or after July 15 from V2.
- From **2026-07-29**, write S2R V2 only. Before July 15, read S2R V1 only.
- Label every other counter `legacy/unversioned` until it is deliberately migrated. Do not put a V2 badge on a dashboard merely because it contains one V2 metric.
- **No backfill.** Never rewrite pre-rollout history to look comparable and never splice V1 and V2 into a single unlabeled trend.
- The schema helper can produce `definitionVersion`, rollout date, dual-write-through date, and `backfillPolicy=no-backfill`, but the current analytics routes do not expose that metadata. A dashboard/export must wire and display it before claiming V2 compliance.

Daily QA during the dual-write window (V1/V2 delta comparisons apply only to versioned surfaces):

1. Compare S2R V1/V2 aggregate deltas; investigate any absolute difference over 1% after late events settle.
2. Confirm every verified completion has one completion receipt and no receipt maps to multiple result comments or Rival posts.
3. Confirm S2R eligible ≤ first verified completions and converted ≤ eligible.
4. Confirm all eight slot keys appear every complete UTC day and each maps to the expected grid.
5. Confirm anonymous playtime is absent from solver/retention datasets.
6. Freeze release analysis if Journey receipts are invalid/unspecified for more than 1% of sampled events.
7. Audit displayed denominators: `Start → completion` is completions divided by first actions/starts, while completions divided by opens is a separate `Open → completion` metric and must not carry the same label.

### 5.4 Eight-slot decision table

Run all eight slots for at least 14 clean measured days before discussing cadence. For each slot report:

- unique Ready attempts;
- Ready → Start;
- Start → verified completion;
- new-player warm-up choice rate and first-session completion;
- returning-player verified solvers;
- S2R;
- D1/D3 by acquisition slot;
- unique incremental daily solvers after deduplicating people who use multiple slots;
- challenge creation and recipient completion;
- hide/report/removal rate where the platform exposes it;
- p95 Ready latency and errors.

Do not infer that 6×6 or 8×8 is better from raw completions alone; slot time, audience mix, repeat users, and exposure differ. No slot is removed automatically. A future cadence proposal requires owner approval, at least two matched weeks, and evidence that the candidate slot adds less than 5% incremental daily verified solvers while a controlled holdout preserves at least 95% of daily verified solvers and improves per-post quality. Until then, four 6×6 + four 8×8 is the product contract.

## 6. r/urjo rollout runbook

### Stage 0 — local/playtest readiness

Owner must record these artifacts before deployment:

- full tests, type-check, and production build pass;
- mobile review at 375×667 and 390×844 plus tablet review at 768×1024;
- concurrent/retried scheduler delivery proves an atomic one-post-per-date/slot claim; a non-atomic read-then-write dedupe is not launch-safe;
- logged-out first play and forged score-migration rejection/de-competitive behavior, signed-in first-time choice, returning 6×6, returning 8×8, warm-up return, next puzzle, result comment, Rival creation retry, Rival daily cap, UGC removal, Blitz join/score/close, and account-cleanup tests;
- Settings contains no reminder/notification promise unless a real approved Devvit delivery and opt-out lifecycle is active;
- response inspection proving no solution field reaches public state/grid/next/onboarding responses;
- Journey receipt sample and measurement headers for Ready, Start, completion, and next-attempt action;
- rollback build/version and a named operator.

Do not proceed with a known P0/P1 integrity, deletion, duplicate-publication, reward, or solution-exposure defect.

### Stage 1 — r/urjo only, first 24 hours

- Deploy only when the owner explicitly authorizes it.
- Keep all eight scheduled posts and their advertised grids.
- Do not crosspost, notify, advertise, or turn on Join.
- Pin one plain-language release note explaining the optional 4×4 warm-up and that experienced players still receive the advertised board.
- Have a moderator check every post after creation for title/grid match, directly playable inline board, fallback text, sticky score thread, and playability.
- Review errors, receipt reconciliation, duplicates, report queue, and slot completeness after every two posts.

Proceed after 24 hours only if there is no immediate rollback trigger and all eight slots were correctly emitted.

### Stage 2 — seven-day organic validation

- Keep feature behavior and cadence stable; change copy only through a named experiment.
- Publish one weekly “what changed / what we learned” thread, not eight promotional comments.
- Run Urjo Blitz only if its Realtime, scheduler, and account-deletion checks passed.
- Compare matched weekdays, not a weekend to a weekday.
- Collect qualitative feedback separately for newcomers and established 6×6/8×8 players.

Promotion gate after seven complete days:

- Ready → Start improves at least 20% relative to the clean pre-release baseline;
- Start → verified completion is no worse than 3 percentage points below baseline;
- daily verified solvers do not decline more than 10% versus matched baseline days;
- D1 is not worse by more than 2 percentage points (wait for the closed window);
- no solution leak, duplicate reward/public action, or unresolved deletion defect;
- route 5xx rate is under 1%, and p95 Ready latency is no more than 20% above baseline;
- challenge report/removal rate is below both 5 per 1,000 created challenges and 2× its established baseline, once there are at least 20 challenges.

These are Urjo decision thresholds, not Reddit benchmarks or promises of featuring.

### Stage 3 — 14-day measurement close

- Complete S2R V1/V2 reconciliation through July 28 if this is the original rollout window; keep unversioned counters labeled separately.
- Produce the eight-slot scorecard, new/returning cohort table, D1/D3/D7 where closed, S2R, and new-completer K.
- Keep paid and external-distribution traffic labeled and excluded from organic claims.
- Make a written **continue / iterate / rollback** decision. Do not broaden distribution merely because total opens increased.

### Stage 4 — earned distribution

Request featuring/crosspost approval only when:

- organic D1/D3 is stable or improving;
- recipient completion quality is at least the organic baseline;
- new-completer K is positive with honest recipient attribution;
- UGC supply is repeatable without a report/removal spike;
- mobile reliability and moderation response are proven;
- the team can support a traffic spike without adding unreviewed scheduler jobs or user actions.

## 7. Daily community operating playbook

### Before the first slot

- Confirm scheduler health and no stale slot claim from the prior UTC date.
- Confirm the current build/version and measurement schema shown in the dashboard.
- Check the native moderator queue, app errors, unresolved UGC deletions, and Realtime health.
- Prepare one daily discussion prompt about strategy, not votes: for example, “Which clue unlocked today's 8×8 for you?”

### Per post

- Verify title, slot key, puzzle number, 6×6/8×8 lock, directly playable inline board, vertical feed scrolling, fallback, sticky thread, and exact-board load.
- Do not post generic engagement bait. Let the score thread collect explicit user result comments.
- Reply to real questions, celebrate specific strategies, and route bug reports to one visible support thread.
- Never ask players to upvote, downvote competitors, post to continue, subscribe for rewards, or mass-share.

### After the last slot

- Export the slot scorecard and check incremental unique solvers, not just gross opens.
- Record anomalies with UTC timestamp, slot, post ID, build, affected segment, and action taken.
- Review all reported/removed Rival posts and creator-delete requests.
- Post a recap only when it contains useful community value: fastest verified solve, a strategy insight, Blitz progress, and tomorrow's real schedule.

### Organic distribution outside r/urjo

- Contact relevant subreddit moderators before posting or crossposting. Describe the game, exact frequency, attribution, and deletion/report controls.
- Seed one useful, context-matched puzzle where approved; never spray identical links across communities.
- Prefer a moderator-approved native post or official featuring surface over unsolicited comments.
- Attribute every destination with source/campaign/content identifiers and measure recipient verified completion and retention, not clicks alone.
- Stop immediately if a destination's moderators request it or negative-feedback thresholds fire.

## 8. RedditGames / GamesOnReddit approval request

There is a naming discrepancy to resolve before any action: the current guarded code target is `r/RedditGames`, while the official featuring material reviewed for this packet references `r/GamesOnReddit`. Do not enable the flag until Reddit/Devvit confirms the correct destination and its moderators approve the cadence.

There is also an event-ordering gate: `onPostCreate` can run before post-scoped Redis metadata is written, while the approval flag cannot be stored until the new post ID exists. Prove the trigger ordering/retry behavior in playtest or replace it with an explicit moderator-triggered, idempotent crosspost action after source-post initialization. Approval alone is not enough to turn on an unproven race-prone path.

Send this request through the appropriate Devvit/Reddit developer or community channel:

> **Subject: Urjo — request for one controlled game feature/crosspost**
>
> Urjo is a red/blue logic puzzle running as a Devvit web game in r/urjo. Our current organic baseline is approximately 4,747 daily qualified engagers over the latest seven-day export; no ads ran during that period. The growth build makes the full game directly playable in the default inline Reddit post, preserves vertical feed scrolling with tap-based board cells, and adds server-verified completions, an explicit first-time 4×4 warm-up that returns to the exact advertised 6×6/8×8 board, receipt-bound Rival Challenges, a three-per-day creator cap, creator management/deletion, progression, and a weekly opt-in Realtime event. Expanded mode is intentionally excluded because the prior expanded experience was disliked and coincided with a large player drop.
>
> We are requesting approval for **one app-authored, moderator-selected flagship crosspost/feature initially**, not all eight daily posts and not user-authored Rival posts. The crosspost path is disabled by default, requires explicit per-post approval metadata, checks that the app authored the source, and records the destination post to prevent duplicates.
>
> Please confirm (1) whether the intended destination is r/RedditGames or r/GamesOnReddit, (2) acceptable cadence/title/creative, (3) required app review or launch checklist, and (4) which metrics and feedback window you want. We will share Ready → Start, verified completion, D1/D3/D7, p95 readiness, errors, and report/removal rates; stop on request; and will not solicit votes or manufacture comments.

Approval checklist:

- written destination confirmation;
- written cadence/content approval;
- one named source post and one named owner;
- source-post metadata is complete and trigger ordering/retry has been proven, or an explicit moderator action is used;
- `redditGamesCrosspostApproved=true` set only on that app-authored post;
- no bulk toggle and no UGC challenge crosspost;
- destination link and ID recorded;
- 24-hour safety/quality review and immediate disable path;
- results reported with paid/external source separated from r/urjo organic traffic.

## 9. Devvit platform requests

Bundle these questions into one review packet with screenshots, exact button copy, routes, permissions, tests, and privacy/deletion notes.

Also ask Devvit to confirm that the existing `SUBMIT_POST` and `SUBMIT_COMMENT` approval covers the revised receipt-bound Rival and pinned-result-comment flows. Both remain explicit, separate, and non-gating.

### 9.1 Explicit Join r/urjo user action

Request approval for `SUBSCRIBE_TO_SUBREDDIT` with this behavior:

- Button label: **Join r/urjo for new puzzles**.
- Placement: after a verified positive result, visually separate from Continue, Replay, Comment, Share, and Create Rival.
- One manual click calls the Devvit subscribe action.
- No reward, streak, mission, gameplay, or content access depends on joining.
- Urjo does not claim to know existing subscription status; after success it may store only local UI acknowledgement.
- Failure shows a neutral retry message and never blocks play.

Do not deploy the build with this user-action permission or expose the button until approval is granted and the end-to-end action is tested in production-like playtest.

### 9.2 Notifications eligibility and review

Ask Devvit to confirm production eligibility, opt-in/out API, allowed send windows, rate limits, batching guidance, and copy-review process. Proposed first use is one predictable daily-puzzle reminder, only for Devvit-recorded opted-in users, with the canonical current post link.

Proposed copy for review:

- “Today's 6×6 Urjo is live in r/urjo.”
- “Urjo Blitz is open until Sunday 18:05 UTC.”

No guilt, fake urgency, streak threat, or “everyone is playing” claim. No custom browser push, service worker, device tokens, or Redis-only opt-in list. Do not display reminder UI until a real delivery and opt-out path exist. Keep well below the platform maximum and start with one notification/user/day.

Notification launch requires organic D1/D3 stability, opt-out under 2%, delivery failure under 1%, and no increase in complaint/report rate. These are Urjo guardrails, not platform limits.

### 9.3 Journeys availability and receipts

Ask Devvit to confirm that the app/install is enabled for production Journeys and that these event semantics are accepted:

- App Ready: webview interactive, once per page load;
- Journey Start: first meaningful action for a new attempt;
- Progress: first cell/action, not emitted merely because a screen loaded;
- Interaction: named optional actions such as mission claim or Rival prompt;
- End complete: server-verified solve;
- End incomplete: genuine abandon/replace/close where observable.

Request guidance on receipt sampling, invalid/unspecified receipts, dashboard event deduplication, data latency, and whether unique-attempt exports are available. Until valid receipts are confirmed, label Journey rates “diagnostic event ratios,” not conversion.

### 9.4 Account-deletion support

Provide the platform team with the implemented `/internal/on-account-delete` handler and test coverage, then ask:

- Which Devvit Web 0.13 configuration key/event wires account deletion?
- What payload shape and retry semantics are guaranteed?
- How should partial cleanup failure be retried or acknowledged?
- Are Reddit-deleted user-authored custom posts automatically deleted, and what app-stored attribution must still be removed?

Until confirmed, keep the endpoint tested, retain the 30-day bound on completion snapshots, honor post/comment deletion triggers, and maintain a manual deletion runbook. Do not claim end-to-end account deletion compliance solely because an unwired endpoint exists.

## 10. Rival Challenge moderation and UGC operations

### Product controls

- Creation requires an explicit confirmation and an owned server-verified completion receipt.
- The public time, grid, skill, and board come from the immutable receipt/server state.
- One completion creates at most one Rival post; retries return the existing resource.
- Each creator is capped at three Rival posts per UTC day.
- Creator title is trimmed and bounded; fallback copy is spoiler-free.
- Rival post creation is separate from share, view, and continue. Confirm those explicit actions in mobile playtest before launch.
- Players can list challenges they created and explicitly remove one from r/urjo; the UI discloses that Reddit keeps it in their account history. A successful removal cleans the app's reverse indices/state. Full author deletion remains available through Reddit's native post management.
- Other players use Reddit's native Report action. Urjo must not invent a second opaque reporting system.

### Moderator queue

For each report/removal, record only operational metadata needed for review: post ID, report time, category available from Reddit, moderation action, build, and resolution. Do not copy or retain deleted user text/images into recaps.

Response targets:

- credible safety/policy report: review within 2 hours while staffed;
- spam/duplicate report: review within 12 hours;
- creator removal/deletion failure: retry/resolve within 24 hours;
- solution leak, hidden user action, or mass duplicate publication: freeze Rival creation immediately.

### UGC kill switch

The first response to an incident is to disable the **Create Rival** entry point while keeping core play available. Do not take down all eight puzzle posts unless core play itself is unsafe.

Freeze Rival creation when any of these occurs:

- any verified receipt can create more than one public post;
- daily cap fails for any account;
- any client-forged score/grid appears publicly;
- report/removal rate reaches 5 per 1,000 challenge posts or 2× baseline with at least 20 posts;
- deletion fails repeatedly or deleted content remains discoverable in Urjo-managed surfaces;
- platform/moderator requests a stop.

Resume only after the defect is reproduced, fixed, tested, historical duplicates/indices are cleaned, and a moderator signs off.

## 11. Paid experiment plan — not activated

Paid traffic is an accelerator, not a substitute for activation or retention. Do not spend until the 14-day organic measurement closes, external-source attribution works, and the owner supplies a budget and retained-solver CAC ceiling.

### Objective and unit economics

- Primary objective: **cost per retained D3 verified solver**.
- Secondary: Ready → Start, Start → verified completion, D1, D7, and challenge-recipient quality.
- Guardrails: reports/hides, error/latency, duplicate accounts/actions, paid-vs-organic retention gap.
- Paid users are labeled from first entry and excluded from organic-lift and feature-request claims.

### Phase A — creative screen

Use one approved broad puzzle/logic audience and three native teaser concepts, each pointing to the same canonical r/urjo landing post if Reddit Ads confirms that destination is eligible:

1. **Rival:** partial 6×6 board + “Can you beat 42 seconds on the same board?”
2. **Pattern:** recognizable red/blue board + “One rule. One board. Your time.”
3. **Blitz:** truthful live progress + real close time, only while the event is active.

Do not imply votes, cash rewards, guaranteed rank, fake player counts, or false urgency. If interactive custom posts cannot be promoted directly, use an eligible static/image/video ad and approved Reddit destination; do not assume “Promote post” supports Devvit custom posts.

### Phase B — audience validation

Take no more than two winning creatives into separate audience cells:

- Reddit community/interest targeting relevant to logic and casual puzzles;
- keyword/context targeting for puzzle intent where available;
- a broader gaming-interest cell with audience expansion off initially.

Keep cells mutually interpretable; do not change creative, audience, bid, and landing board simultaneously.

### Attribution and holdout

- Campaign naming: `urjo_<yyyy-mm>_<creative>_<audience>`.
- Preserve campaign, ad group, ad, creative, landing post, slot/grid, and build IDs at first entry.
- If the destination supports query parameters, use `utm_source=reddit`, `utm_medium=paid_social`, named campaign, and creative content; verify that parameters survive Reddit navigation before buying traffic.
- Reserve a randomized platform holdout if Reddit Ads offers it. Otherwise use a pre-declared geographic/time holdout and matched-day organic baseline, explicitly labeled weaker evidence.
- Evaluate only after D3 closes and each cell has enough verified solvers for a stable interval; do not choose a winner from clicks or one-day starts.

### Scale / stop rule

Scale only when paid D3 verified-solver retention is at least 80% of matched organic D3, cost per retained D3 solver is below the owner-approved ceiling, completion quality is within 3 percentage points of organic, and negative feedback is not elevated. Stop a cell for two consecutive closed cohorts below those thresholds, any safety/integrity issue, or an untraceable attribution path.

No budget or spend is set in this packet.

## 12. Rollback matrix

| Trigger | Action | Scope | Resume condition |
|---|---|---|---|
| Solution appears in any public response | Roll back immediately | Whole growth build | Response contract fixed, regression test passes, exposed instances rotated if needed. |
| Duplicate rewards, comments, or Rival posts | Disable affected action; roll back if completion is affected | Reward/share/UGC first | Exactly-once test plus reconciliation/cleanup complete. |
| Wrong advertised grid or warm-up fails to return exact board | Disable onboarding choice or roll back | Onboarding | All 6×6/8×8 choice/return paths pass. |
| 5xx ≥1% for 30 minutes or p95 Ready latency >20% over baseline for two slots | Pause external growth and roll back if sustained | Distribution/build | Two healthy slots and root cause closed. |
| Daily verified solvers down >10% on two matched days | Stop experiments; restore prior layout/build | Experiment/build | Metric recovers and causal change isolated. |
| Start → completion down >3 points | Stop the responsible variant | UI/onboarding | Completion returns within guardrail. |
| UGC report/removal or deletion threshold breached | Freeze Create Rival | UGC only | Moderation/integrity review and sign-off. |
| Realtime errors affect core API/latency | Disable Blitz | Event only | Isolated event load test and clean playtest. |
| Journey receipts invalid/unspecified >1% sample | Stop using Journeys for decisions | Analytics only | Platform confirmation and clean receipt sample. |
| Reddit/mod team asks to stop crossposting/notifications | Disable immediately | External channel | New written approval. |

Rollback must preserve already-earned legitimate progression where possible. Never run a destructive Redis reset as a shortcut.

## 13. Launch decision checklist

### Technical owner

- [ ] Final tests/type-check/build and mobile playtest evidence attached.
- [ ] Full game opens directly in the default inline post with no preview/Play gate or expanded-mode request, and vertical feed scrolling remains natural over the board.
- [ ] Eight scheduled slots and four-per-grid contract verified.
- [ ] Warm-up choice and exact-board return verified.
- [ ] No public solution; receipt-bound public actions; server-authoritative rewards verified.
- [ ] Measurement V2 headers, reconciliation, slot dimensions, and no-backfill labels verified.
- [ ] Scheduler count/limits and Realtime isolation verified.
- [ ] Rollback version and operator named.

### Community/mod owner

- [ ] Release note/support thread ready.
- [ ] Native report queue and creator deletion workflow tested.
- [ ] Rival kill switch and escalation owner named.
- [ ] No vote solicitation, generic comment seeding, or unapproved cross-community posting in the calendar.
- [ ] Feedback collection separates new players from established 6×6/8×8 players.

### Growth owner

- [ ] Baseline windows locked before release.
- [ ] All eight slot reports and paid/external source labels available.
- [ ] No cadence change planned inside the 14-day measurement window.
- [ ] RedditGames/GamesOnReddit destination and written approval confirmed before any flag change.
- [ ] Join, notifications, Journeys, and account-deletion questions submitted and approvals recorded.
- [ ] Paid campaign remains off until budget/CAC ceiling and organic exit gates are signed.

## 14. Reference set

Local evidence:

- `analysis/urjo-growth-2026-07-15/artifact.json`
- `analysis/urjo-growth-2026-07-15/urjo-growth-analysis.ipynb`
- `Urjo_analytics_20260715_050725.csv`
- `Urjo_journeys_analytics_20260715_050730.csv`

Official sources used by the research snapshot:

- [Devvit launch guide](https://developers.reddit.com/docs/guides/launch/launch-guide)
- [Devvit featuring guide](https://developers.reddit.com/docs/guides/launch/feature-guide)
- [Building community games](https://developers.reddit.com/docs/guides/best-practices/community_games)
- [Reddit's approach to content recommendations](https://support.reddithelp.com/hc/en-us/articles/23511859482388-Reddit-s-Approach-to-Content-Recommendations)
- [Devvit text fallback](https://developers.reddit.com/docs/capabilities/server/text_fallback)
- [Building for logged-out players](https://developers.reddit.com/docs/guides/logged-out-users)
- [Creating a custom post](https://developers.reddit.com/docs/capabilities/creating_custom_post)
- [Push-notification best practices](https://developers.reddit.com/docs/capabilities/notifications/pn-best-practices)
- [Devvit Rules](https://developers.reddit.com/docs/devvit_rules)
- [Devvit FAQ and limits](https://developers.reddit.com/docs/guides/faq)
- [Devvit changelog](https://developers.reddit.com/docs/changelog)
- [Reddit Ads targeting](https://www.business.reddit.com/advertise/targeting/community-and-interest)
- [Reddit Conversation Ads](https://www.business.reddit.com/advertise/ad-types/conversation-ads)
- [Promote your post eligibility](https://support.reddithelp.com/hc/en-us/articles/16750646696212-Promote-your-post)

The million-player goal requires successive proof at each layer: feed activation, verified value, retained cohorts, a safe recipient loop, community identity, and repeated earned distribution. This packet deliberately treats “millions” as an operating ambition, not a forecast or an algorithmic guarantee.
