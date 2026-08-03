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
2. Calls `renderLayout()` from `@casehubio/pages-component` -- creates CSS grid layout
3. For each panel, calls `createDataPipeline()` -- wires dataset resolution, operations, and delivery via `DataReceiver`
4. Components emit `pages-event` on user interaction (filter, sort) -- pipeline re-evaluates -- fresh data delivered

### pages-event System

Custom event protocol for cross-component communication. Emitted by `emitPagesEvent(target, detail)`, observed via `onPagesEvent(target, handler)`.

**Event types:**
- `pages-filter` -- filter change from a chart drill-down or filter widget
- `pages-sort` -- sort change from a table header click
- `pages-navigation` -- page navigation request

Events propagate through the data pipeline -- `DataPipeline.createDataPipeline()` wires pipeline refresh on filter/sort events.

### DataSet Model

Core data model from `@casehubio/pages-data`. Columnar representation with typed operations.

| Type | Purpose |
|------|---------|
| `DataSet` | Immutable dataset with columns and rows. |
| `Column` | Column metadata: `id`, `name`, `type` (TEXT, NUMBER, DATE, LABEL). |
| `DataSetOp` | Operations: filter, sort, group, select. |
| `applyOps(dataset, ops[])` | Apply operation pipeline to a dataset. |

**External data:** `resolveExternalDataSet()` fetches data from external sources (CSV, JSON, metrics endpoints). Supports JSONata transformation via `extractDataSet()`.

**TypedDataSet pipeline:** Fully typed throughout -- `TypedDataSet`, `TypedRow`, `Column` with `ColumnType`, `ColumnId`. Filter expressions carry resolved types from column metadata. Sort operations use `SortColumn` with column reference. The pipeline operates on typed data end-to-end rather than converting at boundaries.

**DataSetManager:** Typed dataset management with `get`, `remove`, `has`, `apply` (event-driven updates), `lookup` (with pagination via `rowOffset`/`rowCount`), and `age` (staleness tracking). Lookup resolves filter types against column metadata before applying ops. `DataSetEvent` provides the typed event system for dataset mutations.

### DataSource Abstraction

Unified data provider interface in `@casehubio/pages-data`. Three core types: `DataSource` (`connect(sink)`/`disconnect()`), `DataSink` (`apply(event)`/`error(err)`), and `MutableDataSource` (extends `DataSource` with `dispatch(action)` for CRUD). `DataAction` union: update/create/delete.

Twelve source implementations: `restSource`, `sseSource`, `wsSource`, `csvSource`, `inlineSource`, `joinSource`, `postMessageSource`, `serverQuerySource`, `composite` (multi-source), `simulated` (with mutation operators: transition/increment/decrement/addRow/removeRow/when), `replay` (recorded event playback), `recording` (captures events for replay).

`SourceFactory` creates sources from configuration. `ScenarioController` provides time-controllable scheduling for demo/scenario playback with play/pause/step/speed controls.

### Filter Model

Per-type discriminated unions (`NumericFilter`/`StringFilter`/`DateFilter`) resolved via `resolveFilterTypes()`. Operations engine uses `F*G*S?` ordering (Filter, Group, Sort with optional Sort).

### Async Render Correctness

Generation counter pattern for ECharts rendering. Each render tagged with a generation counter -- render completion checks if counter matches current. If stale, result discarded. Prevents rapid dataset changes (e.g., live push) from triggering overlapping async renders where a stale render overwrites correct state.

---

## Full Module Details

### Core Packages (`packages/`)

