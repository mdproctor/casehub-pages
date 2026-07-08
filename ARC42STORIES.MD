# casehub-pages — ARC42STORIES.MD

**Spec:** Arc42Stories v0.1
**Profile:** Standalone open-source project
**Build position:** Independent — no upstream dependencies beyond npm packages
**Consumed by:** Any CaseHub web application (DraftHouse, Claudony, DevTown, standalone sites)
**Depends on:** Apache ECharts, js-yaml, marked, JSONata (all npm)

---

## §1 Introduction and Goals

### Description

`casehub-pages` is a web application framework for the CaseHub platform — a pure TypeScript runtime for composing applications from layouts, data pipelines, visualization, forms, hosted Web Components, and inter-component communication. The framework separates data from presentation, wires them together through declarative bindings and a reactive event pipeline, and renders the result as Web Components.

Core packages: `@casehubio/pages-data` (DataSet model, reactive event engine, operations, external data extraction, push sources — WebSocket and SSE, JSONata), `@casehubio/pages-ui` (TypeScript DSL builders, YAML parser, component model), `@casehubio/pages-viz` (Web Component chart/table/metric wrappers around ECharts), `@casehubio/pages-component` (CSS grid layout renderer, interactive containers, split layouts, dock bars), `@casehubio/pages-runtime` (site orchestrator — `loadSite()` API, panel hosting, data pipeline, event delegation).

### Stakeholders

| Stakeholder | Interest |
|---|---|
| Application developers | Compose web applications using the TypeScript DSL, use `hostPanel()` for custom Web Components |
| Host applications | Embed casehub-pages via iframe or direct integration using `loadSite()` API |
| DashBuilder users | Backward-compatible rendering of existing DashBuilder YAML |

### Quality Goals

| Goal | Scenario |
|---|---|
| DashBuilder compatibility | Existing DashBuilder YAML renders correctly without modification |
| Zero-Java runtime | Full rendering pipeline in TypeScript — no GWT compilation, no Java at runtime |
| Interactive filtering | Cross-component filtering, sorting, and pagination work end-to-end |
| Recursive composition | Any component nests inside any other — the tree is the API |
| Data–display separation | Data defined once, bound by reference; same dataset drives multiple components simultaneously |

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
│  (DraftHouse, Claudony, DevTown, standalone)     │
│                                                  │
│   loadSite(tree) ──► @casehubio/pages-runtime      │
│                      ├── @casehubio/pages-ui       │
│                      ├── @casehubio/pages-data     │
│                      ├── @casehubio/pages-component│
│                      └── @casehubio/pages-viz      │
│                                                  │
│   hostPanel() ──► custom Web Components           │
│                                                  │
│   ◄── pages-filter, pages-sort, pages-event ──►   │
└─────────────────────────────────────────────────┘
         │                              │
  TypeScript DSL                  Data sources
  (or YAML string)         (REST, Prometheus, CSV,
                       WebSocket, SSE, expression)
```

**Boundary:** casehub-pages owns layout, data resolution, event delegation, panel hosting, and rendering. Domain logic (authentication, data source credentials) belongs to the host application.

---

## §4 Solution Strategy

### Data Flow

```
TypeScript DSL (or YAML string)
    ↓  (DSL builders / js-yaml)
Component tree + DataSourceBinding[]  — layout model (bind(id, source))
    ↓
DataSource.connect(sink)              — @casehubio/pages-data/datasource
    ↓                                   (inline, csv, rest, sse, ws, simulated, replay, composite)
DataSink → DataSetManager.apply()    — reactive: mutations cascade to bound components
    ↓
renderNode() / renderComponent()     — @casehubio/pages-component
    ↓
<pages-bar-chart> / hostPanel()      — @casehubio/pages-viz Web Components + custom panels
    ↓
