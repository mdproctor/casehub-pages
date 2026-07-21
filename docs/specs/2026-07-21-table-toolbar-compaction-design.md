# Table Toolbar Compaction Design

**Issue:** #199
**Date:** 2026-07-21
**Status:** Approved

## Problem

The table toolbar takes a full row above the column headers, consuming vertical space
in dense dashboard layouts. It contains a filter input, CSV export buttons, and a kebab
menu (column picker + display mode). The toolbar row should be eliminated.

## Design

### Layout: Eliminate Toolbar Row

The toolbar row is removed. The `.header-container` gains a sticky kebab zone at its
right edge, positioned absolutely so it stays visible regardless of column layout.

```
┌──────────────────────────────────────────────────────┐
│ header-container (position: relative)                │
│ ┌──────────────────────────────────────┐ ┌──────┐   │
│ │ .header (grid of column cells)       │ │ [⋮]  │   │
│ │  COL A  │  COL B  │  COL C  │ COL D │ │      │   │
│ └──────────────────────────────────────┘ └──────┘   │
│          ↑ scrolls horizontally           ↑ sticky  │
└──────────────────────────────────────────────────────┘
```

The kebab button is `position: absolute; right: 0; top: 0` within `.header-container`.
A subtle background fade on its left edge prevents visual clash with column labels
underneath. The header grid gains `padding-right: var(--pages-space-10, 40px)` to
reserve space for the kebab zone.

