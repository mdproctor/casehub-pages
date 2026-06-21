# Navigation Components Distinct Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each navigation type (tabs, pills, tree, menu, tiles, sidebar) visually distinct instead of rendering identically as pill buttons.

**Architecture:** CSS-first for tabs/pills/menu (same DOM, different styles). New wire functions for tree (nested `<ul>/<li>`) and tiles (card grid). Nav-desugar synthesizes hierarchical `/`-delimited slot names for tree. Tree is self-contained like sidebar (`grid: auto 1fr`), tiles is cards-above-content like tabs.

**Tech Stack:** TypeScript, Vitest, CSS (injected `<style>` element)

## Global Constraints

- All nav types are already in `LAZY_TYPES` and `INTERACTIVE_TYPES` — no changes to those sets.
- Page names MUST NOT contain `/` — hierarchy is in slot keys only.
- Tree ignores `targetDivId` — self-contained layout only.
- No `ViewState.expandedNodes` integration — deferred.
- Build with `yarn build:packages && yarn build:components` after changes to `pages-ui` or `pages-component`.
- Run tests with `yarn workspace @casehub/pages-component run test` and `yarn workspace @casehub/pages-ui run test`.
- Typecheck with `yarn typecheck`.

---

### Task 1: Parser — Add SIDEBAR to NAV_TYPE_MAP and hierarchical slot synthesis for tree

**Files:**
- Modify: `packages/pages-ui/src/parser/component-desugar.ts:7-14` (NAV_TYPE_MAP)
- Modify: `packages/pages-ui/src/parser/nav-desugar.ts:33-91` (resolveNavigation), `135-173` (resolveNavGroup), `233-251` (extractPageNames)
- Create: `packages/pages-ui/src/parser/nav-desugar.test.ts`

**Interfaces:**
- Consumes: `Component` type from `@casehub/pages-component`, existing `NavTreeGroup`/`NavTreeChild` interfaces (nav-desugar.ts:3-18)
- Produces: Modified `resolveNavGroup` that produces hierarchical slot keys for tree; new `extractHierarchicalPageNames(group: NavTreeGroup, prefix?: string): Array<{slotKey: string, pageName: string}>` function

- [ ] **Step 1: Write tests for SIDEBAR in NAV_TYPE_MAP**

In `packages/pages-ui/src/parser/component-desugar.test.ts` (new file if needed — check existing backwards-compat.test.ts for import patterns):

```typescript
// Add to existing test file or create new:
import { desugarComponent } from "./component-desugar.js";

it("SIDEBAR maps to sidebar type", () => {
  const result = desugarComponent({ type: "SIDEBAR" });
  expect(result.type).toBe("sidebar");
});
```

- [ ] **Step 2: Add SIDEBAR to NAV_TYPE_MAP**

In `packages/pages-ui/src/parser/component-desugar.ts`, add to `NAV_TYPE_MAP`:

```typescript
const NAV_TYPE_MAP: Record<string, string> = {
  TABS: "tabs",
  PILLS: "pills",
  TREE: "tree",
  MENU: "menu",
  CAROUSEL: "carousel",
  TILES: "tiles",
  SIDEBAR: "sidebar",
};
```

- [ ] **Step 3: Run test to verify SIDEBAR mapping passes**

Run: `yarn workspace @casehub/pages-ui run test`

- [ ] **Step 4: Write tests for hierarchical slot name synthesis**

