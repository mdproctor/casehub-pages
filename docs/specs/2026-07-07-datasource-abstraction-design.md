# DataSource Abstraction — Seamless Live/Mock/Simulated/Replay Data

**Issue:** casehubio/casehub-pages#140
**Date:** 2026-07-07
**Status:** Draft
**Epic:** Yes — sub-issues per implementation phase

## Goal

The UI code is identical regardless of whether data is live, mocked, simulated, or
replayed. The data source is a configuration concern — swap it without changing a
single line of rendering code. A ScenarioController manages the temporal dimension,
enabling scripted demos with data simulation, UI automation, and visual annotations
that run themselves at controllable speed, from any browser tab or machine.

## Non-Goals

- Server-side simulation engine (all simulation runs client-side)
- Persistent recording storage (recordings are in-memory or exported as JSON)
- Visual annotation editor UI (annotations are authored in TypeScript; a visual
  editor is future work)

---

## 1. Core Interfaces

### 1.1 DataSource and DataSink

```typescript
interface DataSource {
  connect(sink: DataSink): void;
  disconnect(): void;
}

interface DataSink {
  apply(event: DataSetEvent): void;
  error(err: SourceError): void;
}

interface SourceError {
  readonly message: string;
  readonly permanent: boolean;
}
```

`DataSource` is the single abstraction for all data provision. It emits
`DataSetEvent`s (snapshot, append, replace, remove — unchanged) into a `DataSink`.
The source knows nothing about `DataSetManager` or `DataSetId` — the pipeline
creates a thin `DataSink` wrapper:
`{ apply: (e) => manager.apply(id, e), error: (e) => setComponentError(id, e) }`.

The error channel preserves existing error propagation: a `PushSourceError` with
`permanent: false` logs and continues; `permanent: true` sets `target.error` on
all components bound to that dataset. Sources report fetch failures, auth expiry,
connection drops, and malformed responses through `sink.error()`.

### 1.2 Disposable

```typescript
interface Disposable {
  dispose(): void;
}
```

Returned by subscription methods (`ScenarioController.schedule()`,
`ScenarioController.onAnnotation()`, `ScenarioController.onEvent()`,
`ScenarioRemote.onStateChange()`, `ControlChannel.onMessage()`). Calling
`dispose()` removes the listener or cancels the scheduled callback. Failing to
call `dispose()` is a resource leak — callers must dispose all subscriptions when
tearing down.

This is a new type in `pages-data`. The codebase currently uses
`subscribe()/unsubscribe()` pairs (e.g. `PushSource`), but a returned disposable
is safer — it binds cleanup to the registration call, preventing mismatched
unsubscribe keys. The `Disposable` name aligns with the TC39 Explicit Resource
Management proposal (`Symbol.dispose`); migration to the built-in when TypeScript
support matures is a one-line change per call site.

### 1.3 Temporal Sources — Controller Injection

Sources that participate in the scenario timeline (simulated, replay) receive the
`ScenarioController` at **construction time**, not at connect time. This preserves
a uniform `connect(sink)` signature across all sources — the pipeline never needs
to distinguish temporal from non-temporal sources.

```typescript
// Controller injected when creating the source
const src = simulated({ initial: csvSource(data), controller, mutations: [...] });
src.connect(sink);  // uniform — same as any other DataSource
```

There is no `TemporalDataSource` sub-interface. Every source is a `DataSource`
with the same `connect(sink)` contract. The controller is a construction-time
dependency of temporal sources — the `scenario()` function creates it and passes
it to each temporal source's config.

### 1.4 MutableDataSource

For sources that accept user actions in demo/simulation mode:

```typescript
interface MutableDataSource extends DataSource {
  dispatch(action: DataAction): void;
}

type DataAction =
  | { type: 'update'; key: string; changes: Record<string, unknown> }
  | { type: 'create'; data: Record<string, unknown> }
  | { type: 'delete'; key: string };
```

When a user clicks "Assign" in a simulated workbench, the component dispatches an
action through the pipeline. The simulated source applies the mutation to its
internal state and emits the resulting `DataSetEvent`.

`MutableDataSource` is scoped to simulation/demo mode. Only `simulated()` sources
implement it. Production mutations remain the component's responsibility — components
call `fetch()` directly for server-side writes. A production-mode `dispatch()` path
(e.g., `mutableRestSource()` with write-path configuration) is future work tracked
separately.

### 1.5 ScenarioController

Owns the clock for all temporal sources:

```typescript
interface ScenarioController {
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

interface EventLogEntry {
  readonly timestamp: number;
  readonly wallTime: number;
  readonly dataSetId: DataSetId;
  readonly event: DataSetEvent;
  readonly source: string;
}
```

All temporal sources use `controller.schedule(delayMs, callback)` instead of raw
`setTimeout()`. At 2x speed, a 10 000 ms delay fires after 5 000 real ms. `step()`
advances to the next scheduled callback, fires it, then pauses. `elapsed` tracks
cumulative scenario time.

**Factory:**

```typescript
interface ScenarioControllerOptions {
  readonly speed?: number;      // default: 1
  readonly playing?: boolean;   // default: true
}

function createScenarioController(options?: ScenarioControllerOptions): ScenarioController;
```

`createScenarioController()` returns a controller backed by a virtual-time
priority queue. Scheduled callbacks are stored as `{ fireAt: number, callback }`
entries sorted by `fireAt`. A single `setTimeout` drives the queue: it fires the
earliest entry at `delayMs / speed` real milliseconds, then reschedules for the
next entry. `setSpeed()` recalculates the active `setTimeout` delay. `pause()`
clears the timeout; `play()` resumes from the current position. `step()` pops and
fires the next entry, then pauses.

**Sane defaults:** speed = 1, playing = true. Sources start immediately on
`connect()`. No controller required for non-temporal sources.

