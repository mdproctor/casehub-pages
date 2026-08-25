## D1: Nesting model — Entry owns children directly

**Choice:** `Entry` gains an optional `childContainer?: Container`. When set, the entry is a non-leaf that renders its child Container instead of raw content. The external `FrameState.childContainers: Map<string, Container>` is eliminated. The Container tree is navigable through Entry alone.
**Alternatives:**
- Dual model: Entry declares, external map backs — avoids touching split creation/collapse but creates two sources of truth
- Keep external map, extend to arbitrary entry keys — minimal type changes but doesn't achieve the "Entry as Container" model
**Rationale:** Matches the i3 spec's "everything is a Container" principle. Single source of truth. Tree structure is self-describing — no external registry needed to understand parent-child relationships. The existing `childContainers` map was a stopgap for the split-only case (#312).
**Trade-offs:** Requires refactoring all split creation/collapse logic in `group-organiser-backend.ts` to use `Entry.childContainer` instead of the map. Moderate diff but the split logic already creates child Containers — the change is where they're stored, not how they're created. Creates a circular type reference (Entry → Container → Entry) — resolved by moving the Container interface definition to `types.ts` alongside Entry, since Container is a pure interface with no runtime dependencies.
**Sources:** `packages/pages-runtime/src/frame-sandbox/types.ts` (Entry interface), `packages/pages-runtime/src/frame-sandbox/container.ts` (Container interface), `packages/pages-runtime/src/group-organiser-backend.ts` (FrameState.childContainers)
**Exploration:** quick
**Review:** R1-04 — circular type dependency acknowledged. Resolution: move Container interface to types.ts. Both Entry and Container are data-shape interfaces with no runtime imports; co-locating them in types.ts eliminates the cycle without coupling data and runtime layers.
**Status:** revised

## D2: Nesting trigger — content-area + button

**Choice:** A `+` button inside the active tab's content area converts a leaf entry into a non-leaf. The tab-strip `+` remains "add sibling tab." Clicking the content-area `+` wraps the existing content into the first child of a new child Container, then adds a second empty child — the user sees their original content plus a new tab inside the nested Container.
**Alternatives:**
- Right-click context menu on tab header — more discoverable options but requires context menu infrastructure not yet built
- Tab-strip dropdown splitting "add tab" vs "add nested tab" — adds a click to the common case (sibling add)
**Rationale:** Direct, single-click gesture. Content-area placement makes the spatial relationship clear: "I'm adding inside this tab." Consistent with the issue's design direction. Tab-strip + remains the fast path for the common case (sibling).
**Trade-offs:** Requires injecting a + button into each leaf tab's content area. The button must hide when the entry is already non-leaf (it already has a nested Container with its own tab strip). Must respect `maxDepth` — hidden when depth limit reached. Three levels of + buttons exist (compositor tab bar, frame tab strip, content area) — the content-area button should use a distinct icon or label (e.g., "⊞" or "Nest") to differentiate from sibling-add buttons.
**Depends on:** D1 (Entry owns children — the + creates a childContainer on the active entry)
**Sources:** Issue #345 body (design direction section)
**Review:** R1-08 — visual differentiation acknowledged. Content-area nest button uses distinct affordance.
**Exploration:** quick
**Status:** revised

## D3: Content wrapping — existing content becomes first child

**Choice:** When a leaf entry converts to non-leaf, the existing `contentElement` is detached and re-mounted as the first entry in the new child Container. The user's view is preserved — their content is now inside a tab of the nested Container. A second empty tab is added so the nesting is immediately useful.
**Alternatives:**
- Replace with empty Container — simpler but destructive, user loses current content
- Keep as background, overlay Container — complex and confusing
**Rationale:** Non-destructive. The user clicked + to add something alongside their content, not to replace it.
**Trade-offs:** Moving a DOM element triggers `disconnectedCallback`/`connectedCallback` on web components — ephemeral state (scroll position, selections, ECharts highlights) is lost. To avoid this, the content factory re-creates the content in the child container rather than transferring the DOM element. The data pipeline re-delivers datasets via `pages-data-request`, so data state recovers. Ephemeral state loss is acceptable for this one-time structural operation — consistent with cross-tab frame transfer (workspace-compositor D3) which also accepts re-creation cost.
**Depends on:** D1, D2
**Sources:** `packages/pages-runtime/src/frame-sandbox/container.ts` (contentFactory pattern, Entry.contentElement lifecycle)
**Review:** R1-07 — DOM lifecycle effects acknowledged. Changed from element transfer to content factory re-creation to avoid disconnectedCallback/connectedCallback side effects.
**Exploration:** quick
**Status:** revised

