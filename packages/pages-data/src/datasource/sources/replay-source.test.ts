import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { replay } from "./replay-source.js";
import { createScenarioController } from "../controller.js";
import type { DataSink } from "../types.js";
import type { RecordedEvent } from "./replay-source.js";
import { col, ColumnType, makeDataset } from "./test-helpers.js";
import { createTypedRow } from "../../dataset/conversion.js";

const textCol = col("v", ColumnType.TEXT);
const emptyDataset = makeDataset([], []);

/** Build a single typed row with one TEXT cell. */
function textRow(value: string) {
  return createTypedRow(
    [{ type: ColumnType.TEXT, value }],
    [textCol],
  );
}

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

describe("replay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("schedules events via controller at recorded offsets", () => {
    const events: readonly RecordedEvent[] = [
      { offsetMs: 0, event: { type: "snapshot", dataset: emptyDataset } },
      { offsetMs: 100, event: { type: "append", rows: [textRow("a")] } },
      { offsetMs: 250, event: { type: "append", rows: [textRow("b")] } },
    ];

    const controller = createScenarioController({ playing: true, speed: 1 });
    const source = replay(events, controller);
    const sink = createMockSink();

    source.connect(sink);

    // Offset 0 fires after tick
    vi.advanceTimersByTime(0);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({ type: "snapshot" });

    // Advance to 100ms
    vi.advanceTimersByTime(100);
    expect(sink.events).toHaveLength(2);
    expect(sink.events[1]).toMatchObject({ type: "append" });

    // Advance to 250ms
    vi.advanceTimersByTime(150);
    expect(sink.events).toHaveLength(3);
    expect(sink.events[2]).toMatchObject({ type: "append" });
  });

  it("respects controller speed scaling", () => {
    const events: readonly RecordedEvent[] = [
      { offsetMs: 0, event: { type: "snapshot", dataset: emptyDataset } },
      { offsetMs: 1000, event: { type: "append", rows: [textRow("a")] } },
    ];

    const controller = createScenarioController({ playing: true, speed: 2 });
    const source = replay(events, controller);
    const sink = createMockSink();

    source.connect(sink);
    vi.advanceTimersByTime(0); // Fire offset 0
    expect(sink.events).toHaveLength(1);

    // At 2x speed, 1000ms scenario time should take 500ms real time
    vi.advanceTimersByTime(500);
    expect(sink.events).toHaveLength(2);
  });

  it("loops when option is enabled", () => {
    const events: readonly RecordedEvent[] = [
      { offsetMs: 0, event: { type: "snapshot", dataset: emptyDataset } },
      { offsetMs: 100, event: { type: "append", rows: [textRow("a")] } },
    ];

    const controller = createScenarioController({ playing: true, speed: 1 });
    const source = replay(events, controller, { loop: true });
    const sink = createMockSink();

    source.connect(sink);
    vi.advanceTimersByTime(0); // Fire offset 0
    expect(sink.events).toHaveLength(1);

    // First cycle
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers(); // Fire offset-100 event and loop callback
    expect(sink.events).toHaveLength(2);

    // Second cycle — loop callback scheduled new events, tick to fire offset-0
    vi.runOnlyPendingTimers();
    expect(sink.events).toHaveLength(3);
    expect(sink.events[2]).toMatchObject({ type: "snapshot" });

    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers();
    expect(sink.events).toHaveLength(4);
    expect(sink.events[3]).toMatchObject({ type: "append" });
  });

  it("step() fires next event and pauses", () => {
    const events: readonly RecordedEvent[] = [
      { offsetMs: 0, event: { type: "snapshot", dataset: emptyDataset } },
      { offsetMs: 100, event: { type: "append", rows: [textRow("a")] } },
      { offsetMs: 200, event: { type: "append", rows: [textRow("b")] } },
    ];

    const controller = createScenarioController({ playing: false, speed: 1 });
    const source = replay(events, controller);
    const sink = createMockSink();

    source.connect(sink);

    // Initial connect schedules events but doesn't fire them (paused)
    expect(sink.events).toHaveLength(0);

    controller.step();
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({ type: "snapshot" });

    controller.step();
    expect(sink.events).toHaveLength(2);
    expect(sink.events[1]).toMatchObject({ type: "append" });

    controller.step();
    expect(sink.events).toHaveLength(3);
    expect(sink.events[2]).toMatchObject({ type: "append" });
  });

  it("handles empty sequence gracefully", () => {
    const events: readonly RecordedEvent[] = [];
    const controller = createScenarioController({ playing: true });
    const source = replay(events, controller);
    const sink = createMockSink();

    source.connect(sink);
    expect(sink.events).toHaveLength(0);
    expect(sink.errors).toHaveLength(0);
  });

  it("disconnect cancels scheduled events", () => {
    const events: readonly RecordedEvent[] = [
      { offsetMs: 0, event: { type: "snapshot", dataset: emptyDataset } },
      { offsetMs: 1000, event: { type: "append", rows: [textRow("a")] } },
      { offsetMs: 2000, event: { type: "append", rows: [textRow("b")] } },
    ];

    const controller = createScenarioController({ playing: true, speed: 1 });
    const source = replay(events, controller);
    const sink = createMockSink();

    source.connect(sink);
    vi.advanceTimersByTime(0); // Fire offset 0
    expect(sink.events).toHaveLength(1);

    // Disconnect after first event
    source.disconnect();

    // Advance past remaining events
    vi.advanceTimersByTime(3000);

    // Only the initial event should have fired
    expect(sink.events).toHaveLength(1);
  });

  it("handles events with same offset", () => {
    const events: readonly RecordedEvent[] = [
      { offsetMs: 0, event: { type: "snapshot", dataset: emptyDataset } },
      { offsetMs: 100, event: { type: "append", rows: [textRow("a")] } },
      { offsetMs: 100, event: { type: "append", rows: [textRow("b")] } },
      { offsetMs: 100, event: { type: "append", rows: [textRow("c")] } },
    ];

    const controller = createScenarioController({ playing: true, speed: 1 });
    const source = replay(events, controller);
    const sink = createMockSink();

    source.connect(sink);

    // Fire offset 0
    vi.runOnlyPendingTimers();
    expect(sink.events).toHaveLength(1);

    // Advance to 100ms and fire all pending at that time
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers(); // Fire first offset-100 event
    vi.runOnlyPendingTimers(); // Fire second offset-100 event
    vi.runOnlyPendingTimers(); // Fire third offset-100 event

    expect(sink.events).toHaveLength(4);
  });
});
