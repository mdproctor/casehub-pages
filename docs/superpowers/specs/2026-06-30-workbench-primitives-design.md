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
- **Slot model:** single `"default"` slot (same as `rows`), not per-child named slots. Children are addressed by `data-component-id` (for dock toggles) and by DOM position (for drag handle placement). Named slots are unnecessary — dock toggles target by component ID (`withId("debate", ...)`), not slot name.
- **`LAYOUT_TYPES` membership:** `split` is added to `LAYOUT_TYPES`, triggering `applyLayoutCSS` for container styles.
- **Layout CSS** (`applyLayoutCSS`): sets `display: flex` with `flex-direction: row` (horizontal) or `flex-direction: column` (vertical) on the container element. Does NOT set child flex values — `applyLayoutCSS` only styles the container (existing contract preserved).
- **Flex ratio application** (`wireInteractivity`): the new `case "split":` handler applies `flex: <ratio>` to each child element AFTER children are rendered. This matches the existing pattern where `wireInteractivity` operates on child elements (e.g., `applyOneVisible` sets `display` on children). `wireInteractivity` also inserts drag handle elements between children and attaches `mousedown`/`mousemove`/`mouseup` handlers.
- **Deliberately uses flex, not CSS Grid** — when a dock toggle hides a child (`display: none`), flex automatically redistributes space to siblings. CSS Grid with `fr` tracks does not collapse hidden children's tracks, which would leave dead space.
- Drag adjusts the `flex` values of the two adjacent children
- `minSizes` enforced during drag — handle stops at the constraint
- When a child is hidden (dock toggle), its adjacent drag handle is also hidden

**Resize constraint:** resize handles work on 1D layouts only — children along a single axis. The 2D `grid` (x/y placement) does not support resize handles because resizing a track affects all items in that track. This is an inherent geometric constraint, not a limitation.

**When to use `split` vs `columns`/`rows`:**

| Criterion | `columns` | `rows` | `split` |
|-----------|-----------|--------|---------|
| CSS model | CSS Grid (`fr` tracks) | Flex (`column`) | Flex (`row` or `column`) |
| Resizable | No | No | Yes (drag handles) |
| Hidden child behavior | Dead grid track (gap remains) | Space collapses | Space redistributes |
| Use when | Static multi-column layout, no toggling | Static vertical stack | Resizable panes, dock-toggled children |

The CSS model difference is intentional and load-bearing: CSS Grid `fr` tracks do not collapse when children are hidden (`display: none`), leaving dead space. Flex layout automatically redistributes. If a layout contains children that may be dock-toggled, use `split`. If children are always visible, `columns`/`rows` are appropriate — `columns` for fixed-ratio horizontal layouts, `rows` for vertical stacking.

`split` does NOT replace `columns`/`rows` — it serves a different purpose. Adding a `resizable` flag to `columns` would require switching its CSS model from Grid to Flex conditionally, making the behavior of a single type context-dependent. Separate types with clear CSS semantics are preferable.

**Children:** any Component type — `hostPanel`, `tabs`, `grid`, another `split`, a `dockBar`, whatever the tree contains.

### 2. `dockBar` — Toggle Strip

An icon strip along an edge that toggles visibility of referenced components by ID. The dock bar is always visible. The target panels show/hide.

**DSL:**

```typescript
dockBar(orientation: "vertical" | "horizontal",
  items: DockItem[],
): Component<"dock-bar">

interface DockItem {
  icon: string;
  label: string;
  panelId: string;
  defaultOpen?: boolean;
}
```

`orientation` controls rendering style (vertical icon strip vs horizontal strip), not layout position. WHERE the dock bar appears is determined by its position in the component tree (which column/row you place it in). This avoids the confusion of `position: "right"` placed in a left column.

**Example:**

```typescript
dockBar("vertical", [
  { icon: "💬", label: "Debate", panelId: "debate", defaultOpen: true },
  { icon: "📋", label: "Review", panelId: "review", defaultOpen: true },
])
```

**How the toggle works:**