Create `packages/pages-ui/src/parser/nav-desugar.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveNavigation } from "./nav-desugar.js";
import type { Component } from "@casehub/pages-component/dist/model/types.js";

function makePage(name: string): Component {
  return { type: "page", props: { name } };
}

describe("resolveNavigation — tree hierarchical slot names", () => {
  const pages = [
    makePage("Dashboard"),
    makePage("Profile"),
    makePage("Security"),
    makePage("Logging"),
    makePage("Reports"),
  ];

  const navTree = {
    root_items: [{
      type: "GROUP",
      id: "MainNav",
      children: [
        { page: "Dashboard" },
        {
          type: "GROUP",
          id: "Settings",
          children: [
            { page: "Profile" },
            { page: "Security" },
            {
              type: "GROUP",
              id: "Advanced",
              children: [{ page: "Logging" }],
            },
          ],
        },
        { page: "Reports" },
      ],
    }],
  };

  it("tree type produces hierarchical slot keys from nested GROUPs", () => {
    const components: Component[] = [{
      type: "tree",
      props: { navGroupId: "MainNav" },
    }];

    const resolved = resolveNavigation(components, pages, navTree);
    const treeComp = resolved[0]!;
    const slotKeys = Object.keys(treeComp.slots!);

    expect(slotKeys).toEqual([
      "Dashboard",
      "Settings/Profile",
      "Settings/Security",
      "Settings/Advanced/Logging",
      "Reports",
    ]);
  });

  it("tree slot keys map to correct pages (flat page name lookup)", () => {
    const components: Component[] = [{
      type: "tree",
      props: { navGroupId: "MainNav" },
    }];

    const resolved = resolveNavigation(components, pages, navTree);
    const treeComp = resolved[0]!;
    const profileSlot = treeComp.slots!["Settings/Profile"]!;

    expect(profileSlot).toHaveLength(1);
    expect(profileSlot[0]!.props?.["name"]).toBe("Profile");
  });

  it("non-tree type produces flat slot keys (no hierarchy)", () => {
    const components: Component[] = [{
      type: "tabs",
      props: { navGroupId: "MainNav" },
    }];

    const resolved = resolveNavigation(components, pages, navTree);
    const tabsComp = resolved[0]!;
    const slotKeys = Object.keys(tabsComp.slots!);

    expect(slotKeys).toEqual([
      "Dashboard", "Profile", "Security", "Logging", "Reports",
    ]);
  });

  it("deep nesting (3+ levels) produces full-path slot keys", () => {
    const components: Component[] = [{
      type: "tree",
      props: { navGroupId: "MainNav" },
    }];

    const resolved = resolveNavigation(components, pages, navTree);
    const treeComp = resolved[0]!;

    expect(treeComp.slots!["Settings/Advanced/Logging"]).toBeDefined();
    expect(treeComp.slots!["Settings/Advanced/Logging"]![0]!.props?.["name"]).toBe("Logging");
  });

  it("same page under multiple groups produces distinct slots", () => {
    const multiNavTree = {
      root_items: [{
        type: "GROUP",
        id: "Multi",
        children: [
          { type: "GROUP", id: "A", children: [{ page: "Profile" }] },
          { type: "GROUP", id: "B", children: [{ page: "Profile" }] },
        ],
      }],
    };

    const components: Component[] = [{
      type: "tree",
      props: { navGroupId: "Multi" },
    }];

    const resolved = resolveNavigation(components, pages, multiNavTree);
    const treeComp = resolved[0]!;

    expect(treeComp.slots!["A/Profile"]).toBeDefined();
    expect(treeComp.slots!["B/Profile"]).toBeDefined();
  });

  it("tree without navTree falls back to flat slot names", () => {
    const components: Component[] = [{
      type: "tree",
      props: { navGroupId: "Missing" },
    }];

    const resolved = resolveNavigation(components, pages, undefined);
    const treeComp = resolved[0]!;
    const slotKeys = Object.keys(treeComp.slots!);

    expect(slotKeys).toEqual([
      "Dashboard", "Profile", "Security", "Logging", "Reports",
    ]);
  });

  it("tree ignores targetDivId (self-contained)", () => {
    const components: Component[] = [
      {
        type: "tree",
        props: { navGroupId: "MainNav", targetDivId: "some_div" },
      },
      {
        type: "slot-target",
        props: { id: "some_div" },
      },
    ];

    const resolved = resolveNavigation(components, pages, navTree);

    // Tree keeps its slots (targetDivId ignored)
    const treeComp = resolved.find(c => c.type === "tree")!;
    expect(treeComp.slots).toBeDefined();
    expect(Object.keys(treeComp.slots!).length).toBeGreaterThan(0);

    // slot-target is filtered out
    expect(resolved.find(c => c.type === "slot-target")).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `yarn workspace @casehub/pages-ui run test`
Expected: 7 failures (hierarchical features not implemented yet)

- [ ] **Step 6: Implement extractHierarchicalPageNames and modify resolveNavGroup**

In `packages/pages-ui/src/parser/nav-desugar.ts`, add after `extractPageNames`:

```typescript
interface HierarchicalEntry {
  readonly slotKey: string;
  readonly pageName: string;
}

