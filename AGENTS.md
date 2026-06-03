# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Agent Workflow — Mandatory Checklist

Every request — no matter how small — must follow these steps in order. Do not skip steps.

### Step 1: Gather Context

Before reasoning about the request, collect information:

1. Read relevant `.agents/skills/*.md` files for the domain being touched
2. Use MCP tools to look up any platform/framework APIs you're unsure about
3. Read the source files involved — understand existing patterns, types, and boundaries
4. If the request touches multiple domains, read all relevant skills

Available skills in `.agents/skills/`:

| Skill | When to read |
|-------|-------------|
| `tdd/SKILL.md` | Any task that involves writing or modifying tests |
| `api-route/SKILL.md` | Adding or changing Hono API routes |
| `svelte-component/SKILL.md` | Creating or modifying Svelte components |
| `redis-schema/SKILL.md` | Any Redis key/data structure changes |
| `reddit-api/SKILL.md` | Interacting with Reddit API |
| `devvit-config/SKILL.md` | Devvit configuration changes |
| `realtime/SKILL.md` | Live updates, multiplayer, event-driven features |
| `scheduler/SKILL.md` | Cron jobs, delayed tasks, timed events |
| `media-uploads/SKILL.md` | Uploading images to Reddit at runtime |

### Step 2: Clarify Requirements

Ask the user questions until you are ≥90% confident in the implementation approach.

- Cover: expected behavior, edge cases, integration points, constraints, user preferences
- Ask about how this feature interacts with existing code
- Ask about error states and what should happen when things go wrong
- Ask about future extensibility — what might change later?
- Do not proceed until ≥90% confident. It is better to ask one extra question than to build the wrong thing.

**Done when:** You can describe the exact changes you'll make, which files you'll touch, and what the expected behavior is — and the user confirms.

### Step 3: Plan

Write a brief plan before touching any code:

- Which files will be created or modified?
- What types/interfaces need to change?
- What are the test cases (inputs → expected outputs)?
- Are there any breaking changes to existing code?

**Done when:** You have a concrete list of changes and test cases.

### Step 4: Write Failing Tests (Red)

Write tests before implementation. Only write tests that are relevant to the change — no filler.

1. Check if `__tests__/*.test.ts` exists for the module being changed
2. Add test cases that describe the new/changed behavior
3. Run `bun run test` — confirm the new tests fail (existing tests still pass)

**What must be tested:**

| Layer | Must test | Can skip |
|-------|----------|----------|
| `src/server/**/*.ts` | All routes, handlers, business logic | — |
| `src/server/lib/**/*.ts` | All helpers, validators, transforms | — |
| `src/shared/**/*.ts` | All pure functions | — |
| `src/client/lib/**/*.ts` | Extracted logic files | `.svelte` files |
| Config / docs / skills | — | Always skip |

**Done when:** `bun run test` runs, new tests fail with expected errors, existing tests pass.

### Step 5: Implement (Green)