1. User clicks a dock icon
2. Dock bar dispatches `pages-dock-toggle` custom event (bubbles, composed): `{ panelId, visible }`
3. Runtime catches this at the target container (same delegation pattern as `pages-filter`)
4. Runtime updates its in-memory dock state (`Map<string, boolean>` — panelId → visible)
5. Runtime finds the element with `data-component-id === panelId` **within the target container** (scoped query, not global document)
6. Sets `display: none` (hide) or restores original display (show)
7. **Parent-split lookup:** from the found element, walks UP the DOM to the nearest ancestor with `data-component-type="split"`. Within that split container, finds the drag handle adjacent to the hidden child (drag handles are inserted between children by `wireInteractivity`). Toggles the drag handle's visibility to match. Note: the dock bar and its target panels are typically in different branches of the component tree (dock bar in one column, targets in a sibling split), but the scoped query in step 5 finds the target regardless of tree branch.
8. **Split collapse:** after hiding the child, check if ALL children of the parent split are now hidden. If so, hide the split container itself (`display: none`). This cascades naturally — if the collapsed split was inside another split, that parent split re-checks its own children. When a child is later shown, restore the split container's display first, then the child's. This ensures closing all side panels gives maximum space to sibling content rather than leaving an empty gap.
9. The hidden child's space is absorbed by siblings — flex layout redistributes automatically (this is why split uses flex, not CSS Grid)
10. Runtime syncs dock state to URL (via the `dock` parameter in the existing hash format)

**State management:** The runtime owns dock toggle state in memory, not just in the DOM. This survives re-renders: after any `renderComponent()` call, the runtime replays its dock state map to re-hide toggled-off panels. The dock state map is initialized from the URL on load (matching the `filter` and `sort` restore pattern).

**Why not `buildSwap`/`slotSwapRegistry`:** Those patterns manage one-at-a-time visibility (only one slot active). Dock toggles are independent — multiple panels can be visible simultaneously. The swap pattern doesn't fit this use case.

**Rendering pipeline:**

DockBar is a leaf component — it has no child components, no slots, and no GridItems. Its `DockItem[]` is a prop, not a `Component.items` field. In the `renderNode` pipeline, dockBar reaches neither the `items` branch (GridItem[]) nor the `slots` branch (Record<string, Component[]>). Therefore, dockBar renders through the `onNode` activation callback — the same path as `hostPanel`, `title`, `html`, `markdown`, and data components (`bar-chart`, `table`, etc.).

The activation callback (`activation.ts`) gains a `component.type === "dock-bar"` case that:
1. Reads `component.props.items` (DockItem[])
2. Creates icon buttons inside the container div
3. Attaches click handlers that dispatch `pages-dock-toggle`
4. Sets initial `data-active` state from `defaultOpen` props

**Rendering style:**

- `"vertical"`: vertical strip of icon buttons, thin column (for left/right edge placement)
- `"horizontal"`: horizontal strip below content (for bottom edge placement)
- Active icons are visually highlighted (same `data-active` pattern as tabs/sidebar)
- Supports IntelliJ-style top/bottom icon grouping via nested structure in items

**State persistence:**

Dock open/closed state persists as a new `dock` parameter within the existing URL hash format (`url.ts`), alongside `filter`, `sort`, `page`, and `tf`:

```
#/page/{path}?filter=region:North&dock=debate:open,review:closed
```

`serializeToUrl` and `parseFromUrl` gain a `dock` parameter. Format: comma-separated `panelId:state` pairs (same key:value encoding as other parameters). `DeepLink` gains an optional `dock?: Record<string, "open" | "closed">` field.

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
4. **If lookup fails** (type name not registered): render a visible error placeholder in the container — `el.textContent = "Unknown panel type: <typeName>"` and `console.warn(...)`. Fail-soft: the rest of the component tree continues rendering. Same pattern as `lazy-page` failure handling in `activation.ts`.
5. Creates the Web Component: `document.createElement(tagName)`
6. Calls `panel.configure(props)` if the method exists — **before** appending to DOM
7. Appends the Web Component to the container div — `connectedCallback()` fires here

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
// Panel dispatching — from any panel (Shadow DOM or light DOM)
this.dispatchEvent(new CustomEvent("pages-event", {
  bubbles: true,
  composed: true,
  detail: { topic: "selection-changed", payload: { location: "line:42" } },
}));

