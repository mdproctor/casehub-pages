casehub-pages
--

casehub-pages is a web application framework for the CaseHub platform — a TypeScript runtime for composing applications from layouts, data pipelines, visualization, forms, hosted components, and inter-component communication.

* **TypeScript-first** — type-safe DSL builders with full IDE autocompletion; YAML supported for runtime-loaded pages
* **Data–display separation** — data defined once, bound by reference; same dataset drives charts, tables, and forms simultaneously
* **Reactive data pipeline** — event-driven mutations cascade automatically to all bound components
* **Unified data + event bus** — data mutations and inter-panel events flow through one pipeline over a single connection
* **Recursive composition** — every component nests inside any other; the tree is the API
* **Component hosting** — mount arbitrary Web Components inside the layout tree with managed lifecycle

Licensed under the Apache License, Version 2.0

## Capabilities

### Architecture

| Capability | Description |
|-----------|-------------|
| Data–display separation | Data defined once, bound by reference. Same dataset drives a chart, a table, and a form simultaneously. Swap the visualization without touching the data. Change the source without touching the components. |
| Reactive data pipeline | Event-driven mutation model (snapshot, append, replace, remove). All sources — HTTP, WebSocket, expression generators — produce the same events. Changes cascade automatically to all bound components. |
| Unified data + event bus | Single connection carries data mutations and inter-panel events through one pipeline. Data operations and component events share the same transport and lifecycle. |
| Unified component model | Charts, forms, tables, layouts, navigation, and hosted panels are all `Component` nodes in one recursive tree. A page mixing a bar chart, a form, and a card grid is just a tree. |
| Recursive composition | Any component nests inside any other. Tabs inside splits inside grids. Forms alongside charts inside accordions. No fixed slots — the tree is the API. |

### Application Shell

| Capability | Description |
|-----------|-------------|
| Linked pages | Multi-page sites with shared data context. A form page and a chart page bound to the same datasets, with drill-through navigation between them. |
| Dockable panels | Preconfigured shrink/expand regions with toggle strips. Declared in the component tree, not user-draggable. |
| Split layouts | Resizable N-panel splits with drag handles. Nested splits for complex workbench arrangements. |
| Component hosting | `hostPanel()` mounts arbitrary Web Components with lifecycle management (configure before mount, reconfigure without remount). Iframe-isolated microfrontends via Component API for sandboxed custom visualizations. |
| Layout system | Grid, columns, rows, tabs, pills, sidebar, accordion, carousel, stack. All recursive — layouts nest inside layouts. |
| Navigation | Tree navigation, multi-page sites, URL state management for filters, pagination, and dock state. |

### Data

| Capability | Description |
|-----------|-------------|
| Data sources | JSON, CSV, metrics (Prometheus), WebSocket (real-time push), polling refresh, expression generators. |
| Data operations | Filter, group, sort, aggregate via the lookup API. JSONata transforms for complex reshaping. |
| Cross-filtering | User interaction in one component cascades filters to listening components. Filter groups isolate independent channels. Toggle semantics — click to select, click again to deselect. |

### Components

| Capability | Description |
|-----------|-------------|
| Visualization | Bar, line, area, pie, scatter, bubble, map, and timeseries charts. Tables with sort, pagination, and CSV export. Metrics and meters. Powered by Apache ECharts. |
| Forms | Text, number, dropdown, checkbox, date picker, textarea. Data-scope record selection. Save handlers for form submission. |
| Content | HTML, markdown, titles. Custom Web Components via `hostPanel()`. |

### Developer Experience

| Capability | Description |
|-----------|-------------|
| TypeScript DSL | Type-safe builders with full IDE autocompletion. Import from `@casehubio/ui` and `@casehubio/data`. |
| YAML support | Runtime-loaded pages for dynamic content (e.g. stored in a database). Parsed into the same component tree as the TypeScript DSL. |
| Build pipeline | Quinoa/esbuild integration for Quarkus hosts. Hot reload via `mvn quarkus:dev`. Sub-second builds. |
| Foundation tier | Zero upstream CaseHub dependencies. Any CaseHub app can consume it. Runtime-only via iframe embedding or direct integration. |
| Embeddable | Iframe embedding into any host application, or standalone deployment. |

## Getting Started

### Build with Quinoa

Quinoa gives you a single `mvn quarkus:dev` that hot-reloads both Java and TypeScript. One `mvn package` produces a single JAR with the frontend included. No Node.js at runtime.

See [`docs/quinoa-convention.md`](docs/quinoa-convention.md) for setup.

### Use the TypeScript DSL

The TypeScript DSL is the primary API. YAML is for runtime-loaded pages only (content stored in a database, loaded dynamically).

```typescript
import { page, barChart, table, columns, dataset } from "@casehubio/ui";
import { lookup, groupBy, col, sum } from "@casehubio/data";
import { loadSite } from "@casehubio/pages-runtime";

dataset("sales", "/api/sales");

const app = page("Sales",
  columns([1, 1],
    [barChart({
      title: "Revenue by Region",
      lookup: lookup("sales", groupBy("Region", col("Region"), sum("Revenue"))),
    })],
    [table({
      lookup: lookup("sales"),
    })],
  ),
);

const site = await loadSite(document.getElementById("app")!, app);
```

