# targetPage Virtual Pages — Padding Opt-Out

**Issue:** #686
**Date:** 2026-11-19

## Decision

Virtual pages created by `targetPage: true` default to `padding: 0`, making them transparent wrappers for dataset scoping rather than visual page boundaries.

**Choice:** Add `style: { padding: "0" }` to the virtual page component in the desugar step.

**Alternatives:**
- Props pass-through (`targetPage: { padding: false }`) — adds API surface for a niche need, awkward boolean/object duality
- Leave as-is and document — not viable because the author has no YAML hook to override the synthetic virtual page's style

**Rationale:** Virtual pages are synthetic wrappers for dataset scoping. The author didn't ask for a visual page boundary — they asked for `targetPage: true` so each tab gets its own dataset scope. Content should render the same whether `targetPage` is on or off.

**Trade-offs:** Authors who want padded virtual pages must now wrap tab content in an explicit page with `properties: { padding: "var(--pages-space-4, 16px)" }`. All 12 existing samples render acceptably either way (issue confirmed), so this is not a breaking change in practice.

## Implementation

### Change 1: `component-desugar.ts` line 462

Add `style: { padding: "0" }` to the virtual page component:

```typescript
// Before
slots[name] = [{ type: "page", props: { name }, slots: { default: children } } as Component];

// After
slots[name] = [{ type: "page", props: { name }, style: { padding: "0" }, slots: { default: children } } as Component];
```

This works because `render.ts` applies `component.style` after the default page padding (line 76), so the override takes effect cleanly.

### Change 2: Tests

Update `component-desugar.test.ts` assertions for `targetPage` virtual pages to expect the `style: { padding: "0" }` property.

Add a render test in `render.test.ts` confirming virtual pages with `style: { padding: "0" }` produce elements with zero padding.

## References

- `packages/pages-ui/src/parser/component-desugar.ts:460-466` — targetPage desugar logic
- `packages/pages-component/src/renderer/render.ts:60-73` — page-level padding and style override
- `packages/pages-ui/src/parser/component-desugar.test.ts:579` — existing targetPage tests