## D4: Depth semantics — full tree depth, unified

**Choice:** `ContainerPolicy.maxDepth` counts from root Container to deepest leaf Container, regardless of whether nesting was created by splits or by entry nesting. The existing `depth` parameter on `createContainer()` already tracks this. Child Containers created via `Entry.childContainer` pass `parentContainer.depth + 1` as their depth.
**Alternatives:**
- Separate depth counters for split nesting vs entry nesting — more flexible but two concepts to reason about, harder to enforce a global limit
**Rationale:** Uniform depth model. The user doesn't care whether nesting came from a split or a tab — depth is depth. The existing `depth` field on Container and the `maxDepth` check in `createContainer()` already implement this correctly for splits; entry nesting plugs into the same mechanism.
**Trade-offs:** The current codebase has inconsistent maxDepth: leaf containers hardcode maxDepth:3, split containers hardcode maxDepth:10. With unified depth counting, maxDepth:3 blocks entry nesting whenever splits are present (root→split→leaf = depth 3, at limit). Resolution: unify all containers to maxDepth:5 via DEFAULT_POLICY. This allows root(1)→split(2)→leaf(3)→entry-nest(4)→entry-nest(5) — two levels of explicit nesting beyond a split, which covers practical use cases without enabling unbounded depth. The hardcoded policies in `group-organiser-backend.ts` should reference DEFAULT_POLICY instead of inline values.
**Sources:** `packages/pages-runtime/src/frame-sandbox/types.ts:3-6` (ContainerPolicy), `packages/pages-runtime/src/frame-sandbox/container.ts:148-153` (depth check), `packages/pages-runtime/src/group-organiser-backend.ts:260,296` (inconsistent hardcoded maxDepth)
**Review:** R1-02 — maxDepth=3 confirmed unusable with splits. Upgraded from footnote to explicit resolution: unify to maxDepth:5, eliminate hardcoded policies.
**Exploration:** quick
**Status:** revised

## D5: Persistence — recursive FrameTabConfig

**Choice:** `FrameTabConfig` gains an optional `children?: ContainerState` field. `ContainerState` contains `layout: Layout` and `tabs: FrameTabConfig[]` — the same recursive shape as the runtime Container tree. When `children` is present, the tab is non-leaf and its content is the serialized child Container. When absent, the tab is a leaf (backward compatible). `FrameLayout.tabs` stays as the top-level field.
**Alternatives:**
- Separate `containerTree?` field on FrameLayout replacing `tabs` — bigger migration, cleaner separation but more work for backward compat
- Rename `tabs` to `entries` with inline recursion — breaks backward compat for field name
**Rationale:** Minimal, backward-compatible extension. Existing layouts without `children` load correctly as flat tab lists. New layouts serialize the full tree. The recursion is natural — a tab's children are just more tabs in a Container. With D1 eliminating the external childContainers map, this also handles split persistence — `ContainerState.layout` can be `splith`/`splitv` and `ContainerState.layoutState` carries split ratios. Frame-level splits were NOT previously persisted; this design fixes that as a side effect.
**Trade-offs:** `FrameTabConfig` gains responsibility for tree structure. The type name ("TabConfig") is slightly misleading for non-leaf entries — consider renaming to `FrameEntryConfig` in a follow-up cleanup issue.
**Depends on:** D1 (Entry.childContainer defines the runtime tree that must be serialized)
**Sources:** `packages/pages-component/src/model/types.ts:91-111` (FrameLayout), workspace-compositor spec §8 (CompositorState pattern)
**Review:** R1-03 — split persistence gap confirmed. ContainerState now explicitly handles both entry nesting AND split nesting (layout can be any Layout including splith/splitv, layoutState carries ratios). This is a scope expansion but a welcome one — previously splits were lost on save/restore.
**Exploration:** quick
**Status:** revised

## D6: Collapse — layout-aware auto-flatten on single child

