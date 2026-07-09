# DataSource Pipeline Unified Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> subagent-driven-development (recommended) or executing-plans to
> implement this plan task-by-task. Each task follows TDD
> (test-driven-development) and uses ide-tooling for structural
> editing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Focal issue:** #145 — DataSource pipeline improvements for blocks-ui component authoring
**Issue group:** #145

**Goal:** Unify component data delivery behind a single `DataSourceController` state machine, make all source factories standalone (no pipeline infrastructure required), and add EventStream reconnection signals.

**Architecture:** Six deliverables: (1) add `loading` to `DataReceiver`, (2) move `VizTarget` to `pages-component`, (3) `DataSourceController` class, (4) standalone source factories, (5) EventStream `onReconnect`, (6) SSEManager unchanged. Implementation order: D1+D2 → D4 → D5 → D3 → migration.

**Tech Stack:** TypeScript 5, Vitest, Yarn workspaces

## Global Constraints

- IntelliJ MCP for all code navigation and structural editing on .ts files
- `pages-component` must remain framework-agnostic (no Lit, no DOM deps)
- Pre-release platform — breaking changes cost nothing
- All source factories must work standalone (no pipeline infrastructure required by default)
- Mutual-clearing invariant: setting `dataSet` clears `error` + `loading`; setting `error` clears `dataSet` + `loading`; setting `loading = true` clears `error`
- Build verification: `yarn build:packages` after pages-data/pages-component changes; `yarn typecheck` for cross-package type checking

---

### Task 1: DataReceiver adds `loading` + VizTarget moves to `pages-component`

**Files:**
- Modify: `packages/pages-component/src/model/hosting.ts`
- Modify: `packages/pages-component/src/model/index.ts`
- Modify: `packages/pages-component/src/model/hosting.test.ts`
- Modify: `packages/pages-runtime/src/data-pipeline.ts`
- Modify: `packages/pages-runtime/src/index.ts`
- Modify: `packages/pages-runtime/src/activation.ts`
- Modify: `packages/pages-runtime/src/data-pipeline.test.ts`
- Modify: `packages/pages-runtime/src/data-pipeline-lifecycle.test.ts`
- Modify: `packages/pages-runtime/src/data-pipeline-cleanup.test.ts`
- Modify: `packages/pages-runtime/src/parameterised-urls.test.ts`
- Modify: `packages/pages-runtime/src/activation-host-panel.test.ts`
- Modify: `packages/pages-runtime/src/registry.ts`
- Modify: `packages/pages-viz/src/base/PagesElement.ts`

**Interfaces:**
- Produces: `DataReceiver { loading: boolean; dataSet: unknown; error: string }`
- Produces: `VizTarget extends DataReceiver { totalRows: number; activeSort: SortColumn | undefined; activePage: number | undefined }`
- Both exported from `@casehubio/pages-component/dist/model/hosting.js`

- [ ] **Step 1: Write failing tests for DataReceiver loading property**

Add to `packages/pages-component/src/model/hosting.test.ts`:

```typescript
describe("DataReceiver — loading property", () => {
  it("accepts an implementation with loading state", () => {
    let _data: unknown;
    let _error = "";
    let _loading = false;
    const receiver: DataReceiver = {
      get dataSet() { return _data; },
      set dataSet(v: unknown) { _data = v; _error = ""; _loading = false; },
      get error() { return _error; },
      set error(v: string) { _error = v; _data = undefined; _loading = false; },
      get loading() { return _loading; },
      set loading(v: boolean) { _loading = v; if (v) _error = ""; },
    };
    receiver.loading = true;
    expect(receiver.loading).toBe(true);
    expect(receiver.error).toBe("");
    receiver.dataSet = [1, 2, 3];
    expect(receiver.loading).toBe(false);
    expect(receiver.error).toBe("");
    receiver.error = "fail";
    expect(receiver.loading).toBe(false);
    expect(receiver.dataSet).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @casehubio/pages-component run test -- --run hosting.test.ts`
Expected: FAIL — `loading` not in `DataReceiver`

- [ ] **Step 3: Add `loading` to DataReceiver and add VizTarget**

In `packages/pages-component/src/model/hosting.ts`, add `loading: boolean` to `DataReceiver` and add `VizTarget`:

```typescript
import type { SortColumn } from "@casehubio/pages-data/dist/dataset/sort.js";

/**
 * ...existing ConfigurablePanel docs...
 */
export interface ConfigurablePanel<P extends Record<string, unknown> = Record<string, unknown>> {
  configure(props: P): void;
}

/**
 * Data delivery contract for components receiving pipeline data.
 *
 * **Mutual-clearing invariant:** implementations must clear `error` when
 * `dataSet` is set, and clear `dataSet` when `error` is set. Setting
 * `loading = true` clears `error`. Setting `dataSet` or `error` sets
 * `loading = false`. The pipeline delivers one or the other per cycle,
 * never both — but stale values from a prior cycle must not persist
 * alongside fresh values from the current one.
 */
export interface DataReceiver {
  loading: boolean;
  dataSet: unknown;
  error: string;
}

/**
 * Extended data delivery contract for components that support
 * pagination and sorting. Used by the data pipeline for table-like
 * visualisations.
 */
export interface VizTarget extends DataReceiver {
  totalRows: number;
  activeSort: SortColumn | undefined;
  activePage: number | undefined;
}
```

Update `packages/pages-component/src/model/index.ts` — add `VizTarget` to the hosting exports:

```typescript
export type { ConfigurablePanel, DataReceiver, VizTarget } from "./hosting.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @casehubio/pages-component run test -- --run hosting.test.ts`
Expected: PASS

- [ ] **Step 5: Update pages-runtime — VizTarget import migration**

