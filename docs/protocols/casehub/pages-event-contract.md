---
id: PP-20260705-bac842
title: "Inter-component events use single pages-event CustomEvent with topic/payload detail"
type: rule
scope: repo
applies_to: "user/application-level inter-component event communication in casehub-pages"
cross_repo_consumers: []
severity: important
refs: []
violation_hint: "Component dispatches a CustomEvent with a name other than pages-event for application-level communication, or constructs pages-event without bubbles:true and composed:true, or uses a reserved framework event name for application purposes"
created: 2026-07-05
---

User and application-level inter-component communication uses a single
CustomEvent name: `pages-event`. The event detail carries a `topic` string
and a typed `payload`:

```typescript
interface PagesEventDetail<T = unknown> {
  readonly topic: string;
  readonly payload: T;
}
```

Events are dispatched with `bubbles: true` and `composed: true`.

## Emitter paths

Two functions emit `pages-event`:

- `emitPagesEvent(target, topic, payload)` — the primary helper for component
  code (`@casehubio/pages-component/events`). Use this in connectedCallback,
  event handlers, and UI interactions.
- `dispatchWireEvent(msg, eventTarget)` — used internally by the push-wire data
  layer to relay WebSocket messages as `pages-event` dispatches. This exists
  because wire messages arrive as `{topic, payload}` pairs on an `EventTarget`
  with no component context.

Both construct identical `CustomEvent` structures. New code should prefer
`emitPagesEvent()`.

## Topic naming

Colon-separated hierarchical segments (`filter:status`, `debate:created`).
Wildcards (`*` single segment, `**` multi-segment) are listener-side only —
dispatchers never emit wildcard topics.

## Listener pattern

`onPagesEvent()` returns an unsubscribe function. Listeners are responsible
for cleanup in `disconnectedCallback()` or equivalent teardown.

## Reserved framework event names

The runtime uses additional `pages-*` CustomEvent names for framework-internal
coordination. These are NOT part of the `pages-event` topic namespace — they
are separate CustomEvent names dispatched by framework components and handled
by the runtime event delegation layer:

| Event name | Purpose | Dispatched by |
|------------|---------|---------------|
| `pages-data-request` | Component requests dataset resolution | `PagesElement` base class (`connectedCallback`) and runtime activation layer (host panel data binding) |
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
| `pages-modal-close` | Modal closed (with returnValue) | `PagesModal` component |
| `pages-modal-cancel` | Modal close requested (cancelable) | `PagesModal` component |

Do not use these names as `pages-event` topics or as custom event names in
application code — they will collide with the framework's event delegation.

This table is a snapshot as of 2026-07-05. The authoritative source for
reserved event names is `packages/pages-runtime/src/site.ts` (search for
`addEventListener`). When adding a new framework event to the runtime, update
this protocol's reserved names table in the same commit.
