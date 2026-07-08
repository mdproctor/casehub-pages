# Grouped View Component — Design Spec

**Date:** 2026-07-08
**Status:** Draft
**Component:** `pages-grouped-view`
**Package:** `pages-viz`

## Problem

Dashboard consumers need grouped tabular data rendered in multiple visual styles depending on data shape and audience. An LLM generating a dashboard should be able to select the right presentation by reading guidance metadata, without knowing the rendering internals. Today the pipeline has full grouping support (`GroupOp`, `Interval`, aggregations) but no component that renders grouped data with configurable visual modes.

## Design

### Two Independent Axes

The component separates **group presentation** from **content presentation**:

| Axis | Options | Controls |
|------|---------|----------|
| Group display | `table-row`, `section-heading` | How the group separator renders |
| Content display | `table`, `list` | How items within each group render |

Three combinations are valid. `table-row` + `list` is structurally invalid — `<dl>` content cannot be rendered inside table rows — and is rejected during desugaring.

| groupDisplay | contentDisplay | Valid | Rationale |
|---|---|---|---|
| `table-row` | `table` | Yes | Natural: group headers and items are both table rows |
| `section-heading` | `table` | Yes | Section headers outside the table, content inside |
| `section-heading` | `list` | Yes | Section headers with key-value list content |
| `table-row` | `list` | **No** | Structurally incoherent — `<dl>` inside `<tr>` |

### Presets

| Preset | groupDisplay | contentDisplay | Guidance |
|--------|-------------|----------------|----------|
| `spreadsheet` | `table-row` | `table` | Dense data, comparison tasks, >20 items per group. Traditional spreadsheet look. |
| `sectioned` | `section-heading` | `table` | Browsing/navigation, date or category groups, mixed group sizes. Group headers are page-level text outside the table. |
| `list` | `section-heading` | `list` | Small datasets (<7 items/group), status boards, at-a-glance views. Items render as aligned key-value rows, not table rows. |

Explicit `groupDisplay` / `contentDisplay` override preset values. Default (no preset, no explicit modes): `sectioned`.

### Types

New types in `packages/pages-component/src/model/displayer-types.ts`:

```typescript
type GroupDisplayMode = 'table-row' | 'section-heading';
type ContentDisplayMode = 'table' | 'list';
type GroupedViewPreset = 'spreadsheet' | 'sectioned' | 'list';

type GroupedViewMode =
  | { groupDisplay: 'table-row'; contentDisplay: 'table' }
  | { groupDisplay: 'section-heading'; contentDisplay: 'table' }
  | { groupDisplay: 'section-heading'; contentDisplay: 'list' };

interface AggregationBinding {
  readonly column: ColumnId;
  readonly fn: Aggregation;
}

interface GroupedViewProps extends DataComponentCommon {
  readonly groupBy: GroupingKey;
  readonly preset?: GroupedViewPreset;
  readonly groupDisplay?: GroupDisplayMode;
  readonly contentDisplay?: ContentDisplayMode;
  readonly defaultExpanded?: boolean;
  readonly showGroupSummary?: boolean;
  readonly aggregations?: readonly AggregationBinding[];
  readonly order?: 'asc' | 'desc';
  readonly emptyGroups?: boolean;
}
```

`AggregationBinding` pairs a column reference with an aggregation function. During desugaring, each binding becomes a `ResultColumn` with `kind: "aggregate"` in the generated `GroupOp.columns`.

`GroupedViewMode` restricts valid axis combinations at the type level. `resolvePreset()` returns a `GroupedViewMode` — invalid combinations (e.g., `table-row` + `list`) are caught during desugaring and rejected with a parse error.

Preset definitions are data, not logic:

```typescript
const PRESETS: Record<GroupedViewPreset, GroupedViewMode & {
  defaultExpanded: boolean;
  guidance: string;
}> = {
  spreadsheet: {
    groupDisplay: 'table-row',
    contentDisplay: 'table',
    defaultExpanded: true,
    guidance: 'Dense data, comparison tasks, >20 items per group. Traditional spreadsheet look.',
  },
  sectioned: {
    groupDisplay: 'section-heading',
    contentDisplay: 'table',
    defaultExpanded: true,
    guidance: 'Browsing/navigation, date or category groups, mixed group sizes. Group headers are page-level text outside the table.',
  },
  list: {
    groupDisplay: 'section-heading',
    contentDisplay: 'list',
    defaultExpanded: true,
    guidance: 'Small datasets (<7 items/group), status boards, at-a-glance views. Items render as aligned key-value rows, not table rows.',
  },
};
```

### Component Architecture

Extends `PagesElement<GroupedViewProps>` in `pages-viz`, consistent with every existing data component. Thin orchestrator delegating to per-mode render functions.

```
packages/pages-viz/src/components/grouped-view/
├── PagesGroupedView.ts          # extends PagesElement<GroupedViewProps> — orchestrator
├── presets.ts                   # Preset definitions with guidance metadata
├── group-extraction.ts          # extractGroupBoundaries() utility
├── render-group-table-row.ts    # groupDisplay: 'table-row' renderer
├── render-group-section.ts      # groupDisplay: 'section-heading' renderer
├── render-content-table.ts      # contentDisplay: 'table' renderer
├── render-content-list.ts       # contentDisplay: 'list' renderer
└── group-view-styles.ts         # Shared styles using design tokens
```

**Data flow:**

1. The desugaring layer converts YAML `groupBy` into a `GroupOp` with appropriate `ResultColumn[]` entries (key column from `groupBy`, aggregate columns from `aggregations`, select columns from `columns` or all non-key columns by default)
2. The runtime pipeline applies the `GroupOp` via `applyGroupSequence()`, producing a result `TypedDataSet` with key, aggregate, and select columns
3. `PagesElement` delivers this result `TypedDataSet` to the component via the standard `dataSet` setter
4. The component calls `extractGroupBoundaries(dataset, keyColumnId, aggregateColumnIds)` to identify groups — a scan of the key column for value transitions, producing `GroupBoundary[]` with name, row range, and per-group aggregate values
5. The component renders each group using the resolved mode's render functions

```typescript
interface GroupBoundary {
  readonly name: string;
  readonly startRow: number;
  readonly rowCount: number;
  readonly aggregates: ReadonlyMap<ColumnId, unknown>;
}

function extractGroupBoundaries(
  dataset: TypedDataSet,
  keyColumnId: ColumnId,
  aggregateColumnIds: readonly ColumnId[]
): readonly GroupBoundary[];
```

The component class:
- Generates `_instanceId` via `crypto.randomUUID()` in `connectedCallback()` — used to scope all `id` and `aria-controls` attributes for document uniqueness
- Resolves preset + overrides → concrete `GroupedViewMode` via `resolvePreset()`
- Receives a grouped `TypedDataSet` from the pipeline via `PagesElement`'s data lifecycle
- Calls `extractGroupBoundaries()` to identify groups from the key column in the result dataset
- Reads aggregate column values from the first row of each group boundary for summary display
- Maintains expand/collapse state: `Map<string, boolean>` keyed by group name, persisted across re-renders
- Delegates to render functions per mode combination

**Group header display:**
- The item count (e.g., "3 items") is **always shown** in every group header — it's fundamental UI feedback, not conditional
- `showGroupSummary` controls whether **aggregate values** from `aggregations` are displayed alongside the count
- When `showGroupSummary: true` and `aggregations` has entries: the header shows count AND aggregate values (e.g., "3 items · Sum: $45,000")
- When `showGroupSummary: true` but `aggregations` is empty/absent: no visible difference from `showGroupSummary: false` — only the count is shown
- When `showGroupSummary: false` (default): only the count is shown, even if `aggregations` are configured (aggregations are still computed for potential use by other consumers but not displayed)

### Rendering

**Column header bar (section-heading and list modes):**

Section-heading and list modes render each group's content as a separate `<table>` or `<dl>`. A shared column header bar renders once at the top of the component, outside any group, providing column names and sort affordance. Styled as a CSS grid row using the same `--col-widths` template as group content, ensuring alignment.

