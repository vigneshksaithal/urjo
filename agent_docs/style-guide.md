# Style Guide

## TypeScript

| Rule | Example |
|------|---------|
| Use `const` by default | `const MAX = 10` |
| Use `let` only if reassigned | `let count = 0; count++` |
| Never use `var` | — |
| Prefer `unknown` over `any` | `catch (e: unknown)` |
| Use `as const` for literals | `const DIRS = ['N', 'S'] as const` |
| Explicit return types for public functions | `const fn = (): string => {}` |

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables/functions | camelCase | `getUserScore` |
| Constants | SCREAMING_SNAKE | `MAX_ATTEMPTS` |
| Types/Interfaces | PascalCase | `GameState` |
| Components | PascalCase | `GameBoard.svelte` |
| Files (non-component) | kebab-case | `game-logic.ts` |
| API routes | kebab-case | `/api/game-state` |
| Redis keys | colon-delimited | `user:123:stats` |

---

## CSS / Tailwind

### Theme Colors (defined in `src/client/app.css`)

```css
:root {
  --color-bg: theme(colors.white);
  --color-text: theme(colors.gray.900);
  --color-primary: theme(colors.blue.600);
  --color-cell-given: theme(colors.gray.200);
  --color-cell-empty: theme(colors.white);
  --color-cell-error: theme(colors.red.100);
}

.dark {
  --color-bg: theme(colors.gray.900);
  --color-text: theme(colors.gray.100);
  --color-primary: theme(colors.blue.400);
  --color-cell-given: theme(colors.gray.700);
  --color-cell-empty: theme(colors.gray.800);
  --color-cell-error: theme(colors.red.900);
}
```

### Mobile-First Breakpoints

```html
<!-- Mobile first (default) -->
<div class="text-sm p-2">

<!-- Then tablet -->
<div class="text-sm p-2 md:text-base md:p-4">

<!-- Then desktop -->
<div class="text-sm p-2 md:text-base md:p-4 lg:text-lg lg:p-6">
```

---

## Functions

```typescript
// ✅ Good: Small, single-purpose, descriptive name
const calculateScore = (time: number, mistakes: number): number => {
  const baseScore = 1000
  const timePenalty = Math.floor(time / 10)
  const mistakePenalty = mistakes * 50
  return Math.max(0, baseScore - timePenalty - mistakePenalty)
}

// ❌ Bad: Too long, multiple responsibilities, vague name
const handle = (data) => {
  // 50 lines doing validation, calculation, saving, logging...
}
```

**Target:** ≤30 lines per function

---

## Mobile Checklist

Before every PR, verify:

- [ ] Tested at 375px viewport width
- [ ] All touch targets ≥44px
- [ ] No horizontal scrolling
- [ ] Text readable without zooming (≥16px)
- [ ] Buttons/inputs not too close together
- [ ] Works without hover states
- [ ] Dark mode looks correct
- [ ] Loads in <3 seconds on slow 3G

