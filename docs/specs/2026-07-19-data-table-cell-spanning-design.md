# Data Table Cell Spanning Design Spec

**Issue:** casehubio/agency-ui#26
**Date:** 2026-07-19
**Status:** Approved
**Implementation target:** `packages/pages-table/` in casehub-pages

## Context

Row and column spanning was designed into the pages-data-table CSS Grid rendering
model (#22) but never implemented. The current architecture uses per-row CSS Grid
containers — each `.row` div is an independent `display: grid`. Column spanning
works within a single row's grid (`grid-column: span N`), but row spanning is
impossible: a cell cannot span across independent grid containers.

Workaround approaches (absolute positioning with z-index overlays, `top`
positioning instead of `translateY`) are proven in libraries like AG Grid but
are fundamentally papering over the wrong abstraction. The per-row model is the
wrong foundation for a table that needs cell-level layout relationships.

### Use cases

- **Regulatory compliance grids** — a regulation cell covering multiple
  sub-requirement rows
- **Decision tables** — grouped conditions spanning rows, section headers
  spanning columns
- **Grouped data views** — category cells merged across adjacent rows with
  equal values
- **Report layouts** — section headers and summary rows spanning multiple columns

### Prior art

| Library | Technique | Limitation |
|---------|-----------|------------|
| AG Grid (legacy) | `suppressRowTransform` — switch from `translateY` to `top`, spanned cells overlay via z-index | Fixed row heights, no auto-height, manual position math |
| AG Grid (v33+) | `enableCellSpan` + `spanRows` — higher-level API, same underlying technique | colSpan and rowSpan mutually exclusive per column |
| Ant Design | `extraRender` — scan viewport boundaries, render off-screen span origins via separate pass | Lazy `onCell` evaluation, GC pressure on large datasets |
| Google Sheets | Canvas rendering — merged cells painted as rectangles at coordinates | Not DOM-based, different paradigm entirely |

## Architecture: Single CSS Grid Body

### The change

Replace per-row grid containers with a single CSS Grid on `.body-content`.
All cells become direct grid items. Row wrapper divs use `display: contents`
(invisible to layout, preserved for ARIA).

```html
<div class="body-content" style="
  display: grid;
  grid-template-columns: 40px 200px 1fr 120px;
  grid-template-rows: repeat(10000, 48px);
">
  <div role="row" style="display: contents;" data-row="0">
    <div class="cell" style="grid-row: 1; grid-column: 1;">☐</div>
    <div class="cell" style="grid-row: 1; grid-column: 2;">USA</div>
    <div class="cell" style="grid-row: 1; grid-column: 3;">Alice</div>
    <div class="cell" style="grid-row: 1; grid-column: 4;">42</div>
  </div>
  <div role="row" style="display: contents;" data-row="1">
    <div class="cell" style="grid-row: 2; grid-column: 1;">☐</div>
    <div class="cell" style="grid-row: 2 / span 3; grid-column: 2;">UK</div>
    <div class="cell" style="grid-row: 2; grid-column: 3;">Bob</div>
    <div class="cell" style="grid-row: 2; grid-column: 4;">17</div>
  </div>
  <!-- rows 3-4: no cell in column 2 (suppressed by span from row 2) -->
</div>
```

### Why single grid

- **Native CSS Grid spanning** — `grid-row: 2 / span 3; grid-column: 2 / span 2`
  is a merged cell. No absolute positioning, no z-index, no manual height math.
- **Virtual scrolling compatible** — `grid-template-rows: repeat(N, 48px)`
  defines the full scrollable height as track metadata. Empty tracks are cheap —
  the browser doesn't allocate DOM for them. Fixed-size tracks make cell
  positioning O(1): position = track_index × track_size.
- **No dual rendering paths** — one model for spanning and non-spanning tables.
  Every future feature works with one renderer, not two.

### `display: contents` on row wrappers

Row wrappers exist in the DOM for ARIA (`role="row"`) and event derivation
(`data-row` attribute). They have `display: contents` — invisible to CSS Grid
layout, their children become direct grid items.

Browser support: Chrome 89+, Firefox 87+, Safari 16+. All correctly expose
`display: contents` elements to the accessibility tree. Pre-release platform —
no legacy browser concern.

### Detail panel integration

Detail panels (`getRowDetail`) remain incompatible with virtual scroll mode —
the existing `willUpdate` validation (`throw new Error("getRowDetail is
incompatible with mode='scroll'")`) is preserved. Detail panels require
variable-height content with CSS transitions, which conflicts with the
fixed-track virtual scroll model.

In paginated and auto modes, detail panels work within the single-grid model:

- Each data row occupies a fixed-height track (`rowHeight`px)
- Each detail panel occupies a subsequent `auto`-height track with
  `grid-column: 1 / -1` (spans all columns)
- The grid template for modes with detail panels uses paired tracks:
  `48px auto 48px auto ...` instead of `repeat(N, 48px)`
- Collapsed detail panels use the existing `0fr` → `1fr` CSS Grid animation
  technique (`grid-template-rows: 0fr` → `1fr` on expand)
- Row wrapper (`display: contents`) contains both data cells and the detail
  panel div — all become direct grid items
- Data cell placement: `grid-row: 2*rowIndex + 1`
- Detail panel placement: `grid-row: 2*rowIndex + 2; grid-column: 1 / -1`

This preserves the current detail panel UX (auto-height, animated expand/
collapse) while working within the single-grid model.

### Grid placement model

All cells use explicit `grid-row` and `grid-column` inline styles. This adds
a style string computation per cell per render cycle. For a viewport of 15
rows × 10 columns = 150 cells, this is 150 string operations — negligible
compared to the DOM mutations in the same cycle.

Explicit placement is preferred over `grid-auto-flow` because mixing auto-
placed and explicitly-placed items in the same grid produces subtle ordering
bugs when spanning cells shift the auto-placement cursor. Uniform explicit
placement is predictable and easy to debug.

### Grid track limits

`grid-template-rows: repeat(N, 48px)` with uniform fixed-size tracks is
efficiently represented by browsers as (count, size) metadata — the browser
does not enumerate individual tracks. Empirically, Chrome and Firefox handle
up to 1,000,000 uniform tracks without degradation. The supported dataset
range for virtual scroll mode is up to 100,000 rows. Datasets exceeding
this should use server-side pagination.

### Trade-offs vs. per-row model

| Concern | Per-row (current) | Single-grid |
|---------|-------------------|-------------|
| Row hover | CSS `.row:hover` | JS: `_hoverRowIndex` state, cells check during render |
| Row click | Event on `.row` div | Derive row from cell's `data-row` attribute |
| `::part(row)` | Works | Breaking — cells carry `part="cell priority-urgent"` instead |
| Row striping | CSS class on `.row` | Per-cell based on row index |
| Spanning | Impossible (rowspan) | Native CSS Grid |

## Span API

### Per-column `cellSpan` callback (primitive)

```typescript
interface TableColumnConfig {
  // ...existing properties...
  readonly cellSpan?: (row: TypedRow, rowIndex: number) =>
    { colSpan?: number; rowSpan?: number } | undefined;
}
```

Each column declares its span behaviour. Returns span dimensions for that cell.
`undefined` or `{colSpan: 1, rowSpan: 1}` = normal cell.

colSpan on column A suppresses columns B and C — same layering as HTML `colspan`,
AG Grid, and Ant Design. Established pattern.

### `mergeRows` shorthand (convenience)

```typescript
interface TableColumnConfig {
  readonly mergeRows?: boolean | ((valueA: CellValue, valueB: CellValue) => boolean);
}
```

`mergeRows: true` — auto-merge adjacent rows with equal cell values. The table
scans sorted/filtered data, computes rowspan counts internally.

`mergeRows: (a, b) => boolean` — custom comparison for cases where equality
isn't `===`.

When both `cellSpan` and `mergeRows` are set on a column, `mergeRows`
computes the default span for that column first. `cellSpan` is then
called — if it returns a value, it overrides the `mergeRows` result for
that cell. If `cellSpan` returns `undefined`, the `mergeRows` result
stands. This allows `mergeRows` to handle the default merge pattern
while `cellSpan` overrides specific cells.

### Examples

Regulatory compliance grid — auto-merge:
```typescript
const columns: TableColumnConfig[] = [
  { id: 'regulation', label: 'Regulation', mergeRows: true, width: '200px' },
  { id: 'requirement', label: 'Requirement', width: '1fr' },
  { id: 'status', label: 'Status', width: '120px' },
  { id: 'evidence', label: 'Evidence', width: '1fr' },
];
```

Decision table — explicit layout:
```typescript
const columns: TableColumnConfig[] = [
  { id: 'conditions', label: 'Conditions', width: '200px',
    cellSpan: (row) => {
      if (row.cell('type' as ColumnId).value === 'header')
        return { colSpan: 3 };
      return undefined;
    }},
  { id: 'cond2', label: 'Condition 2', width: '150px' },
  { id: 'cond3', label: 'Condition 3', width: '150px' },
  { id: 'action', label: 'Action', width: '1fr' },
];
```

Both directions — grouped categories with section headers:
```typescript
{ id: 'category', label: 'Category', width: '180px',
  mergeRows: true,
  cellSpan: (row, i) => {
    if (row.cell('isSection' as ColumnId).value === true)
      return { colSpan: 4 };
    return undefined;  // fall through to mergeRows
  }},
```

## Span Computation Pipeline

### SpanMap

```typescript
interface CellSpan {
  readonly colSpan: number;
  readonly rowSpan: number;
}

interface SuppressedCell {
  readonly originRow: number;
  readonly originCol: string;
}

// Map<rowIndex, Map<colId, CellSpan | SuppressedCell>>
type SpanMap = Map<number, Map<string, CellSpan | SuppressedCell>>;
```

A cell is: **normal** (absent from map, 1×1), **origin** (CellSpan entry), or
**suppressed** (SuppressedCell — covered by another cell's span, not rendered).
Each suppressed cell stores its origin coordinates for O(1) lookup — no
backward walk required to find the owning span.

### Computation in `willUpdate`

1. **Resolve `mergeRows`** — for each column with `mergeRows`, walk sorted/filtered
   data, compute run lengths of equal adjacent values. Each run produces an origin
   cell at the first row with `rowSpan = run length`.

2. **Resolve `cellSpan`** — for each column with `cellSpan`, call the callback for
   every row. Overrides any `mergeRows` result for that column.

3. **Mark suppressed** — for every origin with `colSpan > 1` or `rowSpan > 1`,
   mark all covered cells as `'suppressed'`.

4. **Validate** — overlapping spans (two origins claiming the same cell): warn in
   dev mode, first-writer-wins. The pipeline processes rows in ascending index
   order and columns in config order within each row. The first origin to claim a
   cell owns it; any subsequent origin attempting to claim an already-suppressed
   cell is discarded. Spans past the last row/column are clamped.

### Recomputation triggers

SpanMap recomputes when `dataSet`, `columnConfig`, sort state, filter state, or
visible columns change. Hooks into the existing `willUpdate` lifecycle.

### Cost

One pass over all rows × columns-with-spans. For 10,000 rows with 2 spanning
columns: 20,000 callback invocations. For `mergeRows: true`: linear scan
comparing adjacent values. Negligible.

## Span-Aware Virtual Scroll

### Extended render window

The current `computeScrollWindow` pure function is unchanged. A second pass
extends the window using the SpanMap:

```typescript
function extendWindowForSpans(
  startIndex: number,
  endIndex: number,
  spanMap: SpanMap,
  spanColumns: Set<string>,
): { startIndex: number; endIndex: number; extraOrigins: Array<{ row: number; col: string }> }
```

**Algorithm:**

1. **Top boundary scan** — for each column in `spanColumns`, check the cell at
   `startIndex`. If it is a `SuppressedCell`, read its `originRow` directly
   (O(1) — no backward walk). Track the earliest origin row across all columns.

2. **Extend startIndex** — the earliest origin row must be included. Its cells
   are placed at their actual grid-row, visually overlapping into the viewport.

3. **Bottom boundary scan** — for origin cells in the last visible rows, if
   `rowIndex + rowSpan > endIndex`, note that the span extends below. Extend
   endIndex if needed (less critical — content below the viewport is invisible,
   but the cell must be rendered for its full extent).

4. **Return `extraOrigins`** — origin cells from above `startIndex` that must
   be rendered.

**Efficiency:** only columns with spans are scanned. Origin lookup is O(1) per
column via `SuppressedCell.originRow` — no backward walk regardless of span
size. Runs once per scroll position.

### No translateY

The single-grid model eliminates `translateY`. The grid's
`grid-template-rows: repeat(N, rowHeight)` defines the scrollable height.
Cells are placed at their actual grid-row. The browser handles scroll
positioning natively.

```typescript
// Before (per-row)
html`<div style="height: ${totalHeight}px">
  <div style="transform: translateY(${offsetY}px)">
    ${rows.map(row => this._renderRow(row))}
  </div>
</div>`

// After (single-grid)
html`<div style="display: grid;
  grid-template-columns: ${this._gridTemplateColumns};
  grid-template-rows: repeat(${rowCount}, ${this.rowHeight}px);">
  ${cells.map(cell => this._renderCell(cell))}
</div>`
```

## Interaction Model

### Focus management

`tabindex` remains on the row wrapper div. Even with `display: contents`, the
row div is a valid focus target (focus is DOM-based, not layout-based). The
existing `RovingTabindexMixin` continues to manage a 1D row index
(`rovingIndex`), with `_focusColIndex` tracking column position separately.

Focus ring rendering migrates from `.row:focus { outline }` (which has no
CSS box under `display: contents`) to a cell-based approach: cells in the
focused row receive a `focus-row` CSS class, and the first/last cells in that
row render the focus ring via `box-shadow`:

```css
.cell.focus-row { background: var(--pages-focus-bg); }
.cell.focus-row:first-of-type { box-shadow: inset 2px 0 0 var(--pages-primary-9); }
```

When a row gains focus (e.g., tab into the table), the focus ring appears on
the full row via per-cell styling. The `_focusColIndex` tracks which column
has keyboard attention for cell-level actions.

For spanned cells: when focus moves into a spanned cell (ArrowDown into a
rowspan), the `rovingIndex` moves to the origin row, and the focus ring spans
the full cell extent.

### Hover

Reactive `_hoverRowIndex` state (scalar, stores the origin row index). On cell
`mouseenter`, set `_hoverRowIndex` to the cell's row index. For spanned cells,
resolve to the origin row index. A `mouseleave` handler on `.body-content`
resets `_hoverRowIndex` to `-1`.

During render, a cell receives the hover class when its row index falls within
the hovered span range: `rowIndex >= _hoverRowIndex && rowIndex <
_hoverRowIndex + span.rowSpan`. For non-spanned rows, this reduces to
`rowIndex === _hoverRowIndex`. All cells in the hovered row range (including
non-spanned cells in covered rows) receive the hover class.

### Selection

Key-based `Set<string>` — unchanged conceptually. Rules for spanning:

- **Clicking a spanned cell**: selects the origin row's key. All cells in the
  span's row range show selected styling.
- **Clicking a non-spanned cell in a row covered by a span**: selects that
  row's key only. The spanned cell in another column does NOT show selected
  styling (its origin row's key is not selected). This produces a visual gap
  in the span column — correct, because the user selected one row, not the
  span's full range.
- **A spanned cell shows selected styling iff ALL rows it covers are
  selected.** Partial coverage (e.g., rows 5 and 7 selected but not 6)
  leaves the spanned cell unselected.
- **Shift-click across a span boundary**: all rows in the range are selected.
  If the range fully covers a span, the spanned cell shows selected.
- **Select all**: all rows selected, all spanned cells show selected.
- **Checkbox column**: each row's checkbox reflects its own selection state.
  A spanned cell in a non-checkbox column shows selected when all covered
  rows are checked.

### Keyboard navigation

`(rovingIndex, _focusColIndex)` coordinates, span-aware. ArrowDown from a cell
with rowSpan 3 at row 5 moves to row 8. ArrowRight from a cell with colSpan 2
at column 2 moves to column 4. Navigation consults the SpanMap to find the
next non-suppressed cell.

### Sorting and filtering

Data reorder triggers SpanMap recomputation. `mergeRows` spans adapt to the new
data order — if sorting breaks adjacent equal values, spans shrink or disappear.
`cellSpan` callbacks receive the row and index in the current order.

### `::part()` migration

Row parts move to cells. Consumer CSS migrates from
`pages-table::part(priority-urgent)` targeting the row to the same selector
targeting cells. Each cell carries `part="cell priority-urgent"` (both the
base `cell` part and the row class).

## Feature Compatibility

| Feature | Compatible | Notes |
|---------|-----------|-------|
| Virtual scroll | Yes | Span-aware window extension |
| Pagination | Yes | SpanMap per page, spans clamped to page boundaries |
| Client sort/filter | Yes | SpanMap recomputes |
| Tree/expandable | No | Mutually exclusive — tree hierarchy + cell merge = ambiguous semantics |
| Detail panels | Yes (paginated/auto only) | Detail row occupies auto-height grid track; incompatible with virtual scroll (existing constraint) |
| Column hiding | Yes | Data-column semantics (see below) |
| `groupBy` | No | Mutually exclusive on a single `pages-table` instance (see below) |

### Mutual exclusion enforcement

When spanning configuration (`cellSpan` on any column or `mergeRows` on any
column) is combined with an incompatible feature, `willUpdate` throws — matching
the existing `groupBy + getChildren` validation pattern:

```typescript
if (hasSpanConfig && this.getChildren) {
  throw new Error('Cell spanning and tree rows are mutually exclusive');
}
if (hasSpanConfig && this.groupBy) {
  throw new Error('Cell spanning and groupBy are mutually exclusive — use mergeRows as an alternative');
}
```

### Column hiding + colSpan semantics

`colSpan` refers to data columns (logical), not visible columns. When a hidden
column falls within a span's range, the visual CSS `grid-column` span is the
count of *visible* columns within the logical range.

Example: `cellSpan` returns `{ colSpan: 3 }` for column B. The span logically
covers B, C, D.
- All visible: CSS `grid-column: span 3`
- Column C hidden: CSS `grid-column: span 2` (B and D visible)
- Columns C and D hidden: CSS `grid-column: span 1` (only B visible, no merge)
- Column B hidden: the origin cell is hidden; suppressed cells C and D become
  normal cells (SpanMap recomputes on visible column change)

SpanMap always indexes by data column ID. The rendering layer maps logical spans
to visible column spans using the current visible column set.

### `groupBy` relationship to `mergeRows`

The `groupBy` mutual exclusion applies to `pages-table`'s own `groupBy` property,
which renders inline group headers within a single table instance. Cell spanning
within group headers introduces undefined merge boundary semantics.

`mergeRows` is an *alternative* to `groupBy` for the "grouped data views" use
case: instead of structural group headers, the table merges adjacent cells with
equal values, producing a visual grouping effect directly in the data column.

For the `grouped-data-view` component (which renders separate `pages-table`
instances per group), each group's table can independently use `mergeRows` or
`cellSpan`. The mutual exclusion does not apply across the wrapper boundary —
each child table is an independent `pages-table` instance.

## ARIA

Merged cells use standard ARIA grid attributes:

```html
<div role="gridcell"
     aria-rowspan="3"
     aria-colspan="2"
     aria-rowindex="6"
     aria-colindex="2">
  Merged content
</div>
```

Suppressed cells are not rendered — screen readers never encounter them.

## Testing

### Unit tests (Vitest, existing pattern)

| Test | What it verifies |
|------|-----------------|
| SpanMap from `mergeRows: true` | Adjacent equal values produce correct rowSpan counts |
| SpanMap from `mergeRows` callback | Custom comparison controls merge boundaries |
| SpanMap from `cellSpan` | Explicit callback return values become origin cells |
| `cellSpan` overrides `mergeRows` | When both set, `cellSpan` wins |
| Suppressed cells | Cells covered by a span are marked `'suppressed'` |
| Overlap detection | Two origins claiming same cell: warn, discard later |
| Span clamping | Spans past last row/column clamped to bounds |
| SpanMap recomputation | Sort/filter change triggers recompute |
| `extendWindowForSpans` | Boundary scan finds origins above viewport |
| `extendWindowForSpans` | Bottom span extension beyond endIndex |
| `mergeRows` + sort | Sorting breaks equal values → spans shrink |
| Keyboard: ArrowDown skips spanned rows | From row 5 (rowSpan 3) → row 8 |
| Keyboard: ArrowRight skips spanned cols | From col 2 (colSpan 2) → col 4 |
| Selection: spanned cell selects origin key | Click span → origin row's key emitted |
| `::part()` on cells | Cells carry row class as part name |

### Visual tests (Playwright)

Visual tests verify the rendered layout, especially scroll interaction with
spanning cells. These use Playwright screenshot comparison.

Each test renders a pages-table in a controlled viewport, applies span
configuration, and asserts the visual output.

| Test | Setup | Action | Assert |
|------|-------|--------|--------|
| **Colspan renders correctly** | 6-row table, row 2 col 1 has `colSpan: 3` | None | Screenshot: merged cell visually spans 3 column widths, content centred |
| **Rowspan renders correctly** | 8-row table, col 1 rows 2-5 merged via `mergeRows: true` | None | Screenshot: single cell spans 4 row heights, content vertically centred |
| **Both directions** | Decision table layout — section header spanning 4 cols, category column merging 3 rows | None | Screenshot: correct rectangular merge regions, no visual gaps |
| **Scroll into rowspan from above** | 200-row table, col 1 `mergeRows: true` with a group spanning rows 48-55, viewport shows ~15 rows | Scroll to row 52 (mid-span) | Screenshot: merged cell in col 1 is visible, content intact, cell extends above viewport edge. No gap or missing cell. |
| **Scroll past rowspan** | Same 200-row setup | Scroll from row 52 to row 70 (past the span) | Screenshot: span no longer visible, subsequent rows render normally, no layout artefacts |
| **Scroll to top with rowspan below** | Same setup | Scroll to top (row 0) | Screenshot: rows 0-14 visible, no spans visible yet, normal rendering |
| **Fast scroll through multiple spans** | 500-row table, col 1 mergeRows with groups of 5-10 rows each | Scroll rapidly from top to middle | Screenshot at rest: current viewport shows correct span geometry, no torn or partial cells |
| **Rowspan at page boundary** | Paginated mode, pageSize 25, rows 23-27 have same value in col 1 | View page 1 | Screenshot: span shows rows 23-25 only (clamped to page), not bleeding into page 2 |
| **Rowspan after sort** | 50-row table, col 1 `mergeRows: true`, unsorted has 3 groups | Click sort on col 2 | Screenshot: groups reorganised, new span geometry reflects sorted order |
| **Colspan + column hiding** | 6-col table, col 2 has `colSpan: 3` | Hide col 3 via column picker | Screenshot: span now covers 2 columns (clamped), no layout break |
| **Hover on spanned cell** | 8-row table, col 1 rows 3-6 merged | Hover over the merged cell | Screenshot: all 4 rows highlight together |
| **Selection on spanned cell** | Same setup, `selection: 'single'` | Click the merged cell | Screenshot: merged cell and all cells in rows 3-6 show selected styling |
| **Keyboard across span** | 8-row table, col 1 rows 3-6 merged | Focus row 2 col 1, press ArrowDown | Screenshot: focus moves to the merged cell (row 3). Press ArrowDown again → focus at row 7 (past span). |
| **Virtual scroll + colspan** | 200-row table, every 20th row has a section header with `colSpan: 4` | Scroll to row 60 (section header at row 60) | Screenshot: full-width section header visible, content correct |
| **No spans — regression** | 50-row table, no span config | Render | Screenshot matches baseline: grid renders identically to current per-row model (visual regression check) |

Visual test infrastructure: a Playwright test page that mounts `<pages-table>`
with controlled data and config. Tests use `page.screenshot()` with
`toMatchSnapshot()` for pixel comparison. Viewport fixed at 800×600 for
deterministic results.

Scroll tests use `page.mouse.wheel()` or `element.evaluate(el => el.scrollTop = N)`
to control scroll position, then wait for Lit `updateComplete` before screenshot.

## Scope exclusions

- Column resizing — orthogonal feature (#85)
- Drag-to-merge — spreadsheet interaction, not a data table concern
- Non-rectangular merges — CSS Grid constraint (areas must be rectangular)
- Variable row heights with spanning — requires fixed `rowHeight` for scroll math (#84)

## Garden entries considered

- **GE-20260630-b8e2d8**: CSS Grid `fr` tracks don't collapse on `display: none`.
  Not directly applicable — single-grid model doesn't toggle individual row visibility,
  it renders only visible cells.
- **GE-20260706-dfef71**: Column picker inside header grid takes its own column slot.
  Still applicable — the header remains a separate grid (or uses the toolbar approach
  already in place). The body grid change doesn't affect the header/toolbar layout.
