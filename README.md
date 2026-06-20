casehub-pages
--

casehub-pages is a foundational dashboard rendering runtime for the CaseHub platform — a pure TypeScript library for parsing YAML dashboard definitions and rendering interactive visualizations as Web Components.

**History:** casehub-pages descends from dashbuilder, a full GWT dashboard authoring platform. The melviz fork modernised the frontend, progressively replacing GWT with TypeScript Web Components. casehub-pages completes that journey — 100% TypeScript, near feature parity with dashbuilder, and designed as a foundational building block for the CaseHub platform.

* Supports YAML-based pages, allowing users to build dashboards and reports declaratively
* Reads data from JSON, metrics, and CSV sources
* Data transformation using JSONata expressions
* Iframe-isolated microfrontends for custom visualizations
* Real-time data refresh from datasets
* Cross-component communication using filter components

Licensed under the Apache License, Version 2.0

This is the monorepo for all casehub-pages TypeScript packages, components, and web applications. Here's a brief description of each directory:

* **packages**: Base TypeScript packages for building casehub-pages applications and components
* **components**: Iframe-isolated microfrontends for visualizing data
* **webapp**: casehub-pages web app distribution — embeddable in other applications or runnable standalone
* **examples**: Interactive dashboard examples gallery

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
1. Builds shared packages (`@casehub/pages-data`, `@casehub/pages-ui`, `@casehub/pages-viz`, `@casehub/pages-component`, `@casehub/pages-runtime`)
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
yarn workspace @casehub/pages-component-echarts run build
```

### Development Mode

Run a component in development mode with hot reload:

```bash
yarn workspace @casehub/pages-component-echarts run start  # Starts webpack-dev-server on port 9001
```

Run the examples gallery:

```bash
# Serve examples gallery (port 8080) — requires webapp to be built first
yarn workspace @casehub/pages-examples run serve

# Dev mode with file watching
yarn workspace @casehub/pages-examples run dev
```

### Testing

Run tests on all packages:

```bash
yarn workspaces foreach -A run test
```

Run tests for a specific package:

```bash
yarn workspace @casehub/pages-data run test

# Run specific test file
yarn workspace @casehub/pages-component-echarts run test -- <test-file-pattern>
```

## Architecture Overview

### Monorepo Structure

casehub-pages is organized as a TypeScript monorepo with Yarn workspaces:

- **`packages/`** - Core TypeScript libraries for dashboard rendering
- **`components/`** - Iframe-isolated React microfrontends for visualizations
- **`webapp/`** - Webpack orchestrator that assembles the final application
- **`examples/`** - Interactive dashboard examples gallery

### Package Overview

**Core Packages** (`packages/`):
- `@casehub/pages-data` - DataSet model, operations engine (filter/group/sort), external data extraction (JSON, CSV, Prometheus)
- `@casehub/pages-ui` - YAML parser, DashBuilder backward compatibility, component model
- `@casehub/pages-viz` - Web Component wrappers for charts, tables, metrics, selectors
- `@casehub/pages-component` - CSS grid layout renderer, interactive containers (tabs, pills, sidebar, carousel, stack, accordion)
- `@casehub/pages-runtime` - Site orchestrator providing `loadSite()` API

**Iframe Component API** (`packages/`):
- `@casehub/pages-iframe-api` - Component controller and communication interfaces
- `@casehub/pages-iframe-dev` - Development utilities for component testing
- `@casehub/pages-echarts-base` - Reusable ECharts wrapper library

**Build Configuration** (`packages/`):
- `@casehub/pages-webpack-base` - Common webpack configuration
- `@casehub/pages-tsconfig` - Shared TypeScript configuration

**Available Components** (`components/`):
- `@casehub/pages-component-echarts` - Apache ECharts visualizations
- `@casehub/pages-component-llm-prompter` - LLM prompt engineering UI
- `@casehub/pages-component-svg-heatmap` - SVG-based heatmaps

### Data Flow

```
YAML dashboard definition
    ↓
@casehub/pages-ui (parse YAML)
    ↓
ComponentNode tree + DataSetDef[]
    ↓
@casehub/pages-data (resolve datasets)
    ↓
DataSet (columns + rows)
    ↓
@casehub/pages-component (layout rendering)
    ↓
@casehub/pages-viz (chart/table/metric Web Components)
    ↓
casehub-filter / casehub-sort events → back to data layer
```

1. **@casehub/pages-ui** parses YAML dashboard definitions into a component tree
2. **@casehub/pages-data** resolves datasets from JSON/CSV/metrics sources and applies JSONata transformations
3. **@casehub/pages-component** renders CSS grid layouts with interactive containers
4. **@casehub/pages-viz** provides Web Components for visualizations (powered by Apache ECharts)
5. User interactions (filtering, sorting) flow back to the data layer via custom events

### Entry Point

Host applications load dashboards using the `loadSite()` API from `@casehub/pages-runtime`:

```typescript
import { loadSite } from '@casehub/pages-runtime';

const yamlDashboard = `
pages:
  - components:
    - markdown: "# Dashboard Title"
    - bar:
        dataset: sales
`;

loadSite(yamlDashboard, document.getElementById('container'));
```

Alternatively, dashboards can be configured in `setup.js` for static deployments or sent dynamically via `window.postMessage`.

### Iframe-Isolated Component Architecture

Each component in `components/` runs in an isolated `<iframe>` and communicates with the runtime through `window.postMessage`. The `@casehub/pages-iframe-api` package provides the TypeScript bridge.

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

**Key Interface (`@casehub/pages-iframe-api`)**:
- `ComponentController` - Manages component lifecycle and communication
- `ComponentBus` - Message bus for inter-component communication
- `DataSet` - Data structure passed from runtime to components
- `FilterRequest` - Filter queries sent from components back to runtime
- `FunctionCallRequest` - Backend function calls

### Adding a New Component

1. Create new directory in `components/@casehub/pages-component-<name>/`
2. Add `package.json` with dependency on `@casehub/pages-iframe-api`
3. Create `src/index.tsx` with ComponentController integration
4. Add webpack configuration (can extend `@casehub/pages-webpack-base`)
5. Register component in `webapp/package.json` devDependencies
6. Update `webapp/webpack.config.js` to copy component bundle
7. Build with `yarn build` - output goes to `dist/index.js`

### Deployment

The final artifact is a single directory (`webapp/dist/`) containing:
- Core casehub-pages runtime bundles
- All component bundles (from `components/*/dist/`)
- Static assets and HTML entry points

This can be deployed to any static web server or GitHub Pages.

## Working with YAML Dashboards

casehub-pages renders dashboards defined in YAML. The application can receive content dynamically via `postMessage`:

```javascript
window.postMessage(`pages:
  - components:
    - markdown: "# Hello World!"
`, null)
```

Alternatively, use `setup.js` to configure static dashboards that load on startup.

## Key Technologies

- **Yarn**: v4.10.3 for workspace management
- **TypeScript**: 5.x for type-safe development
- **React**: 17.0.2 for component UI
- **Webpack**: 5.x for module bundling
- **Vitest / Jest**: Testing frameworks with ts-jest for TypeScript
- **Apache ECharts**: Visualization library used by echarts component
- **Patternfly**: React Components Package
- **JSONata**: Data transformation language for dataset processing
