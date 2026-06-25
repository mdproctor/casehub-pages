# View State Persistence (URL-Based)

Issue: casehubio/casehub-pages#24

## Problem

The runtime has a split personality on state management. Navigation and filters are centralized — the runtime owns the state, components are stateless emitters, URL serialization reads from a single source of truth. Sort and pagination are the opposite — scattered across component instances as private fields, invisible to the runtime, lost on page reload.

| State | Owner | Keyed by | URL-persisted | Survives reload |
|-------|-------|----------|---------------|-----------------|
| Navigation | Runtime (ActiveSlots) | container ID | Yes (page path) | Yes |
| Filters | Runtime (FilterState) | page path + group + column | Yes (?filter=) | Yes |
| Sort | Component (_sortColumn) | private field | No | No |
| Pagination | Component (_currentPage) | private field | No | No |

Additionally, the existing URL restoration has a race condition: components render and receive data with empty filter state, then filters are populated from the URL — too late for components on the default page.

The `DeepLink` and `ViewState` types have unused speculative fields (`parameters`, `drillDown`, `expandedNodes`, `layoutOverrides`, `collapsedPanels`, `scrollPositions`) that were never wired.

## Approach

Centralize sort and pagination into a single `ComponentViewState` map following the same pattern as the existing `FilterState`. Filters stay separate (page-scoped). Navigation stays separate (tree-derived). The data pipeline becomes the single place where all state (filters + sort + pagination) is applied. Components become stateless renderers for sort/pagination. Clean up unused type fields.

## 1. State Model

### Current State Containers

```
ActiveSlots:  Map<containerId, slotName>                           — navigation
FilterState:  Map<pagePath, Map<group, Map<col, values>>>          — filters
_sortColumn / _sortOrder / _currentPage                            — component private fields
```

### Proposed State Containers

```
ActiveSlots:  Map<containerId, slotName>                           — unchanged
FilterState:  Map<pagePath, Map<group, Map<col, values>>>          — unchanged
ComponentViewState:  Map<componentId, ComponentState>               — NEW
```

```typescript
import type { SortColumn } from "@casehubio/pages-data/dist/dataset/sort.js";

interface ComponentState {
  readonly sort?: SortColumn;
  readonly page?: number;
}

type ComponentViewState = Map<string, ComponentState>;
```

Sort uses `SortColumn` from `@casehubio/pages-data` (`{ readonly columnId: ColumnId; readonly order: SortOrder }`) rather than defining a duplicate type. The `ColumnId` branded type requires a cast at the URL parsing boundary (`as ColumnId`) — consistent with how the codebase already handles string-to-ColumnId conversions in `cross-filter.ts` and `site.ts`.

Sort and pagination are co-located because both are per-component, follow the same lifecycle, and are always managed together (sort change resets page).

`ComponentState` fields are `readonly` — updates via map replacement (`state.set(id, { ...existing, sort })`) rather than mutation.

### URL Persistence Rule

Only components with user-set IDs (via `withId()`) get their state serialized to URL. Components without explicit IDs still get centralized state (sort/pagination works within the session), but the state is ephemeral — lost on reload. This makes URL persistence opt-in and keeps auto-generated IDs out of URLs.

### Component ID Uniqueness Constraint

`ComponentViewState` is a flat `Map<componentId, ComponentState>` — not page-scoped. If two pages both use `withId("data-table", table(...))`, they share the same state entry. Sorting `data-table` on page A applies that sort when `data-table` on page B renders.

This is consistent with the existing `ComponentRegistry` which is also a flat `Map<string, ComponentEntry>` — duplicate IDs already collide in the registry regardless of this change. The constraint: **callers of `withId()` must use globally unique IDs.** Since `withId()` is an explicit, deliberate API, this is a reasonable assumption to document rather than a problem to engineer around.

### Factory and Helpers

```typescript
function createComponentViewState(): ComponentViewState;
function updateSort(state: ComponentViewState, componentId: string, sort: SortColumn | undefined): void;
function updatePage(state: ComponentViewState, componentId: string, page: number | undefined): void;
function getComponentState(state: ComponentViewState, componentId: string): ComponentState | undefined;
```

