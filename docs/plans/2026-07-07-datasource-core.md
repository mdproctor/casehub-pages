# DataSource Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> subagent-driven-development (recommended) or executing-plans to
> implement this plan task-by-task. Each task follows TDD
> (test-driven-development) and uses ide-tooling for structural
> editing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Focal issue:** #141 — DataSource Core — interfaces, sources, pipeline integration
**Issue group:** #140 (epic), #141, #142, #143
**Spec:** `docs/specs/2026-07-07-datasource-abstraction-design.md`

**Goal:** Replace `ExternalDataSetDef` with a unified `DataSource` abstraction where every data provider — REST, SSE, WebSocket, inline, CSV, simulated, replay — implements the same `connect(sink)/disconnect()` contract. The pipeline calls one method regardless of source type.

**Architecture:** New `datasource/` directory in pages-data contains all interfaces, the ScenarioController, and source implementations. Sources wrap existing resolution/push machinery — no rewrite of extraction, providers, or push infrastructure. The pipeline in pages-runtime is refactored to use `DataSource` uniformly. `ExternalDataSetDef` becomes internal, accessed only by the YAML backward-compat layer.

**Tech Stack:** TypeScript 5, Vitest, Yarn workspaces. No new dependencies.

## Global Constraints

- All code in `packages/pages-data/src/datasource/` (new) or modifications to existing files
- Follow existing test patterns: Vitest with `describe`/`it`, co-located `.test.ts` files
- `Disposable` is a new type — do not use any external disposable library
- Source constructors are pure functions — no side effects until `connect()` is called
- Every source must call `sink.error()` on failure — never throw from `connect()`
- The `ScenarioController` uses a virtual-time priority queue — no `Date.now()` in scheduling logic
- `pages-event-contract` protocol: do not add new reserved event names without updating the protocol
- `web-component-strategy` protocol: new web components use `pages-` prefix, Lit for interactive, vanilla for display-only
- `dataset-contract` protocol: `DataSourceBinding` will be added to the protocol's type inventory in the cleanup task

---

## File Structure

### New Files (pages-data)

```
packages/pages-data/src/datasource/
├── types.ts                          # DataSource, DataSink, SourceError, Disposable, MutableDataSource, DataAction, DataSourceBinding
├── controller.ts                     # ScenarioController interface, createScenarioController()
├── controller.test.ts
├── sources/
│   ├── inline-source.ts              # inlineSource()
│   ├── inline-source.test.ts
│   ├── csv-source.ts                 # csvSource()
│   ├── csv-source.test.ts
│   ├── rest-source.ts                # restSource()
│   ├── rest-source.test.ts
│   ├── sse-source.ts                 # sseSource()
│   ├── sse-source.test.ts
│   ├── ws-source.ts                  # wsSource()
│   ├── ws-source.test.ts
│   ├── composite-source.ts           # composite()
│   ├── composite-source.test.ts
│   ├── join-source.ts                # joinSource()
│   ├── join-source.test.ts
│   ├── post-message-source.ts        # postMessageSource()
│   ├── server-query-source.ts        # serverQuerySource()
│   ├── simulated/
│   │   ├── simulated-source.ts       # simulated()
│   │   ├── simulated-source.test.ts
│   │   ├── mutations.ts              # transition(), increment(), decrement(), addRow(), removeRow(), when()
│   │   ├── mutations.test.ts
│   │   └── mutation-tracking.ts      # per-row transition tracking, per-mutation increment timing
│   ├── replay-source.ts              # replay()
│   ├── replay-source.test.ts
│   ├── recording-source.ts           # recording()
│   └── recording-source.test.ts
└── index.ts                          # public API barrel
```

### Modified Files

```
packages/pages-data/src/index.ts                    # re-export datasource/index.ts
packages/pages-data/src/dataset/external/types.ts   # ExternalDataSetDef stays but removed from public exports

packages/pages-runtime/src/data-pipeline.ts         # refactored to use DataSource
packages/pages-runtime/src/dataset-scope.ts          # updated for DataSourceBinding

packages/pages-ui/src/dsl/builders.ts               # bind() added, dataset()/inlineDataset() removed
packages/pages-ui/src/dsl/builders.test.ts           # updated tests
packages/pages-ui/src/model/page-types.ts           # PageProps updated for DataSourceBinding
packages/pages-ui/src/dsl/index.ts                  # updated exports
packages/pages-ui/src/index.ts                      # updated exports
```

---

### Task 1: Characterisation Tests (Phase 0)

**Files:**
- Modify: `packages/pages-data/src/dataset/external/resolver.test.ts`
- Modify: `packages/pages-data/src/dataset/external/sources/sse-source.test.ts`
- Modify: `packages/pages-runtime/src/data-pipeline.test.ts`
- Modify: `packages/pages-runtime/src/data-pipeline-cleanup.test.ts`
- Modify: `packages/pages-runtime/src/data-pipeline-lifecycle.test.ts`

**Interfaces:**
- Consumes: existing `resolveExternalDataSet`, `SseSource`, `createDataPipeline` APIs
- Produces: nothing new — these tests lock current behaviour

**Purpose:** Fill test coverage gaps before refactoring. These tests become the regression safety net.

- [ ] **Step 1: Read existing resolver tests and identify gaps**

Use IntelliJ MCP to read `resolver.test.ts` and `resolver.ts`. Identify untested paths:
- content + expression combination
- accumulate mode (append vs replace on refresh)
- serverQuery routing
- join with missing constituents
- parameterised URL resolution

- [ ] **Step 2: Write resolver characterisation tests**

Add tests covering the gaps identified. Target: 16 new tests (19→35 total). Each test exercises a specific `resolveExternalDataSet()` path with known input/output.