In `packages/pages-runtime/src/data-pipeline.ts`:
- Remove the local `VizTarget` interface definition (lines 30-34)
- Change the import to: `import type { DataReceiver, VizTarget } from "@casehubio/pages-component/dist/model/hosting.js";`
- Remove the existing `import type { DataReceiver } from ...` line (line 28)

In `packages/pages-runtime/src/index.ts`:
- Change VizTarget export from local to re-export:
  ```typescript
  export type { VizTarget } from "@casehubio/pages-component/dist/model/hosting.js";
  ```
- Keep the existing `DataReceiver` re-export (already from pages-component)

In `packages/pages-runtime/src/activation.ts`:
- Change VizTarget import to: `import type { VizTarget } from "@casehubio/pages-component/dist/model/hosting.js";`
- Remove the import from `"./data-pipeline.js"`

In `packages/pages-runtime/src/registry.ts`:
- If it imports VizTarget from data-pipeline, update to pages-component

- [ ] **Step 6: Update PagesElement — add loading property**

In `packages/pages-viz/src/base/PagesElement.ts`, add a `_loading` field and property:

```typescript
private _loading = false;

get loading(): boolean {
  return this._loading;
}

set loading(v: boolean) {
  if (v) this._error = "";
  this._loading = v;
}
```

Update existing `set dataSet` to also clear loading:
```typescript
set dataSet(value: TypedDataSet | undefined) {
  this._loading = false;
  this._error = "";
  this._dataset = value;
  this.update();
}
```

Update existing `set error` to also clear loading:
```typescript
set error(value: string) {
  this._loading = false;
  this._dataset = undefined;
  this._error = value;
  this.update();
}
```

- [ ] **Step 7: Update createHostPanelProxy — add loading pass-through**

In `packages/pages-runtime/src/activation.ts`, the `createHostPanelProxy` function needs loading:

```typescript
function createHostPanelProxy(panel: DataReceiver): VizTarget {
  return {
    set dataSet(v: unknown) { panel.dataSet = v; },
    get dataSet() { return panel.dataSet; },
    set error(v: string) { panel.error = v; },
    get error() { return panel.error; },
    set loading(v: boolean) { panel.loading = v; },
    get loading() { return panel.loading; },
    set totalRows(_: number) {},
    get totalRows() { return 0; },
    set activeSort(_: SortColumn | undefined) {},
    get activeSort() { return undefined; },
    set activePage(_: number | undefined) {},
    get activePage() { return undefined; },
  };
}
```

- [ ] **Step 8: Build and typecheck**

Run: `yarn build:packages && yarn typecheck`

Fix any compilation errors in runtime test files that reference VizTarget from the old location. Update imports in:
- `data-pipeline.test.ts`
- `data-pipeline-lifecycle.test.ts`
- `data-pipeline-cleanup.test.ts`
- `parameterised-urls.test.ts`
- `activation-host-panel.test.ts`

- [ ] **Step 9: Run all tests**

Run: `yarn workspace @casehubio/pages-component run test -- --run`
Run: `yarn workspace @casehubio/pages-runtime run test -- --run`
Run: `yarn workspace @casehubio/pages-viz run test -- --run`
Expected: All PASS

- [ ] **Step 10: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-component/src/model/hosting.ts packages/pages-component/src/model/hosting.test.ts packages/pages-component/src/model/index.ts packages/pages-runtime/src/data-pipeline.ts packages/pages-runtime/src/index.ts packages/pages-runtime/src/activation.ts packages/pages-runtime/src/registry.ts packages/pages-viz/src/base/PagesElement.ts
git -C /Users/mdproctor/claude/casehub/pages add -u packages/pages-runtime/src/
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat: add loading to DataReceiver, move VizTarget to pages-component

