# DataSource Pipeline — Unified Architecture

**Issue:** casehub-pages#145
**Date:** 2026-07-09
**Status:** Design

## Problem

Components need data. Currently there are three independent mechanisms to
deliver it — pipeline push (`DataReceiver`), standalone fetch
(`DataEndpointMixin` in blocks-ui), and direct property assignment — each
with its own lifecycle management, error handling, and invariant enforcement.
The result: duplicated state machines, inconsistent APIs, and a source
factory layer that leaks pipeline infrastructure into what should be
standalone abstractions.

### Findings from review

The original 7-item issue (#145) was reviewed against the actual codebase.
Two items reference non-existent code (`DataEndpointMixin` is in
blocks-ui-core not pages; `EventStreamController` doesn't exist). Item 3
(converge SSE paths) conflates two distinct protocols. Items 1, 2, and 4
are one concern. Item 7 understates the problem — `restSource` needs
architectural surgery, not an overload.

This spec replaces the original 7 items with 6 deliverables that address
the root causes. Item 3 (converge SSE paths) will be removed from issue
#145's acceptance criteria with a comment explaining that SSEManager and
EventStream serve distinct protocols (standard SSE vs. pages push wire
protocol) and merging them would conflate fundamentally different
concerns.

## Architecture

### Foundation

The DataSource infrastructure is already substantially implemented from
the prior spec (#140). `DataSource`, `DataSink`, `DataSourceBinding`, all
source factories (`restSource`, `sseSource`, `wsSource`, `inlineSource`,
`csvSource`, `simulated`, `replay`, `recording`, `composite`, `joinSource`,
`serverQuerySource`, `postMessageSource`), `defToBinding`,
`ScenarioController`, and `createScenarioController` — all exist and are
tested. This spec proposes 6 targeted improvements to that existing
foundation, not a new architecture.

### Layer diagram

```
┌─────────────────────────────────────────────────────────┐
│  Component (PagesElement, HostPanel, blocks-ui)         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  DataSourceController (state machine)             │  │
│  │  loading │ dataSet │ error │ onChange              │  │
│  └─────┬─────────────┬───────────────────────────────┘  │
│        │             │                                  │
│   ┌────┴────┐   ┌────┴────┐                             │
│   │ Source   │   │ Pipeline│                             │
│   │ connect  │   │ push    │                             │
│   └────┬────┘   └─────────┘                             │
└────────┼────────────────────────────────────────────────┘
         │
┌────────┴────────────────────────────────────────────────┐
│  DataSource (transport)                                 │
│  restSource │ sseSource │ wsSource │ inlineSource │ ... │
│  ALL standalone — no pipeline infrastructure required   │
└─────────────────────────────────────────────────────────┘
```

### Convergence paths

Every path data takes to reach a component converges on DataSourceController:

1. **Pipeline push (hosted):** Pipeline sets `controller.dataSet = result`
   via VizTarget property setter → mutual-clearing fires → `onChange()` →
   component re-renders.

2. **Endpoint URL (standalone):** Component sets
   `controller.endpoint = '/api/items'` → controller creates `restSource`
   (or `sseSource`/`wsSource` by URL scheme) → `connect()` → source
   delivers to internal sink → `controller.dataSet = data` → `onChange()`.

3. **Direct source (programmatic):** Component sets
   `controller.source = simulated({...})` → `connect()` → same sink path.

## Deliverable 1: DataReceiver — add `loading`

**Package:** `pages-component`
**File:** `packages/pages-component/src/model/hosting.ts`

```typescript
export interface DataReceiver {
  loading: boolean;
  dataSet: unknown;
  error: string;
}
```

### Mutual-clearing invariant

Setting `dataSet` clears `error` and sets `loading = false`. Setting `error`
clears `dataSet` and sets `loading = false`. Setting `loading = true` clears
`error` and preserves stale `dataSet` for refresh scenarios where the
component should show existing data while new data loads.

### Impact

- `PagesElement` gains an explicit `loading` property (currently derives it
  from `_dataset === undefined && !_error`)
- `createHostPanelProxy` in activation.ts adds loading pass-through
- All DataReceiver implementations must add the property

## Deliverable 2: VizTarget — move to `pages-component`

**Package:** `pages-component`
**File:** `packages/pages-component/src/model/hosting.ts` (alongside DataReceiver)

```typescript
import type { SortColumn } from "@casehubio/pages-data/dist/dataset/sort.js";

export interface VizTarget extends DataReceiver {
  totalRows: number;
  activeSort: SortColumn | undefined;
  activePage: number | undefined;
}
```

`pages-component` already depends on `pages-data` (for DataSetLookup,
ColumnType, etc.), so importing `SortColumn` introduces no new dependency.

`pages-runtime` re-exports from the new location for backward compatibility
during the transition, then drops the re-export.

### Impact

- Components can implement the full table-backing contract without depending
  on `pages-runtime`
- `pages-runtime/src/data-pipeline.ts` imports VizTarget from
  `pages-component` instead of defining it locally
- `pages-runtime/src/index.ts` changes from export-from-local to re-export

## Deliverable 3: DataSourceController

**Package:** `pages-component`
**File:** `packages/pages-component/src/controller/data-source-controller.ts`

Framework-agnostic class. No Lit, no DOM dependencies. Pure TypeScript.

```typescript
import type { DataSource } from "@casehubio/pages-data/dist/datasource/types.js";
import type { SortColumn } from "@casehubio/pages-data/dist/dataset/sort.js";
import type { TypedDataSet, DataSetId } from "@casehubio/pages-data/dist/dataset/types.js";
import { dataSetId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { VizTarget } from "../model/hosting.js";

export interface DataSourceControllerOptions {
  onChange?: () => void;
  dataSetId?: DataSetId;
}

export class DataSourceController implements VizTarget {
  // --- Core state (mutual-clearing enforced) ---
  private _loading = false;
  private _dataSet: unknown = undefined;
  private _error = "";

  // --- Pagination/sort (pass-through) ---
  private _totalRows = 0;
  private _activeSort: SortColumn | undefined;
  private _activePage: number | undefined;

  // --- Source management ---
  private _source: DataSource | undefined;
  private _endpoint: string | undefined;
  private _connected = false;
  private readonly _dataSetId: DataSetId;

  readonly onChange: (() => void) | undefined;

  constructor(options?: DataSourceControllerOptions) {
    this.onChange = options?.onChange;
    this._dataSetId = options?.dataSetId ?? dataSetId("ds-controller");
  }

  // --- DataReceiver (mutual-clearing) ---

  get loading(): boolean { return this._loading; }
  set loading(v: boolean) {
    const hadError = this._error !== "";
    if (v) this._error = "";
    if (v === this._loading && !hadError) return;
    this._loading = v;
    this.onChange?.();
  }

  get dataSet(): unknown { return this._dataSet; }
  set dataSet(v: unknown) {
    this._loading = false;
    this._error = "";
    this._dataSet = v;
    this.onChange?.();
  }

  get error(): string { return this._error; }
  set error(v: string) {
    this._loading = false;
    this._dataSet = undefined;
    this._error = v;
    this.onChange?.();
  }

  // --- VizTarget (pass-through) ---

  get totalRows(): number { return this._totalRows; }
  set totalRows(v: number) { this._totalRows = v; }

  get activeSort(): SortColumn | undefined { return this._activeSort; }
  set activeSort(v: SortColumn | undefined) { this._activeSort = v; }

  get activePage(): number | undefined { return this._activePage; }
  set activePage(v: number | undefined) { this._activePage = v; }

  // --- Source configuration ---

  get endpoint(): string | undefined { return this._endpoint; }
  set endpoint(url: string | undefined) {
    if (url === this._endpoint) return;
    this.disconnectSource();
    this._endpoint = url;
    if (url) {
      this._source = createSourceFromUrl(url, this._dataSetId);
      if (this._connected) this.connectSource();
    }
  }

  get source(): DataSource | undefined { return this._source; }
  set source(s: DataSource | undefined) {
    if (s === this._source) return;
    this.disconnectSource();
    this._endpoint = undefined;
    this._source = s;
    if (s && this._connected) this.connectSource();
  }

  // --- Lifecycle ---

  connect(): void {
    if (this._connected) return;
    this._connected = true;
    this.connectSource();
  }

  disconnect(): void {
    if (!this._connected) return;
    this._connected = false;
    this.disconnectSource();
  }

  refresh(): void {
    if (!this._source || !this._connected) return;
    this.loading = true;
    this.disconnectSource();
    this.connectSource();
  }

  dispose(): void {
    this.disconnect();
    this._source = undefined;
    this._endpoint = undefined;
  }

  // --- Internal ---

  private connectSource(): void {
    if (!this._source) return;
    this.loading = true;
    this._source.connect({
      apply: (event) => {
        switch (event.type) {
          case "snapshot":
            this.dataSet = event.dataset;
            break;
          case "append": {
            const ds = this._dataSet as TypedDataSet | undefined;
            if (!ds) break;
            const colCount = ds.columns.length;
            if (event.rows.some(r => r.cells.length !== colCount)) break;
            const combined = [...ds.rows, ...event.rows];
            const rows = event.maxRows !== undefined
              ? combined.slice(-event.maxRows) : combined;
            this.dataSet = { columns: ds.columns, rows };
            break;
          }
          case "replace": {
            const ds = this._dataSet as TypedDataSet | undefined;
            if (!ds) break;
            let matched = false;
            const rows = ds.rows.map(r => {
              const cell = r.cell(event.keyColumn);
              if (cell.type !== "NULL" &&
                String(cell.value) === event.key) {
                matched = true;
                return event.row;
              }
              return r;
            });
            if (!matched) break;
            this.dataSet = { columns: ds.columns, rows };
            break;
          }
          case "remove": {
            const ds = this._dataSet as TypedDataSet | undefined;
            if (!ds) break;
            const rows = ds.rows.filter(r => {
              const cell = r.cell(event.keyColumn);
              return cell.type === "NULL" ||
                String(cell.value) !== event.key;
            });
            if (rows.length === ds.rows.length) break;
            this.dataSet = { columns: ds.columns, rows };
            break;
          }
        }
      },
      error: (err) => {
        if (err.permanent) {
          this.error = err.message;
        }
      },
    });
  }

  private disconnectSource(): void {
    this._source?.disconnect();
  }
}
```

### URL scheme routing

```typescript
function createSourceFromUrl(url: string, id: DataSetId): DataSource {
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return wsSource(url, id);
  }
  if (url.startsWith("sse://") || url.startsWith("sses://")) {
    return sseSource(url, id);
  }
  return restSource(url, id);
}
```

`dataSetId` is the branded constructor from `@casehubio/pages-data`.
Callers that need a stable ID across URL changes (e.g. paginated
endpoints) should pass an explicit `dataSetId` via
`DataSourceControllerOptions`. The default `"ds-controller"` works for
single-source controllers.

### Standalone capabilities

When `restSource` is used standalone (via endpoint-URL mode or direct
source assignment), it uses `fetch(url)` directly. It does NOT route
through `providerFactory` — meaning CORS proxy and server relay routing
are unavailable. This is intentional: the standalone path is for simple
same-origin or CORS-enabled fetches. Components that need CORS proxy or
server relay routing use the pipeline path, where the pipeline provides
its configured `fetchFn` via `RestSourceOptions`.

### What the controller does NOT handle

**SSE event interpretation.** Components that need raw event routing
(notification-bell, work-item-inbox) use `SSEManager` directly, composed
alongside the controller. The controller handles dataset delivery. SSE event
streams are a separate composition concern.

**Cross-filtering, scope resolution, context wiring.** These are pipeline
responsibilities. The controller is the component's state machine; the
pipeline is the orchestrator.

### PagesElement migration

```typescript
// Before: implements DataReceiver directly, manual invariant enforcement
class PagesElement extends HTMLElement implements DataReceiver {
  private _dataset: unknown;
  private _error = '';
  set dataSet(v) { this._error = ''; this._dataset = v; this.update(); }
  set error(v) { this._dataset = undefined; this._error = v; this.update(); }
}

// After: delegates to controller, retains component-specific render logic
class PagesElement extends HTMLElement {
  readonly controller = new DataSourceController({
    onChange: () => this.update()
  });

  get dataSet() { return this.controller.dataSet; }
  set dataSet(v) { this.controller.dataSet = v; }
  get error() { return this.controller.error; }
  set error(v) { this.controller.error = v; }
  get loading() { return this.controller.loading; }

  private update(): void {
    if (!this.isConnected) return;
    if (this.controller.error) {
      this.renderError(this.container, this.controller.error);
      return;
    }
    if (!this._props) {
      this.renderLoading(this.container);
      return;
    }
    if (this.controller.loading || !this.controller.dataSet) {
      this.renderLoading(this.container);
      return;
    }
    this.render(this.container, this._props, this.controller.dataSet);
  }
}
```

### blocks-ui adapter (blocks-ui#44 scope, not pages)

blocks-ui-core writes a thin `DataSourceMixin` wrapping the controller
with Lit `@state()` reactivity. Domain context (WorkIdentity, custom
headers) is threaded by the adapter — the controller can't anticipate
domain concerns. The adapter is the framework binding; the controller is
the state machine.

## Deliverable 4: Source factory unification

**Package:** `pages-data`

All source factories become self-contained. Infrastructure dependencies
become optional with sensible defaults.

### restSource — remove ResolverContext

**File:** `packages/pages-data/src/datasource/sources/rest-source.ts`

```typescript
// Before
export function restSource(
  url: string,
  ctx: ResolverContext,
  dataSetId: DataSetId,
  options?: RestSourceOptions,
  fetchFn?: typeof globalThis.fetch,
): DataSource

// After
export function restSource(
  url: string,
  dataSetId: DataSetId,
  options?: RestSourceOptions,
): DataSource
```

New `RestSourceOptions`:

```typescript
export interface RestSourceOptions {
  readonly method?: HttpMethod;
  readonly headers?: Record<string, string>;
  readonly query?: Record<string, string>;
  readonly form?: Record<string, string>;
  readonly body?: string;
  readonly dataPath?: string;
  readonly type?: string;
  readonly expression?: string;
  readonly columns?: readonly ExternalColumnDef[];
  readonly refreshTime?: string;
  readonly accumulate?: boolean;
  readonly maxRows?: number;
  readonly cacheEnabled?: boolean;
  readonly fetchFn?: typeof globalThis.fetch;
  readonly presets?: PresetRegistry;
}
```

Internal implementation: `fetch(url) → extractDataSet(result, def,
options.presets ?? createPresetRegistry()) → sink.apply({ type: "snapshot",
dataset })`. No DataSetManager. No providerFactory.

### sseSource / wsSource — default pool

**Files:** `packages/pages-data/src/datasource/sources/sse-source.ts`,
`ws-source.ts`

```typescript
// Before
export function sseSource(
  url: string,
  pool: PushPool,
  dataSetId: DataSetId,
  options?: SseSourceOptions,
): DataSource

// After
export function sseSource(
  url: string,
  dataSetId: DataSetId,
  options?: SseSourceOptions,
): DataSource
```

`SseSourceOptions` gains optional `pool?: PushPool`. Uses a module-level
default pool singleton when not provided (same pattern as
`EventStreamPool.defaultPool` on line 90 of `event-stream-pool.ts`).
Two separate defaults: `defaultSsePushPool` and `defaultWsPushPool` —
matching the pipeline's existing separation of `ssePool` and `wsPool`.

### postMessageSource — default presets

```typescript
// Before
export function postMessageSource(
  dataSetId: DataSetId,
  presetRegistry: PresetRegistry,
  options?: PostMessageSourceOptions,
): DataSource

// After
export function postMessageSource(
  dataSetId: DataSetId,
  options?: PostMessageSourceOptions,
): DataSource
```

Options gains optional `presets?: PresetRegistry`. Defaults to
`createPresetRegistry()`.

### defToBinding — simplified deps

```typescript
// Before
export interface DefToBindingDeps {
  readonly ctx: ResolverContext;
  readonly wsPool: PushPool;
  readonly ssePool: PushPool;
  readonly manager: DataSetManager;
}

// After
export interface DefToBindingDeps {
  readonly manager: DataSetManager;
  readonly wsPool?: PushPool;
  readonly ssePool?: PushPool;
  readonly fetchFn?: typeof globalThis.fetch;
  readonly presets?: PresetRegistry;
}
```

`manager` stays — `joinSource` inherently reads from other datasets.
`wsPool` and `ssePool` are separate because `PushPool` is factory-based —
a single pool can only create one connection type (the factory function is
baked in at `createPushPool` time). Both are optional — the source
factories use their module-level default pools when not provided. The
pipeline passes its configured pools (with auth/relay config) to override
defaults. `fetchFn` replaces the entire providerFactory chain for callers
that need custom fetch behavior.

### Consistent signature pattern

After this change, all source factories follow:

```
xSource(config, dataSetId, options?): DataSource
```

| Source | config | Standalone |
|--------|--------|------------|
| restSource | url | Yes |
| sseSource | url | Yes (default pool) |
| wsSource | url | Yes (default pool) |
| serverQuerySource | endpoint | Yes |
| postMessageSource | — | Yes (default presets) |
| inlineSource | data | Yes |
| csvSource | csv | Yes |
| simulated | — | Yes (config in options) |
| replay | events | Yes |
| recording | source | Yes |
| composite | ...sources | Yes |
| joinSource | manager | No (inherent — reads other datasets) |

## Deliverable 5: EventStream reconnection signal

**Package:** `pages-data`
**File:** `packages/pages-data/src/event-stream/event-stream.ts`

```typescript
export interface EventStreamOptions<T = unknown> {
  // ... existing options ...
  onReconnect?: () => void;
}
```

Fired when the underlying connection transitions from disconnected/
reconnecting back to connected. Components doing initial-fetch +
delta-listen use this to re-fetch their baseline after a gap where
events may have been lost.

### Implementation

`EventConnection` already supports `onStatusChange` in its constructor
options — the `setStatus()` internal function fires the callback on every
transition. The gap is that `EventStreamPool` doesn't wire this through
to `PoolHandle`. The implementation:

1. **PoolHandle** gains `onStatusChange?: (status: ConnectionStatus) => void`
2. **EventStreamPool** passes `onStatusChange` to `createEventConnection`,
   dispatching to all active handles for that connection
3. **EventStream** sets its handle's `onStatusChange` to track transitions.
   When status moves from `"reconnecting"` to `"connected"`, fire
   `onReconnect`
4. **Dedicated connections** (non-shared): EventStream passes
   `onStatusChange` directly to `createEventConnection`

For shared pools (the default), this means the pool's connection
recovered — all EventStreams sharing that connection receive the
notification. For dedicated connections, EventStream wires the callback
directly.

## Deliverable 6: SSEManager — unchanged

**Package:** `pages-data` (stays)

`SSEManager` is a general-purpose standard-SSE connection pool. It serves
a fundamentally different protocol than `EventStream`/`EventStreamPool`
(pages push wire protocol with `listen`/`unlisten` commands). They are not
duplicates and must not be merged.

- `SSEManager`: standard `EventSource`, URL-keyed pool, named event
  filtering, rAF batching
- `EventStream`/`EventStreamPool`: pages push wire protocol, topic-based
  subscription, `pages-event` CustomEvent dispatch

blocks-ui components that need raw SSE event routing (work-item-inbox,
notification-bell, notification-inbox) compose `SSEManager` alongside
`DataSourceController`. These are orthogonal concerns.

No changes to SSEManager. Its ownership in `pages-data` is explicit and
stable.

## Migration impact

### pages-component

- `DataReceiver` gains `loading: boolean`
- `VizTarget` moves here from `pages-runtime`
- New `DataSourceController` class
- New exports from `model/index.ts` and `controller/index.ts`

### pages-data

- `restSource` signature changes (ResolverContext removed)
- `sseSource` / `wsSource` signatures change (PushPool becomes optional)
- `postMessageSource` signature changes (PresetRegistry becomes optional)
- `DefToBindingDeps` simplified
- Default PushPool singleton added
- `EventStream` gains `onReconnect` option
- All existing tests updated for new signatures

### pages-runtime

- `VizTarget` definition removed, re-exported from `pages-component`
- `data-pipeline.ts` imports VizTarget from new location
- `PagesElement` migrated to use `DataSourceController` internally
- `createHostPanelProxy` updated for `loading` property
- `data-pipeline.ts` uses new source factory signatures

### pages-viz

- `PagesElement` delegates to `DataSourceController`
- Gains explicit `loading` property
- `renderLoading()` triggered by `loading === true` instead of derived state

### blocks-ui (separate repo, blocks-ui#44)

- blocks-ui-core writes `DataSourceMixin` wrapping `DataSourceController`
- Domain context (WorkIdentity) threaded by the adapter
- `DataEndpointMixin` deprecated immediately, removed after domain repo audit

## Future work enabled

### DataPipeline decomposition

The 677-line `createDataPipeline` currently manages per-component state
inline. With `DataSourceController` handling lifecycle per component, the
pipeline can delegate state management and focus on its unique
responsibilities: scope resolution, cross-filtering, context variable
wiring, and dataset manager orchestration.

### ExternalDataSetDef sunset

As more datasets are expressed as `DataSourceBinding` (with standalone
source factories), the legacy `ExternalDataSetDef` resolution path in the
pipeline shrinks. Eventually, all dataset definitions in YAML produce
`DataSourceBinding` via `defToBinding`, and the pipeline's dual-path
routing (binding vs def) collapses to a single path.

## Testing strategy

Each deliverable is independently testable:

1. **DataReceiver/VizTarget** — type-level tests (compilation) + property
   invariant tests
2. **DataSourceController** — unit tests for state machine transitions,
   mutual-clearing, source lifecycle, URL routing, refresh, dispose
3. **Source factories** — existing tests updated for new signatures; new
   tests for standalone operation without infrastructure deps
4. **EventStream reconnection** — unit test simulating connection drop and
   recovery, verifying onReconnect fires
5. **Integration** — PagesElement + DataSourceController delivering data
   end-to-end

## Acceptance criteria

- [ ] `DataReceiver` includes `loading: boolean`
- [ ] `VizTarget` defined in `pages-component`, re-exported from `pages-runtime`
- [ ] `DataSourceController` in `pages-component` — no Lit, no DOM deps
- [ ] Controller enforces mutual-clearing invariant (dataSet ↔ error ↔ loading)
- [ ] Controller supports endpoint URL → auto-create DataSource by scheme
- [ ] Controller supports direct DataSource assignment
- [ ] Controller fires onChange on every data-state transition (loading, dataSet, error)
- [ ] Controller handles all DataSetEvent types (snapshot, append, replace, remove)
- [ ] `restSource` works without ResolverContext
- [ ] `sseSource` / `wsSource` work without explicit PushPool
- [ ] `postMessageSource` works without explicit PresetRegistry
- [ ] `defToBinding` uses simplified DefToBindingDeps
- [ ] Default PushPool singleton exists in pages-data
- [ ] `EventStream` supports `onReconnect` callback
- [ ] `SSEManager` unchanged, stays in pages-data
- [ ] `PagesElement` delegates to DataSourceController
- [ ] All existing tests pass with new signatures
- [ ] New tests cover controller state machine, standalone sources

## Implementation ordering

Deliverables have dependencies that constrain implementation order:

1. **Deliverable 1** (DataReceiver + loading) — no dependencies
2. **Deliverable 2** (VizTarget move) — depends on Deliverable 1
3. **Deliverable 4** (source factory unification) — independent
4. **Deliverable 5** (EventStream onReconnect) — independent
5. **Deliverable 6** (SSEManager unchanged) — independent (no-op)
6. **Deliverable 3** (DataSourceController) — depends on Deliverables
   1, 2, and 4 (uses new VizTarget location and new source signatures)

Deliverables 1, 4, and 5 can be implemented in parallel. Deliverable 3
must land last.