For accessibility, each group's `<table>` also includes a `<thead>` with `class="visually-hidden"` — semantically correct for screen readers but not visually duplicated. List mode's `<dt>` labels already provide per-cell column context for screen readers.

Spreadsheet mode uses a single `<table>` with a standard `<thead>` — no shared header bar needed.

**ID scoping:** All generated `id` and `aria-controls` attributes are prefixed with a component-instance identifier (`this._instanceId`, set to `crypto.randomUUID()` in `connectedCallback()`). This ensures document-unique IDs when multiple `<pages-grouped-view>` instances exist on the same page.

**`table-row` group display + `table` content (spreadsheet):**

Single `<table>`. Group headers are `<tr>` with `colspan` spanning all columns, containing a toggle button with chevron. Child rows are normal `<tr>`s. Group-by column consumed by the header — not repeated in child rows.

```html
<table class="pages-grouped-view">
  <thead>
    <tr><th>Status</th><th>Name</th><th>Date</th><th>Priority</th></tr>
  </thead>
  <tbody>
    <tr class="group-header" aria-expanded="true">
      <td colspan="4">
        <button class="group-toggle">▼ Critical (3)</button>
      </td>
    </tr>
    <tr><td></td><td>Server outage</td><td>Jul 7</td><td>P0</td></tr>
    <tr><td></td><td>Data loss</td><td>Jul 6</td><td>P0</td></tr>
    <tr><td></td><td>Auth failure</td><td>Jul 5</td><td>P1</td></tr>
  </tbody>
</table>
```

**`section-heading` group display + `table` content (sectioned):**

Group headers are `<div>` with heading-like styling — larger font, no background, no borders. A shared column header bar sits at the top. Each group's content is a separate `<table>` with `table-layout: fixed` and `<colgroup>` for cross-group column alignment. Toggle button has `aria-expanded` and `aria-controls` with instance-scoped IDs.

```html
<div class="pages-grouped-view sectioned">
  <div class="column-header-bar" style="grid-template-columns: var(--col-widths)">
    <button class="col-header" data-column="name">Name ▼</button>
    <button class="col-header" data-column="date">Date</button>
    <button class="col-header" data-column="priority">Priority</button>
  </div>
  <div class="group-section">
    <button class="section-toggle" aria-expanded="true" aria-controls="a1b2c3-group-0">
      <span class="section-chevron">▼</span>
      <span class="section-title">Critical</span>
      <span class="section-summary">3 items</span>
    </button>
    <div class="section-content" id="a1b2c3-group-0">
      <table style="table-layout: fixed">
        <colgroup>
          <col style="width: 180px">
          <col style="width: 100px">
          <col style="width: 60px">
        </colgroup>
        <thead class="visually-hidden">
          <tr><th>Name</th><th>Date</th><th>Priority</th></tr>
        </thead>
        <tbody>
          <tr><td>Server outage</td><td>Jul 7</td><td>P0</td></tr>
          ...
        </tbody>
      </table>
    </div>
  </div>
</div>
```

**`section-heading` group display + `list` content (list):**

Same section headers. Shared column header bar provides column identification only — `<span>` labels, not interactive sort buttons (list mode does not support column sorting; see §Events). Content is `<dl>` with CSS grid. `<dt>` labels visually hidden but present for screen readers. Each `list-item` uses `display: contents` to participate in the parent grid.

```html
<div class="pages-grouped-view list-mode">
  <div class="column-header-bar" style="grid-template-columns: var(--col-widths)">
    <span class="col-label">Name</span>
    <span class="col-label">Date</span>
    <span class="col-label">Priority</span>
  </div>
  <div class="group-section">
    <button class="section-toggle" aria-expanded="true" aria-controls="a1b2c3-group-0">
      <span class="section-chevron">▼</span>
      <span class="section-title">Critical</span>
      <span class="section-summary">3 items</span>
    </button>
    <div class="section-content" id="a1b2c3-group-0">
      <dl class="aligned-list" style="grid-template-columns: var(--col-widths)">
        <div class="list-item">
          <dt class="visually-hidden">Name</dt><dd>Server outage</dd>
          <dt class="visually-hidden">Date</dt><dd>Jul 7</dd>
          <dt class="visually-hidden">Priority</dt><dd>P0</dd>
        </div>
      </dl>
    </div>
  </div>
</div>
```