New module: `packages/pages-runtime/src/component-view-state.ts`

## 2. Type Changes

### DeepLink (packages/pages-ui/src/model/page-types.ts)

```typescript
import type { SortOrder } from "@casehubio/pages-data/dist/dataset/sort.js";

// BEFORE
interface DeepLink {
  readonly page: string;
  readonly parameters?: Readonly<Record<string, string>>;           // REMOVE
  readonly filters?: Readonly<Record<string, readonly string[]>>;
  readonly drillDown?: readonly DrillDownStep[];                     // REMOVE
  readonly sort?: { readonly column: string; readonly order: "ASC" | "DESC" };  // REDESIGN
}

// AFTER
interface DeepLink {
  readonly page: string;
  readonly filters?: Readonly<Record<string, readonly string[]>>;
  readonly sort?: Readonly<Record<string, { readonly columnId: string; readonly order: SortOrder }>>;
  readonly pagination?: Readonly<Record<string, number>>;
}
```

- `parameters`, `drillDown` removed (unused, speculative)
- `DrillDownStep` and `LayoutOverride` types removed
- `sort` redesigned: keyed by component ID, uses `columnId` (matching codebase convention — `CasehubFilterDetail.columnId`, `SortColumn.columnId`, filter expressions) and `SortOrder` type from pages-data
- `pagination` added: keyed by component ID
- `DeepLink.sort` uses plain `string` for `columnId` (not branded `ColumnId`) because DeepLink is a URL-boundary type — consistent with how `DeepLink.filters` uses plain strings. Branding applied via `as ColumnId` cast during `restoreFromUrl`.

### ViewState (same file)

```typescript
// BEFORE
interface ViewState {
  readonly currentPage?: string;
  readonly expandedNodes?: readonly string[];           // REMOVE
  readonly activeFilters?: Readonly<Record<string, readonly string[]>>;
  readonly drillDownPath?: readonly DrillDownStep[];     // REMOVE
  readonly layoutOverrides?: readonly LayoutOverride[];  // REMOVE
  readonly collapsedPanels?: readonly string[];           // REMOVE
  readonly scrollPositions?: Readonly<Record<string, number>>;  // REMOVE
}

// AFTER
interface ViewState {
  readonly currentPage: string;
  readonly activeFilters: Readonly<Record<string, readonly string[]>>;
  readonly sort: Readonly<Record<string, { readonly columnId: string; readonly order: SortOrder }>>;
  readonly pagination: Readonly<Record<string, number>>;
}
```

All fields non-optional — `ViewState` is a live snapshot backed by getters. Returns `""`, `{}`, etc. — not `undefined`.

### VizTarget (packages/pages-runtime/src/data-pipeline.ts)

```typescript
import type { SortColumn } from "@casehubio/pages-data/dist/dataset/sort.js";

// AFTER
interface VizTarget {
  dataSet: unknown;
  totalRows: number;
  theme: string;
  error: string;
  activeSort?: SortColumn;
  activePage?: number;
}
```

- `activeSort` uses `SortColumn` from pages-data (no duplicate type)
- `activePage` (not `currentPage`) avoids naming collision with the navigation concept where `currentPage: string` is the active page path. Matches `activeSort` naming pattern.

Pipeline sets `activeSort` and `activePage` from `ComponentViewState` when pushing data. Tables read them for rendering sort indicators and pagination controls. Other components ignore them.

### ComponentEntry (packages/pages-runtime/src/registry.ts)

```typescript
// AFTER
interface ComponentEntry {
  readonly element: HTMLElement;
  readonly vizElement?: CasehubElement<VizComponentProps>;
  readonly component: Component;
  readonly pagePath: string;
  readonly originalLookup?: DataSetLookup;
  readonly hasExplicitId: boolean;   // NEW — gates URL serialization
}
```

## 3. URL Format

### Current

