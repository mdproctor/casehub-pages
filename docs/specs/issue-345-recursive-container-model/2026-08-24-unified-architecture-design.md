# Unified Container Architecture — Design Spec

**Date:** 2026-08-24
**Issue:** #345
**Scope:** Backend decomposition, split brain elimination, code unification, typed content identity
**Depends on:** 2026-08-23-recursive-container-model-design.md (D1-D7 feature decisions)

## Overview

The recursive container model (D1-D7) defines *what* the container tree looks like. This spec defines *how* the code is structured to manage that tree cleanly. The current `group-organiser-backend.ts` is a 1355-line god closure mixing 6 concerns. Workspace mode transitions destroy and recreate containers, causing state divergence. Frame rendering code is duplicated between backend and shared modules.

This spec decomposes the backend into focused modules, eliminates all serialize/recreate patterns in favour of surgical replanting, and unifies all duplicated code paths.

### Invariants

1. **Single source of truth** — each piece of state has exactly one owner. No parallel copies.
2. **Live tree permanence** — the container tree is never destroyed and recreated. Containers are unmounted and remounted (replanted), never serialized and cloned.
3. **Surgical replant** — when a container moves in the tree, only the affected subtree is unmounted/remounted. Siblings and ancestors are untouched.
4. **One code path per operation** — frame rendering, resize handles, titlebar, zone picker each have exactly one implementation.
5. **Typed content identity** — `Entry.content` is a typed field, not an untyped cast.

### Constraints

- All existing tests must pass — the refactor is structural, not behavioral
- `FloatingFrameBackend` interface gains one method (`getRootContainer`) for workspace mount transfer — all other methods unchanged
- Backward compatible persistence — existing saved layouts load correctly

## 1. Module Decomposition (D8)

### Before

```
group-organiser-backend.ts (1355 lines)
  └── single createGroupOrganiserBackend() closure
      ├── frame registry (Map<string, FrameState>)
      ├── frame rendering (renderFrame, titlebar, resize handles, chrome)
      ├── container lifecycle (createLeafContainer, createSplitContainer, wrapContentFactory)
      ├── split/collapse (splitFrame, onCollapse, handleEmptyLeaf)
      ├── DnD (dragState, crossFramePreview, edgeSplitPreview)
      └── event dispatch (15 on* methods, 15 callback arrays)
```

### After

```
group-organiser-backend.ts (~300 lines — orchestrator)
  ├── frame registry: Map<string, FrameState>
  ├── callback arrays + on* methods (simple wiring)
  ├── delegates rendering to frame-renderer.ts
  ├── delegates tree ops to container-tree-ops.ts
  └── delegates DnD to dnd-coordinator.ts

frame-renderer.ts (~200 lines)
  ├── renderFrame(layout, contentFactory, callbacks) → FrameRenderResult
  ├── uses: frame-shell.ts (createFrameShell, createFrameTitlebar, createFrameResizeHandles, wireTitlebarDrag)
  ├── uses: frame-chrome.ts (injectFrameChrome, updatePinVisual)
  └── uses: frame-zone-picker.ts (showZonePicker)

container-tree-ops.ts (~250 lines)
  ├── tree traversal: findLeafContainer, findContainerWithTab, forEachLeafContainer, findParentEntry
  ├── tree surgery: splitContainerAt, collapseContainer
  ├── serialization: captureContainerState, restoreContainerFromState
  ├── container creation: createLeafContainer, createSplitContainer
  └── uses: frame-sandbox/container.ts (createContainer)

dnd-coordinator.ts (~200 lines)
  ├── drag state machine: start, move, end
  ├── cross-frame preview: show, hide, cleanup
  ├── edge split detection: detect zone, show preview
  └── uses: frame-boundaries.ts (detectEdgeZone)
```

### FrameState type (shared across modules)

```typescript
// In frame-state.ts (new file, extracted from backend)
import type { PositionedState } from "./frame-shell.js";
import type { Container } from "./frame-sandbox/types.js";

export interface FrameState extends PositionedState {
  readonly key: string;
  frameEl: HTMLElement;
  tabContentEl: HTMLElement;
  rootContainer: Container;
}
```