### Cross-Group Column Alignment

The hard problem: when each group gets its own `<table>` or `<dl>`, columns must still align across groups.

**Spreadsheet mode** uses a single `<table>` — the browser handles column alignment natively via `table-layout: auto`. No JavaScript measurement needed.

**Section and list modes** require coordinated widths across separate DOM containers. CSS cannot solve this — each `<table>` or `<dl>` sizes its columns independently.

Solution: compute column widths synchronously using `CanvasRenderingContext2D.measureText()`, then apply them per-element:

- **`<table>` elements** (section-heading + table mode): `table-layout: fixed` with `<colgroup>` / `<col style="width: Npx">` per column. Preserves full table semantics — no `display: grid` on `<table>`, no `display: contents` on `<tr>`.
- **`<div>` / `<dl>` elements** (column header bar, list mode): `grid-template-columns` CSS custom property (`--col-widths`).

```typescript
function computeColumnWidths(
  dataset: TypedDataSet,
  columns: readonly ColumnId[],
  font: string,
  sampleSize?: number
): readonly number[] {
  // Uses CanvasRenderingContext2D.measureText() — synchronous, no DOM connection required
  // Measures header text + sample of up to 50 rows per column
  // Returns individual column widths in px, e.g. [180, 100, 60]
  // Falls back to equal distribution when Canvas is unavailable (SSR)
}
```

The component stores the computed widths and applies them in two formats:
- Tables: `<col style="width: ${w}px">` elements inside `<colgroup>`
- Grid containers: `--col-widths: ${widths.map(w => w + 'px').join(' ')}`

- **No layout thrash**: Canvas text measurement is synchronous and requires no DOM connection — widths are available before first render
- **O(sample × columns)**: samples up to 50 rows per column, not the full dataset
- **No layout shift**: widths computed before first paint — no double-render or jump
- **Fallback**: equal distribution for SSR or environments without Canvas

Computed once when the dataset changes.

### Styling

All styling uses existing `--pages-` tokens. No new token categories.

**Section headings** — page-level text, not table chrome:
- `font-size: var(--pages-font-size-lg)`
- `font-weight: var(--pages-font-weight-semibold)`
- No background fill, no borders
- Summary count in `var(--pages-neutral-8)` at `font-size-sm`

**Table-row group headers** — subtle table differentiation:
- `background: var(--pages-neutral-3)`
- `border-bottom: 1px solid var(--pages-neutral-5)`

**List mode** — visually lighter than table:
- Thinner separators (`neutral-3` vs `neutral-5`)
- No alternating row backgrounds
- More whitespace via spacing tokens

**Collapse/expand animation:**

The `hidden` attribute (for accessibility) and `max-height`/`opacity` transitions (for visual animation) are sequenced — they cannot be applied simultaneously.

- **Expanding**: remove `hidden` attribute, then on the next animation frame start `max-height` + `opacity` transition using `--pages-duration-normal` and `--pages-ease-default`
- **Collapsing**: start `max-height` + `opacity` transition, then set `hidden` attribute on `transitionend` event — content remains in the accessibility tree during the animation
- **`prefers-reduced-motion: reduce`**: skip transitions entirely — toggle `hidden` immediately with no animation

### YAML Surface

```yaml
# Simplest — preset picks everything
- type: grouped-view
  groupBy: { column: status, strategy: distinct }
  preset: sectioned

# Preset with aggregates on group header
- type: grouped-view
  groupBy: { column: date, strategy: fixedCalendar, unit: MONTH }
  preset: spreadsheet
  showGroupSummary: true
  aggregations: [{ column: amount, fn: SUM }]

# Descending group order, show empty groups
- type: grouped-view
  groupBy: { column: priority, strategy: distinct }
  preset: sectioned
  order: desc
  emptyGroups: true

# Override: section headings + list content
- type: grouped-view
  groupBy: { column: priority, strategy: distinct }
  preset: sectioned
  contentDisplay: list

# Full manual — no preset
- type: grouped-view
  groupBy: { column: region, strategy: distinct }
  groupDisplay: section-heading
  contentDisplay: table
  defaultExpanded: false
  columns: [name, revenue, headcount]
```

