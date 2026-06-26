---
name: engagement-loops
description: Design habit-forming and viral Reddit game loops using the Hooked Model (Trigger → Action → Variable Reward → Investment). Covers core/meta/social loops, UGC flywheels, score sharing, challenge systems, session design, onboarding, and feed-first UX. Read FIRST before building any new game feature, mechanic, or screen.
---

# Engagement Loop Design

> This is the foundational engagement skill. Read this BEFORE any other engagement skill. Every feature you build must serve at least one loop described here.

## The Hooked Model — Applied to Reddit Games

Every feature must complete at least one cycle of: **Trigger → Action → Variable Reward → Investment**

```
┌─────────────────────────────────────────┐
│              TRIGGER                     │
│  (Reddit feed, notification, streak)    │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│              ACTION                      │
│  (Tap to play, one-touch mechanic)      │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│         VARIABLE REWARD                  │
│  (Score, loot, rank change, surprise)   │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│           INVESTMENT                     │
│  (Share score, build streak, customize) │
└──────────────────┬──────────────────────┘
                   │
                   └──────► Back to TRIGGER
```

### 1. Triggers — What brings the player in?

| Trigger type | Reddit/Devvit mechanism | When to use |
|---|---|---|
| **External — Feed** | Daily post appears in subscribed feed | Daily content, new challenges |
| **External — Notification** | Push notification (gated beta, opt-in, reviewed copy) | New daily content, live event, streak preservation |
| **External — Social** | Score comment, share sheet, subreddit flair | Competition, social proof |
| **Internal — FOMO** | "Today's challenge expires in 3h" | Limited-time events |
| **Internal — Curiosity** | "Can I beat yesterday's score?" | Progression, personal bests |
| **Internal — Boredom** | Quick, snackable game in feed | Idle moments, feed scrolling |

**Implementation rule**: Every feature needs a clear return path. Feed posts and social sharing are broadly available. Push notifications and Journeys are experimental gated beta features; use only when approved and never build custom browser push/device-token systems.

### 2. Action — What does the player do?

The action must be **dead simple**. Reduce friction to near-zero.

| Principle | Implementation |
|---|---|
| **Zero-tap start** | Game loads playable in the feed (inline mode) |
| **One-touch mechanic** | Core gameplay uses tap/swipe, no complex controls |
| **No login wall** | Let logged-out users play the core loop; prompt login only at natural breakpoints |
| **Instant feedback** | Every tap produces visible, satisfying response within 100ms |
| **Session < 2 min** | Core loop completes in under 2 minutes |

### 3. Variable Reward — What surprise keeps them engaged?

Rewards MUST be variable. Predictable rewards lose power. Use at least two of these three reward types:

| Reward type | What it satisfies | Reddit game examples |
|---|---|---|
| **Tribe** (social) | Belonging, status | Leaderboard rank, flair upgrade, "Player of the Week" |
| **Hunt** (resource) | Achievement, collection | Loot drops, daily bonus, streak rewards, unlockables |
| **Self** (mastery) | Competence, growth | New personal best, harder difficulty unlocked, skill rating |

**Variable reward patterns:**

```typescript
// Near-miss design — show what they ALMOST got
// "You were 2 points away from Gold rank!"
// "One more correct answer would have been a new record!"

// Random loot table — never give the same reward twice in a row
const LOOT_TABLE = [
  { item: 'common_badge', weight: 60 },
  { item: 'rare_badge', weight: 25 },
  { item: 'epic_badge', weight: 10 },
  { item: 'legendary_badge', weight: 5 },
] as const
```

### 4. Investment — What makes them come back?

Investment = stored value that makes leaving costly. The more a player invests, the harder it is to quit.