```typescript
describe("resolveExternalDataSet — characterisation", () => {
  it("content + expression applies JSONata to inline JSON", async () => {
    const def: ExternalDataSetDef = {
      uuid: "test" as DataSetId,
      content: JSON.stringify([{ a: 1, b: 2 }, { a: 3, b: 4 }]),
      expression: "$[a > 1]",
    };
    const result = await resolveExternalDataSet(def, ctx);
    expect(result.dataset.rows).toHaveLength(1);
  });

  it("accumulate appends to existing dataset in manager", async () => {
    // Pre-populate manager with initial data
    manager.apply("test" as DataSetId, { type: "snapshot", dataset: initialDataset });
    const def: ExternalDataSetDef = {
      uuid: "test" as DataSetId,
      content: JSON.stringify([[5, "new"]]),
      accumulate: true,
      columns: [
        { id: "id" as ColumnId, type: "NUMBER" },
        { id: "name" as ColumnId, type: "TEXT" },
      ],
    };
    const result = await resolveExternalDataSet(def, ctx);
    // Original rows + new row
    expect(manager.get("test" as DataSetId)!.rows).toHaveLength(initialDataset.rows.length + 1);
  });

  // ... 14 more tests covering serverQuery, join, parameterised URLs, etc.
});
```

- [ ] **Step 3: Run resolver tests**

Run: `yarn workspace @casehubio/pages-data run test -- --run src/dataset/external/resolver.test.ts`
Expected: All tests PASS (existing + new)

- [ ] **Step 4: Write SSE source characterisation tests**

Add 17 new tests (13→30 total) covering reconnection, named events, batching, error handling — matching WebSocket source coverage patterns.

```typescript
describe("SseSource — characterisation", () => {
  it("reconnects with exponential backoff on connection loss", () => { /* ... */ });
  it("processes named events (snapshot, append, replace, remove)", () => { /* ... */ });
  it("batches rapid events via requestAnimationFrame", () => { /* ... */ });
  it("reports permanent error when max retries exceeded", () => { /* ... */ });
  // ... 13 more
});
```

- [ ] **Step 5: Run SSE tests**

Run: `yarn workspace @casehubio/pages-data run test -- --run src/dataset/external/sources/sse-source.test.ts`
Expected: All PASS

- [ ] **Step 6: Write pipeline lifecycle + cleanup characterisation tests**

Add 18 new tests total: 11 for lifecycle (4→15), 7 for cleanup (1→8).

Focus areas:
- Component subscription tracking across multiple datasets
- Push source resubscription after MutationObserver cleanup
- Refresh timer cancellation on dispose
- Multi-subscriber teardown ordering
- Pool release when last subscriber disconnects

- [ ] **Step 7: Run pipeline tests**

Run: `yarn workspace @casehubio/pages-runtime run test -- --run src/data-pipeline`
Expected: All PASS

- [ ] **Step 8: Commit characterisation tests**

```bash
git add packages/pages-data/src/dataset/external/resolver.test.ts packages/pages-data/src/dataset/external/sources/sse-source.test.ts packages/pages-runtime/src/data-pipeline.test.ts packages/pages-runtime/src/data-pipeline-cleanup.test.ts packages/pages-runtime/src/data-pipeline-lifecycle.test.ts
git commit -m "test: characterisation tests for resolver, SSE, pipeline lifecycle

Strengthens coverage before DataSource migration:
- Resolver: 19→35 tests (content+expression, accumulate, serverQuery, join, parameterised)
- SSE source: 13→30 tests (reconnection, named events, batching, errors)
- Pipeline lifecycle: 4→15 tests (subscription tracking, resubscription, refresh timers)
- Pipeline cleanup: 1→8 tests (multi-subscriber teardown, pool release)

Refs #141"
```

---

### Task 2: DataSource Core Interfaces + ScenarioController

**Files:**
- Create: `packages/pages-data/src/datasource/types.ts`
- Create: `packages/pages-data/src/datasource/controller.ts`
- Create: `packages/pages-data/src/datasource/controller.test.ts`
- Create: `packages/pages-data/src/datasource/index.ts`
- Modify: `packages/pages-data/src/index.ts`

**Interfaces:**
- Consumes: `DataSetEvent`, `DataSetId` from `dataset/events.ts` and `dataset/types.ts`
- Produces: `DataSource`, `DataSink`, `SourceError`, `Disposable`, `MutableDataSource`, `DataAction`, `DataSourceBinding`, `ScenarioController`, `createScenarioController`

- [ ] **Step 1: Write failing test for ScenarioController**

```typescript
// packages/pages-data/src/datasource/controller.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createScenarioController } from "./controller.js";

describe("ScenarioController", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("schedules callback at delay / speed real ms", () => {
    const ctrl = createScenarioController({ speed: 2 });
    const fn = vi.fn();
    ctrl.schedule(1000, fn);
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("tracks elapsed in scenario time, not real time", () => {
    const ctrl = createScenarioController({ speed: 2 });
    const fn = vi.fn();
    ctrl.schedule(1000, fn);
    vi.advanceTimersByTime(500);
    expect(ctrl.elapsed).toBe(1000);
  });

  it("pause() prevents scheduled callbacks from firing", () => {
    const ctrl = createScenarioController();
    const fn = vi.fn();
    ctrl.schedule(1000, fn);
    ctrl.pause();
    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
    expect(ctrl.playing).toBe(false);
  });

  it("play() resumes from paused position", () => {
    const ctrl = createScenarioController();
    const fn = vi.fn();
    ctrl.schedule(1000, fn);
    vi.advanceTimersByTime(500);
    ctrl.pause();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    ctrl.play();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("step() fires next callback then pauses", () => {
    const ctrl = createScenarioController();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    ctrl.schedule(100, fn1);
    ctrl.schedule(200, fn2);
    ctrl.pause();
    ctrl.step();
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).not.toHaveBeenCalled();
    expect(ctrl.playing).toBe(false);
    expect(ctrl.pending).toBe(1);
  });

  it("setSpeed() recalculates active timeout delay", () => {
    const ctrl = createScenarioController({ speed: 1 });
    const fn = vi.fn();
    ctrl.schedule(1000, fn);
    vi.advanceTimersByTime(200);
    ctrl.setSpeed(5);
    // 800ms scenario time remaining at 5x = 160ms real
    vi.advanceTimersByTime(160);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("dispose() from schedule cancels the callback", () => {
    const ctrl = createScenarioController();
    const fn = vi.fn();
    const disposable = ctrl.schedule(1000, fn);
    disposable.dispose();
    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("onEvent() receives entries when logged", () => {
    const ctrl = createScenarioController();
    const entries: unknown[] = [];
    ctrl.onEvent((e) => entries.push(e));
    // onEvent is used by sources to log — tested via simulated source
    // Here just verify the subscription mechanism works
    expect(entries).toHaveLength(0);
  });

  it("defaults: speed=1, playing=true", () => {
    const ctrl = createScenarioController();
    expect(ctrl.speed).toBe(1);
    expect(ctrl.playing).toBe(true);
    expect(ctrl.elapsed).toBe(0);
    expect(ctrl.pending).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @casehubio/pages-data run test -- --run src/datasource/controller.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write types.ts**

```typescript
// packages/pages-data/src/datasource/types.ts
import type { DataSetEvent } from "../dataset/events.js";
import type { DataSetId } from "../dataset/types.js";

