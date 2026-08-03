# casehub-pages -- Consumer Guide

> Web component framework for composable data dashboards -- YAML-declarable layouts, CSS grid rendering, JSONata data pipelines, ECharts visualizations, pluggable theming, schema-driven forms, and iframe-isolated React components.

**GitHub:** [casehubio/casehub-pages](https://github.com/casehubio/casehub-pages)
**Tier:** Foundation -- UI Infrastructure

---

## Purpose

UI foundation for CaseHub applications. Enables non-developers to author interactive dashboards without writing code via YAML-declared layouts rendered as CSS grids. Replaces GWT-based dashbuilder/melviz with a 100% TypeScript stack. Integrates with Quarkus via Quinoa for zero-config bundling and hot reload during development.

---

## Module Structure

### Core Packages (`packages/`)

| Package | Purpose |
|---------|---------|
| `@casehubio/pages-ui-tokens` | OKLCH 12-step design tokens -- colour scales, spacing, typography, elevation, motion, radius. Pluggable theme pipeline: `registerTheme()`, `applyTheme()`, `listThemes()`, `getTheme()`. CaseHub preset themes (light + dark). `PagesThemePickerElement` web component for theme switching. `pages-theme-change` CustomEvent on theme application. Must build before `pages-viz`. |
| `@casehubio/pages-data` | DataSet model (`TypedDataSet`, `TypedRow`, `Column`, `ColumnType`), operations engine (`FilterOp`/`GroupOp`/`SortOp` with `F*G*S?` ordering), external data extraction, JSONata. Push wire protocol (`EventStream`, `EventStreamPool`). DataSource abstraction (REST, SSE, WebSocket, CSV, inline, simulated, composite, replay, recording, join, post-message, server-query, mutable-REST). `DataSetManager` (CRUD via `DataSetEvent`, typed lookups with pagination). `GroupNode` and `GroupBoundary` extraction. |
| `@casehubio/pages-ui` | YAML parser (including `grouped-view` desugar with group strategies: distinct, fixedCalendar, dynamicRange, dynamic), DashBuilder backward compat layer, component model. Zod-based schema validation. |
| `@casehubio/pages-viz` | Web Component chart/table/metric wrappers: `PagesBarChart`, `PagesLineChart`, `PagesAreaChart`, `PagesPieChart`, `PagesScatterChart`, `PagesBubbleChart`, `PagesTimeseries`, `PagesTimeline`, `PagesMeter`, `PagesMetric`, `PagesMap`, `PagesGraph`. Non-chart displayers: `PagesGridTable` (transpose mode), `PagesGroupedView` (spreadsheet/sectioned/list presets), `PagesSelector`, `PagesIframePlugin`, `PagesLegend`, `PagesAlert`, `PagesActionButton`, `PagesBadge`, `PagesCountdown`. Form inputs: `PagesSchemaForm` (schema-driven, with validation), `PagesFormInput`, `PagesNumberInput`, `PagesDatePicker`. All built on ECharts 5 and Lit 3. |
| `@casehubio/pages-component` | CSS grid layout renderer, interactive containers, panel hosting. Component model with 30+ component types and type guards. Exports `ConfigurablePanel` and `DataReceiver` interfaces, `DataSourceController`, expression evaluation (`evaluateExpression`, `createRowContext`), template parsing. `LayoutState`/`PanelEntry` for serialization. `renderComponent()`, `activateSlot()`, `wireInteractivity()` rendering pipeline. |
| `@casehubio/pages-primitives` | Accessibility mixins: `FocusTrapMixin` (slot-aware focus trap), `RovingTabindexMixin` (2D keyboard navigation with configurable direction), `KeyboardShortcutMixin`, `LiveRegionMixin`. `<pages-modal>` dialog component. Depends on `lit`. |
| `@casehubio/pages-table` | Data table component (`<pages-table>`) -- three display modes (auto/paginated/scroll), virtual scroll engine, CSS Grid rendering, `TableColumnConfig`/`ColumnRenderer` data model, cell spanning (`SpanMap` with `cellSpan`/`mergeRows`), variable row heights, column resizing, multi-mode selection, sorting (multi-column sort stack), client-side filtering with `FilterConfig`, row-detail expansion (`detailMode: single/multi`), jump-to-page, tree/hierarchical data (`getChildren`, `buildTreeIndex` with hierarchy-preserving client filter), CSV export, conditional row accent (`RowAccentConfig` with column-based colour mapping), auto-hiding pagination, 2D keyboard navigation via `RovingTabindexMixin`, ARIA grid. Depends on `lit`. |
| `@casehubio/pages-runtime` | Site orchestrator: `loadSite()` API, navigation (`PageIndex`, `buildPageIndex`), data pipeline (`createDataPipeline`), cross-filter state (`FilterState`), component view state, dataset scope resolution, layout serialization (`LayoutStore`, `createLocalLayoutStore`, `createRestLayoutStore`), panel registry (`registerPanel`), dev auth support. URL serialization/deserialization. |
| `@casehubio/pages-ui-components` | Standalone Lit web components styled with design tokens: `PagesInput`, `PagesSelect`, `PagesTextarea`, `PagesCheckbox`, `PagesButton` (with xs size variant), `PagesBadge` (semantic status pill/tag), `PagesStatusDot` (coloured indicator). Each component available as a separate import path (e.g. `@casehubio/pages-ui-components/input`). Consumed by `pages-viz` schema-form and available for direct use. |
| `@casehubio/pages-tsconfig` | Shared TypeScript config base (project references, maximum strict mode: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`). |
| `@casehubio/pages-webpack-base` | Shared Webpack config presets for iframe components. |

### Graph Packages (`packages/`) -- Visual Diagram Editor (Phase 0-1)

| Package | Purpose |
|---------|---------|
| `@casehubio/graph-core` | Domain-agnostic graph model: `GraphNode`, `GraphEdge`, `GraphModel`. Stencil grammar system (`StencilGrammar` with containment/connection rules, `StencilDescriptor`, `StencilRegistry` with validation). Edit operations (`GraphEdit`: add/remove/replace node, update properties, add/remove edge). `DomainAdapter<T>` for model/edit translation. `PersistenceBackend` SPI (read/write with optimistic concurrency). Runtime overlay (`NodeDecoration` with badges, heatmap intensity, highlight; `RuntimeState`). |
| `@casehubio/graph-renderer` | React Flow bridge via Lit web component: `<casehub-diagram-canvas>` (`CasehubDiagramCanvas`). Consumes `GraphModel` + `RuntimeState`, renders via React Flow in light DOM. ELK layout integration planned. Depends on `@casehubio/graph-core`, React Flow 11, ELK.js, Lit 3. |
| `@casehubio/graph-work-registry` | Marketplace work stencil discovery: `WorkStencilDescriptor` (name, category, icon, async flag, properties/input/output JSON schemas), `WorkStencilCategory`, `WorkRegistry` (YAML-based loader). Depends on `@casehubio/graph-core`. |

### Iframe Component API (`packages/`)

| Package | Purpose |
|---------|---------|
| `@casehubio/pages-iframe-api` | Component controller for iframe-isolated React components. `postMessage`-based protocol for configuration, data delivery, and lifecycle events. React 17 dependency. |
| `@casehubio/pages-iframe-dev` | Development utilities for iframe component testing. |

### Standalone Components (`components/`)

| Package | Purpose |
|---------|---------|
| `@casehubio/pages-component-llm-prompter` | LLM prompt engineering UI (iframe-isolated React). Ollama integration. |
| `@casehubio/pages-component-svg-heatmap` | SVG-based heatmaps (iframe-isolated React). |
| `@casehubio/pages-component-terminal` | Terminal emulator component (Lit, non-iframe). |

### Assembly

| Package/Module | Purpose |
|----------------|---------|
| `@casehubio/pages-webapp` | Webpack orchestrator -- assembles final application bundle from all packages. Also a Maven module (`casehub-pages-npm`) for cross-repo SNAPSHOT publishing. |
| `@casehubio/pages-examples` | Interactive dashboard examples gallery (dev server, Playwright visual tests). |
| `casehub-pages-ui-static` | Maven module packaging pre-built static assets (theme CSS, component ESM bundle) at `META-INF/resources/pages/` for non-bundled consumers. |
| `casehub-pages-npm` | Maven module packaging all `@casehubio/pages-*` npm packages as a SNAPSHOT JAR for cross-repo Maven consumption (see ADR-0001). |
| `templates/quinoa-host` | Starter template for Quarkus apps consuming pages -- pre-configured `package.json` with esbuild and `file:` references. |

### Backend (Java) (`backend/`)

| Module | Purpose |
|--------|---------|
| `casehub-pages-push` | Typed wire protocol SDK: `PushMessage` (server->client builders with event sequence numbers), `PushRequest` (sealed client->server parser with ack/error correlation), `TopicRegistry` (wildcard-aware segment-trie connection tracking), `EventStore` SPI + `InMemoryEventStore` (bounded per-topic event replay), `EventBroadcaster` (store + fan-out to subscribed sessions via `SessionSender`), `SessionSender` SPI, `JsonWriter` SPI, `StoredEvent`, `PushColumn`. jackson-core only, no Quarkus dependency. |
| `casehub-pages-push-runtime` | Quarkus CDI producers: `PushProducers` creates `TopicRegistry`, `EventStore` (`@DefaultBean` InMemoryEventStore, configurable `casehub.pages.push.max-events-per-topic`, default 1000), `JsonWriter` (`@DefaultBean` Jackson ObjectMapper), `EventBroadcaster`. Drop-in `@ApplicationScoped` dependency for any Quarkus app needing server-push. |
| `casehub-pages-auth` | Development authentication: `DevAuthResource` (REST endpoint), `LoginRequest`/`TokenResponse` DTOs. Token handling for backend data providers. |
| `casehub-pages-data` | Backend data provider adapters (SQL, relay proxy). |
| `casehub-pages-data-sql` | SQL-based data provider with frontend push-down integration. |
| `casehub-pages-layout` | Layout persistence SPI: `LayoutPersistenceStore` interface, `LayoutResource` (JAX-RS REST endpoint), `NoOpLayoutPersistenceStore` (default no-op). |
| `casehub-pages-layout-sqlite` | SQLite-based layout store implementation (HikariCP connection pool, sqlite-jdbc driver). |

---

## Key Consumer APIs

### ConfigurablePanel Interface

Pre-attachment configuration contract for hosted Web Components. Defined in `@casehubio/pages-component`.

```typescript
interface ConfigurablePanel<P extends Record<string, unknown> = Record<string, unknown>> {
  configure(props: P): void;
}
```

`configure(props)` is called before the element is appended to the DOM -- before `connectedCallback()` fires. Components should store configuration without triggering rendering. May be called again after initial render (e.g., navigation to a different item) -- implementations must handle re-entry.

### DataReceiver Interface

Data delivery contract for components receiving pipeline data. Defined in `@casehubio/pages-component`.

```typescript
interface DataReceiver {
  dataSet: unknown;
  error: string;
}
```

**Mutual-clearing invariant:** implementations must clear `error` when `dataSet` is set, and clear `dataSet` when `error` is set.

### Composition Pattern

```
YAML -> @casehubio/pages-ui (parse) -> @casehubio/pages-data (resolve)
  -> @casehubio/pages-component (layout) -> @casehubio/pages-viz (render)
  -> pages-filter/pages-sort events -> back to data layer
```

**Entry point:** `loadSite(config, options)` from `@casehubio/pages-runtime`.

**Flow:**
1. `loadSite()` parses YAML, builds `DataSetScope` (all datasets), `PageIndex` (navigation structure)
2. Calls `renderLayout()` via `renderComponent()` from `@casehubio/pages-component` -- creates CSS grid layout
3. For each panel, calls `createDataPipeline()` -- wires dataset resolution, operations, and delivery to the component via `DataReceiver`
4. Components emit `pages-event` on user interaction (filter, sort) -- pipeline re-evaluates -- fresh data delivered

### Layout Serialization

**`LayoutStore` SPI** (from `@casehubio/pages-runtime`):

```typescript
interface LayoutStore {
  load(pageId: string): Promise<LayoutState | null>;
  save(pageId: string, state: LayoutState): Promise<void>;
}
```

**Implementations:**
- `createLocalLayoutStore()` -- localStorage-backed (client-side persistence)
- `createRestLayoutStore(baseUrl)` -- REST API-backed (server-side persistence via `casehub-pages-layout` module)

### Pluggable Theme System

From `@casehubio/pages-ui-tokens`:

```typescript
registerTheme(name: string, css: string): void;
applyTheme(name: string, target?: HTMLElement): void;
getTheme(target?: HTMLElement): string;
listThemes(): string[];
```

`applyTheme()` injects a `<style data-pages-theme>` element, sets `background`/`color` on the target element, adds a `pages-theme-${name}` CSS class, and dispatches a `pages-theme-change` CustomEvent (with `name` and `mode: 'light' | 'dark'`). CaseHub ships presets for light and dark themes. `PagesThemePickerElement` provides a compact picker web component with flyout popover.

### Quinoa Integration Pattern

Quarkus apps embed casehub-pages via Quinoa + Maven SNAPSHOT dependency resolution.

**Typical Quarkus app structure:**
```
src/main/webui/
  package.json            # portal: resolutions to .casehub-packages/
  .casehub-packages/      # Maven-unpacked @casehubio packages (gitignored)
  src/
    index.ts              # loadSite() entry point
    dashboards/
      main.yaml           # YAML dashboard definitions
```

**Build flow (Maven SNAPSHOT -- ADR-0001):**
1. Maven `initialize` phase unpacks `casehub-pages-npm` SNAPSHOT JAR to `.casehub-packages/`
2. Quinoa detects `package.json`, runs `yarn install` (resolves `@casehubio` packages from local portals -- no npm registry needed)
3. Quinoa runs `yarn build` (or esbuild via config), copies dist to `META-INF/resources/`

**Starter template:** `templates/quinoa-host` provides a pre-configured esbuild project with `@casehubio/pages-runtime` and `@casehubio/pages-ui` as `file:` dependencies.

**Local dev:** `yarn build && mvn -f npm-packages/pom.xml install` in casehub-pages first, then `mvn quarkus:dev` in the consumer app.

**Hot reload:** Quinoa proxies the dev server during `quarkus:dev` -- changes to `main.yaml` or TypeScript sources trigger instant browser refresh.

### Push Wire Protocol (Client Side)

`@casehubio/pages-data` exports three client APIs:

| API | Purpose |
|-----|---------|
| `createWebSocketSource(config)` | WebSocket-based push source (full protocol support: listen/unlisten, ack, error correlation). |
| `createSseSource(config)` | SSE-based push source (server->client only, no ack). |
| `createEventConnection(config)` | Event-only WebSocket connection (listen/unlisten, no data delivery -- for lightweight event subscription). |

Additional push utilities: `createPushPool()` for connection pooling, `sendListen()`/`sendUnlisten()` for manual topic management, `isValidTopicOrPattern()`/`matchesTopic()`/`isMatchedByRegistrations()` for topic pattern matching.

### DataSource Abstraction

Unified data provider interface in `@casehubio/pages-data`. Three core types:
- `DataSource` -- `connect(sink)`/`disconnect()` for read-only data flow
- `DataSink` -- `apply(event)`/`error(err)` for receiving data events
- `MutableDataSource` -- extends `DataSource` with `dispatch(action)` for CRUD operations

**`DataAction` union:** `update` (key + changes), `create` (data), `delete` (key).

**Source implementations (14 total):**
- `restSource` -- REST API polling
- `mutableRestSource` -- REST with write endpoints (`WriteConfig`: update/create/delete URL templates, headers, `refreshAfterWrite`)
- `sseSource` -- Server-Sent Events
- `wsSource` -- WebSocket
- `csvSource` -- CSV file/URL
- `inlineSource` -- static inline data
- `joinSource` -- join two datasets
- `postMessageSource` -- iframe `postMessage` bridge
- `serverQuerySource` -- server-side query execution
- `compositeSource` -- multi-source aggregation
- `simulated` -- with mutation operators (transition/increment/decrement/addRow/removeRow/when)
- `replaySource` -- recorded event playback
- `recordingSource` -- captures events for replay
- `SourceFactory` -- creates sources from configuration

`ScenarioController` provides time-controllable scheduling for demo/scenario playback with play/pause/step/speed controls.

### Schema-Driven Forms

`PagesSchemaForm` in `@casehubio/pages-viz` renders forms from JSON Schema-compatible `FieldSchema`:

- Auto-derives schema from `TypedDataSet` column metadata (`deriveSchemaFromDataSet`)
- Field type mapping: number -> number input, date -> date picker, label with enum values -> select dropdown, string -> text input, boolean -> checkbox
- Validation support: `required`, `pattern`, `minimum`/`maximum`, `minLength`/`maxLength`
- `validateOnBlur` mode for inline validation
- Display/edit mode toggle
- Submit bar with action request emission
- Uses standalone `@casehubio/pages-ui-components` for input/select/checkbox/textarea

### Expression Evaluation

`evaluateExpression(expression, context)` from `@casehubio/pages-component`:
- Boolean expression engine for conditional rendering and row styling
- Operators: `&&`, `||`, `!`, `==`, `!=`, `<`, `>`, `<=`, `>=`, parentheses
- Template references: `#{row.fieldName}`, `#{context.key}`
- String literals (single/double quotes), numeric literals, `true`/`false`/`null`
- Numeric type coercion when both operands parse as finite numbers

---

## Dependencies

- **Apache ECharts 5** -- charting library (consumed via `pages-viz`)
- **Lit 3** -- web component framework (pages-viz, pages-table, pages-primitives, pages-ui-components, graph-renderer)
- **JSONata** -- data transformation DSL (pages-data)
- **Zod** -- schema validation (pages-ui YAML parsing)
- **React 17** -- iframe component framework (pages-iframe-api, graph-renderer)
- **React Flow 11** -- graph visualization (graph-renderer)
- **ELK.js** -- graph layout engine (graph-renderer)
- **Yarn 4.10.3** -- package manager (with workspaces)
- **TypeScript 5** -- language (maximum strict mode via pages-tsconfig)
- **Webpack 5** -- bundler (webapp, iframe components)
- **esbuild** -- bundler (quinoa-host template, pages-ui-components)
- **Vitest** -- testing (most packages)
- **Jest 29** -- testing (iframe API packages)

---

## What It Does NOT Do

- **SSE push does not support client->server ack** -- WebSocket only for bidirectional communication.
- **Layout serialization requires explicit `LayoutStore` configuration** -- no auto-discovery.
- **Iframe components cannot access parent window DOM** -- security isolation by design.
- **Not a general-purpose UI framework** -- designed specifically for data dashboards and composable panels, not arbitrary web applications.
- **Graph packages are Phase 0-1** -- `graph-core`, `graph-renderer`, and `graph-work-registry` are bootstrapped but not yet feature-complete. Stencil rendering, ELK layout, and toolbar interactions are planned (see open issues #264-#276).
- **No durable `EventStore` implementation shipped** -- only `InMemoryEventStore` is available. JDBC/Redis implementations are planned (issue #113/#256).