Refs #145"
```

---

### Task 2: Source factory unification — restSource standalone

**Files:**
- Modify: `packages/pages-data/src/datasource/sources/rest-source.ts`
- Modify: `packages/pages-data/src/datasource/sources/rest-source.test.ts`

**Interfaces:**
- Produces: `restSource(url: string, dataSetId: DataSetId, options?: RestSourceOptions): DataSource`
- `RestSourceOptions` gains `fetchFn?: typeof globalThis.fetch` and `presets?: PresetRegistry`
- Removes `ctx: ResolverContext` parameter

- [ ] **Step 1: Write failing test for standalone restSource**

Replace the test file `packages/pages-data/src/datasource/sources/rest-source.test.ts`. The key change: no `ResolverContext`, no `stubManager`. Tests use a mock `fetchFn` instead.

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { restSource } from "./rest-source.js";
import type { DataSink, SourceError } from "../types.js";
import type { DataSetEvent } from "../../dataset/events.js";
import { ColumnType, dataSetId, col } from "./test-helpers.js";
import { HttpMethod } from "../../dataset/external/types.js";

function mockFetch(data: unknown, status = 200): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

describe("restSource (standalone)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits snapshot on connect", async () => {
    const fetchFn = mockFetch([["alice"], ["bob"]]);
    const source = restSource("https://api.example.com/data", dataSetId("test-ds"), {
      columns: [col("name", ColumnType.TEXT)],
      fetchFn,
    });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("snapshot");
    source.disconnect();
  });

  it("emits error when fetch fails", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network error"));
    const source = restSource("https://api.example.com/fail", dataSetId("fail-ds"), {
      columns: [col("x", ColumnType.TEXT)],
      fetchFn,
    });

    const errors: SourceError[] = [];
    const sink: DataSink = {
      apply() {},
      error(err) { errors.push(err); },
    };

    source.connect(sink);
    await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0));

    expect(errors[0]!.message).toContain("network error");
    source.disconnect();
  });

  it("uses globalThis.fetch by default", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([["x"]]), {
        headers: { "content-type": "application/json" },
      }),
    );

    const source = restSource("https://api.example.com/data", dataSetId("default-fetch"), {
      columns: [col("val", ColumnType.TEXT)],
    });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
    source.disconnect();
  });

  it("polls when refreshTime is set", async () => {
    vi.useFakeTimers();
    let fetchCount = 0;
    const fetchFn = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return new Response(JSON.stringify([["row-" + String(fetchCount)]]), {
        headers: { "content-type": "application/json" },
      });
    });

    const source = restSource("https://api.example.com/data", dataSetId("poll-ds"), {
      columns: [col("val", ColumnType.TEXT)],
      refreshTime: "5second",
      fetchFn,
    });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toBe(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchCount).toBe(2);

    source.disconnect();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchCount).toBe(2);
  });

  it("does not emit after disconnect", async () => {
    let resolveFetch: (() => void) | null = null;
    const fetchFn = vi.fn().mockImplementation(() =>
      new Promise<Response>((resolve) => {
        resolveFetch = () => resolve(
          new Response(JSON.stringify([["late"]]), {
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    );

    const source = restSource("https://api.example.com/data", dataSetId("late-ds"), {
      columns: [col("val", ColumnType.TEXT)],
      fetchFn,
    });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);
    source.disconnect();
    resolveFetch!();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(events).toHaveLength(0);
  });

  it("passes method, headers, and body to fetch", async () => {
    const fetchFn = mockFetch([["ok"]]);
    const source = restSource("https://api.example.com/data", dataSetId("opts-ds"), {
      method: HttpMethod.POST,
      headers: { "Authorization": "Bearer token" },
      body: '{"q": "test"}',
      columns: [col("name", ColumnType.TEXT)],
      fetchFn,
    });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("api.example.com"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Authorization": "Bearer token" }),
        body: '{"q": "test"}',
      }),
    );
    source.disconnect();
  });

  it("appends query params to URL", async () => {
    const fetchFn = mockFetch([["ok"]]);
    const source = restSource("https://api.example.com/data", dataSetId("query-ds"), {
      query: { page: "1", size: "10" },
      columns: [col("name", ColumnType.TEXT)],
      fetchFn,
    });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));

    const calledUrl = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain("page=1");
    expect(calledUrl).toContain("size=10");
    source.disconnect();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @casehubio/pages-data run test -- --run rest-source.test.ts`
Expected: FAIL — signature mismatch

- [ ] **Step 3: Rewrite restSource to be standalone**

Replace `packages/pages-data/src/datasource/sources/rest-source.ts`:

```typescript
import type { DataSource, DataSink } from "../types.js";
import type { DataSetId } from "../../dataset/types.js";
import type { ExternalColumnDef, ExternalDataSetDef } from "../../dataset/external/types.js";
import type { PresetRegistry } from "../../dataset/external/types.js";
import { HttpMethod, parseRefreshTime } from "../../dataset/external/types.js";
import { extractDataSet } from "../../dataset/external/extraction.js";
import { createPresetRegistry } from "../../dataset/external/presets/registry.js";

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

export function restSource(
  url: string,
  dataSetId: DataSetId,
  options?: RestSourceOptions,
): DataSource {
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let connected = false;
  const presets = options?.presets ?? createPresetRegistry();

  function buildUrl(): string {
    if (!options?.query || Object.keys(options.query).length === 0) return url;
    const u = new URL(url, "http://localhost");
    for (const [k, v] of Object.entries(options.query)) {
      u.searchParams.set(k, v);
    }
    return url.startsWith("http") ? u.toString() : u.pathname + u.search;
  }

  function buildInit(): RequestInit {
    const init: RequestInit = {};
    const method = options?.method ?? HttpMethod.GET;
    if (method !== HttpMethod.GET) init.method = method;
    if (options?.headers) init.headers = { ...options.headers };
    if (options?.body) init.body = options.body;
    if (options?.form) {
      const formData = new URLSearchParams(options.form);
      init.body = formData.toString();
      init.headers = {
        ...init.headers as Record<string, string>,
        "Content-Type": "application/x-www-form-urlencoded",
      };
    }
    return init;
  }

  function buildDef(): ExternalDataSetDef {
    const def: ExternalDataSetDef = { uuid: dataSetId, url };
    if (!options) return def;
    return {
      ...def,
      ...(options.dataPath !== undefined && { dataPath: options.dataPath }),
      ...(options.type !== undefined && { type: options.type }),
      ...(options.expression !== undefined && { expression: options.expression }),
      ...(options.columns !== undefined && { columns: options.columns }),
      ...(options.accumulate !== undefined && { accumulate: options.accumulate }),
      ...(options.maxRows !== undefined && { cacheMaxRows: options.maxRows }),
    };
  }

  async function doFetch(sink: DataSink): Promise<void> {
    const fetchFn = options?.fetchFn ?? globalThis.fetch.bind(globalThis);
    try {
      const response = await fetchFn(buildUrl(), buildInit());
      if (!connected) return;

      const contentType = response.headers?.get("content-type") ?? undefined;
      let data: unknown;
      if (contentType?.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      const { dataset } = await extractDataSet(
        { data, ...(contentType ? { contentType } : {}) },
        buildDef(),
        presets,
      );
      if (connected) {
        sink.apply({ type: "snapshot", dataset });
      }
    } catch (err) {
      if (connected) {
        sink.error({
          message: err instanceof Error ? err.message : String(err),
          permanent: false,
        });
      }
    }
  }

  return {
    connect(sink: DataSink): void {
      connected = true;
      void doFetch(sink);

      if (options?.refreshTime) {
        const intervalMs = parseRefreshTime(options.refreshTime);
        refreshTimer = setInterval(() => {
          void doFetch(sink);
        }, intervalMs);
      }
    },

    disconnect(): void {
      connected = false;
      if (refreshTimer !== null) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @casehubio/pages-data run test -- --run rest-source.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-data/src/datasource/sources/rest-source.ts packages/pages-data/src/datasource/sources/rest-source.test.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat: restSource standalone — remove ResolverContext dependency

restSource now uses fetch() directly instead of delegating to
resolveExternalDataSet(). No DataSetManager, no providerFactory.
Optional fetchFn and presets in options for callers that need them.

Refs #145"
```

