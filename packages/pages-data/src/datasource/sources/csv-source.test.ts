import { describe, it, expect } from "vitest";
import { csvSource } from "./csv-source.js";
import type { DataSink } from "../types.js";
import { ColumnType, columnId } from "./test-helpers.js";

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
        { id: columnId("id"), type: ColumnType.NUMBER },
        { id: columnId("name"), type: ColumnType.TEXT },
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

  it("handles headers-only CSV (no data rows)", () => {
    const csv = "id,name\n";
    const source = csvSource(csv);
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events).toHaveLength(1);
    const snapshot = sink.events[0] as { dataset: { rows: unknown[]; columns: unknown[] } };
    expect(snapshot.dataset.rows).toHaveLength(0);
    expect(snapshot.dataset.columns).toHaveLength(2);
  });

  it("handles CSV with inconsistent column count gracefully", () => {
    const csv = "a,b,c\n1,2\n3,4,5";
    const source = csvSource(csv);
    const sink = createMockSink();
    source.connect(sink);
    expect(sink.events.length + sink.errors.length).toBeGreaterThan(0);
  });
});
