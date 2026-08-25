---
layout: post
title: "Surgical Replant — Why Full-Tree Remount Was Always Wrong"
date: 2026-08-25
entry_type: note
subtype: diary
projects: [casehubio/casehub-pages]
tags: [container-model, refactoring, dom-lifecycle, testing]
series: issue-345-recursive-container-model
---

# Surgical Replant — Why Full-Tree Remount Was Always Wrong

Every container move in the layout engine — splits, collapses, workspace transitions — followed the same pattern: unmount the entire root tree, mutate the data model, remount everything. It worked. It was also wrong.

The problem isn't correctness. Full-tree remount produces the right DOM. The problem is collateral damage. Unmounting the root tears down every container in the tree, including siblings that haven't changed. Scroll positions, ECharts highlights, accordion expand states, free-layout z-orders — anything held in DOM or closure state across the sibling subtrees is destroyed and rebuilt from scratch. The user drags a tab to split one pane, and every other pane flickers as its content is recreated.

The fix is `refreshEntry` — a primitive we added to `LayoutStrategy` and `Container` that re-renders exactly one entry's content slot without touching anything else. For a surgical split: mutate the parent entry's `childContainer` to point at the new split container, then call `parentContainer.refreshEntry(entryKey)`. The strategy disposes the old content element, runs the content factory with the updated entry, and replaces the DOM in the pane. Siblings don't know anything happened.

The lifecycle coordination is the part that bit us. The old content factory captured the child container via closure when it created the content element. Its `dispose` callback calls `child.dispose()` on whatever container existed at factory time — not whatever `entry.childContainer` points to now. If `refreshEntry` calls that old dispose, it destroys a child container that's been re-parented into the new split. The fix: clear `contentDispose` before calling `refreshEntry`, but leave `contentElement` set so the strategy can remove the old DOM from the pane. Two lines, but the ordering matters.

We applied the same pattern to nested split collapse — the `onCollapse` handler in `createSplitContainer` had the same full-tree unmount/remount. Same fix: find the parent entry, swap the child container, clear the stale dispose, call `refreshEntry`.

The more interesting change was layout-aware flatten. When a nested container collapses to one entry, should it auto-flatten back into its parent? The original code always flattened. D6 in the spec argues otherwise: same-layout nesting is waste (tabbed-in-tabbed adds depth for nothing), but different-layout nesting is intentional (accordion-in-tabbed gives the user layout isolation they chose deliberately). The onCollapse handler now compares `child.organiser.type` to `parentContainer.organiser.type` and only flattens on match.

The combinatorial test suite made all of this verifiable. A `buildContainerTree` harness generates N-level nested container trees from a spec — every combination of tabbed, accordion, free, splith, splitv at each level. Nine layout pairs at two levels, twenty-seven triples at three levels, split-in-nest combinations, containerize/flatten round-trips, persistence capture-restore cycles. The kind of coverage that catches the interaction effects between strategies that unit tests per strategy miss entirely.

The code review caught three things worth fixing: a document-level click listener on the zone picker dropdown that survived strategy unmount (leaked permanently if the dropdown was open during a layout switch), a silent `catch {}` swallowing unexpected errors in the nest button handler, and a missing `workspaceContainer` cleanup in `WireHandle.dispose()`. All straightforward once found — the kind of things that compound silently until someone audits the lifecycle paths.

The branch is at the final verification stage now. Typecheck clean, full suite green. What remains is rebase onto current main and the close sequence.
