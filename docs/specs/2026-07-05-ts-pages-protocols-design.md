# TypeScript/Pages Protocols — Design Spec

**Issue:** #118
**Branch:** `issue-118-ts-pages-protocols`
**Date:** 2026-07-05

## Problem

The garden protocols (`casehubio/garden/docs/protocols/casehub/`) are entirely
Java/Quarkus-focused. Pages has established conventions for CSS tokens, Web
Components, event contracts, and dataset shapes — but none are formalised as
protocols. New sessions working on pages (or repos consuming pages packages)
have no searchable reference for these conventions.

## Approach

**Approach C — grouped where coupled, split where independent.**

Four project-level protocols in `docs/protocols/casehub/` (pages repo) plus two
universal protocols in `~/.hortora/garden/docs/protocols/web/` (new namespace).

### Why project-level, not garden-level

Garden protocols are platform-wide — they apply across repos (qhorus, engine,
ras, ops). The pages conventions are repo-specific: no other repo produces CSS
tokens, defines OKLCH scales, or authors Lit components. Cross-repo consumers
(e.g., blocks-ui consuming `--pages-*` tokens) reference pages protocols
directly — same pattern qhorus uses when citing garden entries.

### Why two garden protocols

Two conventions are genuinely universal — they apply to any Lit or Web Component
project, not just CaseHub:
- Lit immutable collection pattern
- CustomEvent shadow DOM crossing (`bubbles + composed`)

These go to `~/.hortora/garden/docs/protocols/web/` — a new namespace alongside
the existing `universal/` (Java/Quarkus) and `casehub/` namespaces.

**Why `web/` and not `universal/`.** The existing `universal/` namespace is
architecturally positioned as "any Java/Quarkus project" — its INDEX describes
it that way, and every protocol in it is JVM-specific. Adding Web Component
protocols there would break that coherence. `web/` is the first
technology-specific namespace beyond JVM, establishing a precedent for
future non-Java protocol families (e.g., `kotlin/`, `infra/`). The garden
INDEX.md must be updated to reflect the three-namespace structure and
generalise the "Adding a new protocol" guidance.

## Deliverables

### Project Protocols (4 files)

All in `docs/protocols/casehub/` in the pages repo.

#### 1. `css-design-tokens.md`