function extractHierarchicalPageNames(
  group: NavTreeGroup,
  prefix?: string,
): HierarchicalEntry[] {
  const entries: HierarchicalEntry[] = [];
  if (!group.children) return entries;

  for (const child of group.children) {
    if (child.page) {
      const slotKey = prefix ? `${prefix}/${child.page}` : child.page;
      entries.push({ slotKey, pageName: child.page });
    }
    if (child.type === "GROUP" && child.children) {
      const childPrefix = prefix ? `${prefix}/${child.id}` : child.id!;
      entries.push(
        ...extractHierarchicalPageNames(child as NavTreeGroup, childPrefix),
      );
    }
  }

  return entries;
}
```

Modify `resolveNavGroup` to use hierarchical names for tree:

```typescript
function resolveNavGroup(
  navComponent: Component,
  pages: Component[],
  navTree: NavTree | undefined,
): Component {
  const groupId = navComponent.props?.["navGroupId"] as string;
  const isTree = navComponent.type === "tree";

  const group = navTree ? findGroup(navTree, groupId) : undefined;

  const slots: Record<string, Component[]> = {};

  if (group && isTree) {
    const entries = extractHierarchicalPageNames(group);
    for (const { slotKey, pageName } of entries) {
      const matchingPage = pages.find((p) => p.props?.["name"] === pageName);
      if (matchingPage) {
        slots[slotKey] = [matchingPage];
      }
    }
  } else {
    const pageNames: string[] = group
      ? extractPageNames(group)
      : pages
          .filter((p) => p.type === "page")
          .map((p) => p.props?.["name"] as string)
          .filter(Boolean);

    for (const pageName of pageNames) {
      const matchingPage = pages.find((p) => p.props?.["name"] === pageName);
      if (matchingPage) {
        slots[pageName] = [matchingPage];
      }
    }
  }

  const { navGroupId, targetDivId, ...cleanProps } = navComponent.props as Record<
    string,
    unknown
  >;

  return {
    ...navComponent,
    props: cleanProps,
    slots,
  };
}
```

Modify `resolveNavigation` to ignore `targetDivId` for tree — in the `if (component.props?.["navGroupId"])` block, add the tree check:

```typescript
if (component.props?.["navGroupId"]) {
  const targetDivId = component.props["targetDivId"] as string | undefined;
  if (targetDivId && component.type !== "tree") {
    // existing targetDivId handling...
  }
  return resolveNavGroup(component, pages, typedNavTree);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `yarn workspace @casehub/pages-ui run test`
Expected: All pass

- [ ] **Step 8: Typecheck**

Run: `yarn typecheck`

- [ ] **Step 9: Commit**

```
git add packages/pages-ui/src/parser/component-desugar.ts packages/pages-ui/src/parser/nav-desugar.ts packages/pages-ui/src/parser/nav-desugar.test.ts
git commit -m "feat: add SIDEBAR to parser and hierarchical slot names for tree nav

Refs casehubio/casehub-pages#5"
```

---

### Task 2: Layout — Add tree to LAYOUT_TYPES with grid: auto 1fr

**Files:**
- Modify: `packages/pages-component/src/renderer/layout.ts:5-8` (LAYOUT_TYPES set), `43-45` (switch cases)

**Interfaces:**
- Consumes: `isLayoutType(type: string): boolean` (unchanged signature)
- Produces: `isLayoutType("tree")` returns true; `applyLayoutCSS` for tree sets `grid: auto 1fr`

- [ ] **Step 1: Write failing tests**

Add to `packages/pages-component/src/renderer/interactive.test.ts` (or create layout test section — the file already imports from the package):

Actually, `isLayoutType` and `applyLayoutCSS` are not exported from interactive.ts. Add a test in a new section of an existing test file, or test indirectly through `renderComponent`. Since `layout.ts` exports both functions, create a focused test:

```typescript
// Add to interactive.test.ts or a new layout.test.ts:
import { isLayoutType, applyLayoutCSS } from "./layout.js";

describe("layout — tree and tiles", () => {
  it("isLayoutType('tree') returns true", () => {
    expect(isLayoutType("tree")).toBe(true);
  });

  it("isLayoutType('tiles') returns false", () => {
    expect(isLayoutType("tiles")).toBe(false);
  });

  it("applyLayoutCSS for tree sets grid: auto 1fr", () => {
    const el = document.createElement("div");
    applyLayoutCSS(el, { type: "tree" });
    expect(el.style.display).toBe("grid");
    expect(el.style.gridTemplateColumns).toBe("auto 1fr");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehub/pages-component run test`

- [ ] **Step 3: Implement**

In `packages/pages-component/src/renderer/layout.ts`:

Add `"tree"` to `LAYOUT_TYPES`:
```typescript
const LAYOUT_TYPES = new Set([
  "grid", "columns", "rows", "stack",
  "tabs", "pills", "accordion", "carousel",
  "sidebar", "tree", "panel", "app-grid",
]);
```

Add case in `applyLayoutCSS` switch, alongside sidebar:
```typescript
    case "sidebar":
    case "tree":
      element.style.display = "grid";
      element.style.gridTemplateColumns = "auto 1fr";
      break;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @casehub/pages-component run test`

- [ ] **Step 5: Commit**

```
git add packages/pages-component/src/renderer/layout.ts packages/pages-component/src/renderer/interactive.test.ts
git commit -m "feat: add tree to LAYOUT_TYPES with grid: auto 1fr

Refs casehubio/casehub-pages#5"
```

---

### Task 3: Interactive — CSS differentiation for tabs and menu, rename injectTabStyles

**Files:**
- Modify: `packages/pages-component/src/renderer/interactive.ts:5-59` (style injection), `78-84` (switch), `183-225` (wireTabs)

**Interfaces:**
- Consumes: Existing `wireInteractivity` public API (unchanged)
- Produces: `injectNavStyles` (renamed from `injectTabStyles`). `wireTabs` CSS class mapping simplified to tabs/pills/menu only. Tabs get `.casehub-tabs` underline CSS, menu gets `.casehub-menu` bar CSS.

- [ ] **Step 1: Write failing tests for tabs and menu CSS classes**

Add to `packages/pages-component/src/renderer/interactive.test.ts`:

```typescript
describe("wireInteractivity — tabs CSS", () => {
  it("has casehub-tabs CSS class on bar", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tabs", ["A", "B"], panels);
    const bar = container.querySelector("[data-tab-bar]") as HTMLElement;
    expect(bar.classList.contains("casehub-tabs")).toBe(true);
  });
});

describe("wireInteractivity — menu CSS", () => {
  it("has casehub-menu CSS class on bar", () => {
    const { container, panels } = makeSlotContainers(["File", "Edit"]);
    wireInteractivity(container, "menu", ["File", "Edit"], panels);
    const bar = container.querySelector("[data-tab-bar]") as HTMLElement;
    expect(bar.classList.contains("casehub-menu")).toBe(true);
  });

  it("first item visible by default, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "menu", ["A", "B"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).toBe("none");
  });
});
```

- [ ] **Step 2: Run tests — menu class test should fail (currently gets casehub-menu but via wireTabs which will be updated)**

Run: `yarn workspace @casehub/pages-component run test`
Note: the menu class test might already pass since wireTabs already assigns casehub-menu. Verify.

- [ ] **Step 3: Rename injectTabStyles to injectNavStyles and add CSS rules**

In `packages/pages-component/src/renderer/interactive.ts`:

Rename `injectTabStyles` → `injectNavStyles`. Add CSS rules for tabs underline and menu bar after the existing sidebar CSS:

```typescript
let stylesInjected = false;
function injectNavStyles(doc: Document): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = doc.createElement("style");
  style.textContent = `
[data-tab-bar] {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0 12px;
}
[data-tab-bar] button[data-slot] {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 16px;
  border: 1px solid #d0d5dd;
  border-radius: 20px;
  background: #fff;
  color: #475467;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.4;
}
[data-tab-bar] button[data-slot]:hover {
  background: #f2f4f7;
  border-color: #98a2b3;
  color: #344054;
}
[data-tab-bar] button[data-slot][data-active] {
  background: #4f46e5;
  border-color: #4f46e5;
  color: #fff;
}
[data-tab-bar] button[data-slot][data-active]:hover {
  background: #4338ca;
  border-color: #4338ca;
}
.casehub-sidebar {
  flex-direction: column;
  gap: 2px;
  padding: 0 12px 0 0;
  border-right: 1px solid #e5e7eb;
  min-width: 140px;
}
.casehub-sidebar button[data-slot] {
  border-radius: 8px;
  border: none;
  text-align: left;
  padding: 8px 12px;
}
.casehub-tabs {
  gap: 0;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 0;
}
.casehub-tabs button[data-slot] {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 8px 16px;
  border-bottom: 2px solid transparent;
}
.casehub-tabs button[data-slot]:hover {
  background: #f9fafb;
  border-color: transparent;
  border-bottom-color: #d0d5dd;
}
.casehub-tabs button[data-slot][data-active] {
  background: transparent;
  color: #4f46e5;
  border-bottom-color: #4f46e5;
}
.casehub-tabs button[data-slot][data-active]:hover {
  background: #f5f3ff;
}
.casehub-menu {
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  gap: 0;
  padding: 0;
}
.casehub-menu button[data-slot] {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 8px 14px;
  font-size: 13px;
}
.casehub-menu button[data-slot]:hover {
  background: #f2f4f7;
  border-color: transparent;
}
.casehub-menu button[data-slot][data-active] {
  background: transparent;
  font-weight: 600;
  color: #1f2937;
  border-bottom: 2px solid #4f46e5;
}
.casehub-tree-nav {
  flex-direction: column;
  padding: 0 12px 0 0;
  border-right: 1px solid #e5e7eb;
  min-width: 160px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
}
.casehub-tree-nav ul { list-style: none; margin: 0; padding: 0; }
.casehub-tree-nav li { margin: 0; }
.casehub-tree-nav .tree-group-label {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; cursor: pointer; user-select: none;
  color: #475467; font-weight: 500;
}
.casehub-tree-nav .tree-group-label:hover { background: #f2f4f7; border-radius: 4px; }
.casehub-tree-nav .tree-leaf {
  display: block; padding: 4px 8px 4px 24px;
  cursor: pointer; color: #475467; text-decoration: none;
  border-radius: 4px;
}
.casehub-tree-nav .tree-leaf:hover { background: #f2f4f7; }
.casehub-tree-nav .tree-leaf[data-active] { background: #ede9fe; color: #4f46e5; font-weight: 500; }
.casehub-tree-nav .tree-children { padding-left: 16px; }
.casehub-tiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  padding: 0 0 16px;
}
.casehub-tiles-grid .tile-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #475467;
  transition: all 0.15s ease;
}
.casehub-tiles-grid .tile-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-color: #98a2b3; }
.casehub-tiles-grid .tile-card[data-active] { border-color: #4f46e5; color: #4f46e5; box-shadow: 0 0 0 1px #4f46e5; }
`;
  doc.head.appendChild(style);
}
```

Update all callers of `injectTabStyles` to `injectNavStyles` (wireTabs, wireSidebar).

Simplify the wireTabs className ternary (remove tree and tiles cases):

```typescript
  bar.className = type === "pills" ? "casehub-pills"
    : type === "menu" ? "casehub-menu"
    : "casehub-tabs";
```

- [ ] **Step 4: Run tests**

Run: `yarn workspace @casehub/pages-component run test`

- [ ] **Step 5: Commit**

```
git add packages/pages-component/src/renderer/interactive.ts packages/pages-component/src/renderer/interactive.test.ts
git commit -m "feat: rename injectTabStyles to injectNavStyles, add tabs underline and menu bar CSS

Refs casehubio/casehub-pages#5"
```

---

### Task 4: Interactive — wireTree implementation

**Files:**
- Modify: `packages/pages-component/src/renderer/interactive.ts` (add wireTree, update switch)
- Modify: `packages/pages-component/src/renderer/interactive.test.ts`

**Interfaces:**
- Consumes: `buildSwap`, `renderInitialSlot`, `applyOneVisible`, `injectNavStyles`, `LazyConfig` — all from same file
- Produces: `wireTree(container, slotNames, panels, doc, lazy?)` — builds nested `<ul>/<li>` from `/`-separated slot names

- [ ] **Step 1: Write failing tests for wireTree**

Add to `packages/pages-component/src/renderer/interactive.test.ts`:

```typescript
describe("wireInteractivity — tree", () => {
  it("builds nested ul/li from /-separated slot names", () => {
    const { container, panels } = makeSlotContainers([
      "Dashboard", "Settings/Profile", "Settings/Security", "Reports",
    ]);
    wireInteractivity(container, "tree", [
      "Dashboard", "Settings/Profile", "Settings/Security", "Reports",
    ], panels);

    const nav = container.querySelector(".casehub-tree-nav") as HTMLElement;
    expect(nav).toBeTruthy();

    const topItems = nav.querySelectorAll(":scope > ul > li");
    expect(topItems).toHaveLength(3); // Dashboard, Settings (group), Reports
  });

  it("displays last segment as leaf label, group id as parent label", () => {
    const { container, panels } = makeSlotContainers([
      "Settings/Profile", "Settings/Security",
    ]);
    wireInteractivity(container, "tree", [
      "Settings/Profile", "Settings/Security",
    ], panels);

    const nav = container.querySelector(".casehub-tree-nav") as HTMLElement;
    const groupLabel = nav.querySelector(".tree-group-label");
    expect(groupLabel!.textContent).toContain("Settings");

    const leaves = nav.querySelectorAll(".tree-leaf");
    expect(leaves).toHaveLength(2);
    expect(leaves[0]!.textContent).toBe("Profile");
    expect(leaves[1]!.textContent).toBe("Security");
  });

  it("flat slot names render as flat ul (no nesting)", () => {
    const { container, panels } = makeSlotContainers(["A", "B", "C"]);
    wireInteractivity(container, "tree", ["A", "B", "C"], panels);

    const nav = container.querySelector(".casehub-tree-nav") as HTMLElement;
    const leaves = nav.querySelectorAll(".tree-leaf");
    expect(leaves).toHaveLength(3);

    // No group labels
    expect(nav.querySelector(".tree-group-label")).toBeNull();
  });

  it("first leaf visible by default, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tree", ["A", "B"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).toBe("none");
  });

  it("leaf click shows target panel, hides others", () => {
    const { container, panels } = makeSlotContainers(["A", "Settings/B"]);
    wireInteractivity(container, "tree", ["A", "Settings/B"], panels);

    const leaves = container.querySelectorAll(".tree-leaf");
    (leaves[1] as HTMLElement).click();

    expect(panels.get("A")!.style.display).toBe("none");
    expect(panels.get("Settings/B")!.style.display).not.toBe("none");
  });

  it("leaf click dispatches casehub-slot-change with full hierarchical key", () => {
    const { container, panels } = makeSlotContainers(["A", "Settings/B"]);
    container.dataset.componentId = "tree-1";
    wireInteractivity(container, "tree", ["A", "Settings/B"], panels);

    const events: Array<{ activeSlot: string; containerId: string }> = [];
    container.addEventListener("casehub-slot-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);

    const leaves = container.querySelectorAll(".tree-leaf");
    (leaves[1] as HTMLElement).click();

    expect(events).toHaveLength(1);
    expect(events[0]!.activeSlot).toBe("Settings/B");
    expect(events[0]!.containerId).toBe("tree-1");
  });

  it("expand/collapse toggles group children visibility", () => {
    const { container, panels } = makeSlotContainers([
      "Settings/Profile", "Settings/Security",
    ]);
    wireInteractivity(container, "tree", [
      "Settings/Profile", "Settings/Security",
    ], panels);

    const groupLabel = container.querySelector(".tree-group-label") as HTMLElement;
    const children = container.querySelector(".tree-children") as HTMLElement;

    // Top-level groups start expanded
    expect(children.style.display).not.toBe("none");

    // Click to collapse
    groupLabel.click();
    expect(children.style.display).toBe("none");

    // Click to expand
    groupLabel.click();
    expect(children.style.display).not.toBe("none");
  });

  it("self-contained: tree nav and panels are children of the container", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tree", ["A", "B"], panels);

    const nav = container.querySelector(".casehub-tree-nav");
    expect(nav!.parentElement).toBe(container);
    expect(panels.get("A")!.parentElement).toBe(container);
  });

  it("programmatic swap auto-expands collapsed parent groups", () => {
    const { container, panels } = makeSlotContainers([
      "Dashboard", "Settings/Profile",
    ]);
    wireInteractivity(container, "tree", [
      "Dashboard", "Settings/Profile",
    ], panels);

    // Collapse the Settings group
    const groupLabel = container.querySelector(".tree-group-label") as HTMLElement;
    groupLabel.click();
    const children = container.querySelector(".tree-children") as HTMLElement;
    expect(children.style.display).toBe("none");

    // Programmatic swap to a leaf inside the collapsed group
    const swap = slotSwapRegistry.get(container)!;
    swap("Settings/Profile");

    // Group should be auto-expanded
    expect(children.style.display).not.toBe("none");
    expect(panels.get("Settings/Profile")!.style.display).not.toBe("none");
  });

  it("deep nesting: 3-level tree renders correctly", () => {
    const { container, panels } = makeSlotContainers([
      "Settings/Advanced/Logging",
    ]);
    wireInteractivity(container, "tree", [
      "Settings/Advanced/Logging",
    ], panels);

    const nav = container.querySelector(".casehub-tree-nav") as HTMLElement;
    // Settings > Advanced > Logging
    const groupLabels = nav.querySelectorAll(".tree-group-label");
    expect(groupLabels).toHaveLength(2); // Settings and Advanced
    expect(groupLabels[0]!.textContent).toContain("Settings");
    expect(groupLabels[1]!.textContent).toContain("Advanced");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehub/pages-component run test`

- [ ] **Step 3: Implement wireTree**

In `packages/pages-component/src/renderer/interactive.ts`, add the `wireTree` function and update the switch:

Update switch in `wireInteractivity`:
```typescript
    case "tabs":
    case "pills":
    case "menu":
      wireTabs(container, type, slotNames, panels, doc, lazy);
      break;
    case "tree":
      wireTree(container, slotNames, panels, doc, lazy);
      break;
    case "tiles":
      wireTiles(container, slotNames, panels, doc, lazy);
      break;
```

(wireTiles is a placeholder for now — Task 5 implements it. Add a stub:)
```typescript
function wireTiles(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
  lazy?: LazyConfig,
): void {
  // Stub — implemented in Task 5
  wireTabs(container, "tiles", slotNames, panels, doc, lazy);
}
```

Add `wireTree`:

```typescript
interface TreeNode {
  label: string;
  slotKey?: string;       // leaf nodes have a slot key
  children: TreeNode[];
}

function buildTreeStructure(slotNames: readonly string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const slotKey of slotNames) {
    const segments = slotKey.split("/");
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const isLeaf = i === segments.length - 1;

      if (isLeaf) {
        current.push({ label: segment, slotKey, children: [] });
      } else {
        let group = current.find(n => n.label === segment && !n.slotKey);
        if (!group) {
          group = { label: segment, children: [] };
          current.push(group);
        }
        current = group.children;
      }
    }
  }

  return root;
}

function wireTree(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
  lazy?: LazyConfig,
): void {
  injectNavStyles(doc);

  const nav = doc.createElement("div");
  nav.className = "casehub-tree-nav";

  const treeStructure = buildTreeStructure(slotNames);
  const groupElements = new Map<string, HTMLElement>(); // slotKey prefix → children container

  function renderTreeNodes(nodes: TreeNode[], parentUl: HTMLElement, depth: number): void {
    for (const node of nodes) {
      const li = doc.createElement("li");

      if (node.slotKey) {
        // Leaf node
        const leaf = doc.createElement("span");
        leaf.className = "tree-leaf";
        leaf.dataset.slot = node.slotKey;
        leaf.textContent = node.label;
        leaf.addEventListener("click", () => {
          if (node.slotKey) swap(node.slotKey);
        });
        li.appendChild(leaf);
      } else {
        // Group node
        const label = doc.createElement("span");
        label.className = "tree-group-label";
        label.textContent = (depth === 0 ? "▾ " : "▾ ") + node.label;

        const childrenUl = doc.createElement("ul");
        childrenUl.className = "tree-children";
        // Top-level expanded, nested collapsed
        if (depth > 0) childrenUl.style.display = "none";

        label.addEventListener("click", () => {
          const isCollapsed = childrenUl.style.display === "none";
          childrenUl.style.display = isCollapsed ? "" : "none";
          label.textContent = (isCollapsed ? "▾ " : "▸ ") + node.label;
        });

        li.appendChild(label);
        li.appendChild(childrenUl);

        // Store reference for auto-expand
        groupElements.set(node.label, childrenUl);

        renderTreeNodes(node.children, childrenUl, depth + 1);
      }

      parentUl.appendChild(li);
    }
  }

  const rootUl = doc.createElement("ul");
  renderTreeNodes(treeStructure, rootUl, 0);
  nav.appendChild(rootUl);

  container.insertBefore(nav, container.firstChild);

  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  function updateActiveLeaf(slotName: string): void {
    for (const leaf of nav.querySelectorAll<HTMLElement>(".tree-leaf")) {
      if (leaf.dataset.slot === slotName) {
        leaf.dataset.active = "";
      } else {
        delete leaf.dataset.active;
      }
    }
  }

  function autoExpandParents(slotName: string): void {
    const segments = slotName.split("/");
    if (segments.length <= 1) return;
    // Walk ancestor groups and expand any that are collapsed
    for (let i = 0; i < segments.length - 1; i++) {
      const groupLabel = segments[i]!;
      const childrenEl = groupElements.get(groupLabel);
      if (childrenEl && childrenEl.style.display === "none") {
        childrenEl.style.display = "";
        const labelEl = childrenEl.previousElementSibling as HTMLElement | null;
        if (labelEl?.classList.contains("tree-group-label")) {
          labelEl.textContent = "▾ " + groupLabel;
        }
      }
    }
  }

  const swap = buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; },
    (slotName) => {
      updateActiveLeaf(slotName);
      autoExpandParents(slotName);
    },
  );

  // Mark initial active leaf
  updateActiveLeaf(currentSlot);
}
```

- [ ] **Step 4: Run tests**

Run: `yarn workspace @casehub/pages-component run test`

- [ ] **Step 5: Typecheck**

Run: `yarn typecheck`

- [ ] **Step 6: Commit**

```
git add packages/pages-component/src/renderer/interactive.ts packages/pages-component/src/renderer/interactive.test.ts
git commit -m "feat: implement wireTree with hierarchical slot parsing and expand/collapse

Refs casehubio/casehub-pages#5"
```

---

### Task 5: Interactive — wireTiles implementation

**Files:**
- Modify: `packages/pages-component/src/renderer/interactive.ts` (replace wireTiles stub)
- Modify: `packages/pages-component/src/renderer/interactive.test.ts`

**Interfaces:**
- Consumes: `buildSwap`, `renderInitialSlot`, `applyOneVisible`, `injectNavStyles`, `LazyConfig`
- Produces: `wireTiles(container, slotNames, panels, doc, lazy?)` — builds CSS grid of clickable cards

- [ ] **Step 1: Write failing tests for wireTiles**

Add to `packages/pages-component/src/renderer/interactive.test.ts`:

```typescript
describe("wireInteractivity — tiles", () => {
  it("builds grid of card divs", () => {
    const { container, panels } = makeSlotContainers(["Dashboard", "Reports"]);
    wireInteractivity(container, "tiles", ["Dashboard", "Reports"], panels);

    const grid = container.querySelector(".casehub-tiles-grid") as HTMLElement;
    expect(grid).toBeTruthy();

    const cards = grid.querySelectorAll(".tile-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toBe("Dashboard");
    expect(cards[1]!.textContent).toBe("Reports");
  });

  it("first panel visible by default, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tiles", ["A", "B"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).toBe("none");
  });

  it("card click shows target panel, hides others", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tiles", ["A", "B"], panels);

    const cards = container.querySelectorAll(".tile-card");
    (cards[1] as HTMLElement).click();

    expect(panels.get("A")!.style.display).toBe("none");
    expect(panels.get("B")!.style.display).not.toBe("none");
  });

  it("card click dispatches casehub-slot-change", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    container.dataset.componentId = "tiles-1";
    wireInteractivity(container, "tiles", ["A", "B"], panels);

    const events: Array<{ activeSlot: string }> = [];
    container.addEventListener("casehub-slot-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);

    const cards = container.querySelectorAll(".tile-card");
    (cards[1] as HTMLElement).click();

    expect(events).toHaveLength(1);
    expect(events[0]!.activeSlot).toBe("B");
  });

  it("active card gets data-active attribute", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tiles", ["A", "B"], panels);

    const cards = container.querySelectorAll(".tile-card");
    expect((cards[0] as HTMLElement).dataset.active).toBeDefined();
    expect((cards[1] as HTMLElement).dataset.active).toBeUndefined();

    (cards[1] as HTMLElement).click();
    expect((cards[0] as HTMLElement).dataset.active).toBeUndefined();
    expect((cards[1] as HTMLElement).dataset.active).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehub/pages-component run test`

- [ ] **Step 3: Implement wireTiles (replace the stub)**

```typescript
function wireTiles(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
  lazy?: LazyConfig,
): void {
  injectNavStyles(doc);

  const grid = doc.createElement("div");
  grid.className = "casehub-tiles-grid";

  slotNames.forEach((name) => {
    const card = doc.createElement("div");
    card.className = "tile-card";
    card.dataset.slot = name;
    card.textContent = name;
    grid.appendChild(card);
  });

  container.insertBefore(grid, container.firstChild);

  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  function updateCards(activeSlot: string): void {
    for (const card of grid.querySelectorAll<HTMLElement>(".tile-card")) {
      if (card.dataset.slot === activeSlot) {
        card.dataset.active = "";
      } else {
        delete card.dataset.active;
      }
    }
  }

  const swap = buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; },
    (slotName) => { updateCards(slotName); },
  );

  // Mark initial active card
  updateCards(currentSlot);

  grid.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest(".tile-card") as HTMLElement | null;
    if (target?.dataset.slot) {
      swap(target.dataset.slot);
    }
  });
}
```

- [ ] **Step 4: Run tests**

Run: `yarn workspace @casehub/pages-component run test`

- [ ] **Step 5: Typecheck and full test suite**

Run: `yarn typecheck && yarn workspace @casehub/pages-component run test && yarn workspace @casehub/pages-ui run test && yarn workspace @casehub/pages-runtime run test`

- [ ] **Step 6: Commit**

```
git add packages/pages-component/src/renderer/interactive.ts packages/pages-component/src/renderer/interactive.test.ts
git commit -m "feat: implement wireTiles with card grid and active state

Refs casehubio/casehub-pages#5"
```

---

### Task 6: Example Dashboard and Integration Test

**Files:**
- Modify: `examples/dashboards/Basic Usage/Navigation Rebinding.dash.yml`
- Create: `examples/dashboards/Basic Usage/settings-profile.dash.yml`
- Create: `examples/dashboards/Basic Usage/reports.dash.yml`
- Modify: `packages/pages-runtime/src/site.test.ts` (integration test)

**Interfaces:**
- Consumes: All previous tasks — parser, layout, interactive, nav-desugar
- Produces: Updated example demonstrating all nav types with distinct rendering; integration test confirming SIDEBAR and TREE types parse and render

- [ ] **Step 1: Create external include files**

Create `examples/dashboards/Basic Usage/settings-profile.dash.yml`:
```yaml
pages:
  - name: Profile Detail
    components:
      - html: >-
          <div style="padding: 16px">
            <h3>Profile Settings</h3>
            <p>Loaded from external file (settings-profile.dash.yml)</p>
            <p style="color: #6b7280; font-size: 13px">
              This page demonstrates src-based includes — the Profile page is defined
              in a separate file and loaded lazily at runtime.
            </p>
          </div>
```

Create `examples/dashboards/Basic Usage/reports.dash.yml`:
```yaml
pages:
  - name: Reports Detail
    components:
      - html: >-
          <div style="padding: 16px">
            <h3>Reports</h3>
            <p>Loaded from external file (reports.dash.yml)</p>
          </div>
```

- [ ] **Step 2: Update Navigation Rebinding example**

Rewrite `examples/dashboards/Basic Usage/Navigation Rebinding.dash.yml` to demonstrate all nav types with the three-level content hierarchy from the spec. Include self-contained tree (no targetDivId), sidebar variant, external src includes, and inline content.

The YAML should follow the structure in the spec's Example Dashboard section. Include variants for: Tree View, Tabs View, Menu View, Sidebar View, Tiles View, Carousel View.

- [ ] **Step 3: Write integration tests**

Add to `packages/pages-runtime/src/site.test.ts`:

```typescript
describe("loadSite — navigation type rendering", () => {
  it("SIDEBAR type parses and renders sidebar nav", async () => {
    const yaml = `
pages:
  - name: App
    components:
      - type: SIDEBAR
        properties:
          navGroupId: main
  - name: Overview
    components:
      - html: "Overview"
  - name: Detail
    components:
      - html: "Detail"
navTree:
  root_items:
    - type: GROUP
      id: main
      children:
        - page: Overview
        - page: Detail
`;
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, yaml);

    const sidebar = target.querySelector(".casehub-sidebar");
    expect(sidebar).not.toBeNull();
    const buttons = sidebar!.querySelectorAll("button[data-slot]");
    expect(buttons).toHaveLength(2);

    site.dispose();
    document.body.removeChild(target);
  });

  it("TREE type with nested groups renders hierarchical tree", async () => {
    const yaml = `
pages:
  - name: App
    components:
      - type: TREE
        properties:
          navGroupId: nav
  - name: Dashboard
    components:
      - html: "Dashboard"
  - name: Profile
    components:
      - html: "Profile"
  - name: Security
    components:
      - html: "Security"
navTree:
  root_items:
    - type: GROUP
      id: nav
      children:
        - page: Dashboard
        - type: GROUP
          id: Settings
          children:
            - page: Profile
            - page: Security
`;
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, yaml);

    const treeNav = target.querySelector(".casehub-tree-nav");
    expect(treeNav).not.toBeNull();

    const groupLabels = treeNav!.querySelectorAll(".tree-group-label");
    expect(groupLabels).toHaveLength(1);
    expect(groupLabels[0]!.textContent).toContain("Settings");

    const leaves = treeNav!.querySelectorAll(".tree-leaf");
    expect(leaves).toHaveLength(3); // Dashboard, Profile, Security

    site.dispose();
    document.body.removeChild(target);
  });
});
```

- [ ] **Step 4: Build everything and run all tests**

Run: `yarn build && yarn typecheck`
Run: `yarn workspace @casehub/pages-component run test`
Run: `yarn workspace @casehub/pages-ui run test`
Run: `yarn workspace @casehub/pages-runtime run test`

All must pass.

- [ ] **Step 5: Commit**

```
git add examples/ packages/pages-runtime/src/site.test.ts
git commit -m "feat: update Navigation Rebinding example with all distinct nav types

Closes casehubio/casehub-pages#5"
```