```
#/page/Sales/Revenue?filter=region:North|South,year:2024
```

### Proposed

```
#/page/Sales/Revenue?filter=region:North|South,year:2024&sort=sales-table:Revenue:DESCENDING&page=sales-table:3
```

Three query parameters:

| Param | Encoding | Example |
|-------|----------|---------|
| `filter` | `col:val\|val,col2:val` | `filter=region:North\|South` |
| `sort` | `id:col:order,id2:col:order` | `sort=sales-table:Revenue:DESCENDING` |
| `page` | `id:num,id2:num` | `page=sales-table:3` |

All use `:` as field separator, `,` as entry separator. All values `encodeURIComponent`'d (encodes `:` → `%3A`, `,` → `%2C`, `|` → `%7C` — structural separators never ambiguous).

Omission rules:
- `filter` omitted when no active filters (unchanged)
- `sort` omitted when no components with explicit IDs have sort state
- `page` omitted when no components with explicit IDs have non-zero page state (page 0 = default)
- `?` omitted when all three params absent

Malformed entries are skipped (not errors) — self-healing.

Old URLs without `sort` or `page` parse correctly — fields absent in `DeepLink`.

## 4. State Lifecycle

### Initialization (page load with URL)

```
1. Parse URL → DeepLink
2. Populate FilterState from DeepLink.filters, keyed by deepLink.page
3. Populate ComponentViewState from DeepLink.sort + DeepLink.pagination
4. Set up event listeners
5. Render component tree → components request data
   → pipeline applies all state → correct data on first push
6. Navigate to page path (DOM slot activation, sets currentPage)
7. syncUrl("replaceState") — canonicalize
```

State is populated BEFORE rendering (steps 2-3). This fixes the existing race condition where components received unfiltered data because filters were populated after rendering.

### Navigation: Internal vs Public

Navigation is split into two functions to prevent history corruption:

```typescript
// Internal: DOM activation + state only — no URL push
function navigateInternal(path: string): void {
  _navigating = true;
  const segments = path.split("/").filter(Boolean);
  currentPage = walkNavigate(root, segments, target, lazyPageResolutions);
  _navigating = false;
}

// Public API: DOM activation + state + URL push
navigate(path: string): void {
  navigateInternal(path);
  syncUrl("pushState");
}
```

The `popstate` handler calls `navigateInternal()` directly — during back/forward the URL is already correct, so pushing a new entry would break the history stack (forward navigation stops working). This also fixes a pre-existing bug in the current code where `site.navigate()` called from the popstate handler pushes a duplicate history entry.

### State Change Rules

| Trigger | Updates | Resets page to 0? | URL method | Re-push scope |
|---------|---------|-------------------|------------|---------------|
| Filter change | FilterState | Yes, affected components | replaceState | Same-page listeners |
| Sort change | ComponentViewState.sort | Yes, same component | replaceState | Same component |
| Page change | ComponentViewState.page | No | replaceState | Same component |
| Nav/tab click | ActiveSlots, currentPage | No | pushState | None |
| Programmatic nav | ActiveSlots, currentPage | No | pushState (via navigate) | None |
| popstate | All (full replace from URL) | N/A (from URL) | N/A (URL drove the change) | All registered |
| Data refresh | None (state preserved) | Clamp if needed | No | Dataset's components |
| Record selection | FilterState (child scope) | Yes, child components | replaceState | Child scope |

### Pagination Reset Rules

- **Filter change → page resets to 0** for affected components. Prevents "page 5 of 3" when filtered data is smaller.
- **Sort change → page resets to 0** for the sorted component. Maintains current behavior (sort changes row order, so page N is now different data).
- **Data refresh → clamp only.** If total rows decreased past current page, clamp to last valid page. Don't reset to 0 — user's position should be preserved during refresh.

### Browser Back/Forward (popstate)

