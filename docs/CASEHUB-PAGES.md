# casehub-pages — LLM Integration Guide

This document is designed for LLMs building applications that use casehub-pages. casehub-pages is a structured data rendering runtime — it separates data (datasets, lookups, operations) from presentation (pages, layouts, components) and wires them together through declarative bindings. The same runtime powers dashboards, data-bound forms, CRUD interfaces, and any page that renders structured data through charts, tables, metrics, or custom components.

## Quick Start

### Installation

```bash
# Add to your Quarkus host project
yarn add @casehubio/pages-runtime @casehubio/pages-ui @casehubio/pages-data
```

### Minimal Page (TypeScript DSL — preferred)

```typescript
import { page, barChart, inlineDataset } from "@casehubio/ui";
import { lookup, groupBy, col, sum } from "@casehubio/data";
import { loadSite } from "@casehubio/pages-runtime";

// 1. Define data
inlineDataset("sales", JSON.stringify([
  ["Q1", "North", 100], ["Q1", "South", 80],
  ["Q2", "North", 120], ["Q2", "South", 95],
]), {
  columns: [
    { id: "Quarter", type: "LABEL" },
    { id: "Region", type: "LABEL" },
    { id: "Revenue", type: "NUMBER" },
  ],
});

// 2. Build the component tree
const salesPage = page("Sales",
  barChart({
    title: "Revenue by Region",
    lookup: lookup("sales", groupBy("Region", col("Region"), sum("Revenue"))),
  }),
);

// 3. Render
const site = await loadSite(document.getElementById("app")!, salesPage);
```

### Minimal Page (YAML)

```yaml
datasets:
  - uuid: sales
    content: '[["Q1","North",100],["Q1","South",80]]'
    columns:
      - { id: Quarter, type: LABEL }
      - { id: Region, type: LABEL }
      - { id: Revenue, type: NUMBER }

pages:
  - name: Sales
    components:
      - bar-chart:
          title: Revenue by Region
          lookup:
            uuid: sales
            group:
              columnGroup:
                source: Region
              columns:
                - { source: Region }
                - { source: Revenue, function: SUM }
```

```typescript
import { loadSite } from "@casehubio/pages-runtime";
const site = await loadSite(document.getElementById("app")!, yamlString);
```

## TypeScript DSL vs YAML — When to Use Which

**Always prefer the TypeScript DSL.** It provides:
- Full type safety — the compiler catches invalid prop combinations
- IDE autocompletion for all builder functions and props
- Composability — extract common patterns into functions
- Conditional logic — show/hide components based on runtime state

**Use YAML only** when pages are defined at runtime (e.g., stored in a database and loaded dynamically). YAML is parsed via `js-yaml` and desugared into the same component tree.

## Core Concepts

### Data–Presentation Separation

casehub-pages enforces a strict separation between data and presentation:

- **Data layer** (`pages-data`) — datasets, column schemas, lookup operations (filter, group, sort, aggregate). Data is defined once and bound to components by reference.
- **Presentation layer** (`pages-component`, `pages-viz`) — layout containers, navigation, charts, tables, forms. Components declare what data they need via a `lookup` binding, never how to fetch or transform it.
- **Runtime** (`pages-runtime`) — wires data to presentation at render time. Manages the data pipeline, event delegation, filter state, and lifecycle.

This separation means the same dataset can drive a chart, a table, and a form simultaneously. Changing the data source (inline → REST → Prometheus) requires no changes to the components. Adding a new visualization requires no changes to the data layer.

### Architecture

```
Data sources → DataSet engine → Component tree → Layout renderer → Web Components
```

**Packages** (dependency order):
1. `@casehubio/pages-data` — DataSet model, lookup/filter/group/sort operations, external data resolution
2. `@casehubio/pages-component` — Component type model, CSS grid layout renderer
3. `@casehubio/pages-viz` — Web Component chart/table/metric wrappers (ECharts)
4. `@casehubio/pages-ui` — TypeScript DSL builders, YAML parser
5. `@casehubio/pages-runtime` — Site orchestrator: `loadSite()` API, navigation, data pipeline, event delegation

