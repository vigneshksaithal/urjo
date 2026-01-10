# Development Workflow

## Why Devvit Needs a Different Workflow

Devvit apps run inside Reddit, not standalone browsers. This means:

| Reality | Implication |
|---------|-------------|
| Serverless runtime | No long-running processes, no WebSockets |
| Sandboxed webview | No localStorage, no external fetch from client |
| 70% mobile users | Mobile testing is mandatory, not optional |
| Reddit context required | `userId`, `postId` only exist on Reddit |
| Platform limits | 500MB Redis, 30s timeout, 4MB payload |

**Local testing catches ~80% of issues. You MUST playtest on Reddit before shipping.**

---

## The Devvit Development Loop

```text
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  CHECK  │ → │  PLAN   │ → │  BUILD  │ → │  TEST   │ → │PLAYTEST │ → │  SHIP   │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
     │             │             │             │             │             │
     ▼             ▼             ▼             ▼             ▼             ▼
 Can this      Write plan    TDD: test     Local:        On Reddit:    Changelog
 work on       Get approval  then code     type-check    mobile test   Commit
 Devvit?       (3-7 bullets) Small chunks  lint, test    real device   PR
```

---

## Phase 1: CHECK — Can This Work on Devvit?

**Before writing any code or plan, verify the feature is possible.**

Run through this constraint checklist:

| Question | If YES → Action Required |
|----------|--------------------------|
| Needs `localStorage` or `sessionStorage`? | ❌ **Impossible** — Must use Redis via server |
| Needs external API call from client? | ⚠️ Proxy through server endpoint |
| Needs >500MB storage? | ⚠️ Implement pagination or use external DB |
| Needs WebSockets or streaming? | ⚠️ Use Devvit Realtime (max 100 msg/sec) |
| Needs file system writes? | ⚠️ Use `media.upload()` for images |
| Needs long-running background process? | ⚠️ Use Scheduler (cron jobs) |
| Needs native Node modules (fs, sharp, ffmpeg)? | ❌ **Impossible** — Use external service |
| Request takes >30 seconds? | ⚠️ Break into smaller operations |
| Payload >4MB? | ⚠️ Chunk or compress data |

**If any constraint blocks you, redesign before proceeding to PLAN.**

### Example: Feature Blocked by Constraint

```markdown
## Feature: Export puzzle as PDF

### Constraint Check
- ❌ Needs `pdfkit` which requires `fs` → BLOCKED

### Redesign Options
1. Generate PDF server-side via external service (e.g., html2pdf API)
2. Generate shareable image instead using canvas
3. Export as text format user can copy

### Decision: Option 2 (canvas image export)
```

---

## Phase 2: PLAN — Write Approach, Get Approval

Once constraints are verified, write a concise plan:

```markdown
## Feature: Add Difficulty Selector

### Constraints Verified
- ✅ Uses Redis hash (within 500MB limit)
- ✅ No external APIs needed
- ✅ UI fits mobile viewport

### Approach (3-5 bullets)
1. Add `DifficultySelector.svelte` component with 4 options
2. Store selected difficulty in `game:{postId}:config` hash
3. Modify `generatePuzzle()` to accept difficulty parameter
4. Update splash screen to show current difficulty
5. Add tests for each difficulty level

### Files to Modify
- `src/client/components/DifficultySelector.svelte` (new)
- `src/server/routes/game.ts` (add endpoint)
- `src/shared/generator.ts` (add difficulty param)

### Questions
- Should difficulty be changeable mid-game? (Assuming no)
```

**Rules:**

- Keep bullets conceptual, not implementation-level
- Acknowledge which constraints you verified
- Ask questions if anything is unclear — DO NOT ASSUME
- Get approval before proceeding to BUILD

---

## Phase 3: BUILD — TDD in Small Chunks

Follow test-driven development:

```typescript
// Step 1: Write failing test
it('generates easy puzzle with 40+ given cells', () => {
  const puzzle = generatePuzzle('easy')
  const givenCount = puzzle.split('').filter(c => c !== '0').length
  expect(givenCount).toBeGreaterThanOrEqual(40)
})

// Step 2: Run test → Should fail (RED)
// Step 3: Implement minimum code to pass (GREEN)
// Step 4: Refactor if needed (REFACTOR)
// Step 5: Commit and repeat
```

**BUILD Rules:**

- Write test before implementation
- Implement the smallest piece that works
- Keep functions ≤30 lines
- Commit frequently (even WIP commits are fine)
- One logical change per commit

---

## Phase 4: TEST — Local Verification

Run all local checks:

```bash
pnpm type-check  # TypeScript compilation
pnpm test        # Unit tests
pnpm fix         # Linting + formatting
```

**All three must pass before proceeding.**

| Check | What It Catches |
|-------|-----------------|
| `type-check` | Type errors, missing imports, wrong parameters |
| `test` | Logic errors, regressions, edge cases |
| `fix` | Code style, formatting, common mistakes |

⚠️ **This is necessary but NOT sufficient.** Local tests don't verify:

- Reddit context (`userId`, `postId`)
- Redis connectivity
- Mobile webview behavior
- Dark mode rendering
- Touch interactions

---

## Phase 5: PLAYTEST — Test on Reddit

**This phase is MANDATORY. Never skip it.**

Start playtest:

```bash
pnpm dev
# Opens: https://www.reddit.com/r/YourTestSub?playtest=your-app
```

### Playtest Checklist

Test on each platform:

| Platform | How to Test | What to Check |
|----------|-------------|---------------|
| Desktop Web | Browser at full width | Layout, hover states, keyboard |
| Mobile Web | Browser at 375px OR phone | Touch targets, no horizontal scroll |
| Reddit iOS App | TestFlight or production | Native feel, gestures work |
| Reddit Android App | Play Store or APK | Same as iOS |

