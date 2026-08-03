# casehub-pages -- Contributor Guide

> Internal architecture, extension points, and development guide for platform builders working on the casehub-pages codebase.

**GitHub:** [casehubio/casehub-pages](https://github.com/casehubio/casehub-pages)

---

## Internal Architecture

### Data Flow

```
YAML -> @casehubio/pages-ui (parse) -> @casehubio/pages-data (resolve)
  -> @casehubio/pages-component (layout) -> @casehubio/pages-viz (render)
  -> pages-filter/pages-sort events -> back to data layer
```

**`loadSite(config, options)`** from `@casehubio/pages-runtime` is the entry point:
1. Parses YAML, builds `DataSetScope` (all datasets), `PageIndex` (navigation structure)
2. Calls `renderComponent()` from `@casehubio/pages-component` -- creates CSS grid layout
3. For each panel, calls `createDataPipeline()` -- wires dataset resolution, operations, and delivery via `DataReceiver`
4. Components emit `pages-event` on user interaction (filter, sort) -- pipeline re-evaluates -- fresh data delivered

### pages-event System

Custom event protocol for cross-component communication. Emitted by `emitPagesEvent(target, detail)`, observed via `onPagesEvent(target, handler)`. Defined in `@casehubio/pages-component`.

**Event types:**
- `pages-filter` -- filter change from a chart drill-down or filter widget (`PagesFilterDetail` with apply/reset discriminated union)
- `pages-sort` -- sort change from a table header click (`SortChangeDetail` with sort stack)
- `pages-navigation` -- page navigation request
- `pages-theme-change` -- theme switch (dispatched by `applyTheme()`, carries `name` and `mode`)
- `pages-action-request` -- action button/form submit (`PagesActionRequestDetail`)

Events propagate through the data pipeline -- `createDataPipeline()` wires pipeline refresh on filter/sort events. Cross-filter state is managed by `createFilterState()` / `getActiveFilterOps()` / `clearPageFilters()` in `@casehubio/pages-runtime`.

### DataSet Model

Core data model from `@casehubio/pages-data`. Columnar representation with typed operations.

| Type | Purpose |
|------|---------|
| `TypedDataSet` | Immutable dataset with typed columns and rows. |
| `TypedRow` | Row with `cell(columnId)` accessor returning `CellValue`. |
| `Column` | Column metadata: `id` (`ColumnId`), `name`, `type` (`ColumnType`). |
| `ColumnType` | `TEXT`, `NUMBER`, `DATE`, `LABEL`. |
| `DataSetOp` | Operations: filter, sort, group, select. |
| `applyOps(dataset, ops[])` | Apply operation pipeline to a dataset. |
| `validateOpOrder(ops[])` | Validate `F*G*S?` ordering invariant. |

**External data:** `resolveExternalDataSet()` fetches data from external sources (CSV, JSON, metrics endpoints). Supports JSONata transformation via `extractDataSet()`. `parseCsv()`, `parseMetrics()` for format-specific parsing.

**TypedDataSet pipeline:** Fully typed throughout -- `TypedDataSet`, `TypedRow`, `Column` with `ColumnType`, `ColumnId`. Filter expressions carry resolved types from column metadata. Sort operations use `SortColumn` with column reference. The pipeline operates on typed data end-to-end rather than converting at boundaries. `DataSetId` is a branded string type via `dataSetId()`.

**DataSetManager:** Typed dataset management with `get`, `remove`, `has`, `apply` (event-driven updates), `lookup` (with pagination via `rowOffset`/`rowCount` in `LookupOptions`), and `age` (staleness tracking). Lookup resolves filter types against column metadata before applying ops. `DataSetEvent` provides the typed event system for dataset mutations.

**DataSetLookup:** `createLookup()` / `parseLookup()` for structured dataset queries with filter/group/sort operations.

**Group extraction:** `extractGroupBoundaries()` and `extractGroupTree()` produce `GroupBoundary[]` and `GroupNode` tree from grouped data -- consumed by `PagesGroupedView`.

### DataSource Abstraction

Unified data provider interface in `@casehubio/pages-data`. Three core types: `DataSource` (`connect(sink)`/`disconnect()`), `DataSink` (`apply(event)`/`error(err)`), and `MutableDataSource` (extends `DataSource` with `dispatch(action)` for CRUD). `DataAction` union: update/create/delete.

**Fourteen source implementations** in `packages/pages-data/src/datasource/sources/`:
- `restSource` -- REST API polling with configurable refresh
- `mutableRestSource` -- REST with write endpoints (`WriteConfig` with `update`/`create`/`delete` URL templates, `refreshAfterWrite` option, custom headers)
- `sseSource` -- Server-Sent Events
- `wsSource` -- WebSocket push
- `csvSource` -- CSV file/URL parsing
- `inlineSource` -- static inline data
- `joinSource` -- join two datasets on key columns
- `postMessageSource` -- iframe `postMessage` bridge
- `serverQuerySource` -- server-side query execution
- `compositeSource` -- multi-source aggregation
- `simulated` -- with mutation operators: `transition`, `increment`, `decrement`, `addRow`, `removeRow`, `when` (conditional)
- `replaySource` -- recorded event playback
- `recordingSource` -- captures events for replay
- `push-source-wrapper` -- wraps push protocol into DataSource interface

`SourceFactory` creates sources from configuration objects. `def-to-binding` converts `ExternalDataSetDef` to `DataSourceBinding` for pipeline integration.

`ScenarioController` provides time-controllable scheduling for demo/scenario playback with play/pause/step/speed controls. Default connection pools managed via `default-pools.ts`.

### DataSource Controller

`DataSourceController` in `@casehubio/pages-component/src/controller/` bridges the DataSource abstraction with the component lifecycle. `StandaloneConnector` provides a simpler connection path for components outside the full pipeline.

### Filter Model

Per-type discriminated unions (`NumericFilter`/`StringFilter`/`DateFilter`) resolved via `resolveFilterTypes()`. Operations engine uses `F*G*S?` ordering (Filter, Group, Sort with optional Sort). `FilterConfig` on table columns with optional `group` for coordinated filter clearing.

### Expression Evaluation

`@casehubio/pages-component/src/context/` provides:
- `evaluateExpression(expression, context)` -- boolean expression engine with operators (`&&`, `||`, `!`, `==`, `!=`, `<`, `>`, `<=`, `>=`), parentheses, `#{...}` template references, string/numeric/boolean/null literals, and numeric type coercion
- `createRowContext(base, row)` -- creates a `RuntimeContext` with row data accessible via `#{row.fieldName}`
- `resolveTemplate(template, context)` -- resolves `#{...}` template references in strings

Used for conditional row styling (`RowStyleRule`), conditional rendering, and dynamic property binding.

### Component Model

`@casehubio/pages-component/src/model/` defines 30+ component types with full type guards:

**Layout containers:** `Grid`, `Columns`, `Rows`, `Stack`, `Tabs`, `Pills`, `Sidebar`, `Tree`, `Menu`, `Accordion`, `Carousel`, `Split`, `DockBar`, `HostPanel`, `Panel`, `Html`, `Markdown`, `Title`, `LazyPage`

**Data displayers:** `BarChart`, `LineChart`, `AreaChart`, `PieChart`, `ScatterChart`, `BubbleChart`, `Timeseries`, `DataTable`, `GridTable`, `Metric`, `Meter`, `Selector`, `Map`, `GroupedView`, `IframePlugin`, `Badge`, `Countdown`, `Timeline`, `Graph`

**Form inputs:** `Input`, `NumberInput`, `Select`, `Checkbox`, `DatePicker`, `Textarea`

**Actions:** `Alert`, `ActionButton` (with `SubmitConfig`, `ActionRequest`, `ActionCallbacks`)

Each type has a corresponding type guard (e.g. `isBarChart()`, `isDataTable()`), props interface, and `getProps()` accessor. `ComponentTypeRegistry` enables exhaustive type-level matching.

### Rendering Pipeline

`@casehubio/pages-component/src/renderer/`:
- `renderComponent(component, options)` -- recursively renders the component tree into DOM elements
- `activateSlot(slot, component)` -- activates a slot-swap for lazy page loading
- `wireInteractivity(element, component)` -- attaches interactive behaviours (split pane resize, drag, etc.)
- Grid layout via `grid.ts` -- CSS Grid template generation from component properties
- Layout state access via `access.ts` -- read/write panel positions for serialization
- Slot management via `slots.ts` and `slot-swap.ts` -- panel slot assignment and swapping

### Async Render Correctness

Generation counter pattern for ECharts rendering. Each render tagged with a generation counter -- render completion checks if counter matches current. If stale, result discarded. Prevents rapid dataset changes (e.g., live push) from triggering overlapping async renders where a stale render overwrites correct state.

### Cell Spanning (SpanMap)

`@casehubio/pages-table/src/span-map.ts` implements data-table cell spanning:

- `CellSpan` -- origin cell with `colSpan`/`rowSpan`
- `SuppressedCell` -- cell hidden by a spanning origin (links back to `originRow`/`originCol`)
- `SpanMap` -- `Map<rowIndex, Map<columnId, SpanEntry>>` computed from column config
- `computeSpanMap()` -- builds span map from rows, columns, and `TableColumnConfig` (which carries `cellSpan` callback and `mergeRows` flag)
- Span-aware hover, keyboard navigation, and selection
- Integrated with virtual scroll engine for variable-height rows

### Virtual Scroll Engine

`@casehubio/pages-table/src/virtual-scroll-engine.ts` -- viewport-based rendering for large datasets:
- Calculates visible row window from scroll position and container height
- Supports variable row heights (callback-based per row)
- Span-aware: adjusts visible window to include spanning cells that cross viewport boundaries
- Overscan buffer for smooth scrolling

---

## Full Module Details

### Core Packages (`packages/`)

| Package | Purpose |
|---------|---------|
| `@casehubio/pages-ui-tokens` | OKLCH 12-step design tokens -- colour scales (`generateScale()`), spacing (`SPACING_SCALE`), typography (`TYPOGRAPHY`), elevation (`ELEVATION_LIGHT`/`ELEVATION_DARK`), motion (`MOTION`), radius (`RADIUS`), density (`DENSITY_COMPACT_OVERRIDES`). Pluggable theme pipeline: `registerTheme()`, `applyTheme()`, `getTheme()`, `listThemes()`. Theme auto-registration from presets. CaseHub dark theme with blue-dominant neutrals (hue 260). `PagesThemePickerElement` compact picker with flyout popover. `pages-theme-change` CustomEvent propagation. CLI for theme generation (`cli.ts`). Build-time token generation (`build.ts`). |
| `@casehubio/pages-data` | DataSet model, operations engine (`F*G*S?` ordering), external data extraction, JSONata bridge (`compileOrCached`). Push wire protocol (`EventStream`, `EventStreamPool`, `PushSource`, `PushPool`, `EventConnection`). DataSource abstraction with 14 source implementations including `mutableRestSource` for CRUD. `DataSetManager` with pagination, staleness tracking. `ScenarioController` for demo playback. Group extraction (`GroupNode`, `GroupBoundary`). SSE manager (`SSEManager`). Topic pattern matching utilities. Conversion utilities (`fromRows`, `toTypedDataSet`, `createTypedRow`, `toWireDataSet`). Data provider factory with 6 providers (inline, CORS proxy, browser fetch, server relay, server query client, postMessage). |
| `@casehubio/pages-ui` | YAML parser (including `grouped-view` desugar with group strategies: distinct, fixedCalendar, dynamicRange, dynamic), DashBuilder backward compat layer, component model. DSL for layout specification. Authentication model. Zod-based schema validation. |
| `@casehubio/pages-viz` | Web Component chart wrappers: `PagesBarChart`, `PagesLineChart`, `PagesAreaChart`, `PagesPieChart`, `PagesScatterChart`, `PagesBubbleChart`, `PagesTimeseries`, `PagesTimeline`, `PagesMeter`, `PagesMetric`, `PagesMap`, `PagesGraph`. Non-chart displayers: `PagesGridTable` (with transpose mode for vertical key-value lists), `PagesGroupedView` (spreadsheet/sectioned/list presets with multi-level grouping, aggregation bindings, expand/collapse, row accent colouring, `renderAfterHeader` callback, `GroupNode` tree structure), `PagesSelector`, `PagesIframePlugin`, `PagesLegend`, `PagesAlert`, `PagesActionButton`, `PagesBadge`, `PagesCountdown`. Form inputs: `PagesSchemaForm` (schema-driven form with `deriveSchemaFromDataSet()`, field validation, `validateOnBlur`, display/edit modes), `PagesFormInput`, `PagesNumberInput`, `PagesDatePicker`. ECharts option pipeline (`option-pipeline.ts`). All charts use generation-counter async render correctness. |
| `@casehubio/pages-component` | CSS grid layout renderer, interactive containers, panel hosting. Component model with 30+ types and exhaustive type guards. Hosting contracts: `ConfigurablePanel` and `DataReceiver` interfaces. `DataSourceController` + `StandaloneConnector`. Expression evaluation (`evaluateExpression`, `createRowContext`, `resolveTemplate`). Layout state management (`LayoutState`, `PanelEntry`, `GridPlacement`). Access control (`AccessControl`, `PermissionContext`, `ALLOW_ALL`). Rendering pipeline (`renderComponent`, `activateSlot`, `wireInteractivity`). Grid/interactive-split/slot-swap rendering. `RowStyleRule` for conditional row styling. `GroupedViewProps` with three presets, aggregation bindings, `GroupNode`. Table column config: `TableColumnConfig`, `ColumnAlign`, `SelectionMode`, `ColumnRenderer`, `ExpandableConfig`, `RowAccentConfig`. |
| `@casehubio/pages-primitives` | Accessibility mixins: `FocusTrapMixin` (slot-aware focus trap), `RovingTabindexMixin` (2D keyboard navigation with configurable `RovingDirection`), `KeyboardShortcutMixin`, `LiveRegionMixin`. `PagesModal` dialog component. All depend on `lit`. Guard against duplicate `customElements.define()`. |
| `@casehubio/pages-table` | Data table (`<pages-table>`) -- three display modes (`auto`/`paginated`/`scroll`), virtual scroll engine (variable row heights, span-aware), CSS Grid rendering, `TableColumnConfig`/`ColumnRenderer` data model. Cell spanning via `SpanMap` (`cellSpan`/`mergeRows`, span-aware hover/keyboard/selection). Column resizing (`ColumnResizeDetail`). Multi-mode selection (`SelectionMode`, `SelectionChangeDetail` with page scope). Sorting: multi-column sort stack (`SortEntry[]`, `SortChangeDetail`). Client-side filtering (`FilterConfig` with group coordination, `FilterChangeDetail`). Row-detail expansion (`getRowDetail`, `DetailMode: single/multi`, `DetailChangeDetail`). Jump-to-page. Tree/hierarchical data (`getChildren`, `buildTreeIndex`, hierarchy-preserving client filter). CSV export. Conditional row accent (`RowAccentConfig` with column-based colour map, per-column targeting). Auto-hiding pagination. Row activation events (`RowActivateDetail`). Page size change events (`PageSizeChangeDetail`). Load-more infinite scroll (`LoadMoreDetail`). 2D keyboard navigation via `RovingTabindexMixin`. ARIA grid. Depends on `lit`. |
| `@casehubio/pages-runtime` | Site orchestrator: `loadSite()` API returning `LiveSite`. Navigation: `buildPageIndex()`, `computeCurrentPage()`, `buildPagePathMap()`. Data pipeline: `createDataPipeline()` returning `DataPipeline`. Cross-filter: `createFilterState()`, `getActiveFilterOps()`, `clearPageFilters()`. Component view state: `createComponentViewState()`, `updateSort()`, `updatePage()`, `getComponentState()`. Dataset scope: `buildDataSetScope()`, `resolveDataSetDef()`, `resolveDataSetEntry()`, `isBinding()`, `isDef()`. Layout serialization: `LayoutStore` SPI, `createLocalLayoutStore()`, `createRestLayoutStore()`. Panel registry: `registerPanel()`. Component registry: `ComponentRegistry`, `ComponentEntry`. Activation callback factory. URL state: `serializeToUrl()`, `parseFromUrl()`. Dev auth: `createDevAuthTokenFn()`. |
| `@casehubio/pages-ui-components` | Standalone Lit web components: `PagesInput` (`<pages-input>`), `PagesSelect` (`<pages-select>`), `PagesTextarea` (`<pages-textarea>`), `PagesCheckbox` (`<pages-checkbox>`), `PagesButton` (`<pages-button>`, xs/sm/md sizes), `PagesBadge` (`<pages-badge>`, semantic status pill/tag), `PagesStatusDot` (`<pages-status-dot>`, coloured indicator). Each component exported both from barrel and individual import path (`@casehubio/pages-ui-components/input`, etc.). `SelectOption` type for dropdown options. Styled with design tokens from `pages-ui-tokens`. Side-effectful imports (custom element registration). esbuild bundle available. |
| `@casehubio/pages-tsconfig` | Shared TypeScript config base (project references, maximum strict mode: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`). |
| `@casehubio/pages-webpack-base` | Shared Webpack config presets for iframe component bundling. |

### Graph Packages (`packages/`) -- Visual Diagram Editor

| Package | Purpose |
|---------|---------|
| `@casehubio/graph-core` | Domain-agnostic graph model: `GraphNode` (id, type, label, parentId for containment, properties, position), `GraphEdge` (id, type, source, target, label, properties), `GraphModel` (nodes + edges). Stencil grammar: `StencilGrammar` (type, label, icon, containment rules with `canContain`/`canBeContainedBy`, connection rules with min/max cardinality and allowed types). `StencilDescriptor` (grammar + JSON Schema properties). `StencilRegistry` (register, get, getAll, validate). `ValidationResult` (nodeId/edgeId, rule, message, severity error/warning). Edit operations: `GraphEdit` discriminated union (add-node, remove-node, replace-node, update-properties, add-edge, remove-edge). `DomainAdapter<T>` for bidirectional model/edit translation. `PersistenceBackend` SPI: `read(uri)` returning `PersistenceResult` (ok/not_found/parse_error/conflict), `write(uri, content, expectedVersion)` with optimistic concurrency. Runtime overlay: `NodeDecoration` (badge with icon/colour/pulse, heatmap intensity 0-1, highlight boolean), `RuntimeState`. |
| `@casehubio/graph-renderer` | React Flow bridge via Lit web component: `CasehubDiagramCanvas` (`<casehub-diagram-canvas>`). Properties: `model: GraphModel`, `runtime: RuntimeState`. Light DOM rendering (skips Shadow DOM for React Flow compatibility). Depends on `@casehubio/graph-core`, React Flow 11, ELK.js, Lit 3. Currently a shell -- ELK layout integration, custom node rendering pipeline, interaction layer, and toolbar are tracked in issues #271-#276. |
| `@casehubio/graph-work-registry` | Marketplace work stencil discovery: `WorkStencilDescriptor` (name, displayName, category, icon, async flag, properties/input/output as JSON Schema). `WorkStencilCategory` for grouped display. `WorkRegistry` class: `loadFromUrl(url)` (YAML-based, not yet implemented), `get(name)`, `getCategories()`. Depends on `@casehubio/graph-core`, `yaml`. |

### Iframe Component API (`packages/`)

| Package | Purpose |
|---------|---------|
| `@casehubio/pages-iframe-api` | Component controller for iframe-isolated React components. `postMessage`-based protocol for configuration, data delivery, and lifecycle events. React 17. Jest test suite. |
| `@casehubio/pages-iframe-dev` | Development utilities for iframe component testing. |

### Standalone Components (`components/`)

| Package | Purpose |
|---------|---------|
| `@casehubio/pages-component-llm-prompter` | LLM prompt engineering UI (iframe-isolated React). Ollama request/response integration. |
| `@casehubio/pages-component-svg-heatmap` | SVG-based heatmaps (iframe-isolated React). |
| `@casehubio/pages-component-terminal` | Terminal emulator (`PagesTerminal`, Lit-based, non-iframe). |

### Assembly

| Package/Module | Purpose |
|----------------|---------|
| `@casehubio/pages-webapp` | Webpack orchestrator -- assembles final application bundle. Also Maven module for SNAPSHOT publishing. |
| `@casehubio/pages-examples` | Interactive dashboard examples gallery with fixture data, mock data, and sample dashboards. Playwright visual test suite (`tests/`, `playwright.config.ts`). `samples.json` index for gallery navigation. |
| `casehub-pages-ui-static` | Maven module (`static-assets/pom.xml`): runs `assembly.sh` at `generate-resources` phase to package pre-built static assets (theme CSS, component ESM) into `META-INF/resources/pages/` for non-bundled consumers. `validate-bundle.mjs` verifies bundle integrity. |
| `casehub-pages-npm` | Maven module (`npm-packages/pom.xml`): runs `pack-all.sh` at `generate-resources` phase to pack all `@casehubio/pages-*` npm packages into a SNAPSHOT JAR for cross-repo Maven consumption. Published to GitHub Maven Packages. |
| `templates/quinoa-host` | Starter template: esbuild config, `@casehubio/pages-runtime` + `@casehubio/pages-ui` via `file:` references. |

### Backend (Java) (`backend/`)

| Module | Purpose |
|--------|---------|
| `casehub-pages-push` | Typed wire protocol SDK: `PushMessage` (server->client builders with event sequence numbers), `PushRequest` (sealed client->server parser with ack/error correlation), `TopicRegistry` (wildcard-aware segment-trie connection tracking: literal `cases.123.events`, single-segment `cases.*.events`, multi-segment `cases.#`), `EventStore` SPI + `InMemoryEventStore` (bounded per-topic event replay buffer, configurable capacity, default 100 events), `EventBroadcaster` (store + fan-out to subscribed sessions via `SessionSender`, validates no wildcards in broadcast topics, supports raw JSON string and typed object broadcast via `JsonWriter` SPI), `SessionSender` SPI, `JsonWriter` SPI, `StoredEvent`, `PushColumn`. jackson-core only, no Quarkus dependency. |
| `casehub-pages-push-runtime` | Quarkus CDI producers: `PushProducers` -- `@ApplicationScoped` producers for `TopicRegistry`, `EventStore` (`@DefaultBean` InMemoryEventStore, configurable `casehub.pages.push.max-events-per-topic`, default 1000), `JsonWriter` (`@DefaultBean` Jackson ObjectMapper), `EventBroadcaster`. Drop-in for any Quarkus app needing server-push. |
| `casehub-pages-auth` | Development authentication: `DevAuthResource` (JAX-RS REST endpoint), `LoginRequest` (credentials DTO), `TokenResponse` (token DTO). Token handling for backend data providers. |
| `casehub-pages-data` | Backend data provider adapters (SQL, relay proxy). |
| `casehub-pages-data-sql` | SQL-based data provider with frontend push-down integration (query translation from frontend filter/sort/group operations to SQL). |
| `casehub-pages-layout` | Layout persistence SPI: `LayoutPersistenceStore` (interface), `LayoutResource` (JAX-RS REST endpoint for CRUD), `NoOpLayoutPersistenceStore` (default no-op implementation). |
| `casehub-pages-layout-sqlite` | SQLite-based layout store implementation. Uses HikariCP connection pool and sqlite-jdbc driver. |

---

## Push Wire Protocol (Server Internals)

### Server->Client Messages (`PushMessage`)

Fluent builders in Java for typed message construction:

| Builder | Purpose |
|---------|---------|
| `PushMessage.dataUpdate(topic, payload)` | Deliver fresh data for a topic. |
| `PushMessage.listenAck(topic, requestId)` | Acknowledge listen request. |
| `PushMessage.error(requestId, message)` | Signal error for a request. |
| `PushMessage.keepAlive()` | Heartbeat to prevent connection timeout. |

### Client->Server Messages (`PushRequest`)

| Request Type | Purpose |
|--------------|---------|
| `LISTEN` | Subscribe to a topic (supports wildcards). |
| `UNLISTEN` | Unsubscribe from a topic. |

**Correlation:** client includes `requestId` in LISTEN/UNLISTEN -- server echoes in `listenAck()` or `error()` response.

### Topic Routing

`TopicRegistry` (Java) -- segment trie for wildcard-aware connection tracking.

- `cases.123.events` -- literal match
- `cases.*.events` -- single-segment wildcard
- `cases.#` -- multi-segment wildcard (all descendants)

### EventStore SPI

`EventStore` SPI (Java) + `InMemoryEventStore` -- bounded per-topic event replay buffer. New subscriptions receive the last N events immediately upon LISTEN. Capacity configurable per-topic, defaults to 100 events (push-runtime default: 1000).

### EventBroadcaster

Store-and-forward push broadcaster. `broadcast(topic, payload)` appends to `EventStore` (for replay on reconnect), then fans out to all sessions via `TopicRegistry.connections()`. Validates no wildcards in broadcast topics. Supports both raw JSON string and typed object broadcast (serialized via `JsonWriter` SPI).

**CDI integration:** `casehub-pages-push-runtime` provides `PushProducers` -- `@ApplicationScoped` CDI producers for `TopicRegistry`, `EventStore` (configurable `casehub.pages.push.max-events-per-topic`, default 1000), `JsonWriter`, and `EventBroadcaster`.

---

## OKLCH Token System

Design token system based on OKLCH colour space (perceptually uniform, wide-gamut). 12-step scales for all hue families via `generateScale()`. All colours reference design tokens -- `--pages-primary-9`, `--pages-accent-5`, etc.

Theme management:
- `registerTheme(name, css)` -- register a named theme's CSS variables
- `applyTheme(name, target?)` -- inject theme CSS, set background/color, dispatch `pages-theme-change` event
- `getTheme(target?)` -- query active theme name
- `listThemes()` -- list all registered theme names
- `PagesThemePickerElement` -- compact picker web component with flyout popover

CaseHub dark preset: blue-dominant neutrals (hue 260), blue-to-teal gradient with neon mids. Semantic role tokens (`--pages-surface-primary`, `--pages-surface-secondary`, `--pages-surface-hover`, etc.) mapped from scale steps.

Token categories: colour scales, spacing (`SPACING_SCALE`), typography (`TYPOGRAPHY`), motion (`MOTION`), radius (`RADIUS`), elevation (`ELEVATION_LIGHT`/`ELEVATION_DARK`), density (`DENSITY_COMPACT_OVERRIDES`).

Theme pipeline architecture (`pipeline.ts`): transforms and presets composed into a processing chain. Preset loader discovers and registers themes at startup.

---

## TypeScript Strict Mode Enforcement

All packages share `@casehubio/pages-tsconfig` with maximum strictness: `strict`, `noUncheckedIndexedAccess` (array/map access yields `T | undefined`), `exactOptionalPropertyTypes` (no implicit `undefined` union), `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`. Applied consistently across all packages via project references.

---

## Build System

### Monorepo Structure

Yarn 4.10.3 workspaces with four workspace roots:
```json
"workspaces": ["packages/*", "components/*", "webapp/", "examples/"]
```

### Build Order

Strict build order for packages (from `build:packages` script):
1. `pages-ui-tokens` (must be first -- tokens consumed by all downstream)
2. `pages-ui-components` (standalone Lit components, consumed by pages-viz)
3. `pages-data`
4. `pages-primitives`
5. `pages-iframe-api`
6. `pages-iframe-dev`
7. `pages-component`
8. `pages-ui`
9. `pages-viz`
10. `pages-table`
11. `pages-runtime`

Then components (`pages-component-*`) in parallel, then webapp, then examples.

Graph packages (`graph-core`, `graph-renderer`, `graph-work-registry`) are not yet in the default build chain.

### Cross-Repo Dependency Distribution (ADR-0001)

Three consumption tiers:

| Boundary | Mechanism | Rationale |
|----------|-----------|-----------|
| Within monorepo | Yarn `workspace:*` | Instant linking, hot reload |
| Cross-repo (CaseHub apps) | Maven SNAPSHOT (`casehub-pages-npm` JAR) | Same mechanism local/CI, no version ceremony |
| External consumers | Published npm packages | Standard registry |

Local cross-repo workflow: `yarn build && mvn -f npm-packages/pom.xml install` in pages, then `mvn quarkus:dev` in consumer app.

### Testing

- **Vitest** -- most packages (pages-data, pages-component, pages-ui, pages-viz, pages-table, pages-ui-tokens, pages-ui-components, graph-core, graph-renderer, graph-work-registry)
- **Jest 29** -- iframe API packages (pages-iframe-api, pages-iframe-dev)
- **Playwright** -- visual/E2E tests in examples gallery

Run all tests: `yarn test` (workspace-wide)

### Linting

ESLint 10 with `typescript-eslint` 8 at the root. Strict type-checked rules.

---

## Depended On By

All CaseHub web applications:
- **casehub-platform** -- main application (case management UI)
- **casehub-devtown** -- agent development dashboard
- **casehub-clinical** -- clinical trials dashboard
- **casehub-aml** -- AML investigation dashboard
- **casehub-fsitrading** -- trading surveillance dashboard
- **casehub-drafthouse** -- legal document drafting UI
- **casehub-life** -- life insurance underwriting dashboard
- **casehub-openclaw** -- legal case management
- **casehub-claudony** -- AI assistant integration
- **casehub-iot** -- IoT monitoring dashboard

**Integration path:** Each app includes `casehub-pages-*` Java modules in its POM, Quinoa extension for bundling, and a `src/main/webui/` workspace with TypeScript sources. Maven `initialize` phase unpacks the `casehub-pages-npm` SNAPSHOT JAR to `.casehub-packages/`.

**Component reuse:** Apps import `@casehubio/blocks-ui-*` components and host them via `registerPanel()` + `hostPanel()` in their YAML dashboards.

**blocks-ui dependency:** `casehub-blocks-ui` depends on `@casehubio/pages-primitives` (a11y mixins), `@casehubio/pages-table` (data table component), and `@casehubio/pages-ui-components` (standalone form inputs).

---

## Current State

**Maturity:** Production-ready. Used by 10+ CaseHub applications.

**Active development areas:**
- Graph editor foundation -- `graph-core`, `graph-renderer`, `graph-work-registry` bootstrapped (Phase 0-1, epic #258)
- pages-table maturation -- cell spanning (#210-#218), variable row heights, column resizing, auto-hiding pagination
- Pluggable theme system -- pipeline architecture, CaseHub presets, theme picker (#230)
- Standalone UI components -- `pages-ui-components` with badge, status-dot, button sizes (#233, #251-#254)
- Push runtime CDI integration -- EventBroadcaster as drop-in for Quarkus apps
- Schema-driven forms -- validation, validateOnBlur, metadata (#205-#208, #224)
- Maven SNAPSHOT cross-repo distribution (#246, ADR-0001)
- Static assets for non-bundled consumers (#247)
- Data pipeline -- mutableRestSource write path (#144), datasource pipeline integration

**Known limitations:**
- SSE push does not support client->server ack (WebSocket only)
- Layout serialization requires explicit `LayoutStore` configuration (no auto-discovery)
- Iframe components cannot access parent window DOM (security isolation)
- No durable `EventStore` -- only `InMemoryEventStore` shipped (JDBC/Redis planned: #113/#256)
- Graph packages are Phase 0-1 shells -- rendering, layout, interaction not yet implemented (#264-#276)

---

## Recent Evolution

### Graph Editor Foundation (Phase 0-1)

Three new packages bootstrapped under epic #258: `@casehubio/graph-core` (model, grammar, validation, persistence SPI, runtime overlay, domain adapter), `@casehubio/graph-renderer` (React Flow Lit bridge), `@casehubio/graph-work-registry` (marketplace stencil discovery). Phase 0 spikes (#259, #260) validated React Flow + Lit bridge and YAML/Jackson parser compatibility. Phase 1A (#264, #266-#270) covers graph-core completion; Phase 1B (#265, #271-#276) covers graph-renderer full pipeline.

### Data Table Cell Spanning (#210-#218)

`SpanMap` module for cell spanning: `cellSpan` callback on `TableColumnConfig` for explicit spans, `mergeRows` flag for automatic adjacent-cell merging. Single CSS Grid rendering model. Span-aware virtual scroll, hover, keyboard, selection. Playwright visual tests. YAML pipeline integration via `mergeRows`.

### Pluggable Theme System (#230)

Pipeline architecture for `pages-ui-tokens`: `registerTheme()` / `applyTheme()` / `listThemes()` / `getTheme()`. CaseHub dark preset with OKLCH blue-dominant neutrals. Semantic role tokens. Theme auto-propagation via `pages-theme-change` event. `PagesThemePickerElement` compact picker. Theme changes propagated to loaded sites.

### pages-ui-components (#233, #251-#254)

New package: standalone Lit web components styled with design tokens. `PagesInput`, `PagesSelect`, `PagesTextarea`, `PagesCheckbox`, `PagesButton` (xs/sm/md), `PagesBadge`, `PagesStatusDot`. Replaces form inputs previously embedded in `pages-viz`. Consumed by `PagesSchemaForm` and available for direct use.

### Maven SNAPSHOT Cross-Repo Distribution (ADR-0001, #246)

Replaced `file:` references with Maven SNAPSHOT JARs for cross-repo consumption. `casehub-pages-npm` Maven module packages all npm packages. `casehub-pages-ui-static` packages pre-built assets for non-bundled consumers (#247). Same mechanism for local dev and CI.

### Variable Row Heights and Column Resizing

`PagesDataTable` supports callback-based variable row heights in both virtual-scroll and paginated modes. Column resizing with `ColumnResizeDetail` events.

### Schema-Driven Forms (#205-#208, #224, #233)

`PagesSchemaForm` in `pages-viz`: derives schema from `TypedDataSet`, maps fields to components, validates with `FieldSchema` constraints (pattern, min/max, required), `validateOnBlur` mode, display/edit toggle, title/description/placeholder metadata.

### melviz -> casehub-pages Rename

Forked from melviz (itself a fork of dashbuilder). Completed migration to 100% TypeScript. All GWT code removed (`_legacy/` reference only, not built). Package namespace: `@melviz/*` -> `@casehubio/pages-*`. Java group: `org.melviz` -> `io.casehub`.

---

## Design Documents

### ADRs (`docs/adr/`)

- `0001-cross-repo-frontend-dependency-management.md` -- Maven SNAPSHOT over file: references and npm registry

### Specs (`docs/specs/`)

Key design specs:
- `2026-07-23-pages-pluggable-theme-system-design.md` -- theme pipeline architecture
- `2026-07-23-pages-ui-components-design.md` -- standalone Lit form components
- `2026-07-19-data-table-cell-spanning-design.md` -- SpanMap and single-grid model
- `2026-07-07-datasource-abstraction-design.md` -- DataSource/DataSink/MutableDataSource
- `2026-07-08-push-runtime-cdi-design.md` -- EventBroadcaster CDI producers
- `2026-07-08-grouped-view-design.md` -- GroupedView presets and data model
- `2026-07-06-configurable-panel-dataset-bridge-design.md` -- ConfigurablePanel/DataReceiver
- `2026-07-06-oklch-token-alignment-design.md` -- OKLCH token system
- `2026-07-06-trie-topic-registry-design.md` -- segment-trie TopicRegistry

### Protocols (`docs/protocols/`)

Protocol documents in `docs/protocols/casehub/`:
- `css-design-tokens.md` -- `--pages-` prefix, OKLCH 12-step scales, eleven categories
- `pages-event-contract.md` -- single `pages-event` CustomEvent with topic/payload
- `web-component-strategy.md` -- Lit for interactive UI, vanilla for simple display
- `dataset-contract.md` -- `DatasetContract` with name, description, shape
- `iframe-message-format.md` -- `ComponentMessage` envelope with plain-object properties
- `iframe-component-lifecycle.md` -- INIT -> DATASET lifecycle with config error signalling
- `maven-only-build-scripts.md` -- Maven-only build outputs use separate scripts
- `version-alignment-with-parent.md` -- version alignment with casehub-parent

For cross-repo conventions (build order, version alignment, Quinoa integration), see the garden protocols in the parent repo.
