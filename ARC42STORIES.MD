# casehub-pages — ARC42STORIES.MD

**Spec:** Arc42Stories v0.1
**Profile:** Standalone open-source project
**Build position:** Independent — no upstream dependencies beyond npm packages
**Consumed by:** Any web application embedding interactive dashboards (DraftHouse, Claudony, standalone sites)
**Depends on:** Apache ECharts, js-yaml, marked, JSONata (all npm)

---

## §1 Introduction and Goals

### Description

`casehub-pages` is a pure TypeScript dashboard rendering runtime — a GWT-to-TypeScript migration of the DashBuilder visualization engine. It parses YAML dashboard definitions, resolves datasets (inline, URL, JSONata), and renders interactive visualizations as Web Components.

Core packages: `@casehubio/pages-data` (DataSet model, operations engine, external data extraction), `@casehubio/pages-ui` (YAML parser, layout model, displayer desugaring), `@casehubio/pages-viz` (Web Component chart/table/metric wrappers around ECharts), `@casehubio/pages-component` (CSS grid layout renderer, slot management, interactive containers), `@casehubio/pages-runtime` (site orchestrator — wires parsing, data, and rendering into `loadSite()`).

### Stakeholders

| Stakeholder | Interest |
|---|---|
| Dashboard authors | Author YAML dashboards rendered without Java/GWT |
| Host applications | Embed dashboards via `loadSite()` API |
| DashBuilder users | Backward-compatible rendering of existing DashBuilder YAML |

### Quality Goals

| Goal | Scenario |
|---|---|
| DashBuilder compatibility | Existing DashBuilder YAML dashboards render correctly without modification |
| Zero-Java runtime | Full rendering pipeline in TypeScript — no GWT compilation, no Java at runtime |
| Interactive filtering | Cross-component filtering, sorting, and pagination work end-to-end |

---

## §2 Constraints

### Platform
TypeScript 5, React 17, Webpack 5. Yarn 4.10 workspaces. Node 18+.

### Build

```bash
yarn install && yarn build        # development
yarn build:prod                   # production (includes examples gallery)
```

---

## §3 Context and Scope

```
┌─────────────────────────────────────────────────┐
│                  Host Application                │
│  (DraftHouse, Claudony, standalone HTML page)    │
│                                                  │
│   loadSite(yaml) ──► @casehubio/pages-runtime      │
│                      ├── @casehubio/pages-ui       │
│                      ├── @casehubio/pages-data     │
│                      ├── @casehubio/pages-component│
│                      └── @casehubio/pages-viz      │
│                                                  │
│   ◄── casehub-filter, casehub-sort events ──►    │
└─────────────────────────────────────────────────┘
         │                              │
    YAML files                    Data sources
  (inline/URL)              (REST, Prometheus, CSV)
```

**Boundary:** casehub-pages owns parsing, data resolution, layout, and rendering. Domain logic (what dashboards to show, authentication, data source credentials) belongs to the host application.

---

## §4 Solution Strategy

### Data Flow

```
YAML dashboard definition
    ↓  (js-yaml)
parsePage() / parsePages()          — @casehubio/pages-ui
    ↓
ComponentNode tree + DataSetDef[]   — layout model
    ↓
resolveDataSet() / extractDataSet() — @casehubio/pages-data
    ↓
DataSet (columns + rows)            — wire format
    ↓
renderNode() / renderComponent()    — @casehubio/pages-component
    ↓
<casehub-bar-chart> etc.            — @casehubio/pages-viz Web Components
    ↓
casehub-filter / casehub-sort       — DOM custom events back to data layer
```

### Lazy Rendering for One-at-a-Time Containers

Tabs, pills, sidebar, carousel, and stack containers render only the active slot's children. On slot switch, the swap function tears down the old slot's DOM and renders the new slot lazily.

Key decisions:
- **Swap function as single owner** — each wire function (wireTabs, wireSidebar, wireCarousel, wireStack) builds one swap function that owns slot state, DOM lifecycle, button chrome, and event dispatch. Click handlers and `activateSlot` both delegate to it via a `slotSwapRegistry` WeakMap.
- **`slot-swap.ts` shared module** — consolidated `dispatchSlotChange` from interactive.ts and activate-slot.ts, eliminating duplication.
- **Registry eviction via `isConnected`** — `casehub-slot-change` handler scans the registry and removes entries whose element is disconnected from the DOM. O(1) per entry.
- **Accordion stays eager** — all accordion sections start expanded, so lazy rendering would change UX.

### NavTree Page Deduplication

