# DataSourceController URL Routing & Pipeline Refresh

**Date:** 2026-07-14
**Issues:** #148 (DataSourceController endpoint URL auto-routing), #134 (panel-initiated dataset refresh)
**Packages:** `pages-data`, `pages-component`, `pages-runtime`

---

## §1 Problem

Two gaps in the DataSource subsystem:

1. `DataSourceController.endpoint` accepts a URL but returns a no-op `DataSource` unless the caller provides a `sourceFactory`. There is no default factory that routes by URL scheme, so every consumer must wire one manually.

2. Host panels have no mechanism to trigger a data re-fetch. The pipeline's `refreshDataSet` only re-delivers cached data from the `DataSetManager` — it does not re-fetch from the external source. This means `pages-action-complete` (the post-mutation refresh event) silently serves stale data for REST-backed datasets.

---

## §2 DataSourceController URL Routing (#148)

### §2.1 Type relocation

`SourceFactory` and `SourceFactoryOptions` are currently defined in `pages-component/src/controller/data-source-controller.ts`. All constituent types (`DataSource`, `DataSetId`, `ExternalColumnDef`) originate from `pages-data`. Move both types to `pages-data/src/datasource/types.ts` where they belong architecturally.

Update `pages-component` to import from `pages-data` instead of defining locally.

```typescript
// pages-data/src/datasource/types.ts (additions)

export interface SourceFactoryOptions {
  readonly columns?: readonly ExternalColumnDef[] | undefined;
  readonly dataPath?: string | undefined;
}

export type SourceFactory = (
  url: string,
  id: DataSetId,
  options?: SourceFactoryOptions,
) => DataSource;
```

### §2.2 Default source factory

New file: `pages-data/src/datasource/sources/source-factory.ts`

```typescript
export interface SourceFactoryDeps {
  readonly wsPool?: PushPool;
  readonly ssePool?: PushPool;
  readonly fetchFn?: typeof globalThis.fetch;
  readonly presets?: PresetRegistry;
}

export function createSourceFactory(deps?: SourceFactoryDeps): SourceFactory
```

URL scheme routing:

| Scheme | Source | Notes |
|--------|--------|-------|
| `ws://`, `wss://` | `wsSource(url, id, opts)` | Push pool from deps or default |
| `sse://`, `sses://` | `sseSource(url, id, opts)` | Push pool from deps or default |
| Everything else | `restSource(url, id, opts)` | HTTP/relative URLs, fetchFn from deps |

**Signature alignment:** `restSource` is updated to accept `dataSetId` as its second parameter — `restSource(url, id, options?)` — matching the existing `sseSource` and `wsSource` signatures. This ensures `createSourceFactory` calls all three sources with the same `(url, id, options?)` arity. `restSource` does not use `dataSetId` internally today, but consistent signatures enable future per-dataset features (logging, dedup, metrics) without another signature change.

The `SourceFactoryOptions` fields (`columns`, `dataPath`) map to the corresponding fields on each source's options interface.

`totalPath` is intentionally excluded from `SourceFactoryOptions`. No source factory currently extracts total-row counts from responses. The `DataSourceController` retains its `_totalPath` field for custom factory callbacks that implement extraction independently. Implementing `totalPath` in `restSource` is tracked as #185.

### §2.3 Controller unchanged

`DataSourceController` already implements `sourceFactory` callback injection in `createSourceFromUrl`. No changes needed to the controller itself. Hosts pass `createSourceFactory()` when constructing a controller:

```typescript
import { createSourceFactory } from "@casehubio/pages-data";

const ctrl = new DataSourceController({
  sourceFactory: createSourceFactory(),
});
ctrl.endpoint = "/api/items";       // → restSource
ctrl.endpoint = "sse://host/topic"; // → sseSource
ctrl.endpoint = "ws://host/events"; // → wsSource
```

### §2.4 Export

Export `createSourceFactory` and `SourceFactoryDeps` from `pages-data/src/datasource/index.ts`.

---

## §3 Pipeline Refresh (#134)