| Investment type | Devvit implementation | Retention effect |
|---|---|---|
| **Streak** | Redis bitfield completion, daily check-in | Loss aversion — "Don't break my 30-day streak" |
| **Profile/Flair** | Subreddit flair auto-updated | Identity — "This community sees I'm a Diamond player" |
| **Content creation** | UGC posts submitted as user after explicit action | Ownership — "My puzzle got 200 plays" |
| **Social connections** | Challenge community via share sheet or user-created post | Obligation — "My community can beat my score" |
| **Progression** | XP, level, unlocked content | Sunk cost — "I've earned too much to stop" |

---

## Three-Loop Architecture

Design every game with three nested loops:

### Core Loop (seconds — the moment-to-moment gameplay)
```
Play → Score → Feedback → Play Again
```
- Completes in 10-120 seconds
- Must feel satisfying even on first play
- Example: Tap to guess → see result → try again

### Meta Loop (days — the progression wrapper)
```
Complete daily challenge → Earn XP → Level up → Unlock new content → New daily challenge
```
- Spans days to weeks
- Gives meaning to repeated core loops
- Example: Daily puzzle → streak counter → league promotion

### Social Loop (ongoing — the community flywheel)
```
Play → Share result → Community sees → Another player tries → Competes → Shares
```
- Spans the entire player community
- Each player's action recruits/retains others
- Example: Score comment or share link → another player opens the post → plays → shares their own result

---

## Proven Game Patterns To Adapt

Use these patterns as design inspiration, not as clones.

### Candy Crush-style retention

- Tiny session: one level/round is playable in under 2 minutes
- Clear local goal: a level has one obvious objective and a visible move/attempt budget
- Near miss: show exactly what was almost achieved and make retry feel plausible
- Useful boosters: earned or purchased boosts relieve friction without replacing skill
- Fresh content: add new levels, events, and variations regularly without changing the core mechanic
- Low interruption: avoid ads, long waits, or aggressive monetization inside the play loop

### Duolingo-style habit loops

- Daily ritual: a small completion counts, so the habit has a low floor
- Streak protection: freezes/recovery reduce rage-quit after one missed day
- Leagues: weekly competition creates fresh starts and status without permanent exclusion
- Timely reminders: notification copy is contextual and respectful, never spammy
- Progress identity: levels, badges, and profile/flair turn effort into visible identity
- Repair path: lapsed users get an easy re-entry, not shame or permanent loss

### Ethical Hooked constraints

- Trigger should point to real value, not anxiety alone
- Action should be simple and reversible
- Variable reward should be delightful but not required for core progress
- Investment should store player value, not trap them
- Any habit mechanic must include opt-outs, recovery, and non-punitive failure

---

## Viral and Social Mechanics

Use the viral equation as a design check:

```
Virality = Visibility × Shareability × Convertibility
```

- **Visibility**: Can non-players see the result in feed, comments, flair, or share previews?
- **Shareability**: Is the result one-tap, spoiler-free, compact, and visually distinctive?
- **Convertibility**: Does the viewer understand what to do in under 3 seconds?

### Reddit-native channels

| Channel | Use |
|---|---|
| Daily posts | Passive feed discovery and fresh starts |
| Score comments | Social proof under a stickied score thread |
| Share sheet | Lightweight invites without creating Reddit content |
| Subreddit flair | Community-scoped identity/status |
| UGC posts | Player-created challenges or creations after explicit consent |

Do not build mechanics that depend on upvoting, downvoting, following users, friend lists, or private subscription state. Devvit apps cannot perform those actions or read that private state.

### UGC and score sharing rules

- User-created posts use `runAs: 'USER'`, `userGeneratedContent`, `SUBMIT_POST`, and a clearly labeled manual action.
- Generic score comments use `runAs: 'USER'` and reply to a single stickied score comment.
- Top-level score comments are only appropriate when the user adds meaningful custom commentary.
- Use `showShareSheet()` for lightweight sharing and deeplinks when a Reddit post/comment is not needed.
- Subscribe prompts appear after positive moments, stay optional, and call `reddit.subscribeToCurrentSubreddit()` only from a separate explicit action with approval.
- User-created content needs moderation, reporting, and deletion cleanup.

### Content flywheel