export interface Disposable {
  dispose(): void;
}

export interface SourceError {
  readonly message: string;
  readonly permanent: boolean;
}

export interface DataSink {
  apply(event: DataSetEvent): void;
  error(err: SourceError): void;
}

export interface DataSource {
  connect(sink: DataSink): void;
  disconnect(): void;
}

export type DataAction =
  | { type: "update"; key: string; changes: Record<string, unknown> }
  | { type: "create"; data: Record<string, unknown> }
  | { type: "delete"; key: string };

export interface MutableDataSource extends DataSource {
  dispatch(action: DataAction): void;
}

export interface DataSourceBinding {
  readonly id: DataSetId;
  readonly source: DataSource;
  readonly keyColumn?: string;
}
```

- [ ] **Step 4: Write controller.ts**

```typescript
// packages/pages-data/src/datasource/controller.ts
import type { DataSetId } from "../dataset/types.js";
import type { DataSetEvent } from "../dataset/events.js";
import type { Disposable } from "./types.js";

export interface ScenarioAnnotation {
  readonly text: string;
  readonly target?: string;
  readonly style: AnnotationStyle;
  readonly duration?: number;
}

export type AnnotationStyle =
  | { type: "label"; position?: AnchorPosition }
  | { type: "arrow" }
  | { type: "circle" }
  | { type: "highlight-box" }
  | { type: "highlight-line" };

export type AnchorPosition = "above" | "below" | "left" | "right";

export interface EventLogEntry {
  readonly timestamp: number;
  readonly wallTime: number;
  readonly dataSetId: DataSetId;
  readonly event: DataSetEvent;
  readonly source: string;
}

export interface ScenarioController {
  readonly speed: number;
  setSpeed(multiplier: number): void;
  play(): void;
  pause(): void;
  readonly playing: boolean;
  step(): void;
  readonly pending: number;
  schedule(delayMs: number, callback: () => void): Disposable;
  readonly elapsed: number;
  readonly activeAnnotations: readonly ScenarioAnnotation[];
  onAnnotation(listener: (annotations: readonly ScenarioAnnotation[]) => void): Disposable;
  onEvent(listener: (entry: EventLogEntry) => void): Disposable;
  logEvent(entry: EventLogEntry): void;
}

export interface ScenarioControllerOptions {
  readonly speed?: number;
  readonly playing?: boolean;
}

interface ScheduledEntry {
  readonly fireAt: number;
  readonly callback: () => void;
  cancelled: boolean;
}

export function createScenarioController(
  options?: ScenarioControllerOptions,
): ScenarioController {
  let speed = options?.speed ?? 1;
  let playing = options?.playing ?? true;
  let elapsed = 0;
  let lastRealTime = performance.now();

  const queue: ScheduledEntry[] = [];
  let activeTimeout: ReturnType<typeof setTimeout> | null = null;

  const eventListeners = new Set<(entry: EventLogEntry) => void>();
  const annotationListeners = new Set<(annotations: readonly ScenarioAnnotation[]) => void>();
  const annotations: ScenarioAnnotation[] = [];

  function reschedule(): void {
    if (activeTimeout !== null) {
      clearTimeout(activeTimeout);
      activeTimeout = null;
    }
    if (!playing) return;

    // Remove cancelled entries from front
    while (queue.length > 0 && queue[0]!.cancelled) {
      queue.shift();
    }
    if (queue.length === 0) return;

    const next = queue[0]!;
    const scenarioRemaining = next.fireAt - elapsed;
    const realDelay = Math.max(0, scenarioRemaining / speed);

    activeTimeout = setTimeout(() => {
      activeTimeout = null;
      elapsed = next.fireAt;
      lastRealTime = performance.now();
      queue.shift();
      next.callback();
      reschedule();
    }, realDelay);
  }

  return {
    get speed() { return speed; },
    setSpeed(multiplier: number) {
      // Update elapsed based on real time passed since last checkpoint
      if (playing && activeTimeout !== null) {
        const now = performance.now();
        const realElapsed = now - lastRealTime;
        elapsed += realElapsed * speed;
        lastRealTime = now;
      }
      speed = multiplier;
      reschedule();
    },

    play() {
      if (playing) return;
      playing = true;
      lastRealTime = performance.now();
      reschedule();
    },

    pause() {
      if (!playing) return;
      if (activeTimeout !== null) {
        const now = performance.now();
        const realElapsed = now - lastRealTime;
        elapsed += realElapsed * speed;
        clearTimeout(activeTimeout);
        activeTimeout = null;
      }
      playing = false;
      lastRealTime = performance.now();
    },

    get playing() { return playing; },

    step() {
      // Remove cancelled entries
      while (queue.length > 0 && queue[0]!.cancelled) {
        queue.shift();
      }
      if (queue.length === 0) return;

      const next = queue.shift()!;
      elapsed = next.fireAt;
      lastRealTime = performance.now();
      next.callback();
      playing = false;
      if (activeTimeout !== null) {
        clearTimeout(activeTimeout);
        activeTimeout = null;
      }
    },

    get pending() {
      return queue.filter(e => !e.cancelled).length;
    },

    schedule(delayMs: number, callback: () => void): Disposable {
      const entry: ScheduledEntry = {
        fireAt: elapsed + delayMs,
        callback,
        cancelled: false,
      };

      // Insert sorted by fireAt
      let i = 0;
      while (i < queue.length && queue[i]!.fireAt <= entry.fireAt) i++;
      queue.splice(i, 0, entry);

      // If this is now the earliest, reschedule
      if (i === 0 && playing) {
        reschedule();
      }

      return {
        dispose() {
          entry.cancelled = true;
        },
      };
    },

    get elapsed() { return elapsed; },

    get activeAnnotations() { return annotations as readonly ScenarioAnnotation[]; },

    onAnnotation(listener: (annotations: readonly ScenarioAnnotation[]) => void): Disposable {
      annotationListeners.add(listener);
      return { dispose() { annotationListeners.delete(listener); } };
    },

    onEvent(listener: (entry: EventLogEntry) => void): Disposable {
      eventListeners.add(listener);
      return { dispose() { eventListeners.delete(listener); } };
    },

    logEvent(entry: EventLogEntry): void {
      for (const listener of eventListeners) {
        listener(entry);
      }
    },
  };
}
```

- [ ] **Step 5: Write barrel export**

```typescript
// packages/pages-data/src/datasource/index.ts
export type {
  DataSource,
  DataSink,
  SourceError,
  Disposable,
  MutableDataSource,
  DataAction,
  DataSourceBinding,
} from "./types.js";