---

## 2. Source Implementations

All source constructors return `DataSource` (or `DataSource & MutableDataSource`
for sources that accept user actions). Each is a pure function — no side effects
until `connect()` is called.

### 2.1 Formalise Existing

These wrap the current resolution machinery (extraction, providers, column
inference) behind the `DataSource` interface. The internal implementation
delegates to the existing `resolveExternalDataSet()` engine.

| Source | Constructor | Produces | Notes |
|--------|-----------|----------|-------|
| REST endpoint | `restSource(url, options?)` | `snapshot` on connect; optional polling via `refreshTime` | Wraps existing URL resolution + extraction |
| SSE stream | `sseSource(url, options?)` | Continuous `append`/`replace`/`remove` | Wraps existing `SseSource` via `PushPool` |
| WebSocket stream | `wsSource(url, options?)` | Continuous events | Wraps existing `WebSocketSource` via `PushPool` |
| Inline static | `inlineSource(data, options?)` | `snapshot` once on connect | Wraps existing content resolution |
| Join | `joinSource(...sourceIds)` | `snapshot` combining multiple datasets | Wraps existing `joinDataSets()` |
| PostMessage | `postMessageSource(dataSetId, options?)` | `snapshot` when host pushes data | Wraps existing `PostMessageProvider` |
| Server query | `serverQuerySource(url, options?)` | `snapshot` from server-side SQL | Wraps existing server-query provider |

**Connection pooling:** `sseSource()` and `wsSource()` share connections per base
URL via the existing `PushPool`. Two `wsSource("ws://backend/events")` calls return
independent DataSource instances but share one underlying WebSocket connection. The
pool manages subscription counting and closes the connection when the last source
disconnects. This preserves existing behaviour.

**`restSource` options:**

```typescript
interface RestSourceOptions {
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
}
```

`dataPath`, `type`, and `expression` compose as a pipeline — the same three-stage
extraction pipeline defined in the ExternalDataSetDef spec (§3): `dataPath`
navigates to a subtree, `type` applies a preset (prometheus, elasticsearch, etc.),
`expression` applies a custom JSONata transform. `form` and `body` are mutually
exclusive (matching `ExternalDataSetDef` validation rules).

**`joinSource` semantics:** `joinSource(...sourceIds)` wraps the existing
synchronous `joinDataSets()`. It evaluates once when all constituent datasets are
registered in the DataSetManager. The pipeline resolves definitions in dependency
order (joins after their constituents). Reactive re-evaluation on constituent
changes is a future enhancement — the current system is also non-reactive.

**`inlineSource` accepts multiple input shapes:**

```typescript
function inlineSource(data: InlineData, options?: InlineSourceOptions): DataSource;

type InlineData =
  | readonly unknown[][]            // raw row arrays (current JSON.stringify pattern)
  | string                          // JSON string (backward compat during migration)
  | Record<string, unknown>[];      // array of objects
```

### 2.2 New Sources

| Source | Constructor | Produces | Notes |
|--------|-----------|----------|-------|
| CSV | `csvSource(csv, options?)` | `snapshot` once (parsed CSV) | New |
| Simulated | `simulated(config)` | Timed events per mutation rules | `DataSource & MutableDataSource` |
| Replay | `replay(events, controller, options?)` | Timed events from recorded sequence | `DataSource` |
| Recording | `recording(innerSource)` | Delegates + captures timestamped events | Decorator |
| Composite | `composite(initial, live)` | REST snapshot then push updates | Combines two sources |

### 2.3 CSV Source

```typescript
function csvSource(csv: string, options?: CsvSourceOptions): DataSource;

interface CsvSourceOptions {
  readonly delimiter?: string;
  readonly hasHeader?: boolean;
  readonly columns?: readonly ExternalColumnDef[];
}
```

Parses CSV string into `TypedDataSet` using the existing CSV parser in pages-data.
Emits a single `snapshot` event on connect.

### 2.4 Simulated Source (Temporal + Mutable)

The simulation engine. Takes an initial data source and a set of mutation rules that
evolve the data over scenario time.

```typescript
function simulated(config: SimulatedConfig): DataSource & MutableDataSource;

interface SimulatedConfig {
  readonly initial: DataSource;
  readonly controller: ScenarioController;
  readonly interval?: number;         // tick interval in scenario-ms (default: 5000)
  readonly mutations: readonly Mutation[];
  readonly keyColumn?: string;        // row identity for replace/remove events
}
```

**Mutation DSL:**

```typescript
type Mutation =
  | AddRowMutation
  | TransitionMutation
  | IncrementMutation
  | DecrementMutation
  | ConditionalMutation
  | RemoveRowMutation;

function transition(column: string, opts: {
  from: string; to: string;
  after: [minMs: number, maxMs: number];
  probability?: number;
}): TransitionMutation;

function decrement(column: string, opts: {
  by: number; every: number; floor?: number;
}): DecrementMutation;

function increment(column: string, opts: {
  by: number; every: number; ceiling?: number;
}): IncrementMutation;

function addRow(opts: {
  probability: number;
  generator: () => Record<string, unknown>;
}): AddRowMutation;

function removeRow(opts: {
  predicate: (row: Record<string, unknown>) => boolean;
  probability?: number;
}): RemoveRowMutation;

function when(
  predicate: (row: Record<string, unknown>) => boolean,
  ...mutations: Mutation[]
): ConditionalMutation;
```

**Mutation Evaluation Model:**

Evaluation uses **snapshot semantics** within each tick. All mutations evaluate
against the row state at tick start. Changes are collected and applied atomically
after all evaluations complete. Mutation A's changes are NOT visible to mutation B
within the same tick. This makes evaluation order-independent and deterministic —
reordering mutations in the array produces the same result.