```
Player plays → shares score/challenge/creation →
Content appears in feed/comments/share preview →
Non-player gets curious → plays →
New player creates content
```

Good flywheels make the shared result compelling without forcing the player to post, comment, subscribe, pay, or notify.

### Share format pattern

Design share text like a compact scorecard:

- Spoiler-free: shows effort/result, not the answer
- Comparable: score, attempts, rank, or time
- Visual: emoji/symbol pattern or concise image
- Actionable: points back to the current post/challenge

Example:

```typescript
const generateShareText = (score: number, maxScore: number, attempts: number): string => {
  const percentage = Math.round((score / maxScore) * 100)
  const stars = '*'.repeat(Math.min(Math.floor(percentage / 20), 5))
  return `Daily Challenge ${stars} ${score}/${maxScore}\nAttempts: ${attempts}\nCan you beat it?`
}
```

---

## Session Design — "One More Round"

### The Zeigarnik Effect
Players remember incomplete tasks more than completed ones. Always leave something unfinished:
- "You're 50 XP from leveling up"
- "3 more wins for weekly mission"
- "Another player just passed your score"

### Optimal session structure
```
1. Quick win (first 30 seconds — guaranteed positive outcome)
2. Escalating challenge (next 60 seconds — difficulty ramps)
3. Near-miss moment (player almost achieves something big)
4. Cliffhanger (session ends with unfinished business)
5. Investment prompt (share score, check streak, see what's next)
```

### Anti-patterns — NEVER do these
- ❌ Force players to wait (timers that block gameplay)
- ❌ Punish failure harshly (losing all progress)
- ❌ Gate core gameplay behind social actions (Reddit policy violation)
- ❌ Merge posting/commenting/subscribing with replay, continue, or reward buttons
- ❌ Prompt login before the player understands the value
- ❌ Show ads or interruptions mid-gameplay
- ❌ Require reading instructions before playing

---

## Onboarding — The First 30 Seconds

### The 3-Second Rule

When a player sees your game in their feed, they make a snap decision:
1. **Second 1**: "What is this?" — Visual must be immediately clear
2. **Second 2**: "Is this for me?" — Must look fun/interesting
3. **Second 3**: "What do I do?" — Action must be obvious

If any of these fail, they scroll past.

### Feed Preview Design (Inline Mode)

The inline post preview is your storefront. It must sell the game without the player clicking anything.

Inline mode should load quickly, respect post boundaries, and use only tap/click interactions. Put full-screen play, heavy gestures, longer load states, and dense controls in expanded mode.

| ✅ Show in inline mode | ❌ Never show in inline mode |
|---|---|
| The game board/state (visual) | Loading spinner |
| A single "Play" button | Login prompt |
| Today's challenge number | Instructions or rules |
| Player count ("1,247 playing") | Empty state |
| Visual preview of gameplay | Settings or menus |

### Inline preview component pattern

```svelte
<script lang="ts">
  import { requestExpandedMode, getWebViewMode } from '@devvit/web/client'

  let mode = $state(getWebViewMode())

  const handlePlay = async (event: MouseEvent): Promise<void> => {
    try {
      await requestExpandedMode(event, 'default')
    } catch (e) {
      console.error('Failed to expand:', e)
    }
  }
</script>

{#if mode === 'inline'}
  <div class="h-full w-full overflow-hidden flex flex-col items-center justify-center bg-gray-900">
    <!-- Visual preview of the game -->
    <div class="mb-4"><!-- Game preview graphic --></div>
    <button onclick={handlePlay} class="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl text-lg">
      ▶ Play Now
    </button>
    <p class="mt-3 text-sm text-gray-400">{playerCount.toLocaleString()} playing today</p>
  </div>
{:else}
  <GameView />
{/if}
```

### Zero-Instruction Design

The best games teach through play, not text.

| Principle | How to implement |
|---|---|
| **Show, don't tell** | Animate the first move as a demo |
| **Constrain choices** | First interaction has only 1-2 options |
| **Immediate feedback** | Every tap produces visible response |
| **Fail safely** | First attempt can't result in game over |
| **Progressive disclosure** | Reveal complexity gradually over sessions |