export type {
  ScenarioController,
  ScenarioControllerOptions,
  ScenarioAnnotation,
  AnnotationStyle,
  AnchorPosition,
  EventLogEntry,
} from "./controller.js";

export { createScenarioController } from "./controller.js";
```

- [ ] **Step 6: Update pages-data index.ts**

Add `export * from "./datasource/index.js";` to `packages/pages-data/src/index.ts`.

- [ ] **Step 7: Run controller tests**

Run: `yarn workspace @casehubio/pages-data run test -- --run src/datasource/controller.test.ts`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add packages/pages-data/src/datasource/
git commit -m "feat: DataSource core interfaces and ScenarioController

Adds DataSource, DataSink, SourceError, Disposable, MutableDataSource,
DataAction, DataSourceBinding types. ScenarioController with virtual-time
priority queue: schedule, speed control, pause/resume, step.

Refs #141"
```

---

### Task 3: inlineSource + csvSource

**Files:**
- Create: `packages/pages-data/src/datasource/sources/inline-source.ts`
- Create: `packages/pages-data/src/datasource/sources/inline-source.test.ts`
- Create: `packages/pages-data/src/datasource/sources/csv-source.ts`
- Create: `packages/pages-data/src/datasource/sources/csv-source.test.ts`
- Modify: `packages/pages-data/src/datasource/index.ts`

**Interfaces:**
- Consumes: `DataSource`, `DataSink` from `types.ts`; `toTypedDataSet` from `dataset/conversion.ts`; `parseCsv` from `dataset/external/csv.ts`
- Produces: `inlineSource(data, options?)`, `csvSource(csv, options?)`

- [ ] **Step 1: Write failing tests for inlineSource**

```typescript
// packages/pages-data/src/datasource/sources/inline-source.test.ts
import { describe, it, expect, vi } from "vitest";
import { inlineSource } from "./inline-source.js";
import type { DataSink } from "../types.js";

function createMockSink(): DataSink & { events: unknown[]; errors: unknown[] } {
  const events: unknown[] = [];
  const errors: unknown[] = [];
  return {
    events,
    errors,
    apply(event) { events.push(event); },
    error(err) { errors.push(err); },
  };
}

describe("inlineSource", () => {
  it("emits snapshot on connect with raw row arrays", () => {
    const source = inlineSource([[1, "Alice"], [2, "Bob"]], {
      columns: [
        { id: "id", type: "NUMBER" },
        { id: "name", type: "TEXT" },
      ],
    });
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({ type: "snapshot" });
  });

  it("emits snapshot from JSON string", () => {
    const source = inlineSource(JSON.stringify([[1, "Alice"]]), {
      columns: [{ id: "id", type: "NUMBER" }, { id: "name", type: "TEXT" }],
    });
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1);
  });

  it("emits snapshot from object array", () => {
    const source = inlineSource([{ id: 1, name: "Alice" }]);
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1);
    const snapshot = sink.events[0] as { type: string; dataset: { rows: unknown[] } };
    expect(snapshot.dataset.rows).toHaveLength(1);
  });

  it("disconnect is a no-op (already emitted)", () => {
    const source = inlineSource([[1]], { columns: [{ id: "x", type: "NUMBER" }] });
    const sink = createMockSink();
    source.connect(sink);
    expect(() => source.disconnect()).not.toThrow();
  });

  it("reports error on malformed JSON string", () => {
    const source = inlineSource("not valid json");
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.errors).toHaveLength(1);
    expect(sink.errors[0]).toMatchObject({ permanent: true });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn workspace @casehubio/pages-data run test -- --run src/datasource/sources/inline-source.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement inlineSource**

```typescript
// packages/pages-data/src/datasource/sources/inline-source.ts
import type { DataSource, DataSink } from "../types.js";
import type { ExternalColumnDef } from "../../dataset/external/types.js";
import { toTypedDataSet } from "../../dataset/conversion.js";

export type InlineData =
  | readonly unknown[][]
  | string
  | Record<string, unknown>[];

export interface InlineSourceOptions {
  readonly columns?: readonly ExternalColumnDef[];
  readonly expression?: string;
  readonly dataPath?: string;
  readonly type?: string;
}