```typescript
window.addEventListener("popstate", () => {
  const link = parseFromUrl(location.hash);

  // DOM navigation only — no URL push (URL is already correct)
  if (link.page !== currentPage) {
    navigateInternal(link.page);
  }

  // Full state replacement — not additive merge
  clearPageFilters(filterState, currentPage);
  componentViewState.clear();
  restoreFromUrl(location.hash, filterState, componentViewState);

  // Re-push all registered components
  for (const [id, entry] of registry) {
    if (entry.vizElement && entry.originalLookup) {
      pipeline.handleDataRequest(entry.vizElement, entry.originalLookup, id);
    }
  }
}, { signal: abortController.signal });
```

`clearPageFilters` clears filter state for the current page before restoration:

```typescript
// In cross-filter.ts
function clearPageFilters(filterState: FilterState, pagePath: string): void {
  const pageFilters = filterState.get(pagePath);
  if (pageFilters) {
    for (const [, columnMap] of pageFilters) columnMap.clear();
  }
}
```

### Single URL Serialization Path

All URL updates go through `syncUrl()`. The public `navigate()` method calls `navigateInternal()` then `syncUrl("pushState")`. No inline URL construction, no duplication, no divergence.

## 5. Pipeline Changes

### Extended `pushData`

The pipeline becomes the single place where all state is applied:

```
1. Collect filter ops (existing logic)
2. Collect sort ops from ComponentViewState — replaces any original sort in lookup
3. Build effective lookup: [...filterOps, ...originalOps (sans sort), ...sortOps]
4. Compute pagination from ComponentViewState + component's pageSize prop
5. Execute manager.lookup(effectiveLookup, paginationOptions)
6. Push to component: activeSort, activePage, totalRows BEFORE dataSet (dataSet setter triggers render)
```

Sort ops from centralized state REPLACE (not stack alongside) any default sort in the component's original lookup. If no centralized sort exists, the original lookup's sort is preserved.

**Stale sort column:** If the sort column in `ComponentViewState` no longer exists in the dataset (schema changed, data refresh), the data engine's `sort-eval.ts` silently skips unknown columns and returns unsorted data. The `ComponentViewState` entry is preserved — the sort indicator disappears (column not found in headers), the URL retains the stale sort param, and if the column reappears (e.g., data refresh restores it) the sort auto-applies. No column-existence checking in `pushData` — the data engine's graceful degradation handles it.

Pagination clamping: single lookup with pagination. If result has 0 rows but `totalRows > 0` and page > 0, clamp to last valid page and retry. Single-lookup in the common case.

### Offset Alignment Assumption

The `casehub-page` handler converts `{ offset, count }` to a page index via `Math.floor(offset / count)`. This assumes `offset` is always aligned to `count` (i.e., `offset % count === 0`). The table's `goToPage` always produces aligned values (`page * pageSize`). The handler asserts alignment: if `offset % count !== 0`, log a warning and round down. This prevents silent wrong-page bugs if a future emitter sends unaligned offsets.

### Pipeline Dependency

`createDataPipeline` receives `componentViewState` as an additional parameter.

### Event Handlers Simplified

The `casehub-sort`, `casehub-page`, and `casehub-filter` handlers in `site.ts` become thin state updaters:

```
casehub-sort:   updateSort → reset page to 0 → re-push via pipeline → syncUrl
casehub-page:   derive page from offset/count → updatePage → re-push via pipeline → syncUrl
casehub-filter: updateFilter → reset page to 0 for affected components → re-push via pipeline → syncUrl
```

The filter handler's existing re-push loop iterates affected components (same-page listeners passing the listening/group/selfApply checks). The pagination reset is inserted inside this loop — `updatePage(componentViewState, id, 0)` before each `pipeline.handleDataRequest()` call. Same for child dataScope page re-pushes. Without this, a table on page 3 would receive page 3 of the now-filtered (smaller) dataset — the clamping safety net catches the worst case, but the correct first response is always reset to page 0.

The existing `casehub-sort` and `casehub-page` handlers (25+ lines each of lookup construction, filter merging, and direct data push) collapse to ~8 lines each. The filter handler retains its existing structure (record-selection vs cross-filter branching, same-page and child-scope re-push loops) but the data push within each loop simplifies to `pipeline.handleDataRequest()` preceded by a pagination reset.