Write production-grade code to make the failing tests pass. See [Engineering Standards](#engineering-standards) below.

**Done when:** `bun run test` passes with zero failures.

### Step 6: Refactor

Improve the code while keeping tests green:

- Remove duplication
- Improve naming
- Simplify control flow
- Ensure proper error handling and edge cases
- Verify the code is extensible — will it hold up as the codebase grows?

**Done when:** `bun run test` still passes. Code meets engineering standards.

### Step 7: Verify

```bash
bun run test && bun run type-check
```

**Done when:** Zero test failures, zero type errors.

---

## Engineering Standards

Write production-grade code. Not prototypes, not MVPs. Code that scales, reads well, and doesn't create debt.

### Single Responsibility
- One function does one thing. One file owns one concern.
- If a function name contains "and" or "or", split it.
- Functions ≤30 lines. If longer, extract helpers.

### Open for Extension, Closed for Modification
- Use types/interfaces to define contracts between modules.
- New behavior should be addable without rewriting existing code.
- Prefer composition over conditionals — don't add `if (newFeature)` branches to existing functions.

### Dependency Inversion
- Depend on interfaces/types, not concrete implementations.
- Pass dependencies as function arguments rather than importing singletons where possible.
- This makes code testable and swappable.

### Pure Functions by Default
- Same input → same output, no side effects.
- No mutation of function arguments — return new values.
- Prefer `map`, `filter`, `reduce` over imperative loops.
- Side effects (API calls, Redis, DOM) live at the boundary, not in business logic.

### Defensive Error Handling
- Fail fast with descriptive errors — never silently swallow failures.
- Handle all edge cases: `null`, `undefined`, empty arrays, missing keys.
- Validate inputs at module boundaries. Trust nothing from external sources.
- Use `unknown` over `any`, then narrow with type guards.

### Readability
- Code reads top-to-bottom — put helpers below their callers.
- Descriptive names over comments: `getUserScore()` not `getVal()`.
- Early returns to avoid nesting: guard → bail, then happy path.
- Max one level of callback nesting — extract named functions.
- Comments explain *why*, never *what*.

### No Dead Weight
- No dead code, no commented-out code, no "just in case" abstractions.
- No unused imports, variables, or parameters.
- If you're not sure it's needed, it's not needed.

---

## Code Style

### TypeScript

- `strict: true` with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`
- Array/object index access returns `T | undefined` — always handle it
- `const` by default, `let` only if reassigned, never `var`
- `as const` for literal arrays/objects
- Explicit return types on exported functions
- Arrow function expressions: `const foo = (): void => {}`

### Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Variables, functions | camelCase | `getUserScore` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_ATTEMPTS` |
| Types, interfaces | PascalCase | `GameState` |
| Svelte components | PascalCase file | `GameBoard.svelte` |
| Non-component files | kebab-case | `game-logic.ts` |
| API routes | kebab-case | `/api/game-state` |
| Redis keys | colon-delimited | `user:{userId}:stats` |

### Imports

```typescript
// 1. External packages
import { Hono } from 'hono'
import type { Context } from 'hono'

// 2. Local modules
import { createPost } from './post'

// 3. Side-effect imports last
import './app.css'
```

---

## Build & Dev Commands

| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies |
| `bun run build` | Production build to `dist/` |
| `bun run test` | Run all tests (Vitest) |
| `bun run type-check` | TypeScript composite build check |
| `bun run check` | Svelte-specific type checking |
| `bun run dev` | Start dev server (vite watch + devvit playtest) |
| `bun run deploy` | Build and upload to Devvit |

**Before committing:** `bun run test && bun run type-check`

**Test stack:** Vitest + `@devvit/test` (in-memory Redis, Reddit API mocks, per-test isolation). Tests live in `__tests__/` directories colocated with source.

> No linter or formatter is configured. Do not add these tools without explicit instruction.

---

## Architecture

Devvit app running inside Reddit posts as a sandboxed webview.

```
src/
├── client/     # Svelte 5 + Tailwind CSS 4 (webview)
├── server/     # Hono.js routes (serverless)
└── shared/     # Shared TypeScript types
```

Data flow: `User Action → Svelte → fetch('/api/...') → Hono → Redis/Reddit API → Response → UI`

Key packages: Svelte 5.x, Tailwind CSS 4.x, Hono, TypeScript 6.x, Vite 8.x, @devvit/web 0.12.x, Bun

---

## Context Sources

### MCP Tools

Use MCP tools proactively — they give better answers than guessing.

**Svelte MCP:** `list-sections` → `get-documentation` → write code → `svelte-autofixer` (loop until zero issues)

**Devvit MCP:** `devvit_search` for any Devvit/Redis/Reddit API question. Natural language queries work well. Also use `devvit_logs` to stream live server logs from a playtest subreddit.

**Sequential Thinking MCP:** `sequentialthinking` for breaking down complex problems into step-by-step reasoning chains. Use when facing multi-step logic, architectural decisions, debugging complex issues, or any task that benefits from structured thinking before acting.

**Playwright MCP:** Visual UI review after any Svelte component or CSS change. See [UI Review Workflow](#ui-review-workflow) below.

### Web Search

If unsure about an API, library version, or best practice — search the web first. Don't guess. Prefer official docs and recent sources.

---

## UI Review Workflow

**Trigger:** Any task that creates or modifies `.svelte` files or CSS.

This workflow closes the visual feedback loop — Kiro codes, then visually inspects and iterates.

### How Devvit local testing works

Devvit apps **cannot run fully offline** — the backend (Redis, Reddit API) requires Reddit's infrastructure. There are two ways to test UI:

**Option A — Frontend-only (Vite dev server)**
- Runs the Svelte client at `http://localhost:4173` via `bun run local`
- API calls to `/api/*` will 502 (no backend) — the error screen is expected
- Good for: layout, styling, component structure, static UI states

**Option B — Full playtest (requires Reddit account + subreddit)**
- Run `bun run dev` (which runs `devvit playtest`)
- Devvit uploads the app to Reddit's servers and opens a live test URL like:
  `https://www.reddit.com/r/<your-subreddit>/?playtest=<app-name>`
- Full backend (Redis, Reddit API) works here
- Good for: end-to-end flows, game state, API integration

### Prerequisites for visual review

For frontend-only review (Option A):
```bash
bun run local   # starts Vite at http://localhost:4173
```

For full playtest (Option B):
```bash
bun run dev     # uploads to Reddit + opens playtest URL
```

If neither server is running, ask the user to start one before proceeding.

### Steps (frontend-only review)

1. Ensure `bun run local` is running at `http://localhost:4173`
2. `browser_navigate` → `http://localhost:4173`
3. `browser_screenshot` → capture the current state
4. `browser_console_messages` → check for JS errors
5. Analyze the screenshot for layout/visual issues (see checklist below)
6. `browser_click` / `browser_type` → test interactive elements
7. Resize to 375px width — primary Reddit webview target
8. Fix issues in the Svelte/CSS code
9. Re-screenshot to confirm the fix
10. Repeat until production-quality

### Steps (full playtest review)

1. Ensure `bun run dev` is running and the playtest URL is active
2. `browser_navigate` → the Reddit playtest URL
3. Click "Launch App" on the Reddit post
4. `browser_screenshot` → capture the webview
5. Interact and review as above
6. Use `devvit_logs` MCP tool to stream server logs if debugging backend issues:
   `{ subreddit: "your-test-subreddit", since: "5m" }`

### What to check per component type

| Component | Key checks |
|-----------|-----------|
| Modals | Centered, scrollable content, backdrop, close button reachable |
| Buttons | Consistent size, clear tap targets (≥44px), disabled state visible |
| Game board | Grid alignment, cells don't overflow, fits narrow screens |
| Overlays | Z-index correct, doesn't block interaction behind it |
| Lists/leaderboards | Scrollable, items don't clip, rank numbers aligned |
| Badges/chips | Text doesn't overflow, consistent border-radius |

### Viewport sizes to test

- **375×667** — iPhone SE / narrow Reddit webview (primary target)
- **390×844** — iPhone 14
- **768×1024** — tablet (secondary)

Use `browser_snapshot` to get the accessibility tree if visual inspection isn't enough to diagnose an issue.

---

## Git Conventions

Branches: `feat/...`, `fix/...`, `chore/...`, `refactor/...`

Commits: `type(scope): imperative description` (max 72 chars)

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`