**Choice:** When a nested Container's last sibling is closed and only one child remains, auto-flatten ONLY IF the child container's layout matches the parent container's layout (e.g., tabbed-in-tabbed flattens; accordion-in-tabbed preserves). When layouts differ, the single-child container is preserved — the user intentionally nested it for layout isolation.
**Alternatives:**
- Stay nested, require manual flatten — more predictable but creates unnecessary single-child depth for same-layout nesting
- Always auto-flatten regardless of layout — destroys intentional layout isolation (R1-06)
- Auto-flatten only when empty (zero children) — inconsistent with split behavior
**Rationale:** Layout-match check distinguishes accidental cleanup residue (same-layout nesting is just depth waste) from intentional isolation (different-layout nesting is a feature). Consistent with the i3 model where each container has its own layout identity.
**Trade-offs:** More nuanced collapse logic — must compare child.organiser.type to parent.organiser.type before flattening. Slightly more code but prevents a class of user-surprising behavior.
**Implementation note (R1-01):** The `onCollapse` callback must be invoked by ALL strategies, not just split-strategy. Currently only `split-strategy.ts:134-137` checks `currentEntries.length === 1 && callbacks.onCollapse`. The tabbed and accordion strategies must add the same check in their `removeEntry` methods.
**Depends on:** D1 (collapse operates on Entry.childContainer)
**Sources:** `packages/pages-runtime/src/group-organiser-backend.ts:297-311` (existing split collapse pattern), `packages/pages-runtime/src/frame-sandbox/split-strategy.ts:134-137` (only strategy with onCollapse check)
**Review:** R1-01 — tabbed/accordion strategies missing onCollapse check. R1-06 — layout-match refinement.
**Exploration:** quick
**Status:** revised

## D7: Tree walking — unified traversal via Entry.childContainer

**Choice:** Refactor all tree-walking helpers (`findLeafContainer`, `findContainerWithTab`, `forEachLeafContainer`, `findParentSplitEntry`) to walk via `Entry.childContainer`. The `childMap: Map<string, Container>` parameter is removed from all signatures. Both split children and entry-nested children are reached through the same mechanism: iterate `container.entries`, check `entry.childContainer`, recurse.
**Alternatives:**
- Adapter pattern: build temporary childMap from Entry.childContainer fields — smaller diff but maintains two mental models and the adapter rebuilds on every mutation
- New helpers alongside old with gradual deprecation — safest migration but code duplication
**Rationale:** One traversal pattern for the entire tree. With Entry owning children (D1), there's no reason for an external map parameter.
**Trade-offs:** The refactor is more than parameter removal — the `isSplitLayout()` gate that currently controls recursion disappears. The new recursion condition is: "if any entry has `childContainer`, recurse into it." A tabbed container whose entries have childContainers is no longer a leaf. The leaf detection semantic changes from "not a split layout" to "no entries have children." All ~15 call sites need updated logic, not just parameter drops. `findParentSplitEntry` is renamed to `findParentEntry` since it's no longer split-specific.
**Depends on:** D1 (Entry.childContainer is the traversal mechanism)
**Sources:** `packages/pages-runtime/src/group-organiser-backend.ts:55-128` (existing helpers)
**Review:** R1-01 — refactor complexity acknowledged. Updated from "parameter removal" to accurate description of logic changes. The new traversal is simpler (one condition instead of layout-type branching) but it IS a logic change at every call site, not just a signature change.
**Exploration:** quick
**Status:** revised

## D8: Backend decomposition — concern-based modules

**Choice:** Extract the 1355-line `createGroupOrganiserBackend` god closure into three focused modules: `frame-renderer.ts` (frame DOM creation), `container-tree-ops.ts` (tree traversal, split, collapse), `dnd-coordinator.ts` (drag state machine, previews). The backend stays as a thin orchestrator (~300 lines) implementing `FloatingFrameBackend`, keeping frame registry and callback arrays. Includes split brain fix (mount transfer), code unification (shared resize handles, titlebar, zone picker), typed content identity on Entry, and dead code removal.
**Alternatives:**
- Entity-centric modules (Frame class, ContainerTree class, DragSession class) — cross-entity operations (split touches frames + containers + DnD) don't have a natural home, ends up needing a coordinator anyway
- Container-centric push-down (containers own their own chrome, resize, DnD) — DnD requires cross-container visibility, split creates/destroys containers at tree level, forces a coordinator that collapses back to concern-based with worse boundaries
**Rationale:** Maps directly to the concerns tangled in the god closure. Each module is independently readable and testable. When tracing a split, read container-tree-ops. When tracing frame creation, read frame-renderer. When debugging drag, read dnd-coordinator. The backend's orchestrator role is natural — it implements the FloatingFrameBackend interface by composing modules.
**Trade-offs:** More files to navigate (~3 new, but each is focused). Module interfaces must be designed carefully — the wrong boundaries create pass-through boilerplate. The registry staying in the backend means frame-renderer and dnd-coordinator receive FrameState as a parameter rather than looking it up.
**Sources:** Audit of group-organiser-backend.ts — 6 concerns identified (frame registry, rendering, container lifecycle, split/collapse, DnD, event dispatch). Handover analysis of split brain problem. Code duplication audit (resize handles, titlebar, zone picker).
**Exploration:** deep-analysis
**Status:** captured