On each tick (governed by `controller.schedule(interval, ...)`):
1. Take a snapshot of current row state
2. Evaluate each mutation against the snapshot (not against intermediate state)
3. Collect resulting `DataSetEvent`s (replace, append, remove)
4. Apply all changes atomically to internal state and emit through sink
5. Log via `controller.onEvent`

**`transition.after` — per-row state tracking:**

When a row first matches the `from` state, the mutation records
`{ enteredAt: controller.elapsed, delay: random(min, max) }` for that row. On
each tick, rows whose `controller.elapsed - enteredAt >= delay` are transitioned.
If a row leaves the `from` state before its delay expires (e.g., via user
`dispatch()` or another mutation), its tracking entry is removed. The per-row
tracking is internal to the mutation — not exposed in the DSL.

The `probability` field on `transition` applies independently: on each tick where
a row's delay has elapsed, a random check against `probability` (default: 1.0)
determines whether the transition fires that tick.

**`increment/decrement.every` — per-mutation tracking:**

The mutation tracks the last time it fired (in scenario-ms). On each tick, if
`controller.elapsed - lastFiredAt >= every`, it applies the increment/decrement
to **all matching rows** and resets `lastFiredAt`. This is global (per-mutation),
not per-row — all rows are incremented/decremented at the same cadence. The
`floor`/`ceiling` bounds are checked per-row after applying the change.

**Lifecycle:**

1. On `connect(sink)`: connects the `initial` DataSource with a wrapper sink.
2. After `initial` emits its first `snapshot` event: captures the snapshot as
   internal state, disconnects `initial`, then starts the tick timer via
   `controller.schedule(interval, ...)`.
3. On `disconnect()`: cancels the tick timer, disconnects the initial source if
   still connected (connect interrupted before snapshot arrived).

**Edge cases:**
- **Tick timer starts after initial snapshot.** If the initial source is a
  `restSource()` that takes 2 seconds to fetch, no ticks run during that time.
  Mutations only begin after the baseline data exists.
- **Initial source error:** If the initial source reports an error via
  `sink.error()`, the simulated source propagates it to its own sink and does NOT
  start the tick timer. The simulation is in error state.
- **Non-snapshot events from initial:** Ignored. Only the first `snapshot` event
  triggers the handoff to simulation mode. This prevents partial data from seeding
  the simulation.
- **Initial source disconnect:** The initial source is disconnected immediately
  after its snapshot is captured. It is not held open.

**MutableDataSource dispatch:** When a `DataAction` is dispatched (e.g. user clicks
"Assign"), the simulated source applies it to internal state and emits the
corresponding event. `{ type: 'update', key: 'WI-001', changes: { status: 'ASSIGNED' } }`
becomes a `ReplaceEvent`.

### 2.5 Replay Source (Temporal)

Plays back a recorded sequence of `DataSetEvent`s with original timing, scaled by
the controller's speed.

```typescript
function replay(events: readonly RecordedEvent[], controller: ScenarioController, options?: ReplayOptions): DataSource;

interface RecordedEvent {
  readonly offsetMs: number;
  readonly event: DataSetEvent;
}

interface ReplayOptions {
  readonly loop?: boolean;    // restart after last event (default: false)
}
```

The controller is injected at construction time (see §1.2). Each event is scheduled
via `controller.schedule(offsetMs, ...)`. At 2x speed, a 10-second gap between
events takes 5 real seconds. `step()` fires the next event and pauses.

### 2.6 Recording Source (Decorator)

Wraps any `DataSource`, delegates all events, and captures them with timestamps for
later replay.

```typescript
function recording(innerSource: DataSource): DataSource & RecordingCapture;

interface RecordingCapture {
  getRecording(): readonly RecordedEvent[];
  clear(): void;
}
```

### 2.7 Composite Source

Combines an initial source (typically REST) with a live source (typically SSE or
WebSocket). The initial source provides the snapshot; the live source provides
ongoing updates.

```typescript
function composite(initial: DataSource, live: DataSource): DataSource;
```

**Lifecycle:**

1. On `connect(sink)`: connects `initial` with a wrapper sink.
2. After `initial` emits its first `snapshot` event: forwards the snapshot to
   `sink`, disconnects `initial`, then connects `live` to `sink` directly.
3. Events from `live` flow to `sink` from this point onward.
4. On `disconnect()`: disconnects whichever sub-source is currently connected.
   Tracks connection state to avoid double-disconnect.

**Edge cases:**
- **Event loss during handoff:** Events on the live source that occur while the
  initial fetch is in progress are lost. This is an accepted gap — the initial
  source provides a point-in-time snapshot and the live source provides updates
  from the moment it connects. For fast-moving data, callers should use a pure
  push source instead of composite.
- **Initial source error:** If the initial source reports an error via
  `sink.error()`, the composite source does NOT connect the live source. The
  composite remains in error state. The caller must disconnect/reconnect to retry.
- **Initial source emits non-snapshot events:** Ignored. Only the first `snapshot`
  event triggers the handoff. This prevents premature handoff on partial data.

---

## 3. Scenario Engine

### 3.1 Scenario Composition

A `Scenario` is the top-level unit — sources, steps, and controller configuration
composed together.

```typescript
interface ScenarioConfig {
  readonly controller: ScenarioController;          // created by caller
  readonly sources: Record<string, DataSource>;     // keyed by dataset name
  readonly steps?: readonly ScenarioStep[];
}

function scenario(config: ScenarioConfig): Scenario;

interface Scenario {
  readonly controller: ScenarioController;
  readonly sources: ReadonlyMap<string, DataSource>;
  start(): void;
  stop(): void;
}
```

The caller creates the `ScenarioController` explicitly and passes it to both the
scenario and to each temporal source's config. Non-temporal sources (inline, REST)
don't take a controller — they coexist in the same scenario without timing.