| Package | Purpose |
|---------|---------|
| `@casehubio/pages-ui-tokens` | OKLCH 12-step design tokens -- colour scales, spacing, typography, elevation, motion, radius. Theme generation and injection. Must build before `pages-viz`. |
| `@casehubio/pages-data` | DataSet model, operations engine, external data extraction, JSONata. Push wire protocol. DataSource abstraction with 12 source implementations. `DataSetManager`, `ScenarioController`. |
| `@casehubio/pages-ui` | YAML parser (including `grouped-view` desugar with group strategies: distinct, fixedCalendar, dynamicRange, dynamic), DashBuilder backward compat layer, component model. |
| `@casehubio/pages-viz` | Web Component chart/table/metric wrappers (ECharts integration). |
| `@casehubio/pages-component` | CSS grid layout renderer, interactive containers, panel hosting. `ConfigurablePanel` and `DataReceiver` interfaces, `DataSourceController`, expression evaluation (`evaluateExpression`, `createRowContext`), `RowStyleRule` for conditional row styling. `GroupedViewProps` for grouped data display with three presets (spreadsheet, sectioned, list), multi-level grouping, aggregation bindings, `GroupNode` tree structure. |
| `@casehubio/pages-primitives` | Accessibility mixins: `FocusTrapMixin` (slot-aware focus trap), `RovingTabindexMixin` (2D keyboard navigation with configurable direction), `KeyboardShortcutMixin`, `LiveRegionMixin`, `<pages-modal>` (dialog component). Depends on `lit`. |
| `@casehubio/pages-table` | Data table (`<pages-table>`) -- three display modes (auto/paginated/scroll), virtual scroll engine, CSS Grid rendering, `TableColumnConfig`/`ColumnRenderer` data model, multi-mode selection, row-detail expansion (`getRowDetail`, `detailMode: single/multi`), jump-to-page, tree/hierarchical data (`getChildren`, `buildTreeIndex`), CSV export, conditional row accent (`getRowAccent`), 2D keyboard navigation via `RovingTabindexMixin`. Depends on `lit`. |
| `@casehubio/pages-runtime` | Site orchestrator: `loadSite()` API, navigation, data pipeline, layout serialization (`LayoutStore`, `createLocalLayoutStore`). |
| `@casehubio/pages-tsconfig` | Shared TypeScript config base (project references, maximum strict mode: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`). |
| `@casehubio/pages-webpack-base` | Shared Webpack config presets. |

### Iframe Component API (`packages/`)

| Package | Purpose |
|---------|---------|
| `@casehubio/pages-iframe-api` | Component controller for iframe-isolated components. `postMessage`-based protocol for configuration, data delivery, and lifecycle events. |
| `@casehubio/pages-iframe-dev` | Development utilities for component testing. |
| `@casehubio/pages-echarts-base` | Reusable ECharts wrapper library for iframe components. |

### Standalone Components (`components/`)

| Package | Purpose |
|---------|---------|
| `@casehubio/pages-component-echarts` | Apache ECharts visualizations (iframe-isolated). |
| `@casehubio/pages-component-llm-prompter` | LLM prompt engineering UI (iframe-isolated). |
| `@casehubio/pages-component-svg-heatmap` | SVG-based heatmaps (iframe-isolated). |
| `@casehubio/pages-component-terminal` | Terminal emulator component (iframe-isolated). |

### Backend (Java) (`backend/`)

| Module | Purpose |
|--------|---------|
| `casehub-pages-push` | Typed wire protocol SDK: `PushMessage` (server->client builders with event sequence numbers), `PushRequest` (sealed client->server parser with ack/error correlation), `TopicRegistry` (wildcard-aware connection tracking), `EventStore` SPI + `InMemoryEventStore` (bounded per-topic event replay), `EventBroadcaster` (store + fan-out to subscribed sessions via `SessionSender`), `SessionSender` SPI, `JsonWriter` SPI, `StoredEvent`, `PushColumn`. jackson-core only, no Quarkus. |
| `casehub-pages-push-runtime` | Quarkus CDI producers: `PushProducers` creates `TopicRegistry`, `EventStore` (@DefaultBean InMemoryEventStore, configurable `max-events-per-topic`), `JsonWriter` (@DefaultBean Jackson ObjectMapper), `EventBroadcaster`. Drop-in for any Quarkus app needing server-push. |
| `casehub-pages-auth` | Authentication token handling for backend data providers. |
| `casehub-pages-data` | Backend data provider adapters (SQL, relay proxy). |
| `casehub-pages-data-sql` | SQL-based data provider with frontend push-down integration. |
| `casehub-pages-layout` | Layout persistence SPI. |
| `casehub-pages-layout-sqlite` | SQLite-based layout store. |

### Assembly

| Package | Purpose |
|---------|---------|
| `@casehubio/pages-webapp` | Webpack orchestrator -- assembles final application bundle. |
| `@casehubio/pages-examples` | Interactive dashboard examples gallery (port 8080). |

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

Design token system based on OKLCH colour space (perceptually uniform, wide-gamut). 12-step scales for all hue families. All colours reference design tokens -- `--color-primary-9`, `--color-accent-5`, etc. Theme switching via `applyTheme(LIGHT_THEME)` or `applyTheme(DARK_THEME)`.

`@casehubio/pages-ui-tokens` exports token generation utilities. `@casehubio/pages-viz` consumes tokens for chart theming.

---

## TypeScript Strict Mode Enforcement

All packages share `@casehubio/pages-tsconfig` with maximum strictness: `strict`, `noUncheckedIndexedAccess` (array/map access yields `T | undefined`), `exactOptionalPropertyTypes` (no implicit `undefined` union), `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`. Applied consistently across all packages via project references.

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

**Integration path:** Each app includes `casehub-pages-*` Java modules in its POM, Quinoa extension for bundling, and a `src/main/webui/` workspace with TypeScript sources.

**Component reuse:** Apps import `@casehubio/blocks-ui-*` components and host them via `registerPanel()` + `hostPanel()` in their YAML dashboards.

**blocks-ui dependency:** `casehub-blocks-ui` depends on `@casehubio/pages-primitives` (a11y mixins) and `@casehubio/pages-table` (data table component).

---

## Current State

**Maturity:** Production-ready. Used by 8 CaseHub applications.

**Active development areas:**
- pages-table maturation (row-detail expansion, tree data, CSV export)
- Push runtime CDI integration (EventBroadcaster as drop-in for Quarkus apps)
- pages-primitives a11y infrastructure (focus trap, roving tabindex consumed by pages-table and blocks-ui)
- Data pipeline type safety (TypedDataSet, filter model, dataset manager)
- ECharts component expansion (new chart types)
- Layout persistence (REST API backend)

**Known limitations:**
- SSE push does not support client->server ack (WebSocket only)
- Layout serialization requires explicit `LayoutStore` configuration (no auto-discovery)
- Iframe components cannot access parent window DOM (security isolation)

---

## Recent Evolution

### melviz -> casehub-pages Rename

Forked from melviz (itself a fork of dashbuilder). Completed migration to 100% TypeScript. All GWT code removed (`_legacy/` reference only, not built). Package namespace: `@melviz/*` -> `@casehubio/pages-*`. Java group: `org.melviz` -> `io.casehub`.

### pages-primitives -- Accessibility Mixins and Modal

Re-created with a narrower scope: pure a11y infrastructure rather than domain-aware UI components (those remain in blocks-ui).

### pages-table -- Data Table Migration

Migrated from `blocks-ui` `data-table` component. Now a pages-tier package, consumed by both blocks-ui components and application dashboards directly.

### ConfigurablePanel + DataReceiver Interfaces

Formalize the hosting contract for iframe and non-iframe components. Enables static type checking for component registration. Runtime validates interface conformance via `instanceof` before attaching to the pipeline.

### Push Runtime Module

`casehub-pages-push-runtime` -- Quarkus CDI producers for the push infrastructure. Drop-in dependency for any Quarkus app needing server-push with zero boilerplate.

### PagesGroupedView

`GroupedViewProps` with three presets (spreadsheet, sectioned, list), multi-level grouping, aggregation, expand/collapse, row accent colouring, and `renderAfterHeader` callback. `GroupNode` type consumed by `blocks-ui`'s `<grouped-data-view>`.

---

## Design Documents

Protocol documents live in `docs/protocols/`:
- `css-tokens.md` -- OKLCH token system
- `event-contract.md` -- pages-event protocol
- `web-component-strategy.md` -- component registration and hosting
- `dataset-contract.md` -- DataSet model and operations
- `iframe-component-api.md` -- iframe message format and lifecycle

For cross-repo conventions (build order, version alignment, Quinoa integration), see the garden protocols in the parent repo.
