# ConfigurablePanel Interface & Dataset Pipeline Bridge

**Issues:** #109, #110 (closing epic #111)
**Date:** 2026-07-06
**Deferred:** #134 (panel-initiated dataset refresh)

## Problem

Host panels (Web Components mounted via `host-panel` in YAML) have two gaps:

1. **No formal hosting contract.** The `configure()` call is duck-typed at the call site: `(panel as unknown as { configure?: ... }).configure(panelProps)`. Every component author reads `activation.ts` source to understand the method signature and call timing.

2. **No data pipeline access.** Host panels cannot participate in the pages dataset pipeline. They receive static props via `configure()` and must fetch their own data — duplicating the fetch/transform/subscribe logic that pages already provides for viz components.

## Design

### New Interfaces

Two interfaces in `@casehubio/pages-component/model/`, exported from the package:

```typescript
/**
 * Pre-attachment configuration contract for hosted Web Components.
 *
 * **Call timing:** `configure(props)` is called before the element is appended
 * to the DOM — before `connectedCallback()` fires. Components should store
 * configuration without triggering rendering at this point.
 *
 * **Re-configuration:** `configure()` may be called again after initial render
 * (e.g. navigation to a different item). Implementations must handle re-entry:
 * tear down prior state and re-initialize with the new props.
 *
 * **Props content:** `props` contains the YAML `panelProps` values. The generic
 * `P` gives component authors type safety for their specific props shape; the
 * runtime calls with `Record<string, unknown>`.
 */
export interface ConfigurablePanel<P extends Record<string, unknown> = Record<string, unknown>> {
  configure(props: P): void;
}
```

The generic `P` gives component authors type safety; the runtime calls with the default `Record<string, unknown>`.

```typescript
/**
 * Data delivery contract for components receiving pipeline data.
 *
 * **Mutual-clearing invariant:** implementations must clear `error` when
 * `dataSet` is set, and clear `dataSet` when `error` is set. The pipeline
 * delivers one or the other per cycle, never both — but stale values from
 * a prior cycle must not persist alongside fresh values from the current one.
 */
export interface DataReceiver {
  dataSet: unknown;
  error: string;
}
```

Minimal data delivery contract. The pipeline sets `dataSet` with resolved data and `error` on failure. `dataSet` is typed as `unknown` to keep `pages-component` independent of `TypedDataSet` — consumers narrow at their boundary. Implementors must maintain the mutual-clearing invariant documented above.

These interfaces are orthogonal. A panel can implement either or both.

### VizTarget Decomposition

`VizTarget` in `pages-runtime/data-pipeline.ts` extends `DataReceiver`:

```typescript
export interface VizTarget extends DataReceiver {
  totalRows: number;
  activeSort: SortColumn | undefined;
  activePage: number | undefined;
}
```

`theme` is removed — the data pipeline never sets it. `site.ts setTheme()` accesses theme through its own cast (`(vizEl as { theme: string }).theme`) with a `"buildOption" in vizEl` guard. The property remains on `PagesElement` as a class concern.

### Existing Component Migration

`PagesTerminal` in `pages-component-terminal` already duck-types `configure(props: TerminalProps)`. It gains `implements ConfigurablePanel<TerminalProps>` — a one-line type annotation with no behavioral change. `TerminalProps extends Record<string, unknown>` structurally, so the generic constraint is satisfied.

