# Workbench Primitives — Layout, Lifecycle, and Communication

**Epic:** #64  
**Sub-issues:** #65 (dockable panels), #66 (split layout), #67 (topbar/statusbar), #68 (panel lifecycle), #69 (inter-panel communication)  
**Date:** 2026-06-30

## Context

CaseHub host apps (DraftHouse, Claudony, DevTown) need casehub-pages to evolve from a dashboard/data-page framework into a workbench framework. Each app composes a workspace shell from reusable panels — diff viewers, debate feeds, review trackers, context gauges — arranged in configurable layouts with shared event communication.

Today each app hand-codes its shell. DraftHouse's `panel-registry.js` explicitly states: "First draft of what `@casehub/ui`'s component type registry will be." The migration plan: panels stay unchanged, the hand-coded shell is replaced by pages layout primitives. Dependency swap, not rewrite.

## Architectural Approach

**Composable primitives** — three new component types, each with a single responsibility. All are recursive: any can nest inside any other, and inside existing layout types (`grid`, `columns`, `rows`, `tabs`, etc.). The component tree is already recursive; these are new types in the same model.

No `shell`/`topbar`/`statusbar` component types needed — these compose from existing `rows`, `columns`, `grid`, `panel`. The frame is just layout.

**casehub-pages remains Foundation tier.** No casehub upstream dependencies. Zero build-time coupling. Runtime-only consumption via iframe embedding. These primitives add workbench capabilities without changing the tier or dependency posture.

## New Component Types

### 1. `split` — Resizable Layout

A `columns` or `rows` layout with draggable resize handles between children. Not a new layout engine — decoration on the existing grid/flex infrastructure.

**DSL:**

```typescript
split(direction: "horizontal" | "vertical",
  children: Component[],
  options?: {
    ratio?: number[];
    minSizes?: number[];
  }
): Component<"split">
```

**Examples:**

```typescript
// Two-panel horizontal split (DraftHouse: diff left, debate right)
split("horizontal", [
  hostPanel("diff-viewer", { pathA, pathB }),
  hostPanel("debate-feed", { sessionId }),
], { ratio: [60, 40] })

// Nested splits
split("horizontal", [
  hostPanel("diff-viewer"),
  split("vertical", [
    hostPanel("debate-feed"),
    hostPanel("review-tracker"),
  ], { ratio: [60, 40] }),
], { ratio: [60, 40] })
```

**Implementation:**

- `split("horizontal", ...)` produces a Component with type `"split"`, props `{ direction: "horizontal", ratio, minSizes }`
- Layout CSS: `display: flex` with `flex-direction: row` (horizontal) or `flex-direction: column` (vertical). Each child gets `flex: <ratio>`. **Deliberately uses flex, not CSS Grid** — when a dock toggle hides a child (`display: none`), flex automatically redistributes space to siblings. CSS Grid with `fr` tracks does not collapse hidden children's tracks, which would leave dead space.
- `wireInteractivity()` gains a `case "split":` that inserts drag handle elements between children and attaches `mousedown`/`mousemove`/`mouseup` handlers
- Drag adjusts the `flex` values of the two adjacent children
- `minSizes` enforced during drag — handle stops at the constraint
- When a child is hidden (dock toggle), its adjacent drag handle is also hidden

**Resize constraint:** resize handles work on 1D layouts only — children along a single axis. The 2D `grid` (x/y placement) does not support resize handles because resizing a track affects all items in that track. This is an inherent geometric constraint, not a limitation.

**Children:** any Component type — `hostPanel`, `tabs`, `grid`, another `split`, a `dockBar`, whatever the tree contains.

### 2. `dockBar` — Toggle Strip

An icon strip along an edge that toggles visibility of referenced components by ID. The dock bar is always visible. The target panels show/hide.

**DSL:**

```typescript
dockBar(position: "left" | "right" | "bottom",
  items: DockItem[],
): Component<"dock-bar">

interface DockItem {
  icon: string;
  label: string;
  panelId: string;
  defaultOpen?: boolean;
}
```