### Import Aliases

The monorepo configures these aliases for ergonomic imports:

| Alias | Package |
|-------|---------|
| `@casehubio/ui` | `@casehubio/pages-ui` |
| `@casehubio/data` | `@casehubio/pages-data` |

## Component Model

Every UI element is a `Component` object:

```typescript
interface Component {
  readonly type: string;          // "page", "bar-chart", "table", "tabs", etc.
  readonly id?: string;           // Unique identifier (auto-generated for grids)
  readonly props?: object;        // Type-specific configuration
  readonly style?: Record<string, string>;  // Inline CSS overrides
  readonly slots?: Record<string, readonly Component[]>;  // Named child slots
  readonly items?: readonly GridItem[];     // Grid placement items
}
```

### Component Types

#### Layout Components

| Type | DSL Builder | Purpose |
|------|------------|---------|
| `page` | `page(name, ...children)` | Top-level container with datasets and settings |
| `rows` | `rows(...children)` | Vertical flex layout |
| `columns` | `columns(distribution, ...slotContents)` | Flex columns with width distribution |
| `grid` | `grid(columns, ...items)` | CSS grid with explicit placement |
| `panel` | `panel(title, ...children)` | Titled container |

#### Navigation Components

All navigation components share the same DSL pattern: `navType(["Label", ...children], ...)`.

| Type | DSL Builder | Rendering |
|------|------------|-----------|
| `tabs` | `tabs(["A", ...], ["B", ...])` | Horizontal tab bar |
| `pills` | `pills(["A", ...], ...)` | Rounded pill buttons |
| `sidebar` | `sidebar(["A", ...], ...)` | Vertical sidebar navigation |
| `menu` | `menu(["A", ...], ...)` | Horizontal menu bar |
| `tree` | `tree(["A", ...], ...)` | Hierarchical tree (use `"Group/Leaf"` for nesting) |
| `tiles` | `tiles(["A", ...], ...)` | Clickable card grid |
| `accordion` | `accordion(["A", ...], ...)` | Collapsible sections |
| `carousel` | `carousel(["A", ...], ...)` | Previous/next navigation |
| `stack` | `stack(...children)` | Single-slot, programmatic switching |

#### Data Components (Visualization)

All data components require a `lookup` prop that binds them to a dataset.

| Type | DSL Builder | Props Interface |
|------|------------|-----------------|
| `bar-chart` | `barChart(props)` | `BarChartProps` — subtypes: column, bar, column_stacked, bar_stacked |
| `line-chart` | `lineChart(props)` | `LineChartProps` — subtypes: line, smooth |
| `area-chart` | `areaChart(props)` | `AreaChartProps` — subtypes: area, area_stacked |
| `pie-chart` | `pieChart(props)` | `PieChartProps` — subtypes: pie, donut |
| `scatter-chart` | `scatterChart(props)` | `ScatterChartProps` |
| `bubble-chart` | `bubbleChart(props)` | `BubbleChartProps` |
| `timeseries` | `timeseries(props)` | `TimeseriesProps` |
| `meter` | `meter(props)` | `MeterProps` — gauge with warning/critical thresholds |
| `table` | `table(props)` | `TableProps` — sortable, filterable, paginated |
| `metric` | `metric(props)` | `MetricProps` — subtypes: card, card2, plain-text, quota |
| `selector` | `selector(props)` | `SelectorProps` — subtypes: dropdown, slider, labels |
| `map` | `mapChart(props)` | `MapProps` — geographic choropleth |

#### Content Components

| Type | DSL Builder | Purpose |
|------|------------|---------|
| `html` | `html(content)` | Raw HTML content |
| `markdown` | `markdown(content)` | Markdown content (rendered to HTML) |
| `title` | `title(text, size?)` | Heading element |

#### Form Input Components

Form inputs bind to a page's `dataScope` and emit `casehub-field-change` events.

