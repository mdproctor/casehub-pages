---
layout: post
title: "Decomposing the God Closure — What Extracts Cleanly and What Doesn't"
date: 2026-08-25
entry_type: note
subtype: diary
projects: [casehubio/casehub-pages]
tags: [refactoring, architecture, extraction, closure-coupling, container-model]
series: issue-345-recursive-container-model
---

# Decomposing the God Closure — What Extracts Cleanly and What Doesn't

The god closure in `group-organiser-backend.ts` has been bothering me for a while. It's 1355 lines implementing `FloatingFrameBackend` — frame rendering, container tree operations, drag-and-drop state machine, workspace transitions, resize handling, and event dispatch. All sharing mutable closure state. The unified container architecture plan (#345) calls for decomposing it into focused modules as a prerequisite for surgical replant.

We started with the easy wins. Seven tree traversal helpers — `findLeafContainer`, `findContainerWithTab`, `forEachLeafContainer`, `captureContainerState`, `restoreContainerFromState`, plus `isSplitLayout` — moved cleanly to `container-tree-ops.ts`. These are pure functions with no mutable state dependencies. The only design choice worth noting: we renamed `findParentEntry` to `findParentOf` and changed its return type from `{ parent, entryKey }` to `{ container, entry }`. Four call sites were doing `parentInfo.parent.entries.find(e => e.key === parentInfo.entryKey)` to get the entry object — returning it directly eliminates that redundancy.

Frame state and rendering came next. `FrameState` extends `PositionedState` from `frame-shell.ts` in its own module now. The backend had a 110-line `createResizeHandles` function that was a near-exact duplicate of `createFrameResizeHandles` already exported from `frame-shell.ts` — deleted in favour of the shared version with a thin callback adapter. Similarly, the manual titlebar creation was replaced by `createFrameTitlebar()`. A dead `addChildToFrame` function with zero callers went too.

The zone picker was a smaller win but satisfying. Both the root-frame picker in `frame-zone-picker.ts` and the inner-panel picker in `free-layout-strategy.ts` had identical `ZONES` arrays and nearly identical 3x3 grid UIs. We extracted `createZoneGrid(onSnap, currentZone?)` — each call site passes its own callback. Root frames call `engine.snapFrame()`; inner panels call `zoneToRect()` and set position/size directly.

Then we hit the DnD code. 220 lines of state machine — `dragState`, `crossFramePreview`, `edgeSplitPreview`, `handleCrossFrameDragMove`, `showEdgeSplitOverlay` — all reading and writing eight closure variables and dispatching to four closure functions. We designed a coordinator interface: `DndContext` for read-only frame access, `DragEndResult` discriminated union for telling the backend what happened. But the result shape mirrored the closure's shape rather than modelling the concern. The extraction cost exceeded the original implementation cost.

We deferred it and captured the lesson as a garden entry instead. The core insight: interface boundaries must exist *before* a state machine grows, not after. A coordinator designed upfront costs thirty minutes. A coordinator extracted from a coupled closure costs hours — or gets deferred indefinitely. This applies to any multi-phase interaction pattern: DnD, resize, selection, workspace transitions.

The session ended with a question I hadn't considered carefully enough. The next task in the plan replaces workspace serialize/recreate with mount transfer — unmounting containers from one parent and remounting in another. The original destroy/recreate pattern wasn't just simpler; it was *defensive*. Recreating from serialized state guarantees a clean slate — no accumulated event listeners, no stale DOM references, no leak classes to audit. Mount transfer preserves the container object across cycles, which means any cleanup bug in a strategy's `unmount()` compounds over time instead of being reset.

The strategies are closure-based with DOM as the ephemeral layer, so the architecture should handle it. But "should" and "verified" are different things. Before enabling mount transfer, we need to audit every strategy's unmount implementation for proper listener cleanup. If a strategy leaks on unmount, fix that first — otherwise mount transfer turns a one-time leak into a compounding one.