**Scope:** `repo`
**Applies to:** all CSS custom property declarations and token definitions in casehub-pages
**Cross-repo consumers:** `casehubio/blocks-ui` (migrating to `--pages-*` tokens via blocks-ui#21)

Three rules in one file (tightly coupled — can't understand one without the others):

**Rule 1 — Token naming prefix.** All CSS custom properties use `--pages-` prefix,
lowercase, hyphen-separated. No camelCase, no dots. Fractional spacing keys use
hyphens: `--pages-space-0-5`, not `--pages-space-0.5`. Category is the first
segment after prefix: `--pages-{category}-{key}`.

**Rule 2 — OKLCH 12-step colour scales.** Semantic colour scales use 12 perceptual
steps (1–12). Step 1 is near-background (lightest in light mode, darkest in dark
mode). Step 12 is near-foreground. Each step has a base lightness target (e.g.,
98.5% for light-mode step 1, 18% for step 12); a contrast slider shifts all
targets uniformly. Chroma is dynamically reduced based on the **clamped lightness
value** (not step index):

| Clamped lightness | Chroma multiplier |
|-------------------|-------------------|
| > 90% or < 15% | 0.3× |
| 81%–90% or 15%–24% | 0.6× |
| 25%–80% | 1.0× |

This means the same step number can produce different chroma multipliers depending
on contrast settings and light/dark mode — the lightness value after clamping is
what matters.

Hues are semantic: `accent` (configurable), `neutral` (configurable, reduced to
15% of base chroma), `success` (145), `warning` (55), `danger` (25), `info` (210).
Format: `oklch({L}% {C} {H})`.

**Rule 3 — Token vocabulary.** Eleven categories:

| Category | Pattern | Keys |
|----------|---------|------|
| Colour | `--pages-{semantic}-{1-12}` | accent, neutral, success, warning, danger, info |
| Spacing | `--pages-space-{key}` | 0-5, 1, 1-5, 2, 3, 4, 5, 6, 8, 10, 12, 16 |
| Typography size | `--pages-font-size-{size}` | xs, sm, base, lg, xl, 2xl |
| Typography weight | `--pages-font-weight-{weight}` | normal, medium, semibold |
| Line height | `--pages-line-height-{size}` | xs, sm, base, lg, xl, 2xl |
| Motion duration | `--pages-duration-{speed}` | fast, normal, slow |
| Motion easing | `--pages-ease-{type}` | out, inOut |
| Elevation | `--pages-shadow-{1-4}` | 1–4 (light/dark variants) |
| Radius | `--pages-radius-{size}` | sm, md, lg |
| Surface | `--pages-surface-{1-4}` | 1–4 (layered translucent overlays for cards, panels, modals) |
| Font family | `--pages-font-family` | Inter/system-ui stack |

**Density variants.** The `.pages-density-compact` CSS class overrides a subset
of spacing and typography tokens with tighter values (e.g., `--pages-space-4`
drops from 16px to 12px, `--pages-font-size-base` from 14px to 13px). These
overrides are generated alongside the theme and applied via class toggle —
components do not need to be aware of the density mode.

**Violation hint:** "CSS custom property does not use `--pages-` prefix or uses
non-standard category/key naming."

#### 2. `pages-event-contract.md`

**Scope:** `repo`
**Applies to:** user/application-level inter-component event communication in casehub-pages
**Cross-repo consumers:** any hosted Web Component dispatching application events

User and application-level inter-component communication uses a single CustomEvent
name: `pages-event`. The event detail carries a `topic` string and a typed `payload`:

```typescript
interface PagesEventDetail<T = unknown> {
  readonly topic: string;
  readonly payload: T;
}
```

Events are dispatched with `bubbles: true` and `composed: true`.

**Emitter paths.** Two functions emit `pages-event`:
- `emitPagesEvent(target, topic, payload)` — the primary helper for component
  code (`@casehubio/pages-component/events`). Use this in connectedCallback,
  event handlers, and UI interactions.
- `dispatchWireEvent(msg, eventTarget)` — used internally by the push-wire data
  layer to relay WebSocket messages as `pages-event` dispatches. This exists
  because wire messages arrive as `{topic, payload}` pairs on an `EventTarget`
  with no component context.

Both construct identical `CustomEvent` structures. New code should prefer
`emitPagesEvent()`.

Topic naming: colon-separated hierarchical segments (`filter:status`,
`debate:created`). Wildcards (`*` single segment, `**` multi-segment) are
listener-side only — dispatchers never emit wildcard topics.

`onPagesEvent()` returns an unsubscribe function. Listeners are responsible for
cleanup in `disconnectedCallback()` or equivalent teardown.

**Reserved framework event names.** The runtime uses additional `pages-*`
CustomEvent names for framework-internal coordination. These are NOT part of the
`pages-event` topic namespace — they are separate CustomEvent names dispatched
by framework components and handled by the runtime event delegation layer:

| Event name | Purpose | Dispatched by |
|------------|---------|---------------|
| `pages-data-request` | Component requests dataset resolution | `PagesElement` base class (`connectedCallback`) |
| `pages-filter` | Cross-filtering between components | Chart click handlers, selector changes |
| `pages-sort` | Column sort requests | Table header interactions |
| `pages-page` | Pagination offset changes | Table pagination controls |
| `pages-text-filter` | Free-text search filter | Search input components |
| `pages-field-change` | Form field value changes | `PagesFormInput` base class |
| `pages-slot-change` | Tab/slot navigation changes | Container components |
| `pages-record-navigate` | Record prev/next navigation | Navigation controls |
| `pages-record-create` | New record creation | Form submit actions |
| `pages-record-delete` | Record deletion | Delete button actions |
| `pages-action-request` | HTTP action execution | Action buttons, form submit |
| `pages-action-complete` | Post-action dataset refresh | Action executor |
| `pages-dock-toggle` | Panel visibility toggle | Dock controls |
| `pages-split-resize` | Split panel ratio changes | Split drag handles |
| `pages-save-error` | Save operation failure | Runtime save pipeline |

Do not use these names as `pages-event` topics or as custom event names in
application code — they will collide with the framework's event delegation.

This table is a snapshot as of 2026-07-05. The authoritative source for reserved
event names is `packages/pages-runtime/src/site.ts` (search for
`addEventListener`). When adding a new framework event to the runtime, update
this protocol's reserved names table in the same commit.

**Violation hint:** "Component dispatches a CustomEvent with a name other than
`pages-event` for application-level communication, or constructs `pages-event`
without `bubbles: true` and `composed: true`, or uses a reserved framework
event name for application purposes."

#### 3. `web-component-strategy.md`

**Scope:** `repo`
**Applies to:** all Web Component authoring in casehub-pages

Two approaches, selected by component purpose:

| Approach | When | Examples |
|----------|------|---------|
| **Lit** | Interactive UI with reactive state, user input, a11y | pages-primitives, pages-ui forms |
| **Vanilla** | Simple display, auth gates, pipeline components | pages-ui auth, pages-viz bases |

**Use Lit when any apply:** reactive properties triggering re-renders, scoped CSS
needed, composition mixins used, user input beyond simple clicks.

**Use vanilla when all apply:** no Lit dependency needed, no mixin composition,
no scoped CSS via `css` tagged literals.

**Lit conventions:** `@customElement('pages-<name>')`, `@property()` for public /
`@state()` for internal, immutable collection updates (see garden protocol
`web/lit-immutable-collections.md`), composition via mixins not inheritance,
`html`/`css` tagged literals.

**Vanilla conventions:** `customElements.define()` at module level, `static get
observedAttributes()`, shadow DOM in `connectedCallback()`, manual listener
cleanup in `disconnectedCallback()`.

**Vanilla base class hierarchy.** The `pages-viz` package provides abstract base
classes for vanilla components with framework lifecycle management:

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

**Element naming:** All elements use `pages-` prefix. Tag names are lowercase
hyphenated.

**Violation hint:** "Web Component uses Lit for a static display-only widget, or
uses vanilla HTMLElement for a component with reactive state and child property
bindings."

#### 4. `dataset-contract.md`

**Scope:** `repo`
**Applies to:** all dataset definitions in casehub-pages

Every named dataset exposes a `DatasetContract<T>` declaring name, description,
and shape:

```typescript
interface DatasetContract<T = unknown> {
  readonly name: string;
  readonly description: string;
  readonly shape: T;
}
```

`shape` is a concrete example value (not a schema) — empty strings, zeros, empty
arrays. It serves as a compile-time documentation and type-safety convention:
TypeScript generics propagate the shape type through dataset references, giving
IDE auto-completion and type errors for mismatched field access. There is no
runtime introspection of the shape — no code walks it to derive columns.

**Violation hint:** "Dataset is used in YAML or event topics without a
corresponding DatasetContract export."

### Garden Protocols (2 files)

New namespace: `~/.hortora/garden/docs/protocols/web/` with its own index.

#### 5. `web/lit-immutable-collections.md`

**Scope:** `universal`
**Applies to:** any project using Lit

Reactive properties (`@state()`, `@property()`) holding mutable collections
(Set, Map, Array) must be replaced on every mutation, never mutated in place.
Lit uses strict reference equality (`===`) — `.add()`, `.delete()`, `.push()`
keep the same reference and skip re-render. `requestUpdate()` forces the calling
component but does not propagate to children.

```typescript
// Wrong
this.items.add(value);
this.requestUpdate();

// Right
this.items = new Set([...this.items, value]);
```

Garden entry will be created during implementation if the pattern warrants a
standalone entry beyond the protocol itself.

#### 6. `web/custom-event-shadow-dom.md`

**Scope:** `universal`
**Applies to:** any project using Web Components with shadow DOM

CustomEvents crossing shadow DOM boundaries require both `bubbles: true` and
`composed: true`. `bubbles` alone stops at the shadow root. `composed` alone
doesn't propagate up the DOM tree.

Set `composed: true` when the event is part of the component's public API.
Omit when the event coordinates internal sub-elements only.

## File Changes

### New files
- `docs/protocols/casehub/css-design-tokens.md`
- `docs/protocols/casehub/pages-event-contract.md`
- `docs/protocols/casehub/web-component-strategy.md`
- `docs/protocols/casehub/dataset-contract.md`
- `~/.hortora/garden/docs/protocols/web/INDEX.md`
- `~/.hortora/garden/docs/protocols/web/lit-immutable-collections.md`
- `~/.hortora/garden/docs/protocols/web/custom-event-shadow-dom.md`

### Updated files
- `docs/protocols/INDEX.md` — add 4 new entries
- `docs/protocols/casehub/INDEX.md` — add 4 new entries
- `~/.hortora/garden/docs/protocols/INDEX.md` — add `web/` namespace row, update "two subfolders" framing, generalise "Adding a new protocol" guidance
- `~/.hortora/garden/docs/protocols/casehub/FOUNDATION-INDEX.md` — add cross-reference to `web/` namespace

## Protocol File Format

Each protocol file uses the standard format with YAML frontmatter:

```yaml
---
id: PP-YYYYMMDD-xxxxxx
title: "<rule summary>"
type: rule
scope: repo | universal
applies_to: "<what this governs>"
cross_repo_consumers: []          # optional — repos that must follow this protocol
severity: important
refs: []
violation_hint: "<one-line description of what a violation looks like>"
created: 2026-07-05
---
```

The `cross_repo_consumers` field is optional. Use it when a `scope: repo`
protocol governs conventions that external repos must also follow when consuming
this repo's outputs (e.g., token naming, event contracts).

Garden protocols use slug IDs (e.g., `lit-immutable-collections`) matching the
existing convention (`api-interface-taxonomy`, `routing-strategy-convention`).
Project protocols use `PP-YYYYMMDD-xxxxxx` IDs.

## Out of Scope

- Updating PLATFORM.md (tracked separately as parent#349)
- Publishing npm packages (#121)
- Creating protocols for iframe component API conventions (#122, future work if patterns emerge)
- Fixing CLAUDE.md `@casehub/` → `@casehubio/` package scope (#123)
