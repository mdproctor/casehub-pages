import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { recording } from "./recording-source.js";
import { replay } from "./replay-source.js";
import { createScenarioController } from "../controller.js";
import type { DataSink, DataSource } from "../types.js";
import type { DataSetEvent } from "../../dataset/events.js";
import { col, ColumnType, makeDataset } from "./test-helpers.js";
import { createTypedRow } from "../../dataset/conversion.js";

const textCol = col("v", ColumnType.TEXT);
const emptyDataset = makeDataset([], []);

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

function createSimpleSource(events: DataSetEvent[]): DataSource {
  return {
    connect(sink: DataSink): void {
      for (const event of events) {
        sink.apply(event);
      }
    },
    disconnect(): void {},
  };
}

describe("recording", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps inner source and delegates events", () => {
    const innerEvents: DataSetEvent[] = [
      { type: "snapshot", dataset: emptyDataset },
      { type: "append", rows: [textRow("a")] },
    ];
    const inner = createSimpleSource(innerEvents);
    const source = recording(inner);
    const sink = createMockSink();

    source.connect(sink);

    expect(sink.events).toEqual(innerEvents);
  });

  it("captures events with timestamps", () => {
    const innerEvents: DataSetEvent[] = [
      { type: "snapshot", dataset: emptyDataset },
      { type: "append", rows: [textRow("a")] },
    ];
    const inner = createSimpleSource(innerEvents);
    const source = recording(inner);
    const sink = createMockSink();

    const startTime = performance.now();
    source.connect(sink);
    const endTime = performance.now();

    const recorded = source.getRecording();
    expect(recorded).toHaveLength(2);
    expect(recorded[0]?.offsetMs).toBeGreaterThanOrEqual(0);
    expect(recorded[0]?.offsetMs).toBeLessThanOrEqual(endTime - startTime);
    expect(recorded[0]?.event).toEqual(innerEvents[0]);
    expect(recorded[1]?.event).toEqual(innerEvents[1]);
  });

  it("offsets are relative to first event", () => {
    const inner: DataSource = {
      connect(sink: DataSink): void {
        // First event at T=0
        sink.apply({ type: "snapshot", dataset: emptyDataset });

        // Advance time
        vi.advanceTimersByTime(100);

        // Second event at T=100
        sink.apply({ type: "append", rows: [textRow("a")] });

        // Advance time
        vi.advanceTimersByTime(50);

        // Third event at T=150
        sink.apply({ type: "append", rows: [textRow("b")] });
      },
      disconnect(): void {},
    };

    const source = recording(inner);
    const sink = createMockSink();

    source.connect(sink);

    const recorded = source.getRecording();
    expect(recorded).toHaveLength(3);
    expect(recorded[0]?.offsetMs).toBe(0);
    expect(recorded[1]?.offsetMs).toBeGreaterThanOrEqual(99);
    expect(recorded[1]?.offsetMs).toBeLessThanOrEqual(101);
    expect(recorded[2]?.offsetMs).toBeGreaterThanOrEqual(149);
    expect(recorded[2]?.offsetMs).toBeLessThanOrEqual(151);
  });

  it("clear() resets recording", () => {
    const innerEvents: DataSetEvent[] = [
      { type: "snapshot", dataset: emptyDataset },
    ];
    const inner = createSimpleSource(innerEvents);
    const source = recording(inner);
    const sink = createMockSink();

    source.connect(sink);
    expect(source.getRecording()).toHaveLength(1);

    source.clear();
    expect(source.getRecording()).toHaveLength(0);
  });

  it("round-trip: record then replay", () => {
    const inner: DataSource = {
      connect(sink: DataSink): void {
        sink.apply({ type: "snapshot", dataset: emptyDataset });
        vi.advanceTimersByTime(100);
        sink.apply({ type: "append", rows: [textRow("a")] });
        vi.advanceTimersByTime(50);
        sink.apply({ type: "append", rows: [textRow("b")] });
      },
      disconnect(): void {},
    };

    // Record
    const recorder = recording(inner);
    const recordSink = createMockSink();
    recorder.connect(recordSink);

    const recorded = recorder.getRecording();
    expect(recorded).toHaveLength(3);
    expect(recorded[0]?.offsetMs).toBe(0);
    expect(recorded[1]?.offsetMs).toBe(100);
    expect(recorded[2]?.offsetMs).toBe(150);

    // Replay
    const controller = createScenarioController({ playing: true, speed: 1 });
    const replaySource = replay(recorded, controller);
    const replaySink = createMockSink();

    replaySource.connect(replaySink);

    // Fire offset 0
    vi.runOnlyPendingTimers();
    expect(replaySink.events).toHaveLength(1);
    expect(replaySink.events[0]).toMatchObject({ type: "snapshot" });

    // Advance to 100ms
    vi.advanceTimersByTime(100);
    expect(replaySink.events).toHaveLength(2);

    // Advance to 150ms
    vi.advanceTimersByTime(50);
    expect(replaySink.events).toHaveLength(3);
  });

  it("multiple connect/disconnect cycles append to recording", () => {
    const innerEvents: DataSetEvent[] = [
      { type: "snapshot", dataset: emptyDataset },
    ];
    const inner = createSimpleSource(innerEvents);
    const source = recording(inner);
    const sink = createMockSink();

    source.connect(sink);
    expect(source.getRecording()).toHaveLength(1);

    source.disconnect();

    // Connect again
    source.connect(sink);
    expect(source.getRecording()).toHaveLength(2);
  });

  it("forwards errors from inner source to outer sink", () => {
    const failingSource: DataSource = {
      connect(sink: DataSink): void {
        sink.apply({ type: "snapshot", dataset: emptyDataset });
        sink.error({ message: "connection lost", permanent: false });
      },
      disconnect(): void {},
    };

    const source = recording(failingSource);
    const sink = createMockSink();

    source.connect(sink);

    expect(sink.events).toHaveLength(1);
    expect(sink.errors).toHaveLength(1);
    expect(sink.errors[0]).toMatchObject({ message: "connection lost", permanent: false });
    expect(source.getRecording()).toHaveLength(1);
  });
});