**Example:**

```typescript
dockBar("right", [
  { icon: "💬", label: "Debate", panelId: "debate", defaultOpen: true },
  { icon: "📋", label: "Review", panelId: "review", defaultOpen: true },
])
```

**How the toggle works:**

1. User clicks a dock icon
2. Dock bar dispatches `pages-dock-toggle` custom event (bubbles, composed): `{ panelId, visible }`
3. Runtime catches this at the root (same delegation pattern as `pages-filter`)
4. Runtime finds the element with `data-component-id === panelId`
5. Sets `display: none` (hide) or restores original display (show)
6. Hides/shows the adjacent drag handle in the parent split
7. The hidden child's space is absorbed by siblings — flex layout redistributes automatically (this is why split uses flex, not CSS Grid)

**Rendering:**

- `"left"` / `"right"`: vertical strip of icon buttons, thin column
- `"bottom"`: horizontal strip below content
- Active icons are visually highlighted (same `data-active` pattern as tabs/sidebar)
- Supports IntelliJ-style top/bottom icon grouping via nested structure in items

**State persistence:**

Dock open/closed state persists in the URL hash alongside existing filter and pagination state:

```
#dock=debate:open,review:closed&filter=region:North
```

### 3. `hostPanel` — External Web Component Host

Mounts a registered custom Web Component inside the pages component tree.

**Registration API:**

```typescript
registerPanel(typeName: string, tagName: string): void
```

Called once at app init, before `loadSite()`. Stores a `Map<string, string>` — type name to custom element tag.

**DSL:**

```typescript
hostPanel(typeName: string, props?: Record<string, unknown>): Component<"host-panel">
```

**Mount sequence:**

1. `renderComponent()` creates a container `<div data-component-type="host-panel">`
2. `onNode` activation callback fires (after `appendChild`)
3. Looks up the registered tag name from the type registry
4. Creates the Web Component: `document.createElement(tagName)`
5. Calls `panel.configure(props)` if the method exists — **before** appending to DOM
6. Appends the Web Component to the container div — `connectedCallback()` fires here

**Critical ordering** (garden entry GE-20260617-0b0dba): `configure()` is called BEFORE `appendChild()`. This ensures event listeners can be registered during `configure()` before `connectedCallback()` fires. DraftHouse panels already follow this pattern.

**Reconfiguration:** calling `configure(newProps)` again on an already-mounted panel. No unmount/remount.

**Unmount:** container div removed from DOM → `disconnectedCallback()` fires automatically → panel cleans up internally (close watchers, disconnect observers, unsubscribe).

**The `configure()` contract:**

```typescript
interface ConfigurablePanel extends HTMLElement {
  configure(props: Record<string, unknown>): void;
}
```

Duck-typed, not a required interface. Panels without `configure()` still mount — they just don't receive props. They can use `connectedCallback`, attributes, or their own initialization.

**Bundling** (garden entries GE-20260623-06914b, GE-20260629-ebdb0a): external Web Components must use value exports (not `import type`) and their packages must declare `"sideEffects": true` to prevent tree-shaking from dropping `customElements.define()` calls.

## Event Bus — Unified Data Pipeline Extension

Inter-panel communication uses the existing data pipeline, not a parallel system.

### Panel-to-Panel: `pages-event` Custom DOM Event

A new DOM custom event type for arbitrary inter-panel messages:

```typescript
// Panel dispatching
this.dispatchEvent(new CustomEvent("pages-event", {
  bubbles: true,
  composed: true,
  detail: { topic: "selection-changed", payload: { location: "line:42" } },
}));

// Panel listening
this.getRootNode().addEventListener("pages-event", (e: CustomEvent) => {
  if (e.detail.topic === "selection-changed") {
    this.scrollToLocation(e.detail.payload.location);
  }
});
```

Same mechanism as `pages-filter` — DOM events, bubbling, composed through Shadow DOM. The runtime can intercept at the root for logging or routing.

### External Sources: Unified Operation Vocabulary