## D9: Split brain fix — direct re-parent

**Choice:** When workspace mode changes, unmount each frame's `rootContainer` from its `tabContentEl` and mount it into a workspace entry. On switch-back, unmount from workspace and remount into `tabContentEl`. Zero serialization. `restoreWorkspaceTree` is deleted entirely. `buildWorkspaceContainer` becomes a simple loop: unmount containers, create workspace container with entries that mount the live containers.
**Alternatives:**
- Persistent mount point (wrapper div that gets re-parented, container stays mounted) — adds indirection without benefit; container unmount/mount is already clean since strategies detach/reattach their DOM
- Lazy capture (keep serialize, but restore references live containers) — doesn't eliminate the fundamental duplication; serialized state still exists as a divergent copy
**Rationale:** Eliminates all 3 symptoms: no serialization loss, no orphaned containers, no divergent state copies. Container mount/unmount is already the established lifecycle — strategies handle it correctly.
**Trade-offs:** Strategies must handle re-mount without reinitializing state. Current strategies already do this (mount creates DOM from current entries/state, unmount removes DOM). Free layout strategy needs to preserve `entryState` Map and `zOrder` across unmount/mount — verified that it does (state lives in closure, not in DOM). SyncWorkspaceStateToFrames (the accent-color DOM inspection hack) is eliminated.
**Depends on:** D8 (part of the full decomposition)
**Implementation note (R1-05):** `FloatingFrameBackend` interface gains `getRootContainer(frameKey: string): Container | null` to expose live containers for workspace mount transfer. The Container's mount/unmount lifecycle is already public (Container interface in types.ts). This is consistent with existing backend methods that expose DOM elements (`getFrameElement`, `getTabContentElement`).
**Sources:** wire-floating-workspace.ts analysis — buildWorkspaceContainer, restoreWorkspaceTree, applyWorkspaceMode flow. Free-layout-strategy.ts — state is closure-based, survives unmount/mount.
**Review:** R1-05 — backend interface needs getRootContainer for mount transfer. Added.
**Exploration:** quick
**Status:** revised

## D10: Replant everywhere — surgical subtree re-parent, never full-tree teardown

**Choice:** All container moves use surgical unmount/mount of the affected subtree only. Never unmount the entire root tree to change one branch. This applies to workspace transitions (D9), split operations, collapse operations, and any future container moves. The pattern: `container.unmount()` from old parent, re-parent in the tree, `container.mount()` into new parent. Siblings and ancestors are untouched.
**Alternatives:**
- Full-tree unmount/remount (current approach) — simpler to reason about ("just rebuild everything") but cascades side effects, loses ephemeral DOM state in unrelated subtrees, and is the root cause of state divergence bugs
**Rationale:** Consistency — one pattern for all container movement. Performance — avoids tearing down and rebuilding unrelated subtrees. Correctness — ephemeral state (scroll positions, ECharts highlights, user selections) in sibling containers is preserved. The current full-tree teardown is the structural cause of repeated regression bugs.
**Trade-offs:** Requires each container move site (splitFrame pane-level, splitFrame root-level, onCollapse nested, workspace transition) to identify and re-parent only the affected subtree. More precise code, but more code to verify. Strategy mount/unmount must be idempotent and preserve state across cycles — verified that current strategies already do this (closure-based state, DOM is ephemeral).
**Implementation note (R1-03, spec-R1-01/R1-03/R1-05):** The mechanism is NOT `Container.replaceChild` — that method uses remove/add decomposition which triggers cascade collapse on splits (spec review R1-01) and doesn't preserve entry position (R1-03). Instead: add `refreshEntry(key: string)` to both `LayoutStrategy` and `Container`. Surgical replant mutates `entry.childContainer` directly (it's already a mutable field), then calls `container.refreshEntry(entry.key)`. The strategy disposes old content, runs the content factory, and replaces the content element in place. No remove/add cycle, no collapse cascade, no position issues.
**Depends on:** D8, D9
**Sources:** group-organiser-backend.ts splitFrame (root unmount/remount lines 588, 594), onCollapse nested (root unmount/remount line 383), wire-floating-workspace.ts buildWorkspaceContainer. User directive: "replant in all places instead, to keep the architecture consistent."
**Review:** R1-03 — mechanism specified via Container.replaceChild. No new strategy API needed.
**Exploration:** quick
**Status:** revised

## D11: FrameState extends PositionedState — unified resize handles and titlebar