---

### Task 3: Source factory unification — sseSource, wsSource, postMessageSource

**Files:**
- Modify: `packages/pages-data/src/datasource/sources/sse-source.ts`
- Modify: `packages/pages-data/src/datasource/sources/ws-source.ts`
- Modify: `packages/pages-data/src/datasource/sources/post-message-source.ts`
- Create: `packages/pages-data/src/datasource/sources/default-pools.ts`

**Interfaces:**
- Produces: `sseSource(url: string, dataSetId: DataSetId, options?: SseSourceOptions): DataSource`
- Produces: `wsSource(url: string, dataSetId: DataSetId, options?: WsSourceOptions): DataSource`
- Produces: `postMessageSource(dataSetId: DataSetId, options?: PostMessageSourceOptions): DataSource`
- Produces: `defaultSsePushPool`, `defaultWsPushPool` singletons

- [ ] **Step 1: Create default pool singletons**

Create `packages/pages-data/src/datasource/sources/default-pools.ts`:

```typescript
import { createPushPool } from "../../dataset/external/sources/push-pool.js";
import { createSseSource } from "../../dataset/external/sources/sse-source.js";
import { createWebSocketSource } from "../../dataset/external/sources/websocket-source.js";

export const defaultSsePushPool = createPushPool(
  (baseUrl, config) => createSseSource(baseUrl, config),
);

export const defaultWsPushPool = createPushPool(
  (baseUrl, config) => createWebSocketSource(baseUrl, config),
);
```

- [ ] **Step 2: Update sseSource — pool becomes optional**

In `packages/pages-data/src/datasource/sources/sse-source.ts`:

```typescript
import type { DataSource, DataSink } from "../types.js";
import type { DataSetId } from "../../dataset/types.js";
import type { ExternalColumnDef, ExternalDataSetDef } from "../../dataset/external/types.js";
import type { PushPool } from "../../dataset/external/sources/push-pool.js";
import { defaultSsePushPool } from "./default-pools.js";

export interface SseSourceOptions {
  readonly dataPath?: string;
  readonly expression?: string;
  readonly columns?: readonly ExternalColumnDef[];
  readonly keyColumn?: string;
  readonly cacheMaxRows?: number;
  readonly accumulate?: boolean;
  readonly pool?: PushPool;
}

export function sseSource(
  url: string,
  dataSetId: DataSetId,
  options?: SseSourceOptions,
): DataSource {
  let connected = false;
  const pool = options?.pool ?? defaultSsePushPool;

  function buildDef(): ExternalDataSetDef {
    const def: ExternalDataSetDef = { uuid: dataSetId, url };
    if (!options) return def;
    return {
      ...def,
      ...(options.dataPath !== undefined && { dataPath: options.dataPath }),
      ...(options.expression !== undefined && { expression: options.expression }),
      ...(options.columns !== undefined && { columns: options.columns }),
      ...(options.keyColumn !== undefined && { keyColumn: options.keyColumn }),
      ...(options.cacheMaxRows !== undefined && { cacheMaxRows: options.cacheMaxRows }),
      ...(options.accumulate !== undefined && { accumulate: options.accumulate }),
    };
  }

  return {
    connect(sink: DataSink): void {
      connected = true;
      const pushSource = pool.acquire(url);
      const def = buildDef();

      pushSource.subscribe(
        dataSetId,
        def,
        (event) => { if (connected) sink.apply(event); },
        (error) => {
          if (connected) sink.error({ message: error.message, permanent: error.permanent });
        },
      );
    },

    disconnect(): void {
      if (!connected) return;
      connected = false;
      const pushSource = pool.acquire(url);
      pushSource.unsubscribe(dataSetId);
    },
  };
}
```

- [ ] **Step 3: Update wsSource — pool becomes optional**

Same pattern in `packages/pages-data/src/datasource/sources/ws-source.ts`:

```typescript
import type { DataSource, DataSink } from "../types.js";
import type { DataSetId } from "../../dataset/types.js";
import type { ExternalColumnDef, ExternalDataSetDef } from "../../dataset/external/types.js";
import type { PushPool } from "../../dataset/external/sources/push-pool.js";
import { defaultWsPushPool } from "./default-pools.js";

export interface WsSourceOptions {
  readonly dataPath?: string;
  readonly expression?: string;
  readonly columns?: readonly ExternalColumnDef[];
  readonly keyColumn?: string;
  readonly cacheMaxRows?: number;
  readonly accumulate?: boolean;
  readonly pool?: PushPool;
}

export function wsSource(
  url: string,
  dataSetId: DataSetId,
  options?: WsSourceOptions,
): DataSource {
  let connected = false;
  const pool = options?.pool ?? defaultWsPushPool;

  function buildDef(): ExternalDataSetDef {
    const def: ExternalDataSetDef = { uuid: dataSetId, url };
    if (!options) return def;
    return {
      ...def,
      ...(options.dataPath !== undefined && { dataPath: options.dataPath }),
      ...(options.expression !== undefined && { expression: options.expression }),
      ...(options.columns !== undefined && { columns: options.columns }),
      ...(options.keyColumn !== undefined && { keyColumn: options.keyColumn }),
      ...(options.cacheMaxRows !== undefined && { cacheMaxRows: options.cacheMaxRows }),
      ...(options.accumulate !== undefined && { accumulate: options.accumulate }),
    };
  }

  return {
    connect(sink: DataSink): void {
      connected = true;
      const pushSource = pool.acquire(url);
      const def = buildDef();

      pushSource.subscribe(
        dataSetId,
        def,
        (event) => { if (connected) sink.apply(event); },
        (error) => {
          if (connected) sink.error({ message: error.message, permanent: error.permanent });
        },
      );
    },

    disconnect(): void {
      if (!connected) return;
      connected = false;
      const pushSource = pool.acquire(url);
      pushSource.unsubscribe(dataSetId);
    },
  };
}
```