export function inlineSource(data: InlineData, options?: InlineSourceOptions): DataSource {
  return {
    connect(sink: DataSink): void {
      try {
        let rows: unknown[][];

        if (typeof data === "string") {
          const parsed: unknown = JSON.parse(data);
          if (!Array.isArray(parsed)) {
            sink.error({ message: "Inline data string must parse to an array", permanent: true });
            return;
          }
          rows = parsed as unknown[][];
        } else if (Array.isArray(data) && data.length > 0 && !Array.isArray(data[0])) {
          // Object array — convert to row arrays
          const objects = data as Record<string, unknown>[];
          const keys = Object.keys(objects[0]!);
          rows = objects.map(obj => keys.map(k => obj[k]));
          if (!options?.columns) {
            // Infer columns from object keys
            const cols = keys.map(k => ({ id: k, type: "TEXT" as const }));
            const dataset = toTypedDataSet({
              columns: cols.map(c => ({ id: c.id, type: c.type })),
              data: rows.map(r => r.map(v => v === null || v === undefined ? null : String(v))),
            });
            sink.apply({ type: "snapshot", dataset });
            return;
          }
        } else {
          rows = data as unknown[][];
        }

        const columns = options?.columns ?? [];
        const dataset = toTypedDataSet({
          columns: columns.map(c => ({ id: c.id, type: c.type, name: c.name })),
          data: rows.map(r => r.map(v => v === null || v === undefined ? null : String(v))),
        });
        sink.apply({ type: "snapshot", dataset });
      } catch (err) {
        sink.error({
          message: err instanceof Error ? err.message : String(err),
          permanent: true,
        });
      }
    },

    disconnect(): void {
      // no-op — synchronous source, already emitted
    },
  };
}
```

- [ ] **Step 4: Run inlineSource tests**

Run: `yarn workspace @casehubio/pages-data run test -- --run src/datasource/sources/inline-source.test.ts`
Expected: All PASS

- [ ] **Step 5: Write failing tests for csvSource**

```typescript
// packages/pages-data/src/datasource/sources/csv-source.test.ts
import { describe, it, expect } from "vitest";
import { csvSource } from "./csv-source.js";
import type { DataSink } from "../types.js";

function createMockSink(): DataSink & { events: unknown[]; errors: unknown[] } {
  const events: unknown[] = [];
  const errors: unknown[] = [];
  return { events, errors, apply(e) { events.push(e); }, error(e) { errors.push(e); } };
}

