---
id: PP-20260705-c7687d
title: "Web Components use Lit for interactive UI, vanilla HTMLElement for simple display"
type: rule
scope: repo
applies_to: "all Web Component authoring in casehub-pages"
cross_repo_consumers: []
severity: important
refs: []
violation_hint: "Web Component uses Lit for a static display-only widget, or uses vanilla HTMLElement for a component with reactive state and child property bindings"
created: 2026-07-05
---

Two approaches coexist, selected by component purpose:

| Approach | When | Examples |
|----------|------|---------|
| **Lit** | Interactive UI with reactive state, user input, a11y | pages-primitives, pages-ui forms |
| **Vanilla** | Simple display, auth gates, pipeline components | pages-ui auth, pages-viz bases |

## Decision criteria

**Use Lit when any apply:** reactive properties triggering re-renders,
scoped CSS needed, composition mixins used, user input beyond simple clicks.

**Use vanilla when all apply:** no Lit dependency needed, no mixin
composition, no scoped CSS via `css` tagged literals.

## Lit conventions

- `@customElement('pages-<name>')` decorator for registration
- `@property()` for public API, `@state()` for internal state
- Immutable collection updates — replace Set/Map/Array, never mutate in
  place (see garden protocol
  [`web/lit-immutable-collections.md`](https://github.com/user/garden/docs/protocols/web/lit-immutable-collections.md))
- Composition via mixins, not inheritance chains —
  `RovingTabindexMixin(LitElement)`, not deep class hierarchies
- Template via `html` tagged literal, styles via `css` tagged literal

## Vanilla conventions

- `customElements.define('pages-<name>', ClassName)` at module level
- `static get observedAttributes()` for reactive attributes
- Shadow DOM attached in `connectedCallback()`
- Manual event listener cleanup in `disconnectedCallback()`

## Vanilla base class hierarchy

The `pages-viz` package provides abstract base classes for vanilla components
with framework lifecycle management:

```
HTMLElement
  → PagesElement<P>           (data requests, refresh timer, resize observer, render pipeline)
    → PagesChartElement<P>    (ECharts init/dispose, option pipeline, click-to-filter)
    → PagesFormInput<P>       (field value extraction, change events, submit-on-Enter)
  → PagesContentElement<P>   (simple content: props + render, no data binding)
```

`PagesElement` and its subtypes have reactive property bindings (`props` and
`dataSet` setters trigger re-render) and observer patterns (ResizeObserver,
MutationObserver). `PagesContentElement` is genuinely one-shot — props trigger
render, no data machinery. New viz components should extend the appropriate
base class rather than raw `HTMLElement`.

## Element naming

All custom elements use `pages-` prefix regardless of approach. Tag names
are lowercase hyphenated: `pages-filter-chips`, `pages-scope-selector`,
`pages-identity`.