| Type | DSL Builder | Purpose |
|------|------------|---------|
| `text-input` | `textInput(props)` | Text field |
| `number-input` | `numberInput(props)` | Numeric field |
| `dropdown` | `dropdown(props)` | Select dropdown |
| `checkbox` | `checkbox(props)` | Boolean toggle |
| `date-picker` | `datePicker(props)` | Date selector |
| `textarea` | `textarea(props)` | Multi-line text |

### Component Modifiers

```typescript
withId("my-chart", barChart({...}))       // Set component ID
withStyle({ margin: "20px" }, panel(...)) // Inline CSS
withAccess({ roles: ["admin"] }, panel(...)) // Role-based access
```

## Datasets

### External (URL-based)

```typescript
import { dataset } from "@casehubio/ui";
dataset("metrics", "https://api.example.com/metrics.json");
```

### Inline (embedded JSON)

```typescript
import { inlineDataset } from "@casehubio/ui";
inlineDataset("products", JSON.stringify([
  ["Laptop", 999], ["Phone", 699],
]), {
  columns: [
    { id: "Name", type: "LABEL" },
    { id: "Price", type: "NUMBER" },
  ],
});
```

### Column Types

| Type | TypeScript | Description |
|------|-----------|-------------|
| `LABEL` | `string` | Text values |
| `NUMBER` | `number` | Numeric values |
| `DATE` | `Date` | Date/time values |

### Page-Scoped Datasets

Datasets can be scoped to specific pages:

```typescript
page("Sales",
  barChart({ lookup: lookup("regional-sales", ...) }),
  { datasets: [dataset("regional-sales", "/api/sales/regional")] },
);
```

## Data Operations (Lookup API)

Every data component requires a `lookup` that specifies which dataset to query and what operations to apply.

```typescript
import { lookup, groupBy, col, sum, avg, count, min, max, filterBy, sortBy } from "@casehubio/data";
```

### Grouping

```typescript
// Group by Region, show Region name and sum of Revenue
lookup("sales", groupBy("Region", col("Region"), sum("Revenue")))

// No grouping key (aggregate entire dataset)
lookup("sales", groupBy(null, sum("Revenue"), count("Region")))
```

**Aggregation functions:** `sum`, `avg`, `count`, `min`, `max`, `distinct`, `join`

### Filtering

```typescript
// Single filter
lookup("sales", filterBy("Revenue", "GREATER_THAN", 100))

// Combined filters
lookup("sales", and(
  filterBy("Region", "EQUALS_TO", "North"),
  filterBy("Revenue", "GREATER_THAN", 50),
))

// Logical operators: and(), or(), not()
```

**Filter functions:** `EQUALS_TO`, `NOT_EQUALS_TO`, `GREATER_THAN`, `GREATER_OR_EQUALS_TO`, `LOWER_THAN`, `LOWER_OR_EQUALS_TO`, `BETWEEN`, `LIKE`, `NOT_LIKE`, `IN`, `NOT_IN`, `IS_NULL`, `NOT_NULL`

### Sorting

```typescript
lookup("sales", sortBy("Revenue", "DESCENDING"))
```

### Combining Operations

Operations compose — group, filter, and sort in a single lookup:

```typescript
lookup("sales",
  filterBy("Revenue", "GREATER_THAN", 50),
  groupBy("Region", col("Region"), sum("Revenue")),
  sortBy("Revenue", "DESCENDING"),
)
```

## Cross-Filtering (Event Protocol)

Components communicate via custom DOM events that bubble through the component tree.

### Enabling Cross-Filter

```typescript
// Emitter: fires filter events on interaction
selector({
  filter: { enabled: true, notification: true },
  lookup: lookup("sales", groupBy("Region", col("Region"))),
})

// Listener: re-queries when a filter arrives
barChart({
  filter: { listening: true },
  lookup: lookup("sales", groupBy("Region", col("Region"), sum("Revenue"))),
})
```

### Filter Props

| Prop | Default | Purpose |
|------|---------|---------|
| `enabled` | `false` | Emit filter events on click |
| `listening` | `false` | React to incoming filter events |
| `notification` | `false` | (Legacy) synonym for `enabled` |
| `selfApply` | `false` | Apply own filter to self |
| `group` | `undefined` | Filter group name (isolates filter channels) |