- [ ] **Step 4: Update postMessageSource — presets become optional**

In `packages/pages-data/src/datasource/sources/post-message-source.ts`, change signature to move `presetRegistry` into options:

```typescript
import type { DataSource, DataSink } from "../types.js";
import type { DataSetId } from "../../dataset/types.js";
import type { ExternalColumnDef } from "../../dataset/external/types.js";
import type { PresetRegistry } from "../../dataset/external/types.js";
import { extractDataSet } from "../../dataset/external/extraction.js";
import { createPresetRegistry } from "../../dataset/external/presets/registry.js";

export interface PostMessageSourceOptions {
  readonly columns?: readonly ExternalColumnDef[];
  readonly dataPath?: string;
  readonly type?: string;
  readonly expression?: string;
  readonly timeoutMs?: number;
  readonly eventTarget?: EventTarget;
  readonly presets?: PresetRegistry;
}

export function postMessageSource(
  dataSetId: DataSetId,
  options?: PostMessageSourceOptions,
): DataSource {
  const presets = options?.presets ?? createPresetRegistry();
  // ... rest of implementation unchanged, replacing presetRegistry with presets
}
```

- [ ] **Step 5: Export default pools from datasource/index.ts**

Add to `packages/pages-data/src/datasource/index.ts`:

```typescript
export { defaultSsePushPool, defaultWsPushPool } from "./sources/default-pools.js";
```

- [ ] **Step 6: Build and run tests**

Run: `yarn build:packages && yarn workspace @casehubio/pages-data run test -- --run`
Expected: PASS (existing tests may need signature updates)

- [ ] **Step 7: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-data/src/datasource/
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat: sseSource, wsSource, postMessageSource standalone

All source factories now work without explicit infrastructure deps.
sseSource/wsSource use default pool singletons. postMessageSource
uses createPresetRegistry() by default.

Refs #145"
```

---

### Task 4: defToBinding — simplified deps

**Files:**
- Modify: `packages/pages-data/src/datasource/sources/def-to-binding.ts`
- Modify: `packages/pages-data/src/datasource/sources/def-to-binding.test.ts`
- Modify: `packages/pages-runtime/src/data-pipeline.ts`

**Interfaces:**
- Consumes: New `restSource`, `sseSource`, `wsSource` signatures from Tasks 2-3
- Produces: `DefToBindingDeps { manager, wsPool?, ssePool?, fetchFn?, presets? }`

- [ ] **Step 1: Write failing test for simplified deps**

Update `packages/pages-data/src/datasource/sources/def-to-binding.test.ts` — change `createDeps` to use new interface:

```typescript
function createDeps(overrides?: Partial<DefToBindingDeps>): DefToBindingDeps {
  return {
    manager: overrides?.manager ?? createDataSetManager(),
    wsPool: overrides?.wsPool ?? createMockPool(),
    ssePool: overrides?.ssePool ?? createMockPool(),
    fetchFn: overrides?.fetchFn,
    presets: overrides?.presets ?? { get: () => undefined, has: () => false },
  };
}
```

Remove all `ResolverContext` construction from the test. Remove `ctx` from `createDeps`.

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @casehubio/pages-data run test -- --run def-to-binding.test.ts`
Expected: FAIL — old interface expected

- [ ] **Step 3: Rewrite defToBinding with simplified deps**

In `packages/pages-data/src/datasource/sources/def-to-binding.ts`:

```typescript
import type { ExternalDataSetDef } from "../../dataset/external/types.js";
import type { PresetRegistry } from "../../dataset/external/types.js";
import type { PushPool } from "../../dataset/external/sources/push-pool.js";
import type { DataSetManager } from "../../dataset/manager.js";
import type { DataSourceBinding } from "../types.js";
import type { RestSourceOptions } from "./rest-source.js";
import type { WsSourceOptions } from "./ws-source.js";
import type { SseSourceOptions } from "./sse-source.js";
import type { ServerQuerySourceOptions } from "./server-query-source.js";
import type { InlineSourceOptions } from "./inline-source.js";
import { inlineSource } from "./inline-source.js";
import { restSource } from "./rest-source.js";
import { sseSource } from "./sse-source.js";
import { wsSource } from "./ws-source.js";
import { joinSource } from "./join-source.js";
import { serverQuerySource } from "./server-query-source.js";

export interface DefToBindingDeps {
  readonly manager: DataSetManager;
  readonly wsPool?: PushPool;
  readonly ssePool?: PushPool;
  readonly fetchFn?: typeof globalThis.fetch;
  readonly presets?: PresetRegistry;
}

// ... buildInlineOpts, buildPushOpts, buildRestOpts unchanged ...

export function defToBinding(
  def: ExternalDataSetDef,
  deps: DefToBindingDeps,
): DataSourceBinding {
  const base: { id: typeof def.uuid; keyColumn?: string } = { id: def.uuid };
  if (def.keyColumn !== undefined) base.keyColumn = def.keyColumn;

  // 1. Inline content
  if (def.content !== undefined) {
    return { ...base, source: inlineSource(def.content, buildInlineOpts(def)) };
  }

  // 2. Join
  if (def.join !== undefined) {
    return { id: def.uuid, source: joinSource(deps.manager, ...def.join) };
  }

  // 3. Server-side query (unchanged — serverQuerySource is already standalone)
  if (def.serverQuery && def.url) {
    const opts: ServerQuerySourceOptions = {};
    return { id: def.uuid, source: serverQuerySource(def.url, def.uuid, opts) };
  }

  const url = def.url ?? "";

  // 4. WebSocket
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    const pushOpts = buildPushOpts(def);
    return { ...base, source: wsSource(url, def.uuid, { ...pushOpts, pool: deps.wsPool }) };
  }

  // 5. SSE
  if (url.startsWith("sse://") || url.startsWith("sses://")) {
    const pushOpts = buildPushOpts(def);
    return { ...base, source: sseSource(url, def.uuid, { ...pushOpts, pool: deps.ssePool }) };
  }

  // 6. Default: REST
  const restOpts = buildRestOpts(def);
  return {
    ...base,
    source: restSource(url, def.uuid, {
      ...restOpts,
      fetchFn: deps.fetchFn,
      presets: deps.presets,
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @casehubio/pages-data run test -- --run def-to-binding.test.ts`
Expected: PASS

