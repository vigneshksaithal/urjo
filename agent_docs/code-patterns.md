# Code Patterns

## Decision Trees

### Where to Store Data?

```text
Need to store data?
│
├─ Is it <2KB AND needed immediately on page load?
│   └─ YES → Post Data (in devvit.json splash config)
│   └─ NO ↓
│
├─ Is it user-specific?
│   └─ YES → Redis: user:{userId}:*
│   └─ NO ↓
│
├─ Is it game/post-specific?
│   └─ YES → Redis: game:{postId}:*
│   └─ NO ↓
│
└─ Global data → Redis: stats:* or config:*
```

### Where to Put New Code?

```text
Creating something new?
│
├─ Is it a Svelte component?
│   ├─ Used in multiple places? → src/client/components/
│   ├─ A full page/view? → src/client/views/
│   └─ One-off? → Inline in parent
│
├─ Is it an API endpoint?
│   └─ src/server/routes/
│
├─ Is it a utility function?
│   ├─ Client-only? → src/client/lib/
│   ├─ Server-only? → src/server/lib/
│   └─ Both? → src/shared/
│
└─ Is it a type/interface?
    └─ src/shared/types.ts
```

---

## Canonical Patterns

### Svelte 5 Component with Async Data

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  
  type GameState = {
    board: string
    difficulty: string
  }
  
  let gameState = $state<GameState | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)
  
  onMount(async () => {
    try {
      const response = await fetch('/api/game/state')
      if (!response.ok) throw new Error('Failed to load')
      gameState = await response.json()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading = false
    }
  })
</script>

{#if loading}
  <div class="animate-pulse">Loading...</div>
{:else if error}
  <div class="text-red-500">{error}</div>
{:else if gameState}
  <div>{gameState.board}</div>
{/if}
```

---

## DO / DON'T Quick Reference

### Client-Side

| ❌ DON'T | ✅ DO |
|----------|-------|
| `localStorage.setItem()` | `fetch('/api/save', { body: data })` |
| `fetch('https://external.com')` | Create server endpoint that fetches |
| `<style>` blocks in components | Tailwind classes |
| `export default Component` | `export { Component }` |
| `import * as icons from 'lucide'` | `import {Icon}Icon from '@lucide/svelte/icons/{icon}'` |

### Server-Side

| ❌ DON'T | ✅ DO |
|----------|-------|
| `setInterval()` / long processes | Use scheduler for recurring tasks |
| `require('fs').writeFile()` | Use Redis or media.upload() |
| `import sharp from 'sharp'` | Use external service (Cloudinary) |
| Multiple round-trip Redis calls | Batch with `mGet`, `hGetAll` |

### General

| ❌ DON'T | ✅ DO |
|----------|-------|
| `any` type | `unknown` then narrow |
| Magic numbers | Named constants: `const MAX_LIVES = 3` |
| `console.log` in production | Remove or use proper logging |
| Catch and rethrow same error | Handle meaningfully or let propagate |
| Nested ternaries | Early returns or switch |

---

## NO-SCROLL RULES

| Rule | Implementation |
|------|----------------|
| **Never use `overflow-y-auto` or `overflow-scroll`** | Content must fit, period |
| **Never use `min-h-screen` or `h-screen`** | Use `h-full` relative to container |
| **Always use `h-full` on root container** | Fills available space without exceeding |
| **Use `flex` + `flex-shrink` for adaptive layouts** | Elements shrink to fit |
| **Test at MINIMUM viewport** | 320px × 320px is your worst case |
| **Use `overflow-hidden` on root** | Prevents any accidental scroll |

### Root Layout Pattern (REQUIRED)

```svelte
<!-- App.svelte - Root component -->
<div class="
  h-full w-full 
  overflow-hidden
  flex flex-col
  bg-[var(--bg-primary)]
  p-2 sm:p-4
">
  <!-- Header: Fixed size, won't shrink -->
  <header class="flex-none h-10 flex items-center justify-between">
    <!-- header content -->
  </header>
  
  <!-- Main: Takes remaining space, content must fit -->
  <main class="flex-1 min-h-0 flex flex-col items-center justify-center">
    <!-- game content -->
  </main>
  
  <!-- Footer: Fixed size, won't shrink -->
  <footer class="flex-none">
    <!-- controls -->
  </footer>
</div>
```