Three complementary layers provide data freshness: explicit refresh, periodic polling, and passive staleness detection.

### §3.1 Layer 1 — Fix `refreshDataSet` to re-fetch

#### §3.1.1 Operation split: `refreshDataSet` vs `deliverDataSet`

The pipeline currently has a single `refreshDataSet` method that re-delivers cached data via `pushData`. This spec splits it into two distinct operations on the `DataPipeline` interface:

- **`refreshDataSet(dataSetId)`** — re-fetch from the external source. Called by `pages-action-complete`, `pages-refresh-request`, and Layer 3 stale-while-revalidate.
- **`deliverDataSet(dataSetId)`** — re-deliver cached data from `manager.lookup()` to all subscribers via `pushData`. Called by `onChanged` (preserves current behavior).

The existing `refreshAll()` is renamed to `deliverAll()` for consistency.

**`onChanged` wiring in site.ts** changes from:
```typescript
onChanged: (id, dataset) => {
  contextManager.updateDataset(id, dataset);
  pipeline.refreshDataSet(id);   // old — would cause infinite recursion
},
```
to:
```typescript
onChanged: (id, dataset) => {
  contextManager.updateDataset(id, dataset);
  pipeline.deliverDataSet(id);   // new — re-delivers cached data, no re-fetch
},
```

This breaks the recursion cycle: `refreshDataSet` → source re-fetch → `manager.apply()` → `onChanged` → `deliverDataSet` (pushData only, no re-fetch) → done.

#### §3.1.2 Routing logic

`refreshDataSet(dataSetId)` determines the re-fetch path using the pipeline's internal maps, checked in this order:

1. **Push sources** — if `pushSubscriptions.has(dataSetId)`: skip re-fetch. Push sources deliver updates server-side; the existing subscription remains active.
2. **DataSource path** — if `connectedSources.has(dataSetId)`: disconnect/reconnect the source (§3.1.3).
3. **Parameterised URL path** — if `parameterisedConsumers.has(dataSetId)`: re-trigger via stored callback (§3.1.5).
4. **Legacy ExternalDataSetDef path** — else: resolve def from scope and re-fetch (§3.1.4).

#### §3.1.3 DataSource path re-fetch

For datasets in `connectedSources`:

1. Get the source reference from `connectedSources.get(dataSetId)`
2. Disconnect the source (`source.disconnect()`)
3. Remove from `connectedSources` map (so `connectSource` guard passes)
4. Reconnect via `connectSource(dataSetId, source)` — calls `source.connect(sink)` triggering a fresh fetch
5. The sink feeds fresh data into `manager.apply()`, which triggers `onChanged`
6. `onChanged` calls `deliverDataSet` — re-delivers to all subscribers via `pushData`

This applies uniformly to all `DataSource` types in `connectedSources`, including push-based sources created via `DataSourceBinding`. For pool-based push sources (`sseSource`, `wsSource`), disconnect/reconnect unsubscribes and re-subscribes on the same pool connection — no new network connection is created, and the re-subscription is effectively a no-op that confirms the listener is active.

#### §3.1.4 Legacy ExternalDataSetDef path re-fetch

For datasets resolved via `resolveExternalDataSet` (not in `connectedSources` or `pushSubscriptions` or `parameterisedConsumers`):

1. Find the first registry entry where `entry.originalLookup?.dataSetId === dataSetId` to obtain `pagePath`
2. If no entry found: no-op (dataset has no active subscribers)
3. Resolve the `ExternalDataSetDef` via `resolveDataSetDef(dataSetId, pagePath, scope)`
4. Cancel any in-flight re-fetch for this dataset: abort and replace the `AbortController` in `abortControllers`
5. Look up the stored lookup from `serverQueryLookups` (for server-query datasets) or use the registry entry's `originalLookup`
6. Wrap the resolver context to inject the `AbortSignal` (same pattern as parameterised URL handling)
7. Call `resolveExternalDataSet(def, wrappedCtx, lookup)` — triggers a fresh HTTP request
8. The resolved data flows through `manager.apply()` → `onChanged` → `deliverDataSet`