Data binding uses the same mechanism as all other data components: `lookup` is provided by the enclosing panel's dataset binding or an explicit `data` field in the YAML, handled by `DataComponentCommon` and the standard desugaring pipeline. No grouped-view-specific data binding is needed.

### Desugaring

The YAML surface uses simplified field names. The desugaring layer in `displayer-desugar.ts` translates to actual pipeline types, following the same pattern used for every other component's YAML → TypeScript translation.

| YAML field | Desugared type | Mapping |
|---|---|---|
| `groupBy.column` | `GroupingKey.sourceId` + `GroupingKey.columnId` | Both set to the same `ColumnId` |
| `groupBy.strategy` | `GroupingKey.strategy` | String `"distinct"` → `{ mode: "distinct" }`; `"fixedCalendar"` → `{ mode: "fixedCalendar", unit }` (requires `unit`); `"dynamicRange"` → `{ mode: "dynamicRange", preferredUnit? }`; `"dynamic"` → `{ mode: "dynamic", preferredUnit? }` |
| `groupBy.unit` | `GroupStrategy.unit` | Required when `strategy: fixedCalendar`; one of `QUARTER`, `MONTH`, `DAY_OF_WEEK`, `HOUR`, `MINUTE`, `SECOND` |
| `groupBy.preferredUnit` | `GroupStrategy.preferredUnit` | Optional when `strategy: dynamicRange` or `dynamic`; one of `DateIntervalType` values (`SECOND`, `MINUTE`, `HOUR`, `DAY`, `WEEK`, `MONTH`, `QUARTER`, `YEAR`, etc.) |
| `groupBy.maxIntervals` | `GroupingKey.maxIntervals` | Default: `100` |
| `order` | `GroupingKey.ascendingOrder` | `"asc"` (default) → `true`; `"desc"` → `false` |
| `emptyGroups` | `GroupingKey.emptyIntervals` | Default: `false` |
| `aggregations[].column` | `ResultColumn.sourceId` + `.columnId` | Both set to the same `ColumnId` |
| `aggregations[].fn` | `ResultColumn.fn` | String `"SUM"` → `{ fn: "SUM" }`; `"COUNT"` → `{ fn: "COUNT" }` etc. |

The desugaring layer generates the full `GroupOp`:
1. Creates `GroupingKey` from `groupBy` with defaults for `maxIntervals` (100), `emptyIntervals` (false), `ascendingOrder` (true)
2. Creates a `ResultColumn` with `kind: "key"` for the group-by column
3. Creates `ResultColumn` entries with `kind: "aggregate"` from `aggregations[]`
4. Creates `ResultColumn` entries with `kind: "select"` for all content columns (from `columns` or all remaining columns)
5. Assembles the `GroupOp` and adds it to the component's pipeline operations

Validation: if the resolved mode is `table-row` + `list`, desugaring emits a parse error. If `strategy: fixedCalendar` and `unit` is absent, desugaring emits a parse error. If `strategy` is not one of `distinct`, `fixedCalendar`, `dynamicRange`, or `dynamic`, desugaring emits a parse error.

### Registration

| Identifier | Value |
|---|---|
| YAML type | `grouped-view` |
| Custom element tag | `pages-grouped-view` |
| Props type | `GroupedViewProps` |

Registration requires entries in:
- `ComponentTypeRegistry` in `type-guards.ts` — `"grouped-view": GroupedViewProps`
- Type guard function `isGroupedView()` exported from `type-guards.ts`
- `DATA_COMPONENT_TYPES` set in `activation.ts` — `"grouped-view"` entry
- `TYPE_MAP` in `displayer-desugar.ts` — YAML type string mapping
- `custom-elements.ts` — TypeScript declarations for `<pages-grouped-view>`

### Pipeline Integration

The component does NOT call `applyOps()` or `applyGroupSequence()` itself. The data flow:

1. YAML `groupBy` is desugared into a `GroupOp` by the desugaring layer (see §Desugaring)
2. The runtime adds this `GroupOp` to the component's data pipeline
3. The pipeline executes: any `SortOp` applies first (ordering items), then the `GroupOp` via `applyGroupSequence()` produces a result `TypedDataSet`
4. `PagesElement` delivers this result dataset to the component via the standard `dataSet` setter
5. The component calls `extractGroupBoundaries()` to partition the result into renderable groups

The result `TypedDataSet` from `applyGroupSequence()` contains:
- **Key columns** (`kind: "key"`) — group identifier values, same for all rows in a group
- **Aggregate columns** (`kind: "aggregate"`) — computed values per group (SUM, COUNT, etc.), same for all rows in a group
- **Select columns** (`kind: "select"`) — individual row values within each group

The component identifies the key column via `props.groupBy` (the `columnId` from the desugared `GroupingKey`) and aggregate columns via `props.aggregations` (the `column` from each `AggregationBinding`).

### Group Ordering

Group order is controlled by `GroupingKey.ascendingOrder`, exposed in YAML as `order: asc | desc`.

| Strategy | Ascending (default) | Descending |
|---|---|---|
| `distinct` | Alphabetical A→Z | Alphabetical Z→A |
| `fixedCalendar` | Chronological (earliest first) | Reverse chronological |
| `dynamicRange` | Chronological (earliest first) | Reverse chronological |
| `dynamic` | Chronological (earliest first) | Reverse chronological |

Default: `asc`. The ordering is applied by the pipeline during grouping — the component renders groups in the order they appear in the result dataset.

### Empty Group Behavior

Controlled by `GroupingKey.emptyIntervals`, exposed in YAML as `emptyGroups: true | false`.

- **Default (`false`):** Only groups with at least one item appear. Empty intervals are not generated by the pipeline.
- **`true`:** The pipeline generates intervals for ranges with no data (e.g., months with no entries in a `fixedCalendar` grouping). The component renders these with:
  - Group header showing "0 items" count
  - Empty content area — collapsed by default regardless of `defaultExpanded`, to avoid visual noise from blocks of empty space
  - Expand/collapse still functional — expanding shows an empty container

### Events

Reuses existing event types:

| Event | When | Behavior |
|-------|------|----------|
| `pages-sort` | Column header click | In spreadsheet mode, sort is triggered from `<thead>` column headers. In section-heading + table mode, sort is triggered from the shared column header bar (`<button>` elements). List mode does not provide a sort affordance — the column header bar uses informational `<span>` labels, not interactive buttons. Pipeline-level re-run: adds/updates a `SortOp` before the `GroupOp`. The pipeline re-executes, producing a re-grouped dataset with items sorted within each group. Standard pipeline behavior. |
| `pages-filter` | Click-to-filter on a cell value | Same as other data components — emits filter event, pipeline re-runs with updated `FilterState` |
| `pages-event` (topic: `group-toggle`) | Expand/collapse a group | Payload: `{ group: string, expanded: boolean }`. Component-local state only — does not trigger pipeline re-run. |

### Accessibility

**Focus management on collapse:**

When a group collapses and focus is within the collapsed content, focus moves to the group's toggle button. This follows WAI-ARIA Authoring Practices for disclosure widgets — without it, focus falls to `<body>`, losing the user's position. Implementation: on collapse, check `this.contains(document.activeElement)` within the collapsing section; if true, call `toggleButton.focus()` before starting the collapse transition.

**Table-row mode:**
- Group header `<tr>` has `aria-expanded` on toggle button
- Keyboard: Enter/Space toggles group

**Section-heading mode:**
- Shared column header bar provides visual column identification and sort affordance; each group's `<table>` includes a visually-hidden `<thead>` for screen reader column association
- Toggle `<button>` has `aria-expanded` + `aria-controls` linking to content region via instance-scoped IDs (`${_instanceId}-group-${index}`)
- Collapsed content has `hidden` attribute set on `transitionend` (see §Styling collapse animation) — element is removed from accessibility tree only after visual transition completes
- Focus order: column header bar → first group header → content → next group header

