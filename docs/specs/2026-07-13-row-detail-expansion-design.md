# Row Detail Expansion for pages-table

**Date:** 2026-07-13
**Status:** Proposed
**Component:** `packages/pages-table`
**Tracking:** casehubio/casehub-pages#172
**Accessibility:** contributes to casehubio/casehub-pages#15

## Problem

`pages-table` has no mechanism for rendering arbitrary detail content below
a row when it is activated. Tree expansion renders child rows (same column
structure), and `pages-grouped-view` handles section-level expand/collapse,
but neither supports per-row detail panels — a full-width area below a
single row showing supplementary information.

The immediate consumer is `audit-trail-viewer` in `blocks-ui` (issue
casehubio/blocks-ui#47), which needs to show attestations, payloads, and
trace IDs below each audit entry row. But this is a general-purpose table
feature — order line items, log context, entity metadata all follow the
same pattern.

## Design

### API Surface

Three new properties on `PagesTable`:

```typescript
/**
 * Callback that returns detail content for a row, or `undefined` if the row
 * has no expandable detail. When set, a dedicated expand column is prepended
 * and virtual scrolling is disabled — detail panels have variable height,
 * so the fixed-`rowHeight` scroll engine cannot position them. Use paginated
 * mode for datasets that need both row-detail and large row counts.
 *
 * Incompatible with `mode='scroll'` — throws if both are set.
 *
 * Called during each render for every visible row. For non-expanded rows,
 * the return value is checked for `undefined` (expand button visibility)
 * but the `TemplateResult` is not rendered. Consumers should ensure this
 * callback is inexpensive — Lit template creation (`html`...``) is cheap;
 * expensive computation should be deferred until the template renders.
 */
getRowDetail?: (row: TypedRow) => TemplateResult | undefined;

/**
 * Whether multiple detail panels can be open simultaneously.
 * - `'single'` (default): expanding a row collapses any previously expanded row.
 * - `'multi'`: rows expand/collapse independently; an expand-all toggle
 *   appears in the expand column header.
 */
detailMode?: 'single' | 'multi';

/**
 * Row keys of currently expanded detail panels. Controlled mode —
 * when set, the component does not manage expand state internally.
 * Requires `getRowKey` to be configured.
 */
expandedDetailKeys?: readonly string[];
```

One new event:

```typescript
/** Fired when a detail panel is expanded or collapsed. */
'detail-change': CustomEvent<{ key: string; row: TypedRow; expanded: boolean }>;
```

### Rendering

#### Expand Column

A conditional 40px CSS Grid column, prepended when `getRowDetail` is set.
Follows the same pattern as the existing selection checkbox column.

Column order: `[expand 40px] [checkbox 40px?] [data columns...]`

Each expand cell contains a `<button>` with:

- Chevron icon (right when collapsed, rotates down when expanded)
- `aria-expanded="true|false"`
- `aria-label` — e.g. "Show details for row {key}"
- `aria-controls` — points to the detail panel's `id`
- No button rendered if `getRowDetail(row)` returns `undefined` for that row

#### Detail Panel

Rendered as a sibling `<div>` immediately after the parent row `<div>` in
the flat render loop. The detail panel is a block-level `<div>` in normal
document flow — it fills the full width of the `.body-content` container.
It is not inside a CSS Grid row and does not use `grid-column` spanning.

Given an `id` matching the button's `aria-controls`. Uses `role="region"`
with `aria-labelledby` pointing back to the toggle button.

**ID scoping:** All generated `id` and `aria-controls` attributes are prefixed
with a component-instance identifier (`this._instanceId`, set to
`crypto.randomUUID()` in `connectedCallback()`). This ensures document-unique
IDs when multiple `<pages-table>` instances exist on the same page. Pattern:
`${_instanceId}-detail-${key}` for the panel, `${_instanceId}-detail-btn-${key}`
for the toggle button.

#### Tree + Detail Coexistence

When a tree-expandable row also has a detail panel and both are expanded,
the detail panel renders between the parent row and its first child row:

```
[Parent row]     [expand ▼] [tree ▼]
[Detail panel — attestations, payload...]
  [Child row 1]
  [Child row 2]
```

The detail panel is the parent row's supplementary information — it belongs
visually adjacent to the row it describes. Placing it after children would
separate the detail content from its trigger by an arbitrary number of
child rows.

#### Parent Row Visual Treatment (expanded)

- `[aria-expanded="true"]` CSS selector → subtle background shift using
  a `--pages-surface-*` token (e.g. `--pages-surface-1`)
- Bottom border suppressed between parent row and detail panel
- Chevron rotation: CSS `transform: rotate(90deg)`, `transition: var(--pages-duration-fast, 120ms) var(--pages-ease-out, ease-out)`

#### Detail Panel Styling

Two-element structure: `.detail-panel` (grid animation wrapper) and
`.detail-content` (visible content area).

**`.detail-panel`** — animation wrapper only. No padding, no background,
no borders. Handles the `grid-template-rows` transition and `hidden`/
`display` lifecycle.

**`.detail-content`** — receives all visual styling:
- Muted background: `var(--pages-surface-2)`
- Left indent (~40px, aligning with data columns past the expand column)
- `overflow: hidden; min-height: 0` (required for `0fr` collapse)

This separation is necessary because the wrapper at `grid-template-rows: 0fr`
still participates in layout — any padding or background on `.detail-panel`
would be visible as a thin strip during the collapse transition.

#### Detail Panel Animation

Uses `grid-template-rows: 0fr → 1fr` transition for height-correct
animation of variable-height content. The `max-height` technique is
unsuitable here — detail panels render arbitrary consumer-provided
`TemplateResult` (attestations, payloads, trace data) whose height
varies unpredictably. `max-height` requires a fixed target value, causing
either visual snap (if set too high) or content clipping (if set too low).

**CSS state management:** The `.expanded` CSS class controls animation
state on the panel element. `aria-expanded` remains only on the toggle
button — per WAI-ARIA, `aria-expanded` belongs on the controlling element,
not the disclosed content. A `role="region"` element with `aria-expanded`
would incorrectly signal that the region itself is an expandable control.

**`hidden` attribute and `display: grid` cascade:** Author CSS
`display: grid` on `.detail-panel` overrides the UA stylesheet's
`[hidden] { display: none }` (equal specificity, author wins). An
explicit `.detail-panel[hidden]` rule with `!important` restores the
correct behavior.

```css
.detail-panel {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--pages-duration-normal, 200ms)
              var(--pages-ease-out, ease-out);
}
.detail-panel[hidden] {
  display: none !important;
}
.detail-panel.expanded {
  grid-template-rows: 1fr;
}
.detail-panel > .detail-content {
  overflow: hidden;
  min-height: 0;
  background: var(--pages-surface-2);
  padding-left: 40px;
  opacity: 0;
  transition: opacity var(--pages-duration-fast, 120ms) var(--pages-ease-out, ease-out);
}
.detail-panel.expanded > .detail-content {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .detail-panel,
  .detail-panel > .detail-content {
    transition: none !important;
  }
}
```

**Expand/collapse lifecycle** (CSS transitions with JS orchestration):

- **Expanding:**
  1. Remove `hidden` attribute → panel enters layout at
     `display: grid; grid-template-rows: 0fr` (zero visual height)
  2. Next `requestAnimationFrame`: add `.expanded` class → triggers
     `0fr → 1fr` height transition + opacity fade in

- **Collapsing:**
  1. Remove `.expanded` class → triggers `1fr → 0fr` height transition
     + opacity fade out
  2. On `transitionend` filtered for `e.propertyName === 'grid-template-rows'`
     AND `.expanded` class NOT present: set `hidden` attribute →
     `display: none !important`

  Two guards on the `transitionend` handler:

  - **Property filter** (`e.propertyName === 'grid-template-rows'`):
    `opacity` and `grid-template-rows` have different durations (120ms
    vs 200ms). Listening for the shorter `opacity` event would set
    `hidden` at 120ms, aborting the height collapse mid-transition.

  - **State guard** (`!panel.classList.contains('expanded')`): if the
    user re-expands during an active collapse animation, CSS reverses
    the transition toward `1fr`. When it completes, `transitionend`
    still fires — without this guard, the handler would set `hidden`
    on a fully expanded panel. The guard ensures `hidden` is only set
    when the panel is genuinely collapsed.

- **`prefers-reduced-motion: reduce`:** skip transitions entirely —
  toggle `hidden` and `.expanded` simultaneously with no animation

#### Expand All (multi mode only)

Header cell of the expand column gets a toggle button. Expands all rows
on the current page where `getRowDetail` returns non-`undefined`. Collapses
all if any are currently expanded. In paginated mode, "all" means the
current page's visible rows. In non-paginated mode, "all" means all
loaded rows.

### State Management

**Uncontrolled (default):** Internal `_expandedDetailKeys: Set<string>`
tracks which rows are expanded. Toggle updates the set and calls
`requestUpdate()`. In `single` mode, the set is cleared before adding the
new key.

**Controlled:** When `expandedDetailKeys` is set externally, internal state
is not used. Toggles emit `detail-change` but don't mutate state — the
consumer drives expansion via the property. Matches the existing
`selectedKeys` controlled-selection pattern.

**Key requirement:** `getRowKey` must be configured when `getRowDetail` is
set. Expand state is tracked by key, not row index (indices shift with
sorting and filtering). Throw an `Error` if `getRowDetail` is set without
`getRowKey` — consistent with the existing selection validation in
`willUpdate` which throws when `selection !== 'none'` and `getRowKey` is
absent.

### Interaction with Existing Features

| Feature | Interaction |
|---|---|
| Virtual scroll | Disabled when `getRowDetail` is set. TSDoc explains this is by design. |
| `mode='scroll'` | Throws `Error` if `getRowDetail` is also set — virtual scrolling and variable-height detail panels are incompatible. Consistent with `getRowKey` validation pattern. |
| `mode='auto'` | Falls back to full rendering (not virtual scroll) when `getRowDetail` is set, regardless of `AUTO_THRESHOLD`. For large datasets, use `mode='paginated'` explicitly. |
| Pagination | Works normally. Expand state persists across page navigation (keys are stable). |
| Sorting / filtering | Works normally. Expand state is key-based, not index-based. Expanded rows stay expanded after re-sort. |
| Selection | Independent. Expanding a row does not select it; selecting does not expand. Both columns coexist. |
| Tree | Can coexist. Expand column handles detail; tree toggle in first cell handles children. Distinct affordances. When both are expanded, detail panel renders between parent row and first child row (see §Tree + Detail Coexistence). |
| Row activation | `row-activate` event still fires independently. The expand button click does not fire `row-activate`. |
| CSV export | Detail content is not included in CSV export. |

### Accessibility

Uses the disclosure pattern (WAI-ARIA APG), not treegrid:

- Native `<button>` in expand cell with `aria-expanded`
- `aria-controls` / `id` linking button to detail panel, instance-scoped via `crypto.randomUUID()` (see §ID scoping)
- `aria-label` on the button describing what it expands
- Detail panel uses `role="region"` with `aria-labelledby`
- Focus remains on the toggle button after expand/collapse
- Enter and Space toggle expand/collapse on the button
- `hidden` attribute on collapsed panels (screen-reader friendly)
- Screen readers automatically reflect panel visibility changes

#### ARIA Grid Structure

Detail panels use `role="region"` and are not part of the grid's row
structure. They are excluded from `aria-rowcount`. `aria-rowindex` values
on data rows skip detail panels — the indices count only `role="row"`
elements.

#### Keyboard Navigation

**Arrow keys (grid navigation):** `ArrowUp`/`ArrowDown` navigate between
data rows only. The existing `_handleKeyDown` handler queries
`.row[role="row"]` elements — detail panels have `role="region"` and are
naturally excluded from this query. The handler's `_focusRowIndex` tracks
data rows, not DOM siblings, so inserted detail panels do not break the
index-to-DOM mapping.

**Tab/Shift-Tab (sequential navigation):** Detail panels may contain
interactive elements (links, buttons for attestations, copy-to-clipboard
actions). When a detail panel is expanded, `Tab` from the expand button
navigates into the detail panel's interactive content. `Shift-Tab` from
the first interactive element in the detail panel returns to the expand
button. This is standard DOM tab order — no special handling needed
because the detail panel is rendered as a sibling div after the row.

**Focus rescue on collapse:** When focus is inside an expanded detail panel
and the panel is collapsed (programmatically or via the toggle button),
focus moves to the corresponding toggle button. This follows WAI-ARIA APG
for disclosure widgets — without it, focus falls to `<body>`, losing the
user's position. Implementation: on collapse, check
`detailPanel.contains(document.activeElement)` within the collapsing panel;
if true, call `toggleButton.focus()` before starting the collapse
transition.

### Animation

Matches `pages-grouped-view` timing for platform consistency:

- Chevron rotation: `var(--pages-duration-fast, 120ms) var(--pages-ease-out, ease-out)`
- Panel expand/collapse: `grid-template-rows` with `var(--pages-duration-normal, 200ms) var(--pages-ease-out, ease-out)`, `opacity` with `var(--pages-duration-fast, 120ms) var(--pages-ease-out, ease-out)`
- `prefers-reduced-motion: reduce` disables all transitions
- CSS transitions with JS lifecycle orchestration for `hidden` attribute and `.expanded` class management (see §Detail Panel Animation)
- No JS animation libraries or WAAPI — the animation mechanism is pure CSS; JS handles the expand/collapse state machine

### YAML Surface

Row detail expansion is a TypeScript-only API. `getRowDetail` is a callback
returning `TemplateResult` — callbacks cannot be expressed in YAML.
`detailMode` and `expandedDetailKeys` only make sense in conjunction with
`getRowDetail`, so exposing them independently in YAML has no value.

This is consistent with other callback-based table features: `getRowKey`,
`getRowClass`, and `columnRenderers` are all TypeScript-only. YAML-configured
tables use the pipeline's data binding and built-in column rendering — they
do not need per-row custom detail panels.

## UX Research Summary

Design informed by industry consensus from Carbon, MUI, Ant Design,
Spectrum, and Cloudscape design systems, plus Adrian Roselli's
accessibility testing:

- **Dedicated expand column** over first-cell injection: composes cleanly
  with selection and tree features, unambiguous affordance
- **Disclosure pattern** over treegrid: better assistive technology support,
  simpler implementation
- **Chevron rotation** as primary indicator, plus background shift on
  expanded row: universal across all major systems
- **Single-expand default**: most row-detail use cases are "drill into one
  row"; multi-expand is the power-user option

## Consumer Example

`audit-trail-viewer` in `blocks-ui` (casehubio/blocks-ui#47) would use
this as:

```typescript
<pages-table
  .dataSet=${filteredDataSet}
  .columnConfig=${ENTRY_COL_CONFIG}
  .columnRenderers=${ENTRY_RENDERERS}
  .getRowKey=${(row: TypedRow) => row.text(ID_COL)}
  .getRowDetail=${(row: TypedRow) => this._renderEntryDetail(row)}
  client-filter
></pages-table>
```

The `_renderEntryDetail` method returns a `TemplateResult` with
attestations, payload, and trace ID — or `undefined` for rows without
detail.

## Testing

### Tier 1: Unit Tests (Vitest)

Logic only, no DOM.

1. **Expand state — single mode** — expanding a row clears previous expansion; only one key in set at a time
2. **Expand state — multi mode** — expanding rows accumulates keys; collapsing one doesn't affect others
3. **Controlled vs uncontrolled** — when `expandedDetailKeys` is set externally, internal state is not used; toggles emit events but don't mutate state
4. **Expand-all logic** — expands all rows on current page where `getRowDetail` returns non-`undefined`; collapses all if any are expanded

### Tier 2: Component Tests (Vitest + DOM)

Render correctness, accessibility, events.

5. **Expand column rendering** — column present when `getRowDetail` set, absent when not; no button for rows where `getRowDetail` returns `undefined`
6. **Detail panel DOM structure** — `role="region"`, `aria-labelledby` pointing to toggle button, `id` matching `aria-controls`, instance-scoped IDs
7. **Toggle button ARIA** — `aria-expanded` toggles correctly, `aria-label` present, `aria-controls` references panel `id`
8. **ARIA grid structure** — detail panels excluded from `aria-rowcount`; `aria-rowindex` values skip panels
9. **Keyboard: ArrowUp/ArrowDown** — arrow keys skip detail panels, navigate data rows only
10. **Keyboard: Tab into detail** — Tab from expand button reaches interactive content inside expanded detail panel
11. **Focus rescue on collapse** — collapse with focus inside panel moves focus to toggle button
12. **Event emission** — `detail-change` fires with correct `{ key, row, expanded }` payload
13. **Tree + detail coexistence** — both affordances render; detail panel appears between parent and child rows when both expanded
14. **Pagination interaction** — expand state persists across page changes; expand-all scoped to current page
15. **Virtual scroll disabled** — `mode='auto'` with `getRowDetail` does not activate virtual scroll
16. **Validation: getRowKey required** — throws `Error` when `getRowDetail` set without `getRowKey`
17. **Validation: mode='scroll' conflict** — throws `Error` when both `getRowDetail` and `mode='scroll'` are set

### Tier 3: Visual Tests (Playwright)

Screenshot comparison. Tests run in both light and dark themes.

18. **Expanded/collapsed states** — panel visible/hidden, chevron direction, background treatment on expanded row
19. **Chevron rotation animation** — smooth rotation on expand/collapse (non-reduced-motion)
20. **Reduced motion** — transitions disabled, instant toggle
21. **Expand-all toggle** — all panels expand/collapse simultaneously in multi mode
22. **Detail panel styling** — muted background, left indent alignment with data columns, border suppression

## Decisions

- **`grid-template-rows: 0fr → 1fr` over `max-height`** — detail panel content is arbitrary consumer-provided `TemplateResult` with unpredictable height. `max-height` requires a fixed target value, causing visual snap (too high) or clipping (too low). `grid-template-rows` handles any content height correctly. Supported since Chrome 107, Firefox 109, Safari 16.4 (all 2023+).
- **`.expanded` CSS class over `aria-expanded` on panel** — per WAI-ARIA, `aria-expanded` belongs on the controlling element (toggle button), not the disclosed content (`role="region"` panel). Using `aria-expanded` on the panel would incorrectly signal it is an expandable control. The `.expanded` class drives CSS animation state; `aria-expanded` stays on the button only. Consistent with grouped-view which uses `.collapsing` class on `.section-content`.
- **`.detail-panel[hidden] { display: none !important }`** — author CSS `display: grid` overrides the UA `[hidden] { display: none }` at equal specificity. The `!important` rule restores correct `hidden` behavior. The grouped-view avoids this because `.section-content` has no explicit `display` property.
- **Two-element panel structure** — `.detail-panel` (grid wrapper) + `.detail-content` (styled child). Background, padding, and indent go on `.detail-content` only. The wrapper at `grid-template-rows: 0fr` still participates in layout — wrapper padding/background would show as a thin strip during collapse transition.
- **`detail-change` event name** — follows the established `{noun}-change` pattern used by `selection-change`, `sort-change`, `filter-change`, `page-change`, `column-change`. The event detail carries `expanded: boolean`, so the event name doesn't need to encode the toggle/direction semantic.
- **Throw on `getRowKey` missing** — consistent with the existing selection validation in `willUpdate` (line 815) which throws `Error('getRowKey is required when selection is enabled')`. Same invariant (key-based tracking requires `getRowKey`), same enforcement.
- **Throw on `mode='scroll'` conflict** — `_useVirtualScroll` returns `true` unconditionally for `mode='scroll'`. Since `getRowDetail` is architecturally incompatible with virtual scroll, an explicit error is clearer than silent override.
- **Detail panel between parent and children (tree coexistence)** — the detail describes the parent row and should render adjacent to it. Placing it after all children separates the detail from its trigger by an arbitrary number of child rows.
- **Instance-scoped IDs via `crypto.randomUUID()`** — same pattern as `pages-grouped-view`. Prevents ID collisions when multiple `<pages-table>` instances coexist.
- **YAML surface excluded** — `getRowDetail` is a callback returning `TemplateResult`; callbacks are not expressible in YAML. `detailMode` and `expandedDetailKeys` are only meaningful alongside `getRowDetail`. Consistent with other callback-based features (`getRowKey`, `getRowClass`, `columnRenderers`).
