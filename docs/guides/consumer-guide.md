# casehub-pages -- Consumer Guide

> Web component framework for composable data dashboards -- YAML-declarable layouts, CSS grid rendering, JSONata data pipelines, ECharts visualizations, and iframe-isolated React components.

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
| `@casehubio/pages-ui-tokens` | OKLCH 12-step design tokens -- colour scales, spacing, typography, elevation, motion, radius. Theme generation and injection. Must build before `pages-viz`. |
| `@casehubio/pages-data` | DataSet model (`TypedDataSet`, `TypedRow`, `Column`, `ColumnType`), operations engine (`FilterOp`/`GroupOp`/`SortOp`), external data extraction, JSONata. Push wire protocol (`EventStream`, `EventStreamPool`). DataSource abstraction (REST, SSE, WebSocket, CSV, inline, simulated, composite, replay, recording). `DataSetManager` (CRUD via `DataSetEvent`, typed lookups with pagination). |
| `@casehubio/pages-ui` | YAML parser (including `grouped-view` desugar with group strategies), DashBuilder backward compat layer, component model. |
| `@casehubio/pages-viz` | Web Component chart/table/metric wrappers (ECharts integration). |
| `@casehubio/pages-component` | CSS grid layout renderer, interactive containers, panel hosting. Exports `ConfigurablePanel` and `DataReceiver` interfaces, `DataSourceController`, expression evaluation. |
| `@casehubio/pages-primitives` | Accessibility mixins: `FocusTrapMixin`, `RovingTabindexMixin`, `KeyboardShortcutMixin`, `LiveRegionMixin`, `<pages-modal>`. |
| `@casehubio/pages-table` | Data table component (`<pages-table>`) -- three display modes, virtual scroll, CSS Grid rendering, multi-mode selection, sorting, filtering, column visibility, tree rows, row-detail expansion, CSV export, ARIA grid, keyboard navigation. |
| `@casehubio/pages-runtime` | Site orchestrator: `loadSite()` API, navigation, data pipeline, layout serialization (`LayoutStore`, `createLocalLayoutStore`). |

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
| `casehub-pages-push` | Typed wire protocol SDK: `PushMessage` (server->client builders), `PushRequest` (sealed client->server parser), `TopicRegistry` (wildcard-aware connection tracking), `EventStore` SPI + `InMemoryEventStore`. jackson-core only, no Quarkus. |
| `casehub-pages-push-runtime` | Quarkus CDI producers for push infrastructure. Drop-in for any Quarkus app needing server-push. |
| `casehub-pages-auth` | Authentication token handling for backend data providers. |
| `casehub-pages-data` | Backend data provider adapters (SQL, relay proxy). |
| `casehub-pages-data-sql` | SQL-based data provider with frontend push-down integration. |
| `casehub-pages-layout` | Layout persistence SPI. |
| `casehub-pages-layout-sqlite` | SQLite-based layout store. |

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
2. Calls `renderLayout()` from `@casehubio/pages-component` -- creates CSS grid layout
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
- `createRestLayoutStore(baseUrl)` -- REST API-backed (server-side persistence)

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

**Build flow:**
1. Maven `initialize` phase unpacks `casehub-pages-npm` (and `casehub-blocks-ui-npm`) to `.casehub-packages/`
2. Quinoa detects `package.json`, runs `yarn install` (resolves `@casehubio` packages from local portals -- no npm registry)
3. Quinoa runs `yarn build`, copies dist to `META-INF/resources/`

**Local dev:** `yarn build && mvn -f npm-packages/pom.xml install` in casehub-pages first, then `mvn quarkus:dev` in the consumer app.

**Hot reload:** Quinoa proxies the dev server during `quarkus:dev` -- changes to `main.yaml` or TypeScript sources trigger instant browser refresh.

### Push Wire Protocol (Client Side)

`@casehubio/pages-data` exports three client APIs:

| API | Purpose |
|-----|---------|
| `createWebSocketSource(config)` | WebSocket-based push source (full protocol support). |
| `createSseSource(config)` | SSE-based push source (server->client only, no ack). |
| `createEventConnection(config)` | Event-only WebSocket (no data delivery, just listen/unlisten). |

---

## Dependencies

- **Apache ECharts** -- charting library
- **JSONata** -- data transformation DSL
- **Yarn 4.10.3** -- package manager (with workspaces)
- **TypeScript 5** -- language
- **React 17** -- iframe component framework
- **Webpack 5** -- bundler
- **Vitest / Jest** -- testing

---

## What It Does NOT Do

- **SSE push does not support client->server ack** -- WebSocket only for bidirectional communication.
- **Layout serialization requires explicit `LayoutStore` configuration** -- no auto-discovery.
- **Iframe components cannot access parent window DOM** -- security isolation by design.
- **Not a general-purpose UI framework** -- designed specifically for data dashboards and composable panels, not arbitrary web applications.