`parsePage` initially included pages both as top-level `content` slot entries AND as slot values inside navigation containers, causing N-fold DOM duplication. Fix: `collectNavTreePageNames` extracts all page names from navTree groups. These are filtered from the root `content` slot. `patchSlotReferences` recursively replaces unresolved page references in nav slots with their resolved versions.

### Cross-Filter Event Protocol

The filter flow (selector → `casehub-filter` → listening component re-query) requires:
1. Event listener ordering — `renderComponent` must run AFTER `addEventListener` (custom elements dispatch `casehub-data-request` synchronously during `connectedCallback`)
2. `@casehubio/viz` side-effect import — custom elements must be registered for `connectedCallback` to fire
3. `yamlLoad` call in the YAML string path

---

## §5 Building Block View

| Package | Responsibility |
|---|---|
| `@casehubio/pages-data` | DataSet model, filter/group/sort operations, external data extraction (JSON, CSV, Prometheus), JSONata expressions |
| `@casehubio/pages-ui` | YAML parser, DashBuilder backward compatibility (displayer desugaring, layout placement, nav desugaring), component model |
| `@casehubio/pages-viz` | Web Component wrappers: bar, line, area, pie, donut, bubble, timeseries, meter, map, table, metric, selector |
| `@casehubio/pages-component` | CSS grid layout renderer, interactive containers (tabs, pills, sidebar, carousel, stack, accordion), slot management |
| `@casehubio/pages-runtime` | Site orchestrator: `loadSite()`, page navigation, dataset resolution pipeline, event wiring |
| `@casehubio/pages-examples` | Dashboard gallery: dev server, Playwright tests, DashBuilder sample validation |

---

## §6 Runtime View

### Dashboard Loading

1. Host calls `loadSite(yaml, container, options)`
2. Runtime parses YAML via `@casehubio/pages-ui` → `ComponentNode` tree + `DataSetDef[]`
3. Runtime registers event listeners for `casehub-data-request`, `casehub-filter`, `casehub-sort`, `casehub-page`
4. Runtime calls `renderComponent()` → `@casehubio/pages-component` renders CSS grid layout
5. Web Components fire `casehub-data-request` during `connectedCallback`
6. Runtime resolves each dataset via `@casehubio/pages-data` and posts results back via `casehub-data-response`
7. Web Components render with ECharts / DOM

### Cross-Filtering

1. User clicks a data point (chart bar/slice, table cell, selector option, iframe message)
2. Emitter resolves `row` and `value` at dispatch time, emits `casehub-filter` custom event with `CasehubFilterApply` (discriminated union: `columnId`, `value`, `row`, `reset: false`, `group`) or `CasehubFilterReset` (`columnId`, `reset: true`, `group`)
3. Runtime uses `detail.value` directly — no fallback logic or row extraction
4. If child DataScope exists and row contains `idColumn` → record selection path; otherwise → cross-filter path
5. Runtime re-queries listening components via the data pipeline with updated `FilterState`
6. Components re-render; emitters track selection via `_selectedValue` for toggle (click-again-to-deselect) and visual feedback (ECharts `highlight`/`downplay` for charts, `.selected` CSS for tables)

---

## §7 Deployment View

Packages published to GitHub Packages (`npm.pkg.github.com`) under the `@casehubio` scope. Host applications consume packages via Quarkus Quinoa — `npm install` at build time, static serving from `META-INF/resources/` at runtime. No Node.js at runtime.

Convention: `docs/quinoa-convention.md`. Reference template: `templates/quinoa-host/`.

The examples gallery serves at `localhost:8080` via webpack-dev-server (monorepo-internal, not published).

---

## §8 Crosscutting Concepts

| Concern | Approach |
|---|---|
| DashBuilder compatibility | `displayer-desugar.ts` maps DashBuilder YAML properties to casehub component model. `backwards-compat.ts` handles legacy field names. |
| Case-insensitive column matching | `column-lookup.ts` provides `findColumnIndex` with case-insensitive fallback for filter/group/sort operations |
| JSON resilience | `extraction.ts` handles trailing commas, single-quoted JSON, and flat primitive arrays from hand-authored YAML content |
| Column expressions | `cell-extract.ts` evaluates per-cell expressions via `new Function("value", expression)` — dashboard author code, same trust model as GWT DashBuilder |

---

## §9 Journeys and Chapters

### Chapter 1: TypeScript DataSet Core

**Status:** ✅ complete

GWT-to-TypeScript migration of the core data and rendering pipeline. All packages shipped: DataSet model, operations engine, YAML parser, Web Components, CSS grid layout, and site runtime.