The `AbortController` per dataset ensures that concurrent manual re-fetches for the same dataset (e.g., two rapid `pages-refresh-request` events, or `pages-action-complete` followed immediately by `pages-refresh-request`) cancel the older in-flight request. The newer request always wins. Periodic `scheduleRefresh` timers are independent — they call `resolveExternalDataSet` directly without an `AbortController` and are unaffected by manual re-fetch cancellation. A periodic refresh completing after a manual refresh applies a snapshot that is at most one refresh interval older — acceptable because the next manual or periodic cycle corrects it.

#### §3.1.5 Parameterised URL path re-fetch

For datasets with template variables in the URL (tracked in `parameterisedConsumers`):

1. A `reFetchCallbacks: Map<DataSetId, () => void>` map is added to the pipeline's internal state
2. When the parameterised URL consumer is created (in `handleDefRequest`), a re-fetch callback is registered that:
   - Aborts any in-flight request via `abortControllers`
   - Resets the consumer's `lastResolvedUrl` to `""` (so the dedup check passes)
   - Re-resolves the template using `contextManager.getContext()`
   - Re-invokes the consumer's `apply(resolvedUrl)` to trigger a fresh fetch
3. `refreshDataSet` calls `reFetchCallbacks.get(dataSetId)?.()`

This reuses the existing consumer infrastructure — the template is re-evaluated against the current context, ensuring the correct resolved URL is used.

### §3.2 Layer 2 — `pages-refresh-request` event

New reserved framework event dispatched by panels to request data refresh.

**Event contract:**
- Name: `pages-refresh-request`
- Bubbles: `true`
- Composed: `true`
- Detail: none required

**Pipeline handler** (in `site.ts`):
```typescript
target.addEventListener("pages-refresh-request", (e: Event) => {
  const componentId = findComponentId(e);
  if (!componentId) return;
  const entry = registry.get(componentId);
  if (!entry?.originalLookup) return;
  pipeline.refreshDataSet(entry.originalLookup.dataSetId);
});
```

The panel dispatches the event from itself. `findComponentId` walks up the DOM to find `[data-component-id]`, the pipeline resolves the dataset from the component registry. The panel does not need to know its dataset ID.

**Protocol update:** Add `pages-refresh-request` to the reserved framework events table in `docs/protocols/casehub/pages-event-contract.md`:

| Event name | Purpose | Dispatched by |
|------------|---------|---------------|
| `pages-refresh-request` | Panel requests data re-fetch from source | Host panels, any component needing fresh data |

### §3.3 Layer 3 — Manager-level TTL with stale-while-revalidate

#### §3.3.1 Manager changes

`DataSetManagerImpl` tracks insertion timestamps:

```typescript
private readonly datasets = new Map<DataSetId, TypedDataSet>();
private readonly timestamps = new Map<DataSetId, number>();
```

On `apply()`, record `Date.now()` in `timestamps`.

New methods on `DataSetManager` interface:

```typescript
age(id: DataSetId): number | undefined;
```

Returns milliseconds since last `apply()` for this dataset, or `undefined` if dataset is not present.

On `remove()`, also delete from `timestamps`.

#### §3.3.2 Pipeline stale-while-revalidate

On `handleDataRequest`, after serving cached data, check staleness:

1. Get the dataset's TTL — use `refreshTime` from the `ExternalDataSetDef` if available, or a default from the DataSourceBinding configuration
2. Call `manager.age(dataSetId)` — if older than TTL, the data is stale
3. If stale **and** `!pendingRefreshes.has(dataSetId)`: data was already served (UI shows immediately), add `dataSetId` to `pendingRefreshes`, trigger async `refreshDataSet(dataSetId)` in the background
4. `pendingRefreshes.delete(dataSetId)` is called when the re-fetch completes — **whether by success or failure**:
   - **Legacy path (§3.1.4):** attach `.finally(() => pendingRefreshes.delete(dataSetId))` to the `resolveExternalDataSet` promise
   - **Parameterised URL path (§3.1.5):** attach `.finally()` to the re-fetch promise inside the consumer callback
   - **DataSource path (§3.1.3):** `refreshDataSet` creates the reconnection with a one-shot flag — `deliverDataSet` clears `pendingRefreshes` on the success path (via `manager.apply` → `onChanged` → `deliverDataSet`), and the sink's `error` callback clears it on failure (since `sink.error()` does not call `manager.apply()`)