describe("csvSource", () => {
  it("parses CSV with headers", () => {
    const csv = "id,name\n1,Alice\n2,Bob";
    const source = csvSource(csv);
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1);
    const snapshot = sink.events[0] as { dataset: { rows: unknown[]; columns: unknown[] } };
    expect(snapshot.dataset.rows).toHaveLength(2);
    expect(snapshot.dataset.columns).toHaveLength(2);
  });

  it("respects explicit column definitions", () => {
    const csv = "1,Alice\n2,Bob";
    const source = csvSource(csv, {
      hasHeader: false,
      columns: [
        { id: "id", type: "NUMBER" },
        { id: "name", type: "TEXT" },
      ],
    });
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1);
  });

  it("uses custom delimiter", () => {
    const csv = "id;name\n1;Alice";
    const source = csvSource(csv, { delimiter: ";" });
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1);
  });

  it("reports error on empty CSV", () => {
    const source = csvSource("");
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.errors).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Implement csvSource**

```typescript
// packages/pages-data/src/datasource/sources/csv-source.ts
import type { DataSource, DataSink } from "../types.js";
import type { ExternalColumnDef } from "../../dataset/external/types.js";
import { parseCsv } from "../../dataset/external/csv.js";
import { toTypedDataSet } from "../../dataset/conversion.js";

export interface CsvSourceOptions {
  readonly delimiter?: string;
  readonly hasHeader?: boolean;
  readonly columns?: readonly ExternalColumnDef[];
}

export function csvSource(csv: string, options?: CsvSourceOptions): DataSource {
  return {
    connect(sink: DataSink): void {
      try {
        const parsed = parseCsv(csv, {
          delimiter: options?.delimiter,
          hasHeader: options?.hasHeader ?? true,
        });

        if (parsed.rows.length === 0 && parsed.headers.length === 0) {
          sink.error({ message: "CSV is empty", permanent: true });
          return;
        }

        const columns = options?.columns ?? parsed.headers.map(h => ({
          id: h,
          type: "TEXT" as const,
        }));

        const dataset = toTypedDataSet({
          columns: columns.map(c => ({ id: c.id, type: c.type, name: c.name })),
          data: parsed.rows,
        });

        sink.apply({ type: "snapshot", dataset });
      } catch (err) {
        sink.error({
          message: err instanceof Error ? err.message : String(err),
          permanent: true,
        });
      }
    },

    disconnect(): void {},
  };
}
```

- [ ] **Step 7: Run csvSource tests**

Run: `yarn workspace @casehubio/pages-data run test -- --run src/datasource/sources/csv-source.test.ts`
Expected: All PASS

- [ ] **Step 8: Update barrel exports and commit**

Add exports to `packages/pages-data/src/datasource/index.ts`:
```typescript
export { inlineSource } from "./sources/inline-source.js";
export type { InlineData, InlineSourceOptions } from "./sources/inline-source.js";
export { csvSource } from "./sources/csv-source.js";
export type { CsvSourceOptions } from "./sources/csv-source.js";
```

```bash
git add packages/pages-data/src/datasource/
git commit -m "feat: inlineSource and csvSource implementations

inlineSource accepts raw arrays, JSON strings, and object arrays.
csvSource parses CSV with configurable delimiter and header detection.
Both emit a single snapshot event on connect.

Refs #141"
```

---

### Task 4: Simulated Source + Mutation DSL

**Files:**
- Create: `packages/pages-data/src/datasource/sources/simulated/mutations.ts`
- Create: `packages/pages-data/src/datasource/sources/simulated/mutations.test.ts`
- Create: `packages/pages-data/src/datasource/sources/simulated/mutation-tracking.ts`
- Create: `packages/pages-data/src/datasource/sources/simulated/simulated-source.ts`
- Create: `packages/pages-data/src/datasource/sources/simulated/simulated-source.test.ts`
- Modify: `packages/pages-data/src/datasource/index.ts`

**Interfaces:**
- Consumes: `DataSource`, `DataSink`, `MutableDataSource`, `DataAction` from `types.ts`; `ScenarioController` from `controller.ts`
- Produces: `simulated(config)`, `transition()`, `increment()`, `decrement()`, `addRow()`, `removeRow()`, `when()`

This is the largest single task — the simulation engine. Full TDD with mutation DSL tests first, then simulated source lifecycle tests.

- [ ] **Step 1: Write failing tests for mutation DSL**

Test each mutation type independently against a static row set. These test the pure logic — no controller or timing involved.

```typescript
// packages/pages-data/src/datasource/sources/simulated/mutations.test.ts
import { describe, it, expect } from "vitest";
import { transition, increment, decrement, addRow, removeRow, when, evaluateMutations } from "./mutations.js";

describe("Mutation DSL", () => {
  describe("transition", () => {
    it("transitions row when delay has elapsed", () => {
      const mut = transition("status", { from: "PENDING", to: "ASSIGNED", after: [100, 100] });
      // Test with tracking state showing delay elapsed
      // ... detailed test with evaluateMutations()
    });

    it("does not transition when delay has not elapsed", () => { /* ... */ });
    it("applies probability check", () => { /* ... */ });
    it("ignores rows not in 'from' state", () => { /* ... */ });
  });

  describe("increment", () => {
    it("increments all rows when every interval elapsed", () => { /* ... */ });
    it("respects ceiling", () => { /* ... */ });
    it("does not increment before every interval", () => { /* ... */ });
  });

  describe("decrement", () => {
    it("decrements all rows when every interval elapsed", () => { /* ... */ });
    it("respects floor", () => { /* ... */ });
  });

  describe("addRow", () => {
    it("appends generated row when probability hits", () => { /* ... */ });
    it("does not append when probability misses", () => { /* ... */ });
  });

  describe("removeRow", () => {
    it("removes rows matching predicate", () => { /* ... */ });
    it("applies probability", () => { /* ... */ });
  });

  describe("when", () => {
    it("applies nested mutations only to matching rows", () => { /* ... */ });
    it("does not apply to non-matching rows", () => { /* ... */ });
  });

  describe("evaluateMutations — snapshot semantics", () => {
    it("all mutations see tick-start state, not intermediate", () => {
      // Two mutations: one transitions PENDING→ASSIGNED, another checks for PENDING
      // Both should see the original PENDING state
    });
  });
});
```

- [ ] **Step 2: Implement mutations.ts and mutation-tracking.ts**

The mutation types, DSL constructors, and `evaluateMutations()` function. See spec §2.4 for the snapshot-semantics tick evaluation model.

- [ ] **Step 3: Run mutation tests**

Run: `yarn workspace @casehubio/pages-data run test -- --run src/datasource/sources/simulated/mutations.test.ts`
Expected: All PASS

- [ ] **Step 4: Write failing tests for simulated source**

```typescript
// packages/pages-data/src/datasource/sources/simulated/simulated-source.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { simulated } from "./simulated-source.js";
import { inlineSource } from "../inline-source.js";
import { createScenarioController } from "../../controller.js";
import { transition, decrement } from "./mutations.js";
import type { DataSink } from "../../types.js";

describe("simulated source", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("emits initial snapshot then starts ticking", () => {
    const ctrl = createScenarioController();
    const source = simulated({
      initial: inlineSource([[1, "PENDING"]], {
        columns: [{ id: "id", type: "NUMBER" }, { id: "status", type: "TEXT" }],
      }),
      controller: ctrl,
      keyColumn: "id",
      mutations: [transition("status", { from: "PENDING", to: "DONE", after: [100, 100] })],
      interval: 1000,
    });
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1); // initial snapshot
    expect(sink.events[0]).toMatchObject({ type: "snapshot" });
  });

  it("applies mutations on tick", () => {
    const ctrl = createScenarioController();
    const source = simulated({
      initial: inlineSource([[1, "PENDING"]], {
        columns: [{ id: "id", type: "NUMBER" }, { id: "status", type: "TEXT" }],
      }),
      controller: ctrl,
      keyColumn: "id",
      mutations: [transition("status", { from: "PENDING", to: "DONE", after: [0, 0] })],
      interval: 1000,
    });
    const sink = createMockSink();
    source.connect(sink);
    vi.advanceTimersByTime(1000);
    expect(sink.events.length).toBeGreaterThan(1); // snapshot + replace
  });

  it("dispatch() applies DataAction and emits event", () => {
    const ctrl = createScenarioController();
    const source = simulated({
      initial: inlineSource([[1, "PENDING"]], {
        columns: [{ id: "id", type: "NUMBER" }, { id: "status", type: "TEXT" }],
      }),
      controller: ctrl,
      keyColumn: "id",
      mutations: [],
    });
    const sink = createMockSink();
    source.connect(sink);
    source.dispatch({ type: "update", key: "1", changes: { status: "ASSIGNED" } });
    const replaceEvent = sink.events.find((e: any) => e.type === "replace");
    expect(replaceEvent).toBeDefined();
  });

  it("disconnect() cancels tick timer", () => {
    const ctrl = createScenarioController();
    const source = simulated({
      initial: inlineSource([[1, "X"]], {
        columns: [{ id: "id", type: "NUMBER" }, { id: "val", type: "TEXT" }],
      }),
      controller: ctrl,
      keyColumn: "id",
      mutations: [],
      interval: 1000,
    });
    const sink = createMockSink();
    source.connect(sink);
    source.disconnect();
    const countBefore = sink.events.length;
    vi.advanceTimersByTime(5000);
    expect(sink.events.length).toBe(countBefore);
  });
});
```

- [ ] **Step 5: Implement simulated-source.ts**

The simulated source lifecycle: connect initial → capture snapshot → start tick timer → evaluate mutations per tick → emit events. See spec §2.4 for edge cases (initial error, non-snapshot events, disconnect during init).

- [ ] **Step 6: Run simulated source tests**

Run: `yarn workspace @casehubio/pages-data run test -- --run src/datasource/sources/simulated/`
Expected: All PASS

- [ ] **Step 7: Update barrel exports and commit**

```bash
git add packages/pages-data/src/datasource/sources/simulated/
git commit -m "feat: simulated source with mutation DSL

Simulation engine: transition, increment, decrement, addRow, removeRow,
when mutations. Snapshot-semantics tick evaluation. MutableDataSource
dispatch for user actions. Lifecycle: initial→snapshot→tick timer.

Refs #141"
```

---

### Task 5: replay + recording Sources

**Files:**
- Create: `packages/pages-data/src/datasource/sources/replay-source.ts`
- Create: `packages/pages-data/src/datasource/sources/replay-source.test.ts`
- Create: `packages/pages-data/src/datasource/sources/recording-source.ts`
- Create: `packages/pages-data/src/datasource/sources/recording-source.test.ts`
- Modify: `packages/pages-data/src/datasource/index.ts`

**Interfaces:**
- Consumes: `DataSource`, `DataSink`, `ScenarioController` from core
- Produces: `replay(events, controller, options?)`, `recording(innerSource)`, `RecordedEvent`, `RecordingCapture`

- [ ] **Step 1: Write failing tests for replay**

Test timing at various speeds, loop behaviour, step interaction, empty sequence.

- [ ] **Step 2: Implement replay-source.ts**

Schedules each `RecordedEvent` via `controller.schedule(offsetMs, ...)`. On connect, schedules all events. Loop: re-schedules from offset 0 after last event fires.

- [ ] **Step 3: Run replay tests** → PASS

- [ ] **Step 4: Write failing tests for recording**

Test capture fidelity, clear(), round-trip with replay.

- [ ] **Step 5: Implement recording-source.ts**

Wraps inner source, intercepts `sink.apply()`, captures `{ offsetMs: elapsed, event }`.

- [ ] **Step 6: Run recording tests** → PASS

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: replay and recording sources

replay() schedules recorded events via controller with speed scaling.
recording() decorates any DataSource to capture timestamped events.
Round-trip tested: record → getRecording() → replay().

Refs #141"
```

---

### Task 6: Wrapped Sources (rest, sse, ws, composite, join, postMessage, serverQuery)

**Files:**
- Create: `packages/pages-data/src/datasource/sources/rest-source.ts`
- Create: `packages/pages-data/src/datasource/sources/rest-source.test.ts`
- Create: `packages/pages-data/src/datasource/sources/sse-source.ts`
- Create: `packages/pages-data/src/datasource/sources/ws-source.ts`
- Create: `packages/pages-data/src/datasource/sources/composite-source.ts`
- Create: `packages/pages-data/src/datasource/sources/composite-source.test.ts`
- Create: `packages/pages-data/src/datasource/sources/join-source.ts`
- Create: `packages/pages-data/src/datasource/sources/post-message-source.ts`
- Create: `packages/pages-data/src/datasource/sources/server-query-source.ts`
- Modify: `packages/pages-data/src/datasource/index.ts`

**Interfaces:**
- Consumes: existing `resolveExternalDataSet`, `PushPool`, `PushSource`, `SseSource`, `WebSocketSource`, `joinDataSets`, `PostMessageProvider`, `ServerQueryClient`
- Produces: `restSource()`, `sseSource()`, `wsSource()`, `composite()`, `joinSource()`, `postMessageSource()`, `serverQuerySource()`

These wrap existing machinery. The key principle: each creates an `ExternalDataSetDef` internally and delegates to the existing resolution/push engine. The DataSource interface is the only public surface.

- [ ] **Steps 1-2: restSource — tests then implementation**

`restSource` creates an `ExternalDataSetDef` from its options and calls `resolveExternalDataSet()` on connect. Refresh scheduling (if `refreshTime` set) uses `setInterval` internally (not controller — REST polling is real-time).

- [ ] **Steps 3-4: sseSource/wsSource — tests then implementation**

Wrappers that acquire from `PushPool` and subscribe. Connection pooling preserved — same base URL shares one connection. Map `PushSourceError` to `sink.error()`.

- [ ] **Steps 5-6: composite — tests then implementation**

Initial→live handoff per spec §2.7. Edge cases tested: initial error, non-snapshot events, disconnect during init.

- [ ] **Steps 7-8: joinSource, postMessageSource, serverQuerySource — tests then implementation**

Thin wrappers. `joinSource` calls `joinDataSets()`. `postMessageSource` and `serverQuerySource` are the least-used paths — minimal tests covering the happy path.

- [ ] **Step 9: Full integration test**

Verify `restSource` produces identical output to `resolveExternalDataSet()` for the same definition. Use the characterisation test data from Task 1.

- [ ] **Step 10: Commit**

```bash
git commit -m "feat: wrapped sources — rest, sse, ws, composite, join, postMessage, serverQuery

Each wraps existing resolution/push machinery behind the DataSource
interface. Connection pooling preserved for SSE/WS via PushPool.
Integration tests verify identical output to ExternalDataSetDef resolution.

Refs #141"
```

---

### Task 7: Pipeline Integration + pages-ui Updates

**Files:**
- Modify: `packages/pages-runtime/src/data-pipeline.ts`
- Modify: `packages/pages-runtime/src/data-pipeline.test.ts`
- Modify: `packages/pages-runtime/src/dataset-scope.ts`
- Modify: `packages/pages-ui/src/dsl/builders.ts`
- Modify: `packages/pages-ui/src/dsl/builders.test.ts`
- Modify: `packages/pages-ui/src/model/page-types.ts`
- Modify: `packages/pages-ui/src/dsl/index.ts`
- Modify: `packages/pages-ui/src/index.ts`
- Modify: `packages/pages-data/src/datasource/index.ts`

**Interfaces:**
- Consumes: all DataSource types and source constructors from tasks 2-6
- Produces: `bind()` builder, refactored `DataPipeline`, `defToBinding()` YAML compat

This is the integration task — wiring everything together.

- [ ] **Step 1: Add `bind()` to pages-ui builders**

```typescript
// In packages/pages-ui/src/dsl/builders.ts
import type { DataSourceBinding, DataSource } from "@casehubio/pages-data";
import type { DataSetId } from "@casehubio/pages-data/dist/dataset/types.js";

export function bind(
  id: string,
  source: DataSource,
  options?: { keyColumn?: string },
): DataSourceBinding {
  return Object.freeze({
    id: id as DataSetId,
    source,
    ...(options?.keyColumn !== undefined && { keyColumn: options.keyColumn }),
  });
}
```

- [ ] **Step 2: Update PageProps to accept DataSourceBinding[]**

In `packages/pages-ui/src/model/page-types.ts`, change `datasets` type from `ExternalDataSetDef[]` to `DataSourceBinding[]`. Add import.

- [ ] **Step 3: Write `defToBinding()` YAML backward-compat mapping**

Create the conversion function per spec §6.4. Each mapping rule is a tested function.

```typescript
// packages/pages-data/src/datasource/sources/def-to-binding.ts
import type { ExternalDataSetDef } from "../../dataset/external/types.js";
import type { DataSourceBinding } from "../types.js";
import { inlineSource } from "./inline-source.js";
import { restSource } from "./rest-source.js";
import { sseSource } from "./sse-source.js";
import { wsSource } from "./ws-source.js";
import { joinSource } from "./join-source.js";
import { serverQuerySource } from "./server-query-source.js";

export function defToBinding(def: ExternalDataSetDef): DataSourceBinding {
  if (def.content !== undefined) {
    return { id: def.uuid, source: inlineSource(def.content, { columns: def.columns, expression: def.expression, dataPath: def.dataPath, type: def.type }), keyColumn: def.keyColumn };
  }
  if (def.join !== undefined) {
    return { id: def.uuid, source: joinSource(...def.join) };
  }
  if (def.serverQuery && def.url) {
    return { id: def.uuid, source: serverQuerySource(def.url, { columns: def.columns, refreshTime: def.refreshTime }) };
  }
  const url = def.url ?? "";
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return { id: def.uuid, source: wsSource(url, { keyColumn: def.keyColumn, columns: def.columns }), keyColumn: def.keyColumn };
  }
  if (url.startsWith("sse://") || url.startsWith("sses://")) {
    return { id: def.uuid, source: sseSource(url, { keyColumn: def.keyColumn, columns: def.columns }), keyColumn: def.keyColumn };
  }
  return {
    id: def.uuid,
    source: restSource(url, {
      method: def.method, headers: def.headers, query: def.query, body: def.body, form: def.form,
      dataPath: def.dataPath, type: def.type, expression: def.expression, columns: def.columns,
      refreshTime: def.refreshTime, accumulate: def.accumulate, maxRows: def.cacheMaxRows, cacheEnabled: def.cacheEnabled,
    }),
    keyColumn: def.keyColumn,
  };
}
```

- [ ] **Step 4: Refactor DataPipeline**

Replace the routing logic in `handleDataRequest()`. Instead of checking URL prefixes and calling different resolution paths, the pipeline:
1. Looks up the `DataSourceBinding` for the requested dataset
2. If the source hasn't been connected yet, creates a `DataSink` wrapper and calls `source.connect(sink)`
3. Tracks connected sources for cleanup on disconnect

The existing push subscription tracking, component cleanup via MutationObserver, and refresh scheduling move into the wrapped sources — they're no longer pipeline concerns.

- [ ] **Step 5: Write pipeline integration tests**

Test that `DataPipeline` with `DataSourceBinding[]` produces the same results as with `ExternalDataSetDef[]` for each source type.

- [ ] **Step 6: Remove `dataset()` and `inlineDataset()` from pages-ui**

Remove the deprecated builders from `builders.ts`. Update exports in `index.ts`. Update `builders.test.ts`.

- [ ] **Step 7: Run full test suite**

Run: `yarn test` (all packages)
Expected: All PASS. Any failures are regressions from the refactoring.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat: pipeline integration — DataSource replaces ExternalDataSetDef

DataPipeline refactored to call source.connect(sink) uniformly.
bind() builder replaces dataset()/inlineDataset(). defToBinding()
provides YAML backward compatibility. ExternalDataSetDef becomes
internal.

Refs #141"
```

---

### Task 8: Typecheck, Lint, Final Verification

**Files:**
- No new files — verification pass

- [ ] **Step 1: Run typecheck**

Run: `yarn typecheck`
Expected: No errors. Fix any type mismatches from the migration.

- [ ] **Step 2: Run lint**

Run: `yarn lint`
Expected: No errors.

- [ ] **Step 3: Run full test suite**

Run: `yarn test`
Expected: All PASS.

- [ ] **Step 4: Run build**

Run: `yarn build`
Expected: All packages build successfully.

- [ ] **Step 5: Protocol coherence review**

Read `docs/protocols/casehub/dataset-contract.md` — verify DataSourceBinding is mentioned or flag for update in cleanup phase (#143).

Read `docs/protocols/casehub/pages-event-contract.md` — verify no new reserved event names were added without updating the protocol.

Read `docs/protocols/casehub/web-component-strategy.md` — verify any new web components follow naming/approach conventions.

- [ ] **Step 6: Commit any fixes**

```bash
git commit -m "fix: typecheck, lint, and protocol coherence fixes

Refs #141"
```