### casehub-filter Event Detail

The `casehub-filter` event detail is a discriminated union:

```typescript
type CasehubFilterDetail = CasehubFilterApply | CasehubFilterReset;

interface CasehubFilterApply {
  readonly columnId: string;
  readonly value: string;      // Resolved by emitter at dispatch time
  readonly row: TypedRow;       // Full row reference
  readonly reset: false;
  readonly group: string | undefined;
}

interface CasehubFilterReset {
  readonly columnId: string;
  readonly reset: true;
  readonly group: string | undefined;
}
```

**Key behaviors:**

- **Emitters resolve `value` and `row` at dispatch time.** The runtime never extracts values from the row or falls back to positional indices.
- **Toggle semantics:** All emitters (except slider and iframe components) support click-to-select, click-again-to-deselect. Charts and tables track `_selectedValue`; selectors track `_selectedValue` for labels.
- **Visual feedback:**
  - Charts use ECharts `highlight`/`downplay` actions (same appearance as hover).
  - Tables use `.selected` CSS class (`background: var(--casehub-bg-selected, #e8f0fe)`).
  - Selectors use label chip highlighting (existing behavior).
- **NULL values:** Emitters skip the event when the resolved cell value is NULL.
- **Record selection:** Any component (not just tables) can trigger DataScope record selection if the emitted row contains the child DataScope's `idColumn`. The runtime infers the path from the data shape via try/catch on `row.cell(idColumn)` for apply events and `ds.columns.some()` for reset events.

### Event Types

| Event | Emitted By | Data |
|-------|-----------|------|
| `casehub-filter` | Selector, Table, Charts, IframePlugin | `CasehubFilterDetail` (see above) |
| `casehub-sort` | Table (server-side) | `{ columnId, order }` |
| `casehub-page` | Table (server-side) | `{ offset, count }` |
| `casehub-data-request` | All viz components | `{ element, lookup }` |
| `casehub-field-change` | Form inputs | `{ field, value, committed }` |
| `casehub-slot-change` | Navigation components | `{ activeSlot, containerId }` |

## loadSite() API

```typescript
import { loadSite } from "@casehubio/pages-runtime";
import type { LiveSite, SiteOptions } from "@casehubio/pages-runtime";

const site: LiveSite = await loadSite(target, source, options?);
```

### Parameters

| Param | Type | Description |
|-------|------|-------------|
| `target` | `HTMLElement` | Container element to render into |
| `source` | `string \| Component` | YAML string or Component tree |
| `options` | `SiteOptions` | Optional configuration |

### SiteOptions

```typescript
interface SiteOptions {
  permissions?: PermissionContext;  // Role/permission checks
  fetch?: typeof fetch;            // Custom fetch implementation
  baseUrl?: string;                // Base URL for relative dataset URLs
  providerConfig?: DataProviderConfig;  // Provider-specific config
  adapters?: Record<string, SaveAdapter>;  // Custom save adapters
}
```

### LiveSite (Return Value)

```typescript
interface LiveSite {
  root: Component;                          // The component tree
  page(path: string): Component | null;     // Find page by path
  dataset(id, fromPage?): DataSetDef | null; // Find dataset definition
  state: ViewState;                         // Current page, filters, sort, pagination
  navigate(path: string): void;             // Programmatic navigation
  setTheme(theme: "light" | "dark" | CasehubTheme): void;  // Switch theme
  dispose(): void;                          // Cleanup all listeners and timers
}
```

### ViewState

```typescript
interface ViewState {
  readonly currentPage: string;      // Active page path (e.g., "Sales/Revenue")
  readonly activeFilters: Readonly<Record<string, readonly string[]>>;  // Active cross-filters
  readonly sort: Readonly<Record<string, { columnId: string; order: SortOrder }>>;  // Per-component sort
  readonly pagination: Readonly<Record<string, number>>;  // Per-component page number
}
```