The existing `WebSocketSource` handles dataset mutations with operations `append`, `replace`, `remove`. One new operation extends this to events:

```json
// Dataset mutation (existing)
{ "op": "append", "dataset": "metrics", "rows": [...] }

// Panel event (new)
{ "op": "event", "topic": "selection-changed", "payload": { "location": "line:42" } }
```

One connection. One source lifecycle. The `op` field routes:

| Operation | Route | Target |
|-----------|-------|--------|
| `append` / `replace` / `remove` | Dataset mutation | Bound charts, tables, metrics |
| `event` | `pages-event` dispatch | Any listening panel |

When SSE support is added, it uses the same operation vocabulary — a new source type, same message format.

This unification is architecturally novel. Grafana has separate systems for its EventBus (cross-panel UI events) and Grafana Live (real-time data push). Our design routes both through one pipeline.

### DraftHouse Migration

| Current DraftHouse pattern | Pages equivalent |
|---|---|
| `debateEventBus.subscribe({onEntries, onMeta})` | Panel listens for `pages-event` with relevant topics |
| `document.addEventListener('diff-updated', ...)` | `pages-event` with `topic: "diff-updated"` |
| `diffPanel.scrollToLocation(loc)` | Panel listens for `pages-event` topic, or host app calls method directly |
| Shared `EventSource` (SSE) | `WebSocketSource` with `event` ops (or future SSE source) |

## Package Placement

No new packages. All additions go into existing packages following the current separation:

| Addition | Package | Rationale |
|----------|---------|-----------|
| `split` layout CSS + type guards | `pages-component` | Layout rendering lives here |
| `split` resize interactivity | `pages-component` | `wireInteractivity()` lives here |
| `dockBar` rendering + interactivity | `pages-component` | Same — it's a new interactive container |
| `hostPanel` type + type guards | `pages-component` | Component model lives here |
| `hostPanel` activation (mount/configure) | `pages-runtime` | Activation callbacks are runtime |
| `registerPanel()` API | `pages-runtime` | Runtime API surface |
| `pages-event` handling | `pages-runtime` | Event delegation lives here |
| `event` op routing on WebSocketSource | `pages-data` | Source infrastructure lives here |
| `split`, `dockBar`, `hostPanel` DSL builders | `pages-ui` | All DSL builders live here |
| `split`, `dockBar`, `hostPanel` YAML desugaring | `pages-ui` | YAML parsing lives here |

## Existing `app-grid` Disposition

The `app-grid` component type currently defines `grid-template-areas: "header header" "nav main" "footer footer"`. Its `AppGridProps` is empty (`Record<string, never>`). It has no consumer usage.

`app-grid` is subsumed by the new primitives. A workbench frame is expressed as:

```typescript
rows(
  panel("App", topbarContent()),      // topbar
  split("horizontal", [...]),          // main workspace
  html("<div>Status</div>"),           // statusbar
)
```

Remove `app-grid` from `LAYOUT_TYPES`, `applyLayoutCSS`, `wireInteractivity`, type guards, and DSL builders. It was a placeholder for this work.

## Full Example — DraftHouse Workbench

```typescript
import { rows, columns, panel, split, dockBar, hostPanel, withId } from "@casehubio/ui";
import { registerPanel, loadSite } from "@casehubio/pages-runtime";

// 1. Register external Web Components
registerPanel("diff-viewer", "drafthouse-diff");
registerPanel("debate-feed", "drafthouse-debate");
registerPanel("review-tracker", "drafthouse-review-tracker");
registerPanel("context-gauge", "drafthouse-context-gauge");

// 2. Build the workbench as a component tree
const workbench = rows(
  // Topbar — existing layout primitives + hostPanel
  columns([1, 1, 1, 1, 2],
    ["sync", syncBtn()],
    ["mode", viewModeBtn()],
    ["nav", prevNextBtns()],
    ["gauge", hostPanel("context-gauge")],
    ["spacer", html("")],
  ),

  // Main content — new primitives
  columns([0, 1],
    ["dock", dockBar("right", [
      { icon: "💬", label: "Debate", panelId: "debate", defaultOpen: true },
      { icon: "📋", label: "Review", panelId: "review", defaultOpen: true },
    ])],
    ["workspace", split("horizontal", [
      hostPanel("diff-viewer", { pathA: "doc-a.md", pathB: "doc-b.md" }),
      split("vertical", [
        withId("debate", hostPanel("debate-feed", { sessionId: "abc" })),
        withId("review", hostPanel("review-tracker", { sessionId: "abc" })),
      ], { ratio: [60, 40] }),
    ], { ratio: [60, 40] })],
  ),

  // Statusbar
  html("<div class='statusbar'>Connected</div>"),
);

// 3. Render
const site = await loadSite(document.getElementById("app")!, workbench);
```