This is the only component in the pages repo with a `configure()` method. External components (blocks-ui) are tracked separately (#135).

### PagesElement

No change to `PagesElement`. It satisfies `VizTarget` (and by extension `DataReceiver`) structurally through the existing event detail retyping in `site.ts`. Adding explicit `implements DataReceiver` would cause a compile error under `strict: true` because PagesElement's `dataSet` setter accepts `TypedDataSet | undefined` (narrower than `unknown`) — setter contravariance rejects this. The structural relationship through `VizTarget` is sufficient.

### ComponentEntry

`ComponentEntry.vizElement` widens from `PagesElement<VizComponentProps>` to `VizTarget`:

```typescript
export interface ComponentEntry {
  readonly element: HTMLElement;
  readonly vizElement?: VizTarget;
  readonly component: Component;
  readonly pagePath: string;
  readonly originalLookup?: DataSetLookup;
  readonly hasExplicitId: boolean;
}
```

All existing callsites access `vizElement` through VizTarget properties or pass it to `pushData(target: VizTarget)`. This is a type correction — no behavioral change.

The import changes from `PagesElement`/`VizComponentProps` (pages-viz) to `VizTarget` (local data-pipeline.ts).

### HostPanelProps

Gains an optional `lookup` for dataset binding:

```typescript
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";

export interface HostPanelProps {
  readonly typeName: string;
  readonly panelProps?: Readonly<Record<string, unknown>>;
  readonly lookup?: DataSetLookup;
}
```

`pages-component` already depends on `pages-data` (`package.json` line 24: `"@casehubio/pages-data": "workspace:*"`), and `displayer-types.ts` already imports `DataSetLookup`. Adding `lookup` to `HostPanelProps` follows the existing pattern — `DataComponentCommon` in `displayer-types.ts` already has `readonly lookup: DataSetLookup`.

### YAML DSL

A dataset-bound host panel:

```yaml
type: host-panel
props:
  typeName: work-item-inbox
  lookup:
    dataSetId: workitems
    operations:
      - type: sort
        columns:
          - columnId: createdAt
            order: DESCENDING
  panelProps:
    mode: my-work
```

`lookup` is consumed by the runtime. `panelProps` is passed to `configure()`. The panel never sees the lookup — it receives `dataSet` via its `DataReceiver` interface.

No parser changes — the YAML parser produces generic Component objects with arbitrary props.

### Activation Wiring

The `host-panel` branch in `activation.ts` gains a data bridge path:

**Without lookup** (existing, unchanged):
1. Create element
2. Call `configure(panelProps)` via `ConfigurablePanel` cast
3. Append to DOM

**With lookup** (new):
1. Create element
2. Call `configure(panelProps)` via `ConfigurablePanel` cast
3. Create proxy adapter (`DataReceiver → VizTarget`):

```typescript
function createHostPanelProxy(panel: DataReceiver): VizTarget {
  return {
    set dataSet(v: unknown) { panel.dataSet = v; },
    get dataSet() { return panel.dataSet; },
    set error(v: string) { panel.error = v; },
    get error() { return panel.error; },
    set totalRows(_: number) {},
    get totalRows() { return 0; },
    set activeSort(_: SortColumn | undefined) {},
    get activeSort() { return undefined; },
    set activePage(_: number | undefined) {},
    get activePage() { return undefined; },
  };
}
```

4. Register in `ComponentRegistry` with proxy as `vizElement` and lookup as `originalLookup`
5. Append panel to DOM
6. Dispatch `pages-data-request` with the proxy as element:

```typescript
new CustomEvent<DataRequestDetail>("pages-data-request", {
  bubbles: true, composed: true,
  detail: { element: proxy, lookup }
})
```

The event is dispatched from the panel element (bubbles to site.ts listener). The `element` field must carry the proxy — not the raw panel — so that the pipeline sets properties through the VizTarget adapter. This matches site.ts `DataRequestDetail { element: VizTarget, lookup: DataSetLookup }`.

**Runtime guard:** Before creating the proxy, activation verifies the panel implements DataReceiver:

```typescript
if (typeof (panel as Partial<DataReceiver>).dataSet === "undefined" &&
    !("dataSet" in panel)) {
  console.warn(`hostPanel "${typeName}": lookup specified but panel lacks DataReceiver properties`);
  // Register without data binding — fall through to non-lookup path
}
```

The proxy is inline in activation.ts — not a shared utility.

**Pagination:** Host panels do not support pagination, sorting, or active-page tracking. The proxy stubs `totalRows` (getter returns 0, setter is no-op), `activeSort`, and `activePage` accordingly. The pipeline sets these values but the proxy discards them. If a host panel needs to display total row counts, it reads them from the delivered `dataSet` directly.

### ConfigurablePanel Type Check

The duck-typed cast becomes:

```typescript
const configurable = panel as unknown as ConfigurablePanel;
if (typeof configurable.configure === "function") {
  configurable.configure(panelProps ?? {});
}
```

Same runtime check, but the cast target is the exported interface.

### Automatic Data Delivery

Once registered in the ComponentRegistry, host panels automatically receive:

- **Initial data** — from the dispatched `pages-data-request`
- **Refresh timer updates** — pipeline's `scheduleRefresh` per dataset
- **Push updates** (WebSocket/SSE) — pipeline's subscription mechanism
- **Cross-filter re-delivery** — site.ts re-pushes on filter change

The proxy is a standard VizTarget in the registry — no changes to `handleDataRequest` or `pushData`.

### Data Pipeline

One change: `handleSubtreeRemoved` in `data-pipeline.ts` must use `entry.element` (the wrapper HTMLElement) for DOM containment checks instead of `entry.vizElement`. The current code casts `entry.vizElement` to HTMLElement — this works for PagesElement (which IS an HTMLElement) but fails for the proxy (a plain object). Using `entry.element` is correct for all entry types:

```typescript
function handleSubtreeRemoved(removed: HTMLElement): void {
  const affected: Array<[string, HTMLElement]> = [];
  for (const [componentId, entry] of registry) {
    const el = entry.element;
    if (removed !== el && !removed.contains(el)) continue;
    affected.push([componentId, el]);
  }
  // ... microtask cleanup unchanged
}
```

`entry.element` is always an HTMLElement — no cast needed. When removed from the DOM, `el.isConnected` correctly returns false, triggering `cleanupComponentSubscriptions`. All other pipeline functions (`handleDataRequest`, `pushData`) remain identical.

## Package Changes

| Package | Change | Breaking |
|---------|--------|----------|
| `pages-component` | Add `DataReceiver`, `ConfigurablePanel` interfaces. Add `lookup` to `HostPanelProps`. | No |
| `pages-component-terminal` | `PagesTerminal implements ConfigurablePanel<TerminalProps>` | No |
| `pages-viz` | None | — |
| `pages-runtime` | `VizTarget extends DataReceiver`, remove `theme`. `ComponentEntry.vizElement: VizTarget`. Activation proxy + data bridge. `handleSubtreeRemoved` uses `entry.element` for cleanup. | `theme` removal from VizTarget type — no runtime callers affected |
| `pages-data` | None | — |

## Protocol Coherence

- **web-component-strategy**: ConfigurablePanel/DataReceiver are interfaces (lighter than mixins). Consistent with "composition via mixins, not inheritance chains."
- **pages-event-contract**: `pages-data-request` is a reserved framework event. This spec adds a second dispatch site (activation.ts) alongside the existing one (PagesElement.connectedCallback). The protocol's reserved events table must be updated: `pages-data-request` → "Dispatched by: `PagesElement` base class (`connectedCallback`) and runtime activation layer (host panel data binding)".
- **dataset-contract**: DatasetContract defines dataset shape; DataReceiver defines dataset consumption. Complementary, no overlap.

## Out of Scope

- Panel-initiated dataset refresh (#134 filed)
- Panel registry metadata (capabilities, type info) — unneeded; YAML lookup presence determines data wiring
- Migrating existing blocks-ui components to DataReceiver (#135) — mechanical follow-up, not architectural