The DSL gives you IDE autocompletion, type checking, and composability that YAML cannot.

### Start from `loadSite()`

`loadSite()` is the single entry point. Build a component tree, hand it to `loadSite()`, done. It wires data to components, sets up event delegation, and manages the lifecycle.

### Bring your own components

`hostPanel()` mounts any custom Web Component inside the pages layout tree. Don't try to express everything in the DSL — build custom panels for domain-specific UI (terminal emulators, diff viewers, session grids) and let pages manage layout, lifecycle, and communication around them.

```typescript
import { rows, split, hostPanel } from "@casehubio/ui";
import { registerPanel, loadSite } from "@casehubio/pages-runtime";

registerPanel("my-terminal", "app-terminal");
registerPanel("my-sidebar", "app-sidebar");

const workbench = rows(
  split("horizontal", [
    hostPanel("my-sidebar"),
    hostPanel("my-terminal", { sessionId: "abc" }),
  ], { ratio: [30, 70] }),
);

const site = await loadSite(document.getElementById("app")!, workbench);
```

### Compose recursively

Every component nests inside any other. Build small, compose big.

```typescript
const sidebar = tabs(
  ["Files", fileTree()],
  ["Search", searchPanel()],
);

const main = split("horizontal", [
  sidebar,
  split("vertical", [
    hostPanel("editor"),
    hostPanel("terminal"),
  ]),
]);
```

### Drive requirements upstream