**List mode:**
- Shared column header bar provides visual column identification (informational labels, not sort buttons)
- `<dt>` labels present for screen readers (`.visually-hidden`) — provides per-cell column context within each `<dl>`
- `<dl>` structure conveys key-value semantics

## Testing

### Tier 1: Unit Tests (Vitest)

Logic only, no DOM.

1. **Preset resolution** — `resolvePreset()` merges preset defaults with explicit overrides; explicit `contentDisplay` overrides preset; missing preset and modes defaults to `sectioned`; `table-row` + `list` combination rejected
2. **Column width computation** — `computeColumnWidths()` produces consistent `grid-template-columns` values via Canvas measurement; handles empty groups; handles columns with no data; samples correctly
3. **Expand/collapse state** — `Map<string, boolean>` initialised from `defaultExpanded`; toggling updates state; state persists across dataset updates when group names match
4. **Group boundary extraction** — `extractGroupBoundaries()` correctly identifies groups from key column transitions; extracts aggregate values per group; handles single-group and empty datasets
5. **Desugaring** — YAML `groupBy` desugars to `GroupOp` with correct `ResultColumn[]`; `aggregations` produce `kind: "aggregate"` entries; defaults applied for `maxIntervals`, `ascendingOrder`, `emptyIntervals`

### Tier 2: Component Tests (Vitest + DOM)

Render correctness, accessibility, events.

6. **Spreadsheet mode** — renders single `<table>` with group header `<tr>` spanning all columns; collapsed groups hide child rows; chevron rotates on toggle
7. **Sectioned mode** — shared column header bar renders once; section headings outside any `<table>`; each group's `<table>` includes visually-hidden `<thead>`; `aria-expanded` and `aria-controls` use instance-scoped IDs
8. **List mode** — shared column header bar renders once; `<dl>` with CSS grid; `<dt>` labels present but visually hidden; column alignment matches across groups (same `--col-widths`)
9. **Cross-group column alignment** — two groups with different content widths share the same `grid-template-columns` value
10. **Pipeline integration** — YAML with `type: grouped-view` adds `GroupOp` to pipeline; component receives grouped dataset and renders groups via `extractGroupBoundaries()`
11. **Event integration** — `pages-sort` triggers pipeline re-run with updated sort; `pages-filter` emits with correct column and value; `pages-event` with `group-toggle` topic fires on expand/collapse
12. **Accessibility (table-row)** — group headers have `aria-expanded`; keyboard Enter/Space toggles group
13. **Accessibility (section-heading)** — toggle buttons have `aria-expanded` + `aria-controls`; collapsed content has `hidden`; focus order is logical
14. **Focus rescue on collapse** — when focus is inside a group's content and the group is collapsed, focus moves to the group's toggle button
15. **Empty groups** — when `emptyGroups: true`, empty intervals render with "0 items" header; expand shows empty container
16. **Group ordering** — `order: desc` reverses group display order

### Tier 3: Visual Tests (Playwright)

Screenshot comparison for each mode. Tests run in both light and dark themes.

A test harness page serves the component with configurable props via query params (same pattern as existing component dev servers on port 9001).

17. **Spreadsheet preset** — expanded and collapsed states; group header row styling, chevron direction, row alternation stops at group boundaries
18. **Sectioned preset** — section heading looks like page text not table chrome; table content aligned within group; multiple groups with different row counts
19. **List preset** — items render as structured text not table rows; columns aligned across groups; lighter separators than table mode
20. **Mixed override** — `section-heading` + `table` vs `section-heading` + `list` side by side, confirming visual distinction
21. **Collapse animation** — screenshot before click, after click (collapsed); content hidden and chevron rotated
22. **Edge cases** — empty group (0 items), single-item group, group with very long text (no layout overflow)
23. **Aggregation summary** — group header shows count/sum when `showGroupSummary: true`
24. **Responsive** — narrow viewport; columns don't overflow, content remains readable