5. Fresh data arrives through the normal sink → manager → `onChanged` → `deliverDataSet` path, updating the UI seamlessly

The `pendingRefreshes: Set<DataSetId>` dedup guard ensures at most one background re-fetch per stale dataset, regardless of how many components are bound to it. In a dashboard with 3-5 components on the same dataset, only the first `handleDataRequest` to find staleness triggers a re-fetch — subsequent requests for the same dataset see `pendingRefreshes.has(dataSetId)` and skip. The guard is cleared on both success and failure, ensuring Layer 3 re-arms even after transient network errors.

For **push sources** (SSE/WebSocket): no TTL check — the server pushes updates.

For **DataSource-backed datasets**: `DataSourceBinding` has no TTL field currently. These datasets rely on layers 1-2 (explicit and periodic refresh) only. Adding a TTL hint to `DataSourceBinding` is deferred (#184).

This is stale-while-revalidate: the user sees data immediately, and gets fresh data moments later if the cache was stale. No loading spinners for TTL-triggered refreshes.

#### §3.3.3 Interaction with Layer 1 (`scheduleRefresh`) and `restSource` timers

Three independent refresh mechanisms coexist:

1. **`scheduleRefresh`** (legacy path) — proactive `setInterval` based on `ExternalDataSetDef.refreshTime`. Keeps data fresh regardless of access patterns.
2. **`restSource` internal timer** (DataSource path) — `setInterval` based on `RestSourceOptions.refreshTime`. Same proactive behavior for the DataSourceBinding path.
3. **Layer 3 stale-while-revalidate** (this section) — reactive, lazy staleness check triggered by `handleDataRequest`.

Layer 3 is a **safety net**, not a replacement for proactive refresh:

- **When `scheduleRefresh` is active** (dataset has `refreshTime`): Layer 3 is redundant. The proactive timer keeps data within TTL. Layer 3's staleness check will find fresh data and not trigger a re-fetch. The redundant check is O(1) (a map lookup and timestamp comparison) — harmless.
- **When `scheduleRefresh` is not active** (no `refreshTime`): Layer 3 catches stale data on access. This covers datasets that don't configure polling but still benefit from freshness on request.
- **After prolonged inactivity**: Even with `scheduleRefresh` active, if the browser tab was suspended or the page was hidden, `setInterval` may have been throttled. Layer 3 catches staleness on the first post-resume access.

Layer 3's default TTL for datasets without `refreshTime` is **60 seconds**. This is intentionally conservative — a dataset with no configured refresh probably doesn't change often, and 60s prevents excessive re-fetching on rapid `handleDataRequest` calls.

---

## §4 Scope exclusions

- **Manager-level eviction (dropping entries)** (#181): Stale-while-revalidate re-fetches but keeps the old entry until replaced. True eviction (dropping unreferenced datasets) is a separate concern for memory management, not data freshness.
- **Per-dataset TTL configuration beyond `refreshTime`** (#182): A separate `cacheTtl` option could decouple polling interval from cache freshness. Deferred — `refreshTime` serves both roles for now.
- **DataSourceController pipeline integration** (#183): The controller manages its own DataSource lifecycle independently of the pipeline. Integrating it as a pipeline-managed source is out of scope.
- **`totalPath` implementation in `restSource`** (#185): No source factory currently implements total-row extraction. Deferred until needed.

---

## §5 Test strategy

### §5.1 #148 tests

- `createSourceFactory` returns correct source type for each URL scheme (`ws://`, `wss://`, `sse://`, `sses://`, `http://`, `https://`, relative)
- Factory options (`columns`, `dataPath`) are forwarded to the underlying source
- Custom deps (`wsPool`, `ssePool`, `fetchFn`) are respected
- `DataSourceController` with `createSourceFactory()` delivers data through all three URL scheme routes (integration test)

### §5.2 #134 tests

**Layer 1 — refreshDataSet re-fetch:**
- DataSource path: source `disconnect()` and `connect()` are called on refresh
- Legacy path: `resolveExternalDataSet` is called again (new HTTP request)
- Push sources (in `pushSubscriptions`): refresh is a no-op (no disconnect/reconnect)
- All subscribers receive fresh data after refresh
- `pages-action-complete` handler delivers fresh data (regression test for the stale-data bug)
- **No infinite recursion:** `onChanged` calls `deliverDataSet` (not `refreshDataSet`), verifying the cycle breaks at delivery
- **Concurrent refresh cancellation:** two simultaneous refreshes for the same dataset — the older in-flight request is aborted, only the newer data arrives
- **Parameterised URL refresh:** refresh of a dataset with template variables re-evaluates the template and re-fetches with the current resolved URL
- **Unknown dataset:** `refreshDataSet` called with a `dataSetId` not in any path is a no-op (no error, no crash)
- **Refresh during initial resolution:** `refreshDataSet` called while `pendingResolutions` has an in-flight promise for the same dataset — the pending resolution is not interrupted; the re-fetch runs independently

**Layer 2 — pages-refresh-request:**
- Event dispatched from panel triggers `refreshDataSet` for the correct dataset
- Event dispatched from nested element resolves to correct component via `findComponentId`
- Event dispatched outside a component context is ignored

**Layer 3 — Manager TTL:**
- `manager.age()` returns correct age after `apply()`
- `manager.age()` returns `undefined` for unknown dataset
- `manager.age()` resets after subsequent `apply()`
- `manager.remove()` clears timestamp
- Pipeline serves cached data and triggers background re-fetch when TTL exceeded
- Pipeline does not trigger re-fetch when data is within TTL
- Push sources are exempt from TTL checks
- **Dedup guard:** multiple components bound to the same stale dataset trigger only one background re-fetch (via `pendingRefreshes`)
- **Dedup guard re-arms on failure:** a failed re-fetch (network error, 503) clears `pendingRefreshes`, allowing the next staleness check to trigger a new re-fetch attempt

---

## §6 File manifest

| File | Change |
|------|--------|
| `packages/pages-data/src/datasource/types.ts` | Add `SourceFactory`, `SourceFactoryOptions` |
| `packages/pages-data/src/datasource/sources/source-factory.ts` | New — `createSourceFactory()` |
| `packages/pages-data/src/datasource/sources/source-factory.test.ts` | New — unit tests |
| `packages/pages-data/src/datasource/index.ts` | Export new types and factory |
| `packages/pages-data/src/dataset/manager.ts` | Add `timestamps` map, `age()` method |
| `packages/pages-data/src/dataset/manager.test.ts` | TTL tests |
| `packages/pages-component/src/controller/data-source-controller.ts` | Remove local `SourceFactory`/`SourceFactoryOptions`, import from `pages-data` |
| `packages/pages-component/src/controller/data-source-controller.test.ts` | Add integration tests with `createSourceFactory` |
| `packages/pages-data/src/datasource/sources/rest-source.ts` | Add `dataSetId` parameter to `restSource` signature |
| `packages/pages-data/src/datasource/sources/rest-source.test.ts` | Update tests for new signature |
| `packages/pages-runtime/src/data-pipeline.ts` | Split `refreshDataSet`/`deliverDataSet`, add routing logic, add `reFetchCallbacks`, add AbortController cancellation, add stale-while-revalidate |
| `packages/pages-runtime/src/data-pipeline.test.ts` | Refresh + TTL + edge case tests |
| `packages/pages-runtime/src/site.ts` | Change `onChanged` to call `deliverDataSet`, add `pages-refresh-request` listener |
| `docs/protocols/casehub/pages-event-contract.md` | Add `pages-refresh-request` to reserved events |