pages-filter / pages-sort / pages-event — DOM custom events back to data layer
```

### Reactive Data Pipeline

The `DataSetManager` uses a unified event model — `apply(id, event)` accepts a discriminated union of four event types (snapshot, append, replace, remove). All sources — HTTP resolver, expression generator, WebSocket, SSE — produce `DataSetEvent` objects. The manager applies them uniformly, and changes cascade automatically to all bound components.

### Unified Data + Event Bus

Push sources (WebSocket, SSE) use a unified operation vocabulary routed by `op` field: `snapshot`, `append`, `replace`, `remove` for dataset mutations, `event` for inter-panel communication. One connection, one wire protocol. The `PushSource` abstraction encapsulates subscription lifecycle, reconnection, and error propagation. Errors are classified as transient (corrupt message, reconnecting) or permanent (auth expired, server-rejected 4000+). The runtime sets `target.error` only on permanent errors.

### Lazy Rendering for One-at-a-Time Containers

Tabs, pills, sidebar, carousel, and stack containers render only the active slot's children. On slot switch, the swap function tears down the old slot's DOM and renders the new slot lazily.

Key decisions:
- **Swap function as single owner** — each wire function (wireTabs, wireSidebar, wireCarousel, wireStack) builds one swap function that owns slot state, DOM lifecycle, button chrome, and event dispatch. Click handlers and `activateSlot` both delegate to it via a `slotSwapRegistry` WeakMap.
- **`slot-swap.ts` shared module** — consolidated `dispatchSlotChange` from interactive.ts and activate-slot.ts, eliminating duplication.
- **Registry eviction via `isConnected`** — `pages-slot-change` handler scans the registry and removes entries whose element is disconnected from the DOM. O(1) per entry.
- **Accordion stays eager** — all accordion sections start expanded, so lazy rendering would change UX.

### NavTree Page Deduplication

`parsePage` initially included pages both as top-level `content` slot entries AND as slot values inside navigation containers, causing N-fold DOM duplication. Fix: `collectNavTreePageNames` extracts all page names from navTree groups. These are filtered from the root `content` slot. `patchSlotReferences` recursively replaces unresolved page references in nav slots with their resolved versions.

### Cross-Filter Event Protocol

The filter flow (selector → `pages-filter` → listening component re-query) requires:
1. Event listener ordering — `renderComponent` must run AFTER `addEventListener` (custom elements dispatch `pages-data-request` synchronously during `connectedCallback`)
2. `@casehubio/viz` side-effect import — custom elements must be registered for `connectedCallback` to fire
3. `yamlLoad` call in the YAML string path

---

## §5 Building Block View

| Package | Responsibility |
|---|---|
| `@casehubio/pages-data` | DataSet model, reactive event engine (snapshot/append/replace/remove), filter/group/sort operations, external data extraction (JSON, CSV, Prometheus), push sources (PushSource interface, WebSocket, SSE, generic pool), JSONata expressions, `DatasetContract`, `ConnectionStatus`, segment-level wildcard matching (`matchesTopic`) |
| `@casehubio/pages-ui` | TypeScript DSL builders, YAML parser, DashBuilder backward compatibility (displayer desugaring, layout placement, nav desugaring), component model |
| `@casehubio/pages-viz` | Web Component wrappers: bar, line, area, pie, donut, bubble, timeseries, meter, map, table, metric, selector |
| `@casehubio/pages-component` | CSS grid layout renderer, interactive containers (tabs, pills, sidebar, carousel, stack, accordion), split layouts, dock bars, slot management, `emitPagesEvent`/`onPagesEvent` event helpers |
| `@casehubio/pages-primitives` | Lit web components: a11y mixins (RovingTabindex, FocusTrap, KeyboardShortcut, LiveRegion), `<pages-schema-form>` (JSON Schema form renderer), `<pages-filter-chips>` (multi-select toggle bar), `<pages-scope-selector>` (single-select radio pills) |
| `@casehubio/pages-runtime` | Site orchestrator: `loadSite()`, panel hosting (`registerPanel`, `hostPanel`), page navigation, data pipeline, event delegation |
| `@casehubio/pages-examples` | Examples gallery: dev server, Playwright tests, sample validation |

---

## §6 Runtime View

### Application Loading

1. Host calls `loadSite(container, tree)` with a TypeScript DSL component tree (or YAML string)
2. Runtime parses input via `@casehubio/pages-ui` → `ComponentNode` tree + `DataSetDef[]`
3. Runtime registers event listeners for `pages-data-request`, `pages-filter`, `pages-sort`, `pages-page`, `pages-event`
4. Runtime calls `renderComponent()` → `@casehubio/pages-component` renders CSS grid layout
5. `hostPanel` activation mounts custom Web Components via `configure()` then `appendChild()`
6. Viz Web Components fire `pages-data-request` during `connectedCallback`
7. Runtime resolves each dataset via `@casehubio/pages-data` (HTTP, WebSocket, SSE, expression) and posts results back
8. Components render with ECharts / DOM

### Push Source Lifecycle

1. Component requests a dataset with `ws://` or `sse://` URL
2. Data pipeline acquires a `PushSource` from the pool (keyed by base URL, one connection per origin)
3. Pipeline calls `source.subscribe(dataSetId, def, listener, onError)` — WebSocket sends subscribe message, SSE is receive-only
4. Source receives wire messages with `op` field routing to dataset mutations (`snapshot`, `append`, `replace`, `remove`) or inter-panel events (`event`)
5. Dataset mutations apply to `DataSetManager`, cascading to all bound components
6. Errors classified as transient (logged, reconnect continues) or permanent (propagated to components via `target.error`)
7. `MutationObserver` detects component unmount, calls `source.unsubscribe(dataSetId)` when last subscriber disconnects
8. On dispose, pipeline disconnects observer, unsubscribes all push sources, releases pools