## 6. Component Changes

### CasehubTable — Stateless for Sort/Pagination

**Removed private fields:**
- `_currentPage` → reads from `VizTarget.activePage`
- `_sortColumn` / `_sortOrder` → reads from `VizTarget.activeSort`
- `_lastDataSet` → only use was pagination reset on dataset change, now handled by centralized state reset rules

**Removed methods:**
- `getSortedRows()` → pipeline sorts via `manager.lookup()`
- `isServerSide()` → distinction no longer needed at component level

**Removed forks:**
- `handleSort()`: no `if (serverSide)` — always emits `casehub-sort`
- `goToPage()`: no `if (serverSide)` — always emits `casehub-page`

**Kept private fields** (presentation-only, not URL-persisted):
- `_filterText` — client-side text filter (ephemeral, high-frequency)
- `_selectedColumnId` / `_selectedValue` — cross-filter visual highlight

**Text filter regression (known limitation):** With pipeline pre-pagination, `_filterText` / `getFilteredRows()` searches only the current page's rows, not all rows. Previously the table had all data and filtered → paginated locally. This is an accepted tradeoff of pipeline centralization. Follow-up: #31 migrates text filtering to the pipeline as a first-class operation.

**Sort toggle logic:**
```typescript
private handleSort(columnId: ColumnId): void {
  let order: SortOrder = "ASCENDING";
  if (this.activeSort?.columnId === columnId) {
    order = this.activeSort.order === "ASCENDING" ? "DESCENDING" : "ASCENDING";
  }
  this.dispatchEvent(new CustomEvent("casehub-sort", {
    bubbles: true, composed: true,
    detail: { columnId, order },
  }));
}
```

Reads from `this.activeSort` (last push from pipeline). No private state. The runtime handles the rest.

**Pagination:**
```typescript
private goToPage(page: number, pageSize: number): void {
  this.dispatchEvent(new CustomEvent("casehub-page", {
    bubbles: true, composed: true,
    detail: { offset: page * pageSize, count: pageSize },
  }));
}
```

No `_currentPage` update. No `rerender()`. Pipeline re-pushes via `set dataSet()`.

**Client-side sort/pagination removal:** The table no longer slices or sorts data locally. All rows received from the pipeline are the correct page in the correct order. The render method simplifies — `displayRows = dataset.rows`.

**CasehubElement base class changes:**

`activeSort` and `activePage` are added as simple properties (getter/setter with private backing field). Unlike `dataSet` and `totalRows`, their setters do NOT call `update()` — they are metadata read during the render triggered by `set dataSet()`. The pipeline sets them BEFORE setting `dataSet` so they are available when `render()` executes.

**Net effect:** ~440 lines → ~330 lines. Zero state management for sort/pagination.

## 7. syncUrl and State Restoration

### syncUrl

```typescript
function syncUrl(method: "pushState" | "replaceState"): void {
  if (typeof history === "undefined") return;

  const filters = deriveActiveFilters(filterState, currentPage);
  const sort = deriveUrlSort(componentViewState, registry);
  const pagination = deriveUrlPagination(componentViewState, registry);

  const link: DeepLink = {
    page: currentPage,
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
    ...(Object.keys(sort).length > 0 ? { sort } : {}),
    ...(Object.keys(pagination).length > 0 ? { pagination } : {}),
  };

  history[method](null, "", serializeToUrl(link));
}
```

`deriveUrlSort` and `deriveUrlPagination` iterate `ComponentViewState`, filtering to entries where `registry.get(id)?.hasExplicitId === true`. This auto-cleans orphaned state (component removed from registry → state not serialized).

### restoreFromUrl