### First Win Design (Non-Negotiable)

The first session MUST end with a positive outcome:
- First challenge is trivially solvable
- "First Game!" achievement unlocks immediately
- "Day 1 streak started! 🔥" message
- Player immediately appears on leaderboard
- "+25 XP — Welcome!" reward

```typescript
const FIRST_SESSION_REWARDS = [
  { trigger: 'game_started', message: '🎮 Welcome! +10 XP', xp: 10 },
  { trigger: 'first_action', message: '👆 Nice move! +5 XP', xp: 5 },
  { trigger: 'game_completed', message: '🎉 First game complete! +25 XP', xp: 25 },
  { trigger: 'streak_started', message: '🔥 Day 1 streak started!', xp: 10 },
] as const
```

For logged-out users, first-win rewards can be local/session-only until login. Prompt login only when it preserves something the player already earned, such as saving progress, joining the leaderboard, sharing, subscribing, or enabling notifications.

### Return Visit Segmentation

| Segment | Behavior |
|---|---|
| **New player** (0 games) | Guided first game, easy difficulty, reward cascade |
| **Returning player** (1+ games, <7 days gap) | "Welcome back! 🔥 Day N streak", today's challenge, missions |
| **Lapsed player** (7+ days gap) | "We missed you!", easy re-entry, "Start a new streak", bonus XP |

```typescript
const getPlayerSegment = async (userId: string): Promise<'new' | 'returning' | 'lapsed'> => {
  const totalGames = await redis.hGet(`user:${userId}:profile`, 'totalGamesPlayed')
  if (totalGames === undefined || totalGames === '0') return 'new'

  const lastPlayed = await redis.hGet(`user:${userId}:profile`, 'lastPlayedAt')
  if (lastPlayed) {
    const daysSince = Math.floor((Date.now() - new Date(lastPlayed).getTime()) / 86400000)
    if (daysSince >= 7) return 'lapsed'
  }
  return 'returning'
}
```

---

## Engagement Audit Questions

Before shipping ANY feature, answer these:

1. **Trigger**: What brings the player to this feature? Is there an external trigger?
2. **Action**: Can a player engage in under 3 seconds? Is friction minimized?
3. **Variable Reward**: Is the outcome unpredictable enough to maintain curiosity?
4. **Investment**: Does this feature increase the player's stored value?
5. **Loop closure**: Does this feature connect back to a trigger for the next session?
6. **Social amplification**: Can this feature generate content visible to non-players?
7. **Policy safety**: Are posting, commenting, subscribing, login, payment, and notification prompts optional, separate, and explicit?
8. **Viral path**: Is there a spoiler-free share result or UGC path that does not gate progress?

## Checklist before finishing
- [ ] Feature serves at least one engagement loop (Trigger → Action → Reward → Investment)
- [ ] Core loop completes in under 2 minutes
- [ ] At least one external trigger exists (feed post, notification, social)
- [ ] Rewards are variable, not predictable
- [ ] Player investment increases with each session
- [ ] "One more round" pull exists (Zeigarnik effect)
- [ ] No gameplay gated behind social actions (Reddit policy)
- [ ] User actions (post/comment/subscribe) are separate explicit choices
- [ ] Score sharing replies to a stickied comment unless the user adds custom commentary
- [ ] Share sheet used where a post/comment is unnecessary
- [ ] UGC has explicit consent plus deletion/reporting cleanup
- [ ] Logged-out users can play the core loop before login prompts
- [ ] Push notifications used only if approved, opted-in, copy-reviewed, and Devvit-native
- [ ] Near-miss moments designed into the experience
- [ ] Session ends with unfinished business (cliffhanger)
- [ ] Inline preview shows game visual + CTA (no loading/instructions)
- [ ] Game playable within 3 seconds of first tap
- [ ] First session guarantees a positive outcome
- [ ] Feature connects to at least one other loop (meta or social)
