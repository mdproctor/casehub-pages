import { describe, it, expect } from "vitest";
import { joinSource } from "./join-source.js";
import type { DataSink, SourceError } from "../types.js";
import type { DataSetEvent } from "../../dataset/events.js";
import type { DataSetManager } from "../../dataset/manager.js";
import { ColumnType, dataSetId, col, makeDataset } from "./test-helpers.js";
import type { TypedDataSet, DataSetId } from "./test-helpers.js";

function stubManager(datasets: Record<string, TypedDataSet>): DataSetManager {
  const store = new Map(Object.entries(datasets));
  return {
    get(id: DataSetId) { return store.get(id); },
    has(id: DataSetId) { return store.has(id); },
    remove(id: DataSetId) { return store.delete(id); },
    apply() {},
    lookup() { return { dataset: { columns: [], rows: [] }, totalRows: 0 }; },
  };
}

describe("joinSource", () => {
  const columns = [
    col("name", ColumnType.TEXT),
    col("age", ColumnType.NUMBER),
  ];

  it("joins two datasets with matching schemas", () => {
    const ds1 = makeDataset(columns, [["alice", "30"]]);
    const ds2 = makeDataset(columns, [["bob", "25"]]);

    const manager = stubManager({ ds1, ds2 });
    const source = joinSource(manager, dataSetId("ds1"), dataSetId("ds2"));

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("snapshot");
    const snapshot = events[0] as { type: "snapshot"; dataset: TypedDataSet };
    expect(snapshot.dataset.rows).toHaveLength(2);
    expect(snapshot.dataset.rows[0]!.text(columns[0]!.id)).toBe("alice");
    expect(snapshot.dataset.rows[1]!.text(columns[0]!.id)).toBe("bob");
  });

  it("errors when a constituent dataset is missing", () => {
    const ds1 = makeDataset(columns, [["alice", "30"]]);

    const manager = stubManager({ ds1 });
    const source = joinSource(manager, dataSetId("ds1"), dataSetId("missing"));

    const errors: SourceError[] = [];
    const sink: DataSink = {
      apply() {},
      error(err) { errors.push(err); },
    };

    source.connect(sink);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("missing");
    expect(errors[0]!.permanent).toBe(true);
  });

  it("errors on schema mismatch", () => {
    const ds1 = makeDataset(
      [col("name", ColumnType.TEXT)],
      [["alice"]],
    );
    const ds2 = makeDataset(
      [col("name", ColumnType.TEXT), col("age", ColumnType.NUMBER)],
      [["bob", "25"]],
    );

    const manager = stubManager({ ds1, ds2 });
    const source = joinSource(manager, dataSetId("ds1"), dataSetId("ds2"));

    const errors: SourceError[] = [];
    const sink: DataSink = {
      apply() {},
      error(err) { errors.push(err); },
    };

    source.connect(sink);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("mismatch");
  });

  it("disconnect is no-op", () => {
    const ds1 = makeDataset(
      [col("x", ColumnType.TEXT)],
      [["a"]],
    );

    const manager = stubManager({ ds1 });
    const source = joinSource(manager, dataSetId("ds1"));

    source.connect({
      apply() {},
      error() {},
    });

    // Should not throw
    source.disconnect();
  });
});