```typescript
function restoreFromUrl(
  hash: string,
  filterState: FilterState,
  componentViewState: ComponentViewState,
): DeepLink {
  const link = parseFromUrl(hash);
  if (link.filters) {
    for (const [col, values] of Object.entries(link.filters)) {
      updateFilter(filterState, link.page, undefined, col, [...values], false);
    }
  }
  if (link.sort) {
    for (const [id, s] of Object.entries(link.sort)) {
      updateSort(componentViewState, id, {
        columnId: s.columnId as ColumnId,
        order: s.order,
      });
    }
  }
  if (link.pagination) {
    for (const [id, page] of Object.entries(link.pagination)) {
      updatePage(componentViewState, id, page);
    }
  }
  return link;
}
```

### ViewState Live Snapshot

```typescript
const state: ViewState = Object.defineProperties({} as ViewState, {
  currentPage: { get: () => currentPage, enumerable: true },
  activeFilters: { get: () => deriveActiveFilters(filterState, currentPage), enumerable: true },
  sort: { get: () => deriveUrlSort(componentViewState, registry), enumerable: true },
  pagination: { get: () => deriveUrlPagination(componentViewState, registry), enumerable: true },
});
```

Same derivation functions as `syncUrl` — always consistent, no drift.

## 8. Explicit ID Detection

### Prerequisite: Grid Auto-ID Removal

The `hasExplicitId = component.id !== undefined` detection **depends on** grid items NOT having auto-assigned IDs. The grid builder change (below) MUST be implemented before the `hasExplicitId` logic is wired. Without it, grid items would incorrectly have `hasExplicitId = true`.

### Grid Builder Change

The grid builder currently auto-assigns IDs to items via `component.id`:

```typescript
// CURRENT — sets component.id for auto-generated IDs
const id = `${gridId}_${String(x)}_${String(y)}`;
return { ...item, component: { ...item.component, id } };
```

This makes `component.id !== undefined` unreliable as a user-intent signal. The renderer already has a fallback (`generateId()`) for components without IDs.

```typescript
// PROPOSED — remove auto-ID assignment
return freeze({
  type: "grid" as const,
  id: gridId,
  props,
  items,  // items use renderer-generated IDs via generateId()
});
```

### Detection in Activation Callback

```typescript
const hasExplicitId = component.id !== undefined;

const entry = {
  element: el,
  vizElement: vizEl,
  component,
  pagePath,
  hasExplicitId,
  ...(lookup !== undefined && { originalLookup: lookup }),
};
registry.set(componentId, entry);
```

`component.id !== undefined` → user called `withId()` → URL persistence enabled.

## 9. Testing Strategy

### Unit/Integration Tests (Vitest + JSDOM)

#### A. URL Round-Trip (url.test.ts)

All 8 combinations of present/absent state dimensions (page, filters, sort, pagination). Each with single component, multiple components, special characters. Plus backwards compatibility and malformed input.

#### B. ComponentViewState (component-view-state.test.ts — new)

Create, update sort, update page, get, overwrite, clear.

#### C. Pipeline Integration (data-pipeline.test.ts)

Sort applied, pagination applied, sort + filter combined, sort replaces original lookup sort, no centralized sort preserves original, pagination clamping, VizTarget metadata set on push (`activeSort`, `activePage`).

#### D. State Lifecycle — Flat Page (site.test.ts)

Table with explicit ID on a single page. Load with sort/pagination in URL, click sort, click page, apply filter, verify pagination resets, verify sort preserved across filter changes, toggle sort semantics, all three state dimensions coexisting.

**Race condition verification:** Assert that the first data push to a component arrives WITH the correct state (sorted, filtered, paginated). Verify pipeline `handleDataRequest` is called once per component during initial render — not twice (once wrong, once corrected). This nails the initialization reorder fix.

#### E. State Lifecycle — 2-Level Nesting

```
tabs → [Overview (table + selector), Detail → tabs → [Revenue (table), Cost (table)]]
```

Load URL with deep page path + sort, sort on inactive tab, navigate between tabs preserving state, back button restoring deep state, filters scoped to correct page, independent sort per table.

#### F. State Lifecycle — 3-Level Nesting

```
tabs → L1 → tabs → L2 → tabs → L3 (table)
```