## Testing Strategy

### Unit Tests (Vitest)

- **Split rendering:** verify CSS grid/flex output matches direction, drag handle elements inserted between children
- **Split resize:** simulate mousedown/mousemove/mouseup, verify proportions change, min-size enforced
- **DockBar rendering:** verify icon buttons rendered with correct labels, data-active state
- **DockBar toggle:** simulate click, verify `pages-dock-toggle` event dispatched with correct panelId
- **Dock toggle integration:** verify target element `display` toggled, split siblings absorb space
- **HostPanel mount:** verify `document.createElement` called with registered tag, `configure()` called before `appendChild`
- **HostPanel reconfigure:** verify `configure()` called again with new props, no unmount/remount
- **HostPanel unmount:** verify DOM removal triggers `disconnectedCallback`
- **`pages-event` dispatch/listen:** verify event bubbles through Shadow DOM, topic filtering works
- **`event` op routing:** verify WebSocketSource dispatches `pages-event` for `event` ops, dataset mutation for `append`/`replace`/`remove`
- **URL state:** verify dock open/closed state serialized to URL hash, restored on load

### Integration Tests

- **Full workbench render:** `loadSite()` with a component tree using all new primitives, verify DOM structure
- **DockBar ↔ split:** toggle a dock, verify split child hides, space redistributes
- **HostPanel lifecycle:** mount, configure, reconfigure, unmount — full sequence
- **Event round-trip:** panel A dispatches `pages-event`, panel B receives it through the DOM tree
- **WebSocket event routing:** mock WebSocket sends `event` op, verify `pages-event` dispatched on correct element

### Garden Gotcha Coverage

- GE-20260617-0b0dba: test that `configure()` is called BEFORE `appendChild()` (ordering constraint)
- GE-20260617-cc0834: test keyboard event target walking through Shadow DOM for hosted panels
- GE-20260623-06914b / GE-20260629-ebdb0a: verify hosted Web Components register correctly with bundler config

## Design Constraints Verified

- **Foundation tier:** no casehub upstream dependencies introduced
- **Quinoa/esbuild compatible:** standard Web Components, no framework-specific runtime
- **Panels are custom Web Components:** `hostPanel` hosts them, doesn't replace them
- **Docking is preconfigured:** declared in component tree, not user-draggable (drag-and-drop is a separate future epic)
- **Cross-app reusable:** DraftHouse, Claudony, DevTown, and future apps can use the same primitives
- **Platform coherence:** casehub-pages capability ownership entry in PLATFORM.md unchanged — still "YAML dashboard rendering (pages framework)"

## Out of Scope

Items deferred from this epic, captured as GitHub issues:

- **#74** — SSE source type: same operation vocabulary as WebSocket, separate transport
- **#75** — Drag-and-drop panel rearrangement: user-draggable docking (separate future epic per #64 constraints)
- **#76** — Workbench layout serialization: save/restore full layout to JSON (beyond URL state)
- **#77** — Floating/popout panels: detach panels into separate browser windows
- **Topbar/statusbar as first-class types** — compose from existing `rows`/`columns`/`panel`; may be promoted to named types if usage patterns warrant it (no issue needed — organic evolution)