### 3.2 Steps — Data, Actions, Annotations on One Timeline

A step combines a trigger (when), an optional UI action (do), and an optional
annotation (show). Steps can be named for chaining.

```typescript
interface ScenarioStep {
  readonly name?: string;
  readonly trigger: ScenarioTrigger;
  readonly action?: UIAction;
  readonly annotation?: ScenarioAnnotation;
}
```

### 3.3 Triggers

```typescript
type ScenarioTrigger =
  | TimeTrigger
  | DataTrigger
  | AfterTrigger;

interface TimeTrigger {
  readonly at: number;    // scenario-time offset in ms
}

interface DataTrigger {
  readonly when: DataPredicate;
}

interface AfterTrigger {
  readonly after: string;     // name of a previous step
  readonly delay?: number;    // additional delay in scenario-ms
}

interface DataPredicate {
  readonly dataset: string;
  readonly match: Record<string, unknown>;  // partial match — all specified fields must equal
}
```

**TimeTrigger** — scheduled via `controller.schedule()`.

**DataTrigger** — the scenario engine wraps each source's `DataSink` to intercept
events. After each **mutation event** (`append`, `replace`, `remove`) is applied
to the DataSetManager, the wrapper evaluates registered trigger predicates against
the updated dataset state. **Snapshot events are excluded** — they represent the
initial baseline, not a state change. This means a trigger with
`match: { status: 'Critical' }` fires when a row *transitions to* that state, not
when the initial data happens to contain it. For time-zero reactions to initial
state, use a `TimeTrigger` at `{ at: 0 }`.

This avoids requiring a public subscription API on DataSetManager (which only
exposes a single `onChanged` callback set at construction time). Fires once on
first match, then deregisters.

**AfterTrigger** — registers a callback on the named step's completion, then
schedules with optional delay.

### 3.4 UI Actions

```typescript
type UIAction =
  | { type: 'click'; target: string }
  | { type: 'type'; target: string; value: string; clearFirst?: boolean }
  | { type: 'select'; target: string; value: string }
  | { type: 'scroll'; target: string; to: 'top' | 'bottom' | number }
  | { type: 'hover'; target: string }
  | { type: 'navigate'; page: string };
```

`target` is a CSS selector resolved against the document at execution time. Actions
dispatch real DOM events (click, input, change) so components respond through their
normal event handlers — no special integration required.

### 3.5 Annotations

```typescript
interface ScenarioAnnotation {
  readonly text: string;
  readonly target?: string;
  readonly style: AnnotationStyle;
  readonly duration?: number;
}

type AnnotationStyle =
  | { type: 'label'; position?: AnchorPosition }
  | { type: 'arrow' }
  | { type: 'circle' }
  | { type: 'highlight-box' }
  | { type: 'highlight-line' };

type AnchorPosition = 'above' | 'below' | 'left' | 'right';
```

Annotations are managed by the controller. When a step fires, its annotation is
added to `activeAnnotations`. Two annotation classes coexist:

- **Duration-based** (`duration` set): visible for `duration` ms in scenario time,
  then auto-removed. Multiple duration-based annotations can be active
  simultaneously if their durations overlap.
- **Persistent** (`duration` omitted): remains visible until the next step that
  has its own persistent annotation fires, replacing it. Only one persistent
  annotation is active at a time.

`activeAnnotations` is the union of all currently-visible annotations — at most
one persistent annotation plus any number of unexpired duration-based annotations.

---

## 4. Remote Control

### 4.1 Host/Remote Split

The ScenarioController can be operated from a different browser tab or a different
machine. The architecture splits into host (runs the scenario) and remote (sends
commands, receives state).

```typescript
interface ScenarioHost {
  readonly controller: ScenarioController;
  attachRemote(channel: ControlChannel): void;
  detachRemote(channel: ControlChannel): void;
}

interface ScenarioRemote {
  play(): void;
  pause(): void;
  step(): void;
  setSpeed(multiplier: number): void;

  onStateChange(listener: (state: ScenarioState) => void): Disposable;
}

interface ScenarioState {
  readonly playing: boolean;
  readonly speed: number;
  readonly elapsed: number;
  readonly pending: number;
  readonly activeAnnotations: readonly ScenarioAnnotation[];
  readonly datasets: readonly DatasetSummary[];
}

interface DatasetSummary {
  readonly id: string;
  readonly sourceType: string;
  readonly rowCount: number;
  readonly lastEvent?: string;
}
```

### 4.2 Transport Abstraction

```typescript
interface ControlChannel {
  send(message: ControlMessage): void;
  onMessage(listener: (message: ControlMessage) => void): Disposable;
  close(): void;
}

type ControlMessage =
  | { type: 'command'; command: 'play' | 'pause' | 'step'; }
  | { type: 'command'; command: 'setSpeed'; speed: number }
  | { type: 'state'; state: ScenarioState };
```

### 4.3 Built-in Channel Implementations

| Channel | Use case | Transport |
|---------|----------|-----------|
| `broadcastChannel(name)` | Same browser, different tab | `BroadcastChannel` API |
| `webSocketChannel(url)` | Cross-machine, presenter→display | WebSocket |

`BroadcastChannel` is zero-config — both tabs use the same channel name and
communicate instantly. For cross-machine, the app exposes a lightweight WebSocket
endpoint; the remote controller connects to it.

### 4.4 Control UI Modes

The scenario control UI (replay controls, dataset explorer, annotation display)
works identically in all modes:

| Mode | How it works |
|------|-------------|
| **Embedded** | Small button on the page, slides out a panel. Talks to controller directly. |
| **Detached tab** | Separate browser tab. Connects via `BroadcastChannel`. |
| **Remote** | Different machine. Connects via WebSocket. |