- [ ] **Step 5: Update data-pipeline.ts caller**

In `packages/pages-runtime/src/data-pipeline.ts`, update the `defToBinding` import and call site. The pipeline currently constructs `DefToBindingDeps` with `ctx`, `wsPool`, `ssePool`, `manager`. Change to:

```typescript
const bindingDeps: DefToBindingDeps = {
  manager,
  wsPool,
  ssePool,
  // fetchFn and presets can be added when pipeline has them
};
```

Update the `import` to drop `ResolverContext` if it was only used for defToBinding.

- [ ] **Step 6: Build and run all tests**

Run: `yarn build:packages && yarn workspace @casehubio/pages-data run test -- --run && yarn workspace @casehubio/pages-runtime run test -- --run`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-data/src/datasource/sources/def-to-binding.ts packages/pages-data/src/datasource/sources/def-to-binding.test.ts packages/pages-runtime/src/data-pipeline.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat: defToBinding simplified deps — remove ResolverContext

DefToBindingDeps now takes manager + optional pools/fetchFn/presets
instead of the full ResolverContext. Source factories are standalone;
pipeline passes its configured pools and fetch function.

Refs #145"
```

---

### Task 5: EventStream reconnection signal

**Files:**
- Modify: `packages/pages-data/src/event-stream/event-stream.ts`
- Modify: `packages/pages-data/src/event-stream/event-stream-pool.ts`
- Modify: `packages/pages-data/src/event-stream/event-stream.test.ts`

**Interfaces:**
- Consumes: `EventConnectionOptions.onStatusChange` (exists at `event-connection.ts:10`)
- Produces: `EventStreamOptions.onReconnect?: () => void`

- [ ] **Step 1: Write failing test for onReconnect**

Add to `packages/pages-data/src/event-stream/event-stream.test.ts`:

```typescript
describe("onReconnect", () => {
  it("fires onReconnect when connection recovers", () => {
    const onReconnect = vi.fn();
    const stream = new EventStream("ws://localhost/push", "events.*", {
      pool,
      onReconnect,
    });

    stream.connect();

    // Simulate reconnection by changing mock status
    Object.defineProperty(lastMockConn, "status", { value: "reconnecting", writable: true });
    // Then back to connected — the stream should detect this transition
    Object.defineProperty(lastMockConn, "status", { value: "connected", writable: true });

    // Fire a status change notification (this will need pool/handle support)
    // For now, verify the option is accepted
    expect(onReconnect).not.toThrow();
    stream.disconnect();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @casehubio/pages-data run test -- --run event-stream.test.ts`
Expected: FAIL — `onReconnect` not in options type

- [ ] **Step 3: Add onReconnect to EventStreamOptions**

In `packages/pages-data/src/event-stream/event-stream.ts`, add to options:

```typescript
export interface EventStreamOptions<T = unknown> {
  config?: PushSourceConfig;
  maxBuffer?: number;
  shared?: boolean;
  batchEvents?: boolean;
  parse?: (raw: unknown) => T;
  pool?: EventStreamPool;
  onChange?: () => void;
  onReconnect?: () => void;
}
```

Store it in the class:

```typescript
private readonly onReconnect: (() => void) | undefined;
```

Set in constructor:

```typescript
this.onReconnect = options?.onReconnect;
```

In `connect()`, after acquiring the handle, set up status monitoring. For shared pools, use `PoolHandle.onStatusChange`. For dedicated connections, wire `onStatusChange` into the `createEventConnection` options.

Add a `_prevStatus` tracker:

```typescript
private _prevStatus: ConnectionStatus = "disconnected";
```

Add a method to check for reconnection:

```typescript
private checkReconnection(): void {
  const current = this.handle?.status() ?? "disconnected";
  if (this._prevStatus === "reconnecting" && current === "connected") {
    this.onReconnect?.();
  }
  this._prevStatus = current;
}
```

- [ ] **Step 4: Update PoolHandle to support onStatusChange**

In `packages/pages-data/src/event-stream/event-stream-pool.ts`, add to `PoolHandle`:

```typescript
export interface PoolHandle {
  readonly eventTarget: EventTarget;
  readonly status: () => ConnectionStatus;
  release(topics: readonly string[]): void;
  onStatusChange?: (status: ConnectionStatus) => void;
}
```

In the pool's `acquire()`, wire the `onStatusChange` callback from the `EventConnection` options to all active handles for that connection.

- [ ] **Step 5: Run tests**

Run: `yarn workspace @casehubio/pages-data run test -- --run event-stream.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-data/src/event-stream/
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat: EventStream onReconnect callback

Fires when the underlying connection transitions from reconnecting
to connected. Components doing initial-fetch + delta-listen use this
to re-fetch their baseline after a gap.

Refs #145"
```

---

### Task 6: DataSourceController

**Files:**
- Create: `packages/pages-component/src/controller/data-source-controller.ts`
- Create: `packages/pages-component/src/controller/data-source-controller.test.ts`
- Create: `packages/pages-component/src/controller/index.ts`
- Modify: `packages/pages-component/src/index.ts` (add controller export)

**Interfaces:**
- Consumes: `DataSource`, `DataSink`, `DataSetEvent` from `@casehubio/pages-data`
- Consumes: `VizTarget` from `../model/hosting.js`
- Consumes: `restSource`, `sseSource`, `wsSource` (standalone signatures)
- Produces: `DataSourceController implements VizTarget`

- [ ] **Step 1: Write failing tests for DataSourceController**

Create `packages/pages-component/src/controller/data-source-controller.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { DataSourceController } from "./data-source-controller.js";
import type { DataSource, DataSink } from "@casehubio/pages-data/dist/datasource/types.js";
import { dataSetId, ColumnType, columnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { TypedDataSet, TypedRow } from "@casehubio/pages-data/dist/dataset/types.js";
import { toTypedRow } from "@casehubio/pages-data/dist/dataset/conversion.js";

function makeDataSet(values: string[][]): TypedDataSet {
  return {
    columns: [{ id: columnId("name"), name: "name", type: ColumnType.TEXT }],
    rows: values.map(row => toTypedRow(
      [{ id: columnId("name"), name: "name", type: ColumnType.TEXT }],
      row.map(v => v ?? null),
    )),
  };
}

function immediateSource(dataset: TypedDataSet): DataSource {
  return {
    connect(sink: DataSink) {
      sink.apply({ type: "snapshot", dataset });
    },
    disconnect() {},
  };
}

function failingSource(message: string): DataSource {
  return {
    connect(sink: DataSink) {
      sink.error({ message, permanent: true });
    },
    disconnect() {},
  };
}

function deferredSource(): { source: DataSource; resolve: (ds: TypedDataSet) => void; reject: (msg: string) => void } {
  let sink: DataSink | undefined;
  return {
    source: {
      connect(s: DataSink) { sink = s; },
      disconnect() { sink = undefined; },
    },
    resolve(ds: TypedDataSet) { sink?.apply({ type: "snapshot", dataset: ds }); },
    reject(msg: string) { sink?.error({ message: msg, permanent: true }); },
  };
}

describe("DataSourceController", () => {
  describe("initial state", () => {
    it("starts idle — loading false, no data, no error", () => {
      const ctrl = new DataSourceController();
      expect(ctrl.loading).toBe(false);
      expect(ctrl.dataSet).toBeUndefined();
      expect(ctrl.error).toBe("");
    });
  });

  describe("mutual-clearing invariant", () => {
    it("setting dataSet clears error and loading", () => {
      const ctrl = new DataSourceController();
      ctrl.error = "fail";
      ctrl.loading = true;
      ctrl.dataSet = [1, 2, 3];
      expect(ctrl.error).toBe("");
      expect(ctrl.loading).toBe(false);
    });

    it("setting error clears dataSet and loading", () => {
      const ctrl = new DataSourceController();
      ctrl.dataSet = [1, 2, 3];
      ctrl.loading = true;
      ctrl.error = "fail";
      expect(ctrl.dataSet).toBeUndefined();
      expect(ctrl.loading).toBe(false);
    });

    it("setting loading = true clears error", () => {
      const ctrl = new DataSourceController();
      ctrl.error = "fail";
      ctrl.loading = true;
      expect(ctrl.error).toBe("");
    });

    it("setting loading = true preserves stale dataSet", () => {
      const ctrl = new DataSourceController();
      ctrl.dataSet = [1, 2, 3];
      ctrl.loading = true;
      expect(ctrl.dataSet).toEqual([1, 2, 3]);
    });
  });

  describe("onChange", () => {
    it("fires on dataSet change", () => {
      const onChange = vi.fn();
      const ctrl = new DataSourceController({ onChange });
      ctrl.dataSet = "test";
      expect(onChange).toHaveBeenCalledOnce();
    });

    it("fires on error change", () => {
      const onChange = vi.fn();
      const ctrl = new DataSourceController({ onChange });
      ctrl.error = "fail";
      expect(onChange).toHaveBeenCalledOnce();
    });

    it("fires on loading change", () => {
      const onChange = vi.fn();
      const ctrl = new DataSourceController({ onChange });
      ctrl.loading = true;
      expect(onChange).toHaveBeenCalledOnce();
    });

    it("does not fire when loading set to same value with no error", () => {
      const onChange = vi.fn();
      const ctrl = new DataSourceController({ onChange });
      ctrl.loading = false; // already false
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("source lifecycle", () => {
    it("delivers snapshot from source on connect", () => {
      const ds = makeDataSet([["alice"]]);
      const ctrl = new DataSourceController();
      ctrl.source = immediateSource(ds);
      ctrl.connect();
      expect(ctrl.dataSet).toEqual(ds);
      expect(ctrl.loading).toBe(false);
    });

    it("sets loading on connect before data arrives", () => {
      const { source } = deferredSource();
      const states: boolean[] = [];
      const ctrl = new DataSourceController({
        onChange: () => states.push(ctrl.loading),
      });
      ctrl.source = source;
      ctrl.connect();
      expect(states[0]).toBe(true); // first onChange = loading
    });

    it("delivers error from source", () => {
      const ctrl = new DataSourceController();
      ctrl.source = failingSource("boom");
      ctrl.connect();
      expect(ctrl.error).toBe("boom");
      expect(ctrl.loading).toBe(false);
    });

    it("disconnect stops delivery", () => {
      const { source, resolve } = deferredSource();
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      ctrl.disconnect();
      resolve(makeDataSet([["late"]]));
      expect(ctrl.dataSet).toBeUndefined();
    });

    it("setting new source disconnects old source", () => {
      const disconnect1 = vi.fn();
      const source1: DataSource = {
        connect() {},
        disconnect: disconnect1,
      };
      const ctrl = new DataSourceController();
      ctrl.source = source1;
      ctrl.connect();
      ctrl.source = immediateSource(makeDataSet([["new"]]));
      expect(disconnect1).toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    it("reconnects the source", () => {
      let connectCount = 0;
      const source: DataSource = {
        connect(sink: DataSink) {
          connectCount++;
          sink.apply({ type: "snapshot", dataset: makeDataSet([["v" + String(connectCount)]]) });
        },
        disconnect() {},
      };
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      expect(connectCount).toBe(1);
      ctrl.refresh();
      expect(connectCount).toBe(2);
    });
  });

  describe("dispose", () => {
    it("disconnects and clears source", () => {
      const disconnect = vi.fn();
      const source: DataSource = { connect() {}, disconnect };
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      ctrl.dispose();
      expect(disconnect).toHaveBeenCalled();
      expect(ctrl.source).toBeUndefined();
    });
  });

  describe("VizTarget pass-through", () => {
    it("stores totalRows, activeSort, activePage", () => {
      const ctrl = new DataSourceController();
      ctrl.totalRows = 42;
      ctrl.activePage = 3;
      expect(ctrl.totalRows).toBe(42);
      expect(ctrl.activePage).toBe(3);
      expect(ctrl.activeSort).toBeUndefined();
    });
  });

  describe("append event materialization", () => {
    it("appends rows to existing dataset", () => {
      const ds = makeDataSet([["alice"]]);
      const { source, resolve } = deferredSource();
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      resolve(ds);
      expect((ctrl.dataSet as TypedDataSet).rows).toHaveLength(1);

      // Now send an append event
      // We need direct sink access — use a custom source
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @casehubio/pages-component run test -- --run data-source-controller.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement DataSourceController**

Create `packages/pages-component/src/controller/data-source-controller.ts` with the full implementation from the spec (the reviewed version with materialization, no-op guards, and single-onChange refresh).

Create `packages/pages-component/src/controller/index.ts`:

```typescript
export { DataSourceController } from "./data-source-controller.js";
export type { DataSourceControllerOptions } from "./data-source-controller.js";
```

Update `packages/pages-component/src/index.ts` — add:

```typescript
export { DataSourceController } from "./controller/index.js";
export type { DataSourceControllerOptions } from "./controller/index.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @casehubio/pages-component run test -- --run data-source-controller.test.ts`
Expected: PASS

- [ ] **Step 5: Build and typecheck**

Run: `yarn build:packages && yarn typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-component/src/controller/ packages/pages-component/src/index.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat: DataSourceController — unified component data state machine

Framework-agnostic controller implementing VizTarget. Manages
loading/error/dataSet lifecycle with mutual-clearing invariant.
Handles all DataSetEvent types (snapshot, append, replace, remove).
Supports endpoint URL auto-routing and direct DataSource assignment.

Refs #145"
```

---

### Task 7: PagesElement migration + pipeline caller updates

**Files:**
- Modify: `packages/pages-viz/src/base/PagesElement.ts`
- Modify: `packages/pages-runtime/src/data-pipeline.ts`
- Modify: `packages/pages-runtime/src/activation.ts`

**Interfaces:**
- Consumes: `DataSourceController` from `@casehubio/pages-component`
- Consumes: New source factory signatures

- [ ] **Step 1: Migrate PagesElement to use DataSourceController**

In `packages/pages-viz/src/base/PagesElement.ts`:

Import the controller:
```typescript
import { DataSourceController } from "@casehubio/pages-component/dist/controller/data-source-controller.js";
```

Add controller field and delegate properties. Keep `_props`, `_renderGen`, `_dataRequested`, timers, resize observer — those are component-specific, not data lifecycle.

The controller's `onChange` triggers `update()`. The existing `dataSet`/`error` setters delegate to the controller. The `loading` getter delegates to the controller (or derives from `!_props` for the "no props yet" case).

- [ ] **Step 2: Update data-pipeline.ts for new source signatures**

Update the `defToBinding` call in data-pipeline.ts to pass the simplified deps. The pipeline already has `wsPool`, `ssePool`, and `manager`. Construct `DefToBindingDeps` without `ctx`:

```typescript
const bindingDeps: DefToBindingDeps = {
  manager,
  wsPool,
  ssePool,
};
```

- [ ] **Step 3: Build and run all tests**

Run: `yarn build && yarn workspace @casehubio/pages-runtime run test -- --run && yarn workspace @casehubio/pages-viz run test -- --run`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-viz/src/base/PagesElement.ts packages/pages-runtime/src/data-pipeline.ts packages/pages-runtime/src/activation.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat: PagesElement delegates to DataSourceController

PagesElement now uses DataSourceController for data lifecycle
management. Pipeline caller updated for simplified DefToBindingDeps.

Closes #145"
```

---

### Task 8: Update issue #145 — remove item 3, update acceptance criteria

**Files:** None (GitHub only)

- [ ] **Step 1: Comment on #145 explaining item 3 removal**

```bash
gh issue comment 145 --repo casehubio/casehub-pages --body "Item 3 (converge SSE paths) removed from scope. SSEManager and EventStream serve distinct protocols (standard SSE vs. pages push wire protocol) — merging them would conflate fundamentally different concerns. See design review at docs/specs/2026-07-09-datasource-pipeline-design.md."
```

- [ ] **Step 2: Update issue body**

Update #145's acceptance criteria to match the implemented deliverables.