// Panel listening — always on document, never on this.getRootNode()
document.addEventListener("pages-event", (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (detail.topic === "selection-changed") {
    this.scrollToLocation(detail.payload.location);
  }
});
```

Same dispatch mechanism as `pages-filter` — DOM events with `bubbles: true, composed: true`.

**Why `document`, not `this.getRootNode()`:** Events dispatched by sibling panels bubble UP through the light DOM tree to the document. They do NOT enter another panel's ShadowRoot. `this.getRootNode()` returns the panel's own ShadowRoot when Shadow DOM is in use — that ShadowRoot never receives sibling events. Since `hostPanel` hosts external Web Components that may or may not use Shadow DOM, the listening pattern must work for both. `document.addEventListener` is the universal listener. This matches DraftHouse's current pattern (`document.addEventListener('diff-updated', ...)`).

**Runtime interception:** The runtime also listens for `pages-event` on its target container (same delegation pattern as `pages-filter`, `pages-sort`, etc.), enabling logging, routing, and future middleware.

**Topic naming:** Topic collision prevention is the host app's responsibility. Each host app (DraftHouse, Claudony, DevTown) runs in its own page context — panels from different apps are not mixed in the same document. Within a single app, all panels are authored by the same team, so naming coordination is natural. Recommended convention: prefix topics with the app name (`"drafthouse:selection-changed"`, `"claudony:model-updated"`). The framework does not enforce this — no namespace registry, no validation. Enforcing namespaces at the framework level would add complexity without solving a real problem, since the collision scenario (two independent apps' panels in one document) is not a supported deployment pattern.

### External Sources: Unified Operation Vocabulary

The existing `WebSocketSource` handles dataset mutations with operations `snapshot`, `append`, `replace`, `remove`. One new operation extends this to events.

**Wire protocol migration:** The current `WireMessage` interface uses a `type` field (`websocket-source.ts:23-31`). This spec migrates to an `op` field. Rationale: `type` is overloaded — TypeScript discriminated unions use `type` for variant tags, the `DataSetEvent` model uses `type` for mutation kinds, and the wire protocol uses `type` for operation routing. Three `type` fields at different layers creates confusion. `op` (operation) disambiguates the wire protocol layer. The migration is mechanical: rename `type` to `op` in `WireMessage`, `processMessage`, and subscription messages.

```json
// Dataset mutation (current: type → migrated: op)
{ "op": "append", "dataset": "metrics", "rows": [...] }