`FrameState extends PositionedState` (D11) — this is what enables the backend to use `createFrameResizeHandles` directly.

## 2. frame-renderer.ts Interface (D8, D11)

```typescript
export interface FrameRenderCallbacks {
  onClose(key: string): void;
  onPin(key: string): void;
  onDetach?(key: string): void;
  onTitlebarDoubleClick(key: string): void;
  onAddTab?(key: string): void;
  onViewModeToggle?(key: string): void;
  onArrangement?(key: string, preset: string): void;
  onMove(key: string, pos: { x: number; y: number }): void;
  onResize(key: string, size: { width: number; height: number }): void;
}

export interface FrameRenderResult {
  readonly frameEl: HTMLElement;
  readonly titlebar: HTMLElement;
  readonly tabContentEl: HTMLElement;
  dispose(): void;
}

export function renderFrame(
  layout: FrameLayout,
  callbacks: FrameRenderCallbacks,
  extraButtons?: readonly FrameButtonConfig[],
): FrameRenderResult;
```

**What it does:**
1. Calls `createFrameShell(layout.key, layout.position, layout.size)` from frame-shell
2. Calls `createFrameTitlebar()` from frame-shell (replaces manual DOM creation)
3. Creates `tabContentEl` div
4. Calls `injectFrameChrome(frameEl, titlebar, ...)` from frame-chrome
5. Calls `createFrameResizeHandles(frameEl, state, onResize, key)` from frame-shell (D11, replaces duplicate)
6. Calls `wireTitlebarDrag(titlebar, frameEl, state, onMove, key)` from frame-shell (D11, replaces manual)
7. Returns the frame elements for the backend to register