### Cross-Filtering

1. User clicks a data point (chart bar/slice, table cell, selector option, iframe message)
2. Emitter resolves `row` and `value` at dispatch time, emits `pages-filter` custom event with `PagesFilterApply` (discriminated union: `columnId`, `value`, `row`, `reset: false`, `group`) or `PagesFilterReset` (`columnId`, `reset: true`, `group`)
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
| Column expressions | `cell-extract.ts` evaluates per-cell expressions via JSONata (`compileOrCached` from `jsonata-bridge.ts`). Sandboxed AST evaluation, CSP-safe. Replaces `new Function()` (#16) |

---

## §9 Journeys and Chapters

### Chapter 1: TypeScript DataSet Core

**Status:** ✅ complete

GWT-to-TypeScript migration of the core data and rendering pipeline. All packages shipped: DataSet model, operations engine, YAML parser, Web Components, CSS grid layout, and site runtime.

| Milestone | Status |
|---|---|
| DataSet model + operations (group, sort, filter, aggregate) | ✅ shipped |
| Expression evaluator (JSONata bridge) | ✅ shipped |
| YAML parser + component schema | ✅ shipped |
| External data extraction (JSON, CSV, Prometheus) | ✅ shipped |
| @casehubio/pages-viz Web Components | ✅ shipped |
| @casehubio/pages-component CSS grid layout | ✅ shipped |
| @casehubio/pages-runtime — loadSite() | ✅ shipped |

### Chapter 2: Examples Gallery

**Status:** ✅ complete

Interactive gallery with sample pages, dev server, and Playwright smoke tests.

| Milestone | Status |
|---|---|
| Examples runner — host page + dev server | ✅ shipped |
| Axis and grid settings | ✅ shipped |
| Markdown parser | ✅ shipped |
| DashBuilder sample migration and validation | ✅ shipped |
| Global displayer defaults | ✅ shipped |
| Inline content extraction | ✅ shipped |
| Navigation types: tree, menu, tiles, sidebar | ✅ shipped |
| Case-insensitive column matching | ✅ shipped |
| Mock data for Prometheus examples | ✅ shipped |

### Backlog

| Issue | Title | Status |
|---|---|---|
| #12 | Lazy on-demand pagination for datasets | 🔲 open |
| #14 | Domain-specific examples for the gallery | ✅ shipped |
| #15 | Accessibility: ARIA attributes, keyboard navigation, screen reader support | 🔲 open |
| #16 | CSP compliance: replace new Function() in column expressions | ✅ shipped |
| #17 | Theming system and dark mode support | ✅ shipped |
| #18 | Table data export (CSV, clipboard) | ✅ shipped |
| #19 | Loading and error states for components | ✅ shipped |
| #20 | Chart click → cross-filter event protocol | ✅ shipped |
| #21 | Optional Quarkus backend MVP | ✅ shipped |
| #22 | Server-side data provider: Prometheus | 🔲 open |
| #23 | Server-side data provider: Elasticsearch | 🔲 open |
| #24 | View state persistence (URL-based) | ✅ shipped |
| #25 | LLM-friendly API documentation for host application integration | ✅ shipped |
| #26 | Platform convention: Quarkus + TypeScript frontend via Quinoa | ✅ shipped |
| #28 | Remove redundant iframe ECharts component — migrate to inline Web Components | ✅ shipped |
| #35 | Map geo data loading — `registerMap()` for ECharts map/geo | ✅ done |
| #36 | Accumulate + expression for inline datasets | ✅ shipped |
| #44 | Minor polish for domain examples | ✅ done |

---

## §10 Architectural Decisions

Decisions not captured inline in §4:

| Decision | Rationale |
|---|---|
| Web Components over React for viz | Components must work inside any host framework (React, vanilla, GWT iframe). Web Components are framework-agnostic. |
| Custom events over callback API | `pages-filter`, `pages-sort`, `pages-event` decouple components from the runtime. Any host can intercept and handle events. |
| TypeScript DSL as primary API | Type-safe builders with IDE autocompletion. YAML supported for runtime-loaded pages (dynamic content). |
| DashBuilder YAML backward compat | Existing DashBuilder YAML still parses and renders. Parser handles both DashBuilder legacy and clean casehub format. |
| Unified event model for data mutations | snapshot/append/replace/remove as a discriminated union. All sources produce the same events. Enables reactive cascading. |
| PushSource interface for push sources | Encapsulates subscription lifecycle, reconnection, error propagation. WebSocket and SSE share the same wire protocol (`op` field routing), eliminating duplication. Generic `PushPool` factory reduces boilerplate. |
| Error propagation via `onError` callback | Separates data events (mutate datasets) from source health (component error state). Permanent errors set `target.error`, transient errors log and continue. |
| Unified data + event bus | WebSocket and SSE route both dataset mutations and inter-panel events through one connection. `op: "event"` dispatches `pages-event` DOM events; other ops apply to `DataSetManager`. Grafana separates EventBus and Live — we unify. |
| Backend data module: two-module split | `data` (SPI + REST relay/query, no JDBC) / `data-sql` (SQL provider via Agroal). Mirrors `layout`/`layout-sqlite`. Deployers who only need relay include one module; SQL push-down requires the second. |
| Base queries configured server-side | Frontend sends `dataSetId`, backend resolves to a registered SQL query. User-supplied SQL is never accepted — injection surface is zero for the base query path. |
| Three-layer SQL injection prevention | Filter values → bind parameters. Column IDs → validated against allowlist from base query metadata. Column names → ANSI-quoted in generated SQL. |
| serverQuery as fourth source type | `ExternalDataSetDef.serverQuery` is a distinct source alongside url/content/join. YAML operations are pushed to SQL; runtime interactive ops (cross-filters, user sort) apply client-side on the aggregated result. |
| SSRF relay: no redirect following | `HttpClient.Redirect.NEVER` prevents redirect-based SSRF bypassing validateTarget(). Redirects inside the HTTP client layer would skip application-level validation. |
| Segment-level wildcard patterns | `*` matches one segment, `**` matches zero or more (last position only). MQTT-inspired convention adapted for `:` delimiters. `TopicRegistry.matches()` (Java) and `matchesTopic()` (TypeScript) produce identical results. |
| Lit for UI component primitives | `pages-primitives` uses Lit 3.3 for a11y mixins, form components, and UI widgets. `pages-component` stays framework-agnostic (vanilla TypeScript). Separation keeps Lit at the leaf level — data and rendering pipeline are framework-free. |

---

## §11 Quality Requirements

| Requirement | Metric |
|---|---|
| DashBuilder compatibility | 28/31 sample pages render correctly (validation matrix: `examples/VALIDATION.md`) |
| Test coverage | 615 tests (@casehubio/data), 158 tests (@casehubio/component), 183 tests (@casehubio/runtime), 77 Playwright tests (smoke + gallery + domain examples) |
| No Java at runtime | `loadSite()` works without GWT compilation or Java process |

---

## §12 Risks and Technical Debt

| Risk | Impact | Mitigation |
|---|---|---|
| ~~`new Function()` requires CSP `unsafe-eval`~~ | Resolved (#16) | Column expressions migrated to JSONata AST evaluation. No `unsafe-eval` required |
| Map geo data requires CDN fetch | Maps depend on jsDelivr CDN at runtime for world GeoJSON | Resolved (#35) — lazy-loaded with cache and error handling; offline renders error instead of empty chart |

---

## §13 Glossary

| Term | Definition |
|---|---|
| `DataSet` | Column-oriented tabular data — the wire format between data resolution and visualization |
| `DataSetLookup` | A query against a named dataset: filter → group → sort pipeline |
| `DataSetEvent` | Discriminated union of mutation types: snapshot, append, replace, remove |
| `ComponentNode` | A node in the parsed layout tree — carries type, props, slots (children), and optional dataset reference |
| `loadSite()` | Entry point: accepts component tree or YAML string, renders into a DOM container, returns a dispose handle |
| `NavTree` | Navigation structure: groups of named pages rendered as tabs, tree, menu, or tiles |
| `PushSource` | Interface for push-based data sources (WebSocket, SSE). Encapsulates subscription lifecycle, reconnection, and error propagation. |
| `PushSourceError` | Error from a push source — `message` and `permanent` flag. Permanent errors propagate to components (`target.error`), transient errors log and continue. |
| `PushPool` | Generic pool factory for push sources. One connection per base URL, shared across subscriptions. Configurable via `DataProviderConfig`. |
| `hostPanel` | Component type that mounts a registered custom Web Component inside the pages tree. Host app calls `registerPanel(typeName, tagName)` before `loadSite()`. |
| `pages-event` | DOM custom event for inter-panel communication. Dispatched by panels, listened on `document`, bubbles through Shadow DOM via `composed: true`. |

---

*Created 2026-06-17. Updated 2026-06-30 — repositioned from "dashboard rendering runtime" to "web application framework"; added reactive data pipeline, unified event bus, panel hosting, and workbench primitives context.*
