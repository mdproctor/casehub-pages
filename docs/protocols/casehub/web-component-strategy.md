---
id: PP-20260705-c7687d
title: "All Web Components use Lit — pages-viz base classes extend LitElement"
type: rule
scope: repo
applies_to: "all Web Component authoring in casehub-pages"
cross_repo_consumers: []
severity: important
refs: []
violation_hint: "Web Component extends raw HTMLElement instead of PagesElement/PagesContentElement/LitElement"
created: 2026-07-05
---

All visualization and UI Web Components use Lit. The pages-viz base classes
(`PagesElement`, `PagesContentElement`) extend `LitElement`, as do pages-table
and pages-primitives.

| Package | Base class | Examples |
|---------|-----------|---------|
| **pages-viz** | `PagesElement` (data-bound), `PagesContentElement` (props-only) | charts, metrics, selectors, form inputs, badges |
| **pages-table** | `LitElement` + `RovingTabindexMixin` | pages-table |
| **pages-primitives** | `LitElement` | modal, a11y mixins |
| **pages-ui** | Vanilla `HTMLElement` | auth gates (pages-identity, pages-dev-auth) — legacy, not yet migrated |

## Lit conventions

- `@customElement('pages-<name>')` decorator for registration — or guarded
  manual registration when the component is re-exported through a barrel
  that may be evaluated twice in aliased bundler setups:
  ```ts
  if (!customElements.get('pages-<name>')) {
    customElements.define('pages-<name>', ClassName);
  }
  ```
- `@property()` for public API, `@state()` for internal state
- Immutable collection updates — replace Set/Map/Array, never mutate in
  place (see garden protocol
  [`web/lit-immutable-collections.md`](https://github.com/user/garden/docs/protocols/web/lit-immutable-collections.md))
- Composition via mixins, not inheritance chains —
  `RovingTabindexMixin(LitElement)`, not deep class hierarchies
- Template via `html` tagged literal, styles via `css` tagged literal

## Vanilla conventions (legacy — pages-ui auth only)

- `customElements.define('pages-<name>', ClassName)` at module level
- `static get observedAttributes()` for reactive attributes
- Shadow DOM attached in `connectedCallback()`
- Manual event listener cleanup in `disconnectedCallback()`

## Lit base class hierarchy

The `pages-viz` package provides abstract Lit base classes for data-bound
visualization components:

```
LitElement
  ├── PagesElement<P>           (data requests, refresh timer, resize observer, render dispatch with cache())
  │     ├── PagesChartElement<P>    (ECharts init/dispose, option pipeline, click-to-filter)
  │     └── PagesFormInput<P>       (field value extraction, change events, submit-on-Enter)
  └── PagesContentElement<P>   (simple content: props + render, no data binding)
```

`PagesElement` uses `@property({ attribute: false })` for reactive props and
delegates data state to `DataSourceController` (which stays framework-agnostic
in `pages-component`). `PagesContentElement` is genuinely one-shot — props
trigger render, no data machinery. New viz components should extend the
appropriate base class rather than raw `LitElement`.

## Sub-path exports for side-effect isolation

Packages that mix side-effect-free code (mixins, utilities) with
side-effect code (element registration) must declare an `"exports"` map
in `package.json` with separate sub-paths. This prevents consumers from
pulling in unwanted `customElements.define()` calls when they only need
a utility export.

Example (`pages-primitives`):
- `@casehubio/pages-primitives/a11y` — mixins only, no side effects
- `@casehubio/pages-primitives/modal` — registers `pages-modal`
- `@casehubio/pages-primitives` — barrel, re-exports everything

Internal consumers must import from the narrowest sub-path that
provides what they need.

## Element naming

All custom elements use `pages-` prefix regardless of approach. Tag names
are lowercase hyphenated: `pages-filter-chips`, `pages-scope-selector`,
`pages-identity`.