The control UI always talks to `ScenarioRemote`. In embedded mode, a local
`ScenarioRemote` wraps the `ScenarioController` directly (no serialisation).

---

## 5. Dev/Demo UI

### 5.1 Replay Controls Widget

A floating toolbar, toggled by a small button anchored to the page corner.

**Controls:**
- Play / Pause button
- Step button (advance one event)
- Speed selector: 0.25x, 0.5x, 1x, 2x, 5x, 10x
- Elapsed scenario time display
- Progress bar (for replay sources: position in recorded sequence)
- Annotation track — timeline markers showing where annotations fire

**Behaviour:** Rendered as a web component (`<scenario-controls>`). Communicates
with `ScenarioRemote`. Supports detachment to a new tab via a "pop out" button.

### 5.2 Dataset Explorer

A collapsible panel below the replay controls showing live dataset state.

**Features:**
- List of all datasets with: name, source type (inline/rest/simulated/replay),
  row count, column count
- Click to expand: full column schema, sample rows
- Live event log: every `DataSetEvent` as it flows, timestamped in scenario time
- Source status indicators (connected/disconnected/error)

**Rendered as:** `<dataset-explorer>` web component, subscribing to
`controller.onEvent()` and reading from `DataSetManager`.

### 5.3 Annotation Overlay

A transparent layer rendered above the page content. Positions callouts relative to
their target elements using `getBoundingClientRect()`, repositioning on scroll and
resize via `ResizeObserver` + scroll listeners.

**Annotation rendering by style:**
- `label` — floating text box with optional anchor line to target
- `arrow` — text box with SVG arrow pointing to target element
- `circle` — SVG circle positioned around target's bounding box
- `highlight-box` — semi-transparent rectangle overlay on target
- `highlight-line` — horizontal line above or below target

All annotations fade in/out with CSS transitions. Active annotations are driven by
`controller.onAnnotation()`.

---

## 6. Pipeline Integration

### 6.1 DataPipeline Refactoring

`DataPipeline` is refactored to work with `DataSource` objects. The current routing
logic (URL prefix checks for ws://, sse://, parameterised URLs, server-query,
inline content) is replaced by a uniform call: `source.connect(sink)`. Every source
has the same `connect()` signature — no type guards, no branching.

**Current flow (replaced):**
```
ExternalDataSetDef → DataPipeline routes by URL prefix → resolver/providers → manager.apply()
```

**New flow:**
```
DataSource → DataPipeline calls connect(sink) → source manages its own fetching → sink.apply()/sink.error()
```

The `DataPipeline` becomes simpler — it manages the source→sink wiring, subscription
tracking, component cleanup on DOM removal, and refresh scheduling. Source-specific
logic (HTTP fetching, WebSocket management, SSE handling) moves into the source
implementations.

### 6.2 ExternalDataSetDef Retirement

`ExternalDataSetDef` is retired as a public type. The builder functions in pages-ui
(`dataset()`, `inlineDataset()`) are replaced by source constructors (`restSource()`,
`inlineSource()`, etc.).

The existing resolution machinery (extraction, providers, column inference, JMESPath,
CORS proxy, server relay) is preserved internally — `restSource()` delegates to it.
The code moves from being the public API surface to being implementation detail of
`restSource`.

### 6.3 Page Dataset Registration

Pages currently accept `datasets: ExternalDataSetDef[]`. This changes to
`datasets: DataSourceBinding[]`:

```typescript
interface DataSourceBinding {
  readonly id: DataSetId;
  readonly source: DataSource;
  readonly keyColumn?: string;
}
```

Builder functions:

```typescript
function bind(id: string, source: DataSource, options?: { keyColumn?: string }): DataSourceBinding;

// Usage in page definition
export default page(
  "Patient Tracker",
  table({ lookup: lookup(patients, [], []) }),
  {
    datasets: [
      bind("patients", inlineSource(patientData, { columns: patientColumns })),
      bind("vitals", csvSource(vitalsCsv)),
    ],
  }
);
```

### 6.4 YAML Backward Compatibility

YAML dashboards continue to work unchanged. The YAML parser still produces
`ExternalDataSetDef[]` internally. The pipeline converts each to a
`DataSourceBinding` via a mapping function:

```typescript
function defToBinding(def: ExternalDataSetDef): DataSourceBinding {
  return { id: def.uuid, source: createSourceFromDef(def), keyColumn: def.keyColumn };
}
```

**Mapping rules:**

| ExternalDataSetDef field(s) | DataSource constructor |
|------|-------|
| `content` set | `inlineSource(content, { columns, expression, dataPath, type })` |
| `join` set | `joinSource(...join)` |
| `serverQuery: true` + `url` | `serverQuerySource(url, { columns, refreshTime, ... })` |
| `url` starting with `ws://`/`wss://` | `wsSource(url, { keyColumn, columns })` |
| `url` starting with `sse://`/`sses://` | `sseSource(url, { keyColumn, columns })` |
| `url` (default) | `restSource(url, { method, headers, query, body, form, dataPath, type, expression, columns, refreshTime, accumulate, maxRows: cacheMaxRows, cacheEnabled })` |

PostMessage routing continues to be host-initiated (the host registers the
provider externally, same as today).

The extraction pipeline (dataPath → type → expression), provider selection
(browser, CORS proxy, server relay), and lifecycle fields (cacheEnabled,
refreshTime, accumulate) are all preserved — they map directly to
`RestSourceOptions` fields.

This conversion is tested independently: each mapping rule has a test verifying
that the DataSource produces identical output to `resolveExternalDataSet()` for
the same definition.

### 6.5 Scenario-Mode Pages

When a page uses a `Scenario` instead of individual datasets, the scenario manages
all sources and the controller:

```typescript
export default page(
  "Clinical Demo",
  table({ lookup: lookup(patients, [], []) }),
  {
    scenario: clinicalDemo,    // Scenario object — provides sources + controller + steps
  }
);
```

The pipeline detects `scenario` in page options and wires up:
1. Each source in the scenario's `sources` map is connected to its sink via `source.connect(sink)` — the uniform call (no controller passing; temporal sources received their controller at construction time per §1.2)
2. The scenario's steps are registered with the controller
3. The replay controls widget is injected (if not already present)
4. The annotation overlay is injected

---

## 7. Component Migration

### 7.1 blocks-ui Components

blocks-ui components currently call `fetch()` directly with an `endpoint` property.
They are refactored to use `DataReceiver` — the same pattern pages components use.

**Before (current):**
```typescript
class WorkItemInbox extends LitElement {
  @property() endpoint?: string;

  private async fetchItems() {
    const response = await fetch(`${this.endpoint}/workitems/inbox`);
    this.items = await response.json();
  }
}
```

**After:**
```typescript
class WorkItemInbox extends LitElement {
  @property({ attribute: false }) dataSet?: TypedDataSet;
  @property() error?: string;

  // Component renders from this.dataSet — source-agnostic
}
```

The component no longer knows where data comes from. In production, a `restSource`
fetches from the real endpoint. In demo mode, a `simulated` source provides
evolving data. The hosting page controls which source is wired.

**Write path (simulation only):** Components that perform actions (assign,
escalate, complete) dispatch `DataAction`s through a
`dispatchAction(dataSetId, action)` function provided by the pipeline. The pipeline
checks whether the source for that dataset implements `MutableDataSource` (via
`'dispatch' in source`). In simulation, the source mutates internal state and
emits events. In production, components handle mutations directly via `fetch()`
calls — the pipeline does not intercept production writes. A production-mode
write path adapter is future work.

### 7.2 aml Components

AML components to migrate (all currently use direct `fetch()`):

- `case-workbench` — container, delegates to children
- `case-list-pane` — table with pagination, `fetch()` to endpoint

Same refactoring pattern as blocks-ui: remove `fetch()`, accept `TypedDataSet` via
property, dispatch actions for mutations.

### 7.3 clinical Components

Clinical components to migrate:

**Data-loading (refactor to DataReceiver):**
- `cbr-precedents-panel` — similar case search table
- `commitment-lifecycle` — timeline visualisation
- `clinical-pi-approval` — deviation list
- `clinical-susar-gate` — adverse events list

**Action components (add DataAction dispatch):**
- `gdpr-erasure-action` — form POST → `dispatch({ type: 'create', ... })`
- `clinical-merkle-verify` — verification request

**Presentation-only (no changes needed):**
- `sla-breach-policy-indicator`
- `trust-feedback-display`
- `regulatory-compliance-summary`

---

## 8. Example Migration

### 8.1 casehub-pages Examples

42 examples currently use `inlineDataset()` and `dataset()`. Each is updated to use
the new source constructors.

**Before:**
```typescript
const patientsDataset = inlineDataset(
  "patients",
  JSON.stringify([
    [1, "Emily Rodriguez", 34, "F", "ICU", ...],
  ]),
  { columns: [...] }
);

export default page(
  "Patient Tracker",
  table({ ... }),
  { datasets: [patientsDataset] }
);
```

**After:**
```typescript
const patientsSource = bind("patients", inlineSource([
  [1, "Emily Rodriguez", 34, "F", "ICU", ...],
], { columns: [...] }));

export default page(
  "Patient Tracker",
  table({ ... }),
  { datasets: [patientsSource] }
);
```

Key improvements:
- No more `JSON.stringify()` — `inlineSource` accepts raw arrays directly
- Type-safe column definitions via `DatasetContract` (existing protocol)
- Examples that use URL endpoints switch from `dataset(id, url, opts)` to
  `bind(id, restSource(url, opts))`

### 8.2 blocks-ui Examples

The blocks-ui mock infrastructure is replaced entirely:

**Retired:**
- `mock-fetch.ts` — fetch interceptor (111 lines)
- `mock-sse.ts` — MockSSESource (85 lines)
- `mock-state.ts` — MockState with scripted events (293 lines)
- `sse-script.json` — timed work item events (202 lines)
- `notification-sse-script.json` — timed notification events (177 lines)

**Replaced by:**
```typescript
const demoController = createScenarioController({ speed: 1 });
const workItemScenario = scenario({
  controller: demoController,
  sources: {
    workItems: simulated({
      initial: inlineSource(workItemData),
      controller: demoController,
      keyColumn: 'id',
      mutations: [
        addRow({ probability: 0.3, generator: randomWorkItem }),
        transition('status', { from: 'PENDING', to: 'ASSIGNED', after: [5000, 8000] }),
        transition('status', { from: 'ASSIGNED', to: 'INVESTIGATING', after: [10000, 15000] }),
        transition('status', { from: 'INVESTIGATING', to: 'COMPLETED', after: [20000, 40000] }),
      ],
    }),
    notifications: simulated({
      initial: inlineSource(notificationData),
      controller: demoController,
      mutations: [
        addRow({ probability: 0.2, generator: randomNotification }),
      ],
    }),
  },
  steps: [
    { trigger: { at: 0 }, annotation: { text: "AML Investigation Queue", style: { type: 'label' } } },
    { trigger: { when: { dataset: 'workItems', match: { status: 'ASSIGNED' } } },
      annotation: { text: "Case assigned to analyst", target: '.status-assigned', style: { type: 'arrow' } } },
  ],
});
```

The 13 JSON mock data files are preserved as data — they become the `initial`
sources for the simulated datasets.

---

## 9. Test Strategy

### 9.1 Phase 0 — Characterisation Tests (Before Migration)

Fill coverage gaps in areas being refactored. Target: ~30-40 new tests.

