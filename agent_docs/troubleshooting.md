# Troubleshooting

## Common Errors & Fixes

### "Redis calls failing"

```typescript
// Check key exists before using
const value = await redis.get('key')
if (value === null) {
  // Handle missing key
}

// Check for typos in key names
console.log('Key:', `user:${userId}:stats`) // Debug
```

---

### "Component not updating"

```svelte
<!-- Make sure you're using $state for reactive values -->
<script>
  // ❌ Won't update
  let count = 0
  
  // ✅ Will update
  let count = $state(0)
</script>
```

---

### "Type errors"

```bash
# Run type check to see all errors
pnpm type-check

# Common fixes:
# 1. Add null checks: value?.property
# 2. Add type annotations: const x: Type = ...
# 3. Use type guards: if (typeof x === 'string')
```

---

### "API returns 400 Bad Request"

```typescript
// Check request format
const response = await fetch('/api/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }, // Required!
  body: JSON.stringify(data) // Must be stringified!
})
```

---

### "Works locally but not on Reddit"

1. Check that you're not using `localStorage`
2. Check that all external fetches go through server
3. Check devvit.json has correct permissions
4. Check bundle size isn't too large

---

## Debug Commands

```bash
# Check TypeScript errors
pnpm type-check

# Check linting errors
pnpm lint

# Run specific test
pnpm test -- --grep "test name"

# Watch mode for tests
pnpm test --watch

# Check bundle size
pnpm build && ls -la dist/
```

