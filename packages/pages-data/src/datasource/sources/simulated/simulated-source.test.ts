import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { simulated } from "./simulated-source.js";
import { inlineSource } from "../inline-source.js";
import { createScenarioController } from "../../controller.js";
import { transition, increment, removeRow, when } from "./mutations.js";
import type { DataSink, DataSource } from "../../types.js";
import type { DataSetEvent, SnapshotEvent, ReplaceEvent, RemoveEvent } from "../../../dataset/events.js";
import { ColumnType, columnId } from "../test-helpers.js";
import type { ColumnId } from "../../../dataset/types.js";
import type { ExternalColumnDef } from "../../../dataset/external/types.js";
import { col as makeCol, makeDataset } from "../test-helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockSink(): DataSink & { events: DataSetEvent[]; errors: unknown[] } {
  const events: DataSetEvent[] = [];
  const errors: unknown[] = [];
  return {
    events,
    errors,
    apply(event: DataSetEvent) { events.push(event); },
    error(err) { errors.push(err); },
  };
}

function makeInitial(data: unknown[][], columns: readonly ExternalColumnDef[]): DataSource {
  return inlineSource(data, { columns });
}

const COLS: ExternalColumnDef[] = [
  { id: columnId("id"), type: ColumnType.NUMBER },
  { id: columnId("status"), type: ColumnType.TEXT },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("simulated source", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("emits initial snapshot then starts ticking", () => {
    const ctrl = createScenarioController();
    const source = simulated({
      initial: makeInitial([[1, "PENDING"]], COLS),
      controller: ctrl,
      keyColumn: "id",
      mutations: [transition("status", { from: "PENDING", to: "DONE", after: [100, 100] })],
      interval: 1000,
    });
    const sink = createMockSink();
    source.connect(sink);

    // Initial snapshot emitted synchronously
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]!.type).toBe("snapshot");
  });

  it("applies mutations on tick", () => {
    const ctrl = createScenarioController();
    const source = simulated({
      initial: makeInitial([[1, "PENDING"]], COLS),
      controller: ctrl,
      keyColumn: "id",
      mutations: [transition("status", { from: "PENDING", to: "DONE", after: [0, 0] })],
      interval: 1000,
    });
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1); // snapshot

    // The transition has after: [0, 0] — delay is 0.
    // On first tick, the row enters tracking with enteredAt = controller.elapsed.
    // At that point elapsed is whatever controller.elapsed is (1000ms scenario time).
    // Since delay=0, elapsed - enteredAt >= 0 → true → transition fires.
    vi.advanceTimersByTime(1000);
    expect(sink.events.length).toBeGreaterThan(1);

    const replaceEvent = sink.events.find(e => e.type === "replace");
    expect(replaceEvent).toBeDefined();
  });

  it("dispatch() applies DataAction and emits replace event", () => {
    const ctrl = createScenarioController();
    const source = simulated({
      initial: makeInitial([[1, "PENDING"]], COLS),
      controller: ctrl,
      keyColumn: "id",
      mutations: [],
    });
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1); // snapshot

    source.dispatch({ type: "update", key: "1", changes: { status: "ASSIGNED" } });
    expect(sink.events).toHaveLength(2);
    const replaceEvent = sink.events[1] as ReplaceEvent;
    expect(replaceEvent.type).toBe("replace");
    expect(replaceEvent.key).toBe("1");

    const statusCell = replaceEvent.row.cell("status" as ColumnId);
    expect(statusCell.type).not.toBe("NULL");
    if (statusCell.type !== "NULL") {
      expect(statusCell.value).toBe("ASSIGNED");
    }
  });

  it("dispatch() create appends a new row", () => {
    const ctrl = createScenarioController();
    const source = simulated({
      initial: makeInitial([[1, "PENDING"]], COLS),
      controller: ctrl,
      keyColumn: "id",
      mutations: [],
    });
    const sink = createMockSink();
    source.connect(sink);

    source.dispatch({ type: "create", data: { id: 2, status: "NEW" } });
    expect(sink.events).toHaveLength(2);
    expect(sink.events[1]!.type).toBe("append");
  });

  it("dispatch() delete removes a row", () => {
    const ctrl = createScenarioController();
    const source = simulated({
      initial: makeInitial([[1, "PENDING"], [2, "DONE"]], COLS),
      controller: ctrl,
      keyColumn: "id",
      mutations: [],
    });
    const sink = createMockSink();
    source.connect(sink);

    source.dispatch({ type: "delete", key: "1" });
    expect(sink.events).toHaveLength(2);
    const removeEvent = sink.events[1] as RemoveEvent;
    expect(removeEvent.type).toBe("remove");
    expect(removeEvent.key).toBe("1");
  });

  it("disconnect() cancels tick timer", () => {
    const extraCols: ExternalColumnDef[] = [
      { id: columnId("id"), type: ColumnType.NUMBER },
      { id: columnId("val"), type: ColumnType.TEXT },
    ];
    const ctrl = createScenarioController();
    const source = simulated({
      initial: makeInitial([[1, "X"]], extraCols),
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

  it("propagates initial source error without starting tick timer", () => {
    const failingSource: DataSource = {
      connect(s: DataSink) {
        s.error({ message: "Connection failed", permanent: true });
      },
      disconnect() { /* no-op */ },
    };

    const ctrl = createScenarioController();
    const source = simulated({
      initial: failingSource,
      controller: ctrl,
      keyColumn: "id",
      mutations: [],
      interval: 1000,
    });
    const sink = createMockSink();
    source.connect(sink);

    expect(sink.errors).toHaveLength(1);
    expect(sink.events).toHaveLength(0);

    // Advance time — no ticks should fire
    vi.advanceTimersByTime(10000);
    expect(sink.events).toHaveLength(0);
  });

  it("ignores non-snapshot events from initial source", () => {
    const emptyDs = makeDataset(
      [makeCol("id", ColumnType.NUMBER), makeCol("val", ColumnType.TEXT)],
      [],
    );
    const partialSource: DataSource = {
      connect(s: DataSink) {
        // Emit an append (not a snapshot) first
        s.apply({ type: "append", rows: [] });
        // Then a proper snapshot
        s.apply({ type: "snapshot", dataset: emptyDs });
      },
      disconnect() { /* no-op */ },
    };

    const ctrl = createScenarioController();
    const source = simulated({
      initial: partialSource,
      controller: ctrl,
      keyColumn: "id",
      mutations: [],
    });
    const sink = createMockSink();
    source.connect(sink);

    // Only the snapshot should be forwarded, not the append
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]!.type).toBe("snapshot");
  });

  it("uses default interval of 5000 when not specified", () => {
    const ctrl = createScenarioController();
    const countCols: ExternalColumnDef[] = [
      { id: columnId("id"), type: ColumnType.NUMBER },
      { id: columnId("count"), type: ColumnType.NUMBER },
    ];
    const source = simulated({
      initial: makeInitial([[1, 0]], countCols),
      controller: ctrl,
      keyColumn: "id",
      mutations: [increment("count", { by: 1, every: 0 })],
      // no interval specified — defaults to 5000
    });
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1); // snapshot only

    // At 4999ms — no tick yet
    vi.advanceTimersByTime(4999);
    expect(sink.events).toHaveLength(1);

    // At 5000ms — first tick fires
    vi.advanceTimersByTime(1);
    expect(sink.events.length).toBeGreaterThan(1);
  });

  it("multiple ticks accumulate mutations", () => {
    const ctrl = createScenarioController();
    const countCols: ExternalColumnDef[] = [
      { id: columnId("id"), type: ColumnType.NUMBER },
      { id: columnId("count"), type: ColumnType.NUMBER },
    ];
    const source = simulated({
      initial: makeInitial([[1, 0]], countCols),
      controller: ctrl,
      keyColumn: "id",
      mutations: [increment("count", { by: 1, every: 1000 })],
      interval: 1000,
    });
    const sink = createMockSink();
    source.connect(sink);

    // Tick 1 at t=1000: timing inits with lastFiredAt=1000, won't fire
    vi.advanceTimersByTime(1000);
    // Tick 2 at t=2000: 2000-1000 >= 1000 → fires
    vi.advanceTimersByTime(1000);
    // Tick 3 at t=3000: 3000-2000 >= 1000 → fires
    vi.advanceTimersByTime(1000);
    // Tick 4 at t=4000: 4000-3000 >= 1000 → fires
    vi.advanceTimersByTime(1000);

    // Should have snapshot + 3 replace events (ticks 2, 3, 4)
    const replaces = sink.events.filter(e => e.type === "replace");
    expect(replaces.length).toBe(3);
  });

  it("removeRow mutation removes rows and emits remove events", () => {
    const ctrl = createScenarioController();
    const source = simulated({
      initial: makeInitial([[1, "DONE"], [2, "PENDING"]], COLS),
      controller: ctrl,
      keyColumn: "id",
      mutations: [removeRow({ predicate: (r) => r["status"] === "DONE" })],
      interval: 1000,
    });
    const sink = createMockSink();
    source.connect(sink);

    vi.advanceTimersByTime(1000);
    const removes = sink.events.filter(e => e.type === "remove");
    expect(removes).toHaveLength(1);
    expect((removes[0] as RemoveEvent).key).toBe("1");
  });

  it("dispatch update for non-existent key emits no event", () => {
    const ctrl = createScenarioController();
    const source = simulated({
      initial: makeInitial([[1, "PENDING"]], COLS),
      controller: ctrl,
      keyColumn: "id",
      mutations: [],
    });
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1);

    source.dispatch({ type: "update", key: "999", changes: { status: "GONE" } });
    expect(sink.events).toHaveLength(1);
  });

  it("dispatch delete for non-existent key emits no event", () => {
    const ctrl = createScenarioController();
    const source = simulated({
      initial: makeInitial([[1, "PENDING"]], COLS),
      controller: ctrl,
      keyColumn: "id",
      mutations: [],
    });
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1);

    source.dispatch({ type: "delete", key: "999" });
    expect(sink.events).toHaveLength(1);
  });

  it("when() with transition applies conditional state change", () => {
    const ctrl = createScenarioController();
    const countCols: ExternalColumnDef[] = [
      { id: columnId("id"), type: ColumnType.NUMBER },
      { id: columnId("status"), type: ColumnType.TEXT },
      { id: columnId("priority"), type: ColumnType.NUMBER },
    ];
    const source = simulated({
      initial: makeInitial([[1, "PENDING", 5], [2, "PENDING", 1]], countCols),
      controller: ctrl,
      keyColumn: "id",
      mutations: [
        when(
          (row) => (row["priority"] as number) > 3,
          transition("status", { from: "PENDING", to: "ESCALATED", after: [0, 0] }),
        ),
      ],
      interval: 1000,
    });
    const sink = createMockSink();
    source.connect(sink);

    vi.advanceTimersByTime(1000);

    const replaces = sink.events.filter(e => e.type === "replace") as ReplaceEvent[];
    expect(replaces).toHaveLength(1);
    expect(replaces[0]!.key).toBe("1");
  });
});