```typescript
test.describe('pages-grouped-view visual', () => {
  test('spreadsheet preset — expanded', async ({ page }) => {
    await page.goto('/test/grouped-view?preset=spreadsheet&data=cases');
    await expect(page.locator('pages-grouped-view')).toHaveScreenshot(
      'spreadsheet-expanded.png'
    );
  });

  test('sectioned preset — one group collapsed', async ({ page }) => {
    await page.goto('/test/grouped-view?preset=sectioned&data=cases');
    await page.click('.section-toggle:nth-child(2)');
    await expect(page.locator('pages-grouped-view')).toHaveScreenshot(
      'sectioned-one-collapsed.png'
    );
  });

  test('list preset — cross-group alignment', async ({ page }) => {
    await page.goto('/test/grouped-view?preset=list&data=mixed-widths');
    await expect(page.locator('pages-grouped-view')).toHaveScreenshot(
      'list-aligned.png'
    );
  });
});
```

## Decisions

- **Single component over layout composition** — keeps cross-group alignment internal (much easier than coordinating across independent child components); presets are the convenience layer, explicit modes are the composable escape hatch
- **PagesElement over Lit** — every existing data component in `pages-viz` extends `PagesElement<P>`. The web-component-strategy protocol recommends vanilla base classes for pipeline components. `PagesElement` provides data request lifecycle, loading/error states, refresh timers, and resize observers. The grouped view's expand/collapse state is a simple `Map<string, boolean>` — trivially managed without Lit reactivity. Architectural decision §10 confirms Lit is for UI primitives (`pages-primitives`), not data visualization components.
- **Three valid mode combinations, not four** — `table-row` + `list` is structurally incoherent (`<dl>` cannot render inside `<tr>`). Restricted at the type level via `GroupedViewMode` discriminated union rather than runtime validation.
- **No new design tokens** — composes from existing neutral, spacing, font, motion tokens
- **Section headings are not `<h2>`/`<h3>`** — nesting depth is unknown; styled divs with button controls avoid heading-level conflicts
- **`<dl>` for list mode** — semantically correct for key-value data; CSS grid for alignment; `<dt>` visually hidden for screen readers
- **Group-by column excluded from child rows** — consumed by group header; avoids redundant display
- **Canvas-based column measurement** — `CanvasRenderingContext2D.measureText()` is synchronous, requires no DOM connection, and eliminates layout shift. Spreadsheet mode uses native table column sizing and needs no measurement. Computed widths are applied via `<colgroup>`/`<col>` with `table-layout: fixed` for `<table>` elements, and CSS `grid-template-columns` for `<div>`/`<dl>` elements — each element type uses its native width mechanism.
- **Pipeline-level sorting** — `pages-sort` triggers a pipeline re-run with `SortOp` before `GroupOp`, consistent with all other data components. No component-level sort interception needed.
- **Column widths computed once per dataset change** — shared across all groups via CSS custom property; avoids per-group measurement
- **Shared column header bar for section/list modes** — renders once at the top rather than repeating `<thead>` per group. Provides visual column identification and sort affordance. Each group's `<table>` includes a visually-hidden `<thead>` for screen reader column association.
- **Instance-scoped IDs** — `aria-controls` and `id` attributes prefixed with `crypto.randomUUID()` per component instance. Prevents ID collisions when multiple `<pages-grouped-view>` instances coexist.
- **Item count always visible** — shown in every group header unconditionally. `showGroupSummary` controls only aggregate values alongside the count, not the count itself.
- **Sequenced collapse animation** — `hidden` attribute set on `transitionend`, not simultaneously with `max-height` transition. Reduced-motion users get immediate `hidden` toggle.
- **`<colgroup>` for table column widths** — `table-layout: fixed` + `<colgroup>`/`<col>` preserves full table semantics. CSS `grid-template-columns` on `<table>` requires `display: grid` which strips `<tr>` row semantics and causes screen reader issues.
- **List mode omits sort** — list mode is for small, at-a-glance datasets; `<dl>` key-value semantics don't map to sortable columns. Header bar uses informational `<span>` labels, not interactive `<button>` controls.
- **Focus rescue on collapse** — when focus is inside collapsing content, it moves to the group's toggle button (WAI-ARIA disclosure widget pattern). Prevents focus falling to `<body>`.
