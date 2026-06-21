# Navigation Components Distinct Rendering

**Issue:** casehubio/casehub-pages#5
**Date:** 2026-06-21

## Problem

Navigation types tabs, pills, tree, menu, and tiles all route through `wireTabs()` in `interactive.ts` and render as identical horizontal pill buttons. The types get distinct CSS class names (`casehub-tabs`, `casehub-tree`, etc.) but no CSS rules differentiate them.

Sidebar rendering is fully implemented — it has its own wire function (`wireSidebar`), CSS (`.casehub-sidebar`), layout CSS (`grid: auto 1fr` in `applyLayoutCSS`), and entries in `LAZY_TYPES`, `INTERACTIVE_TYPES`, and `LAYOUT_TYPES`. The only gap is the YAML parser: `NAV_TYPE_MAP` in `component-desugar.ts` is missing the `SIDEBAR` entry, so YAML dashboards can't declare `type: SIDEBAR`.

## Architecture

CSS-first with targeted DOM changes. Keep the shared `wireTabs()` for types that differ only in CSS (identical DOM structure), extract new wire functions for types that need different DOM structure.

| Type | Wire function | DOM structure | Change |
|------|--------------|--------------|--------|
| tabs | `wireTabs` (existing) | Horizontal button bar | CSS — underline active tab |
| pills | `wireTabs` (existing) | Horizontal button bar | None — already correct |
| menu | `wireTabs` (existing) | Horizontal button bar | CSS — menu bar styling |
| tree | `wireTree` (new) | Nested `<ul>/<li>` | New function + nav-desugar hierarchical slots + layout CSS |
| tiles | `wireTiles` (new) | CSS grid of cards | New function (internal grid, no container layout CSS) |
| sidebar | `wireSidebar` (existing) | Vertical button bar | Parser entry only |
| accordion | `wireAccordion` (existing) | Collapsible sections | None — already correct |
| carousel | `wireCarousel` (existing) | Prev/next arrows | None — already correct |

### Changes across files

**`component-desugar.ts`** — Add `SIDEBAR: "sidebar"` to `NAV_TYPE_MAP`.

**`interactive.ts`** — Three changes:
1. Rename `injectTabStyles` → `injectNavStyles`. Consolidates all nav CSS: existing pill-button base styles, existing sidebar styles (`.casehub-sidebar`), plus new tabs-underline, menu-bar, tree, and tiles styles. One `<style>` element, injected once.
2. Update `wireInteractivity` switch: route `tree` → `wireTree`, `tiles` → `wireTiles`. Remove `tree` and `tiles` from the `wireTabs` case. `menu` stays in `wireTabs`.
3. Add `wireTree` and `wireTiles` functions.

**`layout.ts`** — Add `tree` to `LAYOUT_TYPES`. Add `applyLayoutCSS` case:
- `tree`: `grid: auto 1fr` (same as sidebar — tree nav panel + content area in a self-contained two-column grid)

Tiles is NOT added to `LAYOUT_TYPES`. The tile card grid is internal to `wireTiles` — it creates a child element with CSS grid `auto-fit`, not a container layout. `isLayoutType` only gates `applyLayoutCSS` on the container, and tiles has no container layout need.

**`nav-desugar.ts`** — `resolveNavGroup` synthesizes hierarchical slot names when the nav component type is `tree` (see next section).

## Hierarchical Slot Names for Tree

### The problem

The Component model uses `slots: Record<string, Component[]>`. Slot keys come from page names via `resolveNavGroup` in `nav-desugar.ts`, which calls `extractPageNames()` to recursively flatten nested GROUP children into a flat list of page names. For tree navigation, this flattening loses the group hierarchy that the tree needs to render.

### The solution

`resolveNavGroup` synthesizes `/`-prefixed slot names from nested navTree groups when `navComponent.type === "tree"`. The group `id` becomes the path prefix. A new `extractHierarchicalPageNames(group)` function preserves the GROUP structure as `/`-delimited names.

Given this navTree:

```yaml
navTree:
  root_items:
    - type: GROUP
      id: MainNav
      children:
        - page: Dashboard
        - type: GROUP
          id: Settings
          children:
            - page: Profile
            - page: Security
            - type: GROUP
              id: Advanced
              children:
                - page: Logging
        - page: Reports
```

For a `type: TREE` component with `navGroupId: MainNav`, `resolveNavGroup` produces slots:

```
"Dashboard"                   → [Dashboard page]
"Settings/Profile"            → [Profile page]
"Settings/Security"           → [Security page]
"Settings/Advanced/Logging"   → [Logging page]
"Reports"                     → [Reports page]
```