`sort` and `pagination` are keyed by component ID — only components with explicit IDs (set via `withId()`) appear here.

### URL State Persistence

Dashboard state is persisted in the URL hash so dashboards are bookmarkable and shareable:

```
#/page/Sales/Revenue?filter=region:North|South&sort=sales-table:Revenue:DESCENDING&page=sales-table:2
```

| Param | Format | Description |
|-------|--------|-------------|
| Page path | `#/page/<path>` | Active page (from navigation) |
| `filter` | `col:val\|val,col2:val` | Cross-filter state |
| `sort` | `id:col:order` | Per-component sort (component ID : column : ASCENDING/DESCENDING) |
| `page` | `id:num` | Per-component page number (0-indexed, page 0 omitted) |

**Opt-in via `withId()`:** Only components with explicit IDs get their sort/pagination persisted to the URL. Components without IDs have ephemeral state that works within the session but is lost on reload.

```typescript
// This table's sort/pagination state is bookmarkable:
withId("sales-table", table({
  sortable: true,
  pageSize: 10,
  lookup: lookup("sales"),
}))

// This table's sort/pagination works but is lost on reload:
table({
  sortable: true,
  pageSize: 10,
  lookup: lookup("sales"),
})
```

Component IDs must be globally unique across the component tree. If two pages use the same ID, they share state.

## Theming

### Declarative (YAML/DSL)

```typescript
page("App", ...,
  { settings: { mode: "dark" } },
);
```

### Programmatic

```typescript
import { LIGHT_THEME, DARK_THEME, applyTheme } from "@casehubio/pages-runtime";
import type { CasehubTheme } from "@casehubio/pages-runtime";

// After loadSite:
site.setTheme("dark");
site.setTheme("light");

// Custom theme:
const custom: CasehubTheme = {
  ...LIGHT_THEME,
  accent: "#e91e63",
  accentHover: "#c2185b",
};
site.setTheme(custom);
```

### CSS Custom Properties

All components use these CSS custom properties (set on the container element):

| Property | Light Default | Dark Default | Purpose |
|----------|--------------|-------------|---------|
| `--casehub-font` | `system-ui, sans-serif` | same | Font family |
| `--casehub-font-size` | `14px` | same | Base font size |
| `--casehub-text` | `#333` | `#e0e0e0` | Text color |
| `--casehub-text-muted` | `#888` | `#999` | Muted text |
| `--casehub-bg` | `#fff` | `#1a1a2e` | Background |
| `--casehub-bg-alt` | `#f0f0f0` | `#16213e` | Alternate background |
| `--casehub-bg-hover` | `#e8f0fe` | `#1e3a5f` | Hover background |
| `--casehub-border` | `#e0e0e0` | `#3a3a5e` | Borders |
| `--casehub-radius` | `4px` | same | Border radius |
| `--casehub-accent` | `#5470c6` | `#7c8cf8` | Accent color |

## Table Export

Tables support CSV export when `csvExport: true` is set:

```typescript
table({
  csvExport: true,
  pageSize: 10,
  lookup: lookup("sales"),
})
```

This renders download and copy-to-clipboard buttons in the table toolbar.

**Programmatic export** (without the table UI):

```typescript
import { tableToCsv, downloadCsv, copyToClipboard } from "@casehubio/pages-viz";

const csv = tableToCsv(dataset, columnSettings);
downloadCsv(csv, "report.csv");
await copyToClipboard(csv);
```

## Forms and Data Editing

For master-detail CRUD interfaces:

```typescript
page("Contacts",
  // Master: table listing all contacts
  table({
    filter: { enabled: true },
    lookup: lookup("contacts"),
  }),

  // Detail: form bound to selected contact
  page("Detail",
    textInput({ field: "name", label: "Name" }),
    textInput({ field: "email", label: "Email" }),
    numberInput({ field: "age", label: "Age" }),
    {
      dataScope: { dataset: "contacts", idColumn: "id" },
      save: { adapter: "rest", trigger: "auto", delay: 2000 },
    },
  ),
);
```

### Save Adapters