casehub-pages evolves from app needs. The workbench primitives (#64 — splits, docks, host panels, event bus) were driven by DraftHouse and Claudony requirements. If the framework doesn't have a primitive you need, file an issue. Your use case shapes the next capability.

## Building casehub-pages

casehub-pages is a TypeScript monorepo managed with Yarn workspaces.

### Prerequisites

* Node.js 18+
* Yarn 4.10.3 (included via Yarn Berry)

### Quick Start - Full Build

**This is the recommended approach for clean environments and CI/CD:**

```bash
# Install dependencies and build everything in correct order
yarn install
yarn build
```

**If you encounter module resolution errors**, clear the yarn cache and reinstall:

```bash
yarn cache clean
yarn install
yarn build
```

The final application will be in [webapp/dist/](webapp/dist/).

The `yarn build` command:
1. Builds shared packages (`@casehubio/pages-data`, `@casehubio/pages-ui`, `@casehubio/pages-viz`, `@casehubio/pages-component`, `@casehubio/pages-runtime`)
2. Builds iframe-isolated components in parallel
3. Assembles final webapp bundle with all assets

### Production Build

```bash
yarn build:prod
```

Production build includes:
* Full optimized webpack builds for all packages
* Examples gallery with validation tests
* Minified bundles ready for deployment

The output will be in [webapp/dist/](webapp/dist/).

### Individual Build Steps

**If you need granular control:**

```bash
# Build only shared packages
yarn build:packages

# Build only iframe components (requires packages to be built first)
yarn build:components

# Build only final webapp (requires everything else to be built first)
yarn build:webapp

# Build examples gallery (requires webapp to be built first)
yarn build:examples

# Build a specific component
yarn workspace @casehubio/pages-component-llm-prompter run build
```

### Development Mode

Run a component in development mode with hot reload:

```bash
yarn workspace @casehubio/pages-component-llm-prompter run start  # Starts webpack-dev-server on port 9001
```

Run the examples gallery:

```bash
# Serve examples gallery (port 8080) — requires webapp to be built first
yarn workspace @casehubio/pages-examples run serve

# Dev mode with file watching
yarn workspace @casehubio/pages-examples run dev
```

### Testing

Run tests on all packages:

```bash
yarn workspaces foreach -A run test
```

Run tests for a specific package:

```bash
yarn workspace @casehubio/pages-data run test

# Run specific test file
yarn workspace @casehubio/pages-component-llm-prompter run test -- <test-file-pattern>
```

## Architecture Overview

### Monorepo Structure

casehub-pages is organized as a TypeScript monorepo with Yarn workspaces:

- **`packages/`** — Core TypeScript libraries: data engine, component model, layout renderer, DSL builders, runtime orchestrator
- **`components/`** — Iframe-isolated React microfrontend components
- **`webapp/`** — Webpack orchestrator that assembles the final application bundle
- **`examples/`** — Interactive examples gallery

### Package Overview

**Core Packages** (`packages/`):
- `@casehubio/pages-data` — DataSet model, reactive event engine (snapshot/append/replace/remove), operations (filter/group/sort/aggregate), external data extraction (JSON, CSV, Prometheus), WebSocket sources, JSONata transforms
- `@casehubio/pages-ui` — TypeScript DSL builders, YAML parser, component model
- `@casehubio/pages-viz` — Web Component wrappers for charts, tables, metrics, selectors (ECharts)
- `@casehubio/pages-component` — CSS grid layout renderer, interactive containers (tabs, pills, sidebar, carousel, stack, accordion, split, dock bar)
- `@casehubio/pages-runtime` — Site orchestrator: `loadSite()` API, navigation, data pipeline, event delegation, panel hosting

**Iframe Component API** (`packages/`):
- `@casehubio/pages-iframe-api` — Component controller and communication interfaces
- `@casehubio/pages-iframe-dev` — Development utilities for component testing

**Build Configuration** (`packages/`):
- `@casehubio/pages-webpack-base` — Common webpack configuration
- `@casehubio/pages-tsconfig` — Shared TypeScript configuration

**Available Components** (`components/`):
- `@casehubio/pages-component-llm-prompter` — LLM prompt engineering UI
- `@casehubio/pages-component-svg-heatmap` — SVG-based heatmaps

### Data Flow

```
TypeScript DSL (or YAML string)
    ↓
Component tree + DataSetDef[]
    ↓
@casehubio/pages-data (resolve datasets, apply events)
    ↓
DataSet (columns + rows) — reactive: mutations cascade to bound components
    ↓
@casehubio/pages-component (layout rendering)
    ↓
@casehubio/pages-viz (chart/table/metric Web Components)
  + hostPanel (custom Web Components)
    ↓
pages-filter / pages-event / pages-sort events → back to data layer
```

1. **@casehubio/pages-ui** provides type-safe DSL builders that produce a component tree (YAML is parsed into the same tree structure for runtime-loaded pages)
2. **@casehubio/pages-data** resolves datasets from REST, JSON, CSV, metrics, and WebSocket sources. The reactive event model (snapshot, append, replace, remove) drives incremental updates.
3. **@casehubio/pages-component** renders layouts with interactive containers
4. **@casehubio/pages-viz** provides Web Components for charts, tables, and metrics (Apache ECharts)
5. **hostPanel** mounts custom Web Components with lifecycle management
6. User interactions (filtering, sorting, panel events) flow back through the data and event pipeline

### Entry Point

Host applications build pages using the TypeScript DSL and render them with `loadSite()`:

```typescript
import { page, barChart, dataset } from "@casehubio/ui";
import { lookup, groupBy, col, sum } from "@casehubio/data";
import { loadSite } from "@casehubio/pages-runtime";

dataset("sales", "/api/sales");

const app = page("Sales",
  barChart({
    title: "Sales by Region",
    lookup: lookup("sales", groupBy("Region", col("Region"), sum("Revenue"))),
  }),
);

const site = await loadSite(document.getElementById("app")!, app);
```

`loadSite()` also accepts a YAML string for runtime-loaded pages. For new applications, always prefer the TypeScript DSL — see [`docs/CASEHUB-PAGES.md`](docs/CASEHUB-PAGES.md) for the complete API reference.

### Iframe-Isolated Component Architecture

Each component in `components/` runs in an isolated `<iframe>` and communicates with the runtime through `window.postMessage`. The `@casehubio/pages-iframe-api` package provides the TypeScript bridge.

**Component Lifecycle Pattern**:
```typescript
// 1. Get controller from ComponentApi
const api = new ComponentApi();
const controller = api.getComponentController();

// 2. Register dataset handler
controller.setOnDataSet((dataset, params) => {
  // Transform dataset and update visualization
});

// 3. Register initialization handler
controller.setOnInit((params) => {
  // Initialize with configuration
});

// 4. Signal ready
controller.ready();

// 5. Send filters back to runtime
controller.filter(filterRequest);
```

**Key Interface (`@casehubio/pages-iframe-api`)**:
- `ComponentController` - Manages component lifecycle and communication
- `ComponentBus` - Message bus for inter-component communication
- `DataSet` - Data structure passed from runtime to components
- `FilterRequest` - Filter queries sent from components back to runtime
- `FunctionCallRequest` - Backend function calls

### Adding a New Component

1. Create new directory in `components/@casehubio/pages-component-<name>/`
2. Add `package.json` with dependency on `@casehubio/pages-iframe-api`
3. Create `src/index.tsx` with ComponentController integration
4. Add webpack configuration (can extend `@casehubio/pages-webpack-base`)
5. Register component in `webapp/package.json` devDependencies
6. Update `webapp/webpack.config.js` to copy component bundle
7. Build with `yarn build` - output goes to `dist/index.js`

### Deployment

The final artifact is a single directory (`webapp/dist/`) containing:
- Core casehub-pages runtime bundles
- All component bundles (from `components/*/dist/`)
- Static assets and HTML entry points

This can be deployed to any static web server or GitHub Pages.

## Key Technologies

- **Yarn**: v4.10.3 for workspace management
- **TypeScript**: 5.x for type-safe development
- **React**: 17.0.2 for iframe component UI
- **Webpack**: 5.x for module bundling
- **Vitest / Jest**: Testing frameworks with ts-jest for TypeScript
- **Apache ECharts**: Chart library
- **JSONata**: Data transformation language

<details>
<summary>History</summary>

casehub-pages descends from dashbuilder, a GWT dashboard authoring platform. The melviz fork modernised the frontend, progressively replacing GWT with TypeScript Web Components. casehub-pages completes that journey — 100% TypeScript, and designed as a foundational building block for the CaseHub platform.

</details>