The prefix is the full path of nested GROUP ids. Deep nesting produces multi-segment paths: a page inside `Settings > Advanced` gets `"Settings/Advanced/Logging"`, not `"Advanced/Logging"`.

**Slot keys are hierarchical, page lookups are flat.** The slot key `"Settings/Profile"` is used as the key in the `slots` record. The page lookup uses the flat leaf name `"Profile"` — `pages.find(p => p.props?.["name"] === "Profile")`. These are different strings.

Note: page names remain flat — the `/` convention is in slot keys only. This doesn't conflict with the "page names MUST NOT contain `/`" constraint from the dashboard model spec (§2).

If the same page appears under multiple groups (e.g., `"Settings/Profile"` and `"Admin/Profile"`), each hierarchical path gets its own slot pointing to the same page content. This is valid — the dashboard model spec (§2) only prohibits duplicate page names at the same nesting level.

**Display labels vs slot keys.** `wireTree` splits slot keys on `/` and uses only the last segment as the display label for leaf nodes, and the group name for parent nodes. `"Settings/Advanced/Logging"` renders as a tree with parent `Settings`, child `Advanced`, and leaf `Logging` — not the full path.

**Event payload.** When a leaf is clicked, `casehub-slot-change` carries the full hierarchical slot key as `activeSlot` (e.g., `"Settings/Profile"`), not the display label (`"Profile"`). The swap function looks up the slot in the panels map using this full key.

`wireTree` parses slot keys at render time to build the nested `<ul>/<li>` structure. No changes to the Component model.

For non-tree navigation types, `resolveNavGroup` continues to use `extractPageNames()` — flat slot names, current behavior.

**Tree without navTree.** When no navTree is present (or no matching group is found), `resolveNavGroup` falls back to all page names — flat, since there is no GROUP structure to derive hierarchy from. The tree renders as a flat vertical list.

### Tree with flat slots

If all slot names are flat (no `/` separators), tree renders as a flat vertical `<ul>` — a list of clickable items without indentation or disclosure triangles. This is distinct from sidebar (which uses buttons in a vertical bar with `border-right`).

### Tree layout — self-contained like sidebar

Tree follows the same self-contained pattern as sidebar. No `targetDivId` needed:

1. `applyLayoutCSS` sets `grid: auto 1fr` on the tree component's container
2. `renderNode` creates slot panel divs as children of the container
3. `wireTree` inserts the tree nav panel via `container.insertBefore(treePanel, container.firstChild)`
4. Result: `[tree-panel(auto)] [active-slot-panel(1fr)]` — self-contained two-column layout

The tree component owns both the navigation panel and the content area. YAML authors declare `type: TREE` with a `navGroupId` — no explicit column spans or `targetDivId` required.

**`targetDivId` is ignored for tree.** When `navComponent.type === "tree"`, `resolveNavigation` ignores `targetDivId` — tree is self-contained and does not support external content targets. Without this, a YAML author using `targetDivId` with tree would produce a broken layout: `applyLayoutCSS` sets `grid: auto 1fr` but the stripped-slots tree container has nothing in the second column.

### Expand/collapse behaviour

Top-level groups start expanded. Nested groups start collapsed. This is deterministic and requires no persistence.

When `activateSlot` triggers a tree leaf that's inside a collapsed group, `wireTree`'s swap function auto-expands parent groups to reveal the leaf. This ensures programmatic navigation (e.g., deep linking, `activateSlot` calls from other components) keeps the tree panel in sync with the active content.

`ViewState.expandedNodes` exists in the model for persistence, but ViewState integration is deferred. Rationale: expand/collapse state is ephemeral UI state — it resets on navigation anyway. Persistence adds complexity with no user-facing benefit until the platform has long-lived sessions.

## Visual Treatments

**Tabs** — Horizontal bar, no pill borders. Active tab gets indigo bottom border (2px underline). Inactive tabs are plain text with hover background.

**Pills** — No change. Current rounded-pill style is correct.

**Menu** — Horizontal bar with subtle background (`#f9fafb`), bottom border. Compact items, no rounded corners, no pill borders. Active item gets bolder text weight and accent bottom border.

**Sidebar** — Already correct (vertical, border-right, rounded items). Needs parser entry only.

**Tree** — Vertical collapsible tree in a side panel. Indented levels with disclosure triangles (`▸`/`▾`). Active leaf gets accent background. Same `grid: auto 1fr` layout as sidebar.

**Tiles** — Grid of cards with border, rounded corners, shadow on hover. Each card shows the slot name as a label. Active card gets accent border. `wireTiles` creates a card grid element with CSS `auto-fit` and `minmax(160px, 1fr)`. Spatial layout: cards above, content below — same pattern as tabs/pills/menu (chrome above content), not the side-by-side pattern of sidebar/tree. This is why tiles is not in LAYOUT_TYPES.

