# Server-Query Push-Down — Frontend Integration Design

## Context

The casehub-pages backend data module (issue #21, branch `issue-21-data-module-backend`) implements two REST endpoints:

- `POST /api/dataset/fetch` — relay proxy: forwards HTTP requests through the backend with SSRF protection
- `POST /api/dataset/query` — SQL push-down: accepts a `DataSetLookup` (dataSetId + filter/group/sort operations), resolves to a named SQL query, applies operations in SQL, returns `DataSetResult`

The relay path already works end-to-end — the frontend's `ServerRelayProvider` POSTs `DataRequest` to the backend. But the SQL push-down path has no frontend caller. Without frontend integration, the `/api/dataset/query` endpoint is dead code.

This spec adds the frontend integration for SQL push-down.

### Scope within issue #21

This spec partially addresses issue #21 ("Optional Quarkus backend MVP"). It covers only the SQL push-down query integration — wiring the `/api/dataset/query` endpoint to the frontend data pipeline.

Issue #21 has broader scope including:
- `/api/capabilities` endpoint — not addressed here
- Dashboard CRUD persistence — not addressed here
- Additional REST endpoints beyond dataset query — not addressed here

These remaining requirements should be tracked as separate sub-issues under #21.

## Design

### New source type: `serverQuery`

`ExternalDataSetDef` gains `serverQuery?: boolean` as a fourth source type alongside `url`, `content`, `join`. When `serverQuery: true`, the dataset's `uuid` maps to a registered SQL query on the backend (configured via `casehub.pages.data.sql.queries.<uuid>.*`). No URL, content, or join is needed.

Schema validation updated:
- Exactly one of `url`, `content`, `join`, or `serverQuery` required.
- When `serverQuery` is set, extraction-related fields (`dataPath`, `type`, `expression`, `accumulate`) must be undefined — the backend returns structured `DataSetResult`, not raw text/JSON needing extraction. Same principle as the existing `join` restriction.
- The `refreshTime` refinement gains a third disjunct: `|| d.serverQuery === true`. Server-query datasets support refresh by re-sending the full `DataSetLookup` to the backend.

### Config block

`DataProviderConfig` gains a `serverQuery` block:

```typescript
readonly serverQuery?: {
  readonly endpoint: string;       // e.g., "/api/dataset/query"
  readonly tokenFn?: () => string | null;  // JWT retrieval callback
};
```

The `tokenFn` follows the established pattern from `createRestLayoutStore` — reads from `sessionStorage` via `createDevAuthTokenFn()`.

### ServerQueryClient

New file: `pages-data/src/dataset/external/providers/server-query.ts`

Thin HTTP client that POSTs `DataSetLookup` to the query endpoint and returns a `TypedDataSet`:

- Adds `Authorization: Bearer <token>` header via `tokenFn`
- On 401, dispatches `pages-auth-expired` CustomEvent (same as rest-layout-store)
- Maps backend response: `{ columns: ColumnDef[], rows: string[][] }` → `DataSet { columns, data }` → `TypedDataSet` via existing `toTypedDataSet()`

This is NOT a `DataProvider` implementation — the push-down query has a different contract (sends `DataSetLookup` with operations, not `DataRequest` with URL).

### Wire format mapping

Backend `DataSetResult`:
```
{ columns: [{ id, name, type }], rows: [[string]] }
```

Frontend `DataSet`:
```
{ columns: [{ id, name, type }], data: [[(string | null)]] }
```

The client maps `rows` → `data`. Column types already match (`NUMBER`, `DATE`, `TEXT`, `LABEL`).

### Resolver routing

`resolveExternalDataSet` gains an optional `lookup?: DataSetLookup` parameter and adds a `serverQuery` route as an early return **before** `validate()` and `determineSource()`:

1. Checks `def.serverQuery === true` and `ctx.providerConfig.serverQuery` exists — if so, enters the server-query path
2. Creates `ServerQueryClient` from config
3. Uses the `lookup` parameter directly (contains `dataSetId` + YAML-defined operations)
4. Calls `client.query(lookup)`
5. Stores result as snapshot in manager via `manager.apply(def.uuid, { type: "snapshot", dataset })`
6. Returns `{ dataset, inferredColumns: false, source: "serverQuery" }`

If `def.serverQuery === true` but `ctx.providerConfig.serverQuery` is undefined (host didn't configure the serverQuery block), an explicit guard throws before falling through to `validate()`:
```typescript
if (def.serverQuery) {
  throw new DataSetError("CONFIG_MISSING",
    `Dataset "${def.uuid}" uses serverQuery but no serverQuery config is provided`);
}
```
Without this guard, control falls through to `validate()` which throws a misleading error about needing url/content/join — the real problem is a missing config block in `loadSite()`, not a missing source type.

The early-return design is intentional: `validate()` enforces exactly-one-of `url/content/join` which doesn't apply to `serverQuery`. `determineSource()` returns a union that feeds into provider/extraction logic irrelevant to server-query. The server-query path bypasses both — it doesn't need `buildRequest()`, `provider.fetch()`, or `extractDataSet()`.

For all other source types (url, content, join), the `lookup` parameter is unused and the existing code path is unmodified.

**Call site change:** The data pipeline's resolution call (data-pipeline.ts:505) must pass the lookup:
```typescript
pending = resolveExternalDataSet(def, resolverCtx, lookup);
```

The `.then()` callback continues to ignore the `ResolveResult` — the result is already stored in the manager by the resolver.

### Data pipeline — operation separation

The key subtlety: for server-query datasets, YAML-defined operations were already applied by SQL. Only runtime interactive ops (cross-filters, sort state, text filter) should apply client-side.

The separation already exists in the code:
- `lookup.operations` = YAML-defined ops (from component definition)
- `filterState` = runtime interactive cross-filter ops
- `componentViewState` = runtime sort/page state

**Tracking Set population:** The data pipeline tracks server-query datasets in a `Set<DataSetId>`. The Set is populated by checking `def.serverQuery === true` at the resolution call site, before resolution begins. This is consistent with how the pipeline already uses `def.url` to determine push sources — the definition is the source of truth, not the resolution result.

**One-operations-set-per-dataSetId constraint:** The data pipeline deduplicates resolution by `dataSetId` — if a resolution is already pending for a given ID, subsequent requests reuse the pending promise. For URL/content datasets this is correct: the same ID resolves to the same raw data, and each component applies its own operations client-side. For server-query datasets, operations are applied server-side during resolution, so the first component's lookup wins. This means all components referencing the same server-query `dataSetId` must share the same YAML operations. In practice this is natural: the backend maps each UUID to a specific registered SQL query, so different aggregations should use different query UUIDs (different `dataSetId` values).

**Expandable bypass:** `pushData` has an early-return path for expandable components (data-pipeline.ts:198-211) that bypasses all operation logic and calls `manager.lookup(lookup, options)` with the original lookup. For server-query datasets, this re-applies YAML operations on data already processed server-side — producing wrong results for non-idempotent aggregates (e.g., COUNT becomes 1, AVG becomes average-of-averages). The expandable bypass must use an empty-operations lookup for server-query datasets:
```typescript
if (expandable) {
  const effectiveLookup = serverQueryDatasets.has(lookup.dataSetId)
    ? { ...lookup, operations: [] }
    : lookup;
  const result = manager.lookup(effectiveLookup, options);
  // ...
}
```

**Standard path — change in `pushData`:** When the dataset is in the server-query Set, **both** branches of the sort logic must be conditioned:

1. **Initial assignment** (line 232): base `sortOps` starts from `[]` instead of `lookup.operations.filter(op => op.type !== "sort")` — all YAML ops are excluded, not just sort ops.
2. **Else branch** (line 239): when no user sort is active, `sortOps` stays `[]` instead of being reassigned to `lookup.operations`. Without this, the else branch restores all YAML ops including filter and group that were already applied server-side.

Runtime cross-filters and user sort still get added on top of the empty base.

Example flow for a server-query dataset with `GROUP BY region, SUM(revenue)`:
1. Backend executes SQL with grouping/aggregation → returns 50 rows
2. Manager stores the 50-row snapshot
3. User clicks a cross-filter → `pushData` applies only that filter client-side on the 50 rows
4. User sorts a column → applied client-side on the 50 rows

### Data pipeline — refresh for server-query datasets

On `refreshTime` interval, the pipeline re-sends the full `DataSetLookup` to the server and re-stores the result. Runtime ops re-apply on the fresh data.

**Implementation:** `scheduleRefresh` gains a third path for server-query datasets, before the existing content/expression/accumulate and URL paths:

1. When `def.serverQuery === true`, scheduleRefresh stores the initial lookup (from the resolution call) in a `Map<DataSetId, DataSetLookup>` alongside the refresh timer.
2. On each interval tick, it calls `resolveExternalDataSet(def, resolverCtx, storedLookup)` — replaying the full lookup with YAML-defined operations to the backend.
3. After resolution, it re-pushes all subscribing components (same pattern as the existing URL refresh path).

This stored-lookup approach avoids the need for `scheduleRefresh` to reconstruct the lookup from component state — the initial lookup is the authoritative set of YAML operations.

### Auth wiring

`loadSite()` in `site.ts` wires the `serverQuery` config block with `tokenFn` from `createDevAuthTokenFn()` — the same function that provides tokens for the layout store. The `pages-auth-expired` event triggers the dev-auth gate's login overlay.

### PLATFORM.md update

Update the casehub-pages capability entry: `data` is no longer a scaffold. Describe the actual modules: `data` (DataProvider SPI + REST relay/query + @DefaultBean no-op) and `data-sql` (SQL provider via Quarkus Agroal named datasources, push-down filter/group/sort).

## Files

| Layer | File | Change |
|-------|------|--------|
| `pages-data` types | `src/dataset/external/types.ts` | Add `serverQuery` to `ExternalDataSetDef` and `DataProviderConfig`; add `"serverQuery"` to `ResolveResult.source` union |
| `pages-data` schema | `src/dataset/external/schema.ts` | Validation: one of url/content/join/serverQuery; block extraction fields for serverQuery; add refreshTime disjunct |
| `pages-data` client | `src/dataset/external/providers/server-query.ts` | **New** — ServerQueryClient |
| `pages-data` resolver | `src/dataset/external/resolver.ts` | Add `lookup?` parameter; add serverQuery early-return route before validate/determineSource |
| `pages-data` exports | `src/dataset/external/index.ts` | Export ServerQueryClient |
| `pages-runtime` pipeline | `src/data-pipeline.ts` | Track server-query Set, pass lookup to resolver, strip YAML ops in both pushData branches, add scheduleRefresh server-query path with stored lookup |
| `pages-runtime` site | `src/site.ts` | Wire serverQuery config with tokenFn |
| PLATFORM.md | `casehub-parent/docs/PLATFORM.md` | Update data module description |

## Tests

| Test | Type | Verifies |
|------|------|----------|
| `ServerQueryClient` | Unit (vitest) | POST with auth, 401 handling, response mapping |
| Resolver serverQuery route | Unit (vitest) | Routing, lookup forwarding, snapshot storage |
| Schema validation | Unit (vitest) | serverQuery as valid fourth source type |
| Data pipeline ops separation | Unit (vitest) | YAML ops skipped for server-query datasets, runtime ops applied |

## Known gaps (not addressed in this spec)

- **ServerRelayProvider auth (#96):** The existing `ServerRelayProvider` sends no auth headers despite `DataResource` being `@Authenticated`. Both relay (`/api/dataset/fetch`) and query (`/api/dataset/query`) endpoints require JWT auth. The new `ServerQueryClient` correctly uses `tokenFn`, but the relay provider predates this pattern. This is a pre-existing bug in the relay path — it works in dev mode (Quarkus dev services bypass security) but would fail in production. Tracked as issue #96; fix requires changes to the provider factory pattern.

## Not in scope

- Named datasource selection (backend MVP uses default datasource only)
- Server-side pagination (backend returns all matching rows; client paginates)
- Hybrid push-down (some ops server-side, some client-side based on capability)
- ServerRelayProvider auth fix (pre-existing gap, separate issue)