**Horizontal scroll constraint:** The current implementation has no horizontal scroll
synchronization between header and body. Columns default to `1fr`, fitting within the
container width. The `position: absolute; right: 0` positioning is correct for this
scenario — `.header-container` is constrained by the flex parent (`.data-table`) and
the kebab sits at the right edge of the visible area. If explicit column widths from
the table composability spec (#196) create horizontal overflow, header-body scroll
sync must be implemented as a prerequisite — that is out of scope for this spec.

### Kebab Dropdown Contents

The dropdown anchors top-right, drops downward-left. Contents:

1. **Filter** — toggles the filter bar on/off. Shows highlighted when filter is active.
   Only shown when `(this.clientFilter && this.totalRows === undefined) || this._pipelineMode`.
   This preserves the existing condition from the toolbar filter input.
2. **Columns** — checkbox list for column visibility (existing behavior).
3. **Display** — Auto / Pages / Scroll mode switcher (existing behavior). Disabled when
   `groupBy` is set (existing constraint — groupBy forces no virtual scroll, no pagination).
4. **Download CSV** — only shown when `_csvExportEnabled` is true (disabled by default).
5. **Copy CSV** — only shown when `_csvExportEnabled` is true (disabled by default).

Dropdown closes on outside click, `Escape`, or mouse-leave with 400ms delay (existing
`_handlePickerMouseLeave` behavior preserved). Mouse re-entry cancels the close timer
(existing `_handlePickerMouseEnter`).

### Filter Bar

When activated (kebab menu item or `/` keyboard shortcut), a filter bar appears
**between** the `.header-container` and the `.body`, as a new flex child of `.data-table`.
Column headers remain visible at all times.

```
Default:   │ COL A │ COL B │ COL C │ COL D    [⋮]│
           ├────────────────────────────────────────┤  ← no filter bar
           │ row data...                            │

Active:    │ COL A │ COL B │ COL C │ COL D    [⋮]│
           │ [🔍 Filter.......................] [✕] │  ← filter bar (~36px)
           │ row data...                            │
```

- The filter bar is a flex container: `display: flex; align-items: center; gap: var(--pages-space-2); padding: var(--pages-space-2); border-bottom: 1px solid var(--pages-neutral-4); background: var(--pages-neutral-1)`.
- The filter input fills available width (`flex: 1`).
- The `✕` close button dismisses the filter bar.
- Kebab button stays in `.header-container` (not in the filter bar).
- Filter bar is zero height when hidden (not rendered), ~36px when shown.
- The filter bar renders in **all non-loading/error render paths** — both the normal
  data path and the empty-state path (between `.header-container` and `.empty-state`).
  This ensures users can clear an active filter that produced zero results.
- Filter text is preserved when toggling — dismissing does not clear the filter.
- When `filterText` is non-empty and the filter bar is closed, a visual indicator on the
  kebab button (small dot or highlighted Filter menu item) signals active filtering.

### State Management

New `@state()` property:

```typescript
@state() private _filterBarOpen = false;
```

**`_filterBarOpen` controls UI visibility only.** It determines whether the filter bar
DOM element is rendered. It has no effect on filter event emission — that is controlled
by the existing `clientFilter` and `_pipelineMode` flags in `willUpdate`, unchanged:

```typescript
// Existing — unchanged by this spec
if (changed.has('filterText') && this.clientFilter) {
    this.currentPage = 0;
    this._emitFilterChange();  // 150ms debounce
}
if (changed.has('filterText') && this._pipelineMode) {
    this._emitPipelineTextFilter();
}
```

This means programmatic `filterText` changes apply regardless of whether the filter bar
is open. The filter bar is a UI surface for the user to edit `filterText` — it is not
the mechanism that triggers filtering.

**New `willUpdate` behavior:** When `_filterBarOpen` transitions to `true`, schedule
focus to the filter input after render (`this.updateComplete.then(...)`).

**Interactions with existing state:**

- `_columnPickerOpen` and `_filterBarOpen` are **independent** — both can be open
  simultaneously. The kebab dropdown floats over the filter bar; no visual conflict.
- Opening the filter bar does NOT close the dropdown, and vice versa.

### Keyboard Interaction

| Key | Context | Action |
|-----|---------|--------|
| `/` | Table has focus, no input/textarea focused | Open filter bar, focus input |
| `Escape` | Dropdown open | Close dropdown (highest priority) |
| `Escape` | Filter input focused, dropdown closed | Close filter bar, focus `rovingIndex` row |
| `Escape` | Row focused, `selection === 'multi'` | Clear selection (existing) |
| `Tab` | Filter bar open | filter input → `✕` button (natural DOM order) |

**Escape priority:** Layered dismissal — dropdown first, then filter bar, then
selection clear. These are tested in order; only the first matching action fires.

**Focus on filter bar dismiss:** Escape from the filter bar calls
`_focusRow(this.rovingIndex)` to restore focus to the last-interacted row. If
`rovingIndex < 0` or `_dataRows` is empty (no data or all filtered out), focus falls
back to the `.data-table` container element itself.

**`/` handler placement:** The `/` handler is added to `_handleKeyDown` **before** the
`isRowTarget` guard (same pattern as the existing Escape-for-multi-selection handler at
line 1676). Guard condition: `event.target` is not an `<input>`, `<textarea>`, or
`[contenteditable]` element. When `_filterBarOpen` is already true, `/` is a no-op
at this level — it falls through and the filter input receives it as text input.

**Empty-state `@keydown` gap:** The existing empty-state render path (line 2618) does
not wire `@keydown` on `.data-table`. This spec requires adding
`@keydown="${this._handleKeyDown}"` to the empty-state `.data-table` div so that `/`
works when the table has no data rows.

**Filter bar arrow key isolation:** The filter bar stops propagation for `ArrowDown`,
`ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End` — same pattern as the existing
`_onToolbarKeydown` handler (line 2138). This prevents the `RovingTabindexMixin` from
intercepting arrow keys while the filter input is focused.

**RovingTabindexMixin interaction:** No conflict. The mixin's `rovingSelector` is
`.row[role="row"]:not(.header)` — it only manages focus among body rows. The filter
bar elements (input, close button) don't match this selector and are unaffected by
the mixin. Tab/Shift+Tab follow natural DOM order through the filter bar.

### `headerVisible = false` Behavior

When `headerVisible = false`, the `.header` grid gets the `visually-hidden` class
(clipped to 1px). The `.header-container` itself remains visible, so the kebab button
renders normally. The filter bar (positioned between `.header-container` and `.body`)
is independent of header visibility and shows/hides normally when toggled.

Result: `headerVisible = false` hides column labels. The kebab button and filter bar
are always accessible regardless of this setting.

### Grouped and Tree Mode

- **Filter + groupBy:** Client filtering runs before group boundary extraction (existing
  behavior in `_visibleRows` → `willUpdate` → `extractGroupBoundaries`). Filtering
  reduces the row set, which changes group boundaries. This is the correct semantic —
  filter narrows the dataset, groups are computed from the filtered result.
- **Filter + tree mode:** Client filtering applies to the flat row set before tree
  flattening. Tree nodes whose rows are filtered out disappear from the visible tree.
  This is existing behavior, unchanged.
- **Display mode + groupBy:** The Display switcher in the dropdown is disabled when
  `groupBy` is set. This is existing behavior, carried forward unchanged.

### Accessibility

- Kebab button: `aria-haspopup="menu"`, `aria-expanded`
- Filter bar container: `role="search"`, `aria-label="Filter table"` — makes the
  filter discoverable via screen reader landmark navigation
- Filter input: `role="searchbox"`, `aria-label="Filter table"` — accessible name
  on the input itself (ARIA name computation does not inherit from parent elements;
  the container label serves landmark navigation, the input label serves direct focus)
- Active-filter indicator: `aria-live="polite"` on a visually hidden status element.
  Content announces the **result count** after a 300ms debounce: "Showing {matchCount}
  of {totalRows} rows" when filter text is non-empty, or "Filter cleared" when text
  becomes empty. Uses `matchCount` from the existing `FilterChangeDetail`. The debounce
  is independent of the 150ms filter-change event debounce — the announcement fires
  300ms after the last keystroke, not 300ms after the event.

### API Surface

No new public properties or events. The toolbar removal is a visual change only.
Existing props are unchanged:

- `clientFilter` — enables client-side filtering
- `filterText` — current filter text (two-way)
- `filter.enabled` / pipeline mode — enables filter in pipeline mode
- CSV export controlled by internal `_csvExportEnabled` flag (disabled by default)

### Embedded Mode

When `embedded = true`, neither the toolbar (current), the kebab button (new), nor
the filter bar are rendered. The `/` keyboard shortcut is a no-op (`embedded` guard
checked before opening). This behavior is preserved — `embedded` tables show headers
and data only.

## Research

Best practices surveyed from MUI DataGrid, AG Grid, Ant Design, and TanStack/Shadcn:

- AG Grid places column menus inside header cells; quick filter is external to the grid
- MUI DataGrid uses a dedicated toolbar row (the pattern we're eliminating)
- Ant Design uses per-column filter icons in header cells
- Shadcn/TanStack is headless — toolbar placement is consumer's choice
- UX consensus: toolbar above table is most discoverable for global filter, but
  on-demand filter with keyboard shortcut is the accepted compact alternative
- All surveyed libraries keep column headers visible while filtering — none trade
  header visibility for filter input space

## Scope

| Item | Scale | Complexity |
|------|-------|------------|
| Remove toolbar row, add sticky kebab zone | S | Low — CSS changes |
| Restructure dropdown contents (add filter + CSV) | S | Low — template changes |
| Filter bar with show/hide toggle | M | Med — new state, keyboard handling |
| Active-filter indicator | XS | Low — conditional CSS class |