| Area | Current | Target | Focus |
|------|---------|--------|-------|
| Resolver | 19 | 35 | Edge cases: content + expression, accumulate, serverQuery, join, parameterised URLs |
| SSE source | 13 | 30 | Parity with WebSocket: reconnection, named events, batching, error handling |
| Pipeline lifecycle | 4 | 15 | Component cleanup, push resubscription, MutationObserver, refresh scheduling |
| Pipeline cleanup | 1 | 8 | Multi-subscriber teardown, pool release, timer cancellation |

### 9.2 New Source Tests

Each source implementation gets its own test suite:

- `inlineSource` — raw arrays, JSON string, object arrays, column inference
- `csvSource` — headers, delimiters, type inference, malformed input
- `restSource` — delegates to existing provider/extraction (integration test)
- `simulated` — each mutation type, tick scheduling, MutableDataSource dispatch,
  compound mutations via `when()`
- `replay` — timing accuracy at various speeds, loop, step, empty sequence
- `recording` — capture fidelity, clear, replay round-trip
- `composite` — initial→live handoff, disconnect ordering

### 9.3 Scenario Engine Tests

- Step triggers: time-based, data-predicate, after-chaining
- UI actions: click dispatch, type/input events, navigate
- Annotations: lifecycle (show, duration, replace), activeAnnotations state
- Controller: speed changes mid-scenario, pause/resume, step

### 9.4 Remote Control Tests

- BroadcastChannel: command→state round-trip, multi-remote
- ControlMessage serialisation/deserialisation
- State sync: initial state on connect, incremental updates

### 9.5 Integration Tests

- Full scenario with simulated sources + steps + annotations running through
  DataPipeline → DataSetManager → component DataReceiver
- Example migration smoke tests: each migrated example loads and renders data

---

## 10. Package Layout

| Package | What it gains |
|---------|-------------- |
| `pages-data` | `DataSource`, `DataSink`, `SourceError`, `MutableDataSource`, source implementations (inline, csv, rest, sse, ws, postMessage, serverQuery, simulated, replay, recording, composite, join), `ScenarioController`, `createScenarioController`, mutation DSL |
| `pages-runtime` | `Scenario` composition, step/trigger engine, `ScenarioHost`/`ScenarioRemote`, `DataPipeline` refactored, `DataSourceBinding`, annotation management |
| `pages-viz` or `pages-runtime` | `<scenario-controls>` widget, `<dataset-explorer>` panel, annotation overlay renderer |
| `pages-ui` | New builder functions (`bind`, re-exports of source constructors), `dataset()`/`inlineDataset()` removed |

---

## 11. Migration Sequence

This is one epic with sub-issues, designed for implementation in sequence.

### Phase 0: Characterisation Tests
Strengthen test coverage over resolver, SSE source, and pipeline lifecycle before
any production changes.

### Phase 1: DataSource Core (pages-data)
`DataSource`, `DataSink`, `ScenarioController` interfaces. `inlineSource` and
`csvSource` implementations. Unit tests for each.

### Phase 2: Temporal Sources (pages-data)
`simulated()` with full mutation DSL, `replay()`, `recording()`. These are the
new code — no existing code to wrap. Unit tests including timing accuracy.

### Phase 3: Wrapped Sources (pages-data)
`restSource`, `sseSource`, `wsSource`, `composite`. These wrap existing
provider/extraction/push machinery behind the DataSource interface. Integration
tests verifying identical behaviour to current ExternalDataSetDef resolution.

### Phase 4: Pipeline Integration (pages-runtime)
Refactor `DataPipeline` to use `DataSource`. Add `DataSourceBinding`, `Scenario`
support to page options. `ExternalDataSetDef` becomes internal. YAML path
continues to work (YAML parser creates DataSource objects internally).

### Phase 5: Scenario Engine (pages-runtime)
`Scenario` composition, `ScenarioStep` execution, trigger system (time, data,
after), `UIAction` dispatch. Annotation lifecycle management.

### Phase 6: Remote Control (pages-runtime)
`ScenarioHost`/`ScenarioRemote` split, `ControlChannel` abstraction,
`BroadcastChannel` and `WebSocket` implementations.

### Phase 7: Dev/Demo UI
`<scenario-controls>` replay widget, `<dataset-explorer>` panel, annotation
overlay renderer. All as web components.

### Phase 8: Example Migration (casehub-pages)
Port all 42 examples from `inlineDataset()`/`dataset()` to `bind()`/source
constructors. Verify each renders correctly.

### Phase 9: blocks-ui Component Migration
Refactor data-loading components to DataReceiver pattern. Replace MockState /
mock-fetch / MockSSE infrastructure with scenario-based examples.

### Phase 10: aml + clinical Component Migration
Refactor data-loading components to DataReceiver pattern. Align with blocks-ui
migration patterns.

### Phase 11: Cleanup
Remove `ExternalDataSetDef` from public API surface. Remove deprecated builder
functions. Update CLAUDE.md architecture overview. Update dataset-contract protocol.

---

## 12. Prior Spec Reconciliation

This spec introduces a unified DataSource abstraction over subsystems that have
their own detailed design specs. This section maps each prior spec to its
disposition.