**What it does NOT do:**
- Create or mount containers (that's the backend's job)
- Manage state (it receives layout data, doesn't store it)
- Handle DnD (that's dnd-coordinator's job)

## 3. container-tree-ops.ts Interface (D8, D10)

```typescript
// --- Tree traversal ---

export function findLeafContainer(
  container: Container,
  predicate?: (c: Container) => boolean,
): Container | null;

export function findContainerWithTab(
  container: Container,
  tabKey: string,
): Container | null;

export function forEachLeafContainer(
  container: Container,
  callback: (c: Container) => void,
): void;

export function findParentOf(
  root: Container,
  target: Container,
): { container: Container; entry: Entry } | null;

export function isSplitLayout(layout: Layout): boolean;

// --- Tree surgery (D10: surgical replant) ---

export interface SplitResult {
  readonly splitContainer: Container;
}

export function splitContainerAt(
  root: Container,
  targetContainer: Container,
  droppedEntry: Entry,
  direction: "horizontal" | "vertical",
  depth: number,
  policy: ContainerPolicy,
  contentFactory: ContentFactory,
): SplitResult;

export function collapseContainer(
  root: Container,
  collapsing: Container,
  survivingEntry: Entry,
): void;

export function handleEmptyLeaf(
  root: Container,
  emptyContainer: Container,
): { frameEmpty: boolean };

// --- Container creation ---

export function createLeafContainer(
  entries: Entry[],
  depth: number,
  policy: ContainerPolicy,
  contentFactory: ContentFactory,
  callbacks: LayoutCallbacks,
): Container;

export function createSplitContainer(
  direction: "horizontal" | "vertical",
  children: Array<{ key: string; child: Container }>,
  depth: number,
  policy: ContainerPolicy,
  contentFactory: ContentFactory,
  onCollapse: (remaining: Entry) => void,
): Container;

// --- Serialization (persistence only, NOT for mode transitions) ---

export function captureContainerState(container: Container): ContainerState;

export function restoreContainerFromState(
  state: ContainerState,
  depth: number,
  policy: ContainerPolicy,
  contentFactory: ContentFactory,
  callbacks: ContainerTreeCallbacks,
): Container;
```

**Key design point:** `splitContainerAt` and `collapseContainer` implement the surgical replant pattern (D10). They unmount only the affected subtree, mutate the parent entry in place, and call `refreshEntry` to re-render. The root container and unaffected siblings are never torn down.

### refreshEntry — the surgical replant primitive (spec-R1-01 fix)

The spec originally proposed using `Container.replaceChild` for surgical re-parent. Spec review found this is broken: `replaceChild` uses remove/add decomposition, which triggers cascade collapse on 2-entry splits (R1-01) and doesn't preserve entry position (R1-03). `replaceChild` has **zero callers** in the current codebase and has never been tested.

The correct primitive is `refreshEntry`:

```typescript
// Added to LayoutStrategy
refreshEntry(key: string): void;

// Added to Container
refreshEntry(key: string): void;
```

**Container.refreshEntry(key):**
1. Find entry by key
2. Call `entry.contentDispose?.()` — clean up old content
3. Clear `entry.contentElement` and `entry.contentDispose`
4. Call `organiser.refreshEntry(key)` — strategy re-renders the slot

**Strategy.refreshEntry(key):** Each strategy re-renders the affected slot only:
- **Tabbed:** if `key` is the active tab, dispose old content element, run content factory, replace in content area. If inactive, no-op (content recreated on tab activation via `ensureContent`).
- **Split:** find the pane div, dispose old content, run factory, replace in pane.
- **Accordion:** find the section, dispose old content, run factory, replace.
- **Free:** find the frame element, dispose old content, run factory, replace.

No remove/add cycle. No collapse cascade. No position changes.

### Surgical split (D10)

```typescript
// splitContainerAt — pane-level split (surgical replant)
// 1. Find target's parent: { container, entry } = findParentOf(root, target)
// 2. target.unmount()  — only the target subtree
// 3. Create split container wrapping target + dropped
// 4. Mutate entry: entry.childContainer = splitContainer
// 5. container.refreshEntry(entry.key) — strategy re-renders just that slot
// Ancestors and siblings: untouched. Root: untouched.
```

### Surgical collapse (D10)

```typescript
// collapseContainer — nested collapse (surgical replant)
// 1. { container, entry } = findParentOf(root, collapsing)
// 2. surviving.unmount()  — detach from collapsing split
// 3. collapsing.dispose()
// 4. Mutate entry: entry.childContainer = survivingChild (or clear + set entry.component if flattening)
// 5. container.refreshEntry(entry.key) — strategy re-renders just that slot
// Root container: untouched
```

## 4. dnd-coordinator.ts Interface (D8)

```typescript
export interface DndContext {
  readonly frames: ReadonlyMap<string, FrameState>;
  readonly containerEl: HTMLElement;
  getFrameElement(key: string): HTMLElement | null;
}

export interface DndCallbacks {
  onCrossFrameDrop(fromFrame: string, tabKey: string, toFrame: string, insertIndex: number): void;
  onEdgeSplit(fromFrame: string, tabKey: string, targetFrame: string, zone: EdgeZone, targetLeaf?: Container): void;
  onTabDragOut(frameKey: string, tabKey: string, pos: { x: number; y: number }): void;
}

export interface DndCoordinator {
  handleTabDragStart(frameKey: string, tabKey: string, ghost: HTMLElement): void;
  handleTabDragMove(frameKey: string, tabKey: string, x: number, y: number): void;
  handleTabDragEnd(): void;
  dispose(): void;
}

export function createDndCoordinator(
  context: DndContext,
  callbacks: DndCallbacks,
): DndCoordinator;
```

**What it encapsulates:**
- `dragState` — currently active drag (frame key, tab key, ghost element)
- `crossFramePreview` — target frame highlight, preview tab marker
- `edgeSplitPreview` — edge zone overlay for split-on-drop
- Hit detection — which frame is under the cursor, is it an edge zone
- Preview lifecycle — show on hover, hide on leave, cleanup on drop/cancel

**What it delegates:**
- Actual drop execution (cross-frame move, edge split) → callbacks to backend
- Frame position data → reads from `context.frames` (no copy)

## 5. Workspace Mode — Mount Transfer (D9, D10)

### Backend interface addition (R1-05)

`FloatingFrameBackend` gains one new method:

```typescript
getRootContainer(frameKey: string): Container | null;
```

This exposes the live `rootContainer` for workspace mount transfer. Consistent with existing methods that expose DOM elements (`getFrameElement`, `getTabContentElement`). The Container's mount/unmount lifecycle is already part of the public API (Container interface in types.ts).

### Before (split brain)

```
User changes mode → captureLayout() → serialize all containers
→ restoreWorkspaceTree() → create NEW containers from snapshot
→ old containers abandoned (state diverges)
```

### After (replant)

```
User changes mode → unmount containers from frames
→ create workspace container → add entries that mount LIVE containers
→ user changes back → unmount from workspace → remount into frames
```

### wire-floating-workspace.ts changes

**Deleted:**
- `restoreWorkspaceTree()` — entire function removed
- `buildWorkspaceContainer()`'s serialization path
- `syncWorkspaceStateToFrames()` — the accent-color DOM inspection hack

**`applyWorkspaceMode(targetMode)` — rewritten:**

```typescript
function applyWorkspaceMode(targetMode: Layout): void {
  if (currentMode === targetMode) return;
  const previousMode = currentMode;
  currentMode = targetMode;

  if (targetMode === "free") {
    // Workspace → free: replant containers back into their frames
    for (const entry of [...workspaceContainer.entries]) {  // copy before mutating
      const state = findFrameState(entry.key);
      if (!state) continue;
      workspaceContainer.removeEntry(entry.key);
      state.rootContainer.mount(state.tabContentEl);
    }
    workspaceContainer.dispose();
    workspaceContainer = null;
    showFrames();
  } else if (previousMode === "free") {
    // Free → workspace: replant containers from frames into workspace
    hideFrames();
    workspaceContainer = createContainer({
      entries: [],
      layout: targetMode,
      policy: DEFAULT_POLICY,
      contentFactory: workspaceContentFactory,
    });
    for (const state of getVisibleFrames()) {
      state.rootContainer.unmount();
      const wsEntry: Entry = {
        key: state.key,
        label: getFrameLabel(state),
        childContainer: state.rootContainer,
      };
      workspaceContainer.addEntry(wsEntry);
    }
    workspaceContainer.mount(workspaceHost);
  } else {
    // Non-free → non-free: just switch layout (container stays mounted)
    workspaceContainer.setLayout(targetMode);
  }
}
```

**The workspace content factory** for non-leaf entries (those with `childContainer`) simply mounts the child container — the same pattern as `wrapContentFactory` in the backend. This is the recursive mounting mechanism from D1.

## 6. Unified Zone Picker (D12)

### frame-zone-picker.ts (modified)

```typescript
export type SnapCallback = (zone: SnapZone) => void;

export function showZonePicker(
  anchorEl: HTMLElement,
  onSnap: SnapCallback,
): HTMLElement;
```

**Root frame usage** (in frame-chrome extra button):
```typescript
showZonePicker(frameEl, (zone) => engine.snapFrame(key, zone, canvasSize));
```

**Inner free-layout panel usage** (in free-layout-strategy):
```typescript
showZonePicker(panelEl, (zone) => {
  const rect = zoneToRect(zone, containerWidth, containerHeight);
  state.position = rect.position;
  state.size = rect.size;
  // update DOM
});
```

The inline zone picker in `free-layout-strategy.ts` (~40 lines) is deleted.

## 7. Entry.component Typed Field (D13, R1-07)

### types.ts change

```typescript
import type { Component } from "@casehubio/pages-component";

export interface Entry {
  readonly key: string;
  readonly label: string;
  contentElement?: HTMLElement | undefined;
  contentDispose?: (() => void) | undefined;
  meta?: PerLayoutMeta;
  childContainer?: Container | undefined;
  component?: Component | undefined;  // NEW — replaces (entry as any)._content. Named 'component' (not 'content') to distinguish from contentElement.
}
```

### Cast elimination

All `(entry as any)._content` usages across 3 files (~8 locations) are replaced with `entry.component`. The content identity now flows through the type system:

- `containerizeEntry`: reads `entry.component`, copies to wrapped child entry, clears on parent
- `flattenEntry`: reads surviving child's `entry.component`, sets on parent entry
- `wrapContentFactory`: reads `entry.component` to construct content element
- `captureContainerState`: reads `entry.component` for serialization
- `restoreContainerFromState`: sets `entry.component` from deserialized `FrameTabConfig.content`

## 8. Strategy onCollapse Fix (R1-01, D6 revised)

All strategies must invoke `onCollapse` when reduced to a single entry — currently only split-strategy does this. Add to `tabbed-strategy.ts` and `accordion-strategy.ts` in their `removeEntry` methods:

```typescript
// In removeEntry, after removing the entry:
if (currentEntries.length === 1 && callbacks.onCollapse) {
  callbacks.onCollapse(currentEntries[0]!);
  return;
}
```

### Layout-aware flatten (D6 revised)

The `onCollapse` handler in `containerizeEntry` checks whether the child container's layout matches the parent before flattening. It uses `refreshEntry` to trigger content re-render (spec-R1-05 fix):

```typescript
onCollapse: (remaining: Entry) => {
  const childLayout = childContainer.organiser.type;
  const parentLayout = parentContainer.organiser.type;
  if (childLayout === parentLayout) {
    flattenEntry(parentEntry, remaining);  // clears childContainer, copies component
    parentContainer.refreshEntry(parentEntry.key);  // re-renders with new content
  }
  // else: preserve — layout isolation is intentional
}
```

Same-layout nesting (tabbed-in-tabbed) flattens — it's just depth waste. Different-layout nesting (accordion-in-tabbed) preserves — it's intentional isolation.

## 9. Dead Code Removal

| Code | Location | Reason |
|------|----------|--------|
| `addChildToFrame` | backend ~line 302 | Defined, never called |
| `createResizeHandles` (local) | backend ~line 878 | Replaced by `createFrameResizeHandles` from frame-shell (D11) |
| Manual titlebar creation | backend renderFrame lines 1023-1028 | Replaced by `createFrameTitlebar` from frame-shell (D11) |
| `restoreWorkspaceTree` | wire-floating-workspace.ts lines 23-82 | Eliminated by mount transfer (D9) |
| `syncWorkspaceStateToFrames` | wire-floating-workspace.ts lines 317-330 | Eliminated by mount transfer (D9) |
| Inline zone picker | free-layout-strategy.ts (~40 lines) | Replaced by unified `showZonePicker` (D12) |
| `createFrameTitlebar` import (unused) | backend import line | Now used (D11) — moves from dead to active |
| `wireTitlebarDrag` import (unused) | backend import line | Now used (D11) — moves from dead to active |

## 10. Backend Orchestrator — What Remains

After extraction, `group-organiser-backend.ts` retains:

1. **Frame registry** — `Map<string, FrameState>`, `zOrder: string[]`
2. **Callback arrays** — 15 event callback lists + `on*` registration methods
3. **Orchestration methods** implementing `FloatingFrameBackend`:
   - `renderFrame` → delegates to `frame-renderer.renderFrame()`, creates container via `container-tree-ops.createLeafContainer()`, registers in frame map
   - `removeFrame` → unmounts container, removes DOM, deletes from map
   - `addTab/removeTab/setActiveTab` → delegates to `state.rootContainer`
   - Split handlers → delegates to `container-tree-ops.splitContainerAt()`
   - DnD handlers → delegates to `dnd-coordinator`
   - `captureContainerTree` → delegates to `container-tree-ops.captureContainerState()`
4. **`wrapContentFactory`** — stays in backend because it wires frame-specific callbacks (nest button, DnD on content areas). It's the integration point between content rendering and the frame system.

The `suppressEntryClose` flag also stays — it coordinates programmatic tab removal. A future cleanup could replace it with a more explicit mechanism, but it's not in scope for this refactor.

## 11. File Impact Summary

| File | Change |
|------|--------|
| **New files** | |
| `src/frame-state.ts` | `FrameState extends PositionedState` type definition |
| `src/frame-renderer.ts` | Frame DOM creation (extracted from backend) |
| `src/container-tree-ops.ts` | Tree traversal, surgery, serialization (extracted from backend) |
| `src/dnd-coordinator.ts` | Drag state machine (extracted from backend) |
| **Modified files** | |
| `src/group-organiser-backend.ts` | Reduced to ~300-line orchestrator |
| `src/wire-floating-workspace.ts` | Mount transfer replaces serialize/recreate |
| `src/frame-sandbox/types.ts` | Add `component?: Component` to Entry. Add `refreshEntry(key)` to `LayoutStrategy` and `Container` interfaces. |
| `src/frame-zone-picker.ts` | Add `SnapCallback` parameter to `showZonePicker` |
| `src/frame-sandbox/free-layout-strategy.ts` | Remove inline zone picker, use shared `showZonePicker` |
| `src/frame-shell.ts` | No changes (already correct, now actually used by backend) |
| `src/frame-chrome.ts` | No changes (already unified) |

**Note:** `frame-state.ts` is a type-only file (~12 lines) — extracted so all modules can import `FrameState` without depending on the backend. The 3 concern-based modules (frame-renderer, container-tree-ops, dnd-coordinator) are the substantive extractions.

**`paneCounter`** (monotonic key generator for split panes) moves from the backend closure to `container-tree-ops.ts` as module-level state. It's used only by `createSplitContainer`.

**Total: 4 new files (1 type-only, 3 modules), 6 modified files.**

## 12. Testing Strategy

### Extracted module tests

| Module | Test coverage |
|--------|--------------|
| `container-tree-ops.test.ts` | Traversal helpers, surgical split/collapse, serialization round-trip |
| `frame-renderer.test.ts` | Frame DOM structure, resize handle wiring, titlebar creation |
| `dnd-coordinator.test.ts` | Drag state transitions, preview lifecycle, cross-frame detection |

### Integration tests

- Workspace mode transition preserves container state (no divergence)
- Split + collapse preserves sibling container state (surgical replant)
- Persistence round-trip through `captureContainerState` / `restoreContainerFromState`
- Zone picker works in both root frame and inner panel contexts
- Content identity survives containerize → flatten round-trip via typed field

### Regression tests

- All 894 existing tests must pass unchanged
- Free layout positions preserved across workspace mode changes (the original bug)
- Nested container toolbar scoping (direct-child lookup)

## References

- Issue #345 — Recursive Container model
- 2026-08-23-recursive-container-model-design.md — D1-D7 feature decisions (this spec's foundation)
- `packages/pages-runtime/src/group-organiser-backend.ts` — the 1355-line god closure being decomposed
- `packages/pages-runtime/src/wire-floating-workspace.ts` — workspace transition code being rewritten
- `packages/pages-runtime/src/frame-shell.ts` — shared frame rendering (now used by backend)
- `packages/pages-runtime/src/frame-chrome.ts` — shared chrome (already unified)
- `packages/pages-runtime/src/frame-zone-picker.ts` — zone picker (being unified)
- `packages/pages-runtime/src/frame-sandbox/types.ts` — Entry, Container, PositionedState types
- `packages/pages-runtime/src/frame-sandbox/container.ts` — createContainer, containerizeEntry, flattenEntry
- `packages/pages-runtime/src/frame-sandbox/free-layout-strategy.ts` — inline zone picker being removed
- `packages/pages-runtime/src/floating-frame-backend.ts` — FloatingFrameBackend interface (unchanged)
- `packages/pages-runtime/src/floating-frame-engine.ts` — engine captureLayout/restoreLayout