For each platform, verify:

- [ ] App loads without errors
- [ ] All interactive elements respond
- [ ] Touch targets are ≥44px
- [ ] No horizontal scrolling
- [ ] Dark mode renders correctly
- [ ] Light mode renders correctly
- [ ] Text is readable (≥16px base)
- [ ] Loads in <3 seconds
- [ ] No console errors (check devtools)
- [ ] Error states display properly
- [ ] Empty states display properly

### Common Playtest Failures

| Symptom | Likely Cause |
|---------|--------------|
| "Cannot read property of undefined" | `context.userId` or `context.postId` is undefined |
| Infinite loading | Server endpoint returning wrong format |
| Works locally, fails on Reddit | Using `localStorage` or client-side fetch |
| Layout broken on mobile | Fixed widths instead of responsive |
| Buttons not responding | Touch targets too small or overlapping |

---

## Phase 6: SHIP — Changelog and Commit

After playtest passes:

### 1. Update CHANGELOG.md

```markdown
## [Unreleased]

### Added
- Difficulty selector with Easy/Medium/Hard/Expert options
- Puzzle generation adapts to selected difficulty

### Changed
- Default difficulty is now Medium (was Hard)

### Fixed
- Timer no longer continues after puzzle completion
```

### 2. Final Commit

```bash
# Ensure everything passes one more time
pnpm type-check && pnpm fix && pnpm test

# Stage and commit
git add .
git commit -m "feat(game): add difficulty selector

- Add DifficultySelector component with 4 levels
- Store difficulty preference in Redis
- Adjust puzzle generation based on difficulty
- Tested on iOS, Android, and mobile web

Closes #42"
```

### 3. Open PR (if team) or merge

---

## Definition of Done

A feature is complete when ALL boxes are checked:

**Local Checks:**

- [ ] TypeScript compiles (`pnpm type-check`)
- [ ] All tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm fix`)
- [ ] No `console.log` statements remain

**Playtest Checks:**

- [ ] Works on desktop web
- [ ] Works on mobile web (375px)
- [ ] Works on Reddit iOS app
- [ ] Works on Reddit Android app
- [ ] Works in dark mode
- [ ] Works in light mode
- [ ] Loads in <3 seconds
- [ ] No console errors

**Documentation:**

- [ ] CHANGELOG.md updated
- [ ] AGENTS.md updated (if new patterns)

---

## Git Conventions

### Branch Naming

```text
feat/add-difficulty-selector
fix/timer-not-stopping
chore/update-dependencies
docs/improve-readme
refactor/extract-validation-logic
```

### Commit Messages

**Rules:**

- Start with type: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`
- Scope in parentheses: `(game)`, `(timer)`, `(ui)`
- Imperative verb: "add" not "added"
- Max 72 characters in subject line
- Reference issue: `Closes #42` or `Fixes #42`
- Run `pnpm type-check` before every commit

```text
examples:
feat(game): add difficulty selector dropdown
fix(timer): stop timer when puzzle completed
chore(deps): update svelte to 5.x
docs(readme): add installation instructions
refactor(validation): extract isValidMove function
```

---

## Example Feature Implementation

### Task: Add a "New Game" button

#### 1. Plan (Get Approval)

- Add button component to game board
- Create `/api/game/new` endpoint
- Generate new puzzle in server
- Update UI on success

#### 2. Test First

```typescript
// src/shared/generator.test.ts
import { describe, it, expect } from 'vitest'
import { generatePuzzle } from './generator'

describe('generatePuzzle', () => {
  it('returns 81-character string', () => {
    const puzzle = generatePuzzle('easy')
    expect(puzzle).toHaveLength(81)
  })
  
  it('contains only digits 0-9', () => {
    const puzzle = generatePuzzle('easy')
    expect(puzzle).toMatch(/^[0-9]+$/)
  })
})
```

#### 3. Server Endpoint

```typescript
// src/server/routes/game.ts
import { Hono } from 'hono'
import { redis, context } from '@devvit/web/server'
import { generatePuzzle, solvePuzzle } from '../../shared/generator'

export const gameRoutes = new Hono()

gameRoutes.post('/api/game/new', async (c) => {
  try {
    const { difficulty = 'medium' } = await c.req.json()
    const { postId } = context
    
    if (!postId) {
      return c.json({ error: 'No post context' }, 400)
    }
    
    const puzzle = generatePuzzle(difficulty)
    const solution = solvePuzzle(puzzle)
    
    await redis.hSet(`game:${postId}:state`, {
      puzzle,
      solution,
      difficulty,
      created: new Date().toISOString()
    })
    
    return c.json({ success: true, puzzle })
    
  } catch (error) {
    console.error('Failed to create game:', error)
    return c.json({ error: 'Failed to create game' }, 500)
  }
})
```

#### 4. Client Component

```svelte
<!-- src/client/components/NewGameButton.svelte -->
<script lang="ts">
  let loading = $state(false)
  let { onNewGame }: { onNewGame: (puzzle: string) => void } = $props()
  
  const startNewGame = async () => {
    loading = true
    try {
      const response = await fetch('/api/game/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty: 'medium' })
      })
      
      if (!response.ok) throw new Error('Failed')
      
      const { puzzle } = await response.json()
      onNewGame(puzzle)
      
    } catch (error) {
      console.error('Failed to start new game:', error)
    } finally {
      loading = false
    }
  }
</script>

<button 
  onclick={startNewGame}
  disabled={loading}
  class="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50 min-h-[44px]"
>
  {loading ? 'Starting...' : 'New Game'}
</button>
```

#### 5. Update CHANGELOG.md

```markdown
## [Unreleased]

### Added
- New Game button to start fresh puzzles
- `/api/game/new` endpoint for puzzle generation
```