| Prior spec | Disposition |
|-----------|-------------|
| **ExternalDataSetDef spec** (#6) | `DataProvider`, `DataProviderFactory`, `DataProviderConfig`, extraction pipeline (parse → navigate → extract → tabulate → convert), and preset registry survive as internal implementation of `restSource()`. `ExternalDataSetDef` type becomes internal — used by the YAML backward-compatibility path (§6.4) but no longer a public API. |
| **ConfigurablePanel Dataset Bridge spec** (#109/110) | `DataReceiver` and `VizTarget` are unchanged. The data pipeline delivers data through the same `VizTarget` → `DataReceiver` chain. `DataSourceBinding` replaces `ExternalDataSetDef[]` in page options. The activation wiring (proxy adapter for host panels) works identically with `DataSourceBinding`. |
| **Push Source Abstraction** (#30) | `PushSource` with `subscribe()/unsubscribe()/close()` survives as internal implementation of `sseSource()` and `wsSource()`. `PushPool` continues to provide connection pooling (§2.1). Error classification (transient vs permanent) maps to the new `SourceError` type on `DataSink`. |
| **DatasetContract protocol** (PP-20260705-7a5da4) | Validates dataset shape (column schema), which is orthogonal to the source mechanism. Needs update: the `DataSourceBinding` type should be added to the protocol's type inventory, and the protocol's validation entry point should accept `DataSourceBinding[]` alongside `ExternalDataSetDef[]`. |

## 13. Scope Note

This spec expands beyond issue #140's original "No Breaking Changes" statement.
The issue proposed an additive DataSource layer wrapping existing APIs. This spec
proposes a clean replacement: `ExternalDataSetDef` is retired from the public API,
builder functions are replaced by source constructors, and the YAML path is
preserved via an internal conversion layer (§6.4). Issue #140 should be updated to
reflect this scope. The clean-break approach is architecturally preferable — a
compatibility layer would create permanent indirection with no benefit on a
platform with no external consumers.

The Scenario Engine (§3-5) and its UI (Dev/Demo UI) extend beyond both #140 and
aml#101. A separate tracking issue should be filed for the scenario engine scope
(phases 5-7 of the migration sequence), which can be implemented and delivered
independently of the core DataSource abstraction (phases 1-4).

## 14. Cross-References

- casehubio/casehub-pages#140 — this feature (scope note: §13)
- casehubio/aml#101 — AML simulation scenarios (consumer)
- casehubio/blocks-ui#37 — AML workbench (component migration)
- casehubio/blocks-ui#35 — cross-repo migration tracking
- `docs/protocols/casehub/dataset-contract.md` — DatasetContract protocol (needs update for DataSourceBinding)

---

## 15. Example: Full Clinical Demo Scenario

Putting all layers together — a self-running, narrated, controllable clinical
dashboard demo:

```typescript
import { scenario, simulated, csvSource, inlineSource, bind, transition, decrement, addRow, when, createScenarioController } from "@casehubio/data";
import { page, table, lineChart, metric, tabs, columns, lookup, groupBy, filterBy, col, count, avg } from "@casehubio/ui";

const patientsCsv = `id,name,age,gender,ward,diagnosis,admitDate,status,doctor,slaRemainingDays
1,Emily Rodriguez,34,F,ICU,Pneumonia,2026-06-20,Critical,Dr. Mitchell,2
2,Michael Chen,67,M,General,Post-Op,2026-06-18,Stable,Dr. Anderson,5
...`;

const controller = createScenarioController({ speed: 1 });

const clinicalDemo = scenario({
  controller,
  sources: {
    patients: simulated({
      initial: csvSource(patientsCsv),
      controller,
      keyColumn: 'id',
      mutations: [
        addRow({ probability: 0.1, generator: randomPatient }),
        transition('status', { from: 'Critical', to: 'Monitoring', after: [30000, 60000] }),
        transition('status', { from: 'Monitoring', to: 'Stable', after: [20000, 40000] }),
        decrement('slaRemainingDays', { by: 1, every: 60000, floor: 0 }),
        when(
          row => row.slaRemainingDays === 0,
          transition('status', { from: 'Monitoring', to: 'Critical', after: [1000, 3000] }),
        ),
      ],
    }),
    vitals: simulated({
      initial: csvSource(vitalsCsv),
      controller,
      keyColumn: 'patientId',
      interval: 3000,
      mutations: [
        increment('heartRate', { by: 2, every: 3000, ceiling: 140 }),
        decrement('o2Saturation', { by: 1, every: 10000, floor: 85 }),
      ],
    }),
  },
  steps: [
    // Narration
    { name: 'intro', trigger: { at: 0 },
      annotation: { text: "Clinical Patient Tracker — live ward overview", style: { type: 'label' } } },
    { trigger: { at: 4000 },
      annotation: { text: "25 patients across 5 wards, SLA countdowns active",
                    target: '#ward-overview', style: { type: 'highlight-box' } } },

    // React to data
    { name: 'new-patient', trigger: { when: { dataset: 'patients', match: { status: 'Critical' } } },
      annotation: { text: "Critical patient flagged", target: '.status-critical',
                    style: { type: 'arrow' } } },

    // UI automation
    { trigger: { after: 'new-patient', delay: 3000 },
      action: { type: 'navigate', page: 'Vitals Monitor' },
      annotation: { text: "Checking vitals", style: { type: 'label' } } },
    { trigger: { after: 'new-patient', delay: 6000 },
      annotation: { text: "Heart rate trending up, O₂ declining",
                    target: '#heart-rate-chart', style: { type: 'circle' } } },

    // SLA breach
    { trigger: { when: { dataset: 'patients', match: { slaRemainingDays: 0 } } },
      annotation: { text: "SLA breach — auto-escalation triggered",
                    target: '.sla-zero', style: { type: 'highlight-box' } } },
  ],
});

export default page(
  "Clinical Demo",
  tabs({ navGroupId: "ClinicalNav" }),
  page("Ward Overview", /* ... components ... */),
  page("Vitals Monitor", /* ... components ... */),
  page("Patient Detail", /* ... components ... */),
  { scenario: clinicalDemo }
);
```

This demo runs itself. The presenter opens the page, optionally pops out the
controller to a separate tab, sets speed to 2x, and watches the dashboard come
alive — patients arriving, vitals evolving, SLA countdowns ticking, annotations
narrating the story.