// Panel event (new)
{ "op": "event", "topic": "selection-changed", "payload": { "location": "line:42" } }
```

One connection. One source lifecycle. The `op` field routes:

| Operation | Route | Target |
|-----------|-------|--------|
| `snapshot` / `append` / `replace` / `remove` | Dataset mutation | Bound charts, tables, metrics |
| `event` | `pages-event` dispatch | Any listening panel |

**Routing precedence for `event` ops:** The current `processMessage()` routes messages by `dataset` field first — messages without a `dataset` field are silently dropped when multiple subscriptions exist. The `event` op has no `dataset` field (it's inter-panel, not dataset-bound). Implementation: `processMessage` must check `op === "event"` BEFORE the dataset lookup and handle it by dispatching a `pages-event` DOM event on the target container. `event` ops bypass the subscription model entirely.

When SSE support is added, it uses the same operation vocabulary — a new source type, same message format.

This unification is architecturally novel. Grafana has separate systems for its EventBus (cross-panel UI events) and Grafana Live (real-time data push). Our design routes both through one pipeline.

### DraftHouse Migration

| Current DraftHouse pattern | Pages equivalent |
|---|---|
| `debateEventBus.subscribe({onEntries, onMeta})` | Panel listens for `pages-event` with relevant topics |
| `document.addEventListener('diff-updated', ...)` | `document.addEventListener("pages-event", ...)` with `topic: "diff-updated"` |
| `diffPanel.scrollToLocation(loc)` | Panel listens for `pages-event` topic, or host app calls method directly |
| Shared `EventSource` (SSE) | `WebSocketSource` with `event` ops (or future SSE source) |

## Package Placement

No new packages. All additions go into existing packages following the current separation:

| Addition | Package | Rationale |
|----------|---------|-----------|
| `split` layout CSS + type guards | `pages-component` | Layout rendering lives here |
| `split` resize interactivity | `pages-component` | `wireInteractivity()` lives here |
| `dockBar` type + type guards | `pages-component` | Component model lives here |
| `dockBar` activation (render icons + event dispatch) | `pages-runtime` | Activation callbacks are runtime — same path as `hostPanel`, `title`, data components |
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
    [syncBtn()],
    [viewModeBtn()],
    [prevNextBtns()],
    [hostPanel("context-gauge")],
    [html("")],
  ),

  // Main content — new primitives
  columns([0, 1],
    [dockBar("vertical", [
      { icon: "💬", label: "Debate", panelId: "debate", defaultOpen: true },
      { icon: "📋", label: "Review", panelId: "review", defaultOpen: true },
    ])],
    [split("horizontal", [
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
- **Split collapse:** verify split container hides when all children hidden, restores when any child shown, cascades to parent splits
- **HostPanel mount:** verify `document.createElement` called with registered tag, `configure()` called before `appendChild`
- **HostPanel reconfigure:** verify `configure()` called again with new props, no unmount/remount
- **HostPanel unmount:** verify DOM removal triggers `disconnectedCallback`
- **`pages-event` dispatch/listen:** verify event reaches `document` from both Shadow DOM and light DOM panels, topic filtering works
- **`event` op routing:** verify WebSocketSource dispatches `pages-event` for `event` ops (bypassing dataset routing), dataset mutation for `snapshot`/`append`/`replace`/`remove`
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

## After Implementation

Update ARC42STORIES.MD — all sections below were reverted to describe only implemented features. Re-add once the workbench primitives land:

- **§1 Description** — add "hosted Web Components, and inter-component communication"; add "split layouts, dock bars" to `pages-component`; add "panel hosting" to `pages-runtime`
- **§1 Stakeholders** — re-add "`hostPanel()` for custom components" to Application developers row
- **§3 Context diagram** — re-add `pages-event` to event list; re-add `hostPanel() ──► custom Web Components` line
- **§3 Boundary** — re-add "panel hosting" to boundary description
- **§4 Data Flow** — re-add `+ hostPanel()` line and `pages-event` to events line; re-add "Unified Data + Event Bus" subsection with `op` field routing
- **§5 Building Block View** — re-add "split, dock bar" to `pages-component`; re-add "panel hosting (`registerPanel`, `hostPanel`)" to `pages-runtime`
- **§6 Runtime View** — re-add `pages-event` to event listener list (step 3); re-add `hostPanel` mount step (step 5)
- **§10 Decisions** — re-add `pages-event` to custom events decision; re-add "Unified data + event bus" decision row
- **§13 Glossary** — re-add `hostPanel` and `pages-event` entries
- **Update PLATFORM.md** — casehub-pages capability ownership entry per #78

## Design Constraints Verified

- **Foundation tier:** no casehub upstream dependencies introduced
- **Quinoa/esbuild compatible:** standard Web Components, no framework-specific runtime
- **Panels are custom Web Components:** `hostPanel` hosts them, doesn't replace them
- **Docking is preconfigured:** declared in component tree, not user-draggable (drag-and-drop is a separate future epic)
- **Cross-app reusable:** DraftHouse, Claudony, DevTown, and future apps can use the same primitives
- **Platform coherence:** casehub-pages capability ownership entry in PLATFORM.md to be updated per #78 — from "YAML dashboard rendering" to reflect full framework scope

## Out of Scope

Items deferred from this epic, captured as GitHub issues:

- **#74** — SSE source type: same operation vocabulary as WebSocket, separate transport
- **#75** — Drag-and-drop panel rearrangement: user-draggable docking (separate future epic per #64 constraints)
- **#76** — Workbench layout serialization: save/restore full layout to JSON (beyond URL state)
- **#77** — Floating/popout panels: detach panels into separate browser windows
- **Topbar/statusbar as first-class types** — compose from existing `rows`/`columns`/`panel`; may be promoted to named types if usage patterns warrant it (no issue needed — organic evolution)