## Example Dashboard

The Navigation Rebinding example demonstrates three things: nested pages (page within page within page), external file includes via `src`, and visual differentiation across nav types.

### Structure

A top-level page uses pills to select a nav variant. Each variant renders the same three-level content hierarchy using a different nav type.

```
Root (index)
├── Dashboard (inline — HTML content)
├── Settings (inline container with nested nav)
│   ├── Profile (external file — settings-profile.dash.yml)
│   └── Security (inline — content)
└── Reports (external file — reports.dash.yml)
```

### YAML structure (tree variant)

```yaml
pages:
  - name: index
    components:
      - type: PILLS
        properties:
          navGroupId: Variants

  # Tree variant — self-contained, no targetDivId needed
  - name: "Tree View"
    components:
      - type: TREE
        properties:
          navGroupId: MainNav

  # Shared content pages
  - name: Dashboard
    components:
      - html: "<h2>Dashboard</h2><p>Inline content</p>"

  - name: Settings
    components:
      - type: TABS
        properties:
          navGroupId: SettingsPages

  - name: Profile
    components:
      - page: profile-detail
        src: settings-profile.dash.yml

  - name: Security
    components:
      - html: "<h2>Security Settings</h2><p>Inline content</p>"

  - name: Reports
    components:
      - page: reports-detail
        src: reports.dash.yml

navTree:
  root_items:
    - type: GROUP
      id: MainNav
      children:
        - page: Dashboard
        - type: GROUP
          id: Settings
          children:
            - page: Profile
            - page: Security
        - page: Reports

    - type: GROUP
      id: SettingsPages
      children:
        - page: Profile
        - page: Security

    - type: GROUP
      id: Variants
      children:
        - page: "Tree View"
        # ... other variants: Tabs View, Menu View, Sidebar View, etc.
```

The tree variant shows:
- `type: TREE` with `navGroupId: MainNav` — self-contained, no `targetDivId`. The tree component owns both the navigation panel and content area via `grid: auto 1fr`.
- The nested GROUP `Settings` produces hierarchical slots `"Settings/Profile"` and `"Settings/Security"` — `wireTree` renders these as a collapsible tree node.
- The Settings page itself uses `type: TABS` internally — page within page within page.
- Profile loads from external file via `src` — hybrid inline/external composition.

Each additional variant (tabs, menu, tiles, sidebar, carousel) wraps the same content pages with a different nav type, demonstrating visual differentiation.

## Testing

**Unit tests in `pages-component` (`interactive.test.ts`):**
- `wireTree` builds nested `<ul>/<li>` from `/`-separated slot names
- `wireTree` with flat slot names renders flat `<ul>` (no nesting, no disclosure triangles)
- `wireTree` expand/collapse toggles show/hide children
- `wireTree` leaf click dispatches `casehub-slot-change` with full hierarchical slot key as `activeSlot`
- `wireTree` displays last segment of slot key as node label (not full path)
- `wireTree` self-contained: tree panel and slot panels are both children of the container
- `wireTiles` builds grid of card divs with `auto-fit` layout
- `wireTiles` click dispatches `casehub-slot-change`
- `wireTabs` with type `"tabs"` gets `casehub-tabs` class
- `wireTabs` with type `"menu"` gets `casehub-menu` class
- Existing wireSidebar/wireCarousel/wireAccordion tests unchanged

**Unit tests in `pages-ui`:**
- `component-desugar.test.ts`: `SIDEBAR` maps to `"sidebar"` type
- `nav-desugar.test.ts`: `resolveNavGroup` with tree type + nested GROUP produces `/`-prefixed slot names
- `nav-desugar.test.ts`: `resolveNavGroup` with non-tree type + nested GROUP produces flat slot names (no regression)
- `nav-desugar.test.ts`: same page under multiple groups produces distinct hierarchical slots pointing to same page
- `nav-desugar.test.ts`: deep nesting (3+ levels) produces full-path slot keys (e.g., `"Settings/Advanced/Logging"`)
- `nav-desugar.test.ts`: tree without navTree falls back to flat slot names

**Unit tests in `pages-component` (`layout.test.ts` or inline):**
- `isLayoutType("tree")` returns true
- `isLayoutType("tiles")` returns false
- `applyLayoutCSS` for tree sets `grid: auto 1fr`

**Integration test in `pages-runtime`:**
- YAML dashboard with `type: SIDEBAR` parses and renders correctly
- YAML dashboard with `type: TREE` and nested navTree groups renders hierarchical tree with self-contained layout
