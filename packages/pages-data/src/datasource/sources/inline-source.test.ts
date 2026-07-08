import { describe, it, expect } from "vitest";
import { inlineSource } from "./inline-source.js";
import type { DataSink } from "../types.js";
import { ColumnType, columnId } from "./test-helpers.js";

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
        { id: columnId("id"), type: ColumnType.NUMBER },
        { id: columnId("name"), type: ColumnType.TEXT },
      ],
    });
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({ type: "snapshot" });
  });

  it("emits snapshot from JSON string", () => {
    const source = inlineSource(JSON.stringify([[1, "Alice"]]), {
      columns: [
        { id: columnId("id"), type: ColumnType.NUMBER },
        { id: columnId("name"), type: ColumnType.TEXT },
      ],
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
    const source = inlineSource([[1]], {
      columns: [{ id: columnId("x"), type: ColumnType.NUMBER }],
    });
    const sink = createMockSink();
    source.connect(sink);
    expect(() => { source.disconnect(); }).not.toThrow();
  });

  it("reports error on malformed JSON string", () => {
    const source = inlineSource("not valid json");
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.errors).toHaveLength(1);
    expect(sink.errors[0]).toMatchObject({ permanent: true });
  });

  it("reports error when JSON parses to non-array", () => {
    const source = inlineSource('{"key": "value"}');
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.errors).toHaveLength(1);
    expect(sink.errors[0]).toMatchObject({ permanent: true });
    expect(sink.events).toHaveLength(0);
  });

  it("emits snapshot from object array with explicit columns", () => {
    const source = inlineSource(
      [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }],
      {
        columns: [
          { id: columnId("id"), type: ColumnType.NUMBER },
          { id: columnId("name"), type: ColumnType.TEXT },
        ],
      },
    );
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1);
    const snapshot = sink.events[0] as { type: string; dataset: { rows: unknown[]; columns: unknown[] } };
    expect(snapshot.dataset.rows).toHaveLength(2);
    expect(snapshot.dataset.columns).toHaveLength(2);
  });

  it("handles empty array without error", () => {
    const source = inlineSource([], {
      columns: [{ id: columnId("x"), type: ColumnType.TEXT }],
    });
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1);
    expect(sink.errors).toHaveLength(0);
    const snapshot = sink.events[0] as { type: string; dataset: { rows: unknown[] } };
    expect(snapshot.dataset.rows).toHaveLength(0);
  });
});