| Adapter | Description |
|---------|-------------|
| `local` | Updates the in-memory dataset (no persistence) |
| `rest` | PUT/POST/DELETE to the dataset URL |
| Custom | Pass via `SiteOptions.adapters` |

## Grid Layout

For precise component placement:

```typescript
import { grid, at } from "@casehubio/ui";

grid(12,
  at(0, 0, 12, 1, title("Overview")),     // Full width header
  at(0, 1, 6, 2, barChart({...})),        // Left half, 2 rows tall
  at(6, 1, 6, 1, metric({...})),          // Right half, top
  at(6, 2, 6, 1, table({...})),           // Right half, bottom
)
// at(x, y, width, height, component)
```

## Best Practices

### Page Composition

Extract reusable page sections as functions:

```typescript
function kpiRow(datasetId: string) {
  return columns([4, 4, 4],
    [metric({ title: "Total", lookup: lookup(datasetId, groupBy(null, sum("value"))) })],
    [metric({ title: "Average", lookup: lookup(datasetId, groupBy(null, avg("value"))) })],
    [metric({ title: "Count", lookup: lookup(datasetId, groupBy(null, count("id"))) })],
  );
}

page("Overview", kpiRow("sales"), barChart({...}));
```

### Performance

- Use `pageSize` on tables to avoid rendering thousands of rows
- Use `refresh: { interval: 30000 }` for polling — don't re-render the entire site
- Scope datasets to pages that use them — unused datasets are not fetched

### Cross-Filter Groups

Use `group` to create independent filter channels:

```typescript
selector({ filter: { enabled: true, group: "region" }, ... })
barChart({ filter: { listening: true, group: "region" }, ... })  // Reacts to region
table({ filter: { listening: true, group: "date" }, ... })       // Ignores region filters
```

### Cleanup

Always call `site.dispose()` when unmounting:

```typescript
// In a Quarkus/Quinoa host:
const site = await loadSite(el, dashboard);
// On unmount:
site.dispose();
```

## Quinoa Integration (Quarkus Host)

For Quarkus applications using casehub-pages via Quinoa:

```typescript
// src/main/webapp/src/app.ts
import { page, barChart, dataset } from "@casehubio/ui";
import { lookup, groupBy, col, sum } from "@casehubio/data";
import { loadSite } from "@casehubio/pages-runtime";

dataset("api-data", "/api/metrics");

export default page("Metrics",
  barChart({
    title: "API Metrics",
    lookup: lookup("api-data", groupBy("endpoint", col("endpoint"), sum("count"))),
  }),
);
```

The `dataset()` URL is resolved relative to the Quarkus server — REST endpoints work directly.

## Reference: All DSL Imports

```typescript
// Layout + content builders
import {
  page, rows, columns, grid, at, panel,
  tabs, pills, sidebar, menu, tree, tiles, accordion, carousel, stack,
  html, markdown, title,
  withId, withStyle, withAccess,
} from "@casehubio/ui";

// Data component builders
import {
  barChart, lineChart, areaChart, pieChart, scatterChart, bubbleChart,
  timeseries, table, metric, meter, selector, mapChart, iframePlugin,
} from "@casehubio/ui";

// Form input builders
import {
  textInput, numberInput, dropdown, checkbox, datePicker, textarea,
} from "@casehubio/ui";

// Dataset builders
import { dataset, inlineDataset } from "@casehubio/ui";

// Data operations
import {
  lookup, groupBy, groupByCalendar,
  col, sum, avg, count, min, max, distinct, join,
  filterBy, and, or, not,
  sortBy,
} from "@casehubio/data";

// Runtime
import { loadSite } from "@casehubio/pages-runtime";
import type { LiveSite, SiteOptions } from "@casehubio/pages-runtime";

// Theme
import { LIGHT_THEME, DARK_THEME, applyTheme, clearTheme } from "@casehubio/pages-runtime";
import type { CasehubTheme } from "@casehubio/pages-runtime";

// Table export utilities
import { tableToCsv, downloadCsv, copyToClipboard } from "@casehubio/pages-viz";
```