**Choice:** `FrameState` extends `PositionedState` from frame-shell.ts. The backend's duplicate `createResizeHandles` function is deleted. `renderFrame` uses `createFrameResizeHandles(frameEl, state, onResize, key)` from frame-shell. Additionally, the backend uses `createFrameTitlebar()` and `wireTitlebarDrag()` from frame-shell instead of manual DOM creation (currently imported but unused).
**Alternatives:** Adapter function wrapping FrameState as PositionedState — unnecessary since the shapes already match
**Rationale:** FrameState already has `position: {x, y}` and `size: {width, height}` — identical to PositionedState. Extending is zero-cost. Eliminates ~100 lines of duplicate resize handle code and manual titlebar creation.
**Trade-offs:** None significant. FrameState gains a type dependency on frame-shell — acceptable, frame-shell is a sibling module in the same package.
**Exploration:** quick
**Status:** captured

## D12: Unified zone picker with snap callback

**Choice:** `frame-zone-picker.ts` exports a shared `showZonePicker(anchorEl: HTMLElement, onSnap: (zone: SnapZone) => void)` function. Root frames pass `(zone) => engine.snapFrame(key, zone, canvasSize)`. Inner free-layout panels pass `(zone) => zoneToRect(zone, containerWidth, containerHeight)`. The inline zone picker implementation in `free-layout-strategy.ts` is deleted.
**Alternatives:** Keep two implementations — no benefit, same UI, only the callback differs
**Rationale:** Identical 3x3 grid UI with identical behavior, differing only in what happens on click. A callback parameter makes this one function.
**Trade-offs:** None. Pure code reduction.
**Exploration:** quick
**Status:** captured

## D13: Entry.component typed field — eliminate _content casts

**Choice:** `Entry` gains `component?: Component | undefined`. All `(entry as any)._content` casts are replaced with `entry.component`. Content identity flows through the type system. `containerizeEntry` reads `entry.component` to transfer identity to the wrapped child entry, then clears `entry.component`. `flattenEntry` reads the surviving child's `component` and sets it on the parent entry. Named `component` (not `content`) to distinguish from `contentElement` — `component` is the descriptor, `contentElement` is the rendered DOM.
**Alternatives:**
- Keep _content as convention — maintainers must know about the hidden property, TypeScript can't catch misuse
- Name it `content` — ambiguous alongside `contentElement` (R1-07)
**Rationale:** Content identity is a core concept used in 5+ locations across 3 files. It belongs in the type system, not hidden behind casts. The name `component` matches the `Component` type and is unambiguous.
**Trade-offs:** `Component` type from `@casehubio/pages-component` becomes a dependency of the Entry type in `pages-runtime`. This dependency already exists via `ContentFactory` and `ContainerConfig` — no new coupling.
**Review:** R1-07 — renamed from `content` to `component` for clarity.
**Exploration:** quick
**Status:** revised

## D14: refreshEntry — surgical replant primitive

**Choice:** Add `refreshEntry(key: string): void` to both `LayoutStrategy` and `Container` interfaces. For surgical tree surgery (split, collapse, flatten), mutate the parent entry's `childContainer` directly, then call `container.refreshEntry(key)` to re-render. Do NOT use `Container.replaceChild` — its remove/add decomposition triggers cascade collapse on splits and doesn't preserve entry position.
**Alternatives:**
- Fix `replaceChild` to use `LayoutStrategy.replaceEntry` (atomic swap) — more complex, requires new Entry objects instead of in-place mutation
- Use `replaceChild` as-is — broken: cascade collapse on 2-entry splits (spec-R1-01), wrong position (R1-03), parent left in broken render state (R1-05)
**Rationale:** `refreshEntry` is the minimal primitive that makes surgical replant work. It re-renders one entry's content area without touching entries, position, or triggering collapse checks. Each strategy implements it by disposing old content, running factory, replacing in DOM — only for currently-visible entries (active tab in tabbed, all panes in split, etc.). Spec review (R1-01/R1-03/R1-05) confirmed `replaceChild` is broken and has zero callers in the codebase.
**Trade-offs:** Adds one method to LayoutStrategy interface. Each strategy needs an implementation (~5-10 lines each). Entry mutation is in-place — the entry object is shared between Container.entries and Strategy.currentEntries, so both see the change.
**Depends on:** D10 (surgical replant pattern), D8 (decomposition)
**Sources:** Spec review R1-01 (cascade collapse), R1-03 (position), R1-05 (broken render state). container.ts `replaceChild` implementation (lines 197-204). split-strategy.ts onCollapse check (lines 133-135).
**Exploration:** quick
**Status:** captured