Load URL with 3-level path + sort, sort deep table and verify full path in URL, navigate away and back.

#### G. Linked Components — Cross-Filter + Sort

Emitter (selector/chart) and listener (table with sort/pagination) on same page. Sort then filter, filter then sort, sort + filter + paginate then clear filter, toggle filter off, filter group isolation vs match.

#### H. Linked Components — Record Selection + Sort

Master table → detail form with dataScope. Select record with sort on detail table, change record preserving sort, navigate away and back.

#### I. Multiple Tables Same Page

Two tables with explicit IDs on same page. Independent sort, independent pagination, filter affects both (shared group), filter affects one (different groups), URL contains both tables' state.

#### J. Explicit ID Gating

Table with `withId` vs without, grid item with vs without. Verify URL includes only explicitly ID'd components.

**ID collision across pages:** Two pages both use `withId("data-table", table(...))`. Verify that sorting `data-table` on page A stores state under the shared key, and when page B's `data-table` renders it receives that sort state. This documents the (potentially surprising but consistent) flat-map behavior, so violations of the uniqueness assumption are predictable.

#### K. popstate (Back/Forward)

Navigate + back restores state, sort + navigate + back, two levels of back, sort on page A + navigate to B + sort on B + back. Verify `navigateInternal` is used (no duplicate history entries — forward navigation works after back).

#### L. Edge Cases

Pagination clamp on filter, data refresh preserving state, dispose cleanup, empty dataset + sort/pagination, component ID with special characters, unaligned offset warning (offset % count !== 0).

**Stale sort column:** Sort column removed from dataset → data returned unsorted, sort indicator absent, `ComponentViewState` entry preserved, URL still contains stale sort param. Column reappears on next data refresh → sort auto-applies, indicator returns.

### Playwright Spot Tests (examples gallery)

Six end-to-end tests verifying real browser behavior:

1. Sort table column → URL contains sort param
2. Sort table → reload page → sort indicator present
3. Sort table → navigate to different tab → click back → sort indicator restored
4. Paginate table → URL contains page param
5. Sort + filter + paginate → reload → all three present
6. Sort table without `withId` → reload → sort gone

These verify History API, shadow DOM event propagation, and real page reload — things JSDOM cannot.

## Files Changed

| File | Change |
|------|--------|
| `packages/pages-ui/src/model/page-types.ts` | `DeepLink`, `ViewState` redesign; remove `DrillDownStep`, `LayoutOverride` |
| `packages/pages-ui/src/dsl/builders.ts` | Remove grid auto-ID assignment (prerequisite for §8) |
| `packages/pages-runtime/src/component-view-state.ts` | NEW — `ComponentViewState` type, factory, helpers |
| `packages/pages-runtime/src/url.ts` | Extend `serializeToUrl` / `parseFromUrl` for sort + pagination |
| `packages/pages-runtime/src/cross-filter.ts` | Add `clearPageFilters` helper |
| `packages/pages-runtime/src/data-pipeline.ts` | `VizTarget` extended (`activeSort`, `activePage`); `pushData` applies sort + pagination |
| `packages/pages-runtime/src/site.ts` | Initialization reorder; `navigateInternal` extracted; `casehub-sort`/`casehub-page` handlers simplified; `syncUrl` extended; `popstate` full restore with `navigateInternal` |
| `packages/pages-runtime/src/registry.ts` | `ComponentEntry.hasExplicitId` |
| `packages/pages-runtime/src/activation.ts` | Set `hasExplicitId` on registry entries |
| `packages/pages-runtime/src/index.ts` | Export new types |
| `packages/pages-viz/src/components/CasehubTable.ts` | Remove private sort/pagination state and `_lastDataSet`; always emit events; read from VizTarget |
| `packages/pages-viz/src/base/CasehubElement.ts` | Add `activeSort`, `activePage` properties (no-update setters) |
| `docs/CASEHUB-PAGES.md` | Update `LiveSite.state`, `ViewState`, `DeepLink` docs |