| Milestone | Status |
|---|---|
| DataSet model + operations (group, sort, filter, aggregate) | ✅ shipped |
| Expression evaluator (JSONata bridge) | ✅ shipped |
| YAML parser + dashboard schema | ✅ shipped |
| External data extraction (JSON, CSV, Prometheus) | ✅ shipped |
| @casehubio/pages-viz Web Components | ✅ shipped |
| @casehubio/pages-component CSS grid layout | ✅ shipped |
| @casehubio/pages-runtime — loadSite() | ✅ shipped |

### Chapter 2: DashBuilder Demo Gallery

**Status:** ✅ complete

Interactive gallery with DashBuilder sample dashboards, dev server, and Playwright smoke tests.

| Milestone | Status |
|---|---|
| Dashboard demo runner — host page + dev server | ✅ shipped |
| Axis and grid settings | ✅ shipped |
| Markdown parser | ✅ shipped |
| DashBuilder sample migration and validation | ✅ shipped |
| Global displayer defaults | ✅ shipped |
| Inline content extraction | ✅ shipped |
| Navigation types: tree, menu, tiles, sidebar | ✅ shipped |
| Case-insensitive column matching | ✅ shipped |
| Mock data for Prometheus dashboards | ✅ shipped |

### Backlog

| Issue | Title | Status |
|---|---|---|
| #12 | Lazy on-demand pagination for datasets | 🔲 open |
| #14 | Domain-specific example dashboards for the gallery | ✅ shipped |
| #15 | Accessibility: ARIA attributes, keyboard navigation, screen reader support | 🔲 open |
| #16 | CSP compliance: replace new Function() in column expressions | 🔲 open |
| #17 | Theming system and dark mode support | ✅ shipped |
| #18 | Table data export (CSV, clipboard) | ✅ shipped |
| #19 | Loading and error states for components | ✅ shipped |
| #20 | Chart click → cross-filter event protocol | ✅ shipped |
| #21 | Optional Quarkus backend MVP | 🔲 open |
| #22 | Server-side data provider: Prometheus | 🔲 open |
| #23 | Server-side data provider: Elasticsearch | 🔲 open |
| #24 | View state persistence (URL-based) | ✅ shipped |
| #25 | LLM-friendly API documentation for host application integration | ✅ shipped |
| #26 | Platform convention: Quarkus + TypeScript frontend via Quinoa | ✅ shipped |
| #28 | Remove redundant iframe ECharts component — migrate to inline Web Components | ✅ shipped |
| #35 | Map geo data loading — `registerMap()` for ECharts map/geo | 🔲 open |
| #36 | Accumulate + expression for inline datasets | 🔲 open |
| #44 | Minor polish for domain example dashboards | 🔲 open |

---

## §10 Architectural Decisions

Decisions not captured inline in §4:

| Decision | Rationale |
|---|---|
| Web Components over React for viz | Components must work inside any host framework (React, vanilla, GWT iframe). Web Components are framework-agnostic. |
| Custom events over callback API | `casehub-filter`, `casehub-sort` etc. decouple components from the runtime. Any host can intercept and handle events. |
| DashBuilder YAML as primary format | Backward compatibility with existing dashboards. Parser handles both DashBuilder legacy and clean casehub format. |

---

## §11 Quality Requirements

| Requirement | Metric |
|---|---|
| DashBuilder compatibility | 28/31 sample dashboards render correctly (validation matrix: `examples/VALIDATION.md`) |
| Test coverage | 615 tests (@casehubio/data), 158 tests (@casehubio/component), 183 tests (@casehubio/runtime), 77 Playwright tests (smoke + gallery + domain dashboards) |
| No Java at runtime | `loadSite()` works without GWT compilation or Java process |

---

## §12 Risks and Technical Debt

| Risk | Impact | Mitigation |
|---|---|---|
| `new Function()` requires CSP `unsafe-eval` | Blocks deployment in strict CSP environments | Column expressions could be moved to a sandboxed evaluator (#16) |
| Kitchensink map component rendering | `regions` property undefined — map tab empty | Map page is an orphan (commented out of navTree) |

---

## §13 Glossary

| Term | Definition |
|---|---|
| `DataSet` | Column-oriented tabular data — the wire format between data resolution and visualization |
| `DataSetLookup` | A query against a named dataset: filter → group → sort pipeline |
| `ComponentNode` | A node in the parsed layout tree — carries type, props, slots (children), and optional dataset reference |
| `DisplayerSettings` | DashBuilder's configuration object for a chart/table — desugared into ComponentNode props by `displayer-desugar.ts` |
| `loadSite()` | Entry point: accepts YAML string or parsed config, renders into a DOM container, returns a dispose handle |
| `NavTree` | Navigation structure: groups of named pages rendered as tabs, tree, menu, or tiles |

---

*Created 2026-06-17. Journal entries from issue-19-dashbuilder-demos merged into §4.*
